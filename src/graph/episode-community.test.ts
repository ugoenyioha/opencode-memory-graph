import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "./client";
import { schema } from "./schema";
import { merge } from "../extraction";
import { detectCommunities, communityMembers } from "./community";
import { episode as episodeId } from "./ids";

const root = path.join(process.cwd(), ".tmp", "ep-comm");

describe("episode creation", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("merge with session_id creates Episode node", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          {
            action: "create",
            name: "React",
            label_type: "Tool",
            summary: "A JavaScript library for building UIs",
          },
          {
            action: "create",
            name: "Next.js",
            label_type: "Tool",
            summary: "React framework for production",
          },
        ],
        relationships: [
          {
            source_name: "Next.js",
            target_name: "React",
            name: "uses",
            fact: "Next.js uses React as its rendering engine",
          },
        ],
      },
      {
        scope: "project",
        project_id: "ep-test",
        session_id: "session-1",
        packs: ["coding"],
      },
    );

    // Verify Episode node was created
    const epResult = (await db.roQuery(
      `MATCH (ep:Episode {session_id: $sid})
       RETURN ep.uuid AS uuid, ep.sequence AS seq, ep.content AS content,
              ep.entity_count AS count`,
      { sid: "session-1" },
    )) as { data: Record<string, unknown>[] };

    expect(epResult.data.length).toBe(1);
    expect(epResult.data[0]!.seq).toBe(0);
    expect(Number(epResult.data[0]!.count)).toBe(2);
    // Content should include entity names
    expect(String(epResult.data[0]!.content)).toContain("React");
    expect(String(epResult.data[0]!.content)).toContain("Next.js");

    await db.close();
  });

  test("MENTIONS edges link Episode to entities", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    const result = (await db.roQuery(
      `MATCH (ep:Episode {session_id: $sid})-[:MENTIONS]->(e:Entity)
       RETURN e.name AS name
       ORDER BY e.name`,
      { sid: "session-1" },
    )) as { data: Record<string, unknown>[] };

    const names = result.data.map((r) => r.name as string);
    expect(names).toContain("Next.js");
    expect(names).toContain("React");

    await db.close();
  });

  test("second merge creates NEXT chain", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          {
            action: "create",
            name: "TypeScript",
            label_type: "Tool",
            summary: "Typed superset of JavaScript",
          },
        ],
        relationships: [],
      },
      {
        scope: "project",
        project_id: "ep-test",
        session_id: "session-1",
        packs: ["coding"],
      },
    );

    // Should now have 2 episodes with a NEXT edge
    const chainResult = (await db.roQuery(
      `MATCH (a:Episode)-[:NEXT]->(b:Episode)
       WHERE a.session_id = $sid AND b.session_id = $sid
       RETURN a.sequence AS from_seq, b.sequence AS to_seq`,
      { sid: "session-1" },
    )) as { data: Record<string, unknown>[] };

    expect(chainResult.data.length).toBe(1);
    expect(chainResult.data[0]!.from_seq).toBe(0);
    expect(chainResult.data[0]!.to_seq).toBe(1);

    await db.close();
  });

  test("merge without session_id does not create Episode", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          {
            action: "create",
            name: "NoEpisode",
            label_type: "Concept",
            summary: "Should not create an episode",
          },
        ],
        relationships: [],
      },
      {
        scope: "project",
        project_id: "ep-test",
        packs: ["coding"],
      },
    );

    // Should still only have 2 episodes from session-1
    const allEpisodes = (await db.roQuery(
      `MATCH (ep:Episode) RETURN count(ep) AS cnt`,
    )) as { data: Record<string, unknown>[] };

    expect(Number(allEpisodes.data[0]!.cnt)).toBe(2);

    await db.close();
  });
});

