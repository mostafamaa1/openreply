"use client";

/**
 * Followers
 *
 * Net followers gained per day, week or month over the selected range, from
 * the daily snapshots: a bar per period (teal up, red down) under the running
 * total, then the same periods as a table with posts and views beside them.
 */

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Users } from "lucide-react";
import DataTable, { type Column } from "@/components/broadcast/data-table";
import { Delta, PanelHeader, Segmented } from "@/components/broadcast/primitives";
import { useThemeColors } from "@/components/broadcast/use-theme-colors";
import { change } from "@/lib/analytics/range";
import { compact, full, percent, shortDate } from "@/lib/format";
import type { InstagramAnalytics } from "@/lib/analytics/instagram";

type Bucket = "day" | "week" | "month";

interface Period {
  key: string;
  label: string;
  /** Count at the end of the period. */
  followers: number | null;
  gained: number | null;
  growth: number | null;
  posts: number;
  views: number;
  per1kViews: number | null;
}

const BUCKETS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

function bucketKey(date: string, bucket: Bucket): string {
  if (bucket === "day") return date;
  if (bucket === "month") return date.slice(0, 7);
  // Week starting Monday.
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

function bucketLabel(key: string, bucket: Bucket): string {
  if (bucket === "day") return shortDate(key);
  if (bucket === "month") {
    return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const end = new Date(new Date(`${key}T00:00:00Z`).getTime() + 6 * 86_400_000);
  return `${shortDate(key)} – ${shortDate(end.toISOString().slice(0, 10))}`;
}

export default function FollowersPanel({ data }: { data: InstagramAnalytics }) {
  const colors = useThemeColors();
  const [bucket, setBucket] = useState<Bucket>("day");

  const periods: Period[] = useMemo(() => {
    const map = new Map<string, Period & { start: number | null }>();
    for (const d of data.daily) {
      const key = bucketKey(d.date, bucket);
      const p =
        map.get(key) ??
        { key, label: bucketLabel(key, bucket), followers: null, gained: null, growth: null, posts: 0, views: 0, per1kViews: null, start: null };
      if (d.followerGain !== null) p.gained = (p.gained ?? 0) + d.followerGain;
      if (d.followers !== null) {
        p.followers = d.followers;
        if (p.start === null && d.followerGain !== null) p.start = d.followers - d.followerGain;
      }
      p.posts += d.posts;
      p.views += d.views;
      map.set(key, p);
    }
    return [...map.values()].map(({ start, ...p }) => ({
      ...p,
      growth: p.gained !== null && start ? p.gained / start : null,
      per1kViews: p.gained !== null && p.views > 0 ? (p.gained / p.views) * 1000 : null,
    }));
  }, [data.daily, bucket]);

  const withGain = periods.filter((p) => p.gained !== null);
  const days = data.daily.filter((d) => d.followerGain !== null);
  const totalGain = data.followers.change;
  const avgPerDay = days.length ? days.reduce((a, d) => a + (d.followerGain ?? 0), 0) / days.length : null;
  const bestDay = [...days].sort((a, b) => (b.followerGain ?? 0) - (a.followerGain ?? 0))[0];
  const interval = Math.max(0, Math.ceil(periods.length / 10) - 1);
  const firstShown = data.daily[0]?.date;
  const clipped = data.followers.historyStart && firstShown && data.followers.historyStart > firstShown;

  const columns: Array<Column<Period>> = [
    { key: "period", header: bucket === "day" ? "Day" : bucket === "week" ? "Week" : "Month", pinned: true, sortable: true, value: (p) => p.key, render: (p) => <span className="font-medium text-foreground">{p.label}</span> },
    { key: "followers", header: "Followers", align: "right", sortable: true, mobile: true, value: (p) => p.followers, render: (p) => full(p.followers) },
    {
      key: "gained",
      header: "Gained",
      align: "right",
      sortable: true,
      mobile: true,
      value: (p) => p.gained,
      render: (p) =>
        p.gained === null ? "—" : (
          <span className={`font-semibold ${p.gained >= 0 ? "text-gain" : "text-loss"}`}>
            {p.gained > 0 ? "+" : p.gained < 0 ? "−" : ""}
            {full(Math.abs(p.gained))}
          </span>
        ),
    },
    { key: "growth", header: "Growth", align: "right", sortable: true, value: (p) => (p.growth === null ? null : Math.round(p.growth * 10000) / 100), render: (p) => percent(p.growth, 2) },
    { key: "posts", header: "Posts", align: "right", sortable: true, mobile: true, value: (p) => p.posts },
    { key: "views", header: "Views", align: "right", sortable: true, value: (p) => p.views, render: (p) => compact(p.views) },
    {
      key: "per1k",
      header: "Per 1K views",
      align: "right",
      sortable: true,
      value: (p) => (p.per1kViews === null ? null : Math.round(p.per1kViews * 10) / 10),
      render: (p) => (p.per1kViews === null ? "—" : p.per1kViews.toFixed(1)),
    },
  ];

  return (
    <section className="panel p-4 sm:p-5">
      <PanelHeader
        icon={Users}
        title="Followers"
        description="Net followers gained, from daily snapshots."
        actions={<Segmented label="Group by" size="sm" options={BUCKETS} value={bucket} onChange={setBucket} />}
      />

      <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border pb-5 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Gained in range</dt>
          <dd className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-foreground">
              {totalGain === null ? "—" : `${totalGain >= 0 ? "+" : "−"}${compact(Math.abs(totalGain))}`}
            </span>
            {totalGain !== null && data.followers.previousChange !== null && (
              <Delta value={change(totalGain, data.followers.previousChange)} />
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Per day, average</dt>
          <dd className="mt-1 font-display text-2xl font-bold text-foreground">
            {avgPerDay === null ? "—" : `${avgPerDay >= 0 ? "+" : "−"}${compact(Math.round(Math.abs(avgPerDay)))}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Best day</dt>
          <dd className="mt-1 font-display text-2xl font-bold text-foreground">
            {bestDay && bestDay.followerGain != null
              ? `${bestDay.followerGain >= 0 ? "+" : "−"}${compact(Math.abs(bestDay.followerGain))}`
              : "—"}
            {bestDay && <span className="ml-2 font-sans text-xs font-medium text-muted">{shortDate(bestDay.date)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Previous period</dt>
          <dd className="mt-1 font-display text-2xl font-bold text-foreground">
            {data.followers.previousChange === null
              ? "—"
              : `${data.followers.previousChange >= 0 ? "+" : "−"}${compact(Math.abs(data.followers.previousChange))}`}
          </dd>
        </div>
      </dl>

      {withGain.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No follower history in this range yet.</p>
      ) : (
        <>
          <div className="-ml-2 h-[260px]">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 260 }}>
              <ComposedChart data={periods} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={interval}
                  tick={{ fill: colors.muted, fontSize: 11 }}
                  axisLine={{ stroke: colors.grid }}
                  tickLine={false}
                  minTickGap={8}
                />
                <YAxis
                  yAxisId="gain"
                  tickFormatter={(v: number) => compact(v)}
                  tick={{ fill: colors.muted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <YAxis
                  yAxisId="total"
                  orientation="right"
                  tickFormatter={(v: number) => compact(v)}
                  tick={{ fill: colors.muted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  cursor={{ fill: colors.grid, opacity: 0.4 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as Period;
                    return (
                      <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-foreground">{p.label}</p>
                        <p className="mt-1 text-foreground">
                          Gained: <span className="font-semibold">{p.gained === null ? "—" : full(p.gained)}</span>
                        </p>
                        <p className="text-muted">Followers: {full(p.followers)}</p>
                        <p className="text-muted">
                          {p.posts} post{p.posts === 1 ? "" : "s"} · {compact(p.views)} views
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar yAxisId="gain" dataKey="gained" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false}>
                  {periods.map((p) => (
                    <Cell key={p.key} fill={(p.gained ?? 0) >= 0 ? colors.gain : colors.loss} />
                  ))}
                </Bar>
                <Line
                  yAxisId="total"
                  dataKey="followers"
                  type="monotone"
                  stroke={colors.series}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.gain }} />
              Gained
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.loss }} />
              Lost
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded" style={{ background: colors.series }} />
              Total followers (right axis)
            </span>
            {clipped && <span>History starts {shortDate(data.followers.historyStart)}.</span>}
          </div>

          <div className="mt-5">
            <DataTable
              rows={[...periods].reverse()}
              columns={columns}
              rowKey={(p) => p.key}
              pageSize={bucket === "day" ? 14 : 12}
              exportName={`openreply-followers-by-${bucket}`}
              emptyTitle="No periods"
            />
            <p className="mt-2 text-xs text-muted">
              Per 1K views is followers gained per 1,000 views of posts published in that period. Instagram does not
              report follows per reel, so no post-level figure is shown.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
