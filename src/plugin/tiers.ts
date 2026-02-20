// Memory tiers — loads core, working, and archival data from the graph
//
// Core tier: always loaded into system prompt (~2000 tokens)
// Working tier: session-active context (~1000 tokens)
// Archival tier: on-demand via memory_search / memory_get tools

import type { GraphClient } from "../graph/client";
import { neutralize } from "../security/redact";

export type TierEntity = {
  uuid: string;
  name: string;
  type: string;
  summary: string;
  attributes: string;
};

export async function core(
  db: GraphClient,
  projectID: string,
): Promise<TierEntity[]> {
  const result = (await db.roQuery(
    `MATCH (e:Entity)
     WHERE (e.scope = 'global' OR (e.scope = 'project' AND e.project_id = $project_id))
       AND e.expired_at IS NULL
       AND e.label_type IN ['Project', 'Pattern', 'Preference']
     RETURN e.uuid AS uuid, e.name AS name, e.label_type AS label_type,
            e.summary AS summary, e.attributes AS attributes
     ORDER BY e.created_at DESC
     LIMIT 50`,
    { project_id: projectID },
  )) as { data: Record<string, unknown>[] };

  const entities = (result.data ?? []).map((row) => ({
    uuid: row.uuid as string,
    name: row.name as string,
    type: row.label_type as string,
    summary: row.summary as string,
    attributes: row.attributes as string,
  }));

  // Also load blocker-severity lessons
  const lessons = (await db.roQuery(
    `MATCH (e:Entity)
      WHERE e.label_type = 'Lesson'
       AND (e.scope = 'global' OR (e.scope = 'project' AND e.project_id = $project_id))
       AND e.expired_at IS NULL
     RETURN e.uuid AS uuid, e.name AS name, e.label_type AS label_type,
            e.summary AS summary, e.attributes AS attributes
     ORDER BY e.created_at DESC
     LIMIT 10`,
    { project_id: projectID },
  )) as { data: Record<string, unknown>[] };

  const blockers = (lessons.data ?? [])
    .map((row) => ({
      uuid: row.uuid as string,
      name: row.name as string,
      type: row.label_type as string,
      summary: row.summary as string,
      attributes: row.attributes as string,
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
  projectID: string,
  recentCutoff: number,
): Promise<TierEntity[]> {
  const result = (await db.roQuery(
    `MATCH (e:Entity)
     WHERE e.expired_at IS NULL
       AND ((e.scope = 'session' AND e.project_id = $project_id)
            OR (e.label_type IN ['Task', 'Decision', 'Error']
                AND (e.scope = 'global' OR e.project_id = $project_id)
                AND e.created_at > $cutoff))
     RETURN e.uuid AS uuid, e.name AS name, e.label_type AS label_type,
            e.summary AS summary, e.attributes AS attributes
     ORDER BY e.created_at DESC
     LIMIT 30`,
    { cutoff: recentCutoff, project_id: projectID },
  )) as { data: Record<string, unknown>[] };

  return (result.data ?? []).map((row) => ({
    uuid: row.uuid as string,
    name: row.name as string,
    type: row.label_type as string,
    summary: row.summary as string,
    attributes: row.attributes as string,
  }));
}

export function format(entities: TierEntity[]): string {
  if (entities.length === 0) return "";
  const lines = entities.map(
    (e) =>
      `- [${e.type}] ${JSON.stringify(neutralize(String(e.name)))}: ${JSON.stringify(neutralize(String(e.summary)))}`,
  );
  return lines.join("\n");
}
