import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { serial, retry, journal } from "./commit";
import { connect } from "./client";
import { schema } from "./schema";

const root = path.join(process.cwd(), ".tmp", "p2-commit");

describe("commit reliability", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("serial enforces single-writer ordering per scope", async () => {
    const out: number[] = [];
    await Promise.all([
      serial("project", async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        out.push(1);
      }),
      serial("project", async () => {
        out.push(2);
      }),
    ]);

    expect(out).toEqual([1, 2]);
  });

  test("retry re-attempts transient failures", async () => {
    let n = 0;
    const value = await retry(async () => {
      n += 1;
      if (n < 3) throw new Error("transient");
      return "ok";
    });
    expect(value).toBe("ok");
    expect(n).toBe(3);
  });

  test("journal persists mutation payload", async () => {
    const db = await connect({ mode: "local", path: root });
    await schema(db);
    await journal(db, "project", "batch-1", '{"ok":true}');

    const out = (await db.roQuery(
      `MATCH (j:Journal {key: 'batch-1'}) RETURN count(j)`,
    )) as { data: Record<string, unknown>[] };

    expect(out.data[0]?.["count(j)"]).toBe(1);
    await db.close();
  });
});
