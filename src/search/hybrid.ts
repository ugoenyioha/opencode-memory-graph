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
  confidence?: string;
};

export type SearchOptions = {
  query: string;
  scope?: "global" | "project" | "session";
  limit?: number;
  project_id?: string;
};

const HALF_LIFE_DAYS = 30;
const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;
const MMR_LAMBDA = 0.7;

const STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

function decay(createdAt: number, now: number): number {
  const days = (now - createdAt) / 86_400_000;
  return Math.exp(-LAMBDA * Math.max(days, 0));
}

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((item) => item.length > 2 && !STOP.has(item));
}

export function expandQuery(value: string) {
  const list = words(value);
  if (list.length === 0) return value;
  const seen = new Set<string>();
  const keep = list
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 6)
    .join(" ");
  if (!keep) return value;
  return `${value} ${keep}`.trim();
}

function overlap(a: string, b: string) {
  const x = new Set(words(a));
  const y = new Set(words(b));
  if (x.size === 0 || y.size === 0) return 0;
  const inter = [...x].filter((item) => y.has(item)).length;
  const union = new Set([...x, ...y]).size;
  if (union === 0) return 0;
  return inter / union;
}

function normalize(list: SearchResult[]) {
  if (list.length === 0) return [] as number[];
  const max = Math.max(...list.map((item) => item.score));
  if (max <= 0) return list.map(() => 0);
  return list.map((item) => item.score / max);
}

export function rerankMMR(list: SearchResult[], limit: number) {
  const pool = [...list].sort((a, b) => a.uuid.localeCompare(b.uuid));
  const score = normalize(pool);
  const out: SearchResult[] = [];
  while (pool.length > 0 && out.length < limit) {
    let best = 0;
    let bestScore = -Infinity;
    for (const [i, item] of pool.entries()) {
      const novelty = out.length
        ? Math.max(
            ...out.map((pick) =>
              overlap(
                `${item.name} ${item.summary}`,
                `${pick.name} ${pick.summary}`,
              ),
            ),
          )
        : 0;
      const mmr = MMR_LAMBDA * (score[i] ?? 0) - (1 - MMR_LAMBDA) * novelty;
      if (mmr > bestScore) {
        best = i;
        bestScore = mmr;
      }
    }
    out.push(pool.splice(best, 1)[0]!);
    score.splice(best, 1);
  }
  return out;
}

export async function search(
  db: GraphClient,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const vec = await embed(options.query);
  const out = new Map<string, SearchResult>();
  const add = (item: SearchResult, weight: number) => {
    const prev = out.get(item.uuid);
    if (!prev) {
      out.set(item.uuid, { ...item, score: item.score * weight });
      return;
    }
    out.set(item.uuid, { ...prev, score: prev.score + item.score * weight });
  };

  // --- Vector similarity / FTS fallback ---
  let base: SearchResult[] = [];
  if (vec) {
    const result = (await db.roQuery(
      `CALL db.idx.vector.queryNodes('Entity', 'name_embedding', $k, vecf32($vec))
       YIELD node, score
       WHERE node.expired_at IS NULL
         AND (node.scope = 'global' OR node.project_id = $project_id)
       RETURN node.uuid AS uuid, node.name AS name, node.label_type AS label_type,
               node.summary AS summary, node.created_at AS created_at,
                node.scope AS scope, node.confidence AS confidence, score AS score`,
      { k: limit * 3, vec, project_id: options.project_id ?? "default" },
    )) as { data: Record<string, unknown>[] };

    base = (result.data ?? []).map((row) => ({
      uuid: row.uuid as string,
      name: row.name as string,
      type: row.label_type as string,
      summary: row.summary as string,
      created_at: row.created_at as number,
      scope: row.scope as string,
      confidence: row.confidence as string,
      score: row.score as number,
    }));
  }

  if (!vec) {
    const query = expandQuery(options.query);
    const result = (await db.roQuery(
      `CALL db.idx.fulltext.queryNodes('Entity', $query)
       YIELD node, score
       WHERE node.expired_at IS NULL
         AND (node.scope = 'global' OR node.project_id = $project_id)
       RETURN node.uuid AS uuid, node.name AS name, node.label_type AS label_type,
                node.summary AS summary, node.created_at AS created_at,
                node.scope AS scope, node.confidence AS confidence, score AS score
       LIMIT $limit`,
      {
        query,
        limit: limit * 3,
        project_id: options.project_id ?? "default",
      },
    )) as { data: Record<string, unknown>[] };

    base = (result.data ?? []).map((row) => ({
      uuid: row.uuid as string,
      name: row.name as string,
      type: row.label_type as string,
      summary: row.summary as string,
      created_at: row.created_at as number,
      scope: row.scope as string,
      confidence: row.confidence as string,
      score: row.score as number,
    }));
  }

  base.forEach((item) => add(item, 0.5));

  // --- Graph traversal ---
  const ids = base.map((item) => item.uuid).slice(0, limit * 2);
  if (ids.length > 0) {
    const hops = (await db.roQuery(
      `UNWIND $ids AS id
       MATCH (s:Entity {uuid: id})-[r:RELATES_TO]-(n:Entity)
       WHERE r.expired_at IS NULL
         AND n.expired_at IS NULL
         AND (n.scope = 'global' OR n.project_id = $project_id)
       RETURN id AS seed_uuid, n.uuid AS uuid, n.name AS name,
              n.label_type AS label_type, n.summary AS summary,
              n.created_at AS created_at, n.scope AS scope,
              n.confidence AS confidence, 1.0 AS score
       LIMIT $limit`,
      {
        ids,
        project_id: options.project_id ?? "default",
        limit: limit * 6,
      },
    )) as { data: Record<string, unknown>[] };

    const seed = new Map(base.map((item) => [item.uuid, item.score]));
    for (const row of hops.data ?? []) {
      const boost = seed.get(String(row.seed_uuid ?? "")) ?? 0;
      add(
        {
          uuid: row.uuid as string,
          name: row.name as string,
          type: row.label_type as string,
          summary: row.summary as string,
          created_at: row.created_at as number,
          scope: row.scope as string,
          confidence: row.confidence as string,
          score: boost,
        },
        0.3,
      );
    }
  }

  // --- Temporal decay ---
  const now = Date.now();
  let vectorResults = [...out.values()];
  for (const r of vectorResults) {
    if (r.scope === "global") continue;
    if (!r.created_at) continue;
    const confidence = r.confidence === "speculative" ? 0.9 : 1;
    r.score *= decay(r.created_at, now) * confidence;
  }

  // --- Scope filtering ---
  if (options.scope) {
    vectorResults = vectorResults.filter((r) => r.scope === options.scope);
  }

  const ranked = vectorResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.uuid.localeCompare(b.uuid);
  });
  return rerankMMR(ranked, limit);
}
