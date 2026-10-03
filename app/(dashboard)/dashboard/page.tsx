"use client";

/**
 * Dashboard: the match centre.
 *
 * The score bar answers "is it working?" for the selected range; the trend
 * lane shows how; the league table, next posts, top posts and campaigns say
 * what to do next; the ticker runs the latest DMs underneath.
 */

import Link from "next/link";
import { useMemo } from "react";
import {
  CalendarClock,
  ChevronRight,
  Megaphone,
  PlaySquare,
  Trophy,
  TrendingUp,
} from "lucide-react";
import ScoreBar, { type ScoreItem } from "@/components/broadcast/score-bar";
import TrendChart, { type TrendMetric } from "@/components/broadcast/trend-chart";
import Ticker, { type TickerItem } from "@/components/broadcast/ticker";
import {
  EmptyState,
  ErrorPanel,
  PanelHeader,
  Skeleton,
} from "@/components/broadcast/primitives";
import { useRange } from "@/components/range-context";
import { useApi } from "@/lib/use-api";
import { change } from "@/lib/analytics/range";
import { compact, oneLine, percent, shortDate } from "@/lib/format";
import type { InstagramAnalytics } from "@/lib/analytics/instagram";
import type { DmAnalytics } from "@/lib/analytics/dms";
import type { AgentsResponse } from "@/app/api/agents/route";

interface DayRow {
  date: string;
  views: number;
  previousViews: number;
  interactions: number;
  followers: number | null;
  sent: number;
  previousSent: number;
  clicks: number;
}

const STATUS_TEXT: Record<string, { text: string; tone: TickerItem["tone"] }> = {
  SENT: { text: "DM sent", tone: "gain" },
  FAILED: { text: "DM failed", tone: "loss" },
  PENDING: { text: "queued", tone: "neutral" },
  SKIPPED_DEDUP: { text: "already DMed", tone: "neutral" },
  SKIPPED_RATE_LIMIT: { text: "rate limited", tone: "loss" },
  SKIPPED_PLAN_LIMIT: { text: "over plan limit", tone: "loss" },
  SKIPPED_NO_MATCH: { text: "no match", tone: "neutral" },
};

