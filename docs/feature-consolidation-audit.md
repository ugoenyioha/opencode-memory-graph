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
| Hybrid ranking (vector + traversal + decay + MMR + FTS expansion) | Implemented | Partial     | Implemented  | Partial     | Partial      |
| Tiered context loading (core/working)                             | Implemented | Partial     | Partial      | Missing     | Implemented  |
| Pre-compaction persistence hook                                   | Implemented | Implemented | Missing      | Missing     | Partial      |
| CI-gated remote validation                                        | Implemented | Missing     | Partial      | Partial     | Partial      |

## What we missed (or only partially consolidated)

These are the real gaps after comparing code and research outcomes.

1. **Background extraction queue + worker controls** (`Partial`)
   - Queue-backed extraction, standalone worker mode, and retry backoff are implemented.
   - Operator-facing dead-letter/health reporting remains minimal.
2. **Episode/community retrieval dimensions** (`Missing`)
   - Graphiti-style multi-dimensional retrieval (episodes/community clustering) is not present.
3. **Cross-encoder reranking tier** (`Missing`)
   - We have MMR and weighted signals, but not final-stage cross-encoder rerank.
4. **Operator observability surfaces** (`Partial`)
   - Strong tests and CI path exist, but no dedicated memory health/reporting dashboard output.

Implemented during this consolidation pass:

- Queue-backed extraction path with hook-driven draining and idempotent replay safety.
- `tool.execute.after` usage tracking (`ToolUsage`) and retrieval weighting input.
- Optional standalone queue worker command (`bun run worker:queue`).

## Consolidation decisions

### Adopt now (high product impact)

Implemented:

1. **Tool usage learning loop**
   - `tool.execute.after` records per-tool usage and search consumes this signal for ranking boosts.
2. **Queue-backed extraction path**
   - Messages enqueue first, then drain in hook-driven micro-batches with idempotent keys.
   - Standalone worker mode is available for independent draining.

### Defer (valuable, but not required for current coding workflow quality)

1. **Episode/community retrieval dimensions**
   - Why defer: larger model/graph complexity; current node+edge traversal is already strong for coding use.
2. **Cross-encoder reranking**
   - Why defer: higher cost and operational complexity; current ranking passes functional goals.
3. **Rich observability dashboard**
   - Why defer: can be added after usage-learning loop to surface meaningful metrics.

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
- Remaining gaps are mostly second-order quality/operations features, not fundamental capability blockers.

## Next checkpoint criteria

Consolidation is complete for this phase. Next impact checkpoint:

1. Add operator-visible queue/usage health reporting.
2. Add dead-letter inspection/repair command for terminal queue failures.
