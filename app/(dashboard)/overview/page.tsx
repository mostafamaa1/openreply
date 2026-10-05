"use client";

/**
 * Analytics
 *
 * Post performance for the selected range: the score bar, the trend, when to
 * post (heatmap), what to post (formats), and every post in a sortable,
 * filterable explorer with CSV export.
 */

import { useMemo, useState } from "react";
import { Clock, Layers, PlaySquare, RefreshCw, TrendingUp } from "lucide-react";
import ScoreBar from "@/components/broadcast/score-bar";
import TrendChart, { type TrendMetric } from "@/components/broadcast/trend-chart";
import Heatmap from "@/components/broadcast/heatmap";
import FollowersPanel from "@/components/followers-panel";
import TopicsPanel from "@/components/topics-panel";
import { OTHER_CATEGORY } from "@/lib/agents/categories";
import DataTable, { type Column } from "@/components/broadcast/data-table";
import {
  ErrorPanel,
  PanelHeader,
  Segmented,
  Skeleton,
} from "@/components/broadcast/primitives";
import { useRange } from "@/components/range-context";
import { useApi } from "@/lib/use-api";
import { change } from "@/lib/analytics/range";
import { compact, full, oneLine, percent, shortDate } from "@/lib/format";
import type { AnalyticsPost, InstagramAnalytics } from "@/lib/analytics/instagram";

type DailyRow = InstagramAnalytics["daily"][number];

const FORMAT_LABEL: Record<string, string> = {
  REELS: "Reels",
  FEED: "Feed posts",
  CAROUSEL_ALBUM: "Carousels",
  IMAGE: "Images",
  VIDEO: "Videos",
  STORY: "Stories",
};

const VIEW_BANDS = [
  { value: "0", label: "Any views" },
  { value: "1000", label: "1K+" },
  { value: "10000", label: "10K+" },
  { value: "100000", label: "100K+" },
] as const;

