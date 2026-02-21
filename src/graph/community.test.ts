import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { connect } from "./client";
import { schema } from "./schema";
import { merge } from "../extraction";
import { detectCommunities, communityMembers } from "./community";
import { testDir } from "../test/tmpdir";

// Dedicated community detection tests — edge cases, convergence, and
// max_iterations behaviour not covered by episode-community.test.ts.

describe("community: large graph convergence", () => {
  const root = testDir("comm-large");

  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("detects communities in a 20-node graph with 3 clusters", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Build 3 clusters:
    //   Cluster 1: C1_0..C1_6 (7 nodes, fully interconnected pairs)
    //   Cluster 2: C2_0..C2_5 (6 nodes)
    //   Cluster 3: C3_0..C3_6 (7 nodes)
    const entities: Array<{
      action: "create";
      name: string;
      label_type: string;
      summary: string;
    }> = [];
    const relationships: Array<{
      source_name: string;
      target_name: string;
      name: string;
      fact: string;
    }> = [];

    for (const [prefix, size] of [
      ["C1", 7],
      ["C2", 6],
      ["C3", 7],
    ] as const) {
      for (let i = 0; i < size; i++) {
        entities.push({
          action: "create",
          name: `${prefix}_${i}`,
          label_type: "Concept",
          summary: `${prefix} node ${i}`,
        });
      }
      // Chain edges within cluster (each node connects to the next)
      for (let i = 0; i < size - 1; i++) {
        relationships.push({
          source_name: `${prefix}_${i}`,
          target_name: `${prefix}_${i + 1}`,
          name: "intra",
          fact: `${prefix}_${i} links to ${prefix}_${i + 1}`,
        });
      }
      // Close the loop to make a strong cluster
      if (size > 2) {
        relationships.push({
          source_name: `${prefix}_${size - 1}`,
          target_name: `${prefix}_0`,
          name: "intra",
          fact: `${prefix} loop close`,
        });
      }
    }

    await merge(
      db,
      { entities, relationships },
      { scope: "project", project_id: "lg-test", packs: ["coding"] },
    );

    const n = await detectCommunities(db, { project_id: "lg-test" });

    // Should detect exactly 3 communities (one per cluster)
    expect(n).toBe(3);

    // Verify every node in a cluster shares the same community_id
    for (const [prefix, size] of [
      ["C1", 7],
      ["C2", 6],
      ["C3", 7],
    ] as const) {
      const result = (await db.roQuery(
        `MATCH (e:Entity)
         WHERE e.project_id = 'lg-test' AND e.name STARTS WITH $prefix
         RETURN DISTINCT e.community_id AS cid`,
        { prefix: `${prefix}_` },
      )) as { data: Record<string, unknown>[] };

      expect(result.data.length).toBe(1);
    }

    await db.close();
  });
});

describe("community: max_iterations limit", () => {
  test("max_iterations=1 still assigns community_ids", async () => {
    const root = testDir("comm-maxiter");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Create a simple chain: A-B-C-D
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "A", label_type: "Concept", summary: "a" },
          { action: "create", name: "B", label_type: "Concept", summary: "b" },
          { action: "create", name: "C", label_type: "Concept", summary: "c" },
          { action: "create", name: "D", label_type: "Concept", summary: "d" },
        ],
        relationships: [
          { source_name: "A", target_name: "B", name: "r", fact: "A-B" },
          { source_name: "B", target_name: "C", name: "r", fact: "B-C" },
          { source_name: "C", target_name: "D", name: "r", fact: "C-D" },
        ],
      },
      { scope: "project", project_id: "mi-test", packs: ["coding"] },
    );

    const n = await detectCommunities(db, {
      project_id: "mi-test",
      max_iterations: 1,
    });

    // With only 1 iteration, labels may not converge fully, but every
    // entity must still receive a community_id.
    expect(n).toBeGreaterThanOrEqual(1);

    const result = (await db.roQuery(
      `MATCH (e:Entity)
       WHERE e.project_id = 'mi-test' AND e.community_id IS NOT NULL
       RETURN count(e) AS cnt`,
    )) as { data: Record<string, unknown>[] };

    expect(Number(result.data[0]!.cnt)).toBe(4);

    await db.close();
    await rm(root, { recursive: true, force: true });
  });

  test("max_iterations=0 assigns each node its own community", async () => {
    const root = testDir("comm-zero");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          { action: "create", name: "P", label_type: "Concept", summary: "p" },
          { action: "create", name: "Q", label_type: "Concept", summary: "q" },
        ],
        relationships: [
          { source_name: "P", target_name: "Q", name: "r", fact: "P-Q" },
        ],
      },
      { scope: "project", project_id: "z-test", packs: ["coding"] },
    );

    // With 0 iterations, no propagation occurs — each node keeps its own label
    const n = await detectCommunities(db, {
      project_id: "z-test",
      max_iterations: 0,
    });

    expect(n).toBe(2);

    await db.close();
    await rm(root, { recursive: true, force: true });
  });
});

