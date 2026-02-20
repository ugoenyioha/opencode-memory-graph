# Ontology

The formal schema of entity types, relationship types, and their properties. This defines what the knowledge graph can represent.

The approach is **semi-structured**: a well-defined set of core entity labels for things coding assistants commonly need to remember, with extensible attributes for project-specific concepts. New labels can be added without schema changes.

> **FalkorDB limitation**: Maps cannot be stored as property values. All `attributes` fields in this schema are stored as **JSON strings** and parsed/serialized in the application layer. The `json.fromJsonMap()` / `json.toJson()` UDFs can be used in Cypher queries when needed. See `docs/schema.cypher` for the concrete implementation.

---

## Three-layer graph

The knowledge graph has three layers, inspired by Graphiti/Zep's architecture.

### Layer 1 — Episodes

Raw conversation data. Each episode is a message or tool result from a session, linked in sequence to form a timeline.

```cypher
(:Episode {
  uuid: STRING,
  content: STRING,
  source: STRING,       // "message" | "tool_result" | "file_change"
  session_id: STRING,
  created_at: INTEGER,  // Unix ms
  valid_at: INTEGER     // Unix ms
})

(:Episode)-[:NEXT]->(:Episode)
(:Episode)-[:MENTIONS]->(:Entity)
```

Episodes connect the semantic layer (entities) back to their source conversations. This enables "when did we discuss X?" queries.

### Layer 2 — Entities

The semantic layer. Extracted concepts, decisions, tools, patterns, and lessons. This is the core of the knowledge graph.

All entities share a base shape:

```cypher
(:Entity {
  uuid: STRING,
  name: STRING,
  summary: STRING,
  name_embedding: LIST<FLOAT>,  // 384-dim vector (all-MiniLM-L6-v2)
  label_type: STRING,            // e.g. "Decision", "Lesson", "Tool"
  labels: LIST<STRING>,          // e.g. ["Entity", "Decision"]
  attributes: STRING,            // JSON string (FalkorDB cannot store MAPs)
  scope: STRING,                 // "global" | "project" | "session"
  source: STRING,                // "auto" | "user" | "import" | "inferred"
  confidence: STRING,            // "confirmed" | "suspected" | "speculative"
  validated_at: INTEGER,         // Unix ms — last time checked
  ttl: INTEGER,                  // optional time-to-live in days (null = permanent)
  created_at: INTEGER,           // Unix ms
  trigger_embedding: LIST<FLOAT> // 384-dim, only for Lesson entities (null otherwise)
})
```

Entity types are expressed through the `labels` list, not through separate node classes. This keeps the schema flexible while allowing structured queries.

### Layer 3 — Communities (future, deferred to v2)

Auto-detected clusters of strongly connected entities. Each community gets a name and summary describing the topic area. Requires graph clustering algorithms (Louvain, label propagation, etc.).

```cypher
(:Community {
  uuid: STRING,
  name: STRING,
  summary: STRING,
  name_embedding: LIST<FLOAT>,  // 384-dim vector
  created_at: INTEGER            // Unix ms
})

(:Community)-[:HAS_MEMBER]->(:Entity)
```

---

## Entity labels

Each label represents a type of knowledge the coding assistant needs to remember. The `tier` column indicates which memory tier the entity typically belongs to (see design.md for tier definitions).

| Label        | Tier     | Scope             | What it captures                                           | Example                                                        |
| ------------ | -------- | ----------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `Project`    | Core     | project           | Repository/workspace identity, goals, tech stack overview  | "opencode-ng — TypeScript CLI tool for AI-assisted coding"     |
| `Decision`   | Archival | project           | Architectural and implementation decisions with rationale  | "Use FalkorDB for both local and remote storage modes"         |
| `Lesson`     | Archival | project or global | Anti-patterns, dead ends, gotchas, regressions, time sinks | "Kuzu was acquired by Apple — don't depend on it"              |
| `Pattern`    | Core     | project or global | Coding conventions, recurring patterns to follow           | "Prefer const over let, avoid destructuring, use dot notation" |
| `Preference` | Core     | global            | User preferences and style across all projects             | "User prefers single-word variable names"                      |
| `Component`  | Archival | project           | Files, modules, services, packages, logical units          | "src/plugin/index.ts — plugin system entry point"              |
| `Error`      | Archival | project           | Errors encountered and how they were resolved              | "Ghostty doesn't forward mouse drag events properly"           |
| `Task`       | Working  | session           | Current and recent work items, progress tracking           | "Build memory plugin for OpenCode — design phase"              |
| `Tool`       | Archival | project or global | Technologies, libraries, frameworks, APIs                  | "FalkorDB — graph database, Cypher queries, Redis-based"       |
| `Concept`    | Archival | project or global | Domain terms, glossary entries, abstract ideas             | "Knowledge graph", "temporal decay", "MCP server"              |