export default function AnalyticsPage() {
  const { query, label } = useRange();
  const [fresh, setFresh] = useState(0);
  const { data, error, loading, reload } = useApi<InstagramAnalytics>(
    `/api/analytics/instagram?${query}${fresh ? `&fresh=1&n=${fresh}` : ""}`
  );
  const [format, setFormat] = useState("all");
  const [band, setBand] = useState<(typeof VIEW_BANDS)[number]["value"]>("0");
  const [topic, setTopic] = useState("all");
  // Topic edits show at once, before the next fetch.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [topicError, setTopicError] = useState<string | null>(null);

  async function changeTopic(mediaId: string, category: string) {
    const before = overrides[mediaId];
    setOverrides((o) => ({ ...o, [mediaId]: category }));
    setTopicError(null);
    const res = await fetch("/api/analytics/post-category", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId, category }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!body?.success) {
      setOverrides((o) => {
        const next = { ...o };
        if (before === undefined) delete next[mediaId];
        else next[mediaId] = before;
        return next;
      });
      setTopicError(body?.error ?? "Could not save the topic.");
    }
  }

  const metrics: Array<TrendMetric<DailyRow>> = [
    { key: "views", label: "Views", kind: "bar", value: (r) => r.views, previous: (r) => r.previousViews },
    { key: "interactions", label: "Interactions", kind: "bar", value: (r) => r.interactions },
    { key: "posts", label: "Posts", kind: "bar", value: (r) => r.posts },
    { key: "followers", label: "Followers", kind: "line", total: "last", value: (r) => r.followers },
  ];

  const formats = useMemo(() => [...new Set((data?.posts ?? []).map((p) => p.mediaType))], [data]);
  const categories = useMemo(() => data?.categories ?? [], [data]);
  const tagged = useMemo(
    () =>
      (data?.posts ?? []).map((p) =>
        overrides[p.id] ? { ...p, category: overrides[p.id], categorySource: "MANUAL" as const } : p
      ),
    [data, overrides]
  );
  const posts = useMemo(
    () =>
      tagged.filter(
        (p) =>
          (format === "all" || p.mediaType === format) &&
          (p.views ?? 0) >= Number(band) &&
          (topic === "all" || (p.category ?? OTHER_CATEGORY) === topic)
      ),
    [tagged, format, band, topic]
  );

  const columns: Array<Column<AnalyticsPost>> = [
    {
      key: "post",
      header: "Post",
      pinned: true,
      value: (p) => p.caption ?? "",
      render: (p) => (
        <a
          href={p.permalink ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="group flex min-w-0 max-w-md items-center gap-3"
        >
          {p.thumbnailUrl ? (
            // Instagram CDN thumbnails; next/image would need every CDN host allow-listed.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.thumbnailUrl} alt="" loading="lazy" className="h-11 w-8 shrink-0 rounded object-cover" />
          ) : (
            <span className="h-11 w-8 shrink-0 rounded bg-surface-sunk" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-foreground group-hover:text-accent-ink">
              {oneLine(p.caption, 70) || "Untitled post"}
            </span>
            <span className="text-xs text-muted">
              {FORMAT_LABEL[p.mediaType] ?? p.mediaType} · {shortDate(p.timestamp)}
            </span>
          </span>
        </a>
      ),
    },
    {
      key: "topic",
      header: "Topic",
      sortable: true,
      value: (p) => p.category ?? "",
      render: (p) => (
        <select
          value={p.category ?? ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void changeTopic(p.id, e.target.value)}
          aria-label="Topic"
          title={p.categorySource === "MANUAL" ? "Set by you" : p.category ? "Tagged by the agents; change it if it is wrong" : "Not tagged yet"}
          className={`max-w-[11rem] rounded-md border bg-background px-2 py-1 text-xs ${
            p.categorySource === "MANUAL" ? "border-foreground font-semibold text-foreground" : "border-border text-muted"
          }`}
        >
          {!p.category && <option value="">Untagged</option>}
          {[...categories, OTHER_CATEGORY].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ),
    },
    { key: "date", header: "Date", sortable: true, defaultHidden: true, value: (p) => p.timestamp.slice(0, 10) },
    { key: "views", header: "Views", align: "right", sortable: true, mobile: true, value: (p) => p.views, render: (p) => <span className="font-semibold text-foreground">{full(p.views)}</span> },
    { key: "reach", header: "Reach", align: "right", sortable: true, value: (p) => p.reach, render: (p) => full(p.reach) },
    { key: "likes", header: "Likes", align: "right", sortable: true, mobile: true, value: (p) => p.likes, render: (p) => full(p.likes) },
    { key: "comments", header: "Comments", align: "right", sortable: true, value: (p) => p.comments, render: (p) => full(p.comments) },
    { key: "saved", header: "Saves", align: "right", sortable: true, mobile: true, value: (p) => p.saved, render: (p) => full(p.saved) },
    { key: "shares", header: "Shares", align: "right", sortable: true, value: (p) => p.shares, render: (p) => full(p.shares) },
    {
      key: "engagement",
      header: "Engagement",
      align: "right",
      sortable: true,
      mobile: true,
      value: (p) => (p.engagementRate === null ? null : Math.round(p.engagementRate * 10000) / 100),
      render: (p) => percent(p.engagementRate),
    },
  ];

  const loadingFirst = loading && !data;
  const c = data?.current;
  const p = data?.previous;

  return (
    <div className="space-y-5">
      <ScoreBar
        heading={label}
        caption={data ? `@${data.username} · vs the previous period` : "vs the previous period"}
        loading={loadingFirst}
        items={[
          { label: "Views", value: compact(c?.views), delta: c && p ? change(c.views, p.views) : undefined },
          { label: "Reach", value: compact(c?.reach), delta: c && p ? change(c.reach, p.reach) : undefined },
          { label: "Interactions", value: compact(c?.interactions), delta: c && p ? change(c.interactions, p.interactions) : undefined },
          {
            label: "Engagement",
            value: percent(c?.engagementRate, 2),
            delta: c?.engagementRate != null && p?.engagementRate ? change(c.engagementRate, p.engagementRate) : null,
          },
          { label: "Avg views", value: compact(c?.avgViews), delta: c?.avgViews != null && p?.avgViews ? change(c.avgViews, p.avgViews) : null, hint: "per post" },
          { label: "Posts", value: compact(c?.posts), delta: c && p ? change(c.posts, p.posts) : undefined },
        ]}
      />

      {error && <ErrorPanel message={error} onRetry={reload} />}
      {data && !data.insightsAvailable && (
        <div className="panel flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-foreground">
            Views, reach, saves and shares need the insights permission. Likes and comments are shown meanwhile.
          </p>
          <a href="/api/instagram/connect" className="font-semibold text-accent-ink hover:underline">
            Reconnect Instagram
          </a>
        </div>
      )}

      <section className="panel p-4 sm:p-5">
        <PanelHeader
          icon={TrendingUp}
          title="Trend"
          description="Views count toward the day a post went live; the dashed line is the previous period."
          actions={
            <button
              type="button"
              onClick={() => setFresh((n) => n + 1)}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-muted hover:border-border-hover hover:text-foreground disabled:opacity-50"
              title={data ? `Data from ${new Date(data.generatedAt).toLocaleTimeString()}` : undefined}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          }
        />
        {loadingFirst ? <Skeleton className="h-[330px] w-full" /> : <TrendChart rows={data?.daily ?? []} metrics={metrics} />}
      </section>

      {data && !loadingFirst && <FollowersPanel data={data} />}

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="panel p-4 sm:p-5 xl:col-span-2">
          <PanelHeader icon={Clock} title="When to post" description={`Median views by the hour a post went live · ${label}`} />
          {loadingFirst ? <Skeleton className="h-56 w-full" /> : <Heatmap cells={data?.heatmap ?? []} timeZone={data?.timeZone ?? "UTC"} />}
        </section>

        <section className="panel p-4 sm:p-5">
          <PanelHeader icon={Layers} title="Formats" description="Average views per post" />
          {loadingFirst ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ul className="space-y-4">
              {(data?.formats ?? []).map((f) => {
                const max = Math.max(1, ...(data?.formats ?? []).map((x) => x.avgViews));
                return (
                  <li key={f.format}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-semibold text-foreground">{FORMAT_LABEL[f.format] ?? f.format}</span>
                      <span className="font-display text-xl font-bold text-foreground">{compact(f.avgViews)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunk">
                      <div className="h-full rounded-full bg-series" style={{ width: `${(f.avgViews / max) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {f.posts} posts · {percent(f.engagementRate)} engagement
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {data && !loadingFirst && (
        <TopicsPanel
          posts={tagged}
          categories={categories}
          label={label}
          onPick={(c) => {
            setTopic(c);
            document.getElementById("post-explorer")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      <section id="post-explorer" className="panel scroll-mt-24 p-4 sm:p-5">
        <PanelHeader icon={PlaySquare} title="Post explorer" description={`Every post published · ${label}`} />
        {topicError && <p className="mb-3 text-sm text-error">{topicError}</p>}
        {loadingFirst ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <DataTable
            rows={posts}
            columns={columns}
            rowKey={(r) => r.id}
            searchText={(r) => `${r.caption ?? ""} ${r.category ?? ""}`}
            searchPlaceholder="Search captions"
            initialSort={{ key: "views", dir: "desc" }}
            exportName={`openreply-posts-${query.replace(/[^a-z0-9]+/gi, "-")}`}
            emptyTitle="No posts match"
            emptyHint="Widen the range or clear the filters."
            filters={
              <div className="flex flex-wrap gap-2">
                <Segmented
                  label="Format"
                  size="sm"
                  value={format}
                  onChange={setFormat}
                  options={[
                    { value: "all", label: "All" },
                    ...formats.map((f) => ({ value: f, label: FORMAT_LABEL[f] ?? f })),
                  ]}
                />
                <Segmented label="Views" size="sm" value={band} onChange={setBand} options={VIEW_BANDS} />
                <label className="sr-only" htmlFor="topic-filter">Topic</label>
                <select
                  id="topic-filter"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className={`h-8 rounded-md border bg-background px-2 text-xs font-semibold ${
                    topic === "all" ? "border-border text-muted" : "border-foreground text-foreground"
                  }`}
                >
                  <option value="all">All topics</option>
                  {[...categories, OTHER_CATEGORY].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            }
          />
        )}
      </section>
    </div>
  );
}
