import path from "node:path";
import { sqlite } from "./sqlite";
import { openapi } from "./openapi";
import type { GraphClient } from "../graph/client";
import { search } from "../search/hybrid";
import {
  stats as queueStats,
  deadLetters,
  retryDeadLetter,
  retryAllDeadLetters,
  purgeDeadLetters,
} from "../plugin/queue";

type ServerInput = {
  path: string;
  port?: number;
  frontend?: string;
  graph?: GraphClient;
  project_id?: string;
};

type StoreEvent = {
  type:
    | "context_created"
    | "context_metadata_updated"
    | "context_linked"
    | "turn_appended"
    | "client_connected"
    | "client_disconnected"
    | "error_occurred";
  data: Record<string, unknown>;
};

const enc = new TextEncoder();

function json(body: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });
}

function error(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

function home(value: string) {
  if (!value.startsWith("~/")) return value;
  const base = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return `${base}/${value.slice(2)}`;
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function int(value: string | null, fallback: number) {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function u64(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function safeData(value: unknown) {
  if (value === undefined) return null;
  return value;
}

function parseScope(value: unknown) {
  if (value === "global") return "global" as const;
  if (value === "project") return "project" as const;
  if (value === "session") return "session" as const;
  return undefined;
}

class Events {
  private all = new Set<(item: StoreEvent) => void>();
  private byContext = new Map<string, Set<(item: StoreEvent) => void>>();

  publish(item: StoreEvent) {
    for (const send of this.all) send(item);
    const id = String(item.data.context_id ?? "");
    if (!id) return;
    const list = this.byContext.get(id);
    if (!list) return;
    for (const send of list) send(item);
  }

  stream(context_id?: string) {
    return new ReadableStream({
      start: (controller) => {
        const send = (item: StoreEvent) => {
          controller.enqueue(
            enc.encode(
              `event: ${item.type}\ndata: ${JSON.stringify(item.data)}\n\n`,
            ),
          );
        };
        if (context_id) {
          if (!this.byContext.has(context_id)) {
            this.byContext.set(context_id, new Set());
          }
          this.byContext.get(context_id)?.add(send);
        }
        if (!context_id) this.all.add(send);
        const ping = setInterval(() => {
          controller.enqueue(enc.encode(`:heartbeat\n\n`));
        }, 20_000);
        controller.enqueue(enc.encode(`:connected\n\n`));
        return () => {
          clearInterval(ping);
          this.all.delete(send);
          if (context_id) this.byContext.get(context_id)?.delete(send);
        };
      },
      cancel: () => undefined,
    });
  }
}

function contextById(log: ReturnType<typeof sqlite>, context_id: number) {
  return (
    log
      .contexts({ limit: 100_000 })
      .find((item) => item.context_id === context_id) ?? null
  );
}

function turnById(log: ReturnType<typeof sqlite>, turn_id: number) {
  const all = log.contexts({ limit: 100_000 });
  for (const item of all) {
    const turn = log
      .turns(item.context_id, { after: -1, limit: 100_000 })
      .find((entry) => entry.turn_id === turn_id);
    if (turn) return turn;
  }
  return null;
}

function chain(log: ReturnType<typeof sqlite>, head_turn_id: number | null) {
  if (head_turn_id === null) return [];
  const out: ReturnType<typeof turnById>[] = [];
  let cur = head_turn_id;
  while (cur) {
    const row = turnById(log, cur);
    if (!row) break;
    out.push(row);
    cur = row.parent_turn_id ?? 0;
  }
  return out
    .reverse()
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function depth(log: ReturnType<typeof sqlite>, turn_id: number) {
  return chain(log, turn_id).length;
}

function line(log: ReturnType<typeof sqlite>, context_id: number) {
  const out: number[] = [];
  let cur = contextById(log, context_id);
  while (cur?.parent_context_id) {
    out.push(cur.parent_context_id);
    cur = contextById(log, cur.parent_context_id);
  }
  return out;
}

function meta(log: ReturnType<typeof sqlite>, context_id: number) {
  const ctx = contextById(log, context_id);
  if (!ctx) return null;
  const turns = chain(log, ctx.head_turn_id);
  const child = log
    .contexts({ limit: 100_000 })
    .filter((item) => item.parent_context_id === context_id)
    .map((item) => String(item.context_id));
  const root = line(log, context_id).at(-1);
  return {
    context_id: String(ctx.context_id),
    head_turn_id: String(ctx.head_turn_id ?? 0),
    head_depth: turns.length,
    created_at: iso(ctx.created_at),
    created_at_unix_ms: ctx.created_at,
    lineage: {
      parent_context_id:
        ctx.parent_context_id === null
          ? undefined
          : String(ctx.parent_context_id),
      root_context_id: root === undefined ? undefined : String(root),
      spawn_reason: ctx.parent_context_id === null ? undefined : "fork",
      child_context_count: child.length,
      child_context_ids: child,
    },
  };
}

function decodeTurn(
  log: ReturnType<typeof sqlite>,
  item: ReturnType<typeof log.turns>[number],
  view: string,
) {
  const bytes = log.payload(item.payload_hash);
  const declared_type = {
    type_id: item.type_id,
    type_version: item.type_version,
  };
  const base = {
    turn_id: String(item.turn_id),
    parent_turn_id:
      item.parent_turn_id === null ? "0" : String(item.parent_turn_id),
    depth: depth(log, item.turn_id),
    declared_type,
    decoded_as: declared_type,
  };
  if (!bytes) return base;

  const raw = {
    content_hash_b3: item.payload_hash,
    encoding: 1,
    compression: 0,
    uncompressed_len: bytes.length,
    bytes_b64: Buffer.from(bytes).toString("base64"),
  };
  const data = log.project(item.payload_hash, item.type_id, item.type_version);
  if (view === "raw") return { ...base, ...raw };
  if (view === "both") return { ...base, ...raw, data };
  return { ...base, data };
}

function exportLine(
  log: ReturnType<typeof sqlite>,
  item: ReturnType<typeof log.turns>[number],
) {
  return {
    turn_id: String(item.turn_id),
    parent_turn_id:
      item.parent_turn_id === null ? "0" : String(item.parent_turn_id),
    idx: item.idx,
    at: item.at,
    type_id: item.type_id,
    type_version: item.type_version,
    payload_hash: item.payload_hash,
    idempotency_key: item.idempotency_key,
    payload: safeData(
      log.project(item.payload_hash, item.type_id, item.type_version),
    ),
    metadata: {
      context_id: String(item.context_id),
    },
  };
}

async function staticFile(root: string, url: URL) {
  const clean = decodeURIComponent(url.pathname);
  const rel = clean === "/" ? "/index.html" : clean;
  const safe = rel.includes("..") ? "/index.html" : rel;
  const full = path.join(root, safe);
  const file = Bun.file(full);
  if (await file.exists()) return new Response(file);
  const index = Bun.file(path.join(root, "index.html"));
  if (await index.exists()) return new Response(index);
  return error(404, "NOT_FOUND", "Not found");
}

export function serveCxdb(input: ServerInput) {
  const log = sqlite(home(input.path));
  const events = new Events();
  const port = input.port ?? 9010;
  const ui = home(
    input.frontend ?? path.join(process.cwd(), "frontend", "out"),
  );
  const version = "phase9-cxdb";
  const project_id = input.project_id ?? "default";

  return Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      if (pathname === "/health" || pathname === "/healthz") {
        return json({
          status: "ok",
          version,
          uptime_seconds: 0,
        });
      }

      if (request.method === "GET" && pathname === "/v1/schema") {
        return json(openapi(version));
      }

      if (request.method === "GET" && pathname === "/v1/events") {
        return new Response(events.stream(), {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }

      const contextEvents = pathname.match(/^\/v1\/contexts\/(\d+)\/events$/);
      if (request.method === "GET" && contextEvents) {
        return new Response(events.stream(contextEvents[1]), {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      }

      if (request.method === "GET" && pathname === "/v1/contexts") {
        const limit = Number(url.searchParams.get("limit") ?? "100");
        const contexts = log
          .contexts({ limit })
          .map((item) => meta(log, item.context_id))
          .filter((item) => item !== null);
        return json({
          contexts,
          count: contexts.length,
          total: contexts.length,
        });
      }

      const context = pathname.match(/^\/v1\/contexts\/(\d+)$/);
      if (request.method === "GET" && context) {
        const item = meta(log, Number(context[1]));
        if (!item) return error(404, "NOT_FOUND", "Context not found");
        return json(item);
      }

      const children = pathname.match(/^\/v1\/contexts\/(\d+)\/children$/);
      if (request.method === "GET" && children) {
        const context_id = Number(children[1]);
        const recursive = url.searchParams.get("recursive") === "1";
        const limit = Number(url.searchParams.get("limit") ?? "256");
        const all = log.contexts({ limit: 100_000 });
        const out: number[] = [];
        const walk = (id: number) => {
          const next = all
            .filter((item) => item.parent_context_id === id)
            .map((item) => item.context_id);
          for (const child of next) {
            if (out.length >= limit) return;
            out.push(child);
            if (recursive) walk(child);
          }
        };
        walk(context_id);
        const list = out
          .map((item) => meta(log, item))
          .filter((item) => item !== null);
        return json({
          context_id: String(context_id),
          recursive,
          count: list.length,
          children: list,
        });
      }

      const provenance = pathname.match(/^\/v1\/contexts\/(\d+)\/provenance$/);
      if (request.method === "GET" && provenance) {
        const context_id = Number(provenance[1]);
        const item = contextById(log, context_id);
        if (!item) return error(404, "NOT_FOUND", "Context not found");
        const lineage = line(log, context_id);
        return json({
          context_id: String(context_id),
          provenance:
            item.parent_context_id === null
              ? null
              : {
                  parent_context_id: String(item.parent_context_id),
                  root_context_id: String(
                    lineage.at(-1) ?? item.parent_context_id,
                  ),
                  spawn_reason: "fork",
                },
        });
      }

      if (request.method === "GET" && pathname === "/v1/contexts/search") {
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        const limit = Number(url.searchParams.get("limit") ?? "50");
        const start = Date.now();
        const all = log.contexts({ limit: 100_000 });
        const list = all
          .map((item) => meta(log, item.context_id))
          .filter((item) => item !== null)
          .filter((item) => {
            if (!q) return true;
            return JSON.stringify(item).toLowerCase().includes(q);
          })
          .slice(0, limit);
        return json({
          contexts: list,
          total_count: list.length,
          elapsed_ms: Date.now() - start,
          query: q,
        });
      }

      if (request.method === "GET" && pathname === "/v1/export") {
        const context_id = u64(url.searchParams.get("context_id"));
        if (context_id === null) {
          return error(
            400,
            "BAD_REQUEST",
            "context_id query parameter is required",
          );
        }
        const ctx = contextById(log, context_id);
        if (!ctx) return error(404, "NOT_FOUND", "Context not found");
        const rows = chain(log, ctx.head_turn_id);
        const body = rows
          .map((item) => JSON.stringify(exportLine(log, item)))
          .join("\n");
        return new Response(body.length > 0 ? `${body}\n` : "", {
          headers: {
            "content-type": "application/x-ndjson",
            "content-disposition": `attachment; filename=context-${context_id}.jsonl`,
          },
        });
      }

      if (request.method === "POST" && pathname === "/v1/import") {
        const value = u64(url.searchParams.get("context_id"));
        if (value !== null && !contextById(log, value)) {
          return error(404, "NOT_FOUND", "Context not found");
        }
        const context_id = value ?? log.createContext().context_id;
        const raw = await request.text();
        if (!raw.trim()) {
          return json({
            context_id: String(context_id),
            turns_imported: 0,
            head_turn_id: String(log.head(context_id) ?? 0),
            errors: [],
          });
        }

        const lines = raw
          .split("\n")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        const errors: { line: number; message: string }[] = [];
        let imported = 0;
        for (const [idx, line] of lines.entries()) {
          let item: Record<string, unknown>;
          try {
            item = JSON.parse(line) as Record<string, unknown>;
          } catch {
            errors.push({ line: idx + 1, message: "invalid json" });
            continue;
          }

          const type_id = item.type_id;
          const type_version = Number(item.type_version ?? 0);
          if (typeof type_id !== "string" || !type_id) {
            errors.push({ line: idx + 1, message: "missing type_id" });
            continue;
          }
          if (!Number.isInteger(type_version) || type_version <= 0) {
            errors.push({ line: idx + 1, message: "invalid type_version" });
            continue;
          }

          const payload = item.payload ?? item.data;
          try {
            log.append({
              context_id,
              type_id,
              type_version,
              payload,
              idempotency_key:
                typeof item.idempotency_key === "string"
                  ? item.idempotency_key
                  : undefined,
            });
            imported += 1;
          } catch (cause) {
            errors.push({ line: idx + 1, message: String(cause) });
          }
        }

        const head = contextById(log, context_id)?.head_turn_id ?? 0;
        return json({
          context_id: String(context_id),
          turns_imported: imported,
          head_turn_id: String(head),
          errors,
        });
      }

      if (request.method === "POST" && pathname === "/v1/search") {
        if (!input.graph) {
          return error(
            501,
            "NOT_IMPLEMENTED",
            "search backend unavailable; start server with graph client",
          );
        }
        const start = Date.now();
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          query?: string;
          type?: string;
          scope?: string;
          after?: number;
          before?: number;
          limit?: number;
          project_id?: string;
        };
        if (!body.query?.trim()) {
          return error(400, "BAD_REQUEST", "query is required");
        }
        const list = await search(input.graph, {
          query: body.query,
          scope: parseScope(body.scope),
          limit: int(body.limit === undefined ? null : String(body.limit), 10),
          project_id: body.project_id ?? project_id,
        });
        const filtered = list.filter((item) => {
          if (body.type && item.type !== body.type) return false;
          if (body.after !== undefined && (item.created_at ?? 0) < body.after)
            return false;
          if (body.before !== undefined && (item.created_at ?? 0) > body.before)
            return false;
          return true;
        });
        return json({
          query: body.query,
          count: filtered.length,
          elapsed_ms: Date.now() - start,
          results: filtered,
        });
      }

      const turnsPath = pathname.match(/^\/v1\/contexts\/(\d+)\/turns$/);
      if (request.method === "GET" && turnsPath) {
        const context_id = Number(turnsPath[1]);
        const before = Number(url.searchParams.get("before_turn_id") ?? "0");
        const limit = Number(url.searchParams.get("limit") ?? "64");
        const view = url.searchParams.get("view") ?? "typed";
        const ctx = contextById(log, context_id);
        if (!ctx) return error(404, "NOT_FOUND", "Context not found");
        const all = chain(log, ctx.head_turn_id);
        const sliced =
          before > 0 ? all.filter((item) => item.turn_id < before) : all;
        const selected = sliced.slice(Math.max(sliced.length - limit, 0));
        const turns = selected.map((item) => decodeTurn(log, item, view));
        return json({
          meta: {
            context_id: String(context_id),
            head_turn_id: String(ctx.head_turn_id ?? 0),
            head_depth: all.length,
            registry_bundle_id: "sqlite-local",
          },
          turns,
          next_before_turn_id:
            selected.length > 0 ? String(selected[0]!.turn_id) : undefined,
        });
      }

      const append = pathname.match(/^\/v1\/contexts\/(\d+)\/append$/);
      if (request.method === "POST" && append) {
        const context_id = Number(append[1]);
        const body = (await request.json()) as {
          type_id: string;
          type_version: number;
          data?: unknown;
          payload?: unknown;
          parent_turn_id?: string;
          idempotency_key?: string;
        };
        const out = log.append({
          context_id,
          type_id: body.type_id,
          type_version: body.type_version,
          payload: body.data ?? body.payload,
          parent_turn_id:
            body.parent_turn_id && body.parent_turn_id !== "0"
              ? Number(body.parent_turn_id)
              : undefined,
          idempotency_key: body.idempotency_key,
        });
        const d = depth(log, out.turn_id);
        events.publish({
          type: "turn_appended",
          data: {
            context_id: String(context_id),
            turn_id: String(out.turn_id),
            parent_turn_id: String(out.parent_turn_id ?? 0),
            depth: d,
            declared_type_id: out.type_id,
            declared_type_version: out.type_version,
          },
        });
        return json({
          context_id: String(context_id),
          turn_id: String(out.turn_id),
          depth: d,
          content_hash: out.payload_hash,
        });
      }

      if (
        request.method === "POST" &&
        (pathname === "/v1/contexts/create" || pathname === "/v1/contexts")
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          base_turn_id?: string;
        };
        const base = Number(body.base_turn_id ?? "0");
        const ctx = base
          ? log.forkContext({ from_turn_id: base })
          : log.createContext();
        const d = ctx.head_turn_id === null ? 0 : depth(log, ctx.head_turn_id);
        events.publish({
          type: "context_created",
          data: {
            context_id: String(ctx.context_id),
            created_at: ctx.created_at,
          },
        });
        if (ctx.parent_context_id !== null) {
          events.publish({
            type: "context_linked",
            data: {
              child_context_id: String(ctx.context_id),
              parent_context_id: String(ctx.parent_context_id),
              spawn_reason: "fork",
            },
          });
        }
        return json({
          context_id: String(ctx.context_id),
          head_turn_id: String(ctx.head_turn_id ?? 0),
          head_depth: d,
        });
      }

      if (request.method === "POST" && pathname === "/v1/contexts/fork") {
        const body = (await request.json()) as { base_turn_id: string };
        const base = Number(body.base_turn_id ?? "0");
        const ctx = log.forkContext({ from_turn_id: base });
        const d = ctx.head_turn_id === null ? 0 : depth(log, ctx.head_turn_id);
        events.publish({
          type: "context_created",
          data: {
            context_id: String(ctx.context_id),
            created_at: ctx.created_at,
          },
        });
        if (ctx.parent_context_id !== null) {
          events.publish({
            type: "context_linked",
            data: {
              child_context_id: String(ctx.context_id),
              parent_context_id: String(ctx.parent_context_id),
              spawn_reason: "fork",
            },
          });
        }
        return json({
          context_id: String(ctx.context_id),
          head_turn_id: String(ctx.head_turn_id ?? 0),
          head_depth: d,
        });
      }

      const blob = pathname.match(/^\/v1\/blobs\/([a-z0-9]+)$/);
      if (request.method === "GET" && blob) {
        const bytes = log.payload(blob[1]);
        if (!bytes) return error(404, "NOT_FOUND", "Blob not found");
        return new Response(bytes as unknown as BodyInit, {
          headers: { "content-type": "application/octet-stream" },
        });
      }

      const fsList = pathname.match(/^\/v1\/turns\/(\d+)\/fs$/);
      if (request.method === "GET" && fsList) {
        const turn_id = Number(fsList[1]);
        const item = turnById(log, turn_id);
        if (!item) return error(404, "NOT_FOUND", "Turn not found");
        return json({
          turn_id: String(turn_id),
          path: url.searchParams.get("path") ?? "",
          fs_root_hash: item.payload_hash,
          entries: [],
        });
      }

      const fsFile = pathname.match(/^\/v1\/turns\/(\d+)\/fs\/(.+)$/);
      if (request.method === "GET" && fsFile) {
        const turn_id = Number(fsFile[1]);
        const item = turnById(log, turn_id);
        if (!item) return error(404, "NOT_FOUND", "Turn not found");
        const filePath = decodeURIComponent(fsFile[2]);
        return json({
          turn_id: String(turn_id),
          path: filePath,
          name: filePath.split("/").at(-1) ?? filePath,
          kind: "file",
          mode: "0644",
          size: 0,
          hash: item.payload_hash,
          content_base64: "",
        });
      }

      const bundlePath = pathname.match(/^\/v1\/registry\/bundles\/(.+)$/);
      if (request.method === "PUT" && bundlePath) {
        const bundle_id = decodeURIComponent(bundlePath[1]);
        const body = (await request.json()) as {
          types?: Record<string, { versions?: Record<string, unknown> }>;
        };
        for (const [type_id, item] of Object.entries(body.types ?? {})) {
          for (const [version, descriptor] of Object.entries(
            item.versions ?? {},
          )) {
            log.register({
              type_id,
              type_version: Number(version),
              descriptor,
            });
          }
        }
        const out = log.putBundle(bundle_id, body);
        return new Response(null, { status: out === "created" ? 201 : 204 });
      }

      if (request.method === "GET" && bundlePath) {
        const bundle_id = decodeURIComponent(bundlePath[1]);
        const body = log.bundle(bundle_id);
        if (!body) return error(404, "NOT_FOUND", "Bundle not found");
        return json(body, 200, { "cache-control": "public, max-age=31536000" });
      }

      const versionPath = pathname.match(
        /^\/v1\/registry\/types\/([^/]+)\/versions\/(\d+)$/,
      );
      if (request.method === "GET" && versionPath) {
        const type_id = decodeURIComponent(versionPath[1]);
        const type_version = Number(versionPath[2]);
        const row = log
          .types()
          .find(
            (item) =>
              item.type_id === type_id && item.type_version === type_version,
          );
        if (!row) return error(404, "NOT_FOUND", "Type version not found");
        const descriptor = log.descriptor(type_id, type_version);
        return json({
          type_id: row.type_id,
          type_version: row.type_version,
          descriptor,
        });
      }

      if (request.method === "GET" && pathname === "/v1/registry/types") {
        const grouped = new Map<string, number>();
        for (const row of log.types()) {
          grouped.set(
            row.type_id,
            Math.max(grouped.get(row.type_id) ?? 0, row.type_version),
          );
        }
        const types = [...grouped.entries()].map(
          ([type_id, latest_version]) => ({
            type_id,
            latest_version,
            bundle_id: "sqlite-local",
          }),
        );
        return json({ types });
      }

      if (request.method === "GET" && pathname === "/v1/registry/renderers") {
        return json({ version: 1, renderers: {} });
      }

      if (request.method === "GET" && pathname === "/v1/stats") {
        const contexts = log.contexts({ limit: 100_000 });
        const turns = contexts.reduce(
          (sum, item) => sum + chain(log, item.head_turn_id).length,
          0,
        );
        const blobs = new Set(
          contexts
            .flatMap((item) =>
              log.turns(item.context_id, { after: -1, limit: 100_000 }),
            )
            .map((item) => item.payload_hash),
        );
        const storage_bytes = [...blobs].reduce(
          (sum, key) => sum + (log.payload(key)?.length ?? 0),
          0,
        );
        return json({
          contexts: contexts.length,
          turns,
          blobs: blobs.size,
          storage_bytes,
          dedup_hit_rate: 0,
        });
      }

      // --- Metrics (unified snapshot for dashboard) ---
      if (request.method === "GET" && pathname === "/v1/metrics") {
        const contexts = log.contexts({ limit: 100_000 });
        const turns = contexts.reduce(
          (sum, item) => sum + chain(log, item.head_turn_id).length,
          0,
        );
        const blobs = new Set(
          contexts
            .flatMap((item) =>
              log.turns(item.context_id, { after: -1, limit: 100_000 }),
            )
            .map((item) => item.payload_hash),
        );
        const storage_bytes = [...blobs].reduce(
          (sum, key) => sum + (log.payload(key)?.length ?? 0),
          0,
        );
        const types = log.types();
        const bundles = new Set<string>();
        // Count distinct bundles from registry
        for (const t of types) {
          const b = log.descriptor(t.type_id, t.type_version);
          if (b) bundles.add(`${t.type_id}:${t.type_version}`);
        }

        const now = Date.now();
        const startTime = now - (process.uptime?.() ?? 0) * 1000;

        return json({
          ts: new Date().toISOString(),
          uptime_seconds: Math.floor((now - startTime) / 1000),
          memory: {
            sys_total_bytes: 0,
            sys_available_bytes: 0,
            sys_free_bytes: 0,
            sys_cached_bytes: 0,
            sys_swap_total_bytes: 0,
            sys_swap_free_bytes: 0,
            process_rss_bytes: process.memoryUsage?.()?.rss ?? 0,
            process_vmem_bytes: 0,
            process_heap_bytes: process.memoryUsage?.()?.heapUsed ?? null,
            process_open_fds: null,
            budget_bytes: 0,
            budget_pct: 0,
            hard_cap_bytes: 0,
            pressure_ratio: 0,
            pressure_level: "OK",
            spill_threshold_bytes: 0,
            spill_critical_bytes: 0,
          },
          sessions: {
            total: contexts.length,
            active: 0,
            idle: 0,
            last_activity_unix_ms: now,
          },
          objects: {
            contexts_total: contexts.length,
            turns_total: turns,
            blobs_total: blobs.size,
            registry_types_total: types.length,
            registry_bundles_total: bundles.size,
            heads_total: contexts.length,
          },
          storage: {
            turns_log_bytes: storage_bytes,
            turns_index_bytes: 0,
            turns_meta_bytes: 0,
            heads_table_bytes: 0,
            blobs_pack_bytes: storage_bytes,
            blobs_index_bytes: 0,
            data_dir_total_bytes: 0,
            data_dir_free_bytes: 0,
          },
          filesystem: {
            snapshots_total: 0,
            index_bytes: 0,
            content_bytes: 0,
          },
          perf: {
            append_tps_1m: 0,
            append_tps_5m: 0,
            append_tps_history: [],
            get_last_tps_1m: 0,
            get_last_tps_5m: 0,
            get_last_tps_history: [],
            get_blob_tps_1m: 0,
            get_blob_tps_5m: 0,
            get_blob_tps_history: [],
            registry_ingest_tps_1m: 0,
            registry_ingest_tps_5m: 0,
            http_req_tps_1m: 0,
            http_req_tps_5m: 0,
            http_req_tps_history: [],
            http_errors_tps_1m: 0,
            http_errors_tps_5m: 0,
            append_latency_ms: { p50: 0, p95: 0, p99: 0, max: 0, count: 0 },
            get_last_latency_ms: { p50: 0, p95: 0, p99: 0, max: 0, count: 0 },
            get_blob_latency_ms: { p50: 0, p95: 0, p99: 0, max: 0, count: 0 },
            http_latency_ms: { p50: 0, p95: 0, p99: 0, max: 0, count: 0 },
          },
          errors: {
            total: 0,
            by_type: {},
          },
        });
      }

      // --- Graph stats ---
      if (request.method === "GET" && pathname === "/v1/graph/stats") {
        if (!input.graph) return error(503, "NO_GRAPH", "Graph not connected");
        const g = input.graph;

        const entityCounts = (await g.roQuery(
          `MATCH (e:Entity)
           WHERE e.expired_at IS NULL
           RETURN e.label_type AS type, e.scope AS scope, count(e) AS count`,
        )) as { data: Record<string, unknown>[] };

        const byType: Record<string, number> = {};
        const byScope: Record<string, number> = {};
        let totalEntities = 0;
        for (const row of entityCounts.data ?? []) {
          const t = String(row.type ?? "unknown");
          const s = String(row.scope ?? "unknown");
          const c = Number(row.count ?? 0);
          byType[t] = (byType[t] ?? 0) + c;
          byScope[s] = (byScope[s] ?? 0) + c;
          totalEntities += c;
        }

        const relCounts = (await g.roQuery(
          `MATCH ()-[r:RELATES_TO]->()
           WHERE r.expired_at IS NULL
           RETURN count(r) AS total`,
        )) as { data: Record<string, unknown>[] };
        const totalRels = Number(relCounts.data?.[0]?.total ?? 0);

        const embCounts = (await g.roQuery(
          `MATCH (e:Entity)
           WHERE e.expired_at IS NULL
           RETURN
             count(CASE WHEN e.name_embedding IS NOT NULL THEN 1 END) AS with_embedding,
             count(e) AS total`,
        )) as { data: Record<string, unknown>[] };
        const withEmb = Number(embCounts.data?.[0]?.with_embedding ?? 0);
        const embTotal = Number(embCounts.data?.[0]?.total ?? 0);

        const quarantine = (await g.roQuery(
          `MATCH (q:Quarantine) RETURN count(q) AS total`,
        )) as { data: Record<string, unknown>[] };
        const quarantineTotal = Number(quarantine.data?.[0]?.total ?? 0);

        return json({
          entities: {
            total: totalEntities,
            by_type: byType,
            by_scope: byScope,
          },
          relationships: {
            total: totalRels,
          },
          embeddings: {
            with_embedding: withEmb,
            total: embTotal,
            coverage_pct: embTotal > 0 ? Math.round((withEmb / embTotal) * 100) : 0,
          },
          quarantine: {
            total: quarantineTotal,
          },
        });
      }

      // --- Queue health ---
      if (request.method === "GET" && pathname === "/v1/queue/stats") {
        if (!input.graph) return error(503, "NO_GRAPH", "Graph not connected");
        const result = await queueStats(input.graph, project_id);
        return json(result);
      }

      // --- Dead-letter endpoints ---
      if (request.method === "GET" && pathname === "/v1/queue/dead-letters") {
        if (!input.graph) return error(503, "NO_GRAPH", "Graph not connected");
        const limit = int(url.searchParams.get("limit"), 50);
        const offset = int(url.searchParams.get("offset"), 0);
        const result = await deadLetters(input.graph, project_id, {
          limit,
          offset,
        });
        return json(result);
      }

      const retryMatch = pathname.match(
        /^\/v1\/queue\/dead-letters\/([^/]+)\/retry$/,
      );
      if (request.method === "POST" && retryMatch) {
        if (!input.graph) return error(503, "NO_GRAPH", "Graph not connected");
        const uuid = decodeURIComponent(retryMatch[1]);
        const ok = await retryDeadLetter(input.graph, uuid);
        if (!ok) return error(404, "NOT_FOUND", "Dead letter not found");
        return json({ ok: true, uuid });
      }

      if (request.method === "POST" && pathname === "/v1/queue/dead-letters/retry-all") {
        if (!input.graph) return error(503, "NO_GRAPH", "Graph not connected");
        const count = await retryAllDeadLetters(input.graph, project_id);
        return json({ ok: true, retried: count });
      }

      if (request.method === "DELETE" && pathname === "/v1/queue/dead-letters") {
        if (!input.graph) return error(503, "NO_GRAPH", "Graph not connected");
        const beforeParam = url.searchParams.get("before");
        const before = beforeParam ? Number(beforeParam) : undefined;
        const count = await purgeDeadLetters(
          input.graph,
          project_id,
          before && Number.isFinite(before) ? before : undefined,
        );
        return json({ ok: true, purged: count });
      }

      if (!pathname.startsWith("/v1/")) {
        return staticFile(ui, url);
      }

      return error(404, "NOT_FOUND", "Not found");
    },
    error(item) {
      return error(500, "INTERNAL_ERROR", String(item));
    },
  });
}
