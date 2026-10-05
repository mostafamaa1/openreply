import { NextResponse } from "next/server";
import type { AgentKind, AgentRunStatus } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { AGENTS } from "@/lib/agents/config";
import type { AgentOutputs } from "@/lib/agents/types";
import {
  getCycleState,
  getNextScheduledRun,
  type CycleState,
} from "@/lib/queue/content-agents";
import { withRedisTimeout } from "@/lib/utils/redis-timeout";

export interface AgentState<K extends AgentKind = AgentKind> {
  kind: K;
  /** Status of the most recent run, whatever its outcome. */
  lastStatus: AgentRunStatus | null;
  lastRunAt: string | null;
  lastError: string | null;
  /** Output of the most recent successful run. */
  output: AgentOutputs[K] | null;
  outputAt: string | null;
  runCount: number;
}

export interface AgentsResponse {
  agents: { [K in AgentKind]: AgentState<K> };
  competitors: Array<{
    username: string;
    followersCount: number | null;
    lastScrapedAt: string | null;
    postCount: number;
  }>;
  hasProfile: boolean;
  /** Whether a cycle is queued or running in the worker right now. */
  cycleState: CycleState;
  /** Next weekly run, from the BullMQ scheduler. */
  nextRunAt: string | null;
}

export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const [agentStates, competitors, profile, cycleState, nextRunAt] = await Promise.all([
    Promise.all(
      AGENTS.map(async ({ kind }) => {
        const [latest, latestOk, runCount] = await Promise.all([
          prisma.agentRun.findFirst({
            where: { workspaceId, agent: kind },
            orderBy: { startedAt: "desc" },
          }),
          prisma.agentRun.findFirst({
            where: { workspaceId, agent: kind, status: "SUCCEEDED" },
            orderBy: { startedAt: "desc" },
          }),
          prisma.agentRun.count({ where: { workspaceId, agent: kind } }),
        ]);
        const state: AgentState = {
          kind,
          lastStatus: latest?.status ?? null,
          lastRunAt: latest?.startedAt.toISOString() ?? null,
          lastError: latest?.status === "FAILED" ? latest.error : null,
          output: (latestOk?.output ?? null) as AgentState["output"],
          outputAt: latestOk?.finishedAt?.toISOString() ?? null,
          runCount,
        };
        return state;
      })
    ),
    prisma.competitor.findMany({
      where: { workspaceId },
      orderBy: { username: "asc" },
      include: { _count: { select: { posts: true } } },
    }),
    prisma.contentProfile.findUnique({ where: { workspaceId } }),
    // Redis being down or slow must not take the page with it.
    withRedisTimeout<CycleState>(getCycleState(workspaceId), "idle").catch(
      (): CycleState => "idle"
    ),
    withRedisTimeout(getNextScheduledRun(), null).catch(() => null),
  ]);

  const data: AgentsResponse = {
    agents: Object.fromEntries(
      agentStates.map((s) => [s.kind, s])
    ) as AgentsResponse["agents"],
    competitors: competitors.map((c) => ({
      username: c.username,
      followersCount: c.followersCount,
      lastScrapedAt: c.lastScrapedAt?.toISOString() ?? null,
      postCount: c._count.posts,
    })),
    hasProfile: Boolean(profile?.niche),
    cycleState,
    nextRunAt,
  };

  return NextResponse.json({ success: true, data });
}
