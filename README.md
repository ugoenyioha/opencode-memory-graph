# opencode-memory-graph

A memory plugin for [OpenCode](https://github.com/anomalyco/opencode) that helps your coding assistant remember useful project context across sessions.

It stores memory in a knowledge graph backed by [FalkorDB](https://www.falkordb.com/), so the assistant can recall decisions, relationships, and lessons learned instead of starting cold every time.

## New in CXDB phases 1-7

The plugin now includes a local truth log and a CXDB-compatible runtime API.

- Every memory write is saved to a local SQLite truth log as an immutable turn.
- Graph writes now use a journal-first flow, so derived graph state is backed by truth-log history.
- You can replay history, rebuild graph state, and run integrity checks after failures.
- Session-to-context mapping keeps memory branchable per session instead of one shared thread.
- A CXDB-compatible HTTP API is available, with a local viewer for quick inspection.
- End-to-end and conformance tests are now part of the validation workflow.

## Why this is useful

Most teams still experience memory loss in day-to-day AI coding workflows:

- yesterday's architectural decisions disappear
- repeated mistakes come back because prior lessons are not surfaced
- context gets split across chats, docs, and scratch notes

This plugin makes memory durable and queryable, so you can ask things like:

- "Why did we choose this approach?"
- "What failed last time and what was the fix?"
- "What should I avoid before touching this area?"

## Why this matters for agentic memory

- deterministic replay and auditability make memory behavior explainable over time
- recoverability from projection corruption means you can rebuild derived state from truth
- session-to-context mapping enables branchable context per session instead of one global thread
- safer iterative autonomous agents: bad writes are easier to detect, isolate, and correct

## What is novel (and what is not)

This project is not the only memory system in the space: [CXDB](https://github.com/strongdm/cxdb) and [Mem0](https://mem0.ai) both exist and solve real problems.

- CXDB focuses on a portable memory protocol and ecosystem interoperability
- Mem0 focuses on managed memory extraction and retrieval for app and agent workflows
- this repo focuses on an OpenCode plugin that combines graph projection, a local-first truth log, a CXDB-compatible API surface, and adversarial conformance gates
- the novelty is the combination and integration approach, not a claim of absolute uniqueness

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
- retrieval weighting informed by recorded tool usage signals
- proactive warning surfacing (opt-in with `MEMORY_GRAPH_PROACTIVE=1`)
- scope isolation (project/global controls) and guarded global writes
- protected-lesson quarantine and supersede lifecycle handling
- working-tier and pre-compaction memory hooks
- queue-backed extraction path with hook-driven draining
- tool usage tracking records for future relevance tuning
- optional standalone queue worker mode (`bun run worker:queue`)

Validation run in this repo:

- `bun run typecheck`
- `bun test`
- remote harness validation in `src/graph/remote.test.ts`
- interface dry run in `scripts/e2e-interfaces-dry-run.ts`

## Evidence

Latest local verification run passed all current tests (99 pass / 0 fail at time of writing; counts can change as the suite evolves).

- `bun run typecheck`
- `bun test`
- `bun test src/cxdb/e2e.test.ts`

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
export MEMORY_GRAPH_TRUTHLOG=1
export MEMORY_GRAPH_TRUTHLOG_PATH="$HOME/.opencode/memory/truthlog.sqlite"
```

4. Optional: run the CXDB-compatible local server:

```bash
bun run serve:cxdb
```

5. Start OpenCode and use:

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
- queue worker uses retry backoff for transient failures; operator-facing queue health reporting is still minimal

## Documentation

| Document                                                           | What it covers                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [CXDB Phase 1](docs/cxdb-phase1.md)                                | SQLite truth log foundation, adversarial gate blockers/fixes, and acceptance     |
| [CXDB Phases 2-7](docs/cxdb-phases-2-7.md)                         | Journal integration, replay/rebuild/integrity, API/visualization, and E2E gates  |
| [Usage](docs/usage.md)                                             | Setup, config, local/remote behavior, troubleshooting                            |
| [Orbstack E2E](docs/e2e-opencode-orbstack.md)                      | Repeatable bring-up, verification, and teardown workflow                         |
| [Plan Conformance](docs/plan-conformance.md)                       | Roadmap-phase and deferred-item audit against implementation                     |
| [Feature Consolidation Audit](docs/feature-consolidation-audit.md) | Cross-product feature validation, missed-feature analysis, adopt/defer decisions |
| [Design](docs/design.md)                                           | Architecture, lifecycle hooks, retrieval pipeline, tier model                    |
| [Ontology](docs/ontology.md)                                       | Entity/relationship schema and label packs                                       |
| [Research](docs/research.md)                                       | Comparative analysis of existing memory approaches and design rationale          |

## License

MIT
