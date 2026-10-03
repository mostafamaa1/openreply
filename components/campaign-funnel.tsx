"use client";

/**
 * Campaign Funnel
 *
 * For the selected range: how many comments matched a campaign, how many got
 * a DM, how many clicked the link, overall and per campaign.
 */

import Link from "next/link";
import { Filter, Megaphone } from "lucide-react";
import ScoreBar from "@/components/broadcast/score-bar";
import DataTable, { type Column } from "@/components/broadcast/data-table";
import { EmptyState, ErrorPanel, PanelHeader, Skeleton } from "@/components/broadcast/primitives";
import { useRange } from "@/components/range-context";
import { useApi } from "@/lib/use-api";
import { change } from "@/lib/analytics/range";
import { compact, full, percent } from "@/lib/format";
import type { CampaignFunnelRow, DmAnalytics } from "@/lib/analytics/dms";

function Stage({
  label,
  value,
  of,
  rate,
  tone,
}: {
  label: string;
  value: number;
  of: number;
  rate?: string;
  tone: string;
}) {
  const width = of ? Math.max(2, (value / of) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="flex items-baseline gap-2">
          {rate && <span className="text-xs font-semibold text-muted">{rate}</span>}
          <span className="font-display text-2xl font-bold text-foreground">{full(value)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-surface-sunk">
        <div
          className={`h-full w-full origin-left rounded-full ${tone} transition-transform duration-500 ease-out`}
          style={{ transform: `scaleX(${width / 100})` }}
        />
      </div>
    </div>
  );
}

export default function CampaignFunnel({ instagramAccountId }: { instagramAccountId?: string }) {
  const { query, label } = useRange();
  const account =
    instagramAccountId && instagramAccountId !== "all"
      ? `&instagramAccountId=${encodeURIComponent(instagramAccountId)}`
      : "";
  const { data, error, loading, reload } = useApi<DmAnalytics>(`/api/analytics/dms?${query}${account}`);

  if (error) return <ErrorPanel message={error} onRetry={reload} />;

  const c = data?.current;
  const p = data?.previous;
  const first = loading && !data;

  const columns: Array<Column<CampaignFunnelRow>> = [
    {
      key: "name",
      header: "Campaign",
      pinned: true,
      value: (r) => r.name,
      render: (r) => (
        <Link
          href={`/campaigns/${r.id}`}
          className="flex items-center gap-2 font-medium text-foreground hover:text-accent-ink"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${r.isActive ? "bg-gain" : "bg-border-hover"}`}
            title={r.isActive ? "Active" : "Paused"}
            aria-hidden="true"
          />
          <span className="sr-only">{r.isActive ? "Active:" : "Paused:"}</span>
          <span className="truncate">{r.name}</span>
        </Link>
      ),
    },
    { key: "matched", header: "Matched", align: "right", sortable: true, mobile: true, value: (r) => r.matched, render: (r) => full(r.matched) },
    { key: "sent", header: "DMs sent", align: "right", sortable: true, mobile: true, value: (r) => r.sent, render: (r) => full(r.sent) },
    {
      key: "delivery",
      header: "Delivered",
      align: "right",
      sortable: true,
      value: (r) => (r.deliveryRate === null ? null : Math.round(r.deliveryRate * 1000) / 10),
      render: (r) => percent(r.deliveryRate, 0),
    },
    { key: "clicks", header: "Clicks", align: "right", sortable: true, mobile: true, value: (r) => r.clicks, render: (r) => full(r.clicks) },
    {
      key: "ctr",
      header: "Click rate",
      align: "right",
      sortable: true,
      mobile: true,
      value: (r) => (r.ctr === null ? null : Math.round(r.ctr * 1000) / 10),
      render: (r) => <span className="font-semibold text-foreground">{percent(r.ctr)}</span>,
    },
    { key: "failed", header: "Failed", align: "right", sortable: true, defaultHidden: true, value: (r) => r.failed, render: (r) => full(r.failed) },
  ];

  return (
    <div className="space-y-5">
      <ScoreBar
        heading={label}
        caption="All campaigns · vs the previous period"
        loading={first}
        items={[
          { label: "Matched", value: compact(c?.matched), delta: c && p ? change(c.matched, p.matched) : undefined, hint: "comments & DMs" },
          { label: "DMs sent", value: compact(c?.sent), delta: c && p ? change(c.sent, p.sent) : undefined },
          {
            label: "Delivered",
            value: percent(c && c.matched ? c.sent / c.matched : null, 0),
            hint: c?.skipped ? `${compact(c.skipped)} skipped` : "of matched",
          },
          { label: "Link clicks", value: compact(c?.clicks), delta: c && p ? change(c.clicks, p.clicks) : undefined },
          { label: "Click rate", value: percent(c?.ctr), delta: c?.ctr != null && p?.ctr ? change(c.ctr, p.ctr) : null, hint: "clicks per DM" },
          { label: "Failed", value: compact(c?.failed), delta: c && p ? change(c.failed, p.failed) : undefined, invert: true, href: `/logs?status=FAILED${instagramAccountId && instagramAccountId !== "all" ? `&instagramAccountId=${encodeURIComponent(instagramAccountId)}` : ""}` },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="panel p-4 sm:p-5">
          <PanelHeader icon={Filter} title="Funnel" description={`All campaigns · ${label}`} />
          {first ? (
            <Skeleton className="h-44 w-full" />
          ) : c && c.matched > 0 ? (
            <div className="space-y-5">
              <Stage label="Matched" value={c.matched} of={c.matched} tone="bg-rival/50" />
              <Stage
                label="DM sent"
                value={c.sent}
                of={c.matched}
                rate={percent(c.sent / c.matched, 0)}
                tone="bg-rival"
              />
              <Stage
                label="Link clicked"
                value={c.clicks}
                of={c.matched}
                rate={percent(c.ctr, 0)}
                tone="bg-accent"
              />
              <p className="text-xs text-muted">
                Matched counts every comment or DM that hit a campaign keyword. Skipped ones were
                already DMed by that campaign.
              </p>
            </div>
          ) : (
            <EmptyState icon={Filter} title="No matches in this range">
              Pick a longer range, or check your campaigns are active.
            </EmptyState>
          )}
        </section>

        <section className="panel p-4 sm:p-5 xl:col-span-2">
          <PanelHeader icon={Megaphone} title="By campaign" description="Sort any column; export what you see." />
          {first ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <DataTable
              rows={data?.campaigns ?? []}
              columns={columns}
              rowKey={(r) => r.id}
              searchText={(r) => r.name}
              searchPlaceholder="Search campaigns"
              initialSort={{ key: "sent", dir: "desc" }}
              pageSize={10}
              exportName={`openreply-campaigns-${query.replace(/[^a-z0-9]+/gi, "-")}`}
              emptyTitle="No campaign activity"
              emptyHint="Nothing matched any campaign in this range."
            />
          )}
        </section>
      </div>
    </div>
  );
}
