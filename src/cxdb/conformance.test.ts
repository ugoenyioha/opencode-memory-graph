import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";
import { decode } from "@msgpack/msgpack";
import { sqlite } from "./sqlite";
import { MUTATION_TYPE } from "./types";
import { testDir } from "../test/tmpdir";

const root = testDir("p1-cxdb-conf");

function file(name: string) {
  return path.join(root, `${name}.sqlite`);
}

function open(name: string) {
  return sqlite(file(name));
}

function rows(name: string, table: string) {
  const db = new Database(file(name), { readonly: true });
  const row = db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  } | null;
  db.close();
  return Number(row?.n ?? 0);
}

function walk(
  list: { turn_id: number; parent_turn_id: number | null }[],
  head: number | null,
) {
  if (head === null) return [] as number[];
  const out: number[] = [];
  let cur: number | null = head;
  while (cur !== null) {
    out.push(cur);
    cur = list.find((item) => item.turn_id === cur)?.parent_turn_id ?? null;
  }
  return out;
}

describe("cxdb sqlite conformance", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("schema exists", () => {
    const log = open("schema");
    log.close();
    const db = new Database(file("schema"), { readonly: true });
    const names = db
      .query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cxdb_%' ORDER BY name ASC`,
      )
      .all() as { name: string }[];
    db.close();
    expect(names.map((item) => item.name)).toEqual([
      "cxdb_blob",
      "cxdb_bundle",
      "cxdb_context",
      "cxdb_meta",
      "cxdb_registry",
      "cxdb_turn",
    ]);
  });

  test("dedup semantics for blob CAS and idempotency", () => {
    const name = "dedup";
    const log = open(name);
    const ctx = log.createContext();
    const a = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { same: true },
      idempotency_key: "k1",
    });
    const b = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { same: true },
      idempotency_key: "k2",
    });
    expect(() =>
      log.append({
        context_id: ctx.context_id,
        type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
        type_version: 1,
        payload: { ignored: true },
        idempotency_key: "k1",
      }),
    ).toThrow("idempotency key conflict");
    expect(a.payload_hash).toBe(b.payload_hash);
    log.close();
    expect(rows(name, "cxdb_blob")).toBe(1);
    expect(rows(name, "cxdb_turn")).toBe(2);
  });

  test("CAS is byte-level over msgpack bytes, not semantic object equality", () => {
    const name = "cas-byte-level";
    const log = open(name);
    const ctx = log.createContext();
    const a = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { a: 1, b: 2 },
    });
    const b = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_ENTITY_UPSERT,
      type_version: 1,
      payload: { b: 2, a: 1 },
    });
    expect(a.payload_hash).not.toBe(b.payload_hash);
    log.close();
  });

  test("fork semantics copy head and preserve independent append history", () => {
    const log = open("fork");
    const base = log.createContext();
    const a = log.append({
      context_id: base.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: { n: 1 },
    });
    const b = log.append({
      context_id: base.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: { n: 2 },
    });
    const child = log.forkContext({ from_turn_id: b.turn_id });
    expect(child.head_turn_id).toBe(b.turn_id);

    const d = log.append({
      context_id: child.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: { n: 3 },
    });
    expect(d.parent_turn_id).toBe(b.turn_id);
    expect(log.head(base.context_id)).toBe(b.turn_id);
    expect(log.head(child.context_id)).toBe(d.turn_id);
    expect(a.turn_id).toBeLessThan(b.turn_id);
    log.close();
  });

  test("fork from arbitrary turn uses that turn as new head", () => {
    const log = open("fork-arbitrary-turn");
    const base = log.createContext();
    const turns = [1, 2, 3, 4].map((n) =>
      log.append({
        context_id: base.context_id,
        type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
        type_version: 1,
        payload: { n },
      }),
    );
    const branch = log.forkContext({ from_turn_id: turns[1]!.turn_id });
    expect(branch.head_turn_id).toBe(turns[1]!.turn_id);

    const next = log.append({
      context_id: branch.context_id,
      type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
      type_version: 1,
      payload: { n: 10 },
    });
    expect(next.parent_turn_id).toBe(turns[1]!.turn_id);
    expect(log.head(base.context_id)).toBe(turns[3]!.turn_id);
    expect(log.head(branch.context_id)).toBe(next.turn_id);
    log.close();
  });

  test("chain walk from head reaches root in order", () => {
    const name = "chain";
    const log = open(name);
    const ctx = log.createContext();
    const turns = [0, 1, 2, 3].map((n) =>
      log.append({
        context_id: ctx.context_id,
        type_id: MUTATION_TYPE.MEMORY_RELATION_UPSERT,
        type_version: 1,
        payload: { n },
      }),
    );
    const head = log.head(ctx.context_id);
    const all = log.turns(ctx.context_id);
    log.close();

    const walked = walk(all, head);
    expect(walked).toEqual(turns.map((item) => item.turn_id).reverse());
  });

  test("type fields + project mapping via registry", () => {
    const log = open("types");
    const ctx = log.createContext();
    log.register({
      type_id: MUTATION_TYPE.MEMORY_EMBEDDING_UPDATE,
      type_version: 2,
      descriptor: { fields: ["entity_id", "dims"] },
    });
    const t = log.append({
      context_id: ctx.context_id,
      type_id: MUTATION_TYPE.MEMORY_EMBEDDING_UPDATE,
      type_version: 2,
      payload: { entity_id: "e1", dims: 384, vec: [0.1, 0.2] },
    });
    expect(t.type_id).toBe(MUTATION_TYPE.MEMORY_EMBEDDING_UPDATE);
    expect(t.type_version).toBe(2);
    expect(
      log.project(t.payload_hash, MUTATION_TYPE.MEMORY_EMBEDDING_UPDATE, 2),
    ).toEqual({ entity_id: "e1", dims: 384 });
    log.close();
  });

  test("crash recovery persists committed data across reopen", () => {
    const name = "recovery";
    {
      const log = open(name);
      const ctx = log.createContext();
      log.append({
        context_id: ctx.context_id,
        type_id: MUTATION_TYPE.MEMORY_COMPACTION_SNAPSHOT,
        type_version: 1,
        payload: { snap: 1 },
      });
      log.close();
    }
    {
      const log = open(name);
      const turns = log.turns(1);
      expect(turns.length).toBe(1);
      expect(log.head(1)).toBe(turns[0]?.turn_id ?? null);
      log.close();
    }
  });

  test("concurrent appends produce contiguous idx and deterministic head", async () => {
    const log = open("concurrent");
    const ctx = log.createContext();
    await Promise.all(
      new Array(32).fill(0).map((_, n) =>
        Promise.resolve().then(() =>
          log.append({
            context_id: ctx.context_id,
            type_id: MUTATION_TYPE.MEMORY_EXTRACTION_BATCH,
            type_version: 1,
            payload: { n },
            idempotency_key: `k-${n}`,
          }),
        ),
      ),
    );

    const turns = log.turns(ctx.context_id);
    expect(turns.length).toBe(32);
    expect(turns.map((item) => item.idx)).toEqual(
      turns.map((_item, idx) => idx),
    );
    expect(log.head(ctx.context_id)).toBe(turns.at(-1)?.turn_id ?? null);
    log.close();
  });

  test("payload round-trip fuzz", () => {
    const log = open("fuzz");
    const ctx = log.createContext();
    for (const n of new Array(64).fill(0).map((_item, idx) => idx)) {
      const payload = {
        n,
        text: `row-${n}`,
        nested: { a: n % 7, b: n % 5 === 0 },
        list: new Array((n % 5) + 1).fill(0).map((_, i) => i * n),
      };
      const t = log.append({
        context_id: ctx.context_id,
        type_id: MUTATION_TYPE.MEMORY_ENTITY_SUPERSEDE,
        type_version: 1,
        payload,
      });
      const bytes = log.payload(t.payload_hash);
      expect(bytes).toBeTruthy();
      expect(decode(bytes as Uint8Array)).toEqual(payload);
    }
    log.close();
  });
});
