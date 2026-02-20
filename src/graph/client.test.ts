import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { connect } from "./client";
import { schema } from "./schema";

const root = path.join(process.cwd(), ".tmp", "p0-graph");

async function reset(dir: string) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

describe("graph bootstrap", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("connects to local falkordblite and reads written data", async () => {
    const dir = path.join(root, "basic");
    await reset(dir);
    const db = await connect({ mode: "local", path: dir });
    await schema(db);

    await db.query(
      `CREATE (e:Entity {
        uuid: 'ent_a',
        name: 'A',
        summary: 'seed',
        label_type: 'Concept',
        labels: ['Entity', 'Concept'],
        attributes: '{}',
        scope: 'project',
        source: 'auto',
        confidence: 'confirmed',
        validated_at: 1,
        ttl: null,
        created_at: 1
      })`,
    );

    const out = (await db.roQuery(
      `MATCH (e:Entity {uuid: 'ent_a'}) RETURN e.name`,
    )) as { data: Record<string, unknown>[] };

    expect(out.data.length).toBe(1);
    expect(out.data[0]?.["e.name"]).toBe("A");
    await db.close();
  });

  test("schema setup is idempotent", async () => {
    const dir = path.join(root, "schema-idempotent");
    await reset(dir);
    const db = await connect({ mode: "local", path: dir });
    await schema(db);
    await schema(db);

    const out = (await db.roQuery(`MATCH (n) RETURN count(n)`)) as {
      data: Record<string, unknown>[];
    };

    expect(out.data[0]?.["count(n)"]).toBe(0);
    await db.close();
  });

  test("deterministic seed replay yields identical snapshot", async () => {
    const one = path.join(root, "seed-one");
    const two = path.join(root, "seed-two");
    await reset(one);
    await reset(two);

    const run = async (dir: string) => {
      const db = await connect({ mode: "local", path: dir });
      await schema(db);
      await db.query(
        `CREATE (a:Entity {
          uuid: 'ent_1',
          name: 'FalkorDB',
          summary: 'tool',
          label_type: 'Tool',
          labels: ['Entity', 'Tool'],
          attributes: '{}',
          scope: 'project',
          source: 'auto',
          confidence: 'confirmed',
          validated_at: 100,
          ttl: null,
          created_at: 100
        })`,
      );
      await db.query(
        `CREATE (b:Entity {
          uuid: 'ent_2',
          name: 'Use FalkorDB',
          summary: 'decision',
          label_type: 'Decision',
          labels: ['Entity', 'Decision'],
          attributes: '{}',
          scope: 'project',
          source: 'auto',
          confidence: 'confirmed',
          validated_at: 100,
          ttl: null,
          created_at: 100
        })`,
      );
      await db.query(
        `MATCH (a:Entity {uuid: 'ent_1'}), (b:Entity {uuid: 'ent_2'})
         CREATE (b)-[:RELATES_TO {
           uuid: 'rel_1',
           name: 'uses',
           fact: 'Decision uses tool',
           valid_at: 100,
           invalid_at: null,
           expired_at: null,
           episodes: [],
           attributes: '{}',
           created_at: 100
         }]->(a)`,
      );

      const out = (await db.roQuery(
        `MATCH (s:Entity)-[r:RELATES_TO]->(t:Entity)
         RETURN s.uuid, s.name, r.uuid, r.name, t.uuid, t.name
         ORDER BY s.uuid, r.uuid, t.uuid`,
      )) as { data: Record<string, unknown>[] };

      await db.close();
      return JSON.stringify(out.data);
    };

    const a = await run(one);
    const b = await run(two);
    expect(a).toBe(b);
  });
});
