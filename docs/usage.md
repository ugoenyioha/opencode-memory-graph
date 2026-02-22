# Usage Guide

Practical usage for end users and operators, aligned to current MVP behavior.

## Current status

For a phase/deferred-item implementation audit with explicit plan changes, see `docs/plan-conformance.md`.

| Capability           | Status                                                      |
| -------------------- | ----------------------------------------------------------- |
| Local FalkorDB mode  | Supported and test-validated                                |
| Remote FalkorDB mode | Runtime-supported, hardening and E2E validation in progress |
| Embedding search     | Local or cloud-provider chain with safe FTS fallback        |
| Proactive warnings   | Runtime-wired (opt-in via `MEMORY_GRAPH_PROACTIVE=1`)       |
| SQLite truth log     | Supported (opt-in via `MEMORY_GRAPH_TRUTHLOG=1`)            |
| CXDB-compatible API  | Supported (`bun run serve:cxdb`)                            |

## Prerequisites

- Bun installed
- OpenCode installed
- Access to OpenCode config (`opencode.json`)

## Install and load plugin

1. Install package dependencies:

```bash
bun install
bun run build
```

2. Enable plugin via npm package in OpenCode config:

```json title="opencode.json"
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-memory-graph"]
}
```

## Runtime configuration reference

### Environment variables (effective now)

- `MEMORY_GRAPH_PATH`
  - Local FalkorDB storage directory.
  - Default: `~/.opencode/memory`
- `MEMORY_EMBEDDINGS`
  - `off` (default), `local`, or `cloud`
  - `local` enables local embedding model loading; failure falls through provider chain then FTS-only mode.
  - `cloud` skips local model and uses provider chain then FTS-only mode.
- `MEMORY_EMBED_PROVIDERS`
  - Comma-separated fallback order (default: `openai,voyage`).
  - Supported: `openai`, `voyage`.
- `OPENAI_API_KEY` / `MEMORY_EMBED_OPENAI_MODEL` / `MEMORY_EMBED_OPENAI_URL`
  - Optional OpenAI provider config for embedding fallback.
- `VOYAGE_API_KEY` / `MEMORY_EMBED_VOYAGE_MODEL` / `MEMORY_EMBED_VOYAGE_URL`
  - Optional Voyage provider config for embedding fallback.
- `MEMORY_GRAPH_PROACTIVE`
  - `1` enables proactive lesson surfacing during `chat.message` processing.
  - default is disabled (`0` / unset).
- `MEMORY_GRAPH_QUEUE_MODE`
  - `sync` (default): enqueue + immediate single-item drain in `chat.message`.
  - `async`: enqueue only in `chat.message`; rely on hook traffic or worker process to drain.
- `MEMORY_GRAPH_QUEUE_INTERVAL_MS` / `MEMORY_GRAPH_QUEUE_BATCH` / `MEMORY_GRAPH_PROJECT_ID`
  - Used by standalone worker mode (`bun run worker:queue`) to control poll interval, batch size, and project scope.
  - Failed queue items are retried with exponential backoff up to a capped attempt count.
- `MEMORY_GRAPH_TRUTHLOG`
  - `1` enables truthlog config path parsing in runtime config.
- `MEMORY_GRAPH_TRUTHLOG_PATH`
  - Path to SQLite truthlog file.
  - Default: `~/.opencode/memory/truthlog.sqlite`.
- `CXDB_HTTP_PORT`
  - Optional port override for `bun run serve:cxdb`.
  - Default: `9010`.

### Environment variables (test-only)

- `RUN_LOCAL_EMBED_TEST=1`
  - Only used by embedding tests.

### Config schema (effective and partial)

Local (effective now):

```ts
{
  storage: { mode: "local", path: "~/.opencode/memory" },
  embeddings: "off", // or "local"
  default_scope: "project",
  packs: ["coding"],
  proactive: { enabled: false }
}
```

Remote (runtime-supported, production hardening in progress):

```ts
{
  storage: {
    mode: "remote",
    host: "falkordb.example.internal",
    port: 6379,
    password: "...",
    tls: true
  },
  embeddings: "off",
  default_scope: "project"
}
```

Remote validation rules currently enforced:

- `tls` must be `true`
- `host` must not be localhost/loopback

