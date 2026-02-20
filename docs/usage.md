# Usage Guide

Practical usage for end users and operators, aligned to current MVP behavior.

## Current status

| Capability           | Status                                           |
| -------------------- | ------------------------------------------------ |
| Local FalkorDB mode  | Supported and test-validated                     |
| Remote FalkorDB mode | Config-validated but partial runtime wiring      |
| Embedding search     | Optional local embeddings, with FTS fallback     |
| Proactive warnings   | Code exists, not wired into active runtime hooks |

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
  - `off` (default) or `local`
  - `local` enables local embedding model loading; failure degrades to FTS-only mode.

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

Remote (schema-valid, partial in runtime path):

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
- Plugin bootstrap hardcodes local storage mode (`src/index.ts:15`), completely ignoring user remote config.
- Remote connect path currently accepts `tls` in config type but does not pass TLS options into `FalkorDB.connect`.
- Proactive warning and working-tier modules exist but are not connected to active runtime hooks yet.
