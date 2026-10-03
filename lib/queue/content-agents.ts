/**
 * Content agents queue: the weekly cycle and "Run now".
 *
 * A BullMQ job scheduler fires the weekly run: AGENTS_CRON (default Saturday
 * 20:00) read in AGENTS_TIMEZONE (default UTC). The schedule lives in Redis, so a worker restart neither skips nor
 * repeats a run, and nothing polls the database waiting for the time.
 */

import { Queue, Worker, type Job } from "bullmq";
import { getRedisConnection } from "./client";
import { prisma } from "@/lib/db/client";
import { getTelegramConfig, getTimeZone } from "@/lib/agents/config";
import { runContentCycle } from "@/lib/agents/run";
import { sendDigest } from "@/lib/agents/digest";
import { sendTelegramMessage, escapeHtml } from "@/lib/agents/telegram";
import { withRedisTimeout } from "@/lib/utils/redis-timeout";

const QUEUE_NAME = "content-agents";
const JOB_NAME = "content-cycle";
const SCHEDULER_ID = "weekly-content-cycle";

export interface ContentCycleJob {
  /** One workspace (Run now), or every workspace with a profile (schedule). */
  workspaceId?: string;
  trigger: "schedule" | "manual";
}

/** Cron pattern for the weekly run, read in AGENTS_TIMEZONE. */
export function getAgentsCron(): string {
  return process.env.AGENTS_CRON ?? "0 20 * * 6";
}

let queue: Queue<ContentCycleJob> | null = null;

