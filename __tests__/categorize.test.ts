// Value: protects=topic tagging trusts no model output: unknown topics become Other, ids outside the batch are dropped, manual and current tags are never re-sent, stale AI tags are redone, blank captions skip Gemini; fails_when=Gemini output is written unchecked or manual tags are re-tagged; why_new=content-cycle.test.ts mocks the whole module; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, gen } = vi.hoisted(() => ({
  mockPrisma: {
    postCategory: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  },
  gen: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/agents/gemini", () => ({ generateJson: gen }));

import { tagUntaggedPosts } from "@/lib/agents/categorize";

const rows = () => mockPrisma.postCategory.createMany.mock.calls.flatMap((c) => c[0].data);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.postCategory.findMany.mockResolvedValue([]);
});

describe("tagUntaggedPosts", () => {
  it("sanitises the model's answer before writing", async () => {
    gen.mockResolvedValue({
      posts: [
        { id: "p1", category: "Invented" },
        { id: "p2", category: "Sales" },
        { id: "not-in-batch", category: "Sales" },
      ],
    });
    await tagUntaggedPosts("ig1", [{ id: "p1", caption: "a" }, { id: "p2", caption: "b" }], ["Sales"]);
    expect(rows()).toEqual([
      { instagramAccountId: "ig1", mediaId: "p1", category: "Other" },
      { instagramAccountId: "ig1", mediaId: "p2", category: "Sales" },
    ]);
  });

  it("never re-sends manual or current tags, and redoes AI tags on a removed topic", async () => {
    mockPrisma.postCategory.findMany.mockResolvedValue([
      { mediaId: "manual", category: "Old topic", source: "MANUAL" },
      { mediaId: "current", category: "Sales", source: "AI" },
      { mediaId: "stale", category: "Old topic", source: "AI" },
    ]);
    gen.mockResolvedValue({ posts: [{ id: "stale", category: "Sales" }] });
    await tagUntaggedPosts(
      "ig1",
      ["manual", "current", "stale"].map((id) => ({ id, caption: `caption ${id}` })),
      ["Sales"]
    );
    expect(mockPrisma.postCategory.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ mediaId: { in: ["stale"] }, source: "AI" }) })
    );
    const prompt = gen.mock.calls[0][0] as string;
    expect(prompt).toContain("stale:");
    expect(prompt).not.toContain("manual:");
    expect(prompt).not.toContain("current:");
  });

  it("tags blank captions Other without calling Gemini", async () => {
    await tagUntaggedPosts("ig1", [{ id: "blank", caption: "   " }], ["Sales"]);
    expect(gen).not.toHaveBeenCalled();
    expect(rows()).toEqual([{ instagramAccountId: "ig1", mediaId: "blank", category: "Other" }]);
  });
});
