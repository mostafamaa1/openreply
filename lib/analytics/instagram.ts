/**
 * Instagram analytics for a date range: post metrics for the window and the
 * one before it, a daily series, a day-by-hour heatmap, formats, and follower
 * growth from stored snapshots.
 *
 * Views are attributed to the day a post was published: Instagram reports
 * lifetime views per post, not views per day.
 *
 * Every insight is a Graph API call, so results are cached in Redis for ten
 * minutes per account and range.
 */

import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import {
  getAllUserMedia,
  getMediaInsights,
  getUserInfo,
  type InstagramMedia,
} from "@/lib/meta/client";
import { getRedisConnection } from "@/lib/queue/client";
import { ensureFollowerHistory } from "@/lib/reports/follower-history";
import { withRedisTimeout } from "@/lib/utils/redis-timeout";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import { dayKey, dayKeys, type ResolvedRange } from "@/lib/analytics/range";
import { median } from "@/lib/agents/categories";

const MAX_POSTS = 500;
const INSIGHTS_CONCURRENCY = 8;
const CACHE_TTL_SECONDS = 600;

export interface AnalyticsPost {
  id: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaType: string;
  timestamp: string;
  views: number | null;
  reach: number | null;
  likes: number;
  comments: number;
  saved: number | null;
  shares: number | null;
  /** (likes + comments + saves + shares) / views, or null without views. */
  engagementRate: number | null;
  /** Content category, joined per request (not cached). */
  category?: string | null;
  categorySource?: "AI" | "MANUAL" | null;
}

export interface MetricTotals {
  posts: number;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saved: number;
  shares: number;
  interactions: number;
  engagementRate: number | null;
  avgViews: number | null;
}

export interface InstagramAnalytics {
  username: string;
  rangeLabel: string;
  /** Zone the daily series and heatmap are bucketed in. */
  timeZone: string;
  current: MetricTotals;
  previous: MetricTotals;
  /** One row per day of the window, previous window aligned by position. */
  daily: Array<{
    date: string;
    views: number;
    posts: number;
    interactions: number;
    previousViews: number;
    followers: number | null;
    /** Net followers gained that day (null without both days' counts). */
    followerGain: number | null;
  }>;
  followers: {
    now: number | null;
    /** Net change across the window, from snapshots. */
    change: number | null;
    /** Net change across the previous window, for comparison. */
    previousChange: number | null;
    /** First day with a stored count; nothing earlier can be shown. */
    historyStart: string | null;
  };
  /** Median views per post by weekday (0 = Sunday) and hour, in the zone. */
  heatmap: Array<{ day: number; hour: number; posts: number; medianViews: number }>;
  formats: Array<{ format: string; posts: number; avgViews: number; engagementRate: number | null }>;
  posts: AnalyticsPost[];
  insightsAvailable: boolean;
  generatedAt: string;
  /** The workspace's content categories, joined per request. */
  categories?: string[];
}

function isVideoLike(media: InstagramMedia): boolean {
  return media.media_product_type === "REELS" || media.media_type === "VIDEO";
}

function totals(posts: AnalyticsPost[]): MetricTotals {
  const t = posts.reduce(
    (acc, p) => {
      acc.posts += 1;
      acc.views += p.views ?? 0;
      acc.reach += p.reach ?? 0;
      acc.likes += p.likes;
      acc.comments += p.comments;
      acc.saved += p.saved ?? 0;
      acc.shares += p.shares ?? 0;
      return acc;
    },
    { posts: 0, views: 0, reach: 0, likes: 0, comments: 0, saved: 0, shares: 0 }
  );
  const interactions = t.likes + t.comments + t.saved + t.shares;
  const withViews = posts.filter((p) => p.views !== null).length;
  return {
    ...t,
    interactions,
    engagementRate: t.views > 0 ? interactions / t.views : null,
    avgViews: withViews > 0 ? Math.round(t.views / withViews) : null,
  };
}


function zoned(date: Date, timeZone: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  return {
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday),
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
  };
}

