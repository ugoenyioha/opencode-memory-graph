import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { sqlite } from "./sqlite";
import { integrity } from "./integrity";
import { MUTATION_TYPE } from "./types";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { testDir } from "../test/tmpdir";

const root = testDir("p3-integrity");

describe("cxdb integrity", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("returns basic integrity counters", async () => {
    const log = sqlite(path.join(root, "truth.sqlite"));
    const ctx = log.createContext();
    log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: { result: { entities: [], relationships: [] }, options: {} },
    });

    const db = await connect({ mode: "local", path: path.join(root, "graph") });
    await schema(db);

    const out = await integrity(log, db, "project-x");
    expect(out.contexts).toBe(1);
    expect(out.turns).toBe(1);
    expect(out.extraction_turns).toBe(1);
    expect(out.ok).toBe(true);

    await db.close();
    log.close();
  });
});
