/**
 * Date ranges for the dashboard's global filter, shared by the browser and the
 * API routes. A range is rolling ("last 30 days" ends now) or custom (whole
 * days, inclusive), and always has a previous window of the same length so
 * every number can show its change.
 */

export const RANGE_PRESETS = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "12m", label: "12 months", days: 365 },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["value"];

export interface RangeSelection {
  preset: RangePreset | "custom";
  /** Custom only: inclusive YYYY-MM-DD bounds. */
  from?: string;
  to?: string;
}

export interface ResolvedRange {
  selection: RangeSelection;
  /** [from, to) instants of the selected window. */
  from: Date;
  to: Date;
  /** The window of the same length immediately before it. */
  previousFrom: Date;
  previousTo: Date;
  days: number;
  label: string;
  /** Stable key for caching: same selection, same day, same key. */
  key: string;
}

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_RANGE: RangeSelection = { preset: "30d" };

/** Longest custom range: each day is a bucket, so the span must stay bounded. */
const MAX_CUSTOM_DAYS = 366;
const EARLIEST_DATE = "2000-01-01";

/** A YYYY-MM-DD string that names a real day (rejects 2026-02-31 and 2026-13-01). */
function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
}

export function parseRange(params: URLSearchParams): RangeSelection {
  const from = params.get("from");
  const to = params.get("to");
  if (
    from &&
    to &&
    isRealDate(from) &&
    isRealDate(to) &&
    from <= to &&
    from >= EARLIEST_DATE &&
    daysBetween(from, to) <= MAX_CUSTOM_DAYS
  ) {
    return { preset: "custom", from, to };
  }
  const preset = params.get("range");
  return RANGE_PRESETS.some((p) => p.value === preset)
    ? { preset: preset as RangePreset }
    : DEFAULT_RANGE;
}

export function rangeToParams(selection: RangeSelection): URLSearchParams {
  const params = new URLSearchParams();
  if (selection.preset === "custom" && selection.from && selection.to) {
    params.set("from", selection.from);
    params.set("to", selection.to);
  } else {
    params.set("range", selection.preset);
  }
  return params;
}

function formatShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Milliseconds a time zone is ahead of UTC at an instant. */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = formatterFor(timeZone, true).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant a calendar day starts in a time zone (DST-safe). */
function localMidnight(date: string, timeZone: string): Date {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const first = guess - zoneOffsetMs(guess, timeZone);
  return new Date(guess - zoneOffsetMs(first, timeZone));
}

/**
 * `timeZone`: custom days start and end at midnight there, matching the
 * zone the API routes bucket by. Presets are rolling and zone-free.
 */
export function resolveRange(
  selection: RangeSelection,
  now: Date = new Date(),
  timeZone = "UTC"
): ResolvedRange {
  let from: Date;
  let to: Date;
  let label: string;

  if (selection.preset === "custom" && selection.from && selection.to) {
    from = localMidnight(selection.from, timeZone);
    // Inclusive end day (up to the next local midnight), but never past now.
    const dayAfter = new Date(Date.parse(`${selection.to}T00:00:00Z`) + DAY_MS)
      .toISOString()
      .slice(0, 10);
    to = new Date(Math.min(localMidnight(dayAfter, timeZone).getTime(), now.getTime()));
    // A range wholly in the future would end before it starts; show the
    // last day up to now instead of a negative window.
    if (from.getTime() >= to.getTime()) from = new Date(to.getTime() - DAY_MS);
    label = `${formatShort(new Date(`${selection.from}T12:00:00Z`))} – ${formatShort(
      new Date(`${selection.to}T12:00:00Z`)
    )}`;
  } else {
    const preset =
      RANGE_PRESETS.find((p) => p.value === selection.preset) ?? RANGE_PRESETS[1];
    to = now;
    from = new Date(now.getTime() - preset.days * DAY_MS);
    label = `Last ${preset.label}`;
  }

  const span = to.getTime() - from.getTime();
  const days = Math.max(1, Math.round(span / DAY_MS));
  return {
    selection,
    from,
    to,
    previousFrom: new Date(from.getTime() - span),
    previousTo: from,
    days,
    label,
    key: `${rangeToParams(selection).toString()}:${now.toISOString().slice(0, 13)}`,
  };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

// Building an Intl formatter is slow; day loops reuse one per zone.
function formatterFor(timeZone: string, withTime = false): Intl.DateTimeFormat {
  const id = `${timeZone}|${withTime}`;
  let f = formatters.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" } : {}),
    });
    formatters.set(id, f);
  }
  return f;
}

/** YYYY-MM-DD of an instant in a time zone. */
export function dayKey(date: Date, timeZone: string): string {
  return formatterFor(timeZone).format(date);
}

/** Every day key in [from, to), in order. */
export function dayKeys(from: Date, to: Date, timeZone: string): string[] {
  const keys: string[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
    const key = dayKey(new Date(t), timeZone);
    if (keys.at(-1) !== key) keys.push(key);
  }
  const last = dayKey(new Date(to.getTime() - 1), timeZone);
  if (keys.at(-1) !== last) keys.push(last);
  return keys;
}

/** Relative change, or null when there is no baseline to compare with. */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}
