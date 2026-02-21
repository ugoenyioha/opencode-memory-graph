import { sqlite } from "./sqlite";

type ServerInput = {
  path: string;
  port?: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function home(value: string) {
  if (!value.startsWith("~/")) return value;
  const base = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return `${base}/${value.slice(2)}`;
}

function contextMeta(
  log: ReturnType<typeof sqlite>,
  context_id: number,
  limit = 1,
) {
  const head_turn_id = log.head(context_id);
  const all = log.turns(context_id, {
    after: -1,
    limit: Math.max(limit, 10_000),
  });
  const head = all.at(-1);
  return {
    context_id: String(context_id),
    head_turn_id: head_turn_id === null ? "0" : String(head_turn_id),
    head_depth: head ? head.idx + 1 : 0,
    created_at: new Date().toISOString(),
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

  if (!bytes) {
    return {
      turn_id: String(item.turn_id),
      parent_turn_id:
        item.parent_turn_id === null ? "0" : String(item.parent_turn_id),
      depth: item.idx + 1,
      declared_type,
    };
  }

  const data = log.project(item.payload_hash, item.type_id, item.type_version);
  const raw = {
    content_hash_b3: item.payload_hash,
    encoding: 1,
    compression: 0,
    uncompressed_len: bytes.length,
    bytes_b64: Buffer.from(bytes).toString("base64"),
  };

  const base = {
    turn_id: String(item.turn_id),
    parent_turn_id:
      item.parent_turn_id === null ? "0" : String(item.parent_turn_id),
    depth: item.idx + 1,
    declared_type,
    decoded_as: declared_type,
  };

  if (view === "raw") return { ...base, ...raw };
  if (view === "both") return { ...base, data, ...raw };
  return { ...base, data };
}

export function serveCxdb(input: ServerInput) {
  const log = sqlite(home(input.path));
  const port = input.port ?? 9010;

  return Bun.serve({
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/health") {
        return json({
          status: "ok",
          version: "phase1-sqlite",
          uptime_seconds: 0,
        });
      }

      if (path === "/") {
        const rows = log.contexts({ limit: 1000 });
        const items = rows
          .map(
            (item) =>
              `<button data-context="${item.context_id}" class="ctx">Context ${item.context_id}</button>`,
          )
          .join("");
        return new Response(
          `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Memory Graph CXDB View</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin: 0; padding: 20px; background: #0e1116; color: #d9e2f2; }
    h1 { margin-top: 0; }
    .layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; }
    .panel { border: 1px solid #243042; border-radius: 8px; background: #121a24; padding: 12px; }
    .ctx { width: 100%; text-align: left; margin: 6px 0; border: 1px solid #334761; background: #182433; color: #d9e2f2; border-radius: 6px; padding: 8px; cursor: pointer; }
    .ctx:hover { background: #223245; }
    pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
    .muted { color: #92a3bd; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Memory Graph CXDB View</h1>
  <div class="muted">Adapted local viewer for the SQLite truth log with CXDB-compatible APIs.</div>
  <div class="layout" style="margin-top: 12px;">
    <div class="panel">
      <h3>Contexts</h3>
      ${items || '<div class="muted">No contexts yet.</div>'}
    </div>
    <div class="panel">
      <h3>Turns</h3>
      <pre id="out" class="muted">Select a context to inspect turns.</pre>
    </div>
  </div>
  <script>
    const out = document.getElementById('out')
    document.querySelectorAll('.ctx').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const context = btn.dataset.context
        const res = await fetch('/v1/contexts/' + context + '/turns?limit=100&view=typed')
        const json = await res.json()
        out.textContent = JSON.stringify(json, null, 2)
      })
    })
  </script>
</body>
</html>`,
          { headers: { "content-type": "text/html" } },
        );
      }

      if (request.method === "GET" && path === "/v1/contexts") {
        const limit = Number(url.searchParams.get("limit") ?? "100");
        const contexts = log
          .contexts({ limit })
          .map((item) => contextMeta(log, item.context_id, 1));
        return json({ contexts, total: contexts.length });
      }

      const turnMatch = path.match(/^\/v1\/contexts\/(\d+)\/turns$/);
      if (request.method === "GET" && turnMatch) {
        const context_id = Number(turnMatch[1]);
        const before = Number(url.searchParams.get("before_turn_id") ?? "0");
        const limit = Number(url.searchParams.get("limit") ?? "64");
        const view = url.searchParams.get("view") ?? "typed";
        const all = log.turns(context_id, { after: -1, limit: 100_000 });
        const sliced =
          before > 0 ? all.filter((item) => item.turn_id < before) : all;
        const selected = sliced.slice(Math.max(sliced.length - limit, 0));
        const turns = selected.map((item) => decodeTurn(log, item, view));
        const next = selected.length > 0 ? selected[0]!.turn_id : 0;

        return json({
          meta: {
            context_id: String(context_id),
            head_turn_id: String(log.head(context_id) ?? 0),
            head_depth: all.at(-1)?.idx ? all.at(-1)!.idx + 1 : all.length,
            registry_bundle_id: "sqlite-local",
          },
          turns,
          next_before_turn_id: next > 0 ? String(next) : undefined,
        });
      }

      const appendMatch = path.match(/^\/v1\/contexts\/(\d+)\/append$/);
      if (request.method === "POST" && appendMatch) {
        const context_id = Number(appendMatch[1]);
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
        return json({
          context_id: String(context_id),
          turn_id: String(out.turn_id),
          depth: out.idx + 1,
          content_hash: out.payload_hash,
        });
      }

      if (
        request.method === "POST" &&
        (path === "/v1/contexts/create" || path === "/v1/contexts")
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          base_turn_id?: string;
        };
        const base = Number(body.base_turn_id ?? "0");

        if (!base) {
          const ctx = log.createContext();
          return json({
            context_id: String(ctx.context_id),
            head_turn_id: "0",
            head_depth: 0,
          });
        }

        const source = log
          .contexts({ limit: 100_000 })
          .find((item) => log.head(item.context_id) === base);
        if (!source) return json({ error: { code: "NOT_FOUND" } }, 404);
        const ctx = log.forkContext({ from_context_id: source.context_id });
        return json({
          context_id: String(ctx.context_id),
          head_turn_id: String(ctx.head_turn_id ?? 0),
          head_depth: log.turns(ctx.context_id).length,
        });
      }

      if (request.method === "POST" && path === "/v1/contexts/fork") {
        const body = (await request.json()) as { base_turn_id: string };
        const base = Number(body.base_turn_id ?? "0");
        const source = log
          .contexts({ limit: 100_000 })
          .find((item) => log.head(item.context_id) === base);
        if (!source) return json({ error: { code: "NOT_FOUND" } }, 404);
        const ctx = log.forkContext({ from_context_id: source.context_id });
        return json({
          context_id: String(ctx.context_id),
          head_turn_id: String(ctx.head_turn_id ?? 0),
          head_depth: log.turns(ctx.context_id).length,
        });
      }

      const bundle = path.match(/^\/v1\/registry\/bundles\/(.+)$/);
      if (request.method === "PUT" && bundle) {
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
        return new Response(null, { status: 201 });
      }

      if (request.method === "GET" && path === "/v1/stats") {
        const contexts = log.contexts({ limit: 100_000 });
        const turns = contexts.reduce(
          (sum, item) =>
            sum +
            log.turns(item.context_id, { after: -1, limit: 100_000 }).length,
          0,
        );
        return json({
          contexts: contexts.length,
          turns,
          blobs: -1,
          storage_bytes: -1,
          dedup_hit_rate: 0,
        });
      }

      return json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404);
    },
    error(error) {
      return json(
        { error: { code: "INTERNAL_ERROR", message: String(error) } },
        500,
      );
    },
  });
}
