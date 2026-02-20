# opencode-memory-graph

A knowledge-graph-powered memory plugin for [OpenCode](https://github.com/anomalyco/opencode). Gives your coding assistant persistent, structured memory across sessions using a temporal knowledge graph backed by [FalkorDB](https://www.falkordb.com/).

## Status

**Implementation in progress (MVP foundation complete).**

Implemented and tested:

- Local FalkorDB-backed graph client, schema bootstrap, deterministic IDs
- Idempotent mutation reservation/commit flow with mutation journaling metadata
- Extraction merge pipeline with schema validation, redaction, quarantine guards
- Scope/project isolation controls for search/get/update/delete paths
- Search MVP (vector + FTS fallback + recency decay + deterministic ordering)
- Pluggable ontology packs (built-in + inline custom packs) with collision validation
- Security hardening for prompt neutralization and protected lesson tamper blocking

Validation:

- `bun run typecheck`
- `bun test` (integration tests run against local embedded FalkorDB)

Post-MVP backlog remains active for remote-mode hardening, advanced ranking, proactive rollout tuning, and tier automation.

## Usage (MVP)

This section documents current behavior in code and tests (local-first).

### Quickstart

1. Install and build:

```bash
bun install
bun run build
```

2. Load the plugin from npm in your OpenCode config:

```json title="opencode.json"
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-memory-graph"]
}
```

3. Set runtime env vars (local mode):

```bash
export MEMORY_GRAPH_PATH="$HOME/.opencode/memory"
export MEMORY_EMBEDDINGS="off" # use "local" to enable local embeddings
```

4. Start OpenCode and use the tools:
   - `memory_search` for ranked summaries
   - `memory_get` for full entity details + 1-hop relationships

### Configuration examples

```ts
// Local (supported and tested)
{
  storage: { mode: "local", path: "~/.opencode/memory" },
  embeddings: "off", // or "local"
  default_scope: "project"
}
```

```ts
// Remote (schema-valid, but currently partial in runtime wiring)
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

### Local vs remote status

| Area                                   | Local                  | Remote                                                                    |
| -------------------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| Config schema validation               | Implemented            | Implemented (`tls: true`, non-local host required)                        |
| Plugin startup wiring (`src/index.ts`) | Implemented            | Not wired (startup currently forces `storage.mode: "local"`)              |
| Graph client connect path              | Implemented and tested | Implemented, but TLS option is not currently passed to `FalkorDB.connect` |
| Integration test coverage              | Covered (`bun test`)   | Not end-to-end covered                                                    |

### Security defaults (current)

- Defaults are local storage, embeddings off, project scope, proactive disabled.
- Memory text is redacted/neutralized before storage and tool output rendering.
- Global writes require explicit trust (`trusted_global=true`).

### Known limitations

- Local mode is the only fully exercised workflow today.
- Remote mode is partially implemented and not fully wired through plugin bootstrap yet.
- Proactive warning surfacing and working-tier loading modules exist, but are not wired into active runtime hooks.
- Tool usage tracking hook exists as a TODO placeholder.

### Troubleshooting (exact signals)

- `global writes require trusted_global=true`
  - Cause: global-scope write attempted without trust flag.
- `unknown label_type: ...`
  - Cause: extraction label is not part of active ontology labels.
- `label collision: ...`
  - Cause: conflicting label across selected packs/custom pack.
- `[memory] Failed to load embedding model, falling back to FTS-only`
  - Cause: local embedding model could not be loaded; search continues in FTS-only mode.

For deeper operator guidance, see `docs/usage.md`.

## Why this exists

Every AI coding assistant forgets everything between sessions. The current state of the art is flat markdown files (CLAUDE.md, .cursor/rules/, memory-bank/) or simple key-value stores. None of them can answer questions like:

- "What decisions led to this architecture?"
- "Last time we tried an embedded graph DB, what happened?"
- "What gotchas should I know about before using this library?"

A knowledge graph can. Entities have relationships, facts have timestamps, and lessons learned are first-class citizens — not buried in a text file nobody reads.

## Goals

- **Persistent memory** across sessions via a knowledge graph
- **Two deployment modes** — local (FalkorDB Lite embedded) and centralized (FalkorDB server on NAS/cloud)
- **Code-aware ontology** — decisions, patterns, components, tools, and a novel `Lesson` entity for anti-patterns, dead ends, and gotchas
- **Proactive warning surfacing** — the plugin will warn you before you go down a known bad path (planned feature - not yet active)
- **Hybrid search** — graph traversal + vector similarity + temporal decay
- **OpenCode plugin API** — hooks into session lifecycle, context compaction, and tool registration

## What makes this different

1. **Structured anti-pattern tracking** — first-class `Lesson` entities with severity, trigger context, and resolution. No other tool does this.
2. **Proactive surfacing** — trigger embeddings will match against current intent to surface relevant warnings (planned feature - code exists but not wired to runtime hooks).
3. **Temporal fact management** — edges expire, decisions get superseded, the graph captures why.
4. **Memory validation** — confidence levels and validation timestamps prevent stale memories from misleading the assistant.
5. **Scope-aware tiers** — global preferences vs. project decisions vs. session tasks, loaded with different priority.
6. **Unified backend** — FalkorDB for both local and remote. Same Cypher queries, same client library, just different connection config.

## Documentation

| Document                     | What it covers                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------- |
| [Usage](docs/usage.md)       | Quickstart, config, local vs remote status, security defaults, troubleshooting   |
| [Design](docs/design.md)     | Architecture, storage backend, plugin integration, search pipeline, memory tiers |
| [Ontology](docs/ontology.md) | Entity labels, relationship types, edge properties, the Lesson entity            |
| [Research](docs/research.md) | Comparative analysis of 15+ tools, technology decisions, key findings            |

## Technology choices

| Component         | Choice                             | Why                                                         |
| ----------------- | ---------------------------------- | ----------------------------------------------------------- |
| Graph DB (local)  | FalkorDB Lite                      | Embedded npm package, zero-config, Cypher, TypeScript-first |
| Graph DB (remote) | FalkorDB server                    | Same engine, same client library, same queries              |
| Query language    | Cypher                             | Shared across both modes, well-supported, readable          |
| Plugin host       | OpenCode plugin API                | Native TypeScript, hooks + tools, npm auto-install          |
| Search            | Hybrid (graph + vector + temporal) | Best ideas from OpenClaw and Graphiti                       |

## License

MIT
