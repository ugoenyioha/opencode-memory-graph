// Memory tiers — loads core, working, and archival data from the graph
//
// Core tier: always loaded into system prompt (~2000 tokens)
// Working tier: session-active context (~1000 tokens)
// Archival tier: on-demand via memory_search / memory_get tools

import type { GraphClient } from "../graph/client";

export type TierEntity = {
  uuid: string;
  name: string;
  type: string;
  summary: string;
  attributes: string;
};

export async function core(
  db: GraphClient,
  projectScope: string,
): Promise<TierEntity[]> {
  const result = (await db.roQuery(
    `MATCH (e:Entity)
     WHERE e.scope IN ['global', $scope]
       AND e.label_type IN ['Project', 'Pattern', 'Preference']
     RETURN e.uuid, e.name, e.label_type, e.summary, e.attributes
     ORDER BY e.created_at DESC
     LIMIT 50`,
    { scope: projectScope },
  )) as { data: unknown[][] };

  const entities = (result.data ?? []).map((row) => ({
    uuid: row[0] as string,
    name: row[1] as string,
    type: row[2] as string,
    summary: row[3] as string,
    attributes: row[4] as string,
  }));

  // Also load blocker-severity lessons
  const lessons = (await db.roQuery(
    `MATCH (e:Entity)
     WHERE e.label_type = 'Lesson'
       AND e.scope IN ['global', $scope]
     RETURN e.uuid, e.name, e.label_type, e.summary, e.attributes
     ORDER BY e.created_at DESC
     LIMIT 10`,
    { scope: projectScope },
  )) as { data: unknown[][] };

  const blockers = (lessons.data ?? [])
    .map((row) => ({
      uuid: row[0] as string,
      name: row[1] as string,
      type: row[2] as string,
      summary: row[3] as string,
      attributes: row[4] as string,
    }))
    .filter((e) => {
      try {
        return JSON.parse(e.attributes).severity === "blocker";
      } catch {
        return false;
      }
    });

  return [...entities, ...blockers];
}

export async function working(
  db: GraphClient,
  recentCutoff: number,
): Promise<TierEntity[]> {
  const result = (await db.roQuery(
    `MATCH (e:Entity)
     WHERE e.scope = 'session'
       OR (e.label_type IN ['Task', 'Decision', 'Error']
           AND e.created_at > $cutoff)
     RETURN e.uuid, e.name, e.label_type, e.summary, e.attributes
     ORDER BY e.created_at DESC
     LIMIT 30`,
    { cutoff: recentCutoff },
  )) as { data: unknown[][] };

  return (result.data ?? []).map((row) => ({
    uuid: row[0] as string,
    name: row[1] as string,
    type: row[2] as string,
    summary: row[3] as string,
    attributes: row[4] as string,
  }));
}

export function format(entities: TierEntity[]): string {
  if (entities.length === 0) return "";
  const lines = entities.map((e) => `- [${e.type}] ${e.name}: ${e.summary}`);
  return lines.join("\n");
}
