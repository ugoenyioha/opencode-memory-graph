// Cross-encoder reranking
//
// Provides a second-stage reranker that scores (query, document) pairs jointly.
// Supports three modes:
//   - "off" (default): no-op passthrough
//   - "cohere": uses Cohere Rerank API
//   - "voyage": uses Voyage Rerank API
//
// The cross-encoder runs on the top-K candidates from the bi-encoder stage
// and returns refined scores before MMR diversity re-ranking.

export type RerankCandidate = {
  uuid: string;
  name: string;
  summary: string;
  score: number;
};

export type RerankResult = RerankCandidate & { rerank_score: number };

type RerankMode = "off" | "cohere" | "voyage";

function mode(): RerankMode {
  const value = (process.env.MEMORY_RERANKER ?? "off").trim().toLowerCase();
  if (value === "cohere") return "cohere";
  if (value === "voyage") return "voyage";
  return "off";
}

function topK(): number {
  const value = Number(process.env.MEMORY_RERANKER_TOP_K ?? "20");
  if (!Number.isFinite(value) || value < 1) return 20;
  return Math.floor(value);
}

async function cohereRerank(
  query: string,
  candidates: RerankCandidate[],
): Promise<RerankResult[]> {
  const key = process.env.COHERE_API_KEY;
  if (!key) return passthrough(candidates);

  const model = process.env.MEMORY_RERANKER_MODEL ?? "rerank-v3.5";
  const documents = candidates.map((c) => `${c.name}: ${c.summary}`);

  const res = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      query,
      documents,
      top_n: candidates.length,
      return_documents: false,
    }),
  });

  if (!res.ok) {
    console.warn(`[memory] cohere rerank failed: HTTP ${res.status}`);
    return passthrough(candidates);
  }

  const json = (await res.json()) as {
    results?: Array<{ index: number; relevance_score: number }>;
  };

  const results = json.results ?? [];
  const scored = candidates.map((c, i) => {
    const match = results.find((r) => r.index === i);
    return {
      ...c,
      rerank_score: match?.relevance_score ?? 0,
    };
  });

  return scored.sort((a, b) => b.rerank_score - a.rerank_score);
}

async function voyageRerank(
  query: string,
  candidates: RerankCandidate[],
): Promise<RerankResult[]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) return passthrough(candidates);

  const model = process.env.MEMORY_RERANKER_MODEL ?? "rerank-2";
  const documents = candidates.map((c) => `${c.name}: ${c.summary}`);

  const res = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      query,
      documents,
      top_k: candidates.length,
      return_documents: false,
    }),
  });

  if (!res.ok) {
    console.warn(`[memory] voyage rerank failed: HTTP ${res.status}`);
    return passthrough(candidates);
  }

  const json = (await res.json()) as {
    data?: Array<{ index: number; relevance_score: number }>;
  };

  const results = json.data ?? [];
  const scored = candidates.map((c, i) => {
    const match = results.find((r) => r.index === i);
    return {
      ...c,
      rerank_score: match?.relevance_score ?? 0,
    };
  });

  return scored.sort((a, b) => b.rerank_score - a.rerank_score);
}

function passthrough(candidates: RerankCandidate[]): RerankResult[] {
  return candidates.map((c) => ({ ...c, rerank_score: c.score }));
}

/**
 * Rerank candidates using a cross-encoder model.
 *
 * When mode is "off" or no API key is set, returns candidates unchanged
 * (with rerank_score = original score).
 *
 * Takes 2x the desired limit as input, returns all candidates re-sorted
 * by cross-encoder relevance. The caller then applies MMR on the result.
 */
export async function rerank(
  query: string,
  candidates: RerankCandidate[],
): Promise<RerankResult[]> {
  const current = mode();
  if (current === "off" || candidates.length === 0) {
    return passthrough(candidates);
  }

  // Take top-K for reranking (don't send the entire list to the API)
  const k = topK();
  const top = candidates.slice(0, k);
  const rest = candidates.slice(k);

  let reranked: RerankResult[];
  try {
    reranked =
      current === "cohere"
        ? await cohereRerank(query, top)
        : await voyageRerank(query, top);
  } catch (err) {
    console.warn(`[memory] rerank error: ${err}`);
    reranked = passthrough(top);
  }

  // Append the un-reranked tail with their original scores
  return [...reranked, ...passthrough(rest)];
}

export { mode as rerankMode, topK as rerankTopK };
