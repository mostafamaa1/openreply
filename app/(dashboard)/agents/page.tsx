"use client";

/**
 * Content Agents Page
 *
 * Headline stats, the five weekly content agents, and a drill-in panel for
 * whichever agent is selected. Everything shown comes from the agents' last
 * stored runs, so the page makes no Instagram or Apify calls of its own.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AgentKind } from "@/app/generated/prisma/client";
import { Play } from "lucide-react";
import ScoreBar from "@/components/broadcast/score-bar";
import { Delta, ErrorPanel, PanelHeader, Skeleton } from "@/components/broadcast/primitives";
import AgentDetail, { formatNumber } from "@/components/agent-detail";
import { AGENTS } from "@/lib/agents/config";
import type { AgentState, AgentsResponse } from "@/app/api/agents/route";
import type { AgentOutputs } from "@/lib/agents/types";

function timeAgo(iso: string | null): string {
  if (!iso) return "Never run";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Two or three headline numbers per agent, from its latest output. */
function cardMetrics(state: AgentState): Array<{ label: string; value: React.ReactNode }> {
  const o = state.output as AgentOutputs[AgentKind] | null;
  if (!o) return [];
  switch (state.kind) {
    case "IDEATOR": {
      const out = o as AgentOutputs["IDEATOR"];
      const topics = new Set(out.ideas.map((i) => i.category).filter(Boolean)).size;
      return [
        { label: "Ideas", value: String(out.ideas.length) },
        ...(topics ? [{ label: "Topics", value: String(topics) }] : []),
        {
          label: "From competitors",
          value: String(out.ideas.filter((i) => i.inspiredBy).length),
        },
      ];
    }
    case "HOOK_SCRIPT": {
      const out = o as AgentOutputs["HOOK_SCRIPT"];
      return [
        { label: "Scripts", value: String(out.scripts.length) },
        {
          label: "Hooks",
          value: String(out.scripts.reduce((n, s) => n + s.hooks.length, 0)),
        },
      ];
    }
    case "PLANNER": {
      const out = o as AgentOutputs["PLANNER"];
      const next = out.days[0];
      return [
        { label: "Days planned", value: String(out.days.length) },
        { label: "Next post", value: next ? `${next.weekday.slice(0, 3)} ${next.time}` : "—" },
      ];
    }
    case "ANALYST": {
      const out = o as AgentOutputs["ANALYST"];
      const { last30, prev30 } = out;
      const change =
        last30.avgViews !== null && prev30.avgViews
          ? (last30.avgViews - prev30.avgViews) / prev30.avgViews
          : null;
      return [
        { label: "Avg views, 30d", value: formatNumber(last30.avgViews) },
        {
          label: "vs previous 30d",
          value: <Delta value={change} />,
        },
        // With a single format, "best format" says nothing; show the best day.
        out.formats.length > 1
          ? { label: "Best format", value: out.formats[0].format }
          : { label: "Best day", value: out.bestWeekdays[0]?.weekday ?? "—" },
      ];
    }
    case "DM_MANAGER": {
      const out = o as AgentOutputs["DM_MANAGER"];
      return [
        { label: "DMs, 7d", value: formatNumber(out.sent) },
        { label: "Clicks, 7d", value: formatNumber(out.clicks) },
        { label: "Failed", value: formatNumber(out.failed) },
      ];
    }
  }
}

function ActivityBars({ status }: { status: AgentState["lastStatus"] }) {
  const tone =
    status === "FAILED"
      ? "bg-error"
      : status === "RUNNING"
        ? "bg-accent"
        : status === "SUCCEEDED"
          ? "bg-gain"
          : "bg-border-hover";
  return (
    <span
      className={`agent-activity ${status === "RUNNING" ? "is-running" : ""}`}
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={tone} />
      ))}
    </span>
  );
}

function statusLabel(state: AgentState): { text: string; className: string } {
  switch (state.lastStatus) {
    case "RUNNING":
      return { text: "Working", className: "text-accent-ink" };
    case "SUCCEEDED":
      return { text: "Done", className: "text-success" };
    case "FAILED":
      return { text: "Needs attention", className: "text-error" };
    default:
      return { text: "Idle", className: "text-muted" };
  }
}

