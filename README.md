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
- **Proactive warning surfacing** — the plugin warns you before you go down a known bad path
- **Hybrid search** — graph traversal + vector similarity + temporal decay
- **OpenCode plugin API** — hooks into session lifecycle, context compaction, and tool registration

## What makes this different

1. **Structured anti-pattern tracking** — first-class `Lesson` entities with severity, trigger context, and resolution. No other tool does this.
2. **Proactive surfacing** — trigger embeddings matched against current intent surface relevant warnings before you waste time.
3. **Temporal fact management** — edges expire, decisions get superseded, the graph captures why.
4. **Memory validation** — confidence levels and validation timestamps prevent stale memories from misleading the assistant.
5. **Scope-aware tiers** — global preferences vs. project decisions vs. session tasks, loaded with different priority.
6. **Unified backend** — FalkorDB for both local and remote. Same Cypher queries, same client library, just different connection config.

## Documentation

| Document                     | What it covers                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------- |
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
