// Value: protects=Run now spends Apify/Gemini at most once per 6 h per workspace, fails closed when Redis is slow, and frees the cooldown when nothing was queued; fails_when=the NX/EX arguments change, a Redis timeout counts as acquired, or a failed add burns the cooldown; why_new=the route test mocks requestContentCycle; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redis, add } = vi.hoisted(() => ({
  redis: { set: vi.fn(), ttl: vi.fn(), del: vi.fn() },
  add: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.add = add;
    return this;
  }),
  Worker: vi.fn(),
}));
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => redis }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/agents/run", () => ({ runContentCycle: vi.fn() }));
vi.mock("@/lib/agents/digest", () => ({ sendDigest: vi.fn() }));

import {
  QueueUnavailableError,
  RUN_NOW_COOLDOWN_SECONDS,
  requestContentCycle,
} from "@/lib/queue/content-agents";
import { REDIS_TIMEOUT_MS } from "@/lib/utils/redis-timeout";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  add.mockResolvedValue({});
  redis.del.mockResolvedValue(1);
});

describe("requestContentCycle", () => {
  it("takes a 6 h cooldown and queues one deduplicated job", async () => {
    redis.set.mockResolvedValue("OK");
    expect(await requestContentCycle("w1")).toEqual({ queued: true });
    expect(redis.set).toHaveBeenCalledWith("agents:run-now:w1", "1", "EX", RUN_NOW_COOLDOWN_SECONDS, "NX");
    expect(add).toHaveBeenCalledWith(
      "content-cycle",
      { workspaceId: "w1", trigger: "manual" },
      { deduplication: { id: "manual-w1" } }
    );
  });

  it("refuses inside the cooldown with the seconds left, and queues nothing", async () => {
    redis.set.mockResolvedValue(null);
    redis.ttl.mockResolvedValue(1234);
    expect(await requestContentCycle("w1")).toEqual({ queued: false, retryAfterSeconds: 1234 });
    expect(add).not.toHaveBeenCalled();
  });

  it("never reports less than one second left", async () => {
    redis.set.mockResolvedValue(null);
    redis.ttl.mockResolvedValue(-2);
    expect(await requestContentCycle("w1")).toEqual({ queued: false, retryAfterSeconds: 1 });
  });

  it("fails closed when Redis does not answer the cooldown", async () => {
    vi.useFakeTimers();
    redis.set.mockReturnValue(new Promise(() => undefined));
    const pending = requestContentCycle("w1");
    const assertion = expect(pending).rejects.toBeInstanceOf(QueueUnavailableError);
    await vi.advanceTimersByTimeAsync(REDIS_TIMEOUT_MS);
    await assertion;
    expect(add).not.toHaveBeenCalled();
  });

  it("removes a cooldown that lands after the timeout, since nothing was queued", async () => {
    vi.useFakeTimers();
    let land!: (v: string) => void;
    redis.set.mockReturnValue(new Promise((r) => (land = r)));
    const pending = requestContentCycle("w1");
    const assertion = expect(pending).rejects.toBeInstanceOf(QueueUnavailableError);
    await vi.advanceTimersByTimeAsync(REDIS_TIMEOUT_MS);
    await assertion;
    land("OK");
    await vi.advanceTimersByTimeAsync(0);
    expect(redis.del).toHaveBeenCalledWith("agents:run-now:w1");
  });

  it("frees the cooldown when queueing fails", async () => {
    redis.set.mockResolvedValue("OK");
    add.mockRejectedValue(new Error("boom"));
    await expect(requestContentCycle("w1")).rejects.toThrow("boom");
    expect(redis.del).toHaveBeenCalledWith("agents:run-now:w1");
  });

  it("fails closed, keeping the cooldown, when queueing itself hangs", async () => {
    vi.useFakeTimers();
    redis.set.mockResolvedValue("OK");
    add.mockReturnValue(new Promise(() => undefined));
    const pending = requestContentCycle("w1");
    const assertion = expect(pending).rejects.toBeInstanceOf(QueueUnavailableError);
    await vi.advanceTimersByTimeAsync(REDIS_TIMEOUT_MS);
    await assertion;
    expect(redis.del).not.toHaveBeenCalled();
  });
});
