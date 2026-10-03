// Value: protects=at most 10 password attempts per 15 min window per email/user, counted before verifying, and fail-open when Redis is down; fails_when=attempts are counted after the check, the expiry is lost, or a Redis outage blocks logins; why_new=login-throttle.ts untested; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redis, tx } = vi.hoisted(() => {
  const tx = { incr: vi.fn(), expire: vi.fn(), exec: vi.fn() };
  tx.incr.mockReturnValue(tx);
  tx.expire.mockReturnValue(tx);
  return { tx, redis: { multi: vi.fn(() => tx), del: vi.fn() } };
});

vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => redis }));

import { clearAttempts, reserveAttempt } from "@/lib/login-throttle";

beforeEach(() => {
  vi.clearAllMocks();
  tx.incr.mockReturnValue(tx);
  tx.expire.mockReturnValue(tx);
});

describe("password attempt limit", () => {
  it("allows 10 attempts in a window and refuses the 11th", async () => {
    tx.exec.mockResolvedValueOnce([[null, 10], [null, 0]]);
    expect(await reserveAttempt("login", "a@b.co")).toBe(true);
    tx.exec.mockResolvedValueOnce([[null, 11], [null, 0]]);
    expect(await reserveAttempt("login", "a@b.co")).toBe(false);
    expect(tx.incr).toHaveBeenCalledWith("login:fail:a@b.co");
  });

  it("counts and sets the 15 minute expiry in one transaction, only if missing", async () => {
    tx.exec.mockResolvedValueOnce([[null, 1], [null, 1]]);
    await reserveAttempt("login", "a@b.co");
    expect(redis.multi).toHaveBeenCalledTimes(1);
    expect(tx.expire).toHaveBeenCalledWith("login:fail:a@b.co", 900, "NX");
  });

  it("keeps sign-in and password-change counts apart", async () => {
    tx.exec.mockResolvedValueOnce([[null, 1], [null, 1]]);
    await reserveAttempt("password-change", "user-1");
    expect(tx.incr).toHaveBeenCalledWith("password-change:fail:user-1");
  });

  it("clears the count after a successful check", async () => {
    await clearAttempts("login", "a@b.co");
    expect(redis.del).toHaveBeenCalledWith("login:fail:a@b.co");
  });

  it("does not block or throw when Redis is unreachable", async () => {
    tx.exec.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    redis.del.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await reserveAttempt("login", "a@b.co")).toBe(true);
    await expect(clearAttempts("login", "a@b.co")).resolves.toBeUndefined();
  });
});