## Local quickstart workflow

1. Set env vars:

```bash
export MEMORY_GRAPH_PATH="$HOME/.opencode/memory"
export MEMORY_EMBEDDINGS="off"
```

2. Start OpenCode in your project.
3. Ask the assistant to use:
   - `memory_search` to scan relevant memories
   - `memory_get` to fetch details by UUID
4. Confirm memory writes by checking that new project-scoped entities appear in subsequent `memory_search` results.

Optional worker mode for async queue draining:

```bash
export MEMORY_GRAPH_QUEUE_MODE="async"
bun run worker:queue
```

## Repeatable local integration fixture

Use `samples/sample-memory-graph-local` for deterministic local OpenCode-interface integration checks.

Baseline lane (required, embeddings off):

```bash
cd plugins/opencode-memory-graph
bun run smoke:local -- --sample-dir ../../samples/sample-memory-graph-local
```

Optional local semantic lane (local embeddings only):

```bash
cd plugins/opencode-memory-graph
bun run smoke:local:embeddings-local -- --sample-dir ../../samples/sample-memory-graph-local
```

The harness prints a PASS/FAIL matrix and exits non-zero on failures.

### How to read matrix reports

Model-matrix runs write JSON artifacts to:

- `samples/sample-memory-graph-local/.local/matrix-reports/<run-id>.json`

Key fields:

- `verdict`: `PASS`, `PASS_WITH_WARNINGS`, or `FAIL`
- `warning_count`: single-model failures on required scenarios
- `blocking_count`: required scenarios failed by 2+ models
- `rows[]`: per scenario/model evidence and timings
- `perf`: run-level latency baseline (`e2e_ms`, `memory_search_ms`, `memory_get_ms`)

Per-row interpretation:

- `scenario`: scenario id (`S*`/`T*`)
- `model`: model id, or `system` for non-model advanced checks
- `required`: required vs advanced gate
- `impact`: `none`, `warning`, `blocking`
- `class`: `provider/config`, `plugin/runtime`, or `test-harness`
- `duration_ms`: end-to-end scenario duration
- `memory_search_ms`, `memory_get_ms`: tool-level latencies (when present)

Pass policy:

- block only when 2+ models fail the same required scenario
- always surface single-model failures as warnings

Perf comparison baseline (for backend A/B, including future SurrealDB):

- compare `perf.e2e_ms.p50/p95`
- compare `perf.memory_search_ms.p50/p95`
- compare `perf.memory_get_ms.p50/p95`
- compare warning/blocking counts between runs

Truthlog operational commands:

```bash
export MEMORY_GRAPH_TRUTHLOG="1"
export MEMORY_GRAPH_TRUTHLOG_PATH="$HOME/.opencode/memory/truthlog.sqlite"

# Serve CXDB-compatible API + local viewer
bun run serve:cxdb

# Rebuild graph projection from truthlog
bun run rebuild:graph

# Integrity counters/checks
bun run check:integrity
```

## Remote quickstart workflow (advanced)

1. Set env vars:

```bash
export MEMORY_GRAPH_MODE="remote"
export MEMORY_GRAPH_HOST="falkordb.example.internal"
export MEMORY_GRAPH_PORT="6379"
export MEMORY_GRAPH_PASSWORD="..."
export MEMORY_GRAPH_TLS="true"
export MEMORY_EMBEDDINGS="cloud"
export MEMORY_EMBED_PROVIDERS="openai,voyage"
export OPENAI_API_KEY="..."
export MEMORY_GRAPH_PROACTIVE="1"
```

2. Start OpenCode and verify plugin boot succeeds.
3. Run `memory_search` and `memory_get` to validate read/write behavior.
4. Optionally run remote harness test:

```bash
RUN_REMOTE_GRAPH_TEST=1 bun test src/graph/remote.test.ts
```

Note: remote mode is supported but still requires production soak validation.

## Orbstack remote test deployment

Use the provided manifest to run an isolated FalkorDB instance for plugin remote-mode validation:

```bash
kubectl apply -f docs/k8s/orbstack-falkordb-remote-test.yaml
kubectl -n opencode-memory-graph-test rollout status statefulset/falkordb-memory-graph
```

Expected in-cluster endpoint:

