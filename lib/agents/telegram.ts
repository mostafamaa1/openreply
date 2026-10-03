/**
 * Telegram delivery for the agents' digest. Bot API over plain fetch; the
 * token never leaves the server and is never logged.
 */

import { getTelegramConfig } from "@/lib/agents/config";

const TELEGRAM_API = "https://api.telegram.org";
// Telegram rejects messages over 4096 characters.
const MAX_MESSAGE_LENGTH = 4096;

function requireToken(): string {
  const config = getTelegramConfig();
  if (!config) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return config.token;
}

async function callTelegram<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${TELEGRAM_API}/bot${requireToken()}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? response.status}`);
  }
  return data.result as T;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Private chats that have messaged the bot recently, newest first. Telegram
 * only keeps updates for about a day, so save the id once found.
 */
export async function findPrivateChats(): Promise<
  Array<{ id: number; name: string; username: string | null }>
> {
  const updates = await callTelegram<
    Array<{
      message?: {
        chat: { id: number; type: string; first_name?: string; username?: string };
      };
    }>
  >("getUpdates");

  const chats = new Map<number, { id: number; name: string; username: string | null }>();
  for (const update of [...updates].reverse()) {
    const chat = update.message?.chat;
    if (chat?.type === "private" && !chats.has(chat.id)) {
      chats.set(chat.id, {
        id: chat.id,
        name: chat.first_name ?? "",
        username: chat.username ?? null,
      });
    }
  }
  return [...chats.values()];
}

/**
 * The chat the digest goes to. Only TELEGRAM_CHAT_ID counts: falling back to
 * "whoever messaged the bot last" would hand the analytics to anyone who
 * finds the bot. `npm run agents -- telegram-chat` lists ids to copy in.
 */
export function resolveChatId(): string {
  const configured = getTelegramConfig()?.chatId;
  if (!configured) {
    throw new Error(
      "TELEGRAM_CHAT_ID is not set. Message the bot, run `npm run agents -- telegram-chat`, and put your chat id in .env."
    );
  }
  return configured;
}

/** Send an HTML-formatted message. Returns the Telegram message id. */
export async function sendTelegramMessage(html: string): Promise<number> {
  // Drop whole lines from the end, so the cut never splits a tag or entity
  // (Telegram rejects the whole message if the HTML does not parse).
  const lines = html.split("\n");
  while (lines.length > 1 && lines.join("\n").length > MAX_MESSAGE_LENGTH - 2) lines.pop();
  const text = lines.join("\n") + (lines.length < html.split("\n").length ? "\n…" : "");
  const message = await callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: resolveChatId(),
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  return message.message_id;
}
