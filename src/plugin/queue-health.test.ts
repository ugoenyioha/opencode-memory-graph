import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { connect } from "../graph/client";
import { schema } from "../graph/schema";
import {
  enqueue,
  drain,
  stats,
  deadLetters,
  retryDeadLetter,
  retryAllDeadLetters,
  purgeDeadLetters,
} from "./queue";
import { testDir } from "../test/tmpdir";

const root = testDir("queue-health");

describe("queue health stats", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("stats returns zeroes for empty queue", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    const result = await stats(db, "empty-project");
    expect(result.pending).toBe(0);
    expect(result.processing).toBe(0);
    expect(result.done).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.total).toBe(0);
    expect(result.oldest_pending_at).toBeNull();
    expect(result.avg_processing_ms).toBeNull();
    await db.close();
  });

  test("stats counts items by status after enqueue and drain", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Enqueue two items
    await enqueue(db, {
      project_id: "stats-test",
      session_id: "s1",
      message_id: "m1",
      text: "first message",
    });
    await enqueue(db, {
      project_id: "stats-test",
      session_id: "s1",
      message_id: "m2",
      text: "second message",
    });

    // Before drain: both pending
    let result = await stats(db, "stats-test");
    expect(result.pending).toBe(2);
    expect(result.total).toBe(2);
    expect(result.oldest_pending_at).toBeGreaterThan(0);

    // Drain one
    await drain(db, {
      project_id: "stats-test",
      packs: ["coding"],
      limit: 1,
    });

    result = await stats(db, "stats-test");
    expect(result.done).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.total).toBe(2);
    expect(result.avg_processing_ms).not.toBeNull();

    await db.close();
  });

  test("stats counts failed items", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await enqueue(db, {
      project_id: "fail-stats",
      session_id: "s1",
      message_id: "m-fail",
      text: "will fail",
    });

    // Drain 5 times with invalid pack to exhaust retries
    for (let i = 0; i < 5; i++) {
      await drain(db, {
        project_id: "fail-stats",
        packs: ["nonexistent-pack"],
        limit: 1,
      });
      // Reset retry delay to allow immediate re-processing
      if (i < 4) {
        await db.query(
          `MATCH (q:QueueItem) WHERE q.project_id = 'fail-stats' SET q.next_retry_at = null`,
        );
      }
    }

    const result = await stats(db, "fail-stats");
    expect(result.failed).toBe(1);
    expect(result.pending).toBe(0);
    await db.close();
  });
});

describe("dead letter inspection/repair", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("deadLetters returns empty for no failures", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    const result = await deadLetters(db, "no-failures");
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
    await db.close();
  });

  test("deadLetters lists failed items with error details", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await enqueue(db, {
      project_id: "dl-test",
      session_id: "s1",
      message_id: "m-dl",
      text: "dead letter candidate",
    });

    // Exhaust retries
    for (let i = 0; i < 5; i++) {
      await drain(db, {
        project_id: "dl-test",
        packs: ["nonexistent-pack"],
        limit: 1,
      });
      if (i < 4) {
        await db.query(
          `MATCH (q:QueueItem) WHERE q.project_id = 'dl-test' SET q.next_retry_at = null`,
        );
      }
    }

    const result = await deadLetters(db, "dl-test");
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].error).toBeTruthy();
    expect(result.items[0].attempts).toBe(5);
    expect(result.items[0].session_id).toBe("s1");
    expect(result.items[0].message_id).toBe("m-dl");
    await db.close();
  });

  test("retryDeadLetter resets failed item to pending", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await enqueue(db, {
      project_id: "retry-test",
      session_id: "s1",
      message_id: "m-retry",
      text: "retry me",
    });

    // Exhaust retries
    for (let i = 0; i < 5; i++) {
      await drain(db, {
        project_id: "retry-test",
        packs: ["nonexistent-pack"],
        limit: 1,
      });
      if (i < 4) {
        await db.query(
          `MATCH (q:QueueItem) WHERE q.project_id = 'retry-test' SET q.next_retry_at = null`,
        );
      }
    }

    // Verify it's failed
    let dl = await deadLetters(db, "retry-test");
    expect(dl.total).toBe(1);

    // Retry it
    const ok = await retryDeadLetter(db, dl.items[0].uuid);
    expect(ok).toBe(true);

    // Verify it's pending again
    dl = await deadLetters(db, "retry-test");
    expect(dl.total).toBe(0);

    const result = await stats(db, "retry-test");
    expect(result.pending).toBe(1);
    expect(result.failed).toBe(0);
    await db.close();
  });

  test("retryDeadLetter returns false for non-existent uuid", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    const ok = await retryDeadLetter(db, "nonexistent-uuid");
    expect(ok).toBe(false);
    await db.close();
  });

  test("retryAllDeadLetters resets all failed items", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    // Create two failed items
    for (const mid of ["m-all-1", "m-all-2"]) {
      await enqueue(db, {
        project_id: "retry-all-test",
        session_id: "s1",
        message_id: mid,
        text: "retry all",
      });
      for (let i = 0; i < 5; i++) {
        await drain(db, {
          project_id: "retry-all-test",
          packs: ["nonexistent-pack"],
          limit: 1,
        });
        if (i < 4) {
          await db.query(
            `MATCH (q:QueueItem) WHERE q.project_id = 'retry-all-test' AND q.message_id = '${mid}' SET q.next_retry_at = null`,
          );
        }
      }
    }

    let dl = await deadLetters(db, "retry-all-test");
    expect(dl.total).toBe(2);

    const count = await retryAllDeadLetters(db, "retry-all-test");
    expect(count).toBe(2);

    dl = await deadLetters(db, "retry-all-test");
    expect(dl.total).toBe(0);

    const result = await stats(db, "retry-all-test");
    expect(result.pending).toBe(2);
    await db.close();
  });

  test("purgeDeadLetters removes all failed items", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);

    await enqueue(db, {
      project_id: "purge-test",
      session_id: "s1",
      message_id: "m-purge",
      text: "purge me",
    });

    for (let i = 0; i < 5; i++) {
      await drain(db, {
        project_id: "purge-test",
        packs: ["nonexistent-pack"],
        limit: 1,
      });
      if (i < 4) {
        await db.query(
          `MATCH (q:QueueItem) WHERE q.project_id = 'purge-test' SET q.next_retry_at = null`,
        );
      }
    }

    let dl = await deadLetters(db, "purge-test");
    expect(dl.total).toBe(1);

    const count = await purgeDeadLetters(db, "purge-test");
    expect(count).toBe(1);

    dl = await deadLetters(db, "purge-test");
    expect(dl.total).toBe(0);

    const result = await stats(db, "purge-test");
    expect(result.total).toBe(0);
    await db.close();
  });
});