- Host: `falkordb-memory-graph.opencode-memory-graph-test.svc.cluster.local`
- Port: `6379`

Example harness env vars for this deployment (direct client test, plain TCP):

```bash
export MEMORY_GRAPH_MODE="remote"
export MEMORY_GRAPH_HOST="falkordb-memory-graph.opencode-memory-graph-test.svc.cluster.local"
export MEMORY_GRAPH_PORT="6379"
export MEMORY_GRAPH_PASSWORD="" # optional for no-auth test deployments
export MEMORY_GRAPH_TLS="false"
```

This manifest is plain TCP for simple connectivity checks. OpenCode plugin runtime currently enforces remote config validation with `tls: true` and non-local host, so full remote OpenCode startup requires a TLS-enabled endpoint/proxy.

For full lifecycle validation (bring-up, connectivity checks, OpenCode E2E checks, teardown), use `docs/e2e-opencode-orbstack.md`.

If you need OpenCode remote-mode startup validation, use the TLS ingress manifest `docs/k8s/orbstack-falkordb-remote-test-ingress-tcp.yaml` from the E2E runbook.

## Operator checks

### Verify DB initialization

- On first plugin load, graph schema bootstrap runs automatically.
- Local mode should create/populate data under `MEMORY_GRAPH_PATH`.

### Verify embedding behavior

- With `MEMORY_EMBEDDINGS=off`, search runs without embedding model.
- With `MEMORY_EMBEDDINGS=local`, model load is attempted once and cached.
- If model load fails, the warning below is expected and search continues in FTS-only mode.

### Verify scope trust boundaries

- Default scope is `project`.
- Global writes are blocked unless explicitly trusted.

### Verify pre-compaction snapshot behavior

- During compaction, plugin attempts an idempotent pre-compaction snapshot write.
- Repeated compaction on the same session/message boundary should not duplicate snapshot entities.

## Security defaults and boundaries

- Default posture is conservative:
  - local storage
  - embeddings off
  - project scope
  - proactive disabled
- Text is neutralized/redacted before persistence/output to reduce prompt-injection and secret leakage risk.
- Global writes require explicit trust gating.

## Troubleshooting (exact runtime signals)

- `global writes require trusted_global=true`
  - Meaning: attempted global write without trust flag.
  - Action: retry with trusted global write path only when appropriate.

- `unknown label_type: ...`
  - Meaning: extracted entity label is not allowed by active packs.
  - Action: fix pack configuration or emitted label.

- `label collision: ...`
  - Meaning: selected packs/custom packs define conflicting labels.
  - Action: remove or rename conflicting label in pack selection/custom pack.

- `[memory] Failed to load embedding model, falling back to FTS-only`
  - Meaning: embedding model load failed.
  - Action: keep running in FTS-only mode, or fix local model/runtime prerequisites.

## Current implementation caveats

- Local mode is the only end-to-end tested integration path.
- Remote mode relies on env-driven runtime config (`MEMORY_GRAPH_MODE`, host/port/password/tls) rather than host config file wiring.
- Distinct-key high-contention appends are optimistic and may surface transient write conflicts under heavy parallelism.
- CAS deduplication is byte-level over msgpack payloads (semantic JSON key-order equivalence is not guaranteed).

## CXDB Phase 1 behavior notes

- Append type policy is strict allowlist (`src/cxdb/types.ts` canonical mutation types).
- Idempotency keys are strict identity keys:
  - Same `(context_id, idempotency_key)` is accepted only when `{type_id, type_version, payload_hash}` is identical.
  - Mismatch returns deterministic error: `idempotency key conflict`.
- Registry descriptors are immutable per `(type_id, type_version)`.
- `project()` returns `null` for malformed payload/descriptor bytes (safe decode behavior).

See `docs/cxdb-phase1.md` and `docs/cxdb-phases-2-7.md` for caveats, migration notes, and gate evidence.

## Remote production hardening checklist

- Use TLS-enabled remote endpoint (`MEMORY_GRAPH_TLS=true`).
- Use dedicated credentials and rotate `MEMORY_GRAPH_PASSWORD`.
- Restrict network access to trusted hosts only.
- Run remote harness test (`RUN_REMOTE_GRAPH_TEST=1`) in CI or pre-prod.
- Run soak test with representative write/search workload before production cutover.
