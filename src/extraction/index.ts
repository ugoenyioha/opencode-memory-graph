// Entity extraction — sends conversation chunks to the LLM and parses
// structured JSON responses into graph operations.
//
// This is the "write" side of the memory system.

import type { GraphClient } from "../graph/client";
import { embed } from "../embedding";

export type ExtractedEntity = {
  action: "create" | "update";
  uuid?: string;
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

// Debounce state
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 2000;

export function queue(message: string) {
  pending.push(message);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

async function flush() {
  const batch = pending.splice(0);
  if (batch.length === 0) return;
  // TODO: call LLM with extraction prompt, parse response, merge into graph
}

export async function merge(
  db: GraphClient,
  result: ExtractionResult,
): Promise<void> {
  for (const entity of result.entities) {
    if (entity.action === "create" && entity.name && entity.label_type) {
      const uuid = `ent_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const vec = await embed(entity.name);
      const triggerVec =
        entity.label_type === "Lesson" && entity.attributes?.trigger
          ? await embed(entity.attributes.trigger as string)
          : null;

      await db.query(
        `CREATE (e:Entity {
          uuid: $uuid,
          name: $name,
          summary: $summary,
          name_embedding: vecf32($vec),
          label_type: $label_type,
          labels: $labels,
          attributes: $attributes,
          scope: $scope,
          source: $source,
          confidence: $confidence,
          validated_at: $now,
          ttl: null,
          created_at: $now
        })`,
        {
          uuid,
          name: entity.name,
          summary: entity.summary ?? "",
          vec: vec ? `[${vec.join(",")}]` : "[]",
          label_type: entity.label_type,
          labels: ["Entity", entity.label_type],
          attributes: JSON.stringify(entity.attributes ?? {}),
          scope: entity.scope ?? "project",
          source: entity.source ?? "auto",
          confidence: entity.confidence ?? "suspected",
          now: Date.now(),
        },
      );

      // Set trigger_embedding separately for Lesson entities
      if (triggerVec) {
        await db.query(
          `MATCH (e:Entity {uuid: $uuid})
           SET e.trigger_embedding = vecf32($vec)`,
          { uuid, vec: `[${triggerVec.join(",")}]` },
        );
      }
    }

    if (entity.action === "update" && entity.uuid) {
      const sets: string[] = [];
      const params: Record<string, unknown> = { uuid: entity.uuid };

      if (entity.summary) {
        sets.push("e.summary = $summary");
        params.summary = entity.summary;
      }
      if (entity.confidence) {
        sets.push("e.confidence = $confidence");
        params.confidence = entity.confidence;
      }
      if (entity.attributes) {
        sets.push("e.attributes = $attributes");
        params.attributes = JSON.stringify(entity.attributes);
      }

      if (sets.length > 0) {
        await db.query(
          `MATCH (e:Entity {uuid: $uuid}) SET ${sets.join(", ")}`,
          params,
        );
      }
    }
  }

  // Merge relationships
  for (const rel of result.relationships) {
    const uuid = `rel_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const vec = await embed(rel.fact);

    await db.query(
      `MATCH (a:Entity {name: $source_name}), (b:Entity {name: $target_name})
       CREATE (a)-[:RELATES_TO {
         uuid: $uuid,
         name: $rel_name,
         fact: $fact,
         fact_embedding: vecf32($vec),
         valid_at: $now,
         invalid_at: null,
         expired_at: null,
         episodes: [],
         attributes: '{}',
         created_at: $now
       }]->(b)`,
      {
        source_name: rel.source_name,
        target_name: rel.target_name,
        uuid,
        rel_name: rel.name,
        fact: rel.fact,
        vec: vec ? `[${vec.join(",")}]` : "[]",
        now: Date.now(),
      },
    );
  }
}
