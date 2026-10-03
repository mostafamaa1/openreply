// Value: protects=best-effort Redis calls (cache, login throttle, Run now) cannot hang a request while Redis is down; fails_when=the timeout is removed or a late rejection goes unhandled; why_new=only the rejected-promise path was covered; seam=none
import { afterEach, describe, expect, it, vi } from "vitest";
import { REDIS_TIMEOUT_MS, withRedisTimeout } from "@/lib/utils/redis-timeout";

afterEach(() => vi.useRealTimers());

describe("withRedisTimeout", () => {
  it("resolves to the fallback when Redis never answers", async () => {
    vi.useFakeTimers();
    const pending = withRedisTimeout(new Promise<string>(() => undefined), "fallback");
    await vi.advanceTimersByTimeAsync(REDIS_TIMEOUT_MS);
    expect(await pending).toBe("fallback");
  });

  it("returns the answer when Redis is fast", async () => {
    expect(await withRedisTimeout(Promise.resolve("OK"), "fallback")).toBe("OK");
  });

  it("ignores a rejection that arrives after the timeout", async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    let reject!: (e: Error) => void;
    const late = new Promise<string>((_, r) => (reject = r));
    const pending = withRedisTimeout(late, "fallback");
    await vi.advanceTimersByTimeAsync(REDIS_TIMEOUT_MS);
    expect(await pending).toBe("fallback");
    reject(new Error("late"));
    await vi.advanceTimersByTimeAsync(10);
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
