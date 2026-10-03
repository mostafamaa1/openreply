/**
 * DM and campaign analytics for a date range, from DmLog and LinkClick.
 *
 * The campaign funnel is matched comments (every DmLog row: a comment or DM
 * that hit a campaign's keywords) → DMs sent → link clicks. Comments that
 * matched nothing are not linked to a campaign, so they are not in it.
 */

import { prisma } from "@/lib/db/client";
import { dayKey, dayKeys, type ResolvedRange } from "@/lib/analytics/range";

export interface DmTotals {
  matched: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  clicks: number;
  /** Clicks per DM sent. */
  ctr: number | null;
}

export interface CampaignFunnelRow {
  id: string;
  name: string;
  isActive: boolean;
  postUrl: string | null;
  matched: number;
  sent: number;
  clicks: number;
  failed: number;
  /** Sent / matched. */
  deliveryRate: number | null;
  /** Clicks / sent. */
  ctr: number | null;
}

export interface DmAnalytics {
  rangeLabel: string;
  current: DmTotals;
  previous: DmTotals;
  daily: Array<{ date: string; sent: number; clicks: number; previousSent: number }>;
  campaigns: CampaignFunnelRow[];
  keywords: Array<{ keyword: string; count: number }>;
  activeCampaigns: number;
  recent: Array<{
    id: string;
    commenter: string;
    text: string;
    campaign: string;
    status: string;
    at: string;
  }>;
}

const SKIPPED = new Set([
  "SKIPPED_DEDUP",
  "SKIPPED_RATE_LIMIT",
  "SKIPPED_PLAN_LIMIT",
  "SKIPPED_NO_MATCH",
]);

function emptyTotals(): DmTotals {
  return { matched: 0, sent: 0, failed: 0, skipped: 0, pending: 0, clicks: 0, ctr: null };
}

export async function getDmAnalytics(
  workspaceId: string,
  instagramAccountId: string | null,
  range: ResolvedRange,
  timeZone: string
): Promise<DmAnalytics> {
  const accountFilter = instagramAccountId ? { instagramAccountId } : {};
  const window = { gte: range.previousFrom, lt: range.to };

  const [logs, clicks, automations, recent] = await Promise.all([
    prisma.dmLog.findMany({
      where: { workspaceId, ...accountFilter, createdAt: window },
      select: { automationId: true, status: true, createdAt: true, matchedKeyword: true },
    }),
    prisma.linkClick.findMany({
      where: { workspaceId, ...accountFilter, createdAt: window },
      select: { automationId: true, createdAt: true },
    }),
    prisma.automation.findMany({
      where: { workspaceId, ...accountFilter },
      select: { id: true, name: true, isActive: true, postUrl: true },
    }),
    prisma.dmLog.findMany({
      where: { workspaceId, ...accountFilter },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        commenterName: true,
        commentText: true,
        status: true,
        createdAt: true,
        automation: { select: { name: true } },
      },
    }),
  ]);

  const isCurrent = (d: Date) => d >= range.from;
  const current = emptyTotals();
  const previous = emptyTotals();
  for (const log of logs) {
    const t = isCurrent(log.createdAt) ? current : previous;
    t.matched += 1;
    if (log.status === "SENT") t.sent += 1;
    else if (log.status === "FAILED") t.failed += 1;
    else if (log.status === "PENDING") t.pending += 1;
    else if (SKIPPED.has(log.status)) t.skipped += 1;
  }
  for (const click of clicks) {
    (isCurrent(click.createdAt) ? current : previous).clicks += 1;
  }
  current.ctr = current.sent ? current.clicks / current.sent : null;
  previous.ctr = previous.sent ? previous.clicks / previous.sent : null;

  const days = dayKeys(range.from, range.to, timeZone);
  const previousDays = dayKeys(range.previousFrom, range.previousTo, timeZone);
  const sentByDay = new Map<string, number>();
  const clicksByDay = new Map<string, number>();
  for (const log of logs) {
    if (log.status !== "SENT") continue;
    const key = dayKey(log.createdAt, timeZone);
    sentByDay.set(key, (sentByDay.get(key) ?? 0) + 1);
  }
  for (const click of clicks) {
    const key = dayKey(click.createdAt, timeZone);
    clicksByDay.set(key, (clicksByDay.get(key) ?? 0) + 1);
  }
  const daily = days.map((date, i) => ({
    date,
    sent: sentByDay.get(date) ?? 0,
    clicks: clicksByDay.get(date) ?? 0,
    previousSent: previousDays[i] ? sentByDay.get(previousDays[i]) ?? 0 : 0,
  }));

  const funnel = new Map<string, { matched: number; sent: number; clicks: number; failed: number }>();
  const row = (id: string) => {
    if (!funnel.has(id)) funnel.set(id, { matched: 0, sent: 0, clicks: 0, failed: 0 });
    return funnel.get(id)!;
  };
  const keywordCounts = new Map<string, number>();
  for (const log of logs) {
    if (!isCurrent(log.createdAt)) continue;
    const r = row(log.automationId);
    r.matched += 1;
    if (log.status === "SENT") r.sent += 1;
    if (log.status === "FAILED") r.failed += 1;
    if (log.matchedKeyword) {
      // Keywords match case-insensitively, so count them that way too.
      const k = log.matchedKeyword.trim().toLowerCase();
      keywordCounts.set(k, (keywordCounts.get(k) ?? 0) + 1);
    }
  }
  for (const click of clicks) {
    if (isCurrent(click.createdAt)) row(click.automationId).clicks += 1;
  }

  const automationById = new Map(automations.map((a) => [a.id, a]));
  const campaigns: CampaignFunnelRow[] = [...funnel.entries()]
    .map(([id, r]) => {
      const a = automationById.get(id);
      return {
        id,
        name: a?.name ?? "Deleted campaign",
        isActive: a?.isActive ?? false,
        postUrl: a?.postUrl ?? null,
        ...r,
        deliveryRate: r.matched ? r.sent / r.matched : null,
        ctr: r.sent ? r.clicks / r.sent : null,
      };
    })
    .sort((a, b) => b.sent - a.sent || b.matched - a.matched);

  return {
    rangeLabel: range.label,
    current,
    previous,
    daily,
    campaigns,
    keywords: [...keywordCounts.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    activeCampaigns: automations.filter((a) => a.isActive).length,
    recent: recent.map((r) => ({
      id: r.id,
      commenter: r.commenterName ?? "Someone",
      text: r.commentText,
      campaign: r.automation.name,
      status: r.status,
      at: r.createdAt.toISOString(),
    })),
  };
}
