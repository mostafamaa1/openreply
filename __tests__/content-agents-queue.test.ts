// Value: protects=Agents page run state: running/queued/idle per workspace, scheduled jobs cover all; fails_when=another workspace's job shows as this one's or a scheduled run is missed; why_new=queue untested; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getJobs } = vi.hoisted(() => ({ getJobs: vi.fn() }));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.getJobs = getJobs;
    return this;
  }),
  Worker: vi.fn(),
}));
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => ({}) }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/agents/run", () => ({ runContentCycle: vi.fn() }));
vi.mock("@/lib/agents/digest", () => ({ sendDigest: vi.fn() }));

import { getCycleState } from "@/lib/queue/content-agents";

const job = (workspaceId?: string) => ({ data: { workspaceId, trigger: workspaceId ? "manual" : "schedule" } });

function jobs(active: unknown[], waiting: unknown[]) {
  getJobs.mockImplementation(async (types: string[]) => (types.includes("active") ? active : waiting));
}

beforeEach(() => vi.clearAllMocks());

describe("getCycleState", () => {
  it("is running when this workspace's job or a scheduled all-workspace job is active", async () => {
    jobs([job("w1")], []);
    expect(await getCycleState("w1")).toBe("running");
    jobs([job()], []);
    expect(await getCycleState("w1")).toBe("running");
  });

  it("is queued when only a waiting job covers it", async () => {
    jobs([job("w2")], [job("w1")]);
    expect(await getCycleState("w1")).toBe("queued");
  });

  it("is idle when the only jobs belong to other workspaces", async () => {
    jobs([job("w2")], [job("w3")]);
    expect(await getCycleState("w1")).toBe("idle");
  });
});
