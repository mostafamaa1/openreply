"use client";

/**
 * Score Bar
 *
 * The navy strip of scorelines across the top of a page: each metric's value
 * for the range and its change against the previous period. Scrolls
 * sideways on a phone, one scoreline per snap.
 */

import Link from "next/link";
import { Delta, Scoreline, Skeleton } from "@/components/broadcast/primitives";

export interface ScoreItem {
  label: string;
  value: string;
  delta?: number | null;
  invert?: boolean;
  /** Small line under the value, e.g. the previous period's figure. */
  hint?: string;
  href?: string;
  title?: string;
}

export default function ScoreBar({
  heading,
  caption,
  items,
  loading = false,
}: {
  heading: string;
  caption?: string;
  items: ScoreItem[];
  loading?: boolean;
}) {
  return (
    <section
      aria-label={`${heading} scoreboard`}
      className="overflow-hidden rounded-lg bg-bar text-bar-fg shadow-[0_10px_30px_-18px_rgb(10_26_51/0.7)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bar-line px-4 py-2.5 sm:px-5">
        <p className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wider">
          <span className="h-4 w-1.5 rounded-sm bg-accent" aria-hidden="true" />
          {heading}
        </p>
        {caption && <p className="text-xs text-bar-muted">{caption}</p>}
      </div>

      <div className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] lg:grid lg:auto-cols-fr lg:grid-flow-col lg:overflow-visible">
        {(loading ? Array.from({ length: items.length || 6 }) : items).map((raw, i) => {
          const item = raw as ScoreItem | undefined;
          const body = (
            <>
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-bar-muted">
                {item?.label ?? " "}
              </p>
              {loading || !item ? (
                <Skeleton className="mt-2 h-9 w-24 !bg-white/10" />
              ) : (
                <p className="mt-1 font-display text-[2.5rem] font-bold leading-none tracking-tight">
                  <Scoreline value={item.value} />
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                {!loading && item && item.delta !== undefined && (
                  <Delta value={item.delta} invert={item.invert} onBar />
                )}
                {!loading && item?.hint && (
                  <span className="truncate text-xs text-bar-muted">{item.hint}</span>
                )}
              </div>
            </>
          );
          const cell =
            "block min-w-[46%] shrink-0 snap-start border-r border-bar-line px-4 py-4 last:border-r-0 sm:min-w-[30%] sm:px-5 lg:min-w-0";
          return item?.href ? (
            <Link
              key={item.label}
              href={item.href}
              title={item.title}
              className={`${cell} transition-colors hover:bg-white/5`}
            >
              {body}
            </Link>
          ) : (
            <div key={item?.label ?? i} title={item?.title} className={cell}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
