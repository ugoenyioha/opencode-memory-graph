// Run schema setup queries against FalkorDB.
// Indexes and full-text indexes are idempotent — safe to re-run on every start.

import type { GraphClient } from "./client";

const DIMENSION = 384;

const rangeIndexes = [
  // Entity
  `CREATE INDEX FOR (e:Entity) ON (e.uuid)`,
  `CREATE INDEX FOR (e:Entity) ON (e.name)`,
  `CREATE INDEX FOR (e:Entity) ON (e.scope)`,
  `CREATE INDEX FOR (e:Entity) ON (e.confidence)`,
  `CREATE INDEX FOR (e:Entity) ON (e.created_at)`,
  `CREATE INDEX FOR (e:Entity) ON (e.validated_at)`,
  // Episode
  `CREATE INDEX FOR (ep:Episode) ON (ep.uuid)`,
  `CREATE INDEX FOR (ep:Episode) ON (ep.session_id)`,
  `CREATE INDEX FOR (ep:Episode) ON (ep.created_at)`,
  // Edges
  `CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.uuid)`,
  `CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.name)`,
  `CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.valid_at)`,
  `CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.invalid_at)`,
  `CREATE INDEX FOR ()-[r:RELATES_TO]-() ON (r.created_at)`,
  `CREATE INDEX FOR ()-[r:MENTIONS]-() ON (r.created_at)`,
  `CREATE INDEX FOR ()-[r:NEXT]-() ON (r.created_at)`,
];

const fulltextIndexes = [
  `CALL db.idx.fulltext.createNodeIndex('Entity', 'name', 'summary')`,
  `CALL db.idx.fulltext.createNodeIndex('Episode', 'content')`,
];

const vectorIndexes = [
  `CREATE VECTOR INDEX FOR (e:Entity) ON (e.name_embedding) OPTIONS {dimension: ${DIMENSION}, similarityFunction: 'cosine', M: 16, efConstruction: 200, efRuntime: 10}`,
  `CREATE VECTOR INDEX FOR ()-[r:RELATES_TO]->() ON (r.fact_embedding) OPTIONS {dimension: ${DIMENSION}, similarityFunction: 'cosine', M: 16, efConstruction: 200, efRuntime: 10}`,
  `CREATE VECTOR INDEX FOR (e:Entity) ON (e.trigger_embedding) OPTIONS {dimension: ${DIMENSION}, similarityFunction: 'cosine', M: 16, efConstruction: 200, efRuntime: 10}`,
];

async function run(db: GraphClient, queries: string[]) {
  for (const q of queries) {
    try {
      await db.query(q);
    } catch {
      // Index already exists — safe to ignore
    }
  }
}

export async function schema(db: GraphClient) {
  await run(db, rangeIndexes);
  await run(db, fulltextIndexes);
  await run(db, vectorIndexes);
}
