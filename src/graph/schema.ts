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
  // Mutation
  `CREATE INDEX FOR (m:Mutation) ON (m.uuid)`,
  `CREATE INDEX FOR (m:Mutation) ON (m.scope)`,
  `CREATE INDEX FOR (m:Mutation) ON (m.created_at)`,
  // Journal
  `CREATE INDEX FOR (j:Journal) ON (j.uuid)`,
  `CREATE INDEX FOR (j:Journal) ON (j.scope)`,
  `CREATE INDEX FOR (j:Journal) ON (j.created_at)`,
  // Quarantine
  `CREATE INDEX FOR (q:Quarantine) ON (q.uuid)`,
  `CREATE INDEX FOR (q:Quarantine) ON (q.entity_uuid)`,
  `CREATE INDEX FOR (q:Quarantine) ON (q.created_at)`,
  // Queue
  `CREATE INDEX FOR (q:QueueItem) ON (q.uuid)`,
  `CREATE INDEX FOR (q:QueueItem) ON (q.project_id)`,
  `CREATE INDEX FOR (q:QueueItem) ON (q.status)`,
  `CREATE INDEX FOR (q:QueueItem) ON (q.created_at)`,
  // Tool usage
  `CREATE INDEX FOR (u:ToolUsage) ON (u.uuid)`,
  `CREATE INDEX FOR (u:ToolUsage) ON (u.project_id)`,
  `CREATE INDEX FOR (u:ToolUsage) ON (u.tool)`,
  `CREATE INDEX FOR (u:ToolUsage) ON (u.updated_at)`,
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
  const ignorable = [
    "already exists",
    "already indexed",
    "index already",
    "constraint already",
    "already configured",
  ];

  for (const q of queries) {
    try {
      await db.query(q);
    } catch (error) {
      const text = String(error).toLowerCase();
      if (ignorable.some((entry) => text.includes(entry))) {
        continue;
      }
      throw error;
    }
  }
}

export async function schema(db: GraphClient) {
  await run(db, rangeIndexes);
  await run(db, fulltextIndexes);
  await run(db, vectorIndexes);
}
