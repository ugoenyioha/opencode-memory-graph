import type { GraphClient } from "../graph/client";
import { merge } from "../extraction";
import { mutation } from "../graph/ids";
import { serial } from "../graph/commit";
import { type Pack } from "../ontology/packs";

type Item = {
  key: string;
  session_id: string;
  message_id: string;
  text: string;
};

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

function parse(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as Item;
  } catch {
    return null;
  }
}

async function next(db: GraphClient, projectID: string) {
  const out = (await db.roQuery(
    `MATCH (q:QueueItem)
     WHERE q.project_id = $project_id
       AND q.status = 'pending'
       AND (q.next_retry_at IS NULL OR q.next_retry_at <= $now)
     RETURN q.uuid AS uuid, q.payload AS payload
     ORDER BY q.created_at ASC, q.uuid ASC
     LIMIT 1`,
    { project_id: projectID, now: Date.now() },
  )) as { data: Record<string, unknown>[] };
  const row = out.data?.[0];
  if (!row?.uuid) return null;
  return {
    uuid: String(row.uuid),
    payload: String(row.payload ?? ""),
  };
}

export function backoff(attempt: number) {
  const exp = Math.min(Math.max(attempt - 1, 0), 8);
  return BASE_DELAY_MS * 2 ** exp;
}

export async function enqueue(
  db: GraphClient,
  input: {
    project_id: string;
    session_id: string;
    message_id: string;
    text: string;
  },
) {
  const key = `${input.session_id}:${input.message_id}`;
  const uuid = mutation(`queue:${input.project_id}`, key);
  await db.query(
    `MERGE (q:QueueItem {uuid: $uuid})
     ON CREATE SET
       q.scope = 'project',
       q.project_id = $project_id,
       q.session_id = $session_id,
       q.message_id = $message_id,
       q.status = 'pending',
       q.attempts = 0,
       q.next_retry_at = null,
       q.error = null,
       q.payload = $payload,
       q.created_at = $now,
       q.updated_at = $now`,
    {
      uuid,
      project_id: input.project_id,
      session_id: input.session_id,
      message_id: input.message_id,
      payload: JSON.stringify({
        key,
        session_id: input.session_id,
        message_id: input.message_id,
        text: input.text,
      }),
      now: Date.now(),
    },
  );
  return key;
}

export async function drain(
  db: GraphClient,
  input: {
    project_id: string;
    packs: Array<string | Pack>;
    limit?: number;
  },
) {
  const limit = Math.max(1, Math.min(input.limit ?? 3, 20));
  return serial(`queue:${input.project_id}`, async () => {
    let done = 0;
    while (done < limit) {
      const row = await next(db, input.project_id);
      if (!row) return done;
      await db.query(
        `MATCH (q:QueueItem {uuid: $uuid})
         SET q.status = 'processing', q.updated_at = $now`,
        { uuid: row.uuid, now: Date.now() },
      );
      const payload = parse(row.payload);
      if (!payload) {
        await db.query(
          `MATCH (q:QueueItem {uuid: $uuid})
           SET q.status = 'failed', q.error = 'invalid_payload', q.updated_at = $now`,
          { uuid: row.uuid, now: Date.now() },
        );
        done += 1;
        continue;
      }

      try {
        await merge(
          db,
          {
            entities: [
              {
                action: "create",
                name: `message:${payload.session_id}:${payload.message_id}`,
                label_type: "Concept",
                summary: payload.text.slice(0, 2000),
                scope: "project",
                source: "auto",
                confidence: "suspected",
                attributes: {
                  kind: "raw_message",
                  session_id: payload.session_id,
                },
              },
            ],
            relationships: [],
          },
          {
            scope: "project",
            project_id: input.project_id,
            mutation_key: payload.key,
            packs: input.packs,
          },
        );
        await db.query(
          `MATCH (q:QueueItem {uuid: $uuid})
           SET q.status = 'done', q.processed_at = $now, q.updated_at = $now`,
          { uuid: row.uuid, now: Date.now() },
        );
      } catch (error) {
        const state = (await db.roQuery(
          `MATCH (q:QueueItem {uuid: $uuid})
           RETURN coalesce(q.attempts, 0) AS attempts`,
          { uuid: row.uuid },
        )) as { data: Record<string, unknown>[] };
        const attempt = Number(state.data?.[0]?.attempts ?? 0) + 1;
        const delay = backoff(attempt);
        const terminal = attempt >= MAX_ATTEMPTS;
        await db.query(
          `MATCH (q:QueueItem {uuid: $uuid})
           SET q.attempts = $attempt,
               q.status = $status,
               q.error = $error,
               q.next_retry_at = $next_retry_at,
               q.updated_at = $now`,
          {
            uuid: row.uuid,
            attempt,
            status: terminal ? "failed" : "pending",
            error: String(error).slice(0, 500),
            next_retry_at: terminal ? null : Date.now() + delay,
            now: Date.now(),
          },
        );
      }
      done += 1;
    }
    return done;
  });
}
