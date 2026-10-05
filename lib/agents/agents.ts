/**
 * The five content agents.
 *
 * Analyst, DM Manager and Planner are plain code over real data. Ideator and
 * Hook & Script call Gemini. DM contents never go to Gemini: the free tier
 * lets Google use prompts to improve its products, and DMs are private.
 */

import { prisma } from "@/lib/db/client";
import { generateJson } from "@/lib/agents/gemini";
import type { OwnPost, OwnStats } from "@/lib/agents/own-stats";
import type { CompetitorSummary } from "@/lib/agents/pull-data";
import {
  OTHER_CATEGORY,
  allocateIdeas,
  median,
  categoryStats,
  type CategoryStats,
} from "@/lib/agents/categories";
import type {
  AnalystOutput,
  DmManagerOutput,
  HookScriptOutput,
  Idea,
  IdeatorOutput,
  PlannerOutput,
  PostRef,
} from "@/lib/agents/types";

const DAY_MS = 86_400_000;

export interface AgentContext {
  workspaceId: string;
  instagramAccountId: string;
  profile: { niche: string; voice: string; audience: string; goals: string };
  own: OwnStats;
  competitors: CompetitorSummary[];
  /** The creator's content categories, in order. */
  categories: string[];
  /** Category of each own post by media id (untagged posts are absent). */
  postCategories: Map<string, string>;
  timeZone: string;
  now: Date;
}

const IDEAS_PER_RUN = 18;

function ownCategoryStats(ctx: AgentContext): CategoryStats[] {
  return categoryStats(
    ctx.own.posts.map((p) => ({ ...p, category: ctx.postCategories.get(p.id) ?? null })),
    ctx.categories
  );
}

function ownPostRef(p: OwnPost): PostRef {
  return {
    caption: p.caption,
    url: p.permalink,
    type: p.mediaType,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    postedAt: p.timestamp,
  };
}

function average(values: number[]): number | null {
  return values.length === 0
    ? null
    : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}


function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  return {
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
  };
}