export default function AgentsPage() {
  const [data, setData] = useState<AgentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentKind>("ANALYST");
  const [requesting, setRequesting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/agents")
        .then((r) => r.json())
        .then((res) => {
          if (res.success) {
            setData(res.data);
            setError(null);
          } else {
            setError(res.error ?? "Failed to load agents");
          }
        })
        .catch(() => setError("Failed to load agents"))
        .finally(() => setLoading(false)),
    []
  );

  const busy = data?.cycleState === "queued" || data?.cycleState === "running";

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Poll only while the tab is visible (each poll reads the database), and
    // faster while a run is in flight so each agent's card flips live. This
    // effect only resets the interval on a busy change; it never polls on
    // its own, so a state change already followed by its own load() (Run
    // now, the mount load above) does not trigger a second one.
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(tick, busy ? 8_000 : 60_000);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, busy]);

  async function runNow() {
    setRequesting(true);
    setRunError(null);
    const res = await fetch("/api/agents/run", { method: "POST" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!body?.success) setRunError(body?.error ?? "Could not start a run. Is the worker up?");
    await load();
    setRequesting(false);
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorPanel message={error ?? "Failed to load agents"} onRetry={() => void load()} />;
  }

  const analyst = data.agents.ANALYST.output;
  const topPost = analyst?.topPosts[0] ?? null;
  const selectedState = data.agents[selected];
  const selectedMeta = AGENTS.find((a) => a.kind === selected)!;
  const lastRun =
    AGENTS.map((a) => data.agents[a.kind].lastRunAt)
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1) ?? null;
  const viewChange =
    analyst?.last30.avgViews != null && analyst.prev30.avgViews
      ? (analyst.last30.avgViews - analyst.prev30.avgViews) / analyst.prev30.avgViews
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className={`tally ${busy ? "is-live" : "!bg-border-hover"}`} aria-hidden="true" />
          {data.cycleState === "running"
            ? "Agents are working now"
            : data.cycleState === "queued"
              ? "Run queued, waiting for the worker"
              : `Last run ${timeAgo(lastRun)}${
                  data.nextRunAt
                    ? ` · next run ${new Date(data.nextRunAt).toLocaleString(undefined, {
                        weekday: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : ""
                }`}
        </p>
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={busy || requesting}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          <Play className="h-4 w-4" />
          {data.cycleState === "queued"
            ? "Queued…"
            : data.cycleState === "running"
              ? "Running…"
              : requesting
                ? "Starting…"
                : "Run now"}
        </button>
      </div>
      {runError && <ErrorPanel message={runError} />}

      {!data.hasProfile && (
        <div className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            Tell the agents about your niche, voice and goals first.
          </p>
          <Link
            href="/settings#content-agents"
            className="text-sm font-semibold text-accent-ink hover:underline"
          >
            Set up in Settings
          </Link>
        </div>
      )}

      <ScoreBar
        heading="Match report"
        caption={
          analyst ? `@${analyst.username} · from the Analyst, last 30 days` : "From the Analyst"
        }
        items={[
          {
            label: "Followers",
            value: formatNumber(analyst?.followers),
            hint:
              analyst?.followerChange30d != null
                ? `${analyst.followerChange30d >= 0 ? "+" : "−"}${formatNumber(Math.abs(analyst.followerChange30d))} in 30 days`
                : undefined,
            href: "/overview",
          },
          {
            label: "Avg views",
            value: formatNumber(analyst?.last30.avgViews),
            delta: viewChange,
            hint: "per post, 30 days",
          },
          {
            label: "Top post",
            value: formatNumber(topPost?.views),
            hint: "views, all time",
            title: topPost?.caption ?? undefined,
          },
          {
            label: "Total views",
            value: formatNumber(analyst?.totals.views),
            hint: `${analyst?.totals.posts ?? 0} posts`,
          },
          {
            label: "Engagement",
            value:
              analyst?.engagementRate != null
                ? `${(analyst.engagementRate * 100).toFixed(2)}%`
                : "—",
            hint: "of views, all time",
          },
        ]}
      />

      {/* The five agents */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {AGENTS.map((agent) => {
          const state = data.agents[agent.kind];
          const status = statusLabel(state);
          const isSelected = agent.kind === selected;
          return (
            <button
              key={agent.kind}
              type="button"
              onClick={() => setSelected(agent.kind)}
              aria-pressed={isSelected}
              className={`panel flex flex-col p-4 text-left transition-colors duration-200 hover:border-border-hover ${
                isSelected ? "!border-foreground ring-1 ring-foreground" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
                  {agent.label}
                </p>
                <ActivityBars status={state.lastStatus} />
              </div>
              <p className={`mt-0.5 text-xs font-semibold ${status.className}`}>
                {status.text} · {timeAgo(state.lastRunAt)}
              </p>
              <dl className="mt-4 space-y-1.5">
                {cardMetrics(state).map((m) => (
                  <div key={m.label} className="flex justify-between gap-2 text-sm">
                    <dt className="text-muted">{m.label}</dt>
                    <dd className="truncate font-semibold text-foreground">{m.value}</dd>
                  </div>
                ))}
              </dl>
              {!state.output && <p className="mt-4 text-xs text-muted">{agent.description}</p>}
            </button>
          );
        })}
      </div>

      {/* Drill-in */}
      <section className="panel p-4 sm:p-6">
        <PanelHeader
          title={selectedMeta.label}
          description={
            selectedState.outputAt
              ? `Output from ${new Date(selectedState.outputAt).toLocaleString()}`
              : "No output yet"
          }
        />

        {selectedState.lastError && (
          <p className="mb-4 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
            Last run failed: {selectedState.lastError}
          </p>
        )}

        {selectedState.output ? (
          <AgentDetail kind={selected} output={selectedState.output} />
        ) : (
          <p className="text-sm text-muted">{selectedMeta.description}</p>
        )}
      </section>
    </div>
  );
}
