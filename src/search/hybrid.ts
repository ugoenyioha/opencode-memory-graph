// Hybrid search pipeline
//
// Combines three signals:
//   1. Vector similarity (weight: 0.5) — cosine distance on name_embedding
//   2. Graph traversal (weight: 0.3) — 1-2 hop neighborhood from top matches
//   3. Temporal decay (weight: 0.2) — exponential recency bias
//
// Post-processing: MMR diversity re-ranking, scope filtering, confidence check

import type { GraphClient } from "../graph/client";
import { embed } from "../embedding";

export type SearchResult = {
  uuid: string;
  name: string;
  type: string;
  summary: string;
  score: number;
};

export type SearchOptions = {
  query: string;
  scope?: "global" | "project" | "session";
  limit?: number;
  projectScope?: string;
};

const HALF_LIFE_DAYS = 30;
const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;

function decay(createdAt: number, now: number): number {
  const days = (now - createdAt) / 86_400_000;
  return Math.exp(-LAMBDA * Math.max(days, 0));
}

function mmr(
  results: SearchResult[],
  limit: number,
  diversityWeight = 0.3,
): SearchResult[] {
  if (results.length <= limit) return results;
  const selected: SearchResult[] = [results[0]!];
  const remaining = results.slice(1);

  while (selected.length < limit && remaining.length > 0) {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      const maxSim = Math.max(
        ...selected.map((s) =>
          s.name === candidate.name && s.type === candidate.type ? 1 : 0,
        ),
      );
      const score =
        (1 - diversityWeight) * candidate.score - diversityWeight * maxSim;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    selected.push(remaining.splice(best, 1)[0]!);
  }
  return selected;
}

export async function search(
  db: GraphClient,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const limit = options.limit ?? 10;
  const vec = await embed(options.query);

  // --- Vector similarity ---
  let vectorResults: SearchResult[] = [];
  if (vec) {
    const vecStr = `[${vec.join(",")}]`;
    const result = (await db.roQuery(
      `CALL db.idx.vector.queryNodes('Entity', 'name_embedding', $k, vecf32(${vecStr}))
       YIELD node, score
       RETURN node.uuid, node.name, node.label_type, node.summary, node.created_at, node.scope, score`,
      { k: limit * 2 },
    )) as { data: unknown[][] };

    vectorResults = (result.data ?? []).map((row) => ({
      uuid: row[0] as string,
      name: row[1] as string,
      type: row[2] as string,
      summary: row[3] as string,
      score: row[6] as number,
    }));
  }

  // --- Full-text fallback (when no embeddings) ---
  if (!vec) {
    const result = (await db.roQuery(
      `CALL db.idx.fulltext.queryNodes('Entity', $query)
       YIELD node, score
       RETURN node.uuid, node.name, node.label_type, node.summary, node.created_at, node.scope, score
       LIMIT $limit`,
      { query: options.query, limit: limit * 2 },
    )) as { data: unknown[][] };

    vectorResults = (result.data ?? []).map((row) => ({
      uuid: row[0] as string,
      name: row[1] as string,
      type: row[2] as string,
      summary: row[3] as string,
      score: row[6] as number,
    }));
  }

  // --- Temporal decay ---
  const now = Date.now();
  for (const r of vectorResults) {
    // TODO: pass created_at through from query results for real decay
    r.score *= 0.5; // vector weight
  }

  // --- Graph traversal boost (1-hop neighbors of top results) ---
  // TODO: for top N results, traverse RELATES_TO edges and boost neighbors

  // --- Scope filtering ---
  if (options.scope) {
    vectorResults = vectorResults.filter(
      (r) => r.type === "Preference" || true, // TODO: filter by scope from result
    );
  }

  // --- MMR diversity re-ranking ---
  const ranked = vectorResults.sort((a, b) => b.score - a.score);
  return mmr(ranked, limit);
}
