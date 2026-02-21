import { Database } from "bun:sqlite";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { decode, encode } from "@msgpack/msgpack";
import type {
  AppendInput,
  Context,
  RegisterInput,
  TruthLog,
  Turn,
} from "./interface";
import { MUTATION_TYPES } from "./types";

const SCHEMA_VERSION = 1;
const IDEM_RE = /^[a-zA-Z0-9:_-]{1,128}$/;

function now() {
  return Date.now();
}

function hash(bytes: Uint8Array) {
  // CAS is byte-level over msgpack bytes (not semantic JSON equivalence).
  return bytesToHex(blake3(bytes));
}

function same(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
}

function decodeSafe(bytes: Uint8Array) {
  try {
    return decode(bytes);
  } catch {
    return null;
  }
}

function valid(input: AppendInput) {
  if (
    !MUTATION_TYPES.includes(input.type_id as (typeof MUTATION_TYPES)[number])
  ) {
    throw new Error(`invalid type_id: ${input.type_id}`);
  }
  if (!Number.isInteger(input.type_version) || input.type_version <= 0) {
    throw new Error("invalid type_version");
  }
  if (input.idempotency_key === undefined) return;
  if (!IDEM_RE.test(input.idempotency_key)) {
    throw new Error("invalid idempotency_key");
  }
}

function idemConflict() {
  throw new Error("idempotency key conflict");
}

function idemUnique(error: unknown) {
  return String(error).includes(
    "UNIQUE constraint failed: cxdb_turn.context_id, cxdb_turn.idempotency_key",
  );
}

function context(row: Record<string, unknown> | null): Context {
  if (!row) throw new Error("context not found");
  return {
    context_id: Number(row.context_id),
    parent_context_id:
      row.parent_context_id === null ? null : Number(row.parent_context_id),
    head_turn_id: row.head_turn_id === null ? null : Number(row.head_turn_id),
    watermark: Number(row.watermark),
    created_at: Number(row.created_at),
  };
}

function turn(row: Record<string, unknown> | null): Turn {
  if (!row) throw new Error("turn not found");
  return {
    turn_id: Number(row.turn_id),
    context_id: Number(row.context_id),
    parent_turn_id:
      row.parent_turn_id === null ? null : Number(row.parent_turn_id),
    idx: Number(row.idx),
    at: Number(row.at),
    type_id: String(row.type_id),
    type_version: Number(row.type_version),
    payload_hash: String(row.payload_hash),
    idempotency_key:
      row.idempotency_key === null ? null : String(row.idempotency_key),
  };
}

function apply(decoded: unknown, descriptor: unknown) {
  if (!descriptor || typeof descriptor !== "object") return decoded;
  if (Array.isArray(descriptor)) return decoded;
  if (decoded === null || typeof decoded !== "object") return decoded;
  if (Array.isArray(decoded)) return decoded;

  const map = (descriptor as { map?: unknown }).map;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    return Object.entries(map as Record<string, unknown>).reduce(
      (out, [target, source]) => {
        if (typeof source !== "string") return out;
        return {
          ...out,
          [target]: (decoded as Record<string, unknown>)[source],
        };
      },
      {} as Record<string, unknown>,
    );
  }

  const fields = (descriptor as { fields?: unknown }).fields;
  if (Array.isArray(fields)) {
    return fields.reduce(
      (out, field) => {
        if (typeof field !== "string") return out;
        return { ...out, [field]: (decoded as Record<string, unknown>)[field] };
      },
      {} as Record<string, unknown>,
    );
  }

  return decoded;
}

