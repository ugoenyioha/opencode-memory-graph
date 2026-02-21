# CXDB Phases 2-7

Delivery note for journal integration, replay/rebuild, session mapping,
CI verification, API/visualization compatibility, and end-to-end validation.

## Phase 2: Journal-First Write Path

What changed:

- Added truth-log journal helpers in `src/cxdb/journal.ts`.
- Updated `merge()` in `src/extraction/index.ts` to append
  `memory.extraction.batch` before graph projection when truthlog is enabled.
- Updated queue payload and draining in `src/plugin/queue.ts` to carry `context_id`
  and pass truthlog context into extraction merge.
- Updated compaction flow in `src/plugin/compaction.ts` to append
  `memory.compaction.snapshot` entries.
- Updated plugin runtime boot in `src/index.ts` to initialize truthlog/session store
  and route chat + compaction writes through context-aware truthlog paths.

Verification:

```bash
bun test src/extraction/journal.test.ts src/plugin/compaction.test.ts
```

- 5 pass
- 0 fail

## Phase 3: Replay, Rebuild, Integrity

What changed:

- Added replay pipeline in `src/cxdb/replay.ts`.
- Added integrity counters in `src/cxdb/integrity.ts`.
- Added operational scripts:
  - `scripts/rebuild-graph.ts`
  - `scripts/integrity-check.ts`
- Added package scripts:
  - `bun run rebuild:graph`
  - `bun run check:integrity`

Verification:

```bash
bun test src/cxdb/replay.test.ts src/cxdb/integrity.test.ts
```

- 2 pass
- 0 fail

## Phase 4: Session to Context Mapping

What changed:

- Added persistent session mapping store in `src/cxdb/session.ts`.
- Added session mapping tests in `src/cxdb/session.test.ts`.
- Integrated `SessionStore.ensure()` in plugin message + compaction paths.

Verification:

```bash
bun test src/cxdb/session.test.ts
```

- 2 pass
- 0 fail

## Phase 5: CI and Conformance Gate

What changed:

- Updated CI to explicitly run conformance suite:
  - `.github/workflows/ci.yml` now runs `bun test src/cxdb/conformance.test.ts`
    before full suite.

Verification:

```bash
bun test src/cxdb/conformance.test.ts
```

- 9 pass
- 0 fail

## Phase 6: CXDB-Compatible API + Local Visualization

What changed:

- Added Bun HTTP server in `src/cxdb/server.ts` with compatible endpoints:
  - `GET /health`
  - `GET /v1/contexts`
  - `GET /v1/contexts/:id/turns`
  - `POST /v1/contexts/create`
  - `POST /v1/contexts/fork`
  - `POST /v1/contexts/:id/append`
  - `PUT /v1/registry/bundles/:id`
  - `GET /v1/stats`
- Added lightweight adapted viewer at `/` (context list + turn inspector).
- Added run script: `bun run serve:cxdb`.

Verification:

```bash
bun test src/cxdb/server.test.ts
```

- 1 pass
- 0 fail

## Phase 7: End-to-End Validation

What changed:

- Added e2e test in `src/cxdb/e2e.test.ts` validating:
  - extraction write -> truthlog journal
  - graph rebuild by replay
  - cxdb-compatible turns API visibility

Verification:

```bash
bun test src/cxdb/e2e.test.ts
```

- 1 pass
- 0 fail

## Final regression gate

```bash
bun test
```

- 99 pass
- 0 fail
- 326 expect() calls
- Ran 99 tests across 24 files.

## Remaining known non-blocking notes

- Descriptor immutability is byte-equality based (canonical descriptor bytes required).
- CAS hashing is byte-level over msgpack payloads, not semantic JSON equivalence.
- Distinct-key high-contention append behavior remains optimistic; correctness holds,
  explicit retry policy can be added later for throughput fairness.
