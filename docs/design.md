# Design

Architecture and technical decisions for the opencode-memory-graph plugin.

---

## Overview

A plugin that gives AI agents persistent, structured memory using a temporal knowledge graph. Built on FalkorDB (Cypher) with two deployment modes: embedded local and remote server.

The memory graph is domain-agnostic at its core. A pluggable ontology system lets different use cases register their own entity types: coding agents track Components and Patterns, ops/IGA agents track Services and Endpoints, general agents track People and Resources. The core (Decisions, Lessons, Preferences, Tasks, Concepts) works identically across all domains.

The plugin hooks into the host's session lifecycle to automatically extract and store knowledge, and exposes tools for the LLM to search and retrieve memories.

---

## Storage backend

FalkorDB is the sole storage engine for both modes. This eliminates impedance mismatch — same Cypher queries, same client library (`falkordb` npm package), same graph schema.

> [!IMPORTANT]
> **Current MVP implementation status:** plugin startup uses env-driven runtime config. Local mode is the default, and remote mode is available when `MEMORY_GRAPH_MODE=remote` with remote host credentials. Remote still requires production hardening/soak validation.

### Local mode

Uses `falkordblite` (npm package). Starts an embedded Redis server with the FalkorDB module. Launches with the plugin, persists to disk, shuts down when the plugin stops.

```ts
import { FalkorDB } from "falkordblite";

const db = await FalkorDB.open({
  path: "~/.opencode/memory/data", // directory, not file
});
```

Data lives at `~/.opencode/memory/` by default. Configurable per project.

### Remote mode

Uses the standard `falkordb` npm client. Connects to a FalkorDB server running on a NAS, cloud instance, or Docker container.

```ts
import { FalkorDB } from "falkordb";

const db = await FalkorDB.connect({
  socket: { host: "nas.local", port: 6379 },
  password: "...",
});
```

> [!NOTE]
> Remote config schema currently enforces `tls: true` and a non-loopback host. Client connect passes `socket.tls` through to `FalkorDB.connect`.

### Configuration

```ts
// Local (default)
{ mode: "local", path: "~/.opencode/memory" }

// Remote
{ mode: "remote", host: "nas.local", port: 6379, password: "..." }
```

Switching modes requires only a config change. The graph schema and all queries remain identical.

---

## Plugin integration

The plugin uses OpenCode's plugin API to hook into lifecycle events and register tools.

> [!IMPORTANT]
> **Current MVP runtime hooks differ from the target architecture table below.** Active hooks today are `experimental.chat.system.transform`, `chat.message`, `experimental.session.compacting`, and `tool.execute.after` (placeholder TODO). Message extraction currently writes synchronously per message. Pre-compaction snapshot persistence is implemented with idempotent dedupe, but there is still no background extraction queue.

### Hooks

| Hook              | What happens                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session.start`   | Load core-tier entities into system prompt. Resume active context from last session.                                                                                                  |
| `session.end`     | Flush working-tier entities to the graph. Update session metadata.                                                                                                                    |
| `message.create`  | Queue message for entity extraction (async, non-blocking).                                                                                                                            |
| `context.compact` | **Pre-compaction flush.** Extract and persist all memories from the conversation before context is lost. This is the most critical hook — inspired by OpenClaw's silent agentic turn. |
| `tool.call`       | Track tool usage patterns (which tools, how often, in what contexts).                                                                                                                 |

### Tools

The plugin registers two tools with the LLM, following OpenClaw's two-tool retrieval pattern:

**`memory_search`** — Semantic search over the knowledge graph. Returns a ranked list of entity summaries with UUIDs.

```
memory_search({ query: "embedded graph database options" })
→ [
    { uuid: "...", name: "FalkorDB", type: "Tool", score: 0.92 },
    { uuid: "...", name: "Kuzu is deprecated", type: "Lesson", score: 0.87 },
    { uuid: "...", name: "Use FalkorDB for both modes", type: "Decision", score: 0.81 }
  ]
```

**`memory_get`** — Fetch full details of a specific entity, including its relationships and connected entities (1-hop neighborhood).

```
memory_get({ uuid: "..." })
→ {
    name: "Kuzu is deprecated",
    type: "Lesson",
    summary: "Apple acquired Kùzu Inc. in October 2025...",
    severity: "blocker",
    category: "dead_end",
    trigger: "choosing an embedded graph database",
    resolution: "Use FalkorDB Lite instead",
    relationships: [
      { type: "warns_against", target: "Kuzu", targetType: "Tool" },
      { type: "recommends", target: "FalkorDB", targetType: "Tool" },
      { type: "led_to", target: "Use FalkorDB for both modes", targetType: "Decision" }
    ]
  }
