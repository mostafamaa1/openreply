/**
 * Content agents CLI.
 *
 *   npm run agents -- profile --niche "..." --voice "..." --audience "..." --goals "..."
 *   npm run agents -- competitors add handle1 handle2
 *   npm run agents -- competitors remove handle1
 *   npm run agents -- pull [--no-competitors]
 *   npm run agents -- run [--no-competitors]     pull, then run all five agents
 *   npm run agents -- telegram-chat              list chats that messaged the bot
 *   npm run agents -- digest                     send the digest to Telegram
 *
 * Picks the only workspace with a connected Instagram account, or the one in
 * AGENTS_WORKSPACE_ID. Profile and competitors live in the database, never in
 * committed files.
 */

import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { pullContentData } from "@/lib/agents/pull-data";
import { MAX_COMPETITORS, handleSchema } from "@/lib/agents/competitors";
import { runContentCycle } from "@/lib/agents/run";
import { sendDigest } from "@/lib/agents/digest";
import { findPrivateChats } from "@/lib/agents/telegram";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}


function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US");
}

function oneLine(text: string | null, max = 70): string {
  if (!text) return "(no caption)";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function resolveWorkspaceId(): Promise<string> {
  const fromEnv = process.env.AGENTS_WORKSPACE_ID;
  if (fromEnv) return fromEnv;

  const workspaces = await prisma.workspace.findMany({
    where: { instagramAccounts: { some: {} } },
    select: { id: true, name: true, instagramAccounts: { select: { username: true } } },
  });
  if (workspaces.length === 1) return workspaces[0].id;

  const list = workspaces
    .map((w) => `  ${w.id}  ${w.name}  (@${w.instagramAccounts.map((a) => a.username).join(", @")})`)
    .join("\n");
  throw new Error(
    workspaces.length === 0
      ? "No workspace has a connected Instagram account"
      : `Several workspaces found; set AGENTS_WORKSPACE_ID to one of:\n${list}`
  );
}

async function profile(workspaceId: string, args: string[]) {
  const data = Object.fromEntries(
    (["niche", "voice", "audience", "goals"] as const)
      .map((key) => [key, flag(args, key)])
      .filter(([, value]) => value !== undefined)
  );
  const saved = await prisma.contentProfile.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data },
    update: data,
  });
  console.log("Content profile");
  console.log(`  Niche:    ${saved.niche}`);
  console.log(`  Voice:    ${saved.voice}`);
  console.log(`  Audience: ${saved.audience}`);
  console.log(`  Goals:    ${saved.goals}`);
}

async function competitors(workspaceId: string, args: string[]) {
  const [action, ...handles] = args;
  const usernames = handles.map((h) => {
    const parsed = handleSchema.safeParse(h);
    if (!parsed.success) throw new Error(`Not a valid Instagram handle: ${h}`);
    return parsed.data;
  });

  if (action === "add") {
    const existing = await prisma.competitor.count({ where: { workspaceId } });
    const fresh = await prisma.competitor.count({
      where: { workspaceId, username: { in: usernames } },
    });
    if (existing + usernames.length - fresh > MAX_COMPETITORS) {
      throw new Error(`Up to ${MAX_COMPETITORS} competitors`);
    }
    for (const username of usernames) {
      await prisma.competitor.upsert({
        where: { workspaceId_username: { workspaceId, username } },
        create: { workspaceId, username },
        update: {},
      });
    }
  } else if (action === "remove") {
    await prisma.competitor.deleteMany({
      where: { workspaceId, username: { in: usernames } },
    });
  } else if (action !== "list" && action !== undefined) {
    throw new Error(`Unknown competitors action: ${action}`);
  }

  const all = await prisma.competitor.findMany({
    where: { workspaceId },
    orderBy: { username: "asc" },
  });
  console.log(`Competitors (${all.length}): ${all.map((c) => `@${c.username}`).join(", ")}`);
}

async function pull(workspaceId: string, args: string[]) {
  const started = Date.now();
  const result = await pullContentData(workspaceId, {
    scrapeCompetitors: !args.includes("--no-competitors"),
  });
  const { own } = result;

  console.log(`\n@${own.username}`);
  console.log(`  Followers:   ${fmt(own.followers)}`);
  console.log(`  Posts:       ${fmt(own.totals.posts)}`);
  console.log(`  Total views: ${fmt(own.totals.views)}`);
  console.log(
    `  Engagement:  ${own.engagementRate === null ? "—" : `${(own.engagementRate * 100).toFixed(2)}% of views`}`
  );
  console.log("\n  All-time top 10 by views:");
  own.posts.slice(0, 10).forEach((p, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${fmt(p.views).padStart(10)} views  ${fmt(p.likes).padStart(7)} likes  ${p.timestamp.slice(0, 10)}  ${oneLine(p.caption, 50)}`
    );
    console.log(`      ${p.permalink ?? ""}`);
  });

  console.log("\nCompetitors");
  if (result.competitorSkipReason) {
    console.log(`  Not refreshed: ${result.competitorSkipReason}`);
  }
  for (const c of result.competitors) {
    console.log(
      `\n  @${c.username}  ${fmt(c.followersCount)} followers  ${c.postCount} posts stored`
    );
    c.topPosts.forEach((p, i) => {
      console.log(
        `  ${String(i + 1).padStart(2)}. ${fmt(p.views).padStart(10)} views  ${fmt(p.likes).padStart(7)} likes  ${p.postedAt?.toISOString().slice(0, 10) ?? "          "}  ${oneLine(p.caption, 50)}`
      );
      console.log(`      ${p.url}`);
    });
  }

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

async function run(workspaceId: string, args: string[]) {
  const started = Date.now();
  const result = await runContentCycle(workspaceId, {
    scrapeCompetitors: !args.includes("--no-competitors"),
  });
  if (result.competitorSkipReason) {
    console.log(`Competitors not refreshed: ${result.competitorSkipReason}`);
  }
  for (const [agent, output] of Object.entries(result.outputs)) {
    const size = JSON.stringify(output).length;
    console.log(`  ok      ${agent.padEnd(12)} ${size} bytes of output`);
  }
  for (const [agent, error] of Object.entries(result.errors)) {
    console.log(`  failed  ${agent.padEnd(12)} ${error}`);
  }
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  if (Object.keys(result.errors).length > 0) process.exitCode = 1;
}

async function telegramChat() {
  const chats = await findPrivateChats();
  if (chats.length === 0) {
    console.log("Nobody has messaged the bot in the last day. Send it any message and retry.");
    return;
  }
  console.log("Chats that messaged the bot (put the right id in .env as TELEGRAM_CHAT_ID):");
  for (const c of chats) {
    console.log(`  ${c.id}  ${c.name}${c.username ? ` (@${c.username})` : ""}`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  // Needs no workspace, and works before any account is connected.
  if (command === "telegram-chat") return telegramChat();
  const workspaceId = await resolveWorkspaceId();

  if (command === "profile") await profile(workspaceId, args);
  else if (command === "competitors") await competitors(workspaceId, args);
  else if (command === "pull") await pull(workspaceId, args);
  else if (command === "run") await run(workspaceId, args);
  else if (command === "digest") {
    const messageId = await sendDigest(workspaceId);
    console.log(`Digest sent to Telegram (message ${messageId})`);
  } else {
    throw new Error("Usage: agents <profile|competitors|pull|run|telegram-chat|digest> ...");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
