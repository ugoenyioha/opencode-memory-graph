import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";
import { decode } from "@msgpack/msgpack";
import { sqlite } from "./sqlite";
import { MUTATION_TYPE } from "./types";

const root = path.join(process.cwd(), ".tmp", "p1-cxdb-sqlite");

function dbPath(name: string) {
  return path.join(root, `${name}.sqlite`);
}

function count(file: string, table: string) {
  const db = new Database(file, { readonly: true });
  const row = db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  } | null;
  db.close();
  return Number(row?.n ?? 0);
}

describe("cxdb sqlite unit", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("createContext + forkContext preserve lineage/head/watermark", () => {
    const file = dbPath("fork");
    const log = sqlite(file);
    const base = log.createContext({ at: 10 });
    expect(base.context_id).toBe(1);
    expect(base.parent_context_id).toBe(null);

    const t = log.append({
      context_id: base.context_id,
      at: 11,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { x: 1 },
    });
    log.setWatermark(base.context_id, 7);

    const next = log.forkContext({ from_turn_id: t.turn_id, at: 12 });
    expect(next.parent_context_id).toBe(base.context_id);
    expect(next.head_turn_id).toBe(t.turn_id);
    expect(next.watermark).toBe(0);
    log.close();
  });

  test("append stores msgpack payload bytes and project applies registry", () => {
    const file = dbPath("project");
    const log = sqlite(file);
    const ctx = log.createContext();
    log.register({
      type_id: MUTATION_TYPE.MEMORY_SCOPE_CHANGE,
      type_version: 1,
      descriptor: { map: { scope: "new_scope", id: "entity_id" } },
    });
    const t = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_SCOPE_CHANGE,
      type_version: 1,
      payload: { entity_id: "ent_1", new_scope: "global", keep: true },
    });

    const bytes = log.payload(t.payload_hash);
    expect(bytes).toBeTruthy();
    expect(decode(bytes as Uint8Array)).toEqual({
      entity_id: "ent_1",
      new_scope: "global",
      keep: true,
    });
    expect(
      log.project(t.payload_hash, MUTATION_TYPE.MEMORY_SCOPE_CHANGE, 1),
    ).toEqual({ scope: "global", id: "ent_1" });
    log.close();
  });

  test("idempotency key returns prior turn without extra writes", () => {
    const file = dbPath("idempotency");
    const log = sqlite(file);
    const ctx = log.createContext();
    const first = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: { run: 1 },
      idempotency_key: "k1",
    });
    const t = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: { run: 1 },
      idempotency_key: "k1",
    });
    expect(t.turn_id).toBe(first.turn_id);
    log.close();

    expect(count(file, "cxdb_turn")).toBe(1);
    expect(count(file, "cxdb_blob")).toBe(1);
  });

  test("idempotency key conflict rejects different payload with same key", () => {
    const file = dbPath("idempotency-conflict");
    const log = sqlite(file);
    const ctx = log.createContext();
    log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: { run: 1 },
      idempotency_key: "same-key",
    });
    expect(() =>
      log.append({
        context_id: ctx.context_id,
        type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
        type_version: 1,
        payload: { run: 2 },
        idempotency_key: "same-key",
      }),
    ).toThrow("idempotency key conflict");
    log.close();
  });

  test("cross-connection same idempotency key resolves to one turn", async () => {
    const file = dbPath("idempotency-race-same");
    const a = sqlite(file);
    const b = sqlite(file);
    const ctx = a.createContext();

    const [one, two] = await Promise.all([
      Promise.resolve().then(() =>
        a.append({
          context_id: ctx.context_id,
          type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
          type_version: 1,
          payload: { name: "x" },
          idempotency_key: "race-key",
        }),
      ),
      Promise.resolve().then(() =>
        b.append({
          context_id: ctx.context_id,
          type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
          type_version: 1,
          payload: { name: "x" },
          idempotency_key: "race-key",
        }),
      ),
    ]);

    expect(one.turn_id).toBe(two.turn_id);
    a.close();
    b.close();
    expect(count(file, "cxdb_turn")).toBe(1);
    expect(count(file, "cxdb_blob")).toBe(1);
  });

  test("cross-connection same idempotency key with conflict throws", async () => {
    const file = dbPath("idempotency-race-conflict");
    const a = sqlite(file);
    const b = sqlite(file);
    const ctx = a.createContext();

    const first = Promise.resolve()
      .then(() =>
        a.append({
          context_id: ctx.context_id,
          type_id: MUTATION_TYPE.MEMORY_RELATION_UPSERT,
          type_version: 1,
          payload: { val: 1 },
          idempotency_key: "race-conflict",
        }),
      )
      .catch((error) => error as Error);
    const second = Promise.resolve()
      .then(() =>
        b.append({
          context_id: ctx.context_id,
          type_id: MUTATION_TYPE.MEMORY_RELATION_UPSERT,
          type_version: 1,
          payload: { val: 2 },
          idempotency_key: "race-conflict",
        }),
      )
      .catch((error) => error as Error);

    const out = await Promise.all([first, second]);
    const errors = out.filter((item) => item instanceof Error);
    expect(errors.length).toBe(1);
    expect(String(errors[0])).toContain("idempotency key conflict");
    a.close();
    b.close();
    expect(count(file, "cxdb_turn")).toBe(1);
  });

  test("content-addressed blob dedup keeps one blob for same payload", () => {
    const file = dbPath("dedup");
    const log = sqlite(file);
    const ctx = log.createContext();

    const a = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { name: "same" },
    });
    const b = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { name: "same" },
    });
    expect(a.payload_hash).toBe(b.payload_hash);
    log.close();

    expect(count(file, "cxdb_turn")).toBe(2);
    expect(count(file, "cxdb_blob")).toBe(1);
  });

  test("append enforces head parent", () => {
    const file = dbPath("invariants");
    const log = sqlite(file);
    const ctx = log.createContext();
    const a = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { n: 1 },
    });
    log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { n: 2 },
    });

    expect(() =>
      log.append({
        context_id: ctx.context_id,
        parent_turn_id: a.turn_id,
        type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
        type_version: 1,
        payload: { n: 3 },
      }),
    ).toThrow("append parent does not match context head");

    log.close();
  });

  test("setWatermark is atomic and monotonic across connections", async () => {
    const file = dbPath("watermark-race");
    const a = sqlite(file);
    const b = sqlite(file);
    const ctx = a.createContext();

    await Promise.all([
      Promise.resolve().then(() => a.setWatermark(ctx.context_id, 100)),
      Promise.resolve().then(() => b.setWatermark(ctx.context_id, 3)),
      Promise.resolve().then(() => a.setWatermark(ctx.context_id, 40)),
      Promise.resolve().then(() => b.setWatermark(ctx.context_id, 90)),
    ]);

    expect(a.watermark(ctx.context_id)).toBe(100);
    expect(b.watermark(ctx.context_id)).toBe(100);
    a.close();
    b.close();
  });

  test("append validates type_id/type_version/idempotency_key", () => {
    const file = dbPath("validation");
    const log = sqlite(file);
    const ctx = log.createContext();

    expect(() =>
      log.append({
        context_id: ctx.context_id,
        type_id: "memory.unknown.op",
        type_version: 1,
        payload: {},
      }),
    ).toThrow("invalid type_id");

    expect(() =>
      log.append({
        context_id: ctx.context_id,
        type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
        type_version: 0,
        payload: {},
      }),
    ).toThrow("invalid type_version");

    expect(() =>
      log.append({
        context_id: ctx.context_id,
        type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
        type_version: 1,
        payload: {},
        idempotency_key: "bad key with spaces",
      }),
    ).toThrow("invalid idempotency_key");

    expect(() =>
      log.append({
        context_id: ctx.context_id,
        type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
        type_version: 1,
        payload: {},
        idempotency_key: "x".repeat(129),
      }),
    ).toThrow("invalid idempotency_key");

    log.close();
  });

  test("project handles malformed payload and malformed descriptor safely", () => {
    const file = dbPath("decode-safe");
    const log = sqlite(file);
    const ctx = log.createContext();
    const t = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { ok: true },
    });
    log.register({
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      descriptor: { fields: ["ok"] },
    });
    log.close();

    const db = new Database(file);
    db.query(
      `UPDATE cxdb_registry SET descriptor = ? WHERE type_id = ? AND type_version = ?`,
    ).run(new Uint8Array([0xc1]), MUTATION_TYPE.MEMORY_ENTITY_UPSERT, 1);
    db.query(
      `INSERT INTO cxdb_blob (payload_hash, hash_algo, payload, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run("bad-payload", "blake3", new Uint8Array([0xc1]), 1);
    db.close();

    const reopened = sqlite(file);
    expect(
      reopened.project(t.payload_hash, MUTATION_TYPE.MEMORY_ENTITY_UPSERT, 1),
    ).toBe(null);
    expect(
      reopened.project("bad-payload", MUTATION_TYPE.MEMORY_ENTITY_UPSERT, 1),
    ).toBe(null);
    reopened.close();
  });

  test("register is immutable for existing type_id/type_version", () => {
    const file = dbPath("registry-immutable");
    const log = sqlite(file);
    log.register({
      type_id: MUTATION_TYPE.MEMORY_SCOPE_CHANGE,
      type_version: 3,
      descriptor: { fields: ["a"] },
    });
    log.register({
      type_id: MUTATION_TYPE.MEMORY_SCOPE_CHANGE,
      type_version: 3,
      descriptor: { fields: ["a"] },
    });
    expect(() =>
      log.register({
        type_id: MUTATION_TYPE.MEMORY_SCOPE_CHANGE,
        type_version: 3,
        descriptor: { fields: ["b"] },
      }),
    ).toThrow("registry descriptor conflict");
    log.close();
  });

  test("open fails fast on schema version mismatch", () => {
    const file = dbPath("schema-mismatch");
    const db = new Database(file);
    db.exec(`
      CREATE TABLE IF NOT EXISTS cxdb_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.query(
      `INSERT INTO cxdb_meta (key, value) VALUES ('schema_version', '999')`,
    ).run();
    db.close();

    expect(() => sqlite(file)).toThrow("schema version mismatch");
  });
});
