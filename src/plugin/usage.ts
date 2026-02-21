import type { GraphClient } from "../graph/client";
import { mutation } from "../graph/ids";

export function toolName(input: unknown) {
  if (!input || typeof input !== "object") return "unknown";
  const map = input as Record<string, unknown>;
  const name =
    map.tool ??
    map.toolName ??
    map.name ??
    map.id ??
    map.identifier ??
    "unknown";
  return typeof name === "string" && name.trim().length > 0 ? name : "unknown";
}

export async function record(
  db: GraphClient,
  input: {
    project_id: string;
    session_id?: string;
    tool: string;
  },
) {
  const now = Date.now();
  const uuid = mutation(`tool:${input.project_id}`, input.tool);
  await db.query(
    `MERGE (u:ToolUsage {uuid: $uuid})
     ON CREATE SET
       u.project_id = $project_id,
       u.scope = 'project',
       u.tool = $tool,
       u.count = 1,
       u.last_session_id = $session_id,
       u.created_at = $now,
       u.updated_at = $now
     ON MATCH SET
       u.count = coalesce(u.count, 0) + 1,
       u.last_session_id = $session_id,
       u.updated_at = $now`,
    {
      uuid,
      project_id: input.project_id,
      tool: input.tool,
      session_id: input.session_id ?? "",
      now,
    },
  );
}
