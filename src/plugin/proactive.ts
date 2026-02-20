// Proactive lesson surfacing
//
// On each new message, embed the message and compare against trigger_embedding
// of active Lesson entities. If similarity exceeds threshold, return a warning
// to inject into the assistant's context.

import type { GraphClient } from "../graph/client";
import { embed } from "../embedding";
import { neutralize } from "../security/redact";

export type Warning = {
  uuid: string;
  name: string;
  summary: string;
  severity: string;
  resolution?: string;
};

const THRESHOLDS = {
  blocker: 0.75,
  warning: 0.85,
} as const;

function attrs(value: unknown) {
  if (typeof value !== "string") return {} as Record<string, string>;
  try {
    const out = JSON.parse(value) as unknown;
    if (!out || typeof out !== "object") return {};
    return out as Record<string, string>;
  } catch {
    return {};
  }
}

export function pick(rows: Record<string, unknown>[]) {
  return rows.flatMap((row) => {
    const score = row.score as number;
    const map = attrs(row.attributes);
    const severity = map.severity ?? "warning";
    const threshold =
      THRESHOLDS[severity as keyof typeof THRESHOLDS] ?? THRESHOLDS.warning;
    if (score < threshold) return [];
    return [
      {
        uuid: row.uuid as string,
        name: row.name as string,
        summary: row.summary as string,
        severity,
        resolution: map.resolution,
      } satisfies Warning,
    ];
  });
}

export async function check(
  db: GraphClient,
  message: string,
): Promise<Warning[]> {
  const vec = await embed(message);
  if (!vec) return [];

  const result = (await db.roQuery(
    `CALL db.idx.vector.queryNodes('Entity', 'trigger_embedding', 5, vecf32($vec))
     YIELD node, score
     WHERE node.label_type = 'Lesson' AND node.expired_at IS NULL
     RETURN node.uuid AS uuid, node.name AS name, node.summary AS summary,
            node.attributes AS attributes, score AS score
     ORDER BY score DESC`,
    { vec },
  )) as { data: Record<string, unknown>[] };

  return pick(result.data ?? []);
}

export function format(warnings: Warning[]): string {
  if (warnings.length === 0) return "";
  const lines = warnings.map((w) => {
    const icon = w.severity === "blocker" ? "🚫" : "⚠️";
    const res = w.resolution
      ? ` Recommendation: ${JSON.stringify(neutralize(String(w.resolution)))}`
      : "";
    return `${icon} ${JSON.stringify(neutralize(String(w.name)))}: ${JSON.stringify(neutralize(String(w.summary)))}${res}`;
  });
  return `\n---\n**Memory warnings:**\n${lines.join("\n")}\n---`;
}
