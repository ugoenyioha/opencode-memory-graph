import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { cap, working } from "./tiers";
import { testDir } from "../test/tmpdir";

const root = testDir("p4-tiers");

describe("working tier", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("loads recent task and decision entities", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);
    const now = Date.now();
    await db.query(`
      CREATE (a:Entity {
        uuid: 'task_1',
        name: 'finish rollout',
        summary: 'close proactive rollout',
        label_type: 'Task',
        labels: ['Entity','Task'],
        attributes: '{}',
        scope: 'project',
        project_id: 'default',
        source: 'auto',
        confidence: 'confirmed',
        validated_at: ${now},
        ttl: null,
        created_at: ${now}
      })
    `);
    await db.query(`
      CREATE (b:Entity {
        uuid: 'decision_1',
        name: 'use ingress tcp',
        summary: 'route redis through traefik tcp',
        label_type: 'Decision',
        labels: ['Entity','Decision'],
        attributes: '{}',
        scope: 'project',
        project_id: 'default',
        source: 'auto',
        confidence: 'confirmed',
        validated_at: ${now},
        ttl: null,
        created_at: ${now}
      })
    `);

    const rows = await working(db, "default", now - 60_000);
    expect(rows.some((item) => item.uuid === "task_1")).toBe(true);
    expect(rows.some((item) => item.uuid === "decision_1")).toBe(true);
    await db.close();
  });

  test("enforces token budget with truncation marker", () => {
    const text = "a".repeat(100);
    const out = cap(text, 10);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.includes("[Truncated]")).toBe(true);
  });
});
