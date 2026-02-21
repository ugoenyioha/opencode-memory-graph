import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import { backoff, drain, enqueue } from "./queue";
import { testDir } from "../test/tmpdir";

const root = testDir("queue");

describe("extraction queue", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("enqueue + drain persists message entity and marks queue done", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await enqueue(db, {
      project_id: "default",
      session_id: "s1",
      message_id: "m1",
      text: "queued message",
    });

    const n = await drain(db, {
      project_id: "default",
      packs: ["coding"],
      limit: 5,
    });

    const entities = (await db.roQuery(
      `MATCH (e:Entity {name: 'message:s1:m1'}) RETURN count(e) AS count`,
    )) as { data: Record<string, unknown>[] };
    const queue = (await db.roQuery(
      `MATCH (q:QueueItem) WHERE q.project_id = 'default' RETURN q.status AS status`,
    )) as { data: Record<string, unknown>[] };

    expect(n).toBe(1);
    expect(entities.data[0]?.count).toBe(1);
    expect(queue.data[0]?.status).toBe("done");
    await db.close();
  });

  test("backoff increases with attempts", () => {
    expect(backoff(1)).toBeLessThan(backoff(2));
    expect(backoff(2)).toBeLessThan(backoff(3));
  });

  test("failed processing is retried with pending status", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await enqueue(db, {
      project_id: "default",
      session_id: "s2",
      message_id: "m2",
      text: "retry me",
    });

    await drain(db, {
      project_id: "default",
      packs: ["invalid-pack"],
      limit: 1,
    });

    const queue = (await db.roQuery(
      `MATCH (q:QueueItem)
       WHERE q.project_id = 'default' AND q.message_id = 'm2'
       RETURN q.status AS status, q.attempts AS attempts, q.next_retry_at AS next_retry_at`,
    )) as { data: Record<string, unknown>[] };

    expect(queue.data[0]?.status).toBe("pending");
    expect(Number(queue.data[0]?.attempts ?? 0)).toBe(1);
    expect(Number(queue.data[0]?.next_retry_at ?? 0)).toBeGreaterThan(0);
    await db.close();
  });
});
