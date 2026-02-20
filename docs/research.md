# Research

Comparative analysis of memory systems across coding assistants, and the technology decisions that shaped this plugin's design.

---

## Systems analyzed in depth

### OpenClaw memory system

OpenClaw (formerly Claw) has the most sophisticated open-source memory implementation we found. Full source at `/tmp/openclaw/src/memory/`. Key files: `manager.ts`, `hybrid.ts`, `mmr.ts`, `temporal-decay.ts`, `internal.ts`, `query-expansion.ts`, `memory-schema.ts`.

#### Architecture

- **Markdown-first storage** — Source of truth is plain `.md` files in the workspace. The SQLite index is derived and fully rebuildable from these files. This means memory is human-readable, git-trackable, and survives database corruption.
- **Per-agent isolation** — Each agent gets its own SQLite database. No cross-contamination between different agent personas.
- **Chunking** — Files are split into ~400-token chunks with ~80 token overlap (`internal.ts:chunkMarkdown()`). Each chunk tracks its source file and line numbers for citations.

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

#### Deep source analysis

From reading the full source code of OpenClaw's memory system, several implementation details are worth documenting.

**Hybrid search pipeline (`hybrid.ts`)** — The merge is straightforward: results from vector search and BM25 keyword search are combined by ID (if a result appears in both, scores are summed as `vectorWeight * vectorScore + textWeight * textScore`). Default weights are 70% vector / 30% BM25. After merging, temporal decay is applied, then MMR. The pipeline has no graph traversal step since there's no graph.

**Temporal decay (`temporal-decay.ts`)** — The formula `score *= exp(-lambda * age_days)` uses `lambda = ln(2) / halfLifeDays` with a default half-life of 30 days. "Evergreen" files are exempt from decay entirely — these are `MEMORY.md` and any undated files in the `memory/` directory. Dated files matching `memory/YYYY-MM-DD.md` get their age computed from the filename date. All other files fall back to file `mtime`. This evergreen exemption is the direct inspiration for our global-scope exemption on Lesson and Preference entities.

**MMR diversity re-ranking (`mmr.ts`)** — Uses **Jaccard similarity on tokenized text** rather than embedding cosine similarity. The formula is `λ * normalized_relevance - (1-λ) * max_jaccard_to_selected` with default λ=0.7. Scores are normalized to [0,1] before MMR is applied. Items are pre-tokenized to avoid redundant string splitting. The Jaccard approach is cheaper than computing cosine on embeddings but less precise — we should use embedding cosine since we already have the vectors.

**Pre-compaction memory flush (`memory-flush.ts`)** — Triggered when `totalTokens >= contextWindow - reserveTokens - softThreshold` (default soft threshold is 4000 tokens). The flush injects a silent agentic turn with the prompt: "Pre-compaction memory flush. Store durable memories now (use memory/YYYY-MM-DD.md)." It uses a `SILENT_REPLY_TOKEN` for no-op responses when there's nothing to save. The system tracks `memoryFlushCompactionCount` to avoid double-flushing on the same compaction event — a detail we need to replicate.

**Compaction (`compaction.ts`)** — Messages are chunked by token budget, each chunk is summarized, then summaries are merged into a final summary. The chunk ratio is adaptive based on average message size. There's a fallback path for oversized individual messages that exceed the chunk budget. This is OpenCode's responsibility, not ours — we just hook `experimental.session.compacting` to extract before it happens.

**Query expansion (`query-expansion.ts`)** — For FTS-only mode. Removes English and Chinese stop words, extracts keywords, builds `original OR keyword1 OR keyword2` queries. There's an optional LLM-based expansion path that rewrites the query for better recall. We'll adopt the keyword extraction path for our FTS fallback but skip LLM-based expansion (too expensive for a fallback path).

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

#### Deep source analysis

From reading Graphiti's core Python source (`graphiti_core/`), the extraction and search pipelines are significantly more sophisticated than what we initially assumed.

**Multi-step extraction pipeline** — Graphiti does NOT extract entities and relationships in a single LLM call. It runs a sequence of separate LLM calls:

