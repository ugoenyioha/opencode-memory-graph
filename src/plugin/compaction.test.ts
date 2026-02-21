import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { sqlite } from "../cxdb/sqlite";
import { MUTATION_TYPE } from "../cxdb/types";
import {
  precompact,
  resetCompactionPolicy,
  shouldCompact,
  summarize,
} from "./compaction";
import { testDir } from "../test/tmpdir";

const root = testDir("compaction");

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

  test("policy blocks compact when transcript is too short", () => {
    resetCompactionPolicy();
    expect(shouldCompact("s-short", 2, 100)).toBe(false);
  });

  test("precompact persists once with idempotent key", async () => {
    resetCompactionPolicy();
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
            {
              info: { id: "m3" },
              parts: [{ type: "text", text: "third" }],
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
    expect(b).toBe(false);
    expect(entities.data[0]?.count).toBe(1);
    expect(mutations.data[0]?.count).toBe(1);
    await db.close();
  });

  test("precompact appends compaction snapshot to truthlog", async () => {
    resetCompactionPolicy();
    const db = await connect({
      mode: "local",
      path: path.join(root, "with-log"),
    });
    await schema(db);
    const log = sqlite(path.join(root, "compaction-truth.sqlite"));
    const ctx = log.createContext();

    const client = {
      session: {
        messages: async () => ({
          data: [
            {
              info: { id: "a" },
              parts: [{ type: "text", text: "one" }],
            },
            {
              info: { id: "b" },
              parts: [{ type: "text", text: "two" }],
            },
            {
              info: { id: "c" },
              parts: [{ type: "text", text: "three" }],
            },
          ],
        }),
      },
    };

    const ok = await precompact(client, db, {
      sessionID: "s2",
      directory: "project-b",
      packs: ["coding"],
      truthlog: { log, context_id: ctx.context_id },
    });

    const turns = log.turns(ctx.context_id, { after: -1, limit: 10 });
    expect(ok).toBe(true);
    expect(
      turns.some(
        (item) => item.type_id === MUTATION_TYPE.MEMORY_COMPACTION_SNAPSHOT,
      ),
    ).toBe(true);

    log.close();
    await db.close();
  });
});
