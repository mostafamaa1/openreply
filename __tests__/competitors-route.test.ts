// Value: protects=competitor handle normalisation (URL, @, case) and rejection, role check, 10-competitor cap; fails_when=pasted profile URL stored raw or an editor can add; why_new=route untested; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, access } = vi.hoisted(() => ({
  mockPrisma: {
    competitor: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  access: {
    getCurrentWorkspaceContext: vi.fn(),
    canManageWorkspace: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/workspace-access", () => access);

import { POST } from "@/app/api/agents/competitors/route";

const post = (username: unknown) =>
  POST(
    new NextRequest("http://localhost/api/agents/competitors", {
      method: "POST",
      body: JSON.stringify({ username }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  access.getCurrentWorkspaceContext.mockResolvedValue({ workspaceId: "w1", role: "OWNER" });
  access.canManageWorkspace.mockReturnValue(true);
  mockPrisma.competitor.count.mockResolvedValue(0);
  mockPrisma.competitor.findMany.mockResolvedValue([]);
});

describe("POST /api/agents/competitors", () => {
  it.each([
    ["https://www.instagram.com/Some.Creator/?hl=en", "some.creator"],
    ["@Some_Creator", "some_creator"],
    ["  plainname  ", "plainname"],
  ])("normalises %s to %s", async (input, expected) => {
    const res = await post(input);
    expect(res.status).toBe(200);
    expect(mockPrisma.competitor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_username: { workspaceId: "w1", username: expected } },
      })
    );
  });

  it.each(["has space", "", "x".repeat(31), "bad-dash"])("rejects %j", async (input) => {
    const res = await post(input);
    expect(res.status).toBe(400);
    expect(mockPrisma.competitor.upsert).not.toHaveBeenCalled();
  });

  it("stops at 10 competitors", async () => {
    mockPrisma.competitor.count.mockResolvedValue(10);
    const res = await post("eleventh");
    expect(res.status).toBe(400);
    expect(mockPrisma.competitor.upsert).not.toHaveBeenCalled();
  });

  it("refuses members who cannot manage the workspace, and anonymous callers", async () => {
    access.canManageWorkspace.mockReturnValue(false);
    expect((await post("someone")).status).toBe(403);
    access.getCurrentWorkspaceContext.mockResolvedValue(null);
    expect((await post("someone")).status).toBe(401);
    expect(mockPrisma.competitor.upsert).not.toHaveBeenCalled();
  });
});
