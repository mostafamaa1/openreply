/**
 * Content agents: shared definitions and env access.
 *
 * The five agents run weekly in the worker (Apify for competitor posts, Gemini
 * for writing, Telegram for the digest). The keys are read by the worker;
 * AGENTS_TIMEZONE is also read by the web app for analytics day buckets.
 */

import type { AgentKind } from "@/app/generated/prisma/client";

export const AGENTS: ReadonlyArray<{
  kind: AgentKind;
  label: string;
  description: string;
}> = [
  {
    kind: "IDEATOR",
    label: "Ideator",
    description: "Scouts ideas from your top posts and your competitors' winners.",
  },
  {
    kind: "HOOK_SCRIPT",
    label: "Hook & Script",
    description: "Turns the best ideas into hooks and short scripts in your voice.",
  },
  {
    kind: "PLANNER",
    label: "Planner",
    description: "Lays the scripts out as a daily posting calendar.",
  },
  {
    kind: "ANALYST",
    label: "Analyst",
    description: "Reads your stats and says what is working and what is not.",
  },
  {
    kind: "DM_MANAGER",
    label: "DM Manager",
    description: "Summarises DM and campaign activity and flags what needs you.",
  },
];

/** Cap on posts fetched per competitor per run, to stay inside Apify's free $5. */
export function getCompetitorPostLimit(): number {
  return Number(process.env.APIFY_COMPETITOR_POST_LIMIT ?? 30);
}

export function getApifyToken(): string | null {
  return process.env.APIFY_TOKEN || null;
}

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}

/** Preferred model first, then free fallbacks for when it is overloaded. */
export function getGeminiModels(): string[] {
  const preferred = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  const fallbacks = (
    process.env.GEMINI_FALLBACK_MODELS ??
    "gemini-3.7-flash,gemini-3.6-flash,gemini-flash-latest,gemini-3.5-flash-lite"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([preferred, ...fallbacks])];
}

/** IANA zone for posting times and calendar dates, e.g. "Africa/Cairo". */
export function getTimeZone(): string {
  return process.env.AGENTS_TIMEZONE ?? "UTC";
}

export function getTelegramConfig(): { token: string; chatId: string | null } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return { token, chatId: process.env.TELEGRAM_CHAT_ID || null };
}