export default function DashboardPage() {
  const { query, label } = useRange();
  const ig = useApi<InstagramAnalytics>(`/api/analytics/instagram?${query}`);
  const dms = useApi<DmAnalytics>(`/api/analytics/dms?${query}`);
  const agents = useApi<AgentsResponse>("/api/agents");

  const igData = ig.data;
  const dmData = dms.data;

  const scores: ScoreItem[] = useMemo(() => {
    const followers = igData?.followers;
    const followerBase =
      followers?.now != null && followers.change != null ? followers.now - followers.change : null;
    return [
      {
        label: "Followers",
        value: compact(followers?.now),
        delta: followerBase ? change(followers!.now!, followerBase) : null,
        hint: followers?.change != null ? `${followers.change >= 0 ? "+" : "−"}${compact(Math.abs(followers.change))} in range` : undefined,
        href: "/overview",
      },
      {
        label: "Views",
        value: compact(igData?.current.views),
        delta: igData ? change(igData.current.views, igData.previous.views) : undefined,
        hint: igData ? `${igData.current.posts} posts` : undefined,
        href: "/overview",
      },
      {
        label: "Engagement",
        value: percent(igData?.current.engagementRate, 2),
        delta:
          igData?.current.engagementRate != null && igData.previous.engagementRate
            ? change(igData.current.engagementRate, igData.previous.engagementRate)
            : null,
        hint: "of views",
        href: "/overview",
      },
      {
        label: "DMs sent",
        value: compact(dmData?.current.sent),
        delta: dmData ? change(dmData.current.sent, dmData.previous.sent) : undefined,
        hint: dmData?.current.failed ? `${dmData.current.failed} failed` : undefined,
        href: "/logs",
      },
      {
        label: "Link clicks",
        value: compact(dmData?.current.clicks),
        delta: dmData ? change(dmData.current.clicks, dmData.previous.clicks) : undefined,
        href: "/campaigns",
      },
      {
        label: "Click rate",
        value: percent(dmData?.current.ctr),
        delta:
          dmData?.current.ctr != null && dmData.previous.ctr
            ? change(dmData.current.ctr, dmData.previous.ctr)
            : null,
        hint: "clicks per DM",
        href: "/campaigns",
      },
    ];
  }, [igData, dmData]);

  // One row per day joining Instagram and DM series.
  const days: DayRow[] = useMemo(() => {
    const byDate = new Map<string, DayRow>();
    const row = (date: string) => {
      if (!byDate.has(date)) {
        byDate.set(date, {
          date,
          views: 0,
          previousViews: 0,
          interactions: 0,
          followers: null,
          sent: 0,
          previousSent: 0,
          clicks: 0,
        });
      }
      return byDate.get(date)!;
    };
    for (const d of igData?.daily ?? []) {
      Object.assign(row(d.date), {
        views: d.views,
        previousViews: d.previousViews,
        interactions: d.interactions,
        followers: d.followers,
      });
    }
    for (const d of dmData?.daily ?? []) {
      Object.assign(row(d.date), { sent: d.sent, previousSent: d.previousSent, clicks: d.clicks });
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [igData, dmData]);

  const metrics: Array<TrendMetric<DayRow>> = [
    { key: "views", label: "Views", kind: "bar", value: (r) => r.views, previous: (r) => r.previousViews },
    { key: "followers", label: "Followers", kind: "line", total: "last", value: (r) => r.followers },
    { key: "interactions", label: "Interactions", kind: "bar", value: (r) => r.interactions },
    { key: "sent", label: "DMs sent", kind: "bar", value: (r) => r.sent, previous: (r) => r.previousSent },
    { key: "clicks", label: "Link clicks", kind: "bar", value: (r) => r.clicks },
  ];

  const analyst = agents.data?.agents.ANALYST.output ?? null;
  const planner = agents.data?.agents.PLANNER.output ?? null;
  const league = useMemo(() => {
    if (!analyst) return [];
    return [
      {
        username: analyst.username,
        you: true,
        followers: analyst.followers,
        avgViews: analyst.last30.avgViews,
      },
      ...analyst.competitors.map((c) => ({
        username: c.username,
        you: false,
        followers: c.followersCount,
        avgViews: c.avgViews,
      })),
    ].sort((a, b) => (b.avgViews ?? 0) - (a.avgViews ?? 0));
  }, [analyst]);

  const topPosts = useMemo(
    () =>
      [...(igData?.posts ?? [])]
        .filter((p) => p.views !== null)
        .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
        .slice(0, 5),
    [igData]
  );

  const tickerItems: TickerItem[] = (dmData?.recent ?? []).map((r) => {
    const status = STATUS_TEXT[r.status] ?? { text: r.status.toLowerCase(), tone: "neutral" as const };
    return {
      id: r.id,
      label: `@${r.commenter.replace(/^@/, "")}`,
      text: `${status.text} · “${oneLine(r.text, 40)}” · ${r.campaign}`,
      tone: status.tone,
    };
  });

  const igLoading = ig.loading && !igData;
  const caption = `${igData ? `@${igData.username} · ` : ""}${label} vs the ${label.replace(/^Last /, "previous ").toLowerCase()}`;

  return (
    <div className="space-y-5">
      <ScoreBar heading="Matchday" caption={caption} items={scores} loading={igLoading && !dmData} />

      {ig.error && <ErrorPanel message={ig.error} onRetry={ig.reload} />}

      <div className="grid gap-5 xl:grid-cols-3 xl:items-start">
        <section className="panel p-4 sm:p-5 xl:col-span-2">
          <PanelHeader
            icon={TrendingUp}
            title="Trend"
            description="Views count toward the day a post went live."
          />
          {igLoading ? (
            <Skeleton className="h-[480px] w-full" />
          ) : (
            <TrendChart rows={days} metrics={metrics} height={420} />
          )}
        </section>

        <div className="space-y-5">
          <section className="panel p-4 sm:p-5">
            <PanelHeader
              icon={Trophy}
              title="League table"
              description="Average views per recent post"
              actions={
                <Link href="/agents" className="text-xs font-semibold text-accent-ink hover:underline">
                  Analyst
                </Link>
              }
            />
            {agents.loading && !agents.data ? (
              <Skeleton className="h-48 w-full" />
            ) : league.length === 0 ? (
              <EmptyState icon={Trophy} title="No competitors yet">
                Add competitors in Settings and run the agents.
              </EmptyState>
            ) : (
              <ol className="space-y-1">
                {league.map((row, i) => (
                  <li
                    key={row.username}
                    className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm ${
                      row.you ? "bg-accent/15 font-semibold" : ""
                    }`}
                  >
                    <span className="w-5 text-right font-display text-base font-bold text-muted">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      @{row.username}
                      {row.you && <span className="ml-1.5 text-xs font-medium text-muted">you</span>}
                    </span>
                    <span className="w-14 text-right text-xs text-muted">{compact(row.followers)}</span>
                    <span className="w-14 text-right font-display text-base font-bold text-foreground">
                      {compact(row.avgViews)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel p-4 sm:p-5">
            <PanelHeader
              icon={CalendarClock}
              title="Next up"
              description={planner ? `Planner · ${planner.timeZone}` : "From the Planner agent"}
              actions={
                <Link href="/agents" className="text-xs font-semibold text-accent-ink hover:underline">
                  Calendar
                </Link>
              }
            />
            {agents.loading && !agents.data ? (
              <Skeleton className="h-32 w-full" />
            ) : !planner || planner.days.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No plan yet">
                The Planner fills this after the agents run.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {planner.days.slice(0, 3).map((day) => (
                  <li key={day.date} className="flex gap-3 py-2.5">
                    <div className="w-12 shrink-0 text-center">
                      <p className="font-display text-sm font-bold uppercase text-foreground">
                        {day.weekday.slice(0, 3)}
                      </p>
                      <p className="text-xs text-muted">{day.time}</p>
                    </div>
                    <p className="min-w-0 text-sm text-foreground">{day.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-4 sm:p-5">
          <PanelHeader
            icon={PlaySquare}
            title="Top posts"
            description={label}
            actions={
              <Link href="/overview" className="text-xs font-semibold text-accent-ink hover:underline">
                All posts
              </Link>
            }
          />
          {igLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : topPosts.length === 0 ? (
            <EmptyState icon={PlaySquare} title="No posts in this range">
              Pick a longer range above.
            </EmptyState>
          ) : (
            <ol className="space-y-2">
              {topPosts.map((p, i) => (
                <li key={p.id}>
                  <a
                    href={p.permalink ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="w-5 text-right font-display text-lg font-bold text-muted">{i + 1}</span>
                    {p.thumbnailUrl ? (
                      // Instagram CDN thumbnails; next/image would need every CDN host allow-listed.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="h-12 w-9 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-12 w-9 shrink-0 rounded bg-surface-sunk" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground group-hover:text-accent-ink">
                        {oneLine(p.caption, 80) || "Untitled post"}
                      </span>
                      <span className="text-xs text-muted">
                        {shortDate(p.timestamp)} · {percent(p.engagementRate)} engagement
                      </span>
                    </span>
                    <span className="font-display text-xl font-bold text-foreground">{compact(p.views)}</span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel p-4 sm:p-5">
          <PanelHeader
            icon={Megaphone}
            title="Campaigns"
            description={dmData ? `${dmData.activeCampaigns} active · ${label}` : label}
            actions={
              <Link href="/campaigns" className="text-xs font-semibold text-accent-ink hover:underline">
                Funnel
              </Link>
            }
          />
          {dms.loading && !dmData ? (
            <Skeleton className="h-56 w-full" />
          ) : !dmData || dmData.campaigns.length === 0 ? (
            <EmptyState icon={Megaphone} title="No campaign activity in this range" />
          ) : (
            <ul className="space-y-3">
              {dmData.campaigns.slice(0, 5).map((c) => {
                const max = Math.max(1, ...dmData.campaigns.map((x) => x.matched));
                return (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="group block">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate text-foreground group-hover:text-accent-ink">{c.name}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {compact(c.sent)} sent · {compact(c.clicks)} clicks ·{" "}
                          <span className="font-semibold text-foreground">{percent(c.ctr, 0)}</span>
                        </span>
                      </div>
                      {/* Funnel in one bar: matched → sent → clicked. */}
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunk">
                        <div className="relative h-full" style={{ width: `${(c.matched / max) * 100}%` }}>
                          <div className="absolute inset-y-0 left-0 rounded-full bg-rival/40" style={{ width: "100%" }} />
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-rival"
                            style={{ width: `${c.matched ? (c.sent / c.matched) * 100 : 0}%` }}
                          />
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-accent"
                            style={{ width: `${c.matched ? (c.clicks / c.matched) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
              <li className="flex items-center gap-4 pt-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-rival/40" />Matched</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-rival" />Sent</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-accent" />Clicked</span>
                <Link href="/campaigns" className="ml-auto inline-flex items-center text-accent-ink hover:underline">
                  All <ChevronRight className="h-3 w-3" />
                </Link>
              </li>
            </ul>
          )}
        </section>
      </div>

      <Ticker title="Latest" items={tickerItems} />
    </div>
  );
}
