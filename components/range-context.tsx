"use client";

/**
 * Global date range
 *
 * One range for the whole dashboard, kept in the URL (?range=30d or
 * ?from=…&to=…) so a filtered view can be bookmarked or shared, and
 * remembered across pages for this browser.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check } from "lucide-react";
import {
  DEFAULT_RANGE,
  RANGE_PRESETS,
  parseRange,
  rangeToParams,
  resolveRange,
  type RangeSelection,
} from "@/lib/analytics/range";

const STORAGE_KEY = "openreply-range";

interface RangeContextValue {
  selection: RangeSelection;
  setSelection: (next: RangeSelection) => void;
  /** Query string for API calls, e.g. "range=30d". */
  query: string;
  label: string;
  days: number;
}

const RangeContext = createContext<RangeContextValue | null>(null);

export function RangeProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const fromUrl = searchParams.has("range") || searchParams.has("from");
  const [selection, setSelectionState] = useState<RangeSelection>(() =>
    fromUrl ? parseRange(new URLSearchParams(searchParams.toString())) : DEFAULT_RANGE
  );

  // Without a range in the URL, fall back to the last one this browser used.
  useEffect(() => {
    if (fromUrl) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setSelectionState(parseRange(new URLSearchParams(stored)));
    } catch {
      // Storage refused; the default range stands.
    }
  }, [fromUrl]);

  const setSelection = useCallback(
    (next: RangeSelection) => {
      setSelectionState(next);
      const rangeParams = rangeToParams(next);
      try {
        localStorage.setItem(STORAGE_KEY, rangeParams.toString());
      } catch {
        // Storage refused; the URL still carries it.
      }
      const params = new URLSearchParams(searchParams.toString());
      params.delete("range");
      params.delete("from");
      params.delete("to");
      rangeParams.forEach((v, k) => params.set(k, v));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const value = useMemo(() => {
    const resolved = resolveRange(selection);
    return {
      selection,
      setSelection,
      query: rangeToParams(selection).toString(),
      label: resolved.label,
      days: resolved.days,
    };
  }, [selection, setSelection]);

  return <RangeContext.Provider value={value}>{children}</RangeContext.Provider>;
}

export function useRange(): RangeContextValue {
  const value = useContext(RangeContext);
  if (!value) throw new Error("useRange must be used inside RangeProvider");
  return value;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RangePicker() {
  const { selection, setSelection, label } = useRange();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(selection.from ?? "");
  const [to, setTo] = useState(selection.to ?? today());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  // Phones: the root is not positioned, so the form anchors to the sticky
  // header and spans it.
  return (
    <div ref={rootRef} className="md:relative">
      <div className="flex items-center rounded-md border border-border bg-surface p-0.5">
        {RANGE_PRESETS.map((p) => {
          const active = selection.preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setSelection({ preset: p.value })}
              aria-pressed={active}
              className={`h-8 rounded px-2.5 text-xs font-semibold transition-colors sm:px-3 ${
                active
                  ? "bg-accent text-on-accent"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {p.value.toUpperCase()}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Custom date range"
          className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-colors ${
            selection.preset === "custom"
              ? "bg-accent text-on-accent"
              : "text-muted hover:bg-surface-hover hover:text-foreground"
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {selection.preset === "custom" ? label : "Custom"}
          </span>
        </button>
      </div>

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from <= to) {
              setSelection({ preset: "custom", from, to });
              setOpen(false);
            }
          }}
          className="panel absolute inset-x-4 top-full z-50 mt-2 space-y-3 p-4 md:inset-x-auto md:right-0 md:top-auto md:w-72"
        >
          <p className="text-sm font-semibold text-foreground">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              From
              <input
                type="date"
                value={from}
                max={to || today()}
                onChange={(e) => setFrom(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted">
              To
              <input
                type="date"
                value={to}
                min={from}
                max={today()}
                onChange={(e) => setTo(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-accent py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            <Check className="h-4 w-4" />
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
