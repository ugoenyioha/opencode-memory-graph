import { afterEach, describe, expect, test } from "bun:test";
import { rerank, rerankMode, rerankTopK, type RerankCandidate } from "./rerank";

function candidates(n: number): RerankCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    uuid: `uuid-${i}`,
    name: `entity-${i}`,
    summary: `summary for entity ${i}`,
    score: 1 - i * 0.1,
  }));
}

describe("rerank", () => {
  afterEach(() => {
    delete process.env.MEMORY_RERANKER;
    delete process.env.MEMORY_RERANKER_MODEL;
    delete process.env.MEMORY_RERANKER_TOP_K;
    delete process.env.COHERE_API_KEY;
    delete process.env.VOYAGE_API_KEY;
  });

  test("off mode returns candidates with rerank_score = original score", async () => {
    process.env.MEMORY_RERANKER = "off";
    const input = candidates(5);
    const result = await rerank("test query", input);

    expect(result).toHaveLength(5);
    for (let i = 0; i < result.length; i++) {
      expect(result[i].uuid).toBe(input[i].uuid);
      expect(result[i].rerank_score).toBe(input[i].score);
    }
  });

  test("default mode is off", () => {
    expect(rerankMode()).toBe("off");
  });

  test("mode reads from env", () => {
    process.env.MEMORY_RERANKER = "cohere";
    expect(rerankMode()).toBe("cohere");

    process.env.MEMORY_RERANKER = "voyage";
    expect(rerankMode()).toBe("voyage");

    process.env.MEMORY_RERANKER = "invalid";
    expect(rerankMode()).toBe("off");
  });

  test("topK defaults to 20", () => {
    expect(rerankTopK()).toBe(20);
  });

  test("topK reads from env", () => {
    process.env.MEMORY_RERANKER_TOP_K = "10";
    expect(rerankTopK()).toBe(10);
  });

  test("empty candidates returns empty", async () => {
    process.env.MEMORY_RERANKER = "cohere";
    const result = await rerank("test", []);
    expect(result).toHaveLength(0);
  });

  test("cohere mode without API key falls back to passthrough", async () => {
    process.env.MEMORY_RERANKER = "cohere";
    // No COHERE_API_KEY set
    const input = candidates(3);
    const result = await rerank("test query", input);

    expect(result).toHaveLength(3);
    // Should preserve order (passthrough)
    expect(result[0].uuid).toBe("uuid-0");
    expect(result[0].rerank_score).toBe(input[0].score);
  });

  test("voyage mode without API key falls back to passthrough", async () => {
    process.env.MEMORY_RERANKER = "voyage";
    // No VOYAGE_API_KEY set
    const input = candidates(3);
    const result = await rerank("test query", input);

    expect(result).toHaveLength(3);
    expect(result[0].uuid).toBe("uuid-0");
    expect(result[0].rerank_score).toBe(input[0].score);
  });

  test("candidates beyond topK are appended as passthrough", async () => {
    process.env.MEMORY_RERANKER = "cohere";
    process.env.MEMORY_RERANKER_TOP_K = "3";
    // No API key, so everything is passthrough
    const input = candidates(5);
    const result = await rerank("test query", input);

    expect(result).toHaveLength(5);
    // All should have rerank_score = original score (passthrough)
    for (let i = 0; i < 5; i++) {
      expect(result[i].rerank_score).toBe(input[i].score);
    }
  });
});
