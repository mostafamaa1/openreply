"use client";

/**
 * Topics
 *
 * How each content category performs over the selected range: typical views
 * (median), engagement, and how often people save or share it.
 */

import { useMemo } from "react";
import { Tags } from "lucide-react";
import DataTable, { type Column } from "@/components/broadcast/data-table";
import { EmptyState, PanelHeader } from "@/components/broadcast/primitives";
import { categoryStats, type CategoryStats } from "@/lib/agents/categories";
import { compact, percent } from "@/lib/format";
import type { AnalyticsPost } from "@/lib/analytics/instagram";

export default function TopicsPanel({
  posts,
  categories,
  label,
  onPick,
}: {
  posts: AnalyticsPost[];
  categories: string[];
  label: string;
  /** Filter the post explorer to a topic. */
  onPick: (category: string) => void;
}) {
  const stats = useMemo(
    () => categoryStats(posts.map((p) => ({ ...p, category: p.category ?? null })), categories).filter((s) => s.posts > 0),
    [posts, categories]
  );
  const untagged = posts.filter((p) => !p.category).length;
  const max = Math.max(1, ...stats.map((s) => s.medianViews));

  const columns: Array<Column<CategoryStats>> = [
    {
      key: "category",
      header: "Topic",
      pinned: true,
      value: (s) => s.category,
      render: (s) => (
        <button
          type="button"
          onClick={() => onPick(s.category)}
          className="block w-full min-w-[9rem] text-left"
          title="Show these posts below"
        >
          <span className="font-medium text-foreground hover:text-accent-ink">{s.category}</span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-sunk">
            <span className="block h-full rounded-full bg-series" style={{ width: `${(s.medianViews / max) * 100}%` }} />
          </span>
        </button>
      ),
    },
    { key: "posts", header: "Posts", align: "right", sortable: true, mobile: true, value: (s) => s.posts },
    { key: "median", header: "Median views", align: "right", sortable: true, mobile: true, value: (s) => s.medianViews, render: (s) => <span className="font-semibold text-foreground">{compact(s.medianViews)}</span> },
    { key: "avg", header: "Avg views", align: "right", sortable: true, value: (s) => s.avgViews, render: (s) => compact(s.avgViews) },
    {
      key: "engagement",
      header: "Engagement",
      align: "right",
      sortable: true,
      mobile: true,
      value: (s) => (s.engagementRate === null ? null : Math.round(s.engagementRate * 10000) / 100),
      render: (s) => percent(s.engagementRate),
    },
    { key: "saves", header: "Saves / 1K", align: "right", sortable: true, value: (s) => (s.savesPer1k === null ? null : Math.round(s.savesPer1k * 10) / 10), render: (s) => (s.savesPer1k === null ? "—" : s.savesPer1k.toFixed(1)) },
    { key: "shares", header: "Shares / 1K", align: "right", sortable: true, mobile: true, value: (s) => (s.sharesPer1k === null ? null : Math.round(s.sharesPer1k * 10) / 10), render: (s) => (s.sharesPer1k === null ? "—" : s.sharesPer1k.toFixed(1)) },
  ];

  return (
    <section className="panel p-4 sm:p-5">
      <PanelHeader
        icon={Tags}
        title="Topics"
        description={`What each topic typically reaches · ${label}. Pick one to filter the posts below.`}
      />
      {stats.length === 0 ? (
        <EmptyState icon={Tags} title="No tagged posts in this range">
          Posts are tagged when the agents run. Run them from the Agents page.
        </EmptyState>
      ) : (
        <>
          <DataTable
            rows={stats}
            columns={columns}
            rowKey={(s) => s.category}
            initialSort={{ key: "median", dir: "desc" }}
            pageSize={20}
            exportName="openreply-topics"
          />
          {untagged > 0 && (
            <p className="mt-2 text-xs text-muted">
              {untagged} post{untagged === 1 ? "" : "s"} not tagged yet; the next agent run tags them.
            </p>
          )}
        </>
      )}
    </section>
  );
}
