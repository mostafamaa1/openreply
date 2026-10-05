import { prisma } from "@/lib/db/client";
import {
  getFollowerCountSeries,
  getUserInfo,
  type FollowerCountPoint,
} from "@/lib/meta/client";

/** Midnight UTC for a date, so one calendar day maps to exactly one row. */
function toUtcDay(value: Date | string): Date {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Record today's follower total for an account.
 *
 * Idempotent: running it repeatedly in one day overwrites that day's row
 * rather than adding another, so the daily cron is safe to retry.
 */
export async function recordFollowerSnapshot(
  instagramAccountId: string,
  followersCount: number
): Promise<void> {
  const date = toUtcDay(new Date());

  await prisma.followerSnapshot.upsert({
    where: { instagramAccountId_date: { instagramAccountId, date } },
    create: { instagramAccountId, date, followersCount, backfilled: false },
    // An observed count always supersedes a backfilled estimate for the day.
    update: { followersCount, backfilled: false },
  });
}

/**
 * Turn daily net-change deltas into absolute daily totals.
 *
 * Walks backwards from a known present-day total: if the account has N
 * followers today and gained d followers today, it had N - d at the start of
 * today. Input may be in any date order; output is ascending by date.
 *
 * Stops early if the running total would go negative, which means the deltas
 * disagree with the current count (a gap in Instagram's reporting, or a count
 * fetched at a different time than the series). Better to return a short,
 * consistent history than a long, wrong one.
 */
export function reconstructFollowerTotals(
  series: FollowerCountPoint[],
  currentFollowers: number
): Array<{ date: string; followers: number }> {
  const ascending = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const out: Array<{ date: string; followers: number }> = [];

  let running = currentFollowers;
  for (let i = ascending.length - 1; i >= 0; i--) {
    const point = ascending[i];
    if (running < 0) break;
    out.push({ date: point.date, followers: running });
    running -= point.delta;
  }

  return out.reverse();
}

/**
 * Reconstruct up to 30 days of history from follower_count insight deltas and
 * store it, so a freshly connected account has a chart on day one instead of a
 * single point.
 *
 * Rows are marked `backfilled` because they are derived, and never overwrite a
 * directly observed snapshot.
 *
 * Returns the number of days written. Zero means the insight metric was
 * unavailable, which is expected for small or unsupported accounts.
 */
export async function backfillFollowerHistory(
  instagramAccountId: string,
  accessToken: string,
  instagramId: string,
  currentFollowers: number
): Promise<number> {
  let series: FollowerCountPoint[] | null;
  try {
    series = await getFollowerCountSeries(accessToken, instagramId);
  } catch {
    // PermissionError and friends — nothing to backfill from.
    return 0;
  }

  if (!series?.length) return 0;

  const totals = reconstructFollowerTotals(series, currentFollowers).map(
    (t) => ({ date: toUtcDay(t.date), followers: t.followers })
  );
  if (!totals.length) return 0;

  const existing = await prisma.followerSnapshot.findMany({
    where: {
      instagramAccountId,
      date: { in: totals.map((t) => t.date) },
      backfilled: false,
    },
    select: { date: true },
  });
  const observed = new Set(existing.map((e) => toIsoDay(e.date)));

  const writable = totals.filter((t) => !observed.has(toIsoDay(t.date)));
  if (!writable.length) return 0;

  await prisma.$transaction(
    writable.map((t) =>
      prisma.followerSnapshot.upsert({
        where: {
          instagramAccountId_date: { instagramAccountId, date: t.date },
        },
        create: {
          instagramAccountId,
          date: t.date,
          followersCount: t.followers,
          backfilled: true,
        },
        update: { followersCount: t.followers, backfilled: true },
      })
    )
  );

  return writable.length;
}

/**
 * Ensure an account has a current snapshot and, the first time we ever see it,
 * a backfilled history. Called from the analytics service so the follower
 * chart fills in without waiting for the next cron run. Pass the follower
 * count when the caller already fetched it, to save a Graph call.
 */
export async function ensureFollowerHistory(
  account: { id: string; instagramId: string },
  accessToken: string,
  knownFollowers?: number
): Promise<number | null> {
  const followers =
    knownFollowers ?? (await getUserInfo(accessToken)).followers_count;
  if (typeof followers !== "number") return null;

  await recordFollowerSnapshot(account.id, followers);

  const count = await prisma.followerSnapshot.count({
    where: { instagramAccountId: account.id },
  });
  if (count <= 1) {
    await backfillFollowerHistory(
      account.id,
      accessToken,
      account.instagramId,
      followers
    );
  }

  return followers;
}
