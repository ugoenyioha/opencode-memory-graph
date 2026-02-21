import type { TruthLog } from "./interface";
import { MUTATION_TYPE } from "./types";

export type JournalConfig = {
  log: TruthLog;
  context_id: number;
};

export type ExtractionBatch = {
  result: unknown;
  options: {
    mutation_key?: string;
    scope?: "global" | "project" | "session";
    project_id?: string;
    trusted_global?: boolean;
    packs?: Array<unknown>;
  };
};

export function extractionBatch(input: JournalConfig, value: ExtractionBatch) {
  return input.log.append({
    context_id: input.context_id,
    type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
    type_version: 1,
    payload: value,
    idempotency_key: value.options.mutation_key,
  });
}

export function compactionSnapshot(
  input: JournalConfig,
  value: {
    session_id: string;
    last_message_id: string;
    summary: string;
  },
) {
  return input.log.append({
    context_id: input.context_id,
    type_id: MUTATION_TYPE.MEMORY_COMPACTION_SNAPSHOT,
    type_version: 1,
    payload: value,
    idempotency_key: `compaction:${value.session_id}:${value.last_message_id}`,
  });
}
