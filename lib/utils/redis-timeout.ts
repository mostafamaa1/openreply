/**
 * The shared Redis client never gives up on a command while disconnected
 * (BullMQ needs that), so a Redis call must be bounded: on timeout it
 * resolves to the fallback instead of hanging. Most callers are best-effort
 * (cache, throttle) and degrade on the fallback; a caller that must fail
 * closed instead (the Run-now cooldown) passes a sentinel fallback and
 * throws on it.
 */
export const REDIS_TIMEOUT_MS = 2_000;

export function withRedisTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), REDIS_TIMEOUT_MS);
    }),
  ]);
}