function compact(n: number | null): string {
  if (n === null) return "n/a";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function snippet(text: string | null, max = 140): string {
  if (!text) return "(no caption)";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// ---------------------------------------------------------------- Analyst

export async function runAnalyst(ctx: AgentContext): Promise<AnalystOutput> {
  const { own, now, timeZone } = ctx;
  const withViews = own.posts.filter((p) => p.views !== null);

  const inWindow = (from: number, to: number) =>
    withViews.filter((p) => {
      const age = now.getTime() - new Date(p.timestamp).getTime();
      return age >= from && age < to;
    });
  const window = (posts: OwnPost[]) => ({
    posts: posts.length,
    views: posts.reduce((a, p) => a + (p.views ?? 0), 0),
    avgViews: average(posts.map((p) => p.views ?? 0)),
  });
  const last30 = window(inWindow(0, 30 * DAY_MS));
  const prev30 = window(inWindow(30 * DAY_MS, 60 * DAY_MS));

  const group = (key: (p: OwnPost) => string) => {
    const buckets = new Map<string, number[]>();
    for (const p of withViews) {
      const k = key(p);
      buckets.set(k, [...(buckets.get(k) ?? []), p.views ?? 0]);
    }
    return [...buckets.entries()]
      .map(([k, v]) => ({ key: k, posts: v.length, avgViews: average(v) ?? 0 }))
      .sort((a, b) => b.avgViews - a.avgViews);
  };

  const formats = group((p) => p.mediaType).map((g) => ({
    format: g.key,
    posts: g.posts,
    avgViews: g.avgViews,
  }));
  const bestWeekdays = group(
    (p) => zonedParts(new Date(p.timestamp), timeZone).weekday
  ).map((g) => ({ weekday: g.key, posts: g.posts, avgViews: g.avgViews }));
  // Median, and only hours with a few posts, so one viral post can't pick
  // the slot the way it would with an average.
  const byHour = new Map<number, number[]>();
  for (const p of withViews) {
    const hour = zonedParts(new Date(p.timestamp), timeZone).hour;
    byHour.set(hour, [...(byHour.get(hour) ?? []), p.views ?? 0]);
  }
  const hours = [...byHour.entries()]
    .filter(([, views]) => views.length >= 5)
    .map(([hour, views]) => ({ hour, median: median(views) }))
    .sort((a, b) => b.median - a.median);
  const bestHour = hours.length > 0 ? hours[0].hour : null;

  const snapshots = await prisma.followerSnapshot.findMany({
    where: {
      instagramAccountId: ctx.instagramAccountId,
      date: { gte: new Date(now.getTime() - 31 * DAY_MS) },
    },
    orderBy: { date: "asc" },
  });
  const followerChange30d =
    own.followers !== null && snapshots.length > 0
      ? own.followers - snapshots[0].followersCount
      : null;

  const competitors = ctx.competitors.map((c) => {
    const top = c.topPosts[0];
    return {
      username: c.username,
      followersCount: c.followersCount,
      postCount: c.postCount,
      avgViews: c.avgViews,
      topPost: top
        ? {
            caption: top.caption,
            url: top.url,
            type: top.type,
            views: top.views,
            likes: top.likes,
            comments: top.comments,
            postedAt: top.postedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  const notes: string[] = [];
  if (last30.avgViews !== null && prev30.avgViews) {
    const change = (last30.avgViews - prev30.avgViews) / prev30.avgViews;
    notes.push(
      `Average views per post over the last 30 days: ${compact(last30.avgViews)}, ${change >= 0 ? "up" : "down"} ${Math.abs(change * 100).toFixed(0)}% on the 30 days before.`
    );
  }
  if (formats.length > 1) {
    notes.push(
      `${formats[0].format} posts average ${compact(formats[0].avgViews)} views, the best of your formats.`
    );
  }
  if (bestWeekdays[0]) {
    notes.push(
      `${bestWeekdays[0].weekday} posts average the most views (${compact(bestWeekdays[0].avgViews)}).`
    );
  }
  if (bestHour !== null) {
    notes.push(
      `Posts published around ${String(bestHour).padStart(2, "0")}:00 (${timeZone}) typically do best (median views).`
    );
  }
  const beating = competitors
    .filter((c) => c.avgViews !== null && last30.avgViews !== null)
    .filter((c) => (c.avgViews ?? 0) > (last30.avgViews ?? 0))
    .map((c) => `@${c.username}`);
  if (beating.length > 0) {
    notes.push(
      `Averaging more views per recent post than you: ${beating.join(", ")}.`
    );
  }

  const categories = ownCategoryStats(ctx).filter((c) => c.posts > 0);
  const best = [...categories]
    .filter((c) => c.posts >= 3 && c.category !== OTHER_CATEGORY)
    .sort((a, b) => b.medianViews - a.medianViews)[0];
  if (best) {
    notes.push(
      `${best.category} is your strongest topic: median ${compact(best.medianViews)} views over ${best.posts} posts.`
    );
  }

  return {
    username: own.username,
    followers: own.followers,
    followerChange30d,
    categories,
    totals: own.totals,
    engagementRate: own.engagementRate,
    topPosts: own.posts.slice(0, 10).map(ownPostRef),
    last30,
    prev30,
    formats,
    bestWeekdays,
    bestHour,
    timeZone,
    competitors,
    notes,
  };
}

// ---------------------------------------------------------------- DM Manager

export async function runDmManager(ctx: AgentContext): Promise<DmManagerOutput> {
  const windowDays = 7;
  const since = new Date(ctx.now.getTime() - windowDays * DAY_MS);
  const where = { workspaceId: ctx.workspaceId, createdAt: { gte: since } };

  const [byStatus, byCampaign, byKeyword, clicks, clicksByCampaign, failures, activeCampaigns] =
    await Promise.all([
      prisma.dmLog.groupBy({ by: ["status"], where, _count: true }),
      prisma.dmLog.groupBy({
        by: ["automationId"],
        where: { ...where, status: "SENT" },
        _count: true,
      }),
      prisma.dmLog.groupBy({
        by: ["matchedKeyword"],
        where: { ...where, matchedKeyword: { not: null } },
        _count: true,
      }),
      prisma.linkClick.count({ where }),
      prisma.linkClick.groupBy({ by: ["automationId"], where, _count: true }),
      prisma.dmLog.findMany({
        where: { ...where, status: "FAILED" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { automation: { select: { name: true } } },
      }),
      prisma.automation.count({
        where: { workspaceId: ctx.workspaceId, isActive: true },
      }),
    ]);

  const count = (status: string) =>
    byStatus.find((s) => s.status === status)?._count ?? 0;

  const campaignIds = [
    ...new Set([
      ...byCampaign.map((c) => c.automationId),
      ...clicksByCampaign.map((c) => c.automationId),
    ]),
  ];
  const names = await prisma.automation.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true, name: true },
  });
  const campaigns = campaignIds
    .map((id) => ({
      name: names.find((n) => n.id === id)?.name ?? "Deleted campaign",
      sent: byCampaign.find((c) => c.automationId === id)?._count ?? 0,
      clicks: clicksByCampaign.find((c) => c.automationId === id)?._count ?? 0,
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 5);

  const sent = count("SENT");
  const failed = count("FAILED");
  const notes: string[] = [];
  if (failed > 0) notes.push(`${failed} DMs failed this week. Check DM Logs.`);
  if (sent > 0) {
    notes.push(
      `${((clicks / sent) * 100).toFixed(0)}% of DMs sent led to a link click.`
    );
  }
  if (activeCampaigns === 0) {
    notes.push("No active campaigns. Posts are not converting comments into DMs.");
  }

  return {
    windowDays,
    sent,
    skippedDedup: count("SKIPPED_DEDUP"),
    failed,
    pending: count("PENDING"),
    clicks,
    activeCampaigns,
    campaigns,
    // Keywords match case-insensitively, so count them that way (as the
    // dashboard does).
    keywords: [
      ...byKeyword.reduce((m, k) => {
        const key = (k.matchedKeyword ?? "").trim().toLowerCase();
        return m.set(key, (m.get(key) ?? 0) + k._count);
      }, new Map<string, number>()),
    ]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    failures: failures.map((f) => ({
      commenter: f.commenterName ?? "Unknown",
      campaign: f.automation.name,
      error: f.errorMessage ?? "Unknown error",
      at: f.createdAt.toISOString(),
    })),
    notes,
  };
}

// ---------------------------------------------------------------- Ideator

function creatorBrief(ctx: AgentContext): string {
  const { profile } = ctx;
  return [
    `Creator: @${ctx.own.username} (${compact(ctx.own.followers)} followers)`,
    `Niche: ${profile.niche}`,
    `Voice: ${profile.voice}`,
    `Audience: ${profile.audience}`,
    `Goals: ${profile.goals}`,
  ].join("\n");
}

function postLines(posts: Array<{ caption: string | null; views: number | null; likes: number | null }>): string {
  return posts
    .map((p) => `- ${compact(p.views)} views, ${compact(p.likes)} likes: ${snippet(p.caption)}`)
    .join("\n");
}

export async function runIdeator(ctx: AgentContext): Promise<IdeatorOutput> {
  const recent = [...ctx.own.posts]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);
  const stats = ownCategoryStats(ctx);
  const allocation = allocateIdeas(stats, ctx.categories, IDEAS_PER_RUN);
  const topByCategory = ctx.categories
    .map((category) => {
      const posts = ctx.own.posts
        .filter((p) => ctx.postCategories.get(p.id) === category)
        .slice(0, 2);
      return posts.length
        ? `${category}:\n${postLines(posts)}`
        : `${category}: no posts yet`;
    })
    .join("\n");

  const prompt = `You are the Ideator on a short-form content team for an Instagram creator.

${creatorBrief(ctx)}

The creator's all-time top posts by views:
${postLines(ctx.own.posts.slice(0, 15))}

The creator's 10 most recent posts:
${postLines(recent)}

Competitors' best recent posts:
${ctx.competitors
  .map((c) => `@${c.username} (${compact(c.followersCount)} followers)\n${postLines(c.topPosts)}`)
  .join("\n\n")}

The creator's content categories, with how many ideas each gets this week (more where past posts reached more people):
${allocation.map((a) => `- ${a.category}: ${a.ideas} idea${a.ideas === 1 ? "" : "s"} (${a.reason})`).join("\n")}

The creator's best posts in each category:
${topByCategory}

Propose exactly ${IDEAS_PER_RUN} new reel ideas, with exactly the number per category given above. Rules:
- Every idea serves the account's core niche (${ctx.profile.niche || "see the creator profile above"}). An idea in a side category is framed through that niche, not as a generic tip.
- "category" is one of the categories listed above, spelled exactly.
- Build on what already works for this creator, and adapt competitor formats that are winning, but never copy a competitor's video.
- Each idea must serve at least one goal. At least 2 ideas should naturally feature the creator's product from the goals, without sounding like an ad.
- "why" cites the evidence above (a post, its views, a pattern).
- "inspiredBy" is the @handle of the competitor whose post inspired it, or null.
- "format" is short, e.g. "talking head", "screen recording", "breakdown of a famous speaker", "challenge series".
- Within each category, order ideas from strongest to weakest.`;

  const result = await generateJson<IdeatorOutput>(prompt, {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: ctx.categories },
            title: { type: "string" },
            angle: { type: "string" },
            why: { type: "string" },
            format: { type: "string" },
            inspiredBy: { type: "string", nullable: true },
          },
          required: ["category", "title", "angle", "why", "format", "inspiredBy"],
        },
      },
    },
    required: ["ideas"],
  });
  // Keep the categories' order, and each category's ideas in Gemini's order.
  const order = new Map(ctx.categories.map((c, i) => [c, i]));
  const ideas = result.ideas
    .filter((i) => order.has(i.category ?? ""))
    .map((idea, index) => ({ idea, index }))
    .sort((a, b) => order.get(a.idea.category!)! - order.get(b.idea.category!)! || a.index - b.index)
    .map((x) => x.idea);
  return { ideas, allocation };
}

