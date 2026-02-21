import type { GraphClient } from "../graph/client";
import { merge } from "../extraction";
import { mutation } from "../graph/ids";
import { serial } from "../graph/commit";
import { type Pack } from "../ontology/packs";
import type { TruthLog } from "../cxdb/interface";

type Item = {
  key: string;
  context_id?: number;
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

export type QueueStats = {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  total: number;
  oldest_pending_at: number | null;
  avg_processing_ms: number | null;
};

export async function stats(
  db: GraphClient,
  projectID: string,
): Promise<QueueStats> {
  const counts = (await db.roQuery(
    `MATCH (q:QueueItem)
     WHERE q.project_id = $project_id
     RETURN q.status AS status, count(q) AS count`,
    { project_id: projectID },
  )) as { data: Record<string, unknown>[] };

  const out: QueueStats = {
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    total: 0,
    oldest_pending_at: null,
    avg_processing_ms: null,
  };

  for (const row of counts.data ?? []) {
    const status = String(row.status ?? "");
    const count = Number(row.count ?? 0);
    if (status === "pending") out.pending = count;
    else if (status === "processing") out.processing = count;
    else if (status === "done") out.done = count;
    else if (status === "failed") out.failed = count;
  }
  out.total = out.pending + out.processing + out.done + out.failed;

  if (out.pending > 0) {
    const oldest = (await db.roQuery(
      `MATCH (q:QueueItem)
       WHERE q.project_id = $project_id AND q.status = 'pending'
       RETURN min(q.created_at) AS oldest`,
      { project_id: projectID },
    )) as { data: Record<string, unknown>[] };
    const val = oldest.data?.[0]?.oldest;
    if (val != null) out.oldest_pending_at = Number(val);
  }

  if (out.done > 0) {
    const avg = (await db.roQuery(
      `MATCH (q:QueueItem)
       WHERE q.project_id = $project_id
         AND q.status = 'done'
         AND q.processed_at IS NOT NULL
         AND q.created_at IS NOT NULL
       RETURN avg(q.processed_at - q.created_at) AS avg_ms`,
      { project_id: projectID },
    )) as { data: Record<string, unknown>[] };
    const val = avg.data?.[0]?.avg_ms;
    if (val != null) out.avg_processing_ms = Math.round(Number(val));
  }

  return out;
}

export async function enqueue(
  db: GraphClient,
  input: {
    project_id: string;
    context_id?: number;
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
        context_id: input.context_id,
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
    truthlog?: TruthLog;
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
            truthlog:
              input.truthlog && payload.context_id
                ? {
                    log: input.truthlog,
                    context_id: payload.context_id,
                  }
                : undefined,
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

// --- Dead-letter inspection/repair ---

export type DeadLetterItem = {
  uuid: string;
  project_id: string;
  session_id: string;
  message_id: string;
  error: string | null;
  attempts: number;
  payload: string;
  created_at: number;
  updated_at: number;
};

export async function deadLetters(
  db: GraphClient,
  projectID: string,
  options?: { limit?: number; offset?: number },
): Promise<{ items: DeadLetterItem[]; total: number }> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
  const offset = Math.max(0, options?.offset ?? 0);

  const total = (await db.roQuery(
    `MATCH (q:QueueItem)
     WHERE q.project_id = $project_id AND q.status = 'failed'
     RETURN count(q) AS total`,
    { project_id: projectID },
  )) as { data: Record<string, unknown>[] };

  const result = (await db.roQuery(
    `MATCH (q:QueueItem)
     WHERE q.project_id = $project_id AND q.status = 'failed'
     RETURN q.uuid AS uuid, q.project_id AS project_id,
            q.session_id AS session_id, q.message_id AS message_id,
            q.error AS error, q.attempts AS attempts,
            q.payload AS payload, q.created_at AS created_at,
            q.updated_at AS updated_at
     ORDER BY q.updated_at DESC, q.uuid ASC
     SKIP $offset LIMIT $limit`,
    { project_id: projectID, offset, limit },
  )) as { data: Record<string, unknown>[] };

  return {
    total: Number(total.data?.[0]?.total ?? 0),
    items: (result.data ?? []).map((row) => ({
      uuid: String(row.uuid ?? ""),
      project_id: String(row.project_id ?? ""),
      session_id: String(row.session_id ?? ""),
      message_id: String(row.message_id ?? ""),
      error: row.error != null ? String(row.error) : null,
      attempts: Number(row.attempts ?? 0),
      payload: String(row.payload ?? ""),
      created_at: Number(row.created_at ?? 0),
      updated_at: Number(row.updated_at ?? 0),
    })),
  };
}

export async function retryDeadLetter(
  db: GraphClient,
  uuid: string,
): Promise<boolean> {
  const result = (await db.query(
    `MATCH (q:QueueItem {uuid: $uuid})
     WHERE q.status = 'failed'
     SET q.status = 'pending',
         q.attempts = 0,
         q.error = null,
         q.next_retry_at = null,
         q.updated_at = $now
     RETURN q.uuid AS uuid`,
    { uuid, now: Date.now() },
  )) as { data: Record<string, unknown>[] };
  return (result.data?.length ?? 0) > 0;
}

export async function retryAllDeadLetters(
  db: GraphClient,
  projectID: string,
): Promise<number> {
  const result = (await db.query(
    `MATCH (q:QueueItem)
     WHERE q.project_id = $project_id AND q.status = 'failed'
     SET q.status = 'pending',
         q.attempts = 0,
         q.error = null,
         q.next_retry_at = null,
         q.updated_at = $now
     RETURN count(q) AS count`,
    { project_id: projectID, now: Date.now() },
  )) as { data: Record<string, unknown>[] };
  return Number(result.data?.[0]?.count ?? 0);
}

export async function purgeDeadLetters(
  db: GraphClient,
  projectID: string,
  before?: number,
): Promise<number> {
  const cypher = before != null
    ? `MATCH (q:QueueItem)
       WHERE q.project_id = $project_id
         AND q.status = 'failed'
         AND q.created_at < $before
       DELETE q
       RETURN count(q) AS count`
    : `MATCH (q:QueueItem)
       WHERE q.project_id = $project_id
         AND q.status = 'failed'
       DELETE q
       RETURN count(q) AS count`;

  const params: Record<string, string | number> = { project_id: projectID };
  if (before != null) params.before = before;

  const result = (await db.query(cypher, params)) as {
    data: Record<string, unknown>[];
  };
  return Number(result.data?.[0]?.count ?? 0);
}
