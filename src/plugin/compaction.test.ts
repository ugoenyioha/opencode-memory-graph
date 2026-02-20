import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { precompact, summarize } from "./compaction";

const root = path.join(process.cwd(), ".tmp", "compaction");

describe("pre-compaction snapshot", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("summarize ignores synthetic parts and truncates", () => {
    const out = summarize([
      {
        info: { id: "m1" },
        parts: [
          { type: "text", text: "hello" },
          { type: "text", text: "synthetic", synthetic: true },
        ],
      },
    ]);
    expect(out).toBe("hello");
  });

  test("precompact persists once with idempotent key", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    const client = {
      session: {
        messages: async () => ({
          data: [
            {
              info: { id: "m1" },
              parts: [{ type: "text", text: "first" }],
            },
            {
              info: { id: "m2" },
              parts: [{ type: "text", text: "second" }],
            },
          ],
        }),
      },
    };

    const a = await precompact(client, db, {
      sessionID: "s1",
      directory: "project-a",
      packs: ["coding"],
    });
    const b = await precompact(client, db, {
      sessionID: "s1",
      directory: "project-a",
      packs: ["coding"],
    });

    const entities = (await db.roQuery(
      `MATCH (e:Entity) WHERE e.name STARTS WITH 'compaction:s1:' RETURN count(e) AS count`,
    )) as { data: Record<string, unknown>[] };
    const mutations = (await db.roQuery(
      `MATCH (m:Mutation) WHERE m.scope = 'project:project-a' RETURN count(m) AS count`,
    )) as { data: Record<string, unknown>[] };

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(entities.data[0]?.count).toBe(1);
    expect(mutations.data[0]?.count).toBe(1);
    await db.close();
  });
});
