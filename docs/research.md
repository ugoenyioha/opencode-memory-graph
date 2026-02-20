# Research

Comparative analysis of memory systems across coding assistants, and the technology decisions that shaped this plugin's design.

---

## Systems analyzed in depth

### OpenClaw memory system

OpenClaw (formerly Claw) has the most sophisticated open-source memory implementation we found. Full source at `/tmp/openclaw/src/memory/`. Key files: `manager.ts`, `hybrid.ts`, `mmr.ts`, `temporal-decay.ts`, `internal.ts`, `query-expansion.ts`, `memory-schema.ts`.

#### Architecture

- **Markdown-first storage** — Source of truth is plain `.md` files in the workspace. The SQLite index is derived and fully rebuildable from these files. This means memory is human-readable, git-trackable, and survives database corruption.
- **Per-agent isolation** — Each agent gets its own SQLite database. No cross-contamination between different agent personas.
- **Chunking** — Files are split into ~400-token chunks with ~80 token overlap. Each chunk tracks its source file and line numbers for citations.

#### Techniques worth adopting

| Technique                             | How OpenClaw does it                                                                                                                                                                                                                                                                                        | How we adapt it                                                                                                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Hybrid search**                     | 70% vector similarity + 30% BM25 keyword search, merged into a single ranked list. Defined in `hybrid.ts`.                                                                                                                                                                                                  | We use 50% vector + 30% graph traversal + 20% temporal decay. Graph traversal replaces BM25 since relationships carry more signal than keyword overlap in a knowledge graph.                                                   |
| **Temporal decay**                    | Exponential recency decay with configurable half-life. Evergreen files are exempt. Defined in `temporal-decay.ts`. Formula: `score *= exp(-lambda * age_days)` where `lambda = ln(2) / half_life_days`.                                                                                                     | Adopted directly. We apply decay to entity `created_at` and edge `valid_at`. Entities with `scope: "global"` (preferences, permanent lessons) are exempt, similar to evergreen files.                                          |
| **MMR diversity re-ranking**          | Maximal Marginal Relevance. After scoring, results that are too similar to already-selected results get demoted. Prevents redundant results from consuming the retrieval budget. Defined in `mmr.ts`.                                                                                                       | Adopted directly. Applied as a post-processing step after hybrid scoring.                                                                                                                                                      |
| **Pre-compaction memory flush**       | Before context compaction (when the conversation gets too long), OpenClaw runs a silent agentic turn that extracts and saves durable memories. This is the most critical moment for memory — if you don't save before compaction, knowledge is lost forever. Defined in `auto-reply/reply/memory-flush.ts`. | Adopted via the `context.compact` hook. When OpenCode compacts context, our plugin intercepts, extracts entities and relationships from the full conversation, and persists them to the graph before the context is truncated. |
| **Two-tool retrieval pattern**        | `memory_search` returns summaries (cheap, token-efficient scan). `memory_get` fetches specific content by line range (targeted, full detail). The LLM searches first, then fetches only what's relevant. Defined in `agents/tools/memory-tool.ts`.                                                          | Adopted directly. Our `memory_search` returns entity summaries with UUIDs. Our `memory_get` returns full entity details plus 1-hop relationships.                                                                              |
| **Embedding provider fallback chain** | Tries local GGUF model first, then OpenAI, then Gemini, then Voyage, then falls back to FTS-only mode with no embeddings. Defined in `embeddings.ts`.                                                                                                                                                       | We'll implement a similar chain. Local embeddings first (for offline/privacy), cloud fallback for quality, FTS-only as last resort.                                                                                            |
| **Query expansion for FTS-only mode** | When no embedding provider is available, OpenClaw expands the search query by removing stop words and extracting keywords. Defined in `query-expansion.ts`.                                                                                                                                                 | Adopted as fallback. When running without embeddings, we expand Cypher full-text queries with extracted keywords.                                                                                                              |
| **MEMORY.md bootstrap**               | On first use, OpenClaw loads a `MEMORY.md` file from the workspace to seed initial context. Defined in `agents/workspace.ts`.                                                                                                                                                                               | We bootstrap from `projectBrief.md`, `README.md`, or `CLAUDE.md` — whatever exists in the workspace.                                                                                                                           |
| **Session transcript indexing**       | Experimental, opt-in. Indexes JSONL session files so you can search "when did we discuss X?" Defined in `session-files.ts`.                                                                                                                                                                                 | Deferred to v2. Our episodic layer (Layer 1) serves a similar purpose but stores episodes in the graph rather than indexing external files.                                                                                    |
| **Sync triggers and file watching**   | Detects when `.md` files change on disk and re-indexes them. Per-file change detection avoids re-processing unchanged files. Defined in `manager-sync-ops.ts` and `sync-index.ts`.                                                                                                                          | Not directly applicable — our source of truth is the graph, not markdown files. But the principle of incremental updates (only process what changed) applies to our entity extraction pipeline.                                |