// ---------------------------------------------------------------- Hook & Script

export function pickWeek(
  ideas: Idea[],
  allocation: IdeatorOutput["allocation"] = []
): Idea[] {
  const ranked = [...allocation].sort((a, b) => b.ideas - a.ideas).map((a) => a.category);
  const leads = ranked
    .map((category) => ideas.find((i) => i.category === category))
    .filter((i): i is Idea => Boolean(i));
  const rest = ideas.filter((i) => !leads.includes(i));
  return [...leads, ...rest].slice(0, 7);
}

export async function runHookScript(
  ctx: AgentContext,
  ideas: Idea[],
  allocation?: IdeatorOutput["allocation"]
): Promise<HookScriptOutput> {
  // One script per day of the Planner's week: the lead idea of the seven
  // categories given the most ideas, so the week mixes topics.
  const chosen = pickWeek(ideas, allocation);
  const prompt = `You are the Hook & Script writer on a short-form content team for an Instagram creator.

${creatorBrief(ctx)}

Hooks that already worked for this creator (top posts):
${postLines(ctx.own.posts.slice(0, 8))}

Write a script for each of these ideas:
${chosen.map((i, n) => `${n + 1}. ${i.title}: ${i.angle} (format: ${i.format})`).join("\n")}

For each idea:
- "hooks": 3 alternative opening lines, each under 12 words, that stop the scroll in the first 2 seconds.
- "script": a 30 to 45 second spoken script in the creator's voice, plain spoken English, short sentences, one idea per line. Mark on-screen text as [TEXT: ...].
- "cta": one closing call to action tied to a goal (follow, comment a keyword for a DM, book coaching, try the product).
- Only name real, existing apps or websites. The creator checks every named tool before filming, so never invent one or guess at features or pricing.
- "ideaTitle": copy the idea title exactly.`;

  const result = await generateJson<HookScriptOutput>(prompt, {
    type: "object",
    properties: {
      scripts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ideaTitle: { type: "string" },
            hooks: { type: "array", items: { type: "string" } },
            script: { type: "string" },
            cta: { type: "string" },
          },
          required: ["ideaTitle", "hooks", "script", "cta"],
        },
      },
    },
    required: ["scripts"],
  });
  return { scripts: result.scripts.slice(0, chosen.length) };
}

