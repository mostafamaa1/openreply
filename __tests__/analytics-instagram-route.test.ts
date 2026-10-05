// Value: protects=the Instagram analytics route reports expired/permission/upstream/server errors with the right status and message, and joins manual topics after the cache; fails_when=status codes swap, a server bug is blamed on Instagram, or topics come from the cache; why_new=route untested; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { auth, ig, analytics, tags, mockPrisma, meta } = vi.hoisted(() => {
  class MetaApiError extends Error {}
  class TokenExpiredError extends MetaApiError {}
  class PermissionError extends MetaApiError {}
  return {
    auth: { getCurrentWorkspaceId: vi.fn() },
    ig: { getWorkspaceInstagramAccount: vi.fn() },
    analytics: { getInstagramAnalytics: vi.fn() },
    tags: { getPostCategories: vi.fn() },
    mockPrisma: { contentProfile: { findUnique: vi.fn() } },
    meta: { MetaApiError, TokenExpiredError, PermissionError },
  };
});

vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/instagram-accounts", () => ig);
vi.mock("@/lib/analytics/instagram", () => analytics);
vi.mock("@/lib/agents/categorize", () => tags);
vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/meta/client", () => meta);
vi.mock("@/lib/agents/config", () => ({ getTimeZone: () => "UTC" }));

import { GET } from "@/app/api/analytics/instagram/route";

const get = () => GET(new NextRequest("http://localhost/api/analytics/instagram?range=30d"));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  auth.getCurrentWorkspaceId.mockResolvedValue("w1");
  ig.getWorkspaceInstagramAccount.mockResolvedValue({ id: "ig1" });
  mockPrisma.contentProfile.findUnique.mockResolvedValue({ categories: ["Sales"] });
  tags.getPostCategories.mockResolvedValue(new Map([["m1", { category: "Sales", source: "MANUAL" }]]));
});

describe("GET /api/analytics/instagram", () => {
  it("joins topics onto posts after the cached analytics", async () => {
    analytics.getInstagramAnalytics.mockResolvedValue({ posts: [{ id: "m1" }, { id: "m2" }] });
    const body = await (await get()).json();
    expect(body.data.posts).toEqual([
      { id: "m1", category: "Sales", categorySource: "MANUAL" },
      { id: "m2", category: null, categorySource: null },
    ]);
    expect(body.data.categories).toEqual(["Sales"]);
  });

  it.each([
    [new meta.TokenExpiredError("x"), 502, /expired/],
    [new meta.PermissionError("x"), 502, /insights access/],
    [new meta.MetaApiError("x"), 502, /did not respond/],
    [new TypeError("fetch failed"), 502, /did not respond/],
    [new TypeError("Cannot read properties of undefined"), 500, /server/],
  ])("maps %s to its status and message", async (error, status, message) => {
    analytics.getInstagramAnalytics.mockRejectedValue(error);
    const res = await get();
    expect(res.status).toBe(status);
    expect((await res.json()).error).toMatch(message);
  });

  it("is 401 signed out and 400 without an account", async () => {
    auth.getCurrentWorkspaceId.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    ig.getWorkspaceInstagramAccount.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(400);
  });
});
