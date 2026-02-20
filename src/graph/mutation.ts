import type { GraphClient } from "./client";
import { mutation } from "./ids";

export async function reserve(db: GraphClient, scope: string, key: string) {
  const uuid = mutation(scope, key);
  const out = (await db.query(
    `MERGE (m:Mutation {uuid: $uuid})
     ON CREATE SET m.scope = $scope, m.key = $key, m.created_at = $now, m.updated_at = $now, m.status = 'pending'
     RETURN m.status AS status`,
    { uuid, scope, key, now: Date.now() },
  )) as { data: Record<string, unknown>[] };
  return out.data[0]?.status !== "committed";
}

export async function complete(db: GraphClient, scope: string, key: string) {
  const uuid = mutation(scope, key);
  await db.query(
    `MATCH (m:Mutation {uuid: $uuid})
     SET m.status = 'committed', m.updated_at = $now`,
    { uuid, now: Date.now() },
  );
}