// ---------------------------------------------------------------- Planner

export function runPlanner(
  ctx: AgentContext,
  analyst: AnalystOutput,
  ideas: Idea[],
  scripts: HookScriptOutput["scripts"]
): PlannerOutput {
  const hour = analyst.bestHour ?? 18;
  const time = `${String(hour).padStart(2, "0")}:00`;
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ctx.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // Scripted ideas first, then the rest of the ideas, one per day.
  const scriptedTitles = new Set(scripts.map((s) => s.ideaTitle));
  const queue = [
    ...scripts.map((s) => {
      const idea = ideas.find((i) => i.title === s.ideaTitle);
      return {
        title: s.ideaTitle,
        hook: s.hooks[0] ?? "",
        format: idea?.format ?? "",
        cta: s.cta,
      };
    }),
    ...ideas
      .filter((i) => !scriptedTitles.has(i.title))
      .map((i) => ({ title: i.title, hook: i.angle, format: i.format, cta: "" })),
  ];

  const days = queue.slice(0, 7).map((item, i) => {
    const date = new Date(ctx.now.getTime() + (i + 1) * DAY_MS);
    return {
      date: dateFmt.format(date),
      weekday: zonedParts(date, ctx.timeZone).weekday,
      time,
      ...item,
    };
  });

  return { timeZone: ctx.timeZone, days };
}
