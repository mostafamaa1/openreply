// Value: protects=Gemini model fallback: 5xx/timeout skip to next, 404 retired, 4xx fails fast, last good model first; fails_when=a 503 aborts the run or a 400 is retried on every model; why_new=gemini.ts untested; seam=none
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ok = (payload: unknown) =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
    { status: 200 }
  );
const status = (code: number) => new Response("err", { status: code });
const modelOf = (url: string) => url.split("/models/")[1].split(":")[0];

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  return import("@/lib/agents/gemini");
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "m1");
  vi.stubEnv("GEMINI_FALLBACK_MODELS", "m2,m3");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("generateJson", () => {
  it("moves to the next model on 503 and on a dropped connection", async () => {
    const { generateJson } = await load();
    fetchMock
      .mockResolvedValueOnce(status(503))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok({ a: 1 }));

    await expect(generateJson("p", {})).resolves.toEqual({ a: 1 });
    expect(fetchMock.mock.calls.map((c) => modelOf(c[0]))).toEqual(["m1", "m2", "m3"]);
  });

  it("tries the model that last worked first", async () => {
    const { generateJson } = await load();
    fetchMock.mockResolvedValueOnce(status(429)).mockResolvedValueOnce(ok({ a: 1 }));
    await generateJson("p", {});

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(ok({ b: 2 }));
    await expect(generateJson("p", {})).resolves.toEqual({ b: 2 });
    expect(modelOf(fetchMock.mock.calls[0][0])).toBe("m2");
  });

  it("throws at once on a 400 instead of trying other models", async () => {
    const { generateJson } = await load();
    fetchMock.mockResolvedValueOnce(status(400));
    await expect(generateJson("p", {})).rejects.toThrow(/Gemini 400 \(m1\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 404 model on the second pass, and fails when all are down", async () => {
    vi.useFakeTimers();
    const { generateJson } = await load();
    fetchMock.mockImplementation(async (url: string) =>
      modelOf(url) === "m1" ? status(404) : status(503)
    );

    const result = generateJson("p", {}).catch((e: Error) => e);
    await vi.runAllTimersAsync();
    const error = await result;

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Gemini unavailable/);
    expect(fetchMock.mock.calls.map((c) => modelOf(c[0]))).toEqual([
      "m1",
      "m2",
      "m3",
      "m2",
      "m3",
    ]);
  });

  it("refuses to run without an API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { generateJson } = await load();
    await expect(generateJson("p", {})).rejects.toThrow(/GEMINI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