---

## The Lesson entity

The `Lesson` label is novel — no existing coding assistant memory system has a first-class concept for negative knowledge. Lessons capture things that went wrong, dead ends that were explored, and gotchas that should be avoided.

### Lesson-specific attributes

These live in the `attributes` map:

| Attribute           | Type                                                                                     | Required | Description                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `severity`          | `"blocker" \| "warning" \| "tip"`                                                        | yes      | How serious is this lesson? Blockers are surfaced proactively.                                |
| `category`          | `"anti_pattern" \| "dead_end" \| "gotcha" \| "regression" \| "perf_trap" \| "time_sink"` | yes      | What kind of negative knowledge is this?                                                      |
| `trigger`           | `STRING`                                                                                 | yes      | Natural language description of when this lesson should surface. Used for proactive matching. |
| `trigger_embedding` | `LIST<FLOAT>`                                                                            | yes      | Embedding of the trigger text for semantic similarity search.                                 |
| `resolution`        | `STRING`                                                                                 | no       | What to do instead. The recommended alternative or workaround.                                |
| `time_cost`         | `STRING`                                                                                 | no       | How much time was wasted before learning this lesson.                                         |

### Category definitions

| Category       | When to use                                               | Example                                                                          |
| -------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `anti_pattern` | A coding approach or convention that causes problems      | "Don't destructure in this codebase — use dot notation for context"              |
| `dead_end`     | An approach that was explored and abandoned               | "We tried Kuzu but Apple acquired the company, repo archived"                    |
| `gotcha`       | An environmental or tooling trap that's easy to fall into | "Ghostty doesn't forward mouse drag events — not a code bug"                     |
| `regression`   | A change that broke something                             | "Commit 5512231ca broke sidebar drag on the dev branch"                          |
| `perf_trap`    | A decision that causes performance or efficiency problems | "Don't use sentence-transformers/PyTorch for embeddings — too heavy"             |
| `time_sink`    | A debugging session or investigation that took too long   | "Spent 3 hours debugging CDI config — turned out Talos can't write outside /var" |

### Proactive surfacing

Lessons with `severity: "blocker"` or `severity: "warning"` are candidates for proactive surfacing. On each new message, the plugin:

1. Embeds the current message
2. Compares against `trigger_embedding` of active lessons
3. If similarity exceeds threshold (default: 0.75 for blockers, 0.85 for warnings), injects a warning

Example: User asks "what embedded graph DB should we use?" → the Kuzu lesson fires because its trigger is "choosing an embedded graph database."

---

## Relationship types

Relationships are edges between entities. Each edge carries properties that describe the relationship, including temporal validity.

### Edge base properties

```cypher
(:Entity)-[:RELATES_TO {
  uuid: STRING,
  name: STRING,               // relationship type name
  fact: STRING,                // natural language statement of the relationship
  fact_embedding: LIST<FLOAT>, // 384-dim vector for semantic search over relationships
  valid_at: INTEGER,           // Unix ms — when this fact became true
  invalid_at: INTEGER,         // Unix ms — when this fact stopped being true (null = still valid)
  expired_at: INTEGER,         // Unix ms — when this edge was superseded by a newer one
  episodes: LIST<STRING>,      // UUIDs of episodes that reference this edge
  attributes: STRING,          // JSON string (FalkorDB cannot store MAPs)
  created_at: INTEGER          // Unix ms
}]->(:Entity)
```

The `fact` and `fact_embedding` fields are key. They allow semantic search over relationships, not just entities. "What decisions were made about the storage backend?" can match the fact "FalkorDB was chosen because Kuzu was acquired by Apple" even if the query doesn't mention FalkorDB.

### Relationship vocabulary

