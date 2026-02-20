// Proactive lesson surfacing
//
// On each new message, embed the message and compare against trigger_embedding
// of active Lesson entities. If similarity exceeds threshold, return a warning
// to inject into the assistant's context.

import type { GraphClient } from "../graph/client";
import { embed } from "../embedding";

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

export async function check(
  db: GraphClient,
  message: string,
): Promise<Warning[]> {
  const vec = await embed(message);
  if (!vec) return [];

  const vecStr = `[${vec.join(",")}]`;
  const result = (await db.roQuery(
    `CALL db.idx.vector.queryNodes('Entity', 'trigger_embedding', 5, vecf32(${vecStr}))
     YIELD node, score
     WHERE node.label_type = 'Lesson'
     RETURN node.uuid, node.name, node.summary, node.attributes, score
     ORDER BY score DESC`,
  )) as { data: unknown[][] };

  const warnings: Warning[] = [];
  for (const row of result.data ?? []) {
    const score = row[4] as number;
    let attrs: Record<string, string> = {};
    try {
      attrs = JSON.parse(row[3] as string);
    } catch {}

    const severity = attrs.severity ?? "warning";
    const threshold =
      THRESHOLDS[severity as keyof typeof THRESHOLDS] ?? THRESHOLDS.warning;

    if (score >= threshold) {
      warnings.push({
        uuid: row[0] as string,
        name: row[1] as string,
        summary: row[2] as string,
        severity,
        resolution: attrs.resolution,
      });
    }
  }

  return warnings;
}

export function format(warnings: Warning[]): string {
  if (warnings.length === 0) return "";
  const lines = warnings.map((w) => {
    const icon = w.severity === "blocker" ? "🚫" : "⚠️";
    const res = w.resolution ? ` Recommendation: ${w.resolution}` : "";
    return `${icon} **${w.name}**: ${w.summary}${res}`;
  });
  return `\n---\n**Memory warnings:**\n${lines.join("\n")}\n---`;
}
