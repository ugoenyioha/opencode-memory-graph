# Feature Consolidation Audit

Purpose: validate that our implemented feature set is competitive against the memory systems we researched, identify what we still miss, and make explicit adopt/defer/reject decisions.

## Scope and method

- Baseline products reviewed: OpenClaw, ConPort, Graphiti/Zep, Mem0, Letta/MemGPT.
- Current implementation validated from code and tests (not docs-only claims).
- Focus: coding-assistant memory value, not generic enterprise platform breadth.

Code-backed evidence used in this audit:

- Runtime hooks/tools: `src/index.ts`
- Retrieval/ranking: `src/search/hybrid.ts`, `src/search/hybrid.test.ts`
- Write pipeline/safety: `src/extraction/index.ts`, `src/extraction/index.test.ts`, `src/extraction/schema.ts`
- Proactive surfacing: `src/plugin/proactive.ts`, `src/plugin/proactive.test.ts`
- Tier + compaction behavior: `src/plugin/tiers.ts`, `src/plugin/tiers.test.ts`, `src/plugin/compaction.ts`, `src/plugin/compaction.test.ts`
- Queue + usage hooks: `src/plugin/queue.ts`, `src/plugin/queue.test.ts`, `src/plugin/usage.ts`, `src/plugin/usage.test.ts`
- Remote validation path: `src/graph/remote.test.ts`, `docs/e2e-opencode-orbstack.md`, `.github/workflows/ci.yml`

## Capability coverage matrix

Legend: `Implemented`, `Partial`, `Missing`, `Out of Scope`

| Capability                                                        | Ours        | OpenClaw    | Graphiti/Zep | Mem0        | Letta/MemGPT |
| ----------------------------------------------------------------- | ----------- | ----------- | ------------ | ----------- | ------------ |
| Local-first memory mode                                           | Implemented | Implemented | Partial      | Partial     | Partial      |
| Remote/centralized mode                                           | Implemented | Missing     | Implemented  | Implemented | Implemented  |
| Deterministic IDs + idempotent mutations                          | Implemented | Partial     | Partial      | Partial     | Partial      |
| Project/global scope isolation                                    | Implemented | Partial     | Partial      | Partial     | Partial      |
| Structured entities + relationships                               | Implemented | Missing     | Implemented  | Implemented | Partial      |
| Temporal supersede/expiry lifecycle                               | Implemented | Missing     | Implemented  | Partial     | Partial      |
| Protected lesson quarantine guards                                | Implemented | Missing     | Missing      | Missing     | Missing      |
| Proactive warning surfacing                                       | Implemented | Missing     | Missing      | Missing     | Partial      |
| Hybrid ranking (vector + traversal + decay + episodes + community + MMR + cross-encoder) | Implemented | Partial     | Implemented  | Partial     | Partial      |
| Tiered context loading (core/working)                             | Implemented | Partial     | Partial      | Missing     | Implemented  |
| Pre-compaction persistence hook                                   | Implemented | Implemented | Missing      | Missing     | Partial      |
| CI-gated remote validation                                        | Implemented | Missing     | Partial      | Partial     | Partial      |

## What we missed (or only partially consolidated)

All gaps identified in the original audit have now been implemented:

1. **Background extraction queue + worker controls** (`Implemented`)
   - Queue-backed extraction, standalone worker mode, and retry backoff are implemented.
   - Queue health reporting (stats endpoint, dashboard card) and dead-letter inspection/repair (retry, purge, table UI) are now complete.
2. **Episode/community retrieval dimensions** (`Implemented`)
   - Graphiti-style multi-dimensional retrieval is now present: Episode nodes created per-session during extraction with MENTIONS edges and NEXT chains; community detection via Label Propagation algorithm; both feed into the hybrid search pipeline as weighted dimensions (episode coherence: 0.15, community boost: 0.10).
3. **Cross-encoder reranking tier** (`Implemented`)
   - Provider-abstracted cross-encoder reranking (off/cohere/voyage modes) wired between score-sort and MMR in the search pipeline.
4. **Operator observability surfaces** (`Implemented`)
   - Rich observability dashboard with queue health card, dead-letter table, graph stats card, embedding coverage bar, and unified metrics endpoint.

Implemented during this consolidation pass:

- Queue-backed extraction path with hook-driven draining and idempotent replay safety.
- `tool.execute.after` usage tracking (`ToolUsage`) and retrieval weighting input.
- Optional standalone queue worker command (`bun run worker:queue`).
- Queue health reporting (`GET /v1/queue/stats`) and dead-letter management endpoints.
- Cross-encoder reranking module (`src/search/rerank.ts`) with provider abstraction.
- Rich observability dashboard (queue health, dead letters, graph stats, embedding coverage, metrics endpoint).
- Episode creation during extraction with MENTIONS/NEXT graph structures (`src/extraction/index.ts`).
- Community detection via Label Propagation (`src/graph/community.ts`) with re-clustering during compaction.
- Five-signal hybrid search pipeline: vector (0.40), graph traversal (0.25), episode coherence (0.15), community boost (0.10), temporal decay (0.10).

## Consolidation decisions

### Adopt now (high product impact)

Implemented:

1. **Tool usage learning loop**
   - `tool.execute.after` records per-tool usage and search consumes this signal for ranking boosts.
2. **Queue-backed extraction path**
   - Messages enqueue first, then drain in hook-driven micro-batches with idempotent keys.
   - Standalone worker mode is available for independent draining.

### Previously deferred, now implemented

1. **Episode/community retrieval dimensions** — Implemented
   - Episode nodes per-session, MENTIONS edges, NEXT chain, community detection via Label Propagation, both wired into hybrid search.
2. **Cross-encoder reranking** — Implemented
   - Provider-abstracted reranking (off/cohere/voyage) with configurable top_k.
3. **Rich observability dashboard** — Implemented
   - Queue health, dead letters, graph stats, embedding coverage, unified metrics endpoint.

### Reject (intentionally not adopting)

1. **Large multi-tool surface area (ConPort-style 20+ tools)**
   - Reason: worsens agent prompt burden and tool-selection quality.
   - Keep two-tool retrieval pattern (`memory_search`, `memory_get`).
2. **Markdown as primary source of truth**
   - Reason: harms relationship/temporal correctness at scale.
   - Keep graph as source of truth; optional export/import remains acceptable.

## Consolidated feature verdict

- We did not miss core differentiators.
- We successfully consolidated the highest-value ideas across products into a coherent coding-assistant memory design.
- All previously identified gaps have been addressed in this consolidation pass.
- The hybrid search pipeline now has five weighted signals plus cross-encoder reranking and MMR diversity.

## Next checkpoint criteria

All consolidation items are complete. Next impact checkpoint:

1. Monitor episode/community impact on retrieval quality in real coding sessions.
2. Evaluate cross-encoder reranking latency impact when enabled with external providers.
3. Consider adding community visualization to the CxDB frontend explorer.