describe("community: expired entity handling", () => {
  test("expired entities are excluded from community detection", async () => {
    const root = testDir("comm-expired");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Create 3 entities with relationships
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "Alive1", label_type: "Concept", summary: "a1" },
          { action: "create", name: "Alive2", label_type: "Concept", summary: "a2" },
          { action: "create", name: "WillExpire", label_type: "Concept", summary: "exp" },
        ],
        relationships: [
          { source_name: "Alive1", target_name: "WillExpire", name: "r", fact: "A1-WE" },
          { source_name: "WillExpire", target_name: "Alive2", name: "r", fact: "WE-A2" },
          { source_name: "Alive1", target_name: "Alive2", name: "r", fact: "A1-A2" },
        ],
      },
      { scope: "project", project_id: "exp-test", packs: ["coding"] },
    );

    // Expire one entity
    await db.query(
      `MATCH (e:Entity {name: 'WillExpire', project_id: 'exp-test'})
       SET e.expired_at = 1`,
    );

    const n = await detectCommunities(db, { project_id: "exp-test" });

    // Only 2 active entities, and they share an edge → 1 community
    expect(n).toBe(1);

    // Verify WillExpire was NOT given a new community_id
    // (It may retain an old one from before expiration, but detectCommunities
    // only writes to non-expired entities, so check the active ones.)
    const result = (await db.roQuery(
      `MATCH (e:Entity)
       WHERE e.project_id = 'exp-test' AND e.expired_at IS NULL AND e.community_id IS NOT NULL
       RETURN e.name AS name, e.community_id AS cid`,
    )) as { data: Record<string, unknown>[] };

    expect(result.data.length).toBe(2);
    const names = result.data.map((r) => r.name as string).sort();
    expect(names).toEqual(["Alive1", "Alive2"]);

    // Both should share the same community
    const cids = result.data.map((r) => r.cid);
    expect(cids[0]).toBe(cids[1]);

    await db.close();
    await rm(root, { recursive: true, force: true });
  });

  test("expired edges are excluded from adjacency", async () => {
    const root = testDir("comm-exp-edge");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Create a triangle: M-N-O all connected
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "M", label_type: "Concept", summary: "m" },
          { action: "create", name: "N", label_type: "Concept", summary: "n" },
          { action: "create", name: "O", label_type: "Concept", summary: "o" },
        ],
        relationships: [
          { source_name: "M", target_name: "N", name: "r", fact: "M-N" },
          { source_name: "N", target_name: "O", name: "r", fact: "N-O" },
          { source_name: "M", target_name: "O", name: "r", fact: "M-O" },
        ],
      },
      { scope: "project", project_id: "ee-test", packs: ["coding"] },
    );

    // Expire the M-N and M-O edges, leaving only N-O
    await db.query(
      `MATCH (a:Entity {name: 'M', project_id: 'ee-test'})-[r:RELATES_TO]-(b:Entity)
       SET r.expired_at = 1`,
    );

    const n = await detectCommunities(db, { project_id: "ee-test" });

    // M is now isolated (no active edges), N-O form a pair → 2 communities
    expect(n).toBe(2);

    // N and O should share a community
    const result = (await db.roQuery(
      `MATCH (e:Entity)
       WHERE e.project_id = 'ee-test' AND e.community_id IS NOT NULL
       RETURN e.name AS name, e.community_id AS cid`,
    )) as { data: Record<string, unknown>[] };

    const cidMap = new Map(
      result.data.map((r) => [r.name as string, r.cid as number]),
    );
    expect(cidMap.get("N")).toBe(cidMap.get("O"));
    expect(cidMap.get("M")).not.toBe(cidMap.get("N"));

    await db.close();
    await rm(root, { recursive: true, force: true });
  });
});

