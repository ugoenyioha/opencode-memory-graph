# Plan Conformance

Audit of implementation versus the original research-driven plan, including explicit scope changes.

## Source of truth for this audit

This conformance report is based on:

- Original architecture/research docs (`docs/design.md`, `docs/research.md`)
- Phase/deferred policy from workflow templates (`.opencode/skill/agentic-team-delivery/SKILL.md`)
- Actual implementation, tests, and commit history
- Cross-product consolidation review (`docs/feature-consolidation-audit.md`)

## Important caveat

There is no single checked-in file that enumerates every historical `p0` to `p8` task verbatim.
This document is the canonical reconstruction of that phase map from design intent and delivered code.

## Phase status (`p0` to `p8`)

| Phase | Intent                                                               | Status                    | Evidence                                                                                                                                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p0`  | Research and architecture baseline from existing memory systems      | Complete                  | `docs/research.md`, `docs/design.md`, commit `62d11b1`, commit `27c52a2`                                                                                                                                                                                                                        |
| `p1`  | Core storage and graph foundation (client, schema, IDs)              | Complete                  | `src/graph/client.ts`, `src/graph/schema.ts`, `src/graph/ids.ts`, commit `b5f5b61`                                                                                                                                                                                                              |
| `p2`  | Write path hardening (idempotency, mutation journal, scope controls) | Complete                  | `src/graph/mutation.ts`, `src/graph/commit.ts`, `src/extraction/index.ts`, tests in `src/extraction/index.test.ts`, commit `b5f5b61`                                                                                                                                                            |
| `p3`  | Retrieval surface (`memory_search`, `memory_get`) and ranking MVP    | Complete (current scope)  | `src/index.ts`, `src/search/hybrid.ts`, tests in `src/search/hybrid.test.ts` covering traversal/query expansion/MMR                                                                                                                                                                             |
| `p4`  | Plugin lifecycle integration and context hooks                       | Complete (current scope)  | Active hooks in `src/index.ts` (`experimental.chat.system.transform`, `chat.message`, `experimental.session.compacting`, `tool.execute.after`) with queue-backed draining and usage recording; full target hook model in `docs/design.md` remains intentionally broader than MVP/runtime scope. |
| `p5`  | Security/reliability hardening and tests                             | Complete (MVP scope)      | Redaction/neutralization in `src/security/redact.ts`; quarantine and trust gate in `src/extraction/index.ts`; tests across `src/**/*.test.ts`; commits `b5f5b61`, `577d69e`                                                                                                                     |
| `p6`  | Remote-mode runtime + operational validation path                    | Complete (current scope)  | Runtime/env wiring in `src/config.ts`; remote client socket TLS pass-through in `src/graph/client.ts`; harness in `src/graph/remote.test.ts`; ingress/TLS runbook + manifests in `docs/e2e-opencode-orbstack.md` and `docs/k8s/*`; CI-gated remote check in `.github/workflows/ci.yml`.         |
| `p7`  | Pre-context-collapse memory persistence                              | Complete (current design) | Pre-compaction snapshot pipeline in `src/plugin/compaction.ts`; hook wiring in `src/index.ts`; idempotency test in `src/plugin/compaction.test.ts`; commit `577d69e`                                                                                                                            |
| `p8`  | Documentation, migration notes, and repeatable ops/testing workflow  | Complete                  | `README.md`, `docs/usage.md`, `docs/e2e-opencode-orbstack.md`, this file; commits `637ec11`, `a4c8248`, `8e19728`                                                                                                                                                                               |

## Deferred backlog (`d1` to `d7`) status

| ID   | Deferred item (from workflow template)    | Current status  | Notes                                                                                                                                                      |
| ---- | ----------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d1` | Remote mode hardening                     | Completed       | Runtime mode, ingress TLS validation path, harness coverage, and CI-gated remote validation are now in place.                                              |
| `d2` | Proactive warnings rollout                | Completed       | Runtime wiring added in `src/index.ts` behind `MEMORY_GRAPH_PROACTIVE=1`; selection/format tests in `src/plugin/proactive.test.ts`.                        |
| `d3` | LLM delete/supersede with quarantine      | Completed       | Added `supersede` lifecycle action with protected-lesson quarantine path in `src/extraction/index.ts`; covered by `src/extraction/index.test.ts`.          |
| `d4` | Custom ontology packs                     | Completed early | Implemented earlier than planned deferment; see pack validation and registry flow in `src/ontology/*`, `src/config.ts`.                                    |
| `d5` | Hybrid ranking expansion                  | Completed       | Implemented traversal + MMR rerank + FTS keyword expansion in `src/search/hybrid.ts` with tests in `src/search/hybrid.test.ts`.                            |
| `d6` | Multi-model embedding fallback            | Completed       | Added provider fallback chain (`openai`, `voyage`) with safe degradation in `src/embedding/index.ts` and tests in `src/embedding/index.test.ts`.           |
| `d7` | Tier automation and autonomous compaction | Completed       | Working-tier load/budget are active, and compaction policy now enforces minimum transcript + cooldown invariants in `src/plugin/compaction.ts` with tests. |

## Explicit plan changes we made

1. Implemented `d4` (custom ontology packs) before finishing all deferred hardening items.
2. Shipped a pragmatic pre-compaction snapshot pipeline (`p7`) before broader autonomous tier automation (`d7`).
3. Corrected docs to match runtime constraints (notably remote TLS/non-local host validation) instead of keeping aspirational claims.

These changes were intentional to prioritize safe MVP behavior and truthful operator documentation.

## What was skipped or only partially delivered versus the original design intent

- Full hook architecture in the design table is not fully active yet.
- Optional long-duration soak remains an operational choice, not a functional correctness requirement.

## Current go-forward checkpoints

1. Keep CI remote-validation variables/secrets current and rotate test credentials/certs.
2. Add operator health signals and dead-letter handling for queue/usage runtime paths.

## CXDB Phase 1 gate update

Truth log Phase 1 (SQLite CXDB) completed and passed adversarial gate review.

- Implementation and rationale: `docs/cxdb-phase1.md`
- Code surface: `src/cxdb/interface.ts`, `src/cxdb/types.ts`, `src/cxdb/sqlite.ts`
- Validation evidence: `src/cxdb/sqlite.test.ts`, `src/cxdb/conformance.test.ts`
- Gate outcome: GO after required-now fixes (idempotency race safety, atomic watermark, strict append validation, safe decode behavior, registry immutability, schema-version gating).

## CXDB Phases 2-7 gate update

Truth log integration phases 2 through 7 are now complete and validated.

- Delivery summary: `docs/cxdb-phases-2-7.md`
- Journal integration: `src/cxdb/journal.ts`, `src/extraction/index.ts`, `src/plugin/queue.ts`, `src/plugin/compaction.ts`, `src/index.ts`
- Replay/rebuild/integrity: `src/cxdb/replay.ts`, `src/cxdb/integrity.ts`, `scripts/rebuild-graph.ts`, `scripts/integrity-check.ts`
- Session mapping: `src/cxdb/session.ts`
- API + visualization: `src/cxdb/server.ts`, `scripts/cxdb-server.ts`
- End-to-end validation: `src/cxdb/e2e.test.ts`

Gate outcome: GO with passing phase-targeted checks and full-suite regression pass.

## Audit update policy

When behavior or scope changes, update this file in the same change set as code/docs updates.
Do not defer conformance updates to a later PR.
