// Value: protects=only owners/admins can edit topics, start paid runs or edit the profile; unknown topics, 'Other' as a planned topic and a run inside the cooldown are refused without writes; fails_when=a role check or validation is removed, or a refused run still queues; why_new=only the competitors POST route had tests; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, access, ig, queue } = vi.hoisted(() => ({
  mockPrisma: {
    contentProfile: { findUnique: vi.fn(), upsert: vi.fn() },
    postCategory: { upsert: vi.fn() },
  },
  access: { getCurrentWorkspaceContext: vi.fn(), canManageWorkspace: vi.fn() },
  ig: { getWorkspaceInstagramAccount: vi.fn() },
  queue: { requestContentCycle: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/workspace-access", () => access);
vi.mock("@/lib/instagram-accounts", () => ig);
vi.mock("@/lib/queue/content-agents", () => queue);

import { PUT as putCategory } from "@/app/api/analytics/post-category/route";
import { POST as runNow } from "@/app/api/agents/run/route";
import { PUT as putProfile } from "@/app/api/agents/profile/route";

const req = (body: unknown) =>
  new NextRequest("http://localhost/x", { method: "PUT", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  access.getCurrentWorkspaceContext.mockResolvedValue({ workspaceId: "w1", role: "OWNER" });
  access.canManageWorkspace.mockReturnValue(true);
  ig.getWorkspaceInstagramAccount.mockResolvedValue({ id: "ig1" });
  mockPrisma.contentProfile.findUnique.mockResolvedValue({ categories: ["Sales"] });
  mockPrisma.contentProfile.upsert.mockImplementation(async ({ create }) => ({
    niche: "", voice: "", audience: "", goals: "", categories: create.categories ?? [],
  }));
  queue.requestContentCycle.mockResolvedValue({ queued: true });
});

describe("PUT /api/analytics/post-category", () => {
  it("stores a known topic as a manual tag", async () => {
    const res = await putCategory(req({ mediaId: "123456", category: "Sales" }));
    expect(res.status).toBe(200);
    expect(mockPrisma.postCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { category: "Sales", source: "MANUAL" } })
    );
  });

  it("rejects a topic outside the profile without writing", async () => {
    expect((await putCategory(req({ mediaId: "123456", category: "Invented" }))).status).toBe(400);
    expect(mockPrisma.postCategory.upsert).not.toHaveBeenCalled();
  });

  it("refuses members who cannot manage the workspace, and signed-out callers", async () => {
    access.canManageWorkspace.mockReturnValue(false);
    expect((await putCategory(req({ mediaId: "123456", category: "Sales" }))).status).toBe(403);
    access.getCurrentWorkspaceContext.mockResolvedValue(null);
    expect((await putCategory(req({ mediaId: "123456", category: "Sales" }))).status).toBe(401);
    expect(mockPrisma.postCategory.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/agents/run", () => {
  it("queues a run for an owner", async () => {
    expect((await runNow()).status).toBe(200);
    expect(queue.requestContentCycle).toHaveBeenCalledWith("w1");
  });

  it("refuses members who cannot manage the workspace, without queueing", async () => {
    access.canManageWorkspace.mockReturnValue(false);
    expect((await runNow()).status).toBe(403);
    expect(queue.requestContentCycle).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After inside the cooldown", async () => {
    queue.requestContentCycle.mockResolvedValue({ queued: false, retryAfterSeconds: 7200 });
    const res = await runNow();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("7200");
  });

  it("answers 503 with a message when the queue is not responding", async () => {
    queue.requestContentCycle.mockRejectedValue(new Error("The job queue is not responding"));
    const res = await runNow();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false });
  });
});

describe("PUT /api/agents/profile", () => {
  const profile = { niche: "n", voice: "v", audience: "a", goals: "g" };

  it("dedupes topics and drops the 'Other' catch-all", async () => {
    await putProfile(req({ ...profile, categories: ["Sales", "Sales", "Other", "English"] }));
    const data = mockPrisma.contentProfile.upsert.mock.calls[0][0].update;
    expect(data.categories).toEqual(["Sales", "English"]);
  });

  it("refuses members who cannot manage the workspace", async () => {
    access.canManageWorkspace.mockReturnValue(false);
    expect((await putProfile(req(profile))).status).toBe(403);
    expect(mockPrisma.contentProfile.upsert).not.toHaveBeenCalled();
  });
});