export class SqliteLog implements TruthLog {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cxdb_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const meta = this.db
      .query(`SELECT value FROM cxdb_meta WHERE key = 'schema_version'`)
      .get() as { value?: string } | null;
    if (!meta) {
      this.db
        .query(
          `INSERT INTO cxdb_meta (key, value) VALUES ('schema_version', $value)`,
        )
        .run({ value: String(SCHEMA_VERSION) });
    }
    if (meta && Number(meta.value) !== SCHEMA_VERSION) {
      throw new Error(
        `schema version mismatch: expected ${SCHEMA_VERSION}, got ${meta.value}`,
      );
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cxdb_context (
        context_id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_context_id INTEGER,
        head_turn_id INTEGER,
        watermark INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (parent_context_id) REFERENCES cxdb_context(context_id)
      );

      CREATE TABLE IF NOT EXISTS cxdb_blob (
        payload_hash TEXT PRIMARY KEY,
        hash_algo TEXT NOT NULL,
        payload BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cxdb_turn (
        turn_id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_id INTEGER NOT NULL,
        parent_turn_id INTEGER,
        idx INTEGER NOT NULL,
        at INTEGER NOT NULL,
        type_id TEXT NOT NULL,
        type_version INTEGER NOT NULL,
        payload_hash TEXT NOT NULL,
        idempotency_key TEXT,
        FOREIGN KEY (context_id) REFERENCES cxdb_context(context_id),
        FOREIGN KEY (parent_turn_id) REFERENCES cxdb_turn(turn_id),
        FOREIGN KEY (payload_hash) REFERENCES cxdb_blob(payload_hash),
        UNIQUE (context_id, idx)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS cxdb_turn_idem
      ON cxdb_turn(context_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS cxdb_registry (
        type_id TEXT NOT NULL,
        type_version INTEGER NOT NULL,
        descriptor BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (type_id, type_version)
      );

      CREATE TABLE IF NOT EXISTS cxdb_bundle (
        bundle_id TEXT PRIMARY KEY,
        payload BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  createContext(input?: { at?: number }) {
    const at = input?.at ?? now();
    const run = this.db
      .query(
        `INSERT INTO cxdb_context (parent_context_id, head_turn_id, watermark, created_at)
         VALUES (NULL, NULL, 0, $created_at)`,
      )
      .run({ created_at: at });
    return context(
      this.db
        .query(`SELECT * FROM cxdb_context WHERE context_id = $context_id`)
        .get({ context_id: Number(run.lastInsertRowid) }) as Record<
        string,
        unknown
      > | null,
    );
  }

  forkContext(input: { from_turn_id: number; at?: number }) {
    const at = input.at ?? now();
    if (input.from_turn_id === 0) {
      const run = this.db
        .query(
          `INSERT INTO cxdb_context (parent_context_id, head_turn_id, watermark, created_at)
           VALUES (NULL, NULL, 0, $created_at)`,
        )
        .run({ created_at: at });
      return context(
        this.db
          .query(`SELECT * FROM cxdb_context WHERE context_id = $context_id`)
          .get({ context_id: Number(run.lastInsertRowid) }) as Record<
          string,
          unknown
        > | null,
      );
    }

    const source = turn(
      this.db
        .query(`SELECT * FROM cxdb_turn WHERE turn_id = $turn_id`)
        .get({ turn_id: input.from_turn_id }) as Record<string, unknown> | null,
    );
    const run = this.db
      .query(
        `INSERT INTO cxdb_context (parent_context_id, head_turn_id, watermark, created_at)
         VALUES ($parent_context_id, $head_turn_id, $watermark, $created_at)`,
      )
      .run({
        parent_context_id: source.context_id,
        head_turn_id: source.turn_id,
        watermark: source.idx,
        created_at: at,
      });
    return context(
      this.db
        .query(`SELECT * FROM cxdb_context WHERE context_id = $context_id`)
        .get({ context_id: Number(run.lastInsertRowid) }) as Record<
        string,
        unknown
      > | null,
    );
  }

  contexts(input?: { limit?: number }) {
    const limit = Math.max(Math.min(input?.limit ?? 10_000, 100_000), 1);
    return this.db
      .query(
        `SELECT * FROM cxdb_context
         ORDER BY context_id ASC
         LIMIT $limit`,
      )
      .all({ limit })
      .map((row) => context(row as Record<string, unknown>));
  }

  append(input: AppendInput) {
    const run = this.db.transaction((value: AppendInput) => {
      valid(value);
      const at = value.at ?? now();
      const payload = encode(value.payload);
      const payload_hash = hash(payload);
      const idem = value.idempotency_key ?? null;

      const prior = idem
        ? (this.db
            .query(
              `SELECT * FROM cxdb_turn
               WHERE context_id = $context_id AND idempotency_key = $idempotency_key`,
            )
            .get({
              context_id: value.context_id,
              idempotency_key: idem,
            }) as Record<string, unknown> | null)
        : null;
      if (prior) {
        if (
          String(prior.type_id) !== value.type_id ||
          Number(prior.type_version) !== value.type_version ||
          String(prior.payload_hash) !== payload_hash
        ) {
          idemConflict();
        }
        return turn(prior);
      }

      if (value.idempotency_key) {
        const existing = this.db
          .query(
            `SELECT * FROM cxdb_turn
             WHERE context_id = $context_id AND idempotency_key = $idempotency_key`,
          )
          .get({
            context_id: value.context_id,
            idempotency_key: value.idempotency_key,
          }) as Record<string, unknown> | null;
        if (existing) {
          if (
            String(existing.type_id) !== value.type_id ||
            Number(existing.type_version) !== value.type_version ||
            String(existing.payload_hash) !== payload_hash
          ) {
            idemConflict();
          }
          return turn(existing);
        }
      }

      const ctx = context(
        this.db
          .query(`SELECT * FROM cxdb_context WHERE context_id = $context_id`)
          .get({ context_id: value.context_id }) as Record<
          string,
          unknown
        > | null,
      );
      const parent_turn_id =
        value.parent_turn_id === undefined
          ? ctx.head_turn_id
          : value.parent_turn_id;
      if (parent_turn_id !== ctx.head_turn_id) {
        throw new Error("append parent does not match context head");
      }

      const row = this.db
        .query(
          `SELECT COALESCE(MAX(idx), -1) AS idx
           FROM cxdb_turn
           WHERE context_id = $context_id`,
        )
        .get({ context_id: value.context_id }) as Record<string, unknown>;
      const idx = Number(row.idx) + 1;

      this.db
        .query(
          `INSERT OR IGNORE INTO cxdb_blob (payload_hash, hash_algo, payload, created_at)
           VALUES ($payload_hash, 'blake3', $payload, $created_at)`,
        )
        .run({ payload_hash, payload, created_at: at });

      let turn_id = 0;
      try {
        const out = this.db
          .query(
            `INSERT INTO cxdb_turn
             (context_id, parent_turn_id, idx, at, type_id, type_version, payload_hash, idempotency_key)
             VALUES
             ($context_id, $parent_turn_id, $idx, $at, $type_id, $type_version, $payload_hash, $idempotency_key)`,
          )
          .run({
            context_id: value.context_id,
            parent_turn_id,
            idx,
            at,
            type_id: value.type_id,
            type_version: value.type_version,
            payload_hash,
            idempotency_key: idem,
          });
        turn_id = Number(out.lastInsertRowid);
      } catch (error) {
        if (!idem || !idemUnique(error)) throw error;
        const existing = this.db
          .query(
            `SELECT * FROM cxdb_turn
             WHERE context_id = $context_id AND idempotency_key = $idempotency_key`,
          )
          .get({
            context_id: value.context_id,
            idempotency_key: idem,
          }) as Record<string, unknown> | null;
        if (!existing) throw error;
        if (
          String(existing.type_id) !== value.type_id ||
          Number(existing.type_version) !== value.type_version ||
          String(existing.payload_hash) !== payload_hash
        ) {
          this.db
            .query(
              `DELETE FROM cxdb_blob
               WHERE payload_hash = $payload_hash
               AND NOT EXISTS (
                 SELECT 1 FROM cxdb_turn WHERE payload_hash = $payload_hash
               )`,
            )
            .run({ payload_hash });
          idemConflict();
        }
        return turn(existing);
      }

      this.db
        .query(
          `UPDATE cxdb_context
           SET head_turn_id = $head_turn_id
           WHERE context_id = $context_id`,
        )
        .run({ head_turn_id: turn_id, context_id: value.context_id });

      return turn(
        this.db
          .query(`SELECT * FROM cxdb_turn WHERE turn_id = $turn_id`)
          .get({ turn_id }) as Record<string, unknown> | null,
      );
    });

    return run(input);
  }

  turns(context_id: number, input?: { after?: number; limit?: number }) {
    const after = input?.after ?? -1;
    const limit = Math.max(Math.min(input?.limit ?? 1000, 10_000), 1);
    return this.db
      .query(
        `SELECT * FROM cxdb_turn
         WHERE context_id = $context_id AND idx > $after
         ORDER BY idx ASC
         LIMIT $limit`,
      )
      .all({ context_id, after, limit })
      .map((row) => turn(row as Record<string, unknown>));
  }

  payload(payload_hash: string) {
    const row = this.db
      .query(`SELECT payload FROM cxdb_blob WHERE payload_hash = $payload_hash`)
      .get({ payload_hash }) as { payload?: Uint8Array } | null;
    if (!row?.payload) return null;
    return row.payload;
  }

  project(payload_hash: string, type_id: string, type_version: number) {
    const bytes = this.payload(payload_hash);
    if (!bytes) return null;
    const row = this.db
      .query(
        `SELECT descriptor FROM cxdb_registry
         WHERE type_id = $type_id AND type_version = $type_version`,
      )
      .get({ type_id, type_version }) as { descriptor?: Uint8Array } | null;
    const decoded = decodeSafe(bytes);
    if (decoded === null) return null;
    if (!row?.descriptor) return decoded;
    const descriptor = decodeSafe(row.descriptor);
    if (descriptor === null) return null;
    return apply(decoded, descriptor);
  }

  register(input: RegisterInput) {
    const descriptor = encode(input.descriptor);
    const row = this.db
      .query(
        `SELECT descriptor FROM cxdb_registry
         WHERE type_id = $type_id AND type_version = $type_version`,
      )
      .get({
        type_id: input.type_id,
        type_version: input.type_version,
      }) as { descriptor?: Uint8Array } | null;
    if (!row) {
      this.db
        .query(
          `INSERT INTO cxdb_registry (type_id, type_version, descriptor, created_at)
           VALUES ($type_id, $type_version, $descriptor, $created_at)`,
        )
        .run({
          type_id: input.type_id,
          type_version: input.type_version,
          descriptor,
          created_at: now(),
        });
      return;
    }
    if (row.descriptor && same(row.descriptor, descriptor)) return;
    throw new Error("registry descriptor conflict");
  }

  bundle(bundle_id: string) {
    const row = this.db
      .query(`SELECT payload FROM cxdb_bundle WHERE bundle_id = $bundle_id`)
      .get({ bundle_id }) as { payload?: Uint8Array } | null;
    if (!row?.payload) return null;
    return decodeSafe(row.payload);
  }

  putBundle(bundle_id: string, payload: unknown) {
    const bytes = encode(payload);
    const row = this.db
      .query(`SELECT payload FROM cxdb_bundle WHERE bundle_id = $bundle_id`)
      .get({ bundle_id }) as { payload?: Uint8Array } | null;
    if (row?.payload && same(row.payload, bytes)) return "unchanged" as const;
    if (row?.payload) throw new Error("registry bundle conflict");
    this.db
      .query(
        `INSERT INTO cxdb_bundle (bundle_id, payload, created_at)
         VALUES ($bundle_id, $payload, $created_at)`,
      )
      .run({ bundle_id, payload: bytes, created_at: now() });
    return "created" as const;
  }

  types() {
    return this.db
      .query(
        `SELECT type_id, type_version, descriptor
         FROM cxdb_registry
         ORDER BY type_id ASC, type_version ASC`,
      )
      .all() as {
      type_id: string;
      type_version: number;
      descriptor: Uint8Array;
    }[];
  }

  descriptor(type_id: string, type_version: number) {
    const row = this.db
      .query(
        `SELECT descriptor FROM cxdb_registry
         WHERE type_id = $type_id AND type_version = $type_version`,
      )
      .get({ type_id, type_version }) as { descriptor?: Uint8Array } | null;
    if (!row?.descriptor) return null;
    return decodeSafe(row.descriptor);
  }

  head(context_id: number) {
    const row = this.db
      .query(
        `SELECT head_turn_id FROM cxdb_context WHERE context_id = $context_id`,
      )
      .get({ context_id }) as { head_turn_id?: number | null } | null;
    if (!row) throw new Error("context not found");
    if (row.head_turn_id === undefined || row.head_turn_id === null)
      return null;
    return Number(row.head_turn_id);
  }

  watermark(context_id: number) {
    const row = this.db
      .query(
        `SELECT watermark FROM cxdb_context WHERE context_id = $context_id`,
      )
      .get({ context_id }) as { watermark?: number } | null;
    if (!row) throw new Error("context not found");
    return Number(row.watermark ?? 0);
  }

  setWatermark(context_id: number, value: number) {
    const row = this.db
      .query(
        `UPDATE cxdb_context
         SET watermark = MAX(watermark, $watermark)
         WHERE context_id = $context_id
         RETURNING watermark`,
      )
      .get({ context_id, watermark: value }) as { watermark?: number } | null;
    if (!row) throw new Error("context not found");
  }

  close() {
    this.db.close();
  }
}

export function sqlite(path: string) {
  return new SqliteLog(path);
}
