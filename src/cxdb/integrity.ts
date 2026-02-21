import type { GraphClient } from "../graph/client";
import type { TruthLog } from "./interface";
import { MUTATION_TYPE } from "./types";

export async function integrity(
  log: TruthLog,
  db: GraphClient,
  project_id: string,
) {
  const contexts = log.contexts({ limit: 100_000 });
  const turns = contexts.flatMap((item) => log.turns(item.context_id));
  const batches = turns.filter(
    (item) => item.type_id === MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
  ).length;

  const entities = (await db.roQuery(
    `MATCH (e:Entity)
     WHERE e.project_id = $project_id
       AND e.expired_at IS NULL
     RETURN COUNT(e) AS total`,
    { project_id },
  )) as { data: Record<string, unknown>[] };

  const total = Number(entities.data[0]?.total ?? 0);

  return {
    contexts: contexts.length,
    turns: turns.length,
    extraction_turns: batches,
    graph_entities: total,
    ok: turns.length >= batches,
  };
}
