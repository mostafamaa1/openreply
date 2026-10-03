// Value: protects=Telegram digest: no Analyst output -> clear error; captions/titles HTML-escaped; follower change signed; fails_when=a caption with < breaks Telegram HTML parse or sign is lost; why_new=digest.ts untested; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { agentRun: { findFirst: vi.fn() } },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "https://app.example" }));

import { buildDigest } from "@/lib/agents/digest";

const analyst = (overrides: Record<string, unknown> = {}) => ({
  username: "me",
  followers: 12_345,
  followerChange30d: -250,
  engagementRate: null,
  topPosts: [{ caption: "Tips <b>&</b> tricks", url: null, views: 5000 }],
  last30: { posts: 4, views: 4000, avgViews: 1000 },
  prev30: { posts: 4, views: 2000, avgViews: 500 },
  notes: [],
  ...overrides,
});

function outputs(byAgent: Record<string, unknown>) {
  mockPrisma.agentRun.findFirst.mockImplementation(async ({ where }: { where: { agent: string } }) =>
    byAgent[where.agent] ? { output: byAgent[where.agent] } : null
  );
}

beforeEach(() => vi.clearAllMocks());

describe("buildDigest", () => {
  it("throws when the Analyst has never succeeded", async () => {
    outputs({});
    await expect(buildDigest("w1")).rejects.toThrow(/No Analyst output/);
  });

  it("escapes HTML in captions and idea titles", async () => {
    outputs({
      ANALYST: analyst(),
      IDEATOR: { ideas: [{ title: "Use <script> & win", angle: "a > b", why: "x", format: "Reel" }] },
    });
    const text = await buildDigest("w1");
    expect(text).toContain("Tips &lt;b&gt;&amp;&lt;/b&gt; tricks");
    expect(text).toContain("Top idea: Use &lt;script&gt; &amp; win");
    expect(text).not.toContain("<script>");
  });

  it("signs the follower change and the views change", async () => {
    outputs({ ANALYST: analyst() });
    const down = await buildDigest("w1");
    expect(down).toContain("<b>12.3K</b> (-250 in 30d)");
    expect(down).toContain("(+100% vs prior 30d)");

    outputs({ ANALYST: analyst({ followerChange30d: 1500 }) });
    expect(await buildDigest("w1")).toContain("(+1.5K in 30d)");
  });
});
