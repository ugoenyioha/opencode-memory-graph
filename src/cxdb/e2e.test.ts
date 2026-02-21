import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { merge } from "../extraction";
import { sqlite } from "./sqlite";
import { replay } from "./replay";
import { serveCxdb } from "./server";

const root = path.join(process.cwd(), ".tmp", "p7-e2e");

describe("truthlog e2e", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("extract -> journal -> rebuild -> cxdb api", async () => {
    const log = sqlite(path.join(root, "truth.sqlite"));
    const ctx = log.createContext();
    const db = await connect({ mode: "local", path: path.join(root, "graph") });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          {
            action: "create",
            name: "e2e:entity",
            label_type: "Concept",
            summary: "from e2e",
          },
        ],
        relationships: [],
      },
      {
        project_id: "project-e2e",
        mutation_key: "e2e:1",
        packs: ["coding"],
        truthlog: { log, context_id: ctx.context_id },
      },
    );

    await db.query("MATCH (n) DETACH DELETE n");
    await replay(log, db, ctx.context_id, { from: -1 });

    const row = (await db.roQuery(
      `MATCH (e:Entity {name: 'e2e:entity'}) RETURN COUNT(e) AS total`,
    )) as { data: Record<string, unknown>[] };
    expect(Number(row.data[0]?.total ?? 0)).toBe(1);

    const server = serveCxdb({
      path: path.join(root, "truth.sqlite"),
      port: 0,
    });
    const out = await fetch(
      `http://127.0.0.1:${server.port}/v1/contexts/${ctx.context_id}/turns?limit=10`,
    ).then((res) => res.json());
    expect(Array.isArray(out.turns)).toBe(true);
    expect(out.turns.length).toBe(1);
    server.stop(true);

    await db.close();
    log.close();
  });
});
