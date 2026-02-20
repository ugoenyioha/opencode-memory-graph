import { describe, expect, test } from "bun:test";
import { DIMENSION, embed, embedBatch, reset, status } from "./index";

function finite(vec: number[]) {
  return vec.every((n) => Number.isFinite(n));
}

function dot(a: number[], b: number[]) {
  return a.reduce((sum, n, i) => sum + n * (b[i] ?? 0), 0);
}

describe("embedding bootstrap", () => {
  test("defaults to safe disabled mode", async () => {
    reset();
    process.env.MEMORY_EMBEDDINGS = "off";
    const vec = await embed("memory graph bootstrap test");
    expect(vec).toBeNull();
    expect(status()).toBe("disabled");
    delete process.env.MEMORY_EMBEDDINGS;
  });

  test("falls back to provider chain when local model is unavailable", async () => {
    reset();
    process.env.MEMORY_EMBEDDINGS = "cloud";
    process.env.MEMORY_EMBED_PROVIDERS = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.MEMORY_EMBED_OPENAI_URL = "https://example.invalid/embeddings";

    const original = globalThis.fetch;
    const fake = (async () => {
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.11, 0.22, 0.33] }] }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;
    fake.preconnect = original.preconnect;
    globalThis.fetch = fake;

    const vec = await embed("cloud fallback probe");
    expect(vec).toEqual([0.11, 0.22, 0.33]);
    expect(status()).toBe("cloud");

    globalThis.fetch = original;
    delete process.env.MEMORY_EMBEDDINGS;
    delete process.env.MEMORY_EMBED_PROVIDERS;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MEMORY_EMBED_OPENAI_URL;
    reset();
  });

  const runLocal = process.env.RUN_LOCAL_EMBED_TEST === "1";

  test("local embedding checks are opt-in for runtime stability", async () => {
    expect(runLocal).toBe(false);
  });

  if (!runLocal) return;

  test("embeds text to expected dimension when local mode enabled", async () => {
    process.env.MEMORY_EMBEDDINGS = "local";
    const vec = await embed("memory graph bootstrap test");
    expect(vec).not.toBeNull();
    expect(vec?.length).toBe(DIMENSION);
    expect(finite(vec ?? [])).toBe(true);
  });

  test("same text remains highly similar", async () => {
    process.env.MEMORY_EMBEDDINGS = "local";
    const a = await embed("determinism probe");
    const b = await embed("determinism probe");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const score = dot(a ?? [], b ?? []);
    expect(score).toBeGreaterThan(0.999);
  });

  test("batch embedding preserves order and dimensions", async () => {
    process.env.MEMORY_EMBEDDINGS = "local";
    const out = await embedBatch(["alpha", "beta", "gamma"]);
    expect(out.length).toBe(3);
    expect(out[0]?.length).toBe(DIMENSION);
    expect(out[1]?.length).toBe(DIMENSION);
    expect(out[2]?.length).toBe(DIMENSION);
  });
});
