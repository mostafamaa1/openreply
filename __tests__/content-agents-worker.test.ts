// Value: protects=the weekly job runs every profiled workspace even if one fails, sends the digest only for the operator's workspace, never replays a stalled paid run, and marks interrupted runs failed on boot; fails_when=the try/catch moves outside the loop, digests go to every workspace, or maxStalledCount is dropped; why_new=content-agents-queue.test.ts covers getCycleState only; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { Worker, mockPrisma, runContentCycle, sendDigest, sendTelegramMessage } = vi.hoisted(() => ({
  Worker: vi.fn(function (this: { on: () => void }) {
    this.on = vi.fn();
  }),
  mockPrisma: {
    contentProfile: { findMany: vi.fn() },
    agentRun: { updateMany: vi.fn() },
  },
  runContentCycle: vi.fn(),
  sendDigest: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock("bullmq", () => ({ Worker, Queue: vi.fn() }));
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => ({}) }));
vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/agents/run", () => ({ runContentCycle }));
vi.mock("@/lib/agents/digest", () => ({ sendDigest }));
vi.mock("@/lib/agents/telegram", () => ({ sendTelegramMessage, escapeHtml: (s: string) => s }));
vi.mock("@/lib/agents/config", () => ({
  getTelegramConfig: () => ({ token: "t", chatId: "c" }),
  getTimeZone: () => "UTC",
}));

import { createContentAgentsWorker, failInterruptedRuns } from "@/lib/queue/content-agents";

type Processor = (job: { data: { workspaceId?: string; trigger: string } }) => Promise<void>;
let processor: Processor;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AGENTS_WORKSPACE_ID;
  createContentAgentsWorker();
  processor = (Worker.mock.calls[0] as unknown[])[1] as Processor;
  runContentCycle.mockResolvedValue({ outputs: {}, errors: {}, competitorSkipReason: null });
  sendDigest.mockResolvedValue(1);
  sendTelegramMessage.mockResolvedValue(1);
});

describe("content agents worker", () => {
  it("never replays a stalled run", () => {
    expect((Worker.mock.calls[0] as unknown[])[2]).toMatchObject({ concurrency: 1, maxStalledCount: 0 });
  });

  it("keeps going after one workspace fails", async () => {
    mockPrisma.contentProfile.findMany
      .mockResolvedValueOnce([{ workspaceId: "w1" }, { workspaceId: "w2" }]) // the scheduled list
      .mockResolvedValueOnce([{ workspaceId: "w1" }, { workspaceId: "w2" }]); // digest pin lookup
    runContentCycle.mockRejectedValueOnce(new Error("boom"));
    await processor({ data: { trigger: "schedule" } });
    expect(runContentCycle).toHaveBeenCalledTimes(2);
  });

  it("sends a digest only for the pinned workspace when several exist", async () => {
    process.env.AGENTS_WORKSPACE_ID = "w2";
    mockPrisma.contentProfile.findMany.mockResolvedValueOnce([{ workspaceId: "w1" }, { workspaceId: "w2" }]);
    await processor({ data: { trigger: "schedule" } });
    expect(sendDigest).toHaveBeenCalledTimes(1);
    expect(sendDigest.mock.calls[0][0]).toBe("w2");
  });

  it("passes the cycle start to the digest so older runs are not reported", async () => {
    process.env.AGENTS_WORKSPACE_ID = "w1";
    mockPrisma.contentProfile.findMany.mockResolvedValueOnce([{ workspaceId: "w1" }]);
    const before = Date.now();
    await processor({ data: { trigger: "schedule" } });
    const since = sendDigest.mock.calls[0][1] as Date;
    expect(since).toBeInstanceOf(Date);
    expect(since.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("still reports failed agents when the digest cannot be built", async () => {
    process.env.AGENTS_WORKSPACE_ID = "w1";
    mockPrisma.contentProfile.findMany.mockResolvedValueOnce([{ workspaceId: "w1" }]);
    runContentCycle.mockResolvedValue({
      outputs: {},
      errors: { ANALYST: "gemini 429" },
      competitorSkipReason: null,
    });
    sendDigest.mockRejectedValue(new Error("No Analyst output yet"));
    await processor({ data: { trigger: "schedule" } });
    expect(sendTelegramMessage.mock.calls.some(([m]) => /ANALYST: gemini 429/.test(m))).toBe(true);
  });

  it("does not start taking jobs until the caller runs it", () => {
    expect((Worker.mock.calls[0] as unknown[])[2]).toMatchObject({ autorun: false });
  });

  it("sends no digest with several workspaces and no pin", async () => {
    mockPrisma.contentProfile.findMany
      .mockResolvedValueOnce([{ workspaceId: "w1" }, { workspaceId: "w2" }])
      .mockResolvedValueOnce([{ workspaceId: "w1" }, { workspaceId: "w2" }]);
    await processor({ data: { trigger: "schedule" } });
    expect(sendDigest).not.toHaveBeenCalled();
  });

  it("marks runs left RUNNING as failed", async () => {
    mockPrisma.agentRun.updateMany.mockResolvedValue({ count: 3 });
    expect(await failInterruptedRuns()).toBe(3);
    expect(mockPrisma.agentRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "RUNNING" } })
    );
  });
});
