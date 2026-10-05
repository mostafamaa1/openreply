/**
 * One full content-agent cycle: pull data, then run the five agents in order.
 * Each agent records its own AgentRun, so one failing agent (say, Gemini
 * rate-limited) doesn't hide what the others produced.
 */

import type { AgentKind, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getTimeZone } from "@/lib/agents/config";
import { isGeminiConfigured } from "@/lib/agents/gemini";
import { pullContentData } from "@/lib/agents/pull-data";
import { resolveCategories } from "@/lib/agents/categories";
import { getPostCategories, tagUntaggedPosts } from "@/lib/agents/categorize";
import {
  runAnalyst,
  runDmManager,
  runHookScript,
  runIdeator,
  runPlanner,
  pickWeek,
  type AgentContext,
} from "@/lib/agents/agents";
import type { AgentOutputs } from "@/lib/agents/types";

export interface CycleResult {
  outputs: Partial<AgentOutputs>;
  errors: Partial<Record<AgentKind, string>>;
  competitorSkipReason: string | null;
}

async function recordRun<K extends AgentKind>(
  workspaceId: string,
  agent: K,
  fn: () => Promise<AgentOutputs[K]> | AgentOutputs[K],
  result: CycleResult
): Promise<AgentOutputs[K] | null> {
  const run = await prisma.agentRun.create({ data: { workspaceId, agent } });
  try {
    const output = await fn();
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        output: output as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    (result.outputs as Record<string, unknown>)[agent] = output;
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
    result.errors[agent] = message;
    return null;
  }
}

export async function runContentCycle(
  workspaceId: string,
  options: { scrapeCompetitors?: boolean } = {}
): Promise<CycleResult> {
  const account = await prisma.instagramAccount.findFirst({
    where: { workspaceId },
    orderBy: { connectedAt: "desc" },
    select: { id: true },
  });
  if (!account) throw new Error("No Instagram account connected");

  const [pulled, profile] = await Promise.all([
    pullContentData(workspaceId, options),
    prisma.contentProfile.findUnique({ where: { workspaceId } }),
  ]);

  const categories = resolveCategories(profile?.categories);
  // Tag new posts first, so the Analyst and the Ideator see every topic.
  // A failure here only means fewer tagged posts this run.
  if (isGeminiConfigured()) {
    await tagUntaggedPosts(
      account.id,
      pulled.own.posts.map((p) => ({ id: p.id, caption: p.caption })),
      categories,
      profile?.niche ?? ""
    ).catch((error) =>
      console.error("[Content Agents] Tagging failed:", error instanceof Error ? error.message : error)
    );
  }
  const tags = await getPostCategories(
    account.id,
    pulled.own.posts.map((p) => p.id)
  );

  const ctx: AgentContext = {
    workspaceId,
    instagramAccountId: account.id,
    profile: {
      niche: profile?.niche ?? "",
      voice: profile?.voice ?? "",
      audience: profile?.audience ?? "",
      goals: profile?.goals ?? "",
    },
    own: pulled.own,
    competitors: pulled.competitors,
    categories,
    postCategories: new Map([...tags].map(([id, t]) => [id, t.category])),
    timeZone: getTimeZone(),
    now: new Date(),
  };

  const result: CycleResult = {
    outputs: {},
    errors: {},
    competitorSkipReason: pulled.competitorSkipReason,
  };

  const analyst = await recordRun(workspaceId, "ANALYST", () => runAnalyst(ctx), result);
  await recordRun(workspaceId, "DM_MANAGER", () => runDmManager(ctx), result);

  const needGemini = () => {
    if (!isGeminiConfigured()) throw new Error("GEMINI_API_KEY is not set");
  };
  const ideator = await recordRun(
    workspaceId,
    "IDEATOR",
    () => (needGemini(), runIdeator(ctx)),
    result
  );
  const ideas = ideator?.ideas ?? [];
  const scripts = await recordRun(
    workspaceId,
    "HOOK_SCRIPT",
    () => {
      if (ideas.length === 0) throw new Error("No ideas from the Ideator to script");
      return runHookScript(ctx, ideas, ideator?.allocation);
    },
    result
  );
  await recordRun(
    workspaceId,
    "PLANNER",
    () => {
      if (!analyst) throw new Error("Analyst failed, so there is no posting time");
      if (ideas.length === 0) throw new Error("No ideas from the Ideator to plan");
      return runPlanner(ctx, analyst, pickWeek(ideas, ideator?.allocation), scripts?.scripts ?? []);
    },
    result
  );

  return result;
}
