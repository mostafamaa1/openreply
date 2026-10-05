// Value: protects=GET /api/agents stays up when Redis is slow, answering cycleState "idle" and nextRunAt null instead of hanging the page; fails_when=the withRedisTimeout wrapper around the queue reads is removed; why_new=agent-route-guards.test.ts covers the other agent routes but not GET; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, auth, queueCalls } = vi.hoisted(() => ({
  mockPrisma: {
    agentRun: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
    competitor: { findMany: vi.fn().mockResolvedValue([]) },
    contentProfile: { findUnique: vi.fn().mockResolvedValue(null) },
  },
  auth: { getCurrentWorkspaceId: vi.fn().mockResolvedValue("w1") },
  queueCalls: { getCycleState: vi.fn(), getNextScheduledRun: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/queue/content-agents", () => queueCalls);

import { GET } from "@/app/api/agents/route";
import { REDIS_TIMEOUT_MS } from "@/lib/utils/redis-timeout";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  auth.getCurrentWorkspaceId.mockResolvedValue("w1");
  mockPrisma.agentRun.findFirst.mockResolvedValue(null);
  mockPrisma.agentRun.count.mockResolvedValue(0);
  mockPrisma.competitor.findMany.mockResolvedValue([]);
  mockPrisma.contentProfile.findUnique.mockResolvedValue(null);
});

describe("GET /api/agents", () => {
  it("falls back to idle and no scheduled run when Redis never answers", async () => {
    vi.useFakeTimers();
    queueCalls.getCycleState.mockReturnValue(new Promise(() => undefined));
    queueCalls.getNextScheduledRun.mockReturnValue(new Promise(() => undefined));
    const pending = GET().then((r) => r.json());
    await vi.advanceTimersByTimeAsync(REDIS_TIMEOUT_MS);
    const body = await pending;
    expect(body.data.cycleState).toBe("idle");
    expect(body.data.nextRunAt).toBeNull();
  });

  it("passes through a real cycle state", async () => {
    queueCalls.getCycleState.mockResolvedValue("running");
    queueCalls.getNextScheduledRun.mockResolvedValue("2026-10-10T20:00:00.000Z");
    const body = await (await GET()).json();
    expect(body.data.cycleState).toBe("running");
    expect(body.data.nextRunAt).toBe("2026-10-10T20:00:00.000Z");
  });
});