export function getContentAgentsQueue(): Queue<ContentCycleJob> {
  if (!queue) {
    queue = new Queue<ContentCycleJob>(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        // No retries: a rerun pays Apify again, and each agent already records
        // its own failure for the page and the digest to show.
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return queue;
}

/** Create or update the weekly schedule. Safe to call on every boot. */
export async function scheduleContentAgents(): Promise<void> {
  await getContentAgentsQueue().upsertJobScheduler(
    SCHEDULER_ID,
    { pattern: getAgentsCron(), tz: getTimeZone() },
    { name: JOB_NAME, data: { trigger: "schedule" } }
  );
}

// A run spends Apify credit and Gemini quota; manual runs are spaced out.
export const RUN_NOW_COOLDOWN_SECONDS = 6 * 60 * 60;

/** Thrown when Redis is too slow to confirm the cooldown or queue the run. */
export class QueueUnavailableError extends Error {
  constructor() {
    super("The job queue is not responding");
  }
}

/**
 * Queue a run for one workspace. A run already queued or running is reused,
 * and a workspace gets one manual run per cooldown window. Returns the
 * seconds left on the cooldown when refused. Fails closed: if Redis cannot
 * confirm the cooldown, nothing is queued.
 */
export async function requestContentCycle(
  workspaceId: string
): Promise<{ queued: true } | { queued: false; retryAfterSeconds: number }> {
  const redis = getRedisConnection();
  const cooldownKey = `agents:run-now:${workspaceId}`;
  const setCooldown = redis.set(cooldownKey, "1", "EX", RUN_NOW_COOLDOWN_SECONDS, "NX");
  const acquired = await withRedisTimeout<"OK" | null | "TIMEOUT">(setCooldown, "TIMEOUT");
  if (acquired === "TIMEOUT") {
    // The SET can still land once Redis recovers. Nothing was queued, so
    // remove the key it took rather than lock the workspace out for 6 hours.
    setCooldown
      .then((result) => (result === "OK" ? redis.del(cooldownKey) : undefined))
      .catch(() => undefined);
    throw new QueueUnavailableError();
  }
  if (acquired !== "OK") {
    const ttl = await withRedisTimeout(redis.ttl(cooldownKey), RUN_NOW_COOLDOWN_SECONDS);
    return { queued: false, retryAfterSeconds: Math.max(1, ttl) };
  }
  let added: boolean;
  try {
    added = await withRedisTimeout(
      getContentAgentsQueue()
        .add(
          JOB_NAME,
          { workspaceId, trigger: "manual" },
          { deduplication: { id: `manual-${workspaceId}` } }
        )
        .then(() => true),
      false
    );
  } catch (error) {
    // Nothing was queued, so do not hold the cooldown against the next click.
    await withRedisTimeout(redis.del(cooldownKey), 0);
    throw error;
  }
  // On a timeout the job may still land; the cooldown stays so it cannot double up.
  if (!added) throw new QueueUnavailableError();
  return { queued: true };
}

/**
 * The one workspace whose digest goes to TELEGRAM_CHAT_ID: AGENTS_WORKSPACE_ID
 * when set, otherwise the only workspace with a content profile. With several
 * and no pin, no digest is sent rather than mixing workspaces in one chat.
 */
async function telegramWorkspaceId(): Promise<string | null> {
  if (process.env.AGENTS_WORKSPACE_ID) return process.env.AGENTS_WORKSPACE_ID;
  const profiles = await prisma.contentProfile.findMany({
    where: { niche: { not: "" } },
    select: { workspaceId: true },
    take: 2,
  });
  return profiles.length === 1 ? profiles[0].workspaceId : null;
}

/**
 * Runs left RUNNING by a worker that stopped mid-cycle can never finish;
 * mark them failed so the Agents page does not show them working forever.
 * Called once at worker boot, before the content worker starts taking jobs.
 */
export async function failInterruptedRuns(): Promise<number> {
  const { count } = await prisma.agentRun.updateMany({
    where: { status: "RUNNING" },
    data: {
      status: "FAILED",
      error: "Interrupted: the worker restarted during this run",
      finishedAt: new Date(),
    },
  });
  return count;
}

export type CycleState = "idle" | "queued" | "running";

/** When the weekly scheduler fires next, or null if it is not registered. */
export async function getNextScheduledRun(): Promise<string | null> {
  const scheduler = await getContentAgentsQueue().getJobScheduler(SCHEDULER_ID);
  return scheduler?.next ? new Date(scheduler.next).toISOString() : null;
}

/** Whether a cycle covering this workspace is waiting or in progress. */
export async function getCycleState(workspaceId: string): Promise<CycleState> {
  const q = getContentAgentsQueue();
  const covers = (job: Job<ContentCycleJob>) =>
    !job.data.workspaceId || job.data.workspaceId === workspaceId;

  const active = await q.getJobs(["active"], 0, 10);
  if (active.some(covers)) return "running";
  const waiting = await q.getJobs(["waiting", "prioritized"], 0, 10);
  return waiting.some(covers) ? "queued" : "idle";
}

async function processCycle(job: Job<ContentCycleJob>): Promise<void> {
  const workspaceIds = job.data.workspaceId
    ? [job.data.workspaceId]
    : (
        await prisma.contentProfile.findMany({
          where: {
            niche: { not: "" },
            workspace: { instagramAccounts: { some: {} } },
          },
          select: { workspaceId: true },
        })
      ).map((p) => p.workspaceId);

  const digestWorkspace = getTelegramConfig() ? await telegramWorkspaceId() : null;

  for (const workspaceId of workspaceIds) {
    const started = Date.now();
    const sendsDigest = digestWorkspace === workspaceId;
    try {
      const result = await runContentCycle(workspaceId);
      const failed = Object.entries(result.errors);
      console.log(
        `[Content Agents] ${workspaceId}: ${Object.keys(result.outputs).length} ok, ${failed.length} failed in ${Math.round((Date.now() - started) / 1000)}s`
      );

      if (sendsDigest) {
        // A failed Analyst leaves no digest to build; still report which agents failed.
        await sendDigest(workspaceId, new Date(started)).catch((error: unknown) => {
          console.error(
            `[Content Agents] ${workspaceId} digest not sent:`,
            error instanceof Error ? error.message : error
          );
        });
        if (failed.length > 0) {
          // Caught here, not by the outer catch: the cycle itself completed,
          // so a Telegram hiccup must not trigger the "run failed" message.
          await sendTelegramMessage(
            `⚠️ Some agents failed this run:\n${failed
              .map(([agent, error]) => `• ${agent}: ${escapeHtml(error.slice(0, 200))}`)
              .join("\n")}`
          ).catch((error: unknown) => {
            console.error(
              `[Content Agents] ${workspaceId} failed-agents notice not sent:`,
              error instanceof Error ? error.message : error
            );
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Content Agents] ${workspaceId} failed:`, message);
      if (sendsDigest) {
        await sendTelegramMessage(
          `⚠️ The weekly content run failed: ${escapeHtml(message.slice(0, 300))}`
        ).catch(() => undefined);
      }
    }
  }
}

export function createContentAgentsWorker(): Worker<ContentCycleJob> {
  const worker = new Worker<ContentCycleJob>(QUEUE_NAME, processCycle, {
    connection: getRedisConnection(),
    // One cycle at a time keeps Apify and Gemini usage predictable.
    concurrency: 1,
    // A cycle runs for minutes; if the worker is killed mid-run, do not
    // replay it (that would pay Apify again and send a second digest).
    maxStalledCount: 0,
    // The caller starts it with run() once failInterruptedRuns() is done, so
    // the boot sweep cannot mark a fresh run as interrupted.
    autorun: false,
  });
  worker.on("error", (err) => {
    console.error("[Content Agents] Worker error:", err.message);
  });
  return worker;
}