1. **Extract entities** (`prompts/extract_nodes.py`) — Extracts speaker + entities from conversation. Separates PREVIOUS MESSAGES (provided as read-only context) from CURRENT MESSAGE (the actual extraction target). Supports custom extraction instructions. Explicitly excludes relationships, actions, and temporal info from this step.
2. **Classify entity types** — Maps each extracted entity to a type from the ontology using `entity_type_id` fields.
3. **Extract edges/facts** (`prompts/extract_edges.py`) — Extracts fact triples with `source_entity_name`, `target_entity_name`, `relation_type` (SCREAMING_SNAKE_CASE), `fact` (natural language), `valid_at`, `invalid_at`. Uses a `REFERENCE_TIME` for resolving relative temporal expressions like "yesterday" or "last week." Relation types come from the ontology when possible, otherwise derived from the predicate.
4. **Extract attributes** — Pulls label-specific properties for each entity.
5. **Generate summaries** (`prompts/extract_nodes.py:extract_summaries_batch`) — Batch-summarizes multiple entities in one call for efficiency.
6. **Deduplicate** (`prompts/dedupe_nodes.py`) — LLM-based dedup, not just embedding similarity. Sends the new entity plus a list of existing entities to the LLM and asks "is this a duplicate?" Returns `duplicate_name` (matching existing entity name) or empty string. Has both single-entity and batch dedup modes. Key rule: "Entities should only be considered duplicates if they refer to the _same real-world object or concept_."

This is much more granular than our single-prompt approach. The tradeoff is obvious: more LLM calls = better accuracy but higher latency and cost. We stick with a single extraction prompt for v1 (coding conversations are more structured than general conversation, reducing ambiguity), but should revisit multi-step extraction if quality is insufficient.

**4-dimensional parallel search (`search/search.py`)** — Graphiti searches four dimensions simultaneously: edges, nodes, episodes, and communities. Each dimension supports multiple search methods (BM25, cosine_similarity, BFS) and multiple rerankers:

| Reranker                         | What it does                                                        |
| -------------------------------- | ------------------------------------------------------------------- |
| **RRF** (Reciprocal Rank Fusion) | Merges results from different search methods by reciprocal rank     |
| **MMR**                          | Uses actual embedding cosine similarity (not Jaccard like OpenClaw) |
| **Cross-encoder**                | Runs a cross-encoder model for highest quality reranking            |
| **Node distance**                | Boosts results closer in graph distance to the query entities       |
| **Episode mentions**             | Boosts entities mentioned in recent episodes                        |

Results from all four dimensions are merged using RRF. This is the most comprehensive search pipeline of any system we analyzed. Our hybrid search is simpler (vector + graph traversal + temporal decay + MMR) but our graph traversal dimension partly covers what their node_distance reranker and episode_mentions do.

**Batch summary generation** — Graphiti generates entity summaries from surrounding edges, not from the original conversation text. This means summaries stay current as new edges are added. We should consider periodic re-summarization as an optimization for v2.

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

