// Value: protects=the digest only goes to TELEGRAM_CHAT_ID, never to whoever last messaged the bot; fails_when=a getUpdates fallback comes back; why_new=the cycle-1 security fix had no test; seam=none
import { beforeEach, describe, expect, it, vi } from "vitest";

const { config } = vi.hoisted(() => ({
  config: { value: null as { token: string; chatId?: string } | null },
}));

vi.mock("@/lib/agents/config", () => ({ getTelegramConfig: () => config.value }));

import { resolveChatId, sendTelegramMessage } from "@/lib/agents/telegram";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("resolveChatId", () => {
  it("refuses to guess a chat when TELEGRAM_CHAT_ID is missing", async () => {
    config.value = { token: "t" };
    expect(() => resolveChatId()).toThrow(/TELEGRAM_CHAT_ID/);
    await expect(sendTelegramMessage("hi")).rejects.toThrow(/TELEGRAM_CHAT_ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends to the configured chat", async () => {
    config.value = { token: "t", chatId: "42" };
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 7 } }),
    });
    expect(await sendTelegramMessage("hi")).toBe(7);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.chat_id).toBe("42");
  });
});
