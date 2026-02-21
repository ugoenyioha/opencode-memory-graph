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

    const turns = await fetch(
      `${base}/v1/contexts/${id}/turns?limit=10&view=raw`,
    ).then((res) => res.json());
    expect(Array.isArray(turns.turns)).toBe(true);
    expect(turns.turns.length).toBe(1);

    const healthz = await fetch(`${base}/healthz`).then((res) => res.json());
    expect(healthz.status).toBe("ok");

    const detail = await fetch(`${base}/v1/contexts/${id}`).then((res) =>
      res.json(),
    );
    expect(detail.context_id).toBe(String(id));

    const children = await fetch(`${base}/v1/contexts/${id}/children`).then(
      (res) => res.json(),
    );
    expect(Array.isArray(children.children)).toBe(true);

    const provenance = await fetch(`${base}/v1/contexts/${id}/provenance`).then(
      (res) => res.json(),
    );
    expect(provenance.context_id).toBe(String(id));

    const search = await fetch(`${base}/v1/contexts/search?q=${id}`).then(
      (res) => res.json(),
    );
    expect(Array.isArray(search.contexts)).toBe(true);

    const hash = turns.turns[0]?.content_hash_b3;
    expect(typeof hash).toBe("string");
    const blob = await fetch(`${base}/v1/blobs/${hash}`);
    expect(blob.status).toBe(200);

    const fs = await fetch(
      `${base}/v1/turns/${turns.turns[0]?.turn_id}/fs`,
    ).then((res) => res.json());
    expect(Array.isArray(fs.entries)).toBe(true);

    const put = await fetch(`${base}/v1/registry/bundles/sqlite-local`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        types: {
          "memory.entity.upsert": {
            versions: {
              "1": { fields: ["name"] },
            },
          },
        },
      }),
    });
    expect([201, 204]).toContain(put.status);

    const bundle = await fetch(`${base}/v1/registry/bundles/sqlite-local`).then(
      (res) => res.json(),
    );
    expect(bundle.types).toBeTruthy();

    const list = await fetch(`${base}/v1/registry/types`).then((res) =>
      res.json(),
    );
    expect(Array.isArray(list.types)).toBe(true);

    const version = await fetch(
      `${base}/v1/registry/types/memory.entity.upsert/versions/1`,
    ).then((res) => res.json());
    expect(version.type_id).toBe("memory.entity.upsert");

    const sse = await fetch(`${base}/v1/events`);
    expect(sse.status).toBe(200);
    const reader = sse.body?.getReader();
    expect(reader).toBeTruthy();
    await reader?.cancel();

    server.stop(true);
  });
});
