/**
 * Password attempt limits, in Redis.
 *
 * Reserve-then-verify: every attempt is counted (INCR + EXPIRE NX in one
 * transaction) before the password is checked, so parallel requests cannot
 * slip past the limit and the window always gets its expiry. A successful
 * check clears the count. If Redis is unreachable the attempt is allowed: the
 * hash check still runs, and the email link stays available when locked.
 */

import { getRedisConnection } from "@/lib/queue/client";
import { withRedisTimeout } from "@/lib/utils/redis-timeout";

const MAX_ATTEMPTS = 10;
export const WINDOW_SECONDS = 15 * 60;

type AttemptScope = "login" | "password-change";

function key(scope: AttemptScope, id: string): string {
  return `${scope}:fail:${id}`;
}

/** Count one attempt; false once the window's limit is used up. */
export async function reserveAttempt(scope: AttemptScope, id: string): Promise<boolean> {
  try {
    const k = key(scope, id);
    const results = await withRedisTimeout(
      getRedisConnection().multi().incr(k).expire(k, WINDOW_SECONDS, "NX").exec(),
      null
    );
    const count = Number(results?.[0]?.[1]);
    return !Number.isFinite(count) || count <= MAX_ATTEMPTS;
  } catch {
    return true;
  }
}

export async function clearAttempts(scope: AttemptScope, id: string): Promise<void> {
  try {
    await withRedisTimeout(getRedisConnection().del(key(scope, id)), 0);
  } catch {
    // Best effort: the window expires on its own.
  }
}
