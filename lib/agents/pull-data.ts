/**
 * Data pull for the content agents: own stats from Instagram, competitor posts
 * from Apify. Competitor posts are stored so the agents and the Agents page
 * can read them without paying Apify again; own stats are fetched fresh each
 * run because the official API is free.
 */

import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import { getApifyToken, getCompetitorPostLimit } from "@/lib/agents/config";
import { collectOwnStats, type OwnStats } from "@/lib/agents/own-stats";
import {
  scrapeCompetitorPosts,
  scrapeCompetitorProfiles,
} from "@/lib/agents/apify";

export interface CompetitorSummary {
  username: string;
  followersCount: number | null;
  lastScrapedAt: Date | null;
  postCount: number;
  /** Mean views over stored posts that report views. */
  avgViews: number | null;
  topPosts: Array<{
    url: string;
    type: string;
    caption: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    postedAt: Date | null;
  }>;
}

export interface PullResult {
  own: OwnStats;
  competitors: CompetitorSummary[];
  /** Why competitors were not refreshed this run, if they weren't. */
  competitorSkipReason: string | null;
}

export async function pullContentData(
  workspaceId: string,
  options: { scrapeCompetitors?: boolean } = {}
): Promise<PullResult> {
  const account = await prisma.instagramAccount.findFirst({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
  });
  if (!account) throw new Error("No Instagram account connected");

  const own = await collectOwnStats(decryptToken(account.accessToken));

  const competitors = await prisma.competitor.findMany({
    where: { workspaceId },
    orderBy: { username: "asc" },
  });

  let competitorSkipReason: string | null = null;
  if (competitors.length === 0) {
    competitorSkipReason = "No competitors configured";
  } else if (!getApifyToken()) {
    competitorSkipReason = "APIFY_TOKEN is not set";
  } else if (options.scrapeCompetitors === false) {
    competitorSkipReason = "Skipped by caller";
  } else {
    // A failed scrape (Apify down, credit cap, timeout) must not stop the
    // agents: they run on the competitor posts already stored.
    try {
      await refreshCompetitors(competitors);
    } catch (error) {
      competitorSkipReason = `Competitor refresh failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      console.error("[Content Agents]", competitorSkipReason);
    }
  }

  return {
    own,
    competitors: await summariseCompetitors(workspaceId),
    competitorSkipReason,
  };
}

async function refreshCompetitors(
  competitors: Array<{ id: string; username: string }>
): Promise<void> {
  const usernames = competitors.map((c) => c.username);
  const [profilesResult, postsResult] = await Promise.allSettled([
    scrapeCompetitorProfiles(usernames),
    scrapeCompetitorPosts(usernames, getCompetitorPostLimit()),
  ]);
  // Posts are what the agents use; without them there is nothing to store.
  if (postsResult.status === "rejected") throw postsResult.reason;
  const posts = postsResult.value;
  // Follower counts are a nice-to-have: keep the stored ones if this failed.
  const profiles = profilesResult.status === "fulfilled" ? profilesResult.value : [];

  const now = new Date();
  for (const competitor of competitors) {
    const profile = profiles.find((p) => p.username === competitor.username);
    await prisma.competitor.update({
      where: { id: competitor.id },
      data: {
        followersCount: profile?.followersCount ?? undefined,
        lastScrapedAt: now,
      },
    });

    const own = posts.filter((p) => p.ownerUsername === competitor.username);
    await prisma.$transaction(
      own.map((post) => {
        const counts = {
          url: post.url,
          type: post.type,
          caption: post.caption,
          views: post.views,
          likes: post.likes,
          comments: post.comments,
          postedAt: post.postedAt,
          scrapedAt: now,
        };
        return prisma.competitorPost.upsert({
          where: {
            competitorId_shortCode: {
              competitorId: competitor.id,
              shortCode: post.shortCode,
            },
          },
          create: { competitorId: competitor.id, shortCode: post.shortCode, ...counts },
          update: counts,
        });
      })
    );
  }
}

const TOP_POSTS = 5;

export async function summariseCompetitors(
  workspaceId: string
): Promise<CompetitorSummary[]> {
  // Posts accumulate every week, so count and average in the database and
  // load only the top few rows.
  const [competitors, stats] = await Promise.all([
    prisma.competitor.findMany({
      where: { workspaceId },
      orderBy: { username: "asc" },
      include: {
        posts: {
          orderBy: [{ views: { sort: "desc", nulls: "last" } }, { likes: "desc" }],
          take: TOP_POSTS,
        },
      },
    }),
    prisma.competitorPost.groupBy({
      by: ["competitorId"],
      where: { competitor: { workspaceId } },
      _count: { _all: true },
      _avg: { views: true },
    }),
  ]);

  return competitors.map((c) => {
    const s = stats.find((x) => x.competitorId === c.id);
    return {
      username: c.username,
      followersCount: c.followersCount,
      lastScrapedAt: c.lastScrapedAt,
      postCount: s?._count._all ?? 0,
      avgViews: s?._avg.views != null ? Math.round(s._avg.views) : null,
      topPosts: c.posts.map((p) => ({
        url: p.url,
        type: p.type,
        caption: p.caption,
        views: p.views,
        likes: p.likes,
        comments: p.comments,
        postedAt: p.postedAt,
      })),
    };
  });
}