#### What OpenClaw doesn't do (and we improve on)

- **No graph structure** — OpenClaw stores flat chunks in SQLite. No relationships between memories. You can't ask "what decisions led to this architecture?" or "what's connected to this error?"
- **No entity extraction** — Memories are raw text chunks, not structured entities. There's no concept of a Decision, Pattern, or Lesson as a typed object.
- **No temporal validity on facts** — Chunks don't expire. Old decisions and new decisions have equal weight (modulo recency decay on the file level). There's no way to mark a fact as superseded.
- **No proactive surfacing** — OpenClaw only retrieves when asked. It never warns you proactively about a known gotcha.
- **No remote/centralized mode** — SQLite only, local to the machine.
- **No scope model** — All memories are project-scoped. No concept of global preferences that follow the user across projects.

---

### ConPort (Context Portal)

**Repo:** [GreatScottyMac/context-portal](https://github.com/GreatScottyMac/context-portal) | 738 stars | Python/FastAPI | Apache-2.0

An MCP server that builds a project-specific knowledge graph for AI assistants using SQLite per workspace.

#### Architecture

- **SQLite per workspace** — One database per project, auto-created.
- **STDIO transport** — Designed for IDE integration (Roo Code, Cline, Windsurf, Cursor).
- **26+ tools** — Individual tools for each operation (log_decision, get_decisions, search_decisions_fts, etc.).
- **ChromaDB for vectors** — Uses `sentence-transformers` (PyTorch) and ChromaDB for semantic search. Heavy dependency chain.
- **Alembic migrations** — Schema evolution handled properly.

#### Entity types

| Type            | Fields                                                     |
| --------------- | ---------------------------------------------------------- |
| Product Context | Goals, features, architecture (JSON blob, patch-updatable) |
| Active Context  | Current focus, recent changes, open issues (JSON blob)     |
| Decisions       | Summary, rationale, tags, FTS-searchable                   |
| Progress        | Description, status, parent/child hierarchy                |
| System Patterns | Name, description, tags                                    |
| Custom Data     | Arbitrary key-value under categories                       |
| Links           | Source type/id → target type/id with relationship type     |
| History         | Version history for product/active context                 |

#### What ConPort does well

- **Strategy files** — Ships per-IDE prompt templates that teach the LLM how to use all 26+ tools. The `generic_conport_strategy` file is essentially a full behavioral spec: initialization sequence, sync routine, proactive linking suggestions, RAG retrieval pipeline. This is a real insight — the memory system is only as good as the instructions that teach the LLM to use it.
- **Explicit linking with typed relationships** — `link_conport_items(source_type, source_id, target_type, target_id, relationship_type, description)`. Good starting vocabulary: `implements`, `related_to`, `tracks`, `blocks`, `clarifies`, `depends_on`.
- **Sync routine** — "Sync ConPort" command halts, reviews full chat, bulk-updates. Manual version of OpenClaw's pre-compaction flush.
- **`projectBrief.md` bootstrap** — Reads project brief on first use to seed knowledge base.
- **Markdown export/import** — Portable data format.
- **Batch operations** — `batch_log_items` for bulk inserts.
- **Patch-based updates** — `patch_content` with `__DELETE__` sentinel for partial context updates.

#### What ConPort doesn't do well

- **Not a real graph** — The `context_links` table is a flat SQL table with JOINs. No path queries, no recursive traversal, no graph algorithms. You can ask "what's linked to Decision D-5?" but not "what's the chain of decisions that led to this architecture?"
- **No automatic entity extraction** — Everything must be explicitly logged by the AI via tool calls. No extraction from conversation.
- **No hybrid search** — FTS and vector search are separate tools, not merged.
- **No temporal decay** — All memories are equally weighted regardless of age.
- **No pre-compaction flush** — Relies on manual "Sync ConPort" or proactive AI logging.
- **No remote mode** — SQLite only, local.
- **Python in a TypeScript ecosystem** — Requires spawning a Python subprocess for OpenCode integration.
- **Heavy dependencies** — PyTorch via sentence-transformers, ChromaDB.
- **Too many tools** — 26+ tools for the LLM to learn. Our two-tool pattern is more token-efficient.

---

### Graphiti / Zep

**Repo:** [getzep/graphiti](https://github.com/getzep/graphiti) | Open-source temporal knowledge graph framework powering Zep's context engineering platform.

#### Architecture

- **Three-layer graph** — Episodic (raw data) → Semantic/Entity (extracted concepts) → Community (auto-detected clusters). This is the architecture we adopted.
- **Neo4j / FalkorDB backend** — Supports multiple graph providers including Neo4j, FalkorDB, Kuzu (deprecated), and Amazon Neptune.
- **Bi-temporal model** — Records both when a fact became true (`valid_at`) and when it was ingested (`created_at`). Facts can be invalidated (`invalid_at`) when superseded.
- **Custom entity/edge types** — Defined via Pydantic models. PascalCase for types, snake_case for attributes.
- **Automatic ontology creation** — Can auto-construct entity types from incoming data.

#### Key source code insights (from nodes.py and edges.py)

**EntityNode:**

```python
class EntityNode(Node):
    name_embedding: list[float] | None  # for vector search
    summary: str                         # regional summary of surrounding edges
    attributes: dict[str, Any]           # label-specific properties (open bag)
    labels: list[str]                    # dynamic type labels
```

**EntityEdge:**

```python
class EntityEdge(Edge):
    name: str              # relationship type
    fact: str              # natural language fact
    fact_embedding: list[float] | None  # for semantic search over relationships
    episodes: list[str]    # source episode UUIDs
    expired_at: datetime | None   # when superseded
    valid_at: datetime | None     # when fact became true
    invalid_at: datetime | None   # when fact stopped being true
    attributes: dict[str, Any]    # edge-type-specific properties
```

**Key insight:** Facts live on edges, not just nodes. "FalkorDB was chosen because Kuzu was acquired" is a relationship fact with temporal validity. This enables queries over the evolution of knowledge, not just its current state.

#### What Graphiti does that we adopted

- Three-layer graph architecture (episodes → entities → communities)
- Temporal edges with `valid_at` / `invalid_at` / `expired_at`
- Name/fact embeddings for semantic search over both nodes and edges
- Open `attributes` bag on entities and edges for extensibility
- Dynamic labels rather than rigid node classes
- Multi-provider support pattern (their `GraphDriver` abstraction)

#### What Graphiti doesn't do (and we add)

- No `Lesson` / anti-pattern concept
- No proactive surfacing of warnings
- No memory tiers (core / working / archival)
- No scope model (global / project / session)
- No confidence / validation tracking
- No source provenance
- Python-only (we're TypeScript)

---

### Mem0 (graph memory mode)

Mem0 extracts entities and relationships from conversations and stores them in a graph (Neo4j, Memgraph, or Kuzu). It's focused on general-purpose AI assistant memory, not coding-specific.

#### Key observations

- Entity extraction via LLM — sends conversation to GPT/Claude with an extraction prompt, gets back structured entities and relationships.
- Deduplication by name similarity — avoids creating duplicate nodes for the same concept mentioned differently.
- No temporal model — entities exist or they don't. No validity tracking.
- No coding-specific entity types.
- Good validation of the approach: LLM-based extraction into a knowledge graph works and is the industry direction.

---

### MemGPT / Letta

**The hierarchical memory tier model we adopted comes from here.**

#### Three-tier architecture

| Tier            | Analogy        | What it stores                                                                            | Access pattern      |
| --------------- | -------------- | ----------------------------------------------------------------------------------------- | ------------------- |
| Core Memory     | RAM            | Essential facts, agent persona, user info. Always in context. Self-editable by the agent. | Always loaded       |
| Archival Memory | Disk           | Long-term storage. Vector DB backed (Chroma, pgvector, LanceDB). Semantic search.         | Retrieved on demand |
| Recall Memory   | Search history | Searchable chat history beyond context window.                                            | Retrieved on demand |

#### Key insight adopted

The LLM acts as an "OS" that manages its own memory via tool calls. It decides what to move between tiers. This self-management principle informs our design — the LLM uses `memory_search` and `memory_get` to retrieve from archival, while core-tier entities are automatically loaded.

#### What MemGPT doesn't do

- No graph structure — archival is a flat vector store.
- No relationships between memories.
- No temporal validity.
- No coding-specific types.

---

## Existing OpenCode memory plugins

We surveyed 5 existing plugins. None were suitable as a starting point.

| Plugin                            | Stars | Approach                                             | Why not suitable                                   |
| --------------------------------- | ----- | ---------------------------------------------------- | -------------------------------------------------- |
| **opencode-supermemory**          | 656   | Cloud-only (Supermemory API)                         | No local mode, no graph, vendor lock-in            |
| **opencode-mem**                  | —     | Local SQLite vector DB, 12+ embedding models, web UI | No graph, no remote mode, no relationships         |
| **opencode-agent-memory**         | —     | Letta/MemGPT-inspired self-editable blocks           | No graph, no remote mode, blocks not relationships |
| **opencode-plugin-simple-memory** | 40    | Logfmt flat files                                    | Too basic for our needs                            |
| **opencode-working-memory**       | —     | LRU cache + SQLite, auto-decay                       | No graph, no remote mode, ephemeral by design      |

**None have both local + centralized modes. None use knowledge graphs. None have structured anti-pattern tracking.**

---

## Industry survey — how every major tool handles memory

| Tool                 | Memory approach                                   | Storage                                                            | Lessons / anti-patterns?                                                                               |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Claude Code**      | CLAUDE.md files + auto MEMORY.md                  | Flat markdown, always loaded                                       | No. Rules can say "don't do X" but unstructured                                                        |
| **Cursor**           | Memories (beta) + .cursor/rules/ + codebase index | Rules files + internal DB                                          | No. Memories are observations, not cautionary                                                          |
| **Windsurf**         | Auto-generated memories + .windsurf/rules/        | Internal + rules files                                             | No                                                                                                     |
| **Cline / Roo Code** | Memory bank (markdown files in memory-bank/)      | projectBrief.md, productContext.md, systemPatterns.md, progress.md | decisionLog.md can capture "why not X" but no formal tracking                                          |
| **GitHub Copilot**   | Persistent memory + copilot-instructions.md       | Cloud-hosted, 28-day TTL with validation                           | Auto-expiration handles staleness but no explicit "avoid this"                                         |
| **Aider**            | Repo map + git commits + scratchpad               | Git + config files                                                 | None                                                                                                   |
| **Continue.dev**     | Memory Bank (proposed) + .continuerules/          | Markdown files                                                     | "Project Intelligence" mentioned but not implemented                                                   |
| **Zed**              | MCP servers (external)                            | Depends on chosen MCP server                                       | No built-in mechanism                                                                                  |
| **ConPort**          | SQLite knowledge graph                            | SQLite per workspace                                               | Can store in custom_data but no dedicated category                                                     |
| **OpenClaw**         | Markdown files + SQLite index + vectors           | .md source of truth                                                | None. Memories are flat text chunks                                                                    |
| **Graphiti / Zep**   | Temporal knowledge graph                          | Neo4j / FalkorDB                                                   | Partially — edges have temporal validity, superseded facts preserved. But no explicit "lesson" concept |
| **MemGPT / Letta**   | Core + archival + recall tiers                    | In-memory + vector DB                                              | Core memory can include "avoid X" via self-editing, but not structured                                 |
| **Mem0**             | Graph memory (entities + relationships)           | Neo4j / Kuzu                                                       | No                                                                                                     |

### Key findings from the survey

1. **Nobody does lessons learned well.** Not a single tool has a first-class concept of "lesson learned" or "anti-pattern." The closest is Graphiti's temporal edges (old facts are preserved when superseded) and Cline's decisionLog.md. This is a genuine gap we're filling.

2. **The industry is converging on two tiers:** static rules (human-curated, always loaded) and dynamic memories (AI-extracted, selectively loaded). Most tools conflate these. Our three-tier model (core / working / archival) is more nuanced.

3. **Copilot's 28-day auto-expiry with validation is smart.** Memories auto-delete after 28 days, but if validated against current code, they persist. We adopted this principle as the `validated_at` field and search score penalties for stale entities.

4. **Nobody does proactive warning surfacing.** Every tool is reactive — you ask, it retrieves. None proactively say "warning: last time we tried that, it failed." Our trigger embeddings on Lesson entities enable this.

5. **ConPort's strategy files are underappreciated.** Shipping prompt templates that teach the LLM how to use the memory system is a real insight. The memory is only as good as the instructions that drive it.

6. **Markdown-first is popular but limiting.** Claude Code, Cline, Continue.dev, OpenClaw all use markdown as the primary storage. It's human-readable and git-friendly, but can't represent relationships, doesn't support semantic search natively, and doesn't scale to complex knowledge graphs.

---

## Technology decision: FalkorDB

### Why not Kuzu (original plan)

Kuzu was our first choice for local mode — an embedded graph DB that speaks Cypher, like "SQLite for graphs." It was perfect on paper.

**Apple acquired Kùzu Inc. in October 2025.** The GitHub repo was archived, the website taken down. Classic Apple acqui-hire. Community forks exist (Bighorn by Kineviz, LadybugDB) but are risky to depend on for a production plugin.

### Alternatives evaluated

| Option                          | Type               | Query language   | TS/JS support       | Status                   | Why not chosen                                   |
| ------------------------------- | ------------------ | ---------------- | ------------------- | ------------------------ | ------------------------------------------------ |
| **Kuzu**                        | Embedded           | Cypher           | Node.js bindings    | Dead (Apple acquisition) | Archived, no future                              |
| **Bighorn / LadybugDB**         | Kuzu forks         | Cypher           | Inherited from Kuzu | Early community forks    | Risky dependency                                 |
| **sqlite-graph**                | SQLite extension   | Cypher           | Via better-sqlite3  | Alpha (v0.1.0, Nov 2025) | Too early, not production-ready                  |
| **graphqlite**                  | SQLite extension   | Cypher           | Via better-sqlite3  | Active                   | Early stage, limited ecosystem                   |
| **Neo4j** (Docker for local)    | Server             | Cypher           | Official JS driver  | Production               | Too heavy for local embedded use                 |
| **Memgraph** (Docker for local) | Server (in-memory) | Cypher           | Official JS driver  | Production               | Requires Docker, not truly embedded              |
| **SQLite + recursive CTEs**     | Native SQLite      | SQL (not Cypher) | Via better-sqlite3  | Battle-tested            | No Cypher, manual graph logic, what ConPort does |
| **FalkorDB Lite**               | Embedded (npm)     | Cypher           | Native TS/JS        | Active, funded company   | **Chosen**                                       |
| **FalkorDB server**             | Server             | Cypher           | Native TS/JS        | Active, funded company   | **Chosen (remote mode)**                         |

### Why FalkorDB wins

1. **Same engine for both modes** — FalkorDB Lite (embedded npm package) for local, FalkorDB server for remote. Same Cypher queries, same client library (`falkordb` npm), same graph schema. Zero impedance mismatch.
2. **Native TypeScript** — The `falkordb` and `falkordblite` packages are built with TypeScript. No FFI bindings, no native compilation, no Python subprocess.
3. **Cypher query language** — Well-documented, readable, the de facto standard for property graphs. LLMs already know it.
4. **Backed by a funded company** — FalkorDB Inc. is actively developing the product. Not a community fork, not a hobby project.
5. **Zero-config local mode** — `npm install falkordblite`, connect, done. Starts an embedded Redis server with FalkorDB module, persists to disk, shuts down with the app.
6. **LangChain integration** — `@falkordb/langchain-ts` package exists for LLM-graph integration patterns.
7. **Remote mode is just a config change** — `FalkorDB.connect({ socket: { host: "nas.local", port: 6379 } })`. No data model changes, no query rewrites. Start local, move to centralized later.

### Connection examples

```ts
// Local mode
import { FalkorDB } from "falkordblite";
const db = await FalkorDB.connect({
  persistenceFilePath: "~/.opencode/memory/local.rdb",
});

// Remote mode
import { FalkorDB } from "falkordb";
const db = await FalkorDB.connect({
  socket: { host: "nas.local", port: 6379 },
  password: "...",
});

// Same Cypher queries work on both
const graph = db.selectGraph("memory");
await graph.query(`
  MATCH (l:Entity:Lesson)-[:WARNS_AGAINST]->(t:Entity:Tool)
  WHERE l.attributes.severity = 'blocker'
  RETURN l.name, t.name
`);
```

---

## What we're doing that nobody else does

1. **Structured anti-pattern tracking** — First-class `Lesson` entities with severity, category, trigger context, and resolution. No other coding assistant memory system has this.

2. **Proactive warning surfacing** — Trigger embeddings on Lesson entities are matched against current conversation intent. The plugin warns you before you go down a known bad path, without being asked.

3. **Temporal fact management** — Edges have `valid_at` / `invalid_at` / `expired_at`. Decisions get superseded, and the graph captures both the old and new state plus why the change happened. Only Graphiti does this, and they don't have the coding-specific ontology.

4. **Memory validation** — Confidence levels (`confirmed` / `suspected` / `speculative`) and `validated_at` timestamps prevent stale memories from misleading the assistant. Inspired by Copilot's 28-day validation, but more granular.

5. **Scope-aware memory tiers** — Global preferences vs. project decisions vs. session tasks, loaded with different priority into different context tiers. Inspired by MemGPT's hierarchical model, but adapted for coding.

6. **Unified graph backend** — FalkorDB for both local and remote. Same queries, same client, same schema. No other plugin supports both modes with a single backend.