```

This two-tool pattern is token-efficient. The LLM searches first (cheap — just summaries), then fetches details only for relevant results (full content on demand).

### Proactive surfacing

In addition to reactive search, the plugin proactively surfaces `Lesson` entities when their trigger context matches the current conversation. This runs on every `message.create` hook:

1. Embed the current message content
2. Search `Lesson` entities by `trigger_embedding` similarity
3. If a match exceeds the threshold, inject a warning into the assistant's context

This is how the plugin prevents the user from going down a known bad path without being asked.

**Current status:** Proactive checker code exists in `src/plugin/proactive.ts` but is not wired to `message.create` hooks in `src/index.ts`.

---

## Memory tiers

Inspired by MemGPT/Letta's hierarchical memory architecture. Not all memories are equal — some should always be present, some are session-specific, some are retrieved on demand.

### Core tier

**Always loaded** into the system prompt at session start. Small, high-value, rarely changing.

Contents:

- User preferences (`Preference` entities) — core
- Active high-severity lessons (`Lesson` entities with severity: "blocker") — core
- Project identity and goals (`Project` entity) — coding pack
- Coding patterns and conventions (`Pattern` entities) — coding pack
- Agent behavioral directives (`Directive` entities) — general pack
- Critical endpoint details (`Endpoint` entities) — ops pack

Budget: ~2000 tokens. Kept lean to avoid eating context window.

### Working tier

**Session-active** context (planned). Currently only core-tier loads at session start — working-tier code exists but is not used by the active runtime path.

Contents:

- Current task and subtasks (`Task` entities)
- Recent decisions (`Decision` entities from last N sessions)
- Active errors being debugged (`Error` entities)

Budget: ~1000 tokens. Refreshed on each session.

### Archival tier

**Full knowledge graph.** Retrieved on demand via `memory_search` and `memory_get` tools. This is where the bulk of the graph lives.

Contents:

- All entities and relationships
- Historical decisions (including superseded ones)
- All lessons learned
- Component documentation
- Tool and concept references

Budget: unlimited (only retrieved fragments enter context).

---

## Search pipeline

The search pipeline combines three signals, inspired by OpenClaw's hybrid search and Graphiti's temporal model.

### Vector similarity (weight: 0.5)

Embed the query, search entity `name_embedding` and edge `fact_embedding` fields using cosine similarity. Returns semantically similar entities regardless of exact wording.

### Graph traversal (weight: 0.3)

Starting from the top vector matches, traverse 1-2 hops in the graph to find connected entities. This surfaces relationships that pure vector search would miss — e.g., searching for "FalkorDB" also surfaces the Decision that chose it and the Lesson about Kuzu that motivated the choice.

### Temporal decay (weight: 0.2)

Apply exponential recency decay to scores. Recent memories rank higher than old ones. Half-life is configurable (default: 30 days). Entities with `scope: "global"` (like Preferences) are exempt from decay.

Formula: `score *= exp(-lambda * age_days)` where `lambda = ln(2) / half_life_days`

### Post-processing

1. **MMR diversity re-ranking** — Prevents redundant results from consuming the retrieval budget. If two results are very similar to each other, demote the second one.
2. **Scope filtering** — If searching within a project, deprioritize global entities unless the query is preference-related.
3. **Confidence filtering** — Entities with `confidence: "speculative"` are ranked below `confirmed` ones.
4. **Validation check** — Entities with `validated_at` older than 30 days get a score penalty. Entities whose referenced files no longer exist get flagged.

---

## Entity extraction

The plugin extracts entities and relationships from conversations automatically. This is the "write" side of the system.

### Extraction strategy

On each `message.create` hook, the plugin queues the message for async processing. A background worker:

1. Sends the message (with recent context) to the LLM with an extraction prompt
2. The LLM returns structured JSON: entities found, relationships between them, and any updates to existing entities
3. The plugin merges these into the graph (deduplicating by name + type, updating summaries, adding new edges)

The extraction prompt is assembled dynamically from the active domain packs. Core labels (Decision, Lesson, Preference, Task, Concept) are always present. Each active pack contributes additional labels, examples, and extraction hints. For instance, with the `coding` + `ops` packs active, the prompt knows to look for:

- Decisions being made and their rationale (core)
- Lessons learned from failures or dead ends (core)
- Technologies being chosen or rejected (coding pack)
- Errors encountered and how they were resolved (coding pack)
- Service endpoints and their quirks (ops pack)
- Multi-step operational procedures (ops pack)
- API schema differences between versions (ops pack)

### Deduplication

Entity deduplication uses name embedding similarity (threshold: 0.9). If a new entity matches an existing one, the existing entity's summary is updated and a new edge is added rather than creating a duplicate node.

### Bootstrap

On first use in a project, the plugin can seed the graph from:

- `projectBrief.md` or `README.md` (project identity and goals)
- `CLAUDE.md` or `.cursor/rules/` (existing patterns and preferences)
- Recent git history (component structure, key files)

---

## Strategy files

Inspired by ConPort's custom instruction files. The plugin ships with prompt templates that teach the LLM how and when to use the memory tools.

These are injected into the system prompt alongside the core-tier entities. They cover:

- When to call `memory_search` (before making decisions, when encountering unfamiliar code, when starting a new task)
- When to explicitly log information (after making a decision, after resolving an error, after discovering a gotcha)
- How to interpret memory results (understanding confidence levels, temporal validity, lesson severity)
- The sync routine (explicitly flush memories on user command, similar to ConPort's "Sync ConPort")

---

## Pluggable ontology

The memory graph is not tied to a single domain. The ontology is split into core labels (always present) and domain packs (registered at init). See `docs/ontology.md` for the full schema.

### Why pluggable

The original design assumed coding agents only. But the same memory architecture — temporal knowledge graph, proactive lessons, memory tiers — applies to:

- **General-purpose agents** — browsing, research, file management, conversations. Need to remember people, places, resources, and behavioral directives.
- **Ops/IGA agents** — provisioning access across identity systems (MidPoint, WSO2, SpiceDB, Teleport). Need to remember service endpoints, API quirks, multi-step procedures, and schema differences between versions.
- **Any future domain** — customer support (remember customer history, escalation patterns), research (remember papers, findings, hypotheses), etc.

The core insight: Decisions, Lessons, Preferences, Tasks, and Concepts are universal. Only the "things" being decided about, learned about, or worked on change between domains.

### How it works

1. **Plugin config specifies active packs** — `{ packs: ["coding", "ops"] }`
2. **Extraction prompt is assembled** from core + active pack labels, examples, and hints
3. **Validation rules** from active packs run during periodic entity validation
4. **Relationship vocabulary** is the union of core + active pack relationships
5. **Custom packs** can be defined inline in config for niche domains

Packs are additive. Activating `["coding", "ops"]` gives you all labels from both. There are no conflicts because labels are just strings in the `label_type` field.

### Current implementation notes

- Config accepts mixed pack entries: built-in names (`"coding"`, `"general"`, `"ops"`) and inline custom pack objects.
- Unknown built-in names fail fast (`unknown pack: ...`) instead of being ignored.
- Custom packs cannot use reserved built-in pack names.
- Label collisions across selected packs fail fast (`label collision: ...`).
- Extraction validates `label_type` against the active pack set at parse time.

### Migration note

Pack validation is stricter than earlier drafts. Configurations that previously tolerated unknown pack names or duplicate labels now fail startup. This is intentional hardening; callers should treat config validation errors as deployment-time failures, not runtime warnings.

---

## Future considerations

Things we've identified as valuable but deferred past v1:

- **Community detection** — Auto-cluster strongly connected entities into topic groups using graph algorithms (Louvain, etc.). Useful for high-level project summaries.
- **Session transcript indexing** — Index full JSONL session files for "when did we discuss X?" queries. OpenClaw does this experimentally.
- **Cross-project knowledge transfer** — Share lessons and preferences across projects via the global scope. Requires careful deduplication.
- **Team memory** — Multiple users contributing to the same graph (remote mode). Requires access control and conflict resolution.
- **Memory compaction** — Periodically summarize old, low-relevance entities to keep the graph manageable. Similar to how LLMs compact context.
- **Export/import** — Markdown export for portability and human review (ConPort has this). Graph serialization for backup.
