// Value: protects=DM analytics split current vs previous window, funnel delivery/CTR per campaign, keyword case folding; fails_when=previous rows leak into current or ctr divides by matched; why_new=dms.ts untested; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    dmLog: { findMany: vi.fn() },
    linkClick: { findMany: vi.fn() },
    automation: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import { getDmAnalytics } from "@/lib/analytics/dms";
import { resolveRange } from "@/lib/analytics/range";

const now = new Date("2026-10-03T12:00:00Z");
const range = resolveRange({ preset: "7d" }, now);
const cur = new Date("2026-10-01T10:00:00Z");
const prev = new Date("2026-09-25T10:00:00Z");

const log = (automationId: string, status: string, createdAt: Date, matchedKeyword: string | null = null) => ({
  automationId,
  status,
  createdAt,
  matchedKeyword,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.dmLog.findMany
    .mockResolvedValueOnce([
      log("a1", "SENT", cur, "Guide"),
      log("a1", "SENT", cur, " guide "),
      log("a1", "FAILED", cur, "GUIDE"),
      log("a1", "SKIPPED_DEDUP", cur, "link"),
      log("gone", "SENT", cur),
      log("a1", "SENT", prev),
    ])
    .mockResolvedValueOnce([]);
  mockPrisma.linkClick.findMany.mockResolvedValueOnce([
    { automationId: "a1", createdAt: cur },
    { automationId: "a1", createdAt: prev },
    { automationId: "a1", createdAt: prev },
  ]);
  mockPrisma.automation.findMany.mockResolvedValueOnce([
    { id: "a1", name: "Guide", isActive: true, postUrl: null },
    { id: "a2", name: "Paused", isActive: false, postUrl: null },
  ]);
});

describe("getDmAnalytics", () => {
  it("splits totals into the current and previous windows", async () => {
    const data = await getDmAnalytics("w1", null, range, "UTC");
    expect(data.current).toMatchObject({ matched: 5, sent: 3, failed: 1, skipped: 1, clicks: 1 });
    expect(data.current.ctr).toBeCloseTo(1 / 3);
    expect(data.previous).toMatchObject({ matched: 1, sent: 1, clicks: 2, ctr: 2 });
    expect(data.activeCampaigns).toBe(1);
  });

  it("builds the per-campaign funnel from the current window only", async () => {
    const data = await getDmAnalytics("w1", null, range, "UTC");
    const a1 = data.campaigns.find((c) => c.id === "a1")!;
    expect(a1).toMatchObject({ name: "Guide", matched: 4, sent: 2, failed: 1, clicks: 1 });
    expect(a1.deliveryRate).toBeCloseTo(0.5);
    expect(a1.ctr).toBeCloseTo(0.5);
    expect(data.campaigns.find((c) => c.id === "gone")?.name).toBe("Deleted campaign");
    expect(data.campaigns[0].id).toBe("a1");
  });

  it("counts keywords case-insensitively and puts daily sends on the right day", async () => {
    const data = await getDmAnalytics("w1", null, range, "UTC");
    expect(data.keywords[0]).toEqual({ keyword: "guide", count: 3 });
    const oct1 = data.daily.find((d) => d.date === "2026-10-01")!;
    expect(oct1).toMatchObject({ sent: 3, clicks: 1 });
    expect(data.daily.reduce((s, d) => s + d.previousSent, 0)).toBe(1);
  });
});
