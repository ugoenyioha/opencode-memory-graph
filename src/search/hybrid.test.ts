import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { search } from "./hybrid";

const root = path.join(process.cwd(), ".tmp", "p4-search");

describe("search mvp", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("recency decay prefers newer project memories", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);
    await db.query(`
      CREATE (a:Entity {
        uuid: 'ent_old',
        name: 'Memory graph old',
        summary: 'memory graph old',
        label_type: 'Concept',
        labels: ['Entity','Concept'],
        attributes: '{}',
        scope: 'project',
        project_id: 'default',
        source: 'auto',
        confidence: 'confirmed',
        validated_at: 1,
        ttl: null,
        created_at: 1
      })
    `);
    await db.query(`
      CREATE (b:Entity {
        uuid: 'ent_new',
        name: 'Memory graph new',
        summary: 'memory graph new',
        label_type: 'Concept',
        labels: ['Entity','Concept'],
        attributes: '{}',
        scope: 'project',
        project_id: 'default',
        source: 'auto',
        confidence: 'confirmed',
        validated_at: 2,
        ttl: null,
        created_at: ${Date.now()}
      })
    `);

    const out = await search(db, {
      query: "memory graph",
      scope: "project",
      limit: 2,
      project_id: "default",
    });
    expect(out.length).toBe(2);
    expect(out[0]?.uuid).toBe("ent_new");
    await db.close();
  });

  test("deterministic ordering across repeated calls", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);
    const a = await search(db, {
      query: "memory graph",
      scope: "project",
      limit: 2,
      project_id: "default",
    });
    const b = await search(db, {
      query: "memory graph",
      scope: "project",
      limit: 2,
      project_id: "default",
    });
    expect(a.map((x) => x.uuid)).toEqual(b.map((x) => x.uuid));
    await db.close();
  });
});
