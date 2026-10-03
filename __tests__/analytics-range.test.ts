// Value: protects=dashboard range filter: URL parsing, equal-length previous window, tz day buckets, null change; fails_when=custom from>to accepted, prev window drifts, tz ignored; why_new=range.ts is untested; seam=none
import { describe, expect, it } from "vitest";
import {
  change,
  dayKeys,
  parseRange,
  rangeToParams,
  resolveRange,
} from "@/lib/analytics/range";

const DAY = 86_400_000;

describe("parseRange", () => {
  it("accepts a valid custom range and round-trips it", () => {
    const sel = parseRange(new URLSearchParams("from=2026-09-01&to=2026-09-07"));
    expect(sel).toEqual({ preset: "custom", from: "2026-09-01", to: "2026-09-07" });
    expect(parseRange(rangeToParams(sel))).toEqual(sel);
  });

  it("rejects a custom range that ends before it starts, or is malformed", () => {
    expect(parseRange(new URLSearchParams("from=2026-09-07&to=2026-09-01&range=7d"))).toEqual({
      preset: "7d",
    });
    expect(parseRange(new URLSearchParams("from=2026-9-1&to=2026-09-07"))).toEqual({
      preset: "30d",
    });
  });

  it("falls back to 30 days for an unknown preset", () => {
    expect(parseRange(new URLSearchParams("range=5y"))).toEqual({ preset: "30d" });
    expect(parseRange(new URLSearchParams("range=90d"))).toEqual({ preset: "90d" });
  });
});

describe("resolveRange", () => {
  const now = new Date("2026-10-03T15:30:00Z");

  it("gives a preset a previous window of the same length ending where it starts", () => {
    const r = resolveRange({ preset: "7d" }, now);
    expect(r.to).toEqual(now);
    expect(r.to.getTime() - r.from.getTime()).toBe(7 * DAY);
    expect(r.previousTo).toEqual(r.from);
    expect(r.previousTo.getTime() - r.previousFrom.getTime()).toBe(7 * DAY);
    expect(r.days).toBe(7);
  });

  it("treats custom bounds as inclusive whole days, clipped to now", () => {
    const past = resolveRange({ preset: "custom", from: "2026-09-01", to: "2026-09-03" }, now);
    expect(past.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(past.to.toISOString()).toBe("2026-09-04T00:00:00.000Z");
    expect(past.days).toBe(3);
    expect(past.previousFrom.toISOString()).toBe("2026-08-29T00:00:00.000Z");

    const today = resolveRange({ preset: "custom", from: "2026-10-01", to: "2026-10-03" }, now);
    expect(today.to).toEqual(now);
  });

  it("never returns a negative window for a custom range wholly in the future", () => {
    const future = resolveRange({ preset: "custom", from: "2026-11-01", to: "2026-11-05" }, now);
    expect(future.to).toEqual(now);
    expect(future.from.getTime()).toBeLessThan(future.to.getTime());
    expect(future.previousTo.getTime()).toBeGreaterThan(future.previousFrom.getTime());
  });
});

describe("dayKeys", () => {
  it("lists each local day once, in the given time zone", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2026-09-04T00:00:00Z");
    expect(dayKeys(from, to, "UTC")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    // UTC+3: the window starts at 03:00 on the 1st and ends at 03:00 on the 4th.
    expect(dayKeys(from, to, "Asia/Riyadh")).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });
});

describe("change", () => {
  it("is relative, and null without a baseline", () => {
    expect(change(150, 100)).toBeCloseTo(0.5);
    expect(change(50, 100)).toBeCloseTo(-0.5);
    expect(change(10, 0)).toBeNull();
  });
});

describe("custom range limits and zones", () => {
  it("rejects custom ranges longer than a year or before 2000 (QA: 126 years took 20 s)", () => {
    expect(parseRange(new URLSearchParams("from=1900-01-01&to=2026-10-01"))).toEqual({ preset: "30d" });
    expect(parseRange(new URLSearchParams("from=2024-01-01&to=2026-10-01"))).toEqual({ preset: "30d" });
    expect(parseRange(new URLSearchParams("from=2025-10-01&to=2026-10-01")).preset).toBe("custom");
  });

  it("starts and ends custom days at midnight in the analytics zone", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const r = resolveRange({ preset: "custom", from: "2026-10-01", to: "2026-10-01" }, now, "Asia/Riyadh");
    // Riyadh is UTC+3 with no DST.
    expect(r.from.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-01T21:00:00.000Z");
    expect(r.days).toBe(1);
    expect(dayKeys(r.from, r.to, "Asia/Riyadh")).toEqual(["2026-10-01"]);
  });

  it("rejects dates that do not exist", () => {
    expect(parseRange(new URLSearchParams("from=2026-02-31&to=2026-03-05"))).toEqual({ preset: "30d" });
    // Out-of-range parts make Date invalid; this must fall back, not throw.
    expect(parseRange(new URLSearchParams("from=2026-13-01&to=2026-13-05"))).toEqual({ preset: "30d" });
    expect(parseRange(new URLSearchParams("from=2026-10-45&to=2026-10-46"))).toEqual({ preset: "30d" });
  });

  it("handles days that change clocks for daylight saving", () => {
    const now = new Date("2026-12-01T00:00:00Z");
    const spring = resolveRange({ preset: "custom", from: "2026-03-08", to: "2026-03-08" }, now, "America/New_York");
    expect(spring.from.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(spring.to.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    const fall = resolveRange({ preset: "custom", from: "2026-11-01", to: "2026-11-01" }, now, "America/New_York");
    expect(fall.from.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(fall.to.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});
