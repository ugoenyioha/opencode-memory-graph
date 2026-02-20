// Entity extraction — sends conversation chunks to the LLM and parses
// structured JSON responses into graph operations.
//
// This is the "write" side of the memory system.

import type { GraphClient } from "../graph/client";
import { embed } from "../embedding";
import { journal, retry, serial } from "../graph/commit";
import { entity as entityId, relation as relationId } from "../graph/ids";
import { complete, reserve } from "../graph/mutation";
import { registry } from "../ontology/registry";
import { redact } from "../security/redact";
import { extractionWithPacks } from "./schema";
import { type Pack } from "../ontology/packs";

export type ExtractedEntity = {
  action: "create" | "update" | "delete" | "supersede";
  uuid?: string;
  superseded_by_uuid?: string;
  name?: string;
  label_type?: string;
  summary?: string;
  attributes?: Record<string, unknown>;
  scope?: "global" | "project" | "session";
  source?: "auto" | "user" | "import" | "inferred";
  confidence?: "confirmed" | "suspected" | "speculative";
};

export type ExtractedRelationship = {
  source_name: string;
  target_name: string;
  name: string;
  fact: string;
};

export type ExtractionResult = {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
};

export async function merge(
  db: GraphClient,
  result: ExtractionResult,
  options?: {
    mutation_key?: string;
    scope?: "global" | "project" | "session";
    project_id?: string;
    trusted_global?: boolean;
    packs?: Array<string | Pack>;
  },
): Promise<void> {
  const safe = extractionWithPacks(result, options?.packs ?? ["coding"]);
  const allowed = registry(options?.packs ?? ["coding"]);
  const scope = options?.scope ?? "project";
  const projectID = options?.project_id ?? "default";
  const allowGlobal = options?.trusted_global === true;
  if (scope === "global" && !options?.trusted_global) {
    throw new Error("global writes require trusted_global=true");
  }
  const key = options?.mutation_key;
  return serial(scope, async () => {
    const mutationScope = `${scope}:${projectID}`;
    if (key && !(await reserve(db, mutationScope, key))) return;

    const write = (
      cypher: string,
      params?: Record<
        string,
        string | number | boolean | null | string[] | number[]
      >,
    ) => retry(() => db.query(cypher, params));

    const read = (
      cypher: string,
      params?: Record<
        string,
        string | number | boolean | null | string[] | number[]
      >,
    ) => retry(() => db.roQuery(cypher, params));

    const names = new Map<string, string>();

    for (const entity of safe.entities) {
      if (entity.action === "create" && entity.name && entity.label_type) {
        const seed =
          scope === "global"
            ? `global:${entity.label_type}`
            : `${scope}:${projectID}:${entity.label_type}`;
        const uuid = entityId(seed, entity.name);
        names.set(entity.name, uuid);
        const vec = await embed(entity.name);
        const trigger =
          entity.label_type === "Lesson" && entity.attributes?.trigger
            ? String(entity.attributes.trigger)
            : null;
        const triggerVec =
          entity.label_type === "Lesson" && entity.attributes?.trigger
            ? await embed(trigger ?? "")
            : null;

        await write(
          `MERGE (e:Entity {uuid: $uuid})
         ON CREATE SET
          e.name = $name,
          e.summary = $summary,
          e.label_type = $label_type,
          e.labels = $labels,
          e.attributes = $attributes,
          e.scope = $scope,
          e.project_id = $project_id,
          e.source = $source,
          e.confidence = $confidence,
          e.validated_at = $now,
          e.ttl = null,
          e.created_at = $now
         ON MATCH SET
          e.summary = $summary,
          e.attributes = $attributes,
          e.confidence = $confidence,
          e.validated_at = $now`,
          {
            uuid,
            name: entity.name,
            summary: redact(entity.summary ?? ""),
            label_type: entity.label_type,
            labels: ["Entity", entity.label_type],
            attributes: JSON.stringify(
              Object.fromEntries(
                Object.entries(entity.attributes ?? {}).map(([k, v]) => [
                  k,
                  typeof v === "string" ? redact(v) : v,
                ]),
              ),
            ),
            scope,
            project_id: projectID,
            source: "auto",
            confidence: "suspected",
            now: Date.now(),
          },
        );

        if (vec) {
          await write(
            `MATCH (e:Entity {uuid: $uuid})
           SET e.name_embedding = vecf32($vec)`,
            { uuid, vec },
          );
        }

        // Set trigger_embedding separately for Lesson entities
        if (triggerVec) {
          await write(
            `MATCH (e:Entity {uuid: $uuid})
           SET e.trigger_embedding = vecf32($vec)`,
            { uuid, vec: triggerVec },
          );
        }
      }

      if (entity.action === "update" && entity.uuid) {
        const row = (await read(
          `MATCH (e:Entity {uuid: $uuid})
           WHERE (e.project_id = $project_id) OR ($allow_global AND e.scope = 'global')
           RETURN e.label_type AS label_type, e.attributes AS attributes`,
          {
            uuid: entity.uuid,
            project_id: projectID,
            allow_global: allowGlobal,
          },
        )) as { data: Record<string, unknown>[] };
        if ((row.data ?? []).length === 0) continue;
        const label = row.data[0]?.label_type as string | undefined;
        if (label && !allowed.has(label)) continue;
        let severity = "";
        try {
          const raw = row.data[0]?.attributes as string | undefined;
          severity = raw ? String(JSON.parse(raw).severity ?? "") : "";
        } catch {
          if (label === "Lesson") {
            await write(
              `MERGE (q:Quarantine {uuid: $id})
               ON CREATE SET q.entity_uuid = $uuid, q.reason = 'malformed_lesson_attributes', q.created_at = $now`,
              { id: `q_${entity.uuid}`, uuid: entity.uuid, now: Date.now() },
            );
            continue;
          }
        }

        const sets: string[] = [];
        const params: Record<
          string,
          string | number | boolean | null | string[] | number[]
        > = { uuid: entity.uuid };

        if (entity.summary) {
          sets.push("e.summary = $summary");
          params.summary = redact(entity.summary);
        }
        if (entity.confidence) {
          sets.push("e.confidence = $confidence");
          params.confidence = entity.confidence;
        }
        if (entity.attributes) {
          const next = Object.fromEntries(
            Object.entries(entity.attributes).map(([k, v]) => [
              k,
              typeof v === "string" ? redact(v) : v,
            ]),
          );
          if (
            label === "Lesson" &&
            (severity === "blocker" || severity === "warning")
          ) {
            const nextSeverity = next.severity;
            if (
              typeof nextSeverity !== "string" ||
              (nextSeverity !== "blocker" && nextSeverity !== "warning")
            ) {
              await write(
                `MERGE (q:Quarantine {uuid: $id})
                 ON CREATE SET q.entity_uuid = $uuid, q.reason = 'protected_lesson_tamper', q.created_at = $now`,
                { id: `q_${entity.uuid}`, uuid: entity.uuid, now: Date.now() },
              );
              continue;
            }
          }

          if (
            label === "Lesson" &&
            (severity === "blocker" || severity === "warning") &&
            typeof next.severity === "string" &&
            next.severity !== "blocker" &&
            next.severity !== "warning"
          ) {
            await write(
              `MERGE (q:Quarantine {uuid: $id})
               ON CREATE SET q.entity_uuid = $uuid, q.reason = 'protected_lesson_tamper', q.created_at = $now`,
              { id: `q_${entity.uuid}`, uuid: entity.uuid, now: Date.now() },
            );
            continue;
          }
          sets.push("e.attributes = $attributes");
          params.attributes = JSON.stringify(next);
        }

        if (
          label === "Lesson" &&
          (severity === "blocker" || severity === "warning") &&
          sets.length > 0
        ) {
          await write(
            `MERGE (q:Quarantine {uuid: $id})
             ON CREATE SET q.entity_uuid = $uuid, q.reason = 'protected_lesson_tamper', q.created_at = $now`,
            { id: `q_${entity.uuid}`, uuid: entity.uuid, now: Date.now() },
          );
          continue;
        }

        if (sets.length > 0) {
          await write(
            `MATCH (e:Entity {uuid: $uuid})
             WHERE (e.project_id = $project_id) OR ($allow_global AND e.scope = 'global')
             SET ${sets.join(", ")}`,
            { ...params, project_id: projectID, allow_global: allowGlobal },
          );
        }
      }

      if (entity.action === "delete" && entity.uuid) {
        const row = (await read(
          `MATCH (e:Entity {uuid: $uuid})
         WHERE (e.project_id = $project_id) OR ($allow_global AND e.scope = 'global')
         RETURN e.label_type AS label_type, e.attributes AS attributes`,
          {
            uuid: entity.uuid,
            project_id: projectID,
            allow_global: allowGlobal,
          },
        )) as { data: Record<string, unknown>[] };
        if ((row.data ?? []).length === 0) continue;

        const label = row.data[0]?.label_type as string | undefined;
        if (label && !allowed.has(label)) continue;
        let severity = "";
        try {
          const raw = row.data[0]?.attributes as string | undefined;
          severity = raw ? String(JSON.parse(raw).severity ?? "") : "";
        } catch {
          if (label === "Lesson") {
            await write(
              `MERGE (q:Quarantine {uuid: $id})
               ON CREATE SET q.entity_uuid = $uuid, q.reason = 'malformed_lesson_attributes', q.created_at = $now`,
              { id: `q_${entity.uuid}`, uuid: entity.uuid, now: Date.now() },
            );
            continue;
          }
        }

        if (
          label === "Lesson" &&
          (severity === "blocker" || severity === "warning")
        ) {
          await write(
            `MERGE (q:Quarantine {uuid: $id})
           ON CREATE SET q.entity_uuid = $uuid, q.reason = 'protected_lesson', q.created_at = $now`,
            {
              id: `q_${entity.uuid}`,
              uuid: entity.uuid,
              now: Date.now(),
            },
          );
          continue;
        }

        await write(
          `MATCH (e:Entity {uuid: $uuid})
         SET e.expired_at = $now
         WITH e
         OPTIONAL MATCH (e)-[r:RELATES_TO]-()
         SET r.expired_at = $now`,
          { uuid: entity.uuid, now: Date.now() },
        );
      }

      if (
        entity.action === "supersede" &&
        entity.uuid &&
        entity.superseded_by_uuid
      ) {
        const row = (await read(
          `MATCH (e:Entity {uuid: $uuid})
           WHERE (e.project_id = $project_id) OR ($allow_global AND e.scope = 'global')
           RETURN e.label_type AS label_type, e.attributes AS attributes`,
          {
            uuid: entity.uuid,
            project_id: projectID,
            allow_global: allowGlobal,
          },
        )) as { data: Record<string, unknown>[] };
        if ((row.data ?? []).length === 0) continue;
        const label = row.data[0]?.label_type as string | undefined;
        if (label && !allowed.has(label)) continue;

        const target = (await read(
          `MATCH (e:Entity {uuid: $uuid})
           WHERE e.expired_at IS NULL
             AND ((e.project_id = $project_id) OR ($allow_global AND e.scope = 'global'))
           RETURN e.uuid AS uuid`,
          {
            uuid: entity.superseded_by_uuid,
            project_id: projectID,
            allow_global: allowGlobal,
          },
        )) as { data: Record<string, unknown>[] };
        if ((target.data ?? []).length === 0) continue;

        let severity = "";
        try {
          const raw = row.data[0]?.attributes as string | undefined;
          severity = raw ? String(JSON.parse(raw).severity ?? "") : "";
        } catch {
          if (label === "Lesson") {
            await write(
              `MERGE (q:Quarantine {uuid: $id})
               ON CREATE SET q.entity_uuid = $uuid, q.reason = 'malformed_lesson_attributes', q.created_at = $now`,
              { id: `q_${entity.uuid}`, uuid: entity.uuid, now: Date.now() },
            );
            continue;
          }
        }

        if (
          label === "Lesson" &&
          (severity === "blocker" || severity === "warning")
        ) {
          await write(
            `MERGE (q:Quarantine {uuid: $id})
             ON CREATE SET q.entity_uuid = $uuid, q.reason = 'protected_lesson_supersede', q.created_at = $now`,
            {
              id: `q_${entity.uuid}`,
              uuid: entity.uuid,
              now: Date.now(),
            },
          );
          continue;
        }

        const now = Date.now();
        await write(
          `MATCH (e:Entity {uuid: $uuid})
           SET e.expired_at = $now
           WITH e
           OPTIONAL MATCH (e)-[r:RELATES_TO]-()
           SET r.expired_at = $now`,
          { uuid: entity.uuid, now },
        );

        const rid = relationId(
          entity.uuid,
          "superseded_by",
          entity.superseded_by_uuid,
        );
        await write(
          `MATCH (a:Entity {uuid: $source_uuid}), (b:Entity {uuid: $target_uuid})
           WHERE (a.project_id = $project_id OR ($allow_global AND a.scope = 'global'))
             AND (b.project_id = $project_id OR ($allow_global AND b.scope = 'global'))
           MERGE (a)-[r:RELATES_TO {uuid: $uuid}]->(b)
           ON CREATE SET
             r.name = $rel_name,
             r.fact = $fact,
             r.valid_at = $now,
             r.invalid_at = null,
             r.expired_at = null,
             r.episodes = [],
             r.attributes = '{}',
             r.created_at = $now
           ON MATCH SET
             r.fact = $fact,
             r.invalid_at = null,
             r.expired_at = null`,
          {
            source_uuid: entity.uuid,
            target_uuid: entity.superseded_by_uuid,
            project_id: projectID,
            allow_global: allowGlobal,
            uuid: rid,
            rel_name: "superseded_by",
            fact: "entity was superseded by a newer memory",
            now,
          },
        );
      }
    }

    // Merge relationships
    for (const rel of safe.relationships) {
      const sourceUuid =
        names.get(rel.source_name) ??
        ((
          (await read(
            `MATCH (e:Entity {name: $name})
            WHERE e.expired_at IS NULL
              AND (e.project_id = $project_id OR ($allow_global AND e.scope = 'global'))
            RETURN e.uuid
            ORDER BY e.created_at DESC, e.uuid ASC
            LIMIT 1`,
            {
              name: rel.source_name,
              project_id: projectID,
              allow_global: allowGlobal,
            },
          )) as { data: Record<string, unknown>[] }
        ).data[0]?.["e.uuid"] as string | undefined);
      const targetUuid =
        names.get(rel.target_name) ??
        ((
          (await read(
            `MATCH (e:Entity {name: $name})
            WHERE e.expired_at IS NULL
              AND (e.project_id = $project_id OR ($allow_global AND e.scope = 'global'))
            RETURN e.uuid
            ORDER BY e.created_at DESC, e.uuid ASC
            LIMIT 1`,
            {
              name: rel.target_name,
              project_id: projectID,
              allow_global: allowGlobal,
            },
          )) as { data: Record<string, unknown>[] }
        ).data[0]?.["e.uuid"] as string | undefined);
      if (!sourceUuid || !targetUuid) continue;

      const uuid = relationId(sourceUuid, rel.name, targetUuid);
      const vec = await embed(rel.fact);

      await write(
        `MATCH (a:Entity {uuid: $source_uuid}), (b:Entity {uuid: $target_uuid})
        WHERE (a.project_id = $project_id OR ($allow_global AND a.scope = 'global'))
          AND (b.project_id = $project_id OR ($allow_global AND b.scope = 'global'))
        MERGE (a)-[r:RELATES_TO {uuid: $uuid}]->(b)
       ON CREATE SET
         r.name = $rel_name,
         r.fact = $fact,
         r.valid_at = $now,
         r.invalid_at = null,
         r.expired_at = null,
         r.episodes = [],
         r.attributes = '{}',
         r.created_at = $now
       ON MATCH SET
         r.fact = $fact,
         r.invalid_at = null,
         r.expired_at = null`,
        {
          source_uuid: sourceUuid,
          target_uuid: targetUuid,
          project_id: projectID,
          allow_global: allowGlobal,
          uuid,
          rel_name: rel.name,
          fact: redact(rel.fact),
          now: Date.now(),
        },
      );

      if (vec) {
        await write(
          `MATCH ()-[r:RELATES_TO {uuid: $uuid}]->()
         SET r.fact_embedding = vecf32($vec)`,
          { uuid, vec },
        );
      }
    }

    if (key) {
      await journal(
        db,
        mutationScope,
        key,
        JSON.stringify({
          entities: safe.entities.length,
          relationships: safe.relationships.length,
          created_at: Date.now(),
        }),
      );
      await complete(db, mutationScope, key);
    }
  });
}
