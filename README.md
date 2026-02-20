# opencode-memory-graph

A memory plugin for [OpenCode](https://github.com/anomalyco/opencode) that helps your coding assistant remember useful project context across sessions.

It stores memory in a knowledge graph backed by [FalkorDB](https://www.falkordb.com/), so the assistant can recall decisions, relationships, and lessons learned instead of starting cold every time.

## Why this is useful

Most teams still experience memory loss in day-to-day AI coding workflows:

- yesterday's architectural decisions disappear
- repeated mistakes come back because prior lessons are not surfaced
- context gets split across chats, docs, and scratch notes

This plugin makes memory durable and queryable, so you can ask things like:

- "Why did we choose this approach?"
- "What failed last time and what was the fix?"
- "What should I avoid before touching this area?"

## Why FalkorDB local + remote matters

- **Local FalkorDB (embedded):** quick start, no external dependency, offline-friendly, data stays on your machine.
- **Remote FalkorDB (server):** shared/team memory across machines, centralized access control, easier backup/operations.
- **Same model in both modes:** same engine and Cypher patterns, so moving from local development to centralized deployment is low-friction.

## Current status

**MVP foundation is complete and test-validated.**

What works now:

- persistent memory writes with deterministic IDs and idempotent mutation handling
- memory retrieval via `memory_search` and `memory_get`
- hybrid ranking (graph traversal + vector/FTS fallback + temporal scoring + deterministic ordering)
- proactive warning surfacing (opt-in with `MEMORY_GRAPH_PROACTIVE=1`)
- scope isolation (project/global controls) and guarded global writes
- protected-lesson quarantine and supersede lifecycle handling
- working-tier and pre-compaction memory hooks

Validation run in this repo:

- `bun run typecheck`
- `bun test`
- remote harness validation in `src/graph/remote.test.ts`
- interface dry run in `scripts/e2e-interfaces-dry-run.ts`

## Quickstart

1. Install and build:

```bash
bun install
bun run build
```

2. Load plugin in your OpenCode config:

```json title="opencode.json"
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-memory-graph"]
}
```

3. Set local runtime env vars:

```bash
export MEMORY_GRAPH_PATH="$HOME/.opencode/memory"
export MEMORY_EMBEDDINGS="off" # off | local | cloud
```

4. Start OpenCode and use:

- `memory_search` to find relevant memories
- `memory_get` to inspect one entity and its nearby links

## Security and safety defaults

- defaults: local storage, embeddings off, project scope, proactive disabled
- redaction and prompt neutralization on memory text paths
- global writes require explicit trust (`trusted_global=true`)
- protected Lesson entities are guarded by quarantine rules

## Known limitations

- local mode is the most exercised path
- remote mode is functional and documented, but still depends on your deployment quality
- `tool.execute.after` tracking is still a TODO placeholder

## Documentation

| Document                                      | What it covers                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| [Usage](docs/usage.md)                        | Setup, config, local/remote behavior, troubleshooting                   |
| [Orbstack E2E](docs/e2e-opencode-orbstack.md) | Repeatable bring-up, verification, and teardown workflow                |
| [Plan Conformance](docs/plan-conformance.md)  | Roadmap-phase and deferred-item audit against implementation            |
| [Design](docs/design.md)                      | Architecture, lifecycle hooks, retrieval pipeline, tier model           |
| [Ontology](docs/ontology.md)                  | Entity/relationship schema and label packs                              |
| [Research](docs/research.md)                  | Comparative analysis of existing memory approaches and design rationale |

## License

MIT
