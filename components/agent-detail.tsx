"use client";

/**
 * Agent Detail
 *
 * Drill-in view for one content agent's latest output.
 */

import Link from "next/link";
import { useState } from "react";
import type { AgentKind } from "@/app/generated/prisma/client";
import type {
  AgentOutputs,
  AnalystOutput,
  DmManagerOutput,
  HookScriptOutput,
  IdeatorOutput,
  PlannerOutput,
  PostRef,
} from "@/lib/agents/types";

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </h3>
  );
}

function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li key={note} className="flex gap-2 text-sm text-foreground">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
          {note}
        </li>
      ))}
    </ul>
  );
}

function PostLink({ post }: { post: PostRef }) {
  const label = post.caption?.replace(/\s+/g, " ").trim() || `${post.type} post`;
  return post.url ? (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate text-foreground hover:text-accent-ink"
    >
      {label}
    </a>
  ) : (
    <span className="block truncate text-foreground">{label}</span>
  );
}

function PostTable({ posts }: { posts: PostRef[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-4 font-medium">Post</th>
            <th className="px-3 py-2 text-right font-medium">Views</th>
            <th className="px-3 py-2 text-right font-medium">Likes</th>
            <th className="px-3 py-2 text-right font-medium">Comments</th>
            <th className="py-2 pl-3 text-right font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p, i) => (
            <tr key={`${p.url}-${i}`} className="border-b border-border last:border-0">
              <td className="max-w-xs py-3 pr-4">
                <PostLink post={p} />
              </td>
              <td className="px-3 py-3 text-right text-muted">{formatNumber(p.views)}</td>
              <td className="px-3 py-3 text-right text-muted">{formatNumber(p.likes)}</td>
              <td className="px-3 py-3 text-right text-muted">{formatNumber(p.comments)}</td>
              <td className="py-3 pl-3 text-right text-muted">{formatDate(p.postedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={() => {
        Promise.resolve(navigator.clipboard?.writeText(text))
          .then(() => setState(navigator.clipboard ? "copied" : "failed"))
          .catch(() => setState("failed"))
          .finally(() => window.setTimeout(() => setState("idle"), 1500));
      }}
      className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-hover hover:text-foreground"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
    </button>
  );
}

function IdeaCard({ idea, n }: { idea: IdeatorOutput["ideas"][number]; n: number }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          {n}. {idea.title}
        </p>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
          {idea.format}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">{idea.angle}</p>
      <p className="mt-2 text-xs text-muted">
        Why: {idea.why}
        {idea.inspiredBy && (
          <>
            {" · Inspired by "}
            <a
              href={`https://www.instagram.com/${idea.inspiredBy.replace(/^@/, "")}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-ink hover:underline"
            >
              {idea.inspiredBy.startsWith("@") ? idea.inspiredBy : `@${idea.inspiredBy}`}
            </a>
          </>
        )}
      </p>
    </li>
  );
}

function IdeatorDetail({ output }: { output: IdeatorOutput }) {
  // Runs from before topics existed have no categories: show a flat list.
  if (!output.allocation || output.ideas.every((i) => !i.category)) {
    return (
      <ol className="divide-y divide-border">
        {output.ideas.map((idea, i) => (
          <IdeaCard key={idea.title} idea={idea} n={i + 1} />
        ))}
      </ol>
    );
  }

  const groups = [...output.allocation]
    .sort((a, b) => b.ideas - a.ideas)
    .map((a) => ({ ...a, list: output.ideas.filter((i) => i.category === a.category) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <a
            key={g.category}
            href={`#topic-${g.category.replace(/\W+/g, "-")}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:border-border-hover"
          >
            {g.category}
            <span className="rounded-full bg-surface-sunk px-1.5 text-muted">{g.list.length}</span>
          </a>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g.category} id={`topic-${g.category.replace(/\W+/g, "-")}`} className="scroll-mt-24">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-bold uppercase tracking-wide text-foreground">
              {g.category}
            </h3>
            <p className="text-xs text-muted">
              {g.list.length} idea{g.list.length === 1 ? "" : "s"} · {g.reason}
            </p>
          </div>
          <ol className="divide-y divide-border">
            {g.list.map((idea, i) => (
              <IdeaCard key={idea.title} idea={idea} n={i + 1} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function HookScriptDetail({ output }: { output: HookScriptOutput }) {
  return (
    <div className="divide-y divide-border">
      {output.scripts.map((s) => {
        const full = [
          `Hook: ${s.hooks[0] ?? ""}`,
          "",
          s.script,
          "",
          `CTA: ${s.cta}`,
        ].join("\n");
        return (
          <div key={s.ideaTitle} className="py-5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{s.ideaTitle}</p>
              <CopyButton text={full} />
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Hooks
            </p>
            <ul className="mt-1 space-y-1">
              {s.hooks.map((hook) => (
                <li key={hook} className="text-sm text-foreground">
                  “{hook}”
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Script
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {s.script}
            </p>
            <p className="mt-3 text-sm text-muted">
              <span className="font-medium text-foreground">CTA:</span> {s.cta}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function PlannerDetail({ output }: { output: PlannerOutput }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-4 font-medium">Day</th>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Post</th>
            <th className="py-2 pl-3 font-medium">Opening line</th>
          </tr>
        </thead>
        <tbody>
          {output.days.map((day) => (
            <tr key={day.date} className="border-b border-border align-top last:border-0">
              <td className="whitespace-nowrap py-3 pr-4 text-foreground">
                {day.weekday}
                <span className="block text-xs text-muted">{day.date}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-muted">{day.time}</td>
              <td className="px-3 py-3 text-foreground">
                {day.title}
                <span className="block text-xs text-muted">{day.format}</span>
              </td>
              <td className="py-3 pl-3 text-muted">{day.hook}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Times in {output.timeZone}.</p>
    </div>
  );
}

function AnalystDetail({ output }: { output: AnalystOutput }) {
  return (
    <div className="space-y-6">
      <Notes notes={output.notes} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Formats by average views</SectionTitle>
          <ul className="space-y-2">
            {output.formats.map((f) => (
              <li key={f.format} className="flex justify-between text-sm">
                <span className="text-foreground">{f.format}</span>
                <span className="text-muted">
                  {formatNumber(f.avgViews)} avg · {f.posts} posts
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle>Weekdays by average views ({output.timeZone})</SectionTitle>
          <ul className="space-y-2">
            {output.bestWeekdays.map((d) => (
              <li key={d.weekday} className="flex justify-between text-sm">
                <span className="text-foreground">{d.weekday}</span>
                <span className="text-muted">
                  {formatNumber(d.avgViews)} avg · {d.posts} posts
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {output.categories && output.categories.length > 0 && (
        <div>
          <SectionTitle>Topics, all time (median views)</SectionTitle>
          <ul className="space-y-2">
            {[...output.categories]
              .sort((x, y) => y.medianViews - x.medianViews)
              .map((c) => {
                const max = Math.max(1, ...output.categories!.map((x) => x.medianViews));
                return (
                  <li key={c.category} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate text-foreground">{c.category}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-sunk">
                      <span className="block h-full rounded-full bg-series" style={{ width: `${(c.medianViews / max) * 100}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted">
                      {formatNumber(c.medianViews)} · {c.posts} posts
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <div>
        <SectionTitle>Your all-time top 10</SectionTitle>
        <PostTable posts={output.topPosts} />
      </div>

      <div>
        <SectionTitle>Competitors</SectionTitle>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Followers</th>
                <th className="px-3 py-2 text-right font-medium">Avg views</th>
                <th className="py-2 pl-3 font-medium">Best recent post</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border bg-accent/5">
                <td className="py-3 pr-4 font-medium text-foreground">@{output.username} (you)</td>
                <td className="px-3 py-3 text-right text-muted">{formatNumber(output.followers)}</td>
                <td className="px-3 py-3 text-right text-muted">
                  {formatNumber(output.last30.avgViews)}
                </td>
                <td className="py-3 pl-3 text-xs text-muted">Last 30 days average</td>
              </tr>
              {output.competitors.map((c) => (
                <tr key={c.username} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4">
                    <a
                      href={`https://www.instagram.com/${c.username}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground hover:text-accent-ink"
                    >
                      @{c.username}
                    </a>
                  </td>
                  <td className="px-3 py-3 text-right text-muted">{formatNumber(c.followersCount)}</td>
                  <td className="px-3 py-3 text-right text-muted">{formatNumber(c.avgViews)}</td>
                  <td className="max-w-xs py-3 pl-3">
                    {c.topPost ? (
                      <>
                        <PostLink post={c.topPost} />
                        <span className="text-xs text-muted">
                          {formatNumber(c.topPost.views)} views
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">No posts yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DmManagerDetail({ output }: { output: DmManagerOutput }) {
  const tiles = [
    { label: "DMs sent", value: output.sent },
    { label: "Link clicks", value: output.clicks },
    { label: "Skipped (already DMed)", value: output.skippedDedup },
    { label: "Failed", value: output.failed },
  ];
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label}>
            <dt className="text-xs text-muted">{t.label}</dt>
            <dd className="font-display text-3xl font-bold leading-none text-foreground">
              {formatNumber(t.value)}
            </dd>
          </div>
        ))}
      </dl>

      <Notes notes={output.notes} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Top campaigns</SectionTitle>
          {output.campaigns.length === 0 ? (
            <p className="text-sm text-muted">No DMs sent in the last {output.windowDays} days.</p>
          ) : (
            <ul className="space-y-2">
              {output.campaigns.map((c) => (
                <li key={c.name} className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-foreground">{c.name}</span>
                  <span className="shrink-0 text-muted">
                    {c.sent} sent · {c.clicks} clicks
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <SectionTitle>Top keywords</SectionTitle>
          {output.keywords.length === 0 ? (
            <p className="text-sm text-muted">No keyword matches yet.</p>
          ) : (
            <ul className="space-y-2">
              {output.keywords.map((k) => (
                <li key={k.keyword} className="flex justify-between text-sm">
                  <span className="text-foreground">{k.keyword}</span>
                  <span className="text-muted">{k.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {output.failures.length > 0 && (
        <div>
          <SectionTitle>Recent failures</SectionTitle>
          <ul className="space-y-2">
            {output.failures.map((f) => (
              <li key={`${f.at}-${f.commenter}`} className="text-sm">
                <span className="text-foreground">{f.commenter}</span>
                <span className="text-muted"> · {f.campaign} · {f.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-4 text-sm">
        <Link href="/logs" className="text-accent-ink hover:underline">
          Open DM Logs
        </Link>
        <Link href="/inbox" className="text-accent-ink hover:underline">
          Open Inbox
        </Link>
      </div>
    </div>
  );
}

export default function AgentDetail<K extends AgentKind>({
  kind,
  output,
}: {
  kind: K;
  output: AgentOutputs[K];
}) {
  switch (kind) {
    case "IDEATOR":
      return <IdeatorDetail output={output as IdeatorOutput} />;
    case "HOOK_SCRIPT":
      return <HookScriptDetail output={output as HookScriptOutput} />;
    case "PLANNER":
      return <PlannerDetail output={output as PlannerOutput} />;
    case "ANALYST":
      return <AnalystDetail output={output as AnalystOutput} />;
    case "DM_MANAGER":
      return <DmManagerDetail output={output as DmManagerOutput} />;
    default:
      return null;
  }
}
