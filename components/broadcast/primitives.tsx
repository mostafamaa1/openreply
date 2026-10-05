"use client";

/**
 * Broadcast primitives: delta chips, rolling scorelines, panel headers,
 * segmented controls, skeletons and empty states. Small, shared, and the same
 * on every page.
 */

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { signedPercent } from "@/lib/format";

/** Change against the previous period: icon + sign + colour, never colour alone. */
export function Delta({
  value,
  invert = false,
  onBar = false,
  className = "",
}: {
  value: number | null | undefined;
  /** For metrics where down is good (failures). */
  invert?: boolean;
  /** On the navy score bar, use the bar's own palette. */
  onBar?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <span className={`text-xs ${onBar ? "text-bar-muted" : "text-muted"} ${className}`}>
        no baseline
      </span>
    );
  }
  const flat = Math.round(value * 100) === 0;
  const good = invert ? value < 0 : value > 0;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? onBar
      ? "text-bar-muted"
      : "text-muted"
    : good
      ? onBar
        ? "text-bar-gain"
        : "text-gain"
      : onBar
        ? "text-bar-loss"
        : "text-loss";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${tone} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
      {signedPercent(value)}
    </span>
  );
}

/**
 * A scoreline that rolls in from below whenever its value changes: the one
 * authored motion of the dashboard.
 */
export function Scoreline({ value, className = "" }: { value: string; className?: string }) {
  // Remember the first real value (not the "—" placeholder shown while data
  // loads): only a later change plays the roll.
  const placeholder = value === "—" || value === "";
  const [first, setFirst] = useState<string | null>(placeholder ? null : value);
  if (first === null && !placeholder) setFirst(value);
  const settled = first === null || value === first;
  return (
    <span className={`score-roll ${settled ? "is-static" : ""} ${className}`}>
      <span key={value}>{value}</span>
    </span>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-foreground">
          {Icon && <Icon className="h-4 w-4 text-muted" strokeWidth={2.25} />}
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-surface-sunk p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`shrink-0 whitespace-nowrap rounded font-semibold transition-colors ${
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm"
            } ${
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunk text-muted">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-error">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-border-hover"
        >
          Try again
        </button>
      )}
    </div>
  );
}