| Name            | Meaning                                | Example                             |
| --------------- | -------------------------------------- | ----------------------------------- |
| `implements`    | A implements B                         | Pattern implements Decision         |
| `depends_on`    | A depends on B                         | Component depends on Tool           |
| `replaces`      | A replaces B (B gets `invalid_at` set) | New Decision replaces old Decision  |
| `resolves`      | A resolves B                           | Error resolution resolves Error     |
| `prefers`       | User prefers A (optionally over B)     | Preference prefers Pattern          |
| `belongs_to`    | A is part of B                         | Component belongs to Project        |
| `uses`          | A uses B                               | Project uses Tool                   |
| `led_to`        | A led to B (causal chain)              | Decision led to Decision            |
| `blocks`        | A blocks B                             | Task blocks Task                    |
| `related_to`    | General association (use sparingly)    | Concept related to Concept          |
| `warns_against` | Lesson warns against using A           | Lesson warns against Tool           |
| `recommends`    | Lesson recommends A as alternative     | Lesson recommends Tool              |
| `supersedes`    | A supersedes B (B is now historical)   | Decision supersedes Decision        |
| `caused_by`     | A was caused by B                      | Error caused by Component change    |
| `validated_by`  | A is confirmed by evidence B           | Decision validated by code location |

This vocabulary is a starting set. New relationship types can be added freely — the `name` field on edges is a string, not an enum.

---

## Temporal model

Inspired by Graphiti's bi-temporal approach. Every edge has three temporal fields:

- **`valid_at`** — When did this fact become true in the real world? (e.g., "FalkorDB was chosen on 2026-02-20")
- **`invalid_at`** — When did this fact stop being true? (e.g., if FalkorDB is later replaced, this edge gets `invalid_at` set)
- **`expired_at`** — When was this edge superseded by a new version? (Internal bookkeeping — the edge still exists for history, but a newer edge has replaced it)

All temporal fields use **Unix milliseconds** (INTEGER) rather than FalkorDB's native datetime types. This simplifies cross-language serialization and makes range queries straightforward.

This enables queries like:

- "What decisions are currently valid?" — `WHERE r.invalid_at IS NULL`
- "What changed in the last week?" — `WHERE r.created_at > $seven_days_ago`
- "What was the architecture before we switched to FalkorDB?" — `WHERE r.valid_at < 1708300800000`
- "Show me the chain of decisions that led to the current architecture" — traverse `led_to` and `supersedes` edges

---

## Scope model

Entities exist at one of three scopes:

| Scope     | Meaning                              | Lifetime                                       | Example                                                   |
| --------- | ------------------------------------ | ---------------------------------------------- | --------------------------------------------------------- |
| `global`  | Applies across all projects          | Permanent (follows the user)                   | Preferences, global lessons, tool familiarity             |
| `project` | Specific to one repository/workspace | Permanent within project                       | Decisions, patterns, components, project-specific lessons |
| `session` | Relevant only to the current session | Ephemeral (flushed to archival at session end) | Current task, in-progress debugging                       |

The scope determines:

- **Loading priority** — global preferences and project patterns are loaded into core tier at session start. Session entities are loaded into working tier.
- **Search filtering** — project-scoped queries deprioritize global entities unless relevant.
- **Cleanup** — session-scoped entities that aren't promoted to project scope at session end may be pruned.

---

## Validation model

Inspired by GitHub Copilot's memory validation. Memories can go stale — a decision about a file that no longer exists, a pattern for a framework that was removed.

Each entity has:

- **`confidence`** — How sure are we this is accurate? `confirmed` (validated against code), `suspected` (extracted from conversation, not verified), `speculative` (inferred, may be wrong).
- **`validated_at`** — Last time this entity was checked against the current state of the codebase.

The plugin periodically validates entities:

1. `Component` entities — check if the referenced file still exists
2. `Decision` entities — check if the code still reflects the decision
3. `Tool` entities — check if the dependency is still in package.json
4. `Pattern` entities — check if recent code follows the pattern

Entities that fail validation get `confidence` downgraded. Entities that haven't been validated in 30+ days get a search score penalty.

---

## Source provenance

Every entity tracks where it came from:

| Source     | Meaning                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| `auto`     | Automatically extracted from conversation by the plugin                      |
| `user`     | Explicitly logged by the user via a tool call                                |
| `import`   | Imported from projectBrief.md, CLAUDE.md, or similar bootstrap files         |
| `inferred` | Derived by the plugin from patterns in the graph (e.g., community detection) |

This matters for trust. A `user`-sourced entity with `confidence: "confirmed"` is more trustworthy than an `auto`-sourced entity with `confidence: "speculative"`. The search pipeline weights accordingly.

---

## Concrete schema

The complete FalkorDB Cypher schema — indexes, constraints, node/edge shapes, and common query patterns — is in [`docs/schema.cypher`](./schema.cypher). The entity extraction prompt template is in [`docs/extraction-prompt.md`](./extraction-prompt.md).
