// Community detection via Label Propagation Algorithm (LPA).
//
// Assigns each entity a `community_id` property based on graph structure.
// Runs entirely on RELATES_TO edges between non-expired entities.
// No external dependencies — pure graph traversal with iterative propagation.

import type { GraphClient } from "./client";
import { retry } from "./commit";

/**
 * Build an adjacency list from the graph, then run synchronous LPA in-memory.
 * Finally, write `community_id` back to each entity node.
 *
 * Returns the number of communities detected.
 */
export async function detectCommunities(
  db: GraphClient,
  options?: {
    project_id?: string;
    max_iterations?: number;
  },
): Promise<number> {
  const projectId = options?.project_id ?? "default";
  const maxIter = options?.max_iterations ?? 20;

  // Fetch all active entity UUIDs
  const entityResult = (await retry(() =>
    db.roQuery(
      `MATCH (e:Entity)
       WHERE e.expired_at IS NULL
         AND (e.scope = 'global' OR e.project_id = $project_id)
       RETURN e.uuid AS uuid`,
      { project_id: projectId },
    ),
  )) as { data: Record<string, unknown>[] };

  const entities = (entityResult.data ?? []).map(
    (row) => row.uuid as string,
  );
  if (entities.length === 0) return 0;

  // Fetch all active edges
  const edgeResult = (await retry(() =>
    db.roQuery(
      `MATCH (a:Entity)-[r:RELATES_TO]-(b:Entity)
       WHERE r.expired_at IS NULL
         AND a.expired_at IS NULL
         AND b.expired_at IS NULL
         AND (a.scope = 'global' OR a.project_id = $project_id)
         AND (b.scope = 'global' OR b.project_id = $project_id)
       RETURN DISTINCT a.uuid AS source, b.uuid AS target`,
      { project_id: projectId },
    ),
  )) as { data: Record<string, unknown>[] };

  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  for (const uuid of entities) {
    adjacency.set(uuid, []);
  }
  for (const row of edgeResult.data ?? []) {
    const src = row.source as string;
    const tgt = row.target as string;
    if (adjacency.has(src)) adjacency.get(src)!.push(tgt);
    if (adjacency.has(tgt)) adjacency.get(tgt)!.push(src);
  }

  // Label Propagation: initialize each node with its own label
  const labels = new Map<string, string>();
  for (const uuid of entities) {
    labels.set(uuid, uuid);
  }

  // Iterative propagation
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // Shuffle order each iteration for convergence
    const order = [...entities];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }

    for (const uuid of order) {
      const neighbors = adjacency.get(uuid) ?? [];
      if (neighbors.length === 0) continue;

      // Count neighbor labels
      const counts = new Map<string, number>();
      for (const n of neighbors) {
        const label = labels.get(n) ?? n;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }

      // Pick most frequent label (tie-break: lexicographic smallest)
      let bestLabel = labels.get(uuid)!;
      let bestCount = 0;
      for (const [label, count] of counts) {
        if (count > bestCount || (count === bestCount && label < bestLabel)) {
          bestLabel = label;
          bestCount = count;
        }
      }

      if (bestLabel !== labels.get(uuid)) {
        labels.set(uuid, bestLabel);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Normalize: remap labels to sequential community IDs
  const labelToId = new Map<string, number>();
  let nextId = 0;
  for (const label of labels.values()) {
    if (!labelToId.has(label)) {
      labelToId.set(label, nextId++);
    }
  }

  // Write community_id back to entities (batch by community)
  const batches = new Map<number, string[]>();
  for (const [uuid, label] of labels) {
    const cid = labelToId.get(label)!;
    if (!batches.has(cid)) batches.set(cid, []);
    batches.get(cid)!.push(uuid);
  }

  for (const [cid, uuids] of batches) {
    await retry(() =>
      db.query(
        `UNWIND $uuids AS uuid
         MATCH (e:Entity {uuid: uuid})
         SET e.community_id = $cid`,
        { uuids, cid },
      ),
    );
  }

  return labelToId.size;
}

/**
 * Get the community members for a given entity UUID.
 * Returns UUIDs of all entities in the same community.
 */
export async function communityMembers(
  db: GraphClient,
  entityUuid: string,
  options?: { project_id?: string; limit?: number },
): Promise<string[]> {
  const projectId = options?.project_id ?? "default";
  const limit = options?.limit ?? 50;

  const result = (await retry(() =>
    db.roQuery(
      `MATCH (seed:Entity {uuid: $uuid})
       WHERE seed.community_id IS NOT NULL
       WITH seed.community_id AS cid
       MATCH (e:Entity {community_id: cid})
       WHERE e.expired_at IS NULL
         AND (e.scope = 'global' OR e.project_id = $project_id)
         AND e.uuid <> $uuid
       RETURN e.uuid AS uuid
       LIMIT $limit`,
      { uuid: entityUuid, project_id: projectId, limit },
    ),
  )) as { data: Record<string, unknown>[] };

  return (result.data ?? []).map((row) => row.uuid as string);
}