async function readCache(key: string): Promise<InstagramAnalytics | null> {
  try {
    const raw = await withRedisTimeout(getRedisConnection().get(key), null);
    return raw ? (JSON.parse(raw) as InstagramAnalytics) : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: InstagramAnalytics): Promise<void> {
  try {
    await withRedisTimeout(
      getRedisConnection().set(key, JSON.stringify(value), "EX", CACHE_TTL_SECONDS),
      null
    );
  } catch {
    // A cache miss next time is the only cost.
  }
}

export async function getInstagramAnalytics(
  account: { id: string; instagramId: string; accessToken: string },
  range: ResolvedRange,
  timeZone: string,
  options: { fresh?: boolean } = {}
): Promise<InstagramAnalytics> {
  const cacheKey = `analytics:ig:v2:${account.id}:${timeZone}:${range.key}`;
  // A forced refresh costs a Graph call per post, so allow one a minute per
  // account; otherwise serve the cache like a normal request.
  let fresh = Boolean(options.fresh);
  if (fresh) {
    try {
      fresh =
        (await withRedisTimeout(
          getRedisConnection().set(`analytics:ig:fresh:${account.id}`, "1", "EX", 60, "NX"),
          null
        )) === "OK";
    } catch {
      fresh = false;
    }
  }
  if (!fresh) {
    const cached = await readCache(cacheKey);
    if (cached) return cached;
  }

  const accessToken = decryptToken(account.accessToken);
  const [user, media] = await Promise.all([
    getUserInfo(accessToken),
    getAllUserMedia(accessToken, MAX_POSTS, range.previousFrom),
  ]);

  // Only posts in the two windows need insights.
  const relevant = media.filter((m) => {
    const t = new Date(m.timestamp).getTime();
    return t >= range.previousFrom.getTime() && t < range.to.getTime();
  });

  let insightsAvailable = false;
  const insights = await mapWithConcurrency(relevant, INSIGHTS_CONCURRENCY, async (m) => {
    const metrics = isVideoLike(m)
      ? ["views", "reach", "saved", "shares"]
      : ["reach", "saved", "shares"];
    try {
      const data = await getMediaInsights(accessToken, m.id, metrics);
      insightsAvailable = true;
      return data;
    } catch {
      return null;
    }
  });

  const posts: AnalyticsPost[] = relevant.map((m, i) => {
    const ins = insights[i];
    const likes = m.like_count ?? 0;
    const comments = m.comments_count ?? 0;
    const views = ins?.views ?? null;
    const interactions = likes + comments + (ins?.saved ?? 0) + (ins?.shares ?? 0);
    return {
      id: m.id,
      caption: m.caption?.trim() ?? null,
      permalink: m.permalink ?? null,
      thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
      mediaType: m.media_product_type ?? m.media_type,
      timestamp: m.timestamp,
      views,
      reach: ins?.reach ?? null,
      likes,
      comments,
      saved: ins?.saved ?? null,
      shares: ins?.shares ?? null,
      engagementRate: views ? interactions / views : null,
    };
  });

  const inCurrent = (p: AnalyticsPost) => new Date(p.timestamp) >= range.from;
  const currentPosts = posts.filter(inCurrent);
  const previousPosts = posts.filter((p) => !inCurrent(p));

  // Daily series: current window day by day, previous window aligned by index.
  const currentDays = dayKeys(range.from, range.to, timeZone);
  const previousDays = dayKeys(range.previousFrom, range.previousTo, timeZone);
  const byDay = (list: AnalyticsPost[]) => {
    const map = new Map<string, AnalyticsPost[]>();
    for (const p of list) {
      const key = dayKey(new Date(p.timestamp), timeZone);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  };
  const currentByDay = byDay(currentPosts);
  const previousByDay = byDay(previousPosts);

  // A newly connected account has no snapshots yet: record today's and
  // backfill Instagram's 30 days before reading them.
  if (user.followers_count != null) {
    await ensureFollowerHistory(account, accessToken, user.followers_count).catch((error) =>
      console.warn(
        "[Analytics] Follower history unavailable:",
        error instanceof Error ? error.message : error
      )
    );
  }
  const [snapshots, firstEver] = await Promise.all([
    prisma.followerSnapshot.findMany({
      where: {
        instagramAccountId: account.id,
        date: { gte: new Date(range.previousFrom.getTime() - 2 * 86_400_000), lt: range.to },
      },
      orderBy: { date: "asc" },
    }),
    prisma.followerSnapshot.findFirst({
      where: { instagramAccountId: account.id },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);
  const followersByDay = new Map(
    snapshots.map((s) => [s.date.toISOString().slice(0, 10), s.followersCount])
  );
  // Today's snapshot may not be written yet; the live count stands in for it.
  const todayKey = new Date().toISOString().slice(0, 10);
  if (user.followers_count != null && !followersByDay.has(todayKey)) {
    followersByDay.set(todayKey, user.followers_count);
  }
  const shiftDay = (key: string, days: number) =>
    new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
  /** Latest stored count on or before the day. */
  const countOnOrBefore = (key: string): number | null => {
    let best: number | null = null;
    for (const s of snapshots) {
      if (s.date.toISOString().slice(0, 10) <= key) best = s.followersCount;
      else break;
    }
    return best;
  };

  const daily = currentDays.map((date, i) => {
    const dayPosts = currentByDay.get(date) ?? [];
    const previousKey = previousDays[i];
    return {
      date,
      views: dayPosts.reduce((a, p) => a + (p.views ?? 0), 0),
      posts: dayPosts.length,
      interactions: dayPosts.reduce(
        (a, p) => a + p.likes + p.comments + (p.saved ?? 0) + (p.shares ?? 0),
        0
      ),
      previousViews: (previousKey ? previousByDay.get(previousKey) ?? [] : []).reduce(
        (a, p) => a + (p.views ?? 0),
        0
      ),
      followers: followersByDay.get(date) ?? null,
      followerGain: (() => {
        const today = followersByDay.get(date);
        const yesterday = followersByDay.get(shiftDay(date, -1));
        return today != null && yesterday != null ? today - yesterday : null;
      })(),
    };
  });

  const heatBuckets = new Map<string, number[]>();
  for (const p of currentPosts) {
    if (p.views === null) continue;
    const { day, hour } = zoned(new Date(p.timestamp), timeZone);
    const key = `${day}:${hour}`;
    heatBuckets.set(key, [...(heatBuckets.get(key) ?? []), p.views]);
  }
  const heatmap = [...heatBuckets.entries()].map(([key, views]) => {
    const [day, hour] = key.split(":").map(Number);
    return { day, hour, posts: views.length, medianViews: median(views) };
  });

  const formatBuckets = new Map<string, AnalyticsPost[]>();
  for (const p of currentPosts) {
    formatBuckets.set(p.mediaType, [...(formatBuckets.get(p.mediaType) ?? []), p]);
  }
  const formats = [...formatBuckets.entries()]
    .map(([format, list]) => {
      const t = totals(list);
      return {
        format,
        posts: list.length,
        avgViews: t.avgViews ?? 0,
        engagementRate: t.engagementRate,
      };
    })
    .sort((a, b) => b.avgViews - a.avgViews);

  const followersNow = user.followers_count ?? null;
  const fromKey = shiftDay(range.from.toISOString().slice(0, 10), -1);
  const atStart = countOnOrBefore(fromKey);
  const atPreviousStart = countOnOrBefore(shiftDay(range.previousFrom.toISOString().slice(0, 10), -1));

  const result: InstagramAnalytics = {
    username: user.username,
    rangeLabel: range.label,
    timeZone,
    current: totals(currentPosts),
    previous: totals(previousPosts),
    daily,
    followers: {
      now: followersNow,
      change: followersNow !== null && atStart !== null ? followersNow - atStart : null,
      previousChange:
        atStart !== null && atPreviousStart !== null ? atStart - atPreviousStart : null,
      historyStart: firstEver?.date.toISOString().slice(0, 10) ?? null,
    },
    heatmap,
    formats,
    posts: currentPosts.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    insightsAvailable,
    generatedAt: new Date().toISOString(),
  };

  await writeCache(cacheKey, result);
  return result;
}
