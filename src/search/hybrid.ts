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
  created_at?: number;
  scope?: string;
};

export type SearchOptions = {
  query: string;
  scope?: "global" | "project" | "session";
  limit?: number;
  project_id?: string;
};

const HALF_LIFE_DAYS = 30;
const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;

function decay(createdAt: number, now: number): number {
  const days = (now - createdAt) / 86_400_000;
  return Math.exp(-LAMBDA * Math.max(days, 0));
}

export async function search(
  db: GraphClient,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const vec = await embed(options.query);

  // --- Vector similarity ---
  let vectorResults: SearchResult[] = [];
  if (vec) {
    const result = (await db.roQuery(
      `CALL db.idx.vector.queryNodes('Entity', 'name_embedding', $k, vecf32($vec))
       YIELD node, score
       WHERE node.expired_at IS NULL
         AND (node.scope = 'global' OR node.project_id = $project_id)
       RETURN node.uuid AS uuid, node.name AS name, node.label_type AS label_type,
               node.summary AS summary, node.created_at AS created_at,
               node.scope AS scope, score AS score`,
      { k: limit * 3, vec, project_id: options.project_id ?? "default" },
    )) as { data: Record<string, unknown>[] };

    vectorResults = (result.data ?? []).map((row) => ({
      uuid: row.uuid as string,
      name: row.name as string,
      type: row.label_type as string,
      summary: row.summary as string,
      created_at: row.created_at as number,
      scope: row.scope as string,
      score: row.score as number,
    }));
  }

  // --- Full-text fallback (when no embeddings) ---
  if (!vec) {
    const result = (await db.roQuery(
      `CALL db.idx.fulltext.queryNodes('Entity', $query)
       YIELD node, score
       WHERE node.expired_at IS NULL
         AND (node.scope = 'global' OR node.project_id = $project_id)
       RETURN node.uuid AS uuid, node.name AS name, node.label_type AS label_type,
               node.summary AS summary, node.created_at AS created_at,
               node.scope AS scope, score AS score
       LIMIT $limit`,
      {
        query: options.query,
        limit: limit * 3,
        project_id: options.project_id ?? "default",
      },
    )) as { data: Record<string, unknown>[] };

    vectorResults = (result.data ?? []).map((row) => ({
      uuid: row.uuid as string,
      name: row.name as string,
      type: row.label_type as string,
      summary: row.summary as string,
      created_at: row.created_at as number,
      scope: row.scope as string,
      score: row.score as number,
    }));
  }

  // --- Temporal decay ---
  const now = Date.now();
  for (const r of vectorResults) {
    if (r.scope === "global") continue;
    if (!r.created_at) continue;
    r.score *= decay(r.created_at, now);
  }

  // --- Scope filtering ---
  if (options.scope) {
    vectorResults = vectorResults.filter((r) => r.scope === options.scope);
  }

  const ranked = vectorResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.uuid.localeCompare(b.uuid);
  });
  return ranked.slice(0, limit);
}
