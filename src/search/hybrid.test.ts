import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { applyUsageBoost, expandQuery, rerankMMR, search } from "./hybrid";

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

  test("graph traversal surfaces connected entities", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);
    await db.query(`
      CREATE (a:Entity {
        uuid: 'seed_falkordb',
        name: 'FalkorDB',
        summary: 'graph database',
        label_type: 'Tool',
        labels: ['Entity','Tool'],
        attributes: '{}',
        scope: 'project',
        project_id: 'default',
        source: 'auto',
        confidence: 'confirmed',
        validated_at: 1,
        ttl: null,
        created_at: ${Date.now()}
      })
    `);
    await db.query(`
      CREATE (b:Entity {
        uuid: 'decision_remote',
        name: 'Use one graph backend',
        summary: 'same backend for local and remote modes',
        label_type: 'Decision',
        labels: ['Entity','Decision'],
        attributes: '{}',
        scope: 'project',
        project_id: 'default',
        source: 'auto',
        confidence: 'confirmed',
        validated_at: 1,
        ttl: null,
        created_at: ${Date.now()}
      })
    `);
    await db.query(`
      MATCH (a:Entity {uuid: 'seed_falkordb'}), (b:Entity {uuid: 'decision_remote'})
      CREATE (a)-[:RELATES_TO {
        uuid: 'rel_1',
        name: 'supports',
        fact: 'falkordb supports remote and local consistency',
        confidence: 'confirmed',
        source: 'auto',
        attributes: '{}',
        created_at: ${Date.now()},
        valid_at: null,
        invalid_at: null,
        expired_at: null,
        scope: 'project',
        project_id: 'default'
      }]->(b)
    `);

    const out = await search(db, {
      query: "falkordb",
      scope: "project",
      limit: 5,
      project_id: "default",
    });
    expect(out.some((item) => item.uuid === "decision_remote")).toBe(true);
    await db.close();
  });

  test("query expansion appends extracted keywords", () => {
    const out = expandQuery("what is the best graph database for memory");
    expect(out.includes("graph")).toBe(true);
    expect(out.length).toBeGreaterThan(
      "what is the best graph database for memory".length,
    );
  });

  test("mmr reranking keeps diverse result when scores tie", () => {
    const out = rerankMMR(
      [
        {
          uuid: "a",
          name: "falkordb memory graph",
          type: "Concept",
          summary: "falkordb memory graph",
          score: 1,
        },
        {
          uuid: "b",
          name: "falkordb memory graph",
          type: "Concept",
          summary: "falkordb memory graph",
          score: 1,
        },
        {
          uuid: "c",
          name: "spicedb authorization",
          type: "Concept",
          summary: "permissions graph",
          score: 0.95,
        },
      ],
      2,
    );
    expect(out.length).toBe(2);
    expect(out.some((item) => item.uuid === "c")).toBe(true);
  });

  test("usage boost favors memories aligned with frequently used tools", () => {
    const now = Date.now();
    const out = applyUsageBoost(
      [
        {
          uuid: "a",
          name: "Shell workflow",
          type: "Concept",
          summary: "use bash for verification",
          score: 1,
        },
        {
          uuid: "b",
          name: "Other memory",
          type: "Concept",
          summary: "unrelated note",
          score: 1,
        },
      ],
      [
        {
          tool: "bash",
          count: 20,
          updated_at: now,
        },
      ],
      now,
    );
    expect(out.find((item) => item.uuid === "a")!.score).toBeGreaterThan(
      out.find((item) => item.uuid === "b")!.score,
    );
  });
});