describe("community detection", () => {
  const commRoot = path.join(process.cwd(), ".tmp", "comm-det");

  beforeAll(async () => {
    await rm(commRoot, { recursive: true, force: true });
    await mkdir(commRoot, { recursive: true });
  });

  afterAll(async () => {
    await rm(commRoot, { recursive: true, force: true });
  });

  test("detectCommunities assigns community_id to entities", async () => {
    const db = await connect({ mode: "local", path: commRoot });
    await schema(db);

    // Create two clusters: (A-B-C) and (D-E)
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "A", label_type: "Concept", summary: "Node A" },
          { action: "create", name: "B", label_type: "Concept", summary: "Node B" },
          { action: "create", name: "C", label_type: "Concept", summary: "Node C" },
          { action: "create", name: "D", label_type: "Concept", summary: "Node D" },
          { action: "create", name: "E", label_type: "Concept", summary: "Node E" },
        ],
        relationships: [
          { source_name: "A", target_name: "B", name: "related", fact: "A relates to B" },
          { source_name: "B", target_name: "C", name: "related", fact: "B relates to C" },
          { source_name: "A", target_name: "C", name: "related", fact: "A relates to C" },
          { source_name: "D", target_name: "E", name: "related", fact: "D relates to E" },
        ],
      },
      {
        scope: "project",
        project_id: "comm-test",
        packs: ["coding"],
      },
    );

    const numCommunities = await detectCommunities(db, {
      project_id: "comm-test",
    });

    // Should detect at least 2 communities (A-B-C cluster and D-E cluster)
    expect(numCommunities).toBeGreaterThanOrEqual(2);

    // Verify community_id is set
    const result = (await db.roQuery(
      `MATCH (e:Entity)
       WHERE e.project_id = 'comm-test' AND e.community_id IS NOT NULL
       RETURN e.name AS name, e.community_id AS cid`,
    )) as { data: Record<string, unknown>[] };

    expect(result.data.length).toBe(5);

    // A, B, C should be in same community
    const cidMap = new Map(
      result.data.map((r) => [r.name as string, r.cid as number]),
    );
    expect(cidMap.get("A")).toBe(cidMap.get("B"));
    expect(cidMap.get("B")).toBe(cidMap.get("C"));

    // D, E should be in same community
    expect(cidMap.get("D")).toBe(cidMap.get("E"));

    // The two clusters should be different communities
    expect(cidMap.get("A")).not.toBe(cidMap.get("D"));

    await db.close();
  });

  test("communityMembers returns co-members", async () => {
    const db = await connect({ mode: "local", path: commRoot });
    await schema(db);

    // Find A's UUID
    const aResult = (await db.roQuery(
      `MATCH (e:Entity {name: 'A', project_id: 'comm-test'})
       RETURN e.uuid AS uuid`,
    )) as { data: Record<string, unknown>[] };

    const aUuid = aResult.data[0]!.uuid as string;
    const members = await communityMembers(db, aUuid, {
      project_id: "comm-test",
    });

    // A's community should include B and C (but not A itself)
    expect(members.length).toBe(2);

    // Verify B and C UUIDs are in the result
    const bcResult = (await db.roQuery(
      `MATCH (e:Entity)
       WHERE e.name IN ['B', 'C'] AND e.project_id = 'comm-test'
       RETURN e.uuid AS uuid`,
    )) as { data: Record<string, unknown>[] };
    const bcUuids = new Set(bcResult.data.map((r) => r.uuid as string));
    for (const m of members) {
      expect(bcUuids.has(m)).toBe(true);
    }

    await db.close();
  });

  test("detectCommunities returns 0 for empty graph", async () => {
    const emptyRoot = path.join(process.cwd(), ".tmp", "comm-empty");
    await rm(emptyRoot, { recursive: true, force: true });
    await mkdir(emptyRoot, { recursive: true });
    const db = await connect({ mode: "local", path: emptyRoot });
    await schema(db);

    const n = await detectCommunities(db, { project_id: "no-entities" });
    expect(n).toBe(0);

    await db.close();
    await rm(emptyRoot, { recursive: true, force: true });
  });

  test("isolated entities each get their own community", async () => {
    const isoRoot = path.join(process.cwd(), ".tmp", "comm-iso");
    await rm(isoRoot, { recursive: true, force: true });
    await mkdir(isoRoot, { recursive: true });
    const db = await connect({ mode: "local", path: isoRoot });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          { action: "create", name: "Solo1", label_type: "Concept", summary: "Alone 1" },
          { action: "create", name: "Solo2", label_type: "Concept", summary: "Alone 2" },
        ],
        relationships: [],
      },
      {
        scope: "project",
        project_id: "iso-test",
        packs: ["coding"],
      },
    );

    const n = await detectCommunities(db, { project_id: "iso-test" });
    // Isolated nodes — each gets its own community
    expect(n).toBe(2);

    await db.close();
    await rm(isoRoot, { recursive: true, force: true });
  });
});

