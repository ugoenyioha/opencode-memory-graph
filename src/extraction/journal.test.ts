import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { merge } from "./index";
import { sqlite } from "../cxdb/sqlite";
import { MUTATION_TYPE } from "../cxdb/types";

const root = path.join(process.cwd(), ".tmp", "p2-extraction-journal");

describe("extraction journal integration", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("merge appends memory.extraction.batch turn when truthlog is enabled", async () => {
    const db = await connect({ mode: "local", path: path.join(root, "graph") });
    await schema(db);
    const log = sqlite(path.join(root, "truth.sqlite"));
    const ctx = log.createContext();

    await merge(
      db,
      {
        entities: [
          {
            action: "create",
            name: "journaled-entity",
            label_type: "Concept",
            summary: "for journal test",
          },
        ],
        relationships: [],
      },
      {
        project_id: "project-journal",
        mutation_key: "journal:1",
        packs: ["coding"],
        truthlog: { log, context_id: ctx.context_id },
      },
    );

    const turns = log.turns(ctx.context_id, { after: -1 });
    expect(turns.length).toBe(1);
    expect(turns[0]?.type_id).toBe(MUTATION_TYPE.MEMORY_EXTRACTION_BATCH);

    log.close();
    await db.close();
  });
});
