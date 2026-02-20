import { describe, expect, test } from "bun:test";
import { DIMENSION, embed, embedBatch, status } from "./index";

function finite(vec: number[]) {
  return vec.every((n) => Number.isFinite(n));
}

function dot(a: number[], b: number[]) {
  return a.reduce((sum, n, i) => sum + n * (b[i] ?? 0), 0);
}

describe("embedding bootstrap", () => {
  test("defaults to safe disabled mode", async () => {
    const vec = await embed("memory graph bootstrap test");
    expect(vec).toBeNull();
    expect(status()).toBe("disabled");
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