**Repo:** [mem0ai/mem0](https://github.com/mem0ai/mem0) | Python | Apache-2.0

Mem0 has both a flat vector memory mode and a graph memory mode. The graph mode extracts entities and relationships from conversations and stores them in Neo4j (primary), Memgraph, or Kuzu. Full source at `/tmp/mem0/mem0/memory/graph_memory.py` and `/tmp/mem0/mem0/graphs/`.

#### Architecture

- **Neo4j via LangChain** — Uses `langchain_neo4j.Neo4jGraph` as the graph driver. Also supports Memgraph and Kuzu through separate memory classes (`memgraph_memory.py`, `kuzu_memory.py`).
- **Two-step extraction** — Step 1: extract entities and their types via LLM tool call. Step 2: extract relationships between those entities via a second LLM call. Simpler than Graphiti's 6-step pipeline but more structured than a single prompt.
- **Embedding-based dedup** — Nodes are matched by embedding cosine similarity (threshold 0.7 by default), not by name. When adding a new entity, Mem0 searches for existing nodes with similar embeddings and merges into the closest match if above threshold.
- **BM25 reranking on search** — Search results (source/relationship/destination triples) are reranked using BM25Okapi, returning top 5.
- **Mentions counter** — Nodes and edges track a `mentions` count that increments on each MERGE. This is a simple alternative to our confidence model.

#### Deep source analysis

**Fact extraction prompts (`configs/prompts.py`)** — Mem0 has three extraction modes:

1. **Legacy `FACT_RETRIEVAL_PROMPT`** — "Personal Information Organizer" that extracts facts as flat strings (`{"facts": ["Name is John", "Is a software engineer"]}`). Few-shot examples. Returns empty array for irrelevant input. Language-aware (records facts in user's language).
2. **`USER_MEMORY_EXTRACTION_PROMPT`** — Enhanced version that explicitly excludes assistant and system messages. Same JSON format. Includes few-shot examples showing assistant responses that should NOT be extracted from. Has a strong emphasis via repeated `[IMPORTANT]` markers.
3. **`AGENT_MEMORY_EXTRACTION_PROMPT`** — Mirror of the user prompt but for extracting facts about the assistant's personality, capabilities, and preferences. Only extracts from assistant messages.

The extraction prompts are notably simple compared to Graphiti's. No structured schema, no entity types, no relationships — just flat fact strings. The graph structure is added in a separate step.

**Memory update logic (`DEFAULT_UPDATE_MEMORY_PROMPT`)** — After extracting new facts, Mem0 sends them alongside existing memories to the LLM with a 4-operation prompt: ADD, UPDATE, DELETE, or NONE. Each operation includes detailed examples. The LLM decides what to do with each fact against the existing memory store. This is a clever approach — the LLM acts as a merge engine, handling semantic dedup, conflict resolution, and supersession in one call.

**Graph entity extraction (`graph_memory.py:_retrieve_nodes_from_data`)** — Uses LLM function calling with an `extract_entities` tool that returns `{entity, entity_type}` pairs. Self-references ("I", "me", "my") are mapped to the user_id. Entity names are lowercased and spaces replaced with underscores.

**Relationship extraction (`graph_memory.py:_establish_nodes_relations_from_data`)** — Second LLM call with an `establish_relationships` tool. System prompt (`EXTRACT_RELATIONS_PROMPT` in `graphs/utils.py`) instructs the LLM to: (1) only extract explicitly stated info, (2) establish relationships among provided entities, (3) map self-references to user_id, (4) use consistent/timeless relationship types (prefer "professor" over "became_professor"). Supports a `custom_prompt` config option for domain-specific extraction rules.

**Delete detection (`graph_memory.py:_get_delete_entities_from_search_output`)** — A third LLM call determines which existing relationships should be deleted given new information. The `DELETE_RELATIONS_SYSTEM_PROMPT` is careful about not deleting relationships that could coexist (e.g., "likes pizza" shouldn't be deleted when "also likes burgers" is learned). Only truly contradictory or outdated relationships get deleted.

**Node dedup via embedding similarity** — When adding entities, Mem0 embeds the entity name and searches for existing nodes with `vector.similarity.cosine >= threshold` (default 0.7). If found, the existing node is reused (its `mentions` count incremented). If not, a new node is created. This is simpler than Graphiti's LLM-based dedup but works well for entity names.

#### What Mem0 does well

- **Three LLM calls for add** (extract entities → extract relationships → detect deletions) is a good balance between single-prompt and Graphiti's 6-step pipeline.
- **Embedding-based node dedup** handles variations in naming without an extra LLM call.
- **The `mentions` counter** is a lightweight signal for entity importance. We can adopt this alongside our confidence model.
- **Delete detection as a separate step** prevents the LLM from being confused by trying to do extraction and conflict resolution simultaneously.
- **Custom prompt injection** (`CUSTOM_PROMPT` placeholder) lets users add domain-specific extraction rules without forking the system.

#### What Mem0 doesn't do

- **No temporal model** — Entities exist or don't. No `valid_at` / `invalid_at` / `expired_at`. Old facts and new facts have equal weight.
- **No fact embeddings on edges** — Only nodes have embeddings. Relationships are matched by BM25 on string triples, not semantically.
- **No memory tiers** — Everything is in one flat graph. No core/working/archival distinction.
- **No coding-specific entity types** — Designed for general-purpose personal assistant memory.
- **No proactive surfacing** — Reactive retrieval only.
- **No scope model** — User-level isolation via `user_id` filter on nodes, but no global/project/session scoping.
- **No pre-compaction hooks** — Mem0 is a library, not an IDE plugin, so it has no concept of context window management.

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

### Known limitations

- **Maps cannot be stored as property values** — FalkorDB does not support `MAP` types as node/edge properties. All `attributes` fields must be stored as JSON strings and parsed in the application layer. The `json.fromJsonMap()` / `json.toJson()` UDFs are available in Cypher for inline conversions, but storing is still string-based.
- **Unique constraints require range indexes first** — `GRAPH.CONSTRAINT CREATE` requires an existing range index on the property. Constraints are created asynchronously via the Redis command interface.
- **Unique constraints don't work on array-valued properties** — Our `labels` field (a string array) cannot have a uniqueness constraint. Dedup must be application-side.

### Connection examples

```ts
// Local embedded mode (falkordblite)
import { FalkorDB } from "falkordblite";
const db = await FalkorDB.open({
  path: "~/.opencode/memory/data", // directory, not file
});

// Remote server mode (falkordb)
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

**Note:** The local mode uses `FalkorDB.open({ path })` (not `.connect()`). The `path` parameter is a **directory** where FalkorDB stores its data files, not a single file path. Persistence happens via periodic RDB snapshots, similar to Redis.

---

## Extraction approach comparison

A key design decision is how to extract structured knowledge from conversations. The three systems we analyzed deeply take very different approaches.

| Aspect                       | OpenClaw                         | Mem0                                        | Graphiti                                                          | Ours (v1)                                      |
| ---------------------------- | -------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| **Extraction target**        | Raw text chunks                  | Flat fact strings                           | Structured entities + typed edges                                 | Typed entities + typed edges                   |
| **LLM calls per extraction** | 0 (no extraction)                | 3 (entities → relationships → deletions)    | 6+ (entities → classify → edges → attributes → summaries → dedup) | 1 (single combined prompt)                     |
| **Entity types**             | None                             | LLM-inferred, unstructured                  | Ontology-defined, Pydantic models                                 | 10 fixed labels with extensible attributes     |
| **Dedup strategy**           | Hash-based (file content)        | Embedding cosine similarity (0.7 threshold) | LLM-based ("is this the same real-world thing?")                  | Embedding similarity + name/type matching      |
| **Temporal parsing**         | File dates only                  | None                                        | LLM extracts `valid_at`/`invalid_at` from text                    | LLM extracts `valid_at`/`invalid_at` from text |
| **Conflict resolution**      | Last-write-wins (file overwrite) | LLM decides ADD/UPDATE/DELETE/NONE          | LLM-based edge invalidation                                       | LLM `update` action with field-level merge     |
| **Custom domain rules**      | None                             | `custom_prompt` injection                   | Custom extraction instructions                                    | Ontology-aware prompting                       |
| **Latency**                  | ~0ms (no extraction)             | ~3-5s (3 LLM calls)                         | ~10-20s (6+ LLM calls)                                            | ~1-2s (1 LLM call)                             |

**Our v1 choice — single prompt** — is deliberate. Coding conversations are more structured than general chat (users state decisions explicitly, errors have stack traces, preferences are direct). This reduces ambiguity enough that a single well-crafted prompt can handle extraction, typing, and relationship creation together. If quality proves insufficient after real-world testing, we can split into Mem0's 3-step pattern without changing the graph schema.

**The delete/conflict detection problem** is interesting. Mem0's approach of sending existing + new facts to the LLM and asking "what changed?" is elegant. Graphiti invalidates edges via temporal fields. We should adopt Mem0's pattern for our `update` action — send existing entities alongside the conversation so the LLM can emit updates rather than duplicate creates.

---

## What we're doing that nobody else does

1. **Structured anti-pattern tracking** — First-class `Lesson` entities with severity, category, trigger context, and resolution. No other coding assistant memory system has this.

2. **Proactive warning surfacing** — Trigger embeddings on Lesson entities are matched against current conversation intent. The plugin warns you before you go down a known bad path, without being asked.

3. **Temporal fact management** — Edges have `valid_at` / `invalid_at` / `expired_at`. Decisions get superseded, and the graph captures both the old and new state plus why the change happened. Only Graphiti does this, and they don't have the coding-specific ontology.

4. **Memory validation** — Confidence levels (`confirmed` / `suspected` / `speculative`) and `validated_at` timestamps prevent stale memories from misleading the assistant. Inspired by Copilot's 28-day validation, but more granular.

5. **Scope-aware memory tiers** — Global preferences vs. project decisions vs. session tasks, loaded with different priority into different context tiers. Inspired by MemGPT's hierarchical model, but adapted for coding.

6. **Unified graph backend** — FalkorDB for both local and remote. Same queries, same client, same schema. No other plugin supports both modes with a single backend.
