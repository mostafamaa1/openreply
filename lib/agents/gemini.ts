/**
 * Minimal Gemini client for the content agents: one prompt in, JSON out.
 *
 * Uses structured output (responseSchema) so agents get parseable JSON rather
 * than prose. Free-tier models are often overloaded (503) and sometimes hang
 * for minutes before failing, so every attempt has a time limit, a failing
 * model is skipped rather than waited on, and the model that last worked is
 * tried first next time.
 */

import { getGeminiApiKey, getGeminiModels } from "@/lib/agents/config";

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
const ATTEMPT_TIMEOUT_MS = 90_000;
// One quick pass over every model, then one more after a pause.
const PASSES = 2;
const PAUSE_BETWEEN_PASSES_MS = 20_000;

let lastGoodModel: string | null = null;

export function isGeminiConfigured(): boolean {
  return getGeminiApiKey() !== null;
}

function modelOrder(): string[] {
  const models = getGeminiModels();
  return lastGoodModel && models.includes(lastGoodModel)
    ? [lastGoodModel, ...models.filter((m) => m !== lastGoodModel)]
    : models;
}

export async function generateJson<T>(
  prompt: string,
  responseSchema: Record<string, unknown>
): Promise<T> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.9,
    },
  });

  const failures: string[] = [];
  const retired = new Set<string>();

  for (let pass = 0; pass < PASSES; pass++) {
    if (pass > 0) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_PASSES_MS));

    for (const model of modelOrder()) {
      if (retired.has(model)) continue;

      let response: Response;
      try {
        response = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        });
      } catch (error) {
        // Timeout or dropped connection: try the next model.
        const reason =
          error instanceof Error && error.name === "TimeoutError"
            ? `no answer in ${ATTEMPT_TIMEOUT_MS / 1000}s`
            : error instanceof Error
              ? error.message
              : String(error);
        failures.push(`${model}: ${reason}`);
        continue;
      }

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("");
        if (!text) {
          failures.push(`${model}: empty answer`);
          continue;
        }
        lastGoodModel = model;
        return JSON.parse(text) as T;
      }

      const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 160);
      failures.push(`${model}: ${response.status}`);
      // A retired model (404) won't come back.
      if (response.status === 404) {
        retired.add(model);
        continue;
      }
      // Overloaded (5xx) or rate limited (429): try the next model. Anything
      // else (bad key, bad request) fails the same way everywhere.
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Gemini ${response.status} (${model}): ${detail}`);
      }
    }
  }

  throw new Error(`Gemini unavailable: ${failures.slice(-4).join("; ")}`);
}
