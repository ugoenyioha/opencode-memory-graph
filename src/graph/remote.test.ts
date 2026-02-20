import { describe, expect, test } from "bun:test";
import { connect } from "./client";

describe("remote mode harness", () => {
  test("connects to remote when explicitly enabled", async () => {
    if (process.env.RUN_REMOTE_GRAPH_TEST !== "1") {
      expect(true).toBe(true);
      return;
    }

    const host = process.env.MEMORY_GRAPH_HOST;
    const password = process.env.MEMORY_GRAPH_PASSWORD;
    if (!host || !password) {
      throw new Error(
        "RUN_REMOTE_GRAPH_TEST=1 requires MEMORY_GRAPH_HOST and MEMORY_GRAPH_PASSWORD",
      );
    }

    const db = await connect({
      mode: "remote",
      host,
      port: process.env.MEMORY_GRAPH_PORT
        ? Number(process.env.MEMORY_GRAPH_PORT)
        : 6379,
      password,
      tls: process.env.MEMORY_GRAPH_TLS === "false" ? false : true,
    });

    const out = (await db.roQuery(`RETURN 1 AS ok`)) as {
      data: Record<string, unknown>[];
    };
    expect(out.data[0]?.ok).toBe(1);
    await db.close();
  });
});
