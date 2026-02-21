import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { sqlite } from "./sqlite";
import { MUTATION_TYPE } from "./types";
import { serveCxdb } from "./server";

const root = path.join(process.cwd(), ".tmp", "p6-server");
const file = path.join(root, "truth.sqlite");

describe("cxdb compatibility server", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    const log = sqlite(file);
    const ctx = log.createContext();
    log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { name: "server" },
    });
    log.close();
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("serves health, contexts, and turns endpoints", async () => {
    const server = serveCxdb({ path: file, port: 0 });
    const base = `http://127.0.0.1:${server.port}`;

    const health = await fetch(`${base}/health`).then((res) => res.json());
    expect(health.status).toBe("ok");

    const contexts = await fetch(`${base}/v1/contexts`).then((res) =>
      res.json(),
    );
    expect(Array.isArray(contexts.contexts)).toBe(true);
    const id = contexts.contexts[0]?.context_id;
    expect(id).toBeTruthy();

    const turns = await fetch(`${base}/v1/contexts/${id}/turns?limit=10`).then(
      (res) => res.json(),
    );
    expect(Array.isArray(turns.turns)).toBe(true);
    expect(turns.turns.length).toBe(1);

    server.stop(true);
  });
});