describe("community: communityMembers edge cases", () => {
  const root = testDir("comm-members");

  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("returns empty array for entity with no community_id", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Create entity without running detectCommunities
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "Lonely", label_type: "Concept", summary: "no community" },
        ],
        relationships: [],
      },
      { scope: "project", project_id: "mem-test", packs: ["coding"] },
    );

    // Get the uuid
    const result = (await db.roQuery(
      `MATCH (e:Entity {name: 'Lonely', project_id: 'mem-test'})
       RETURN e.uuid AS uuid`,
    )) as { data: Record<string, unknown>[] };

    const uuid = result.data[0]!.uuid as string;
    const members = await communityMembers(db, uuid, { project_id: "mem-test" });

    // No community_id set, so the seed WHERE clause fails → empty result
    expect(members).toEqual([]);

    await db.close();
  });

  test("respects limit parameter", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Create a cluster of 5 nodes
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "H1", label_type: "Concept", summary: "h1" },
          { action: "create", name: "H2", label_type: "Concept", summary: "h2" },
          { action: "create", name: "H3", label_type: "Concept", summary: "h3" },
          { action: "create", name: "H4", label_type: "Concept", summary: "h4" },
          { action: "create", name: "H5", label_type: "Concept", summary: "h5" },
        ],
        relationships: [
          { source_name: "H1", target_name: "H2", name: "r", fact: "H1-H2" },
          { source_name: "H2", target_name: "H3", name: "r", fact: "H2-H3" },
          { source_name: "H3", target_name: "H4", name: "r", fact: "H3-H4" },
          { source_name: "H4", target_name: "H5", name: "r", fact: "H4-H5" },
          { source_name: "H5", target_name: "H1", name: "r", fact: "H5-H1" },
        ],
      },
      { scope: "project", project_id: "mem-test", packs: ["coding"] },
    );

    await detectCommunities(db, { project_id: "mem-test" });

    // Get H1's UUID
    const h1 = (await db.roQuery(
      `MATCH (e:Entity {name: 'H1', project_id: 'mem-test'})
       RETURN e.uuid AS uuid`,
    )) as { data: Record<string, unknown>[] };

    const uuid = h1.data[0]!.uuid as string;

    // Request with limit=2 — should return at most 2 members
    const members = await communityMembers(db, uuid, {
      project_id: "mem-test",
      limit: 2,
    });

    expect(members.length).toBeLessThanOrEqual(2);
    expect(members.length).toBeGreaterThan(0);

    await db.close();
  });

  test("returns empty for non-existent UUID", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    const members = await communityMembers(db, "non-existent-uuid", {
      project_id: "mem-test",
    });

    expect(members).toEqual([]);
    await db.close();
  });
});

describe("community: idempotency", () => {
  test("running detectCommunities twice yields same result", async () => {
    const root = testDir("comm-idem");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          { action: "create", name: "R1", label_type: "Concept", summary: "r1" },
          { action: "create", name: "R2", label_type: "Concept", summary: "r2" },
          { action: "create", name: "R3", label_type: "Concept", summary: "r3" },
        ],
        relationships: [
          { source_name: "R1", target_name: "R2", name: "r", fact: "R1-R2" },
          { source_name: "R2", target_name: "R3", name: "r", fact: "R2-R3" },
        ],
      },
      { scope: "project", project_id: "idem-test", packs: ["coding"] },
    );

    const n1 = await detectCommunities(db, { project_id: "idem-test" });
    const n2 = await detectCommunities(db, { project_id: "idem-test" });

    // Both runs should produce the same community count
    expect(n1).toBe(n2);

    // All entities should still have community_id set
    const result = (await db.roQuery(
      `MATCH (e:Entity)
       WHERE e.project_id = 'idem-test' AND e.community_id IS NOT NULL
       RETURN count(e) AS cnt`,
    )) as { data: Record<string, unknown>[] };

    expect(Number(result.data[0]!.cnt)).toBe(3);

    await db.close();
    await rm(root, { recursive: true, force: true });
  });
});

describe("community: single entity graph", () => {
  test("single entity with no edges gets community_id=1", async () => {
    const root = testDir("comm-single");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          { action: "create", name: "OnlyOne", label_type: "Concept", summary: "solo" },
        ],
        relationships: [],
      },
      { scope: "project", project_id: "single-test", packs: ["coding"] },
    );

    const n = await detectCommunities(db, { project_id: "single-test" });
    expect(n).toBe(1);

    const result = (await db.roQuery(
      `MATCH (e:Entity {name: 'OnlyOne', project_id: 'single-test'})
       RETURN e.community_id AS cid`,
    )) as { data: Record<string, unknown>[] };

    // Community IDs start at 1
    expect(result.data[0]!.cid).toBe(1);

    await db.close();
    await rm(root, { recursive: true, force: true });
  });
});

describe("community: project scoping", () => {
  test("entities from different projects are isolated", async () => {
    const root = testDir("comm-scope");
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Create entities in project-A
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "PA1", label_type: "Concept", summary: "pa1" },
          { action: "create", name: "PA2", label_type: "Concept", summary: "pa2" },
        ],
        relationships: [
          { source_name: "PA1", target_name: "PA2", name: "r", fact: "PA1-PA2" },
        ],
      },
      { scope: "project", project_id: "proj-A", packs: ["coding"] },
    );

    // Create entities in project-B
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "PB1", label_type: "Concept", summary: "pb1" },
          { action: "create", name: "PB2", label_type: "Concept", summary: "pb2" },
          { action: "create", name: "PB3", label_type: "Concept", summary: "pb3" },
        ],
        relationships: [
          { source_name: "PB1", target_name: "PB2", name: "r", fact: "PB1-PB2" },
          { source_name: "PB2", target_name: "PB3", name: "r", fact: "PB2-PB3" },
        ],
      },
      { scope: "project", project_id: "proj-B", packs: ["coding"] },
    );

    // Detect communities for project-A only
    const nA = await detectCommunities(db, { project_id: "proj-A" });
    expect(nA).toBe(1);

    // Detect communities for project-B only
    const nB = await detectCommunities(db, { project_id: "proj-B" });
    expect(nB).toBe(1);

    await db.close();
    await rm(root, { recursive: true, force: true });
  });
});
