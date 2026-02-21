import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { sqlite } from "./sqlite";
import { replay } from "./replay";
import { MUTATION_TYPE } from "./types";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { testDir } from "../test/tmpdir";

const root = testDir("p3-replay");

describe("cxdb replay", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("replay applies extraction batch turns and updates watermark", async () => {
    const log = sqlite(path.join(root, "truth.sqlite"));
    const ctx = log.createContext();

    log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: {
        result: {
          entities: [
            {
              action: "create",
              name: "replay:entity",
              label_type: "Concept",
              summary: "from replay",
              scope: "project",
            },
          ],
          relationships: [],
        },
        options: {
          mutation_key: "replay:1",
          scope: "project",
          project_id: "project-replay",
          packs: ["coding"],
        },
      },
      idempotency_key: "replay:1",
    });

    const db = await connect({ mode: "local", path: path.join(root, "graph") });
    await schema(db);
    const out = await replay(log, db, ctx.context_id, { from: -1 });

    expect(out.applied).toBe(1);
    expect(out.watermark).toBeGreaterThanOrEqual(0);

    const row = (await db.roQuery(
      `MATCH (e:Entity {name: 'replay:entity'}) RETURN COUNT(e) AS total`,
    )) as { data: Record<string, unknown>[] };
    expect(Number(row.data[0]?.total ?? 0)).toBe(1);

    await db.close();
    log.close();
  });
});
