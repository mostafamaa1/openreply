// Value: protects=content cycle failure isolation: a failing agent is recorded FAILED and the rest still run; planner/ideator fail cleanly; fails_when=one agent error aborts the cycle or hides others; why_new=run.ts untested; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, agents, gemini } = vi.hoisted(() => ({
  mockPrisma: {
    instagramAccount: { findFirst: vi.fn() },
    contentProfile: { findUnique: vi.fn() },
    agentRun: { create: vi.fn(), update: vi.fn() },
  },
  agents: {
    runAnalyst: vi.fn(),
    runDmManager: vi.fn(),
    runIdeator: vi.fn(),
    runHookScript: vi.fn(),
    runPlanner: vi.fn(),
    pickWeek: vi.fn((ideas: unknown[]) => ideas),
  },
  gemini: { isGeminiConfigured: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/agents/agents", () => agents);
vi.mock("@/lib/agents/gemini", () => gemini);
vi.mock("@/lib/agents/pull-data", () => ({
  pullContentData: vi.fn(async () => ({
    own: { posts: [] },
    competitors: [],
    competitorSkipReason: null,
  })),
}));
vi.mock("@/lib/agents/categorize", () => ({
  tagUntaggedPosts: vi.fn(async () => undefined),
  getPostCategories: vi.fn(async () => new Map()),
}));

import { runContentCycle } from "@/lib/agents/run";

const idea = { title: "T", angle: "a", why: "w", format: "Reel", inspiredBy: null };

function statusOf(agent: string): string | undefined {
  const i = mockPrisma.agentRun.create.mock.calls.findIndex((c) => c[0].data.agent === agent);
  return i < 0 ? undefined : mockPrisma.agentRun.update.mock.calls[i]?.[0].data.status;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.instagramAccount.findFirst.mockResolvedValue({ id: "ig1" });
  mockPrisma.contentProfile.findUnique.mockResolvedValue(null);
  let n = 0;
  mockPrisma.agentRun.create.mockImplementation(async () => ({ id: `run${n++}` }));
  mockPrisma.agentRun.update.mockResolvedValue({});
  gemini.isGeminiConfigured.mockReturnValue(true);
  agents.runAnalyst.mockResolvedValue({ username: "me" });
  agents.runDmManager.mockResolvedValue({ sent: 0 });
  agents.runIdeator.mockResolvedValue({ ideas: [idea], allocation: [] });
  agents.runHookScript.mockResolvedValue({ scripts: [] });
  agents.runPlanner.mockResolvedValue({ timeZone: "UTC", days: [] });
});

describe("runContentCycle", () => {
  it("records a failing agent and still runs the others", async () => {
    agents.runDmManager.mockRejectedValue(new Error("db hiccup"));
    const result = await runContentCycle("w1");

    expect(result.errors).toEqual({ DM_MANAGER: "db hiccup" });
    expect(Object.keys(result.outputs).sort()).toEqual(
      ["ANALYST", "HOOK_SCRIPT", "IDEATOR", "PLANNER"].sort()
    );
    expect(statusOf("DM_MANAGER")).toBe("FAILED");
    expect(statusOf("PLANNER")).toBe("SUCCEEDED");
  });

  it("fails the Planner cleanly when the Analyst failed", async () => {
    agents.runAnalyst.mockRejectedValue(new Error("no stats"));
    const result = await runContentCycle("w1");

    expect(result.errors.ANALYST).toBe("no stats");
    expect(result.errors.PLANNER).toMatch(/Analyst failed/);
    expect(agents.runPlanner).not.toHaveBeenCalled();
    expect(result.outputs.HOOK_SCRIPT).toBeDefined();
  });

  it("without a Gemini key, records the Ideator error and skips scripting and planning", async () => {
    gemini.isGeminiConfigured.mockReturnValue(false);
    const result = await runContentCycle("w1");

    expect(result.errors.IDEATOR).toMatch(/GEMINI_API_KEY/);
    expect(result.errors.HOOK_SCRIPT).toMatch(/No ideas/);
    expect(result.errors.PLANNER).toMatch(/No ideas/);
    expect(agents.runIdeator).not.toHaveBeenCalled();
    expect(result.outputs.ANALYST).toBeDefined();
    expect(result.outputs.DM_MANAGER).toBeDefined();
  });

  it("refuses to run without a connected Instagram account", async () => {
    mockPrisma.instagramAccount.findFirst.mockResolvedValue(null);
    await expect(runContentCycle("w1")).rejects.toThrow(/No Instagram account/);
    expect(mockPrisma.agentRun.create).not.toHaveBeenCalled();
  });
});
