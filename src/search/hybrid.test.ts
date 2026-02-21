import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { applyUsageBoost, expandQuery, rerankMMR, search } from "./hybrid";
import { merge } from "../extraction";
import { detectCommunities } from "../graph/community";

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

describe("episode coherence + community boost in search (fix-11)", () => {
  const searchRoot = path.join(process.cwd(), ".tmp", "p4-srch2");

  beforeAll(async () => {
    await rm(searchRoot, { recursive: true, force: true });
    await mkdir(searchRoot, { recursive: true });
  });

  afterAll(async () => {
    await rm(searchRoot, { recursive: true, force: true });
  });

  test("search surfaces co-episode and community-adjacent entities", async () => {
    const db = await connect({ mode: "local", path: searchRoot });
    await schema(db);

    // Create entities with session context (triggers episode creation)
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "Redis caching", label_type: "Concept", summary: "in-memory caching with Redis" },
          { action: "create", name: "Session store", label_type: "Component", summary: "session persistence layer" },
          { action: "create", name: "Cache invalidation", label_type: "Pattern", summary: "cache invalidation strategies" },
        ],
        relationships: [
          { source_name: "Redis caching", target_name: "Session store", name: "implements", fact: "Redis implements session store" },
          { source_name: "Redis caching", target_name: "Cache invalidation", name: "requires", fact: "Redis caching requires invalidation" },
        ],
      },
      {
        scope: "project",
        project_id: "srch2-test",
        session_id: "srch2-sess",
        packs: ["coding"],
      },
    );

    // Run community detection so community boost can work
    await detectCommunities(db, { project_id: "srch2-test" });

    // Search for "Redis" — should surface connected entities via both
    // episode coherence (co-mentioned in same episode) and community boost
    const results = await search(db, {
      query: "Redis caching",
      limit: 10,
      project_id: "srch2-test",
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    // At minimum, the directly matching entity should appear
    expect(results.some((r) => r.name === "Redis caching")).toBe(true);
    // Graph traversal + episode coherence should surface related entities
    const names = results.map((r) => r.name);
    // Session store or Cache invalidation should appear via graph or episode signals
    const hasRelated =
      names.includes("Session store") || names.includes("Cache invalidation");
    expect(hasRelated).toBe(true);

    await db.close();
  });
});
