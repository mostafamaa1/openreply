/**
 * The weekly Telegram digest: headline stats, the top idea with its hook, and
 * the week's posting plan, built from the agents' latest successful runs.
 */

import type { AgentKind } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { getBaseUrl } from "@/lib/env";
import { escapeHtml, sendTelegramMessage } from "@/lib/agents/telegram";
import type { AgentOutputs } from "@/lib/agents/types";

function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function oneLine(text: string | null | undefined, max = 80): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function latestOutput<K extends AgentKind>(
  workspaceId: string,
  agent: K,
  since?: Date
): Promise<AgentOutputs[K] | null> {
  const run = await prisma.agentRun.findFirst({
    where: {
      workspaceId,
      agent,
      status: "SUCCEEDED",
      ...(since ? { startedAt: { gte: since } } : {}),
    },
    orderBy: { startedAt: "desc" },
  });
  return (run?.output ?? null) as AgentOutputs[K] | null;
}

/**
 * `since`: only use agent output from runs started at or after it, so a
 * failed agent this week leaves its section out instead of repeating last
 * week's.
 */
export async function buildDigest(workspaceId: string, since?: Date): Promise<string> {
  const [analyst, ideator, scripts, planner, dms] = await Promise.all([
    latestOutput(workspaceId, "ANALYST", since),
    latestOutput(workspaceId, "IDEATOR", since),
    latestOutput(workspaceId, "HOOK_SCRIPT", since),
    latestOutput(workspaceId, "PLANNER", since),
    latestOutput(workspaceId, "DM_MANAGER", since),
  ]);
  if (!analyst) throw new Error("No Analyst output yet; run the agents first");

  const lines: string[] = [];
  lines.push(`<b>📊 Weekly digest · @${escapeHtml(analyst.username)}</b>`, "");

  const followerChange =
    analyst.followerChange30d !== null
      ? ` (${analyst.followerChange30d >= 0 ? "+" : ""}${compact(analyst.followerChange30d)} in 30d)`
      : "";
  lines.push(`👥 Followers: <b>${compact(analyst.followers)}</b>${followerChange}`);

  const { last30, prev30 } = analyst;
  const viewChange =
    last30.avgViews !== null && prev30.avgViews
      ? ` (${last30.avgViews >= prev30.avgViews ? "+" : ""}${(((last30.avgViews - prev30.avgViews) / prev30.avgViews) * 100).toFixed(0)}% vs prior 30d)`
      : "";
  lines.push(`👀 Avg views, last 30d: <b>${compact(last30.avgViews)}</b>${viewChange}`);
  if (analyst.engagementRate !== null) {
    lines.push(`💬 Engagement: <b>${(analyst.engagementRate * 100).toFixed(2)}%</b>`);
  }

  const top = analyst.topPosts[0];
  if (top) {
    const label = escapeHtml(oneLine(top.caption, 60) || "Top post");
    lines.push(
      `🏆 All-time top: ${top.url ? `<a href="${escapeHtml(top.url)}">${label}</a>` : label} · ${compact(top.views)} views`
    );
  }
  if (dms) {
    lines.push(
      `✉️ DMs, 7d: ${compact(dms.sent)} sent · ${compact(dms.clicks)} clicks${dms.failed ? ` · ${dms.failed} failed` : ""}`
    );
  }

  const idea = ideator?.ideas[0];
  if (idea) {
    const script = scripts?.scripts.find((s) => s.ideaTitle === idea.title);
    lines.push("", `<b>💡 Top idea: ${escapeHtml(idea.title)}</b>`, escapeHtml(oneLine(idea.angle, 220)));
    if (script?.hooks[0]) lines.push(`Hook: “${escapeHtml(script.hooks[0])}”`);
    lines.push(`<i>Why: ${escapeHtml(oneLine(idea.why, 200))}</i>`);
  }

  if (planner && planner.days.length > 0) {
    lines.push("", `<b>🗓 This week (${escapeHtml(planner.timeZone)})</b>`);
    for (const day of planner.days) {
      lines.push(`${day.weekday.slice(0, 3)} ${day.time} · ${escapeHtml(oneLine(day.title, 60))}`);
    }
  }

  if (analyst.notes.length > 0) {
    lines.push("", "<b>📈 Analyst</b>");
    for (const note of analyst.notes.slice(0, 3)) lines.push(`• ${escapeHtml(note)}`);
  }

  lines.push("", `<a href="${escapeHtml(getBaseUrl())}/agents">Open the Agents dashboard</a>`);
  return lines.join("\n");
}

export async function sendDigest(workspaceId: string, since?: Date): Promise<number> {
  return sendTelegramMessage(await buildDigest(workspaceId, since));
}
