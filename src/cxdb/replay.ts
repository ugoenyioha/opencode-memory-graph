import { decode } from "@msgpack/msgpack";
import type { GraphClient } from "../graph/client";
import { merge, type ExtractionResult } from "../extraction";
import type { TruthLog } from "./interface";
import { MUTATION_TYPE } from "./types";

type Batch = {
  result: ExtractionResult;
  options?: {
    mutation_key?: string;
    scope?: "global" | "project" | "session";
    project_id?: string;
    trusted_global?: boolean;
    packs?: Array<
      string | { name: string; labels: { name: string; description: string }[] }
    >;
  };
};

export async function replay(
  log: TruthLog,
  db: GraphClient,
  context_id: number,
  input?: { from?: number },
) {
  const from = input?.from ?? log.watermark(context_id);
  const turns = log.turns(context_id, { after: from, limit: 100_000 });
  let applied = 0;

  for (const turn of turns) {
    if (turn.type_id !== MUTATION_TYPE.MEMORY_EXTRACTION_BATCH) {
      log.setWatermark(context_id, turn.idx);
      continue;
    }

    const bytes = log.payload(turn.payload_hash);
    if (!bytes) {
      log.setWatermark(context_id, turn.idx);
      continue;
    }

    let decoded: Batch | null = null;
    try {
      decoded = decode(bytes) as Batch;
    } catch {
      decoded = null;
    }

    if (!decoded?.result) {
      log.setWatermark(context_id, turn.idx);
      continue;
    }

    await merge(db, decoded.result, {
      mutation_key: decoded.options?.mutation_key,
      scope: decoded.options?.scope,
      project_id: decoded.options?.project_id,
      trusted_global: decoded.options?.trusted_global,
      packs: decoded.options?.packs,
      from_truthlog: true,
    });

    log.setWatermark(context_id, turn.idx);
    applied += 1;
  }

  return {
    applied,
    watermark: log.watermark(context_id),
  };
}

export async function rebuild(log: TruthLog, db: GraphClient) {
  const rows = log.contexts({ limit: 100_000 });
  let applied = 0;

  for (const row of rows) {
    log.setWatermark(row.context_id, 0);
    const out = await replay(log, db, row.context_id, { from: -1 });
    applied += out.applied;
  }

  return { contexts: rows.length, applied };
}
