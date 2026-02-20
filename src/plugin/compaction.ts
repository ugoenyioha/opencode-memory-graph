import type { GraphClient } from "../graph/client";
import { merge } from "../extraction";

const MIN_MESSAGES = 3;
const COOLDOWN_MS = 30_000;
const seen = new Map<string, number>();

type SessionMessage = {
  info: { id: string };
  parts: Array<{
    type: string;
    text?: string;
    synthetic?: boolean;
    ignored?: boolean;
  }>;
};

export function summarize(messages: SessionMessage[]) {
  const text = messages
    .flatMap((message) =>
      message.parts
        .filter(
          (part) => part.type === "text" && !part.synthetic && !part.ignored,
        )
        .map((part) => part.text?.trim() ?? ""),
    )
    .filter((part) => part.length > 0)
    .slice(-40)
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "";
  return text.slice(0, 2000);
}

export function shouldCompact(
  sessionID: string,
  count: number,
  now = Date.now(),
) {
  if (count < MIN_MESSAGES) return false;
  const last = seen.get(sessionID) ?? 0;
  if (now - last < COOLDOWN_MS) return false;
  seen.set(sessionID, now);
  return true;
}

export function resetCompactionPolicy() {
  seen.clear();
}

export async function precompact(
  client: {
    session: {
      messages: (input: {
        sessionID: string;
        directory?: string;
        limit?: number;
      }) => Promise<{ data?: SessionMessage[]; error?: unknown }>;
    };
  },
  db: GraphClient,
  input: {
    sessionID: string;
    directory: string;
    packs: Array<
      string | { name: string; labels: { name: string; description: string }[] }
    >;
  },
) {
  const result = await client.session.messages({
    sessionID: input.sessionID,
    directory: input.directory,
    limit: 200,
  });
  if (result.error || !result.data) return false;

  const summary = summarize(result.data);
  if (!summary) return false;
  if (!shouldCompact(input.sessionID, result.data.length)) return false;

  const last = result.data[result.data.length - 1]?.info.id ?? "none";
  const key = `compact:${input.sessionID}:${last}`;

  await merge(
    db,
    {
      entities: [
        {
          action: "create",
          name: `compaction:${input.sessionID}:${last}`,
          label_type: "Concept",
          summary,
          scope: "project",
          source: "auto",
          confidence: "suspected",
          attributes: {
            kind: "precompact_snapshot",
            session_id: input.sessionID,
            last_message_id: last,
          },
        },
      ],
      relationships: [],
    },
    {
      scope: "project",
      project_id: input.directory,
      mutation_key: key,
      packs: input.packs,
    },
  );

  return true;
}