describe("episode edge stamps", () => {
  const stampRoot = path.join(process.cwd(), ".tmp", "ep-stamp");

  beforeAll(async () => {
    await rm(stampRoot, { recursive: true, force: true });
    await mkdir(stampRoot, { recursive: true });
  });

  afterAll(async () => {
    await rm(stampRoot, { recursive: true, force: true });
  });

  test("RELATES_TO episodes[] is populated with episode UUID (fix-9)", async () => {
    const db = await connect({ mode: "local", path: stampRoot });
    await schema(db);

    await merge(
      db,
      {
        entities: [
          { action: "create", name: "Alpha", label_type: "Concept", summary: "Node Alpha" },
          { action: "create", name: "Beta", label_type: "Concept", summary: "Node Beta" },
        ],
        relationships: [
          { source_name: "Alpha", target_name: "Beta", name: "links_to", fact: "Alpha links to Beta" },
        ],
      },
      {
        scope: "project",
        project_id: "stamp-test",
        session_id: "stamp-sess",
        packs: ["coding"],
      },
    );

    // The RELATES_TO edge between Alpha and Beta should have the episode UUID in episodes[]
    const epResult = (await db.roQuery(
      `MATCH (ep:Episode {session_id: 'stamp-sess'})
       RETURN ep.uuid AS uuid`,
    )) as { data: Record<string, unknown>[] };
    expect(epResult.data.length).toBe(1);
    const epUuid = epResult.data[0]!.uuid as string;

    const relResult = (await db.roQuery(
      `MATCH (a:Entity {name: 'Alpha'})-[r:RELATES_TO]-(b:Entity {name: 'Beta'})
       WHERE a.project_id = 'stamp-test'
       RETURN r.episodes AS episodes`,
    )) as { data: Record<string, unknown>[] };

    expect(relResult.data.length).toBeGreaterThanOrEqual(1);
    const episodes = relResult.data[0]!.episodes as string[];
    expect(Array.isArray(episodes)).toBe(true);
    expect(episodes).toContain(epUuid);

    await db.close();
  });

  test("concurrent session merges get sequential episode numbers (fix-10)", async () => {
    const db = await connect({ mode: "local", path: stampRoot });
    await schema(db);

    // Merge two batches in the same session sequentially (simulating rapid calls)
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "Gamma", label_type: "Concept", summary: "Node Gamma" },
        ],
        relationships: [],
      },
      {
        scope: "project",
        project_id: "stamp-test",
        session_id: "stamp-sess",
        packs: ["coding"],
      },
    );

    await merge(
      db,
      {
        entities: [
          { action: "create", name: "Delta", label_type: "Concept", summary: "Node Delta" },
        ],
        relationships: [],
      },
      {
        scope: "project",
        project_id: "stamp-test",
        session_id: "stamp-sess",
        packs: ["coding"],
      },
    );

    // Should have episodes 0, 1, 2, 3 for this session (0 from fix-9 test, plus these)
    const seqResult = (await db.roQuery(
      `MATCH (ep:Episode {session_id: 'stamp-sess'})
       RETURN ep.sequence AS seq
       ORDER BY ep.sequence`,
    )) as { data: Record<string, unknown>[] };

    const sequences = seqResult.data.map((r) => Number(r.seq));
    // Verify sequential ordering with no gaps
    for (let i = 0; i < sequences.length; i++) {
      expect(sequences[i]).toBe(i);
    }
    expect(sequences.length).toBeGreaterThanOrEqual(3);

    await db.close();
  });
});

describe("community edge cases", () => {
  test("fully connected graph produces single community (fix-12)", async () => {
    const fcRoot = path.join(process.cwd(), ".tmp", "comm-fc");
    await rm(fcRoot, { recursive: true, force: true });
    await mkdir(fcRoot, { recursive: true });
    const db = await connect({ mode: "local", path: fcRoot });
    await schema(db);

    // Create a fully connected graph: X-Y-Z with all pairs connected
    await merge(
      db,
      {
        entities: [
          { action: "create", name: "X", label_type: "Concept", summary: "Node X" },
          { action: "create", name: "Y", label_type: "Concept", summary: "Node Y" },
          { action: "create", name: "Z", label_type: "Concept", summary: "Node Z" },
        ],
        relationships: [
          { source_name: "X", target_name: "Y", name: "connected", fact: "X connects to Y" },
          { source_name: "Y", target_name: "Z", name: "connected", fact: "Y connects to Z" },
          { source_name: "X", target_name: "Z", name: "connected", fact: "X connects to Z" },
        ],
      },
      {
        scope: "project",
        project_id: "fc-test",
        packs: ["coding"],
      },
    );

    const n = await detectCommunities(db, { project_id: "fc-test" });
    expect(n).toBe(1);

    // Verify all three nodes have the same community_id
    const result = (await db.roQuery(
      `MATCH (e:Entity)
       WHERE e.project_id = 'fc-test' AND e.community_id IS NOT NULL
       RETURN DISTINCT e.community_id AS cid`,
    )) as { data: Record<string, unknown>[] };

    expect(result.data.length).toBe(1);

    await db.close();
    await rm(fcRoot, { recursive: true, force: true });
  });
});

describe("episode id determinism", () => {
  test("same session + sequence yields same id", () => {
    const a = episodeId("sess-1", 0);
    const b = episodeId("sess-1", 0);
    expect(a).toBe(b);
  });

  test("different sequence yields different id", () => {
    const a = episodeId("sess-1", 0);
    const b = episodeId("sess-1", 1);
    expect(a).not.toBe(b);
  });

  test("different session yields different id", () => {
    const a = episodeId("sess-1", 0);
    const b = episodeId("sess-2", 0);
    expect(a).not.toBe(b);
  });
});
