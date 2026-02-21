# CXDB Phase 1

Phase 1 delivery note for the SQLite-backed truth log (`src/cxdb/*`).

## What changed

- Added TruthLog interface/types in `src/cxdb/interface.ts`.
- Added canonical mutation type constants in `src/cxdb/types.ts`.
- Added SQLite implementation in `src/cxdb/sqlite.ts` with:
  - WAL mode and foreign-key enforcement
  - content-addressed payload blob store keyed by BLAKE3
  - msgpack payload encoding
  - deterministic context/turn ordering and head-link invariants
  - idempotency-key semantics with conflict detection
  - immutable type registry + projection support
  - schema version gating on open
- Added config wiring for truth log in `src/config.ts` and tests in `src/config.test.ts`.
- Added unit and conformance suites:
  - `src/cxdb/sqlite.test.ts`
  - `src/cxdb/conformance.test.ts`

## Why it changed

- Provide a deterministic, local, append-only truth log to support extraction and replay workflows.
- Match CXDB parity requirements: type_id/type_version, payload CAS, registry-driven projection, and idempotent append behavior.
- Close concurrency/reliability gaps identified in adversarial review: cross-connection races, monotonic watermarking, input boundaries, and decode hardening.

## Security and reliability caveats

- Type acceptance is strict: only canonical `MUTATION_TYPES` are accepted at append-time.
- `idempotency_key` re-use is only accepted for exact operation identity (`type_id`, `type_version`, `payload_hash`); mismatch is rejected with a deterministic conflict error.
- `setWatermark` is monotonic and race-safe (`MAX(watermark, incoming)` in a single SQL statement).
- Registry entries are immutable for a `(type_id, type_version)` pair; conflicting descriptor rewrites are rejected.
- Schema mismatch fails open immediately (`schema version mismatch`) to prevent operating on unknown layout.
- `project()` uses safe decode and returns `null` for malformed payload or descriptor blobs.

## Deferred and non-blocking reviewer notes

- **Byte-level descriptor equality semantics**
  - Registry immutability compares descriptor bytes, not semantic object equivalence.
  - Equivalent objects with different serialized byte representations are treated as conflicts.
- **Optimistic contention behavior for distinct idempotency keys**
  - Appends with different idempotency keys may contend under SQLite locking, but correctness is preserved by transaction boundaries and constraints.
  - Current behavior prioritizes correctness over fairness/throughput tuning.
- **`decodeSafe` nil-vs-error conflation**
  - Malformed decode and missing values both collapse to `null` at `project()` call sites.
  - This is intentional for Phase 1 simplicity; future phase can expose typed decode errors where needed.

## Migration and compatibility notes

- Mutation type policy is now strict allowlist. Any previously accepted ad hoc `type_id` values must migrate to canonical names in `src/cxdb/types.ts`.
- Idempotency behavior is stricter:
  - before: duplicate key could silently return prior turn regardless of payload/op differences
  - now: duplicate key with changed op/payload raises `idempotency key conflict`

## Exact test evidence

Targeted command:

```bash
bun test src/config.test.ts src/cxdb/sqlite.test.ts src/cxdb/conformance.test.ts
```

Observed result:

- 32 pass
- 0 fail
- 201 expect() calls
- Ran 32 tests across 3 files. [122.00ms]

Full suite command:

```bash
bun test
```

Observed result:

- 91 pass
- 0 fail
- 303 expect() calls
- Ran 91 tests across 18 files. [3.78s]

## Gate outcome

Phase 1 gate outcome: **GO** (all three adversarial reviews accepted after required-now fixes).
