# CXDB Phase 8

Delivery note for full CXDB parity closeout: turn-level fork semantics,
expanded API coverage, SSE live events, and upstream frontend adoption.

## What changed

- Updated truth-log fork semantics to match CXDB turn-level behavior:
  - `forkContext({ from_turn_id })` in `src/cxdb/interface.ts`
  - implementation in `src/cxdb/sqlite.ts`
  - session forking now resolves source head turn in `src/cxdb/session.ts`
- Added bundle storage and registry read helpers in `src/cxdb/sqlite.ts`:
  - `cxdb_bundle` table
  - `putBundle()`, `bundle()`, `types()`, and `descriptor()`
- Reworked compatibility server in `src/cxdb/server.ts`:
  - turn-level context create/fork (`base_turn_id`)
  - SSE streams (`/v1/events`, `/v1/contexts/:id/events`) with heartbeat
  - endpoint expansion: context detail, children, provenance, search,
    blobs, filesystem, registry reads, renderer manifest, health aliases
  - static serving of frontend export from `frontend/out`
- Expanded tests:
  - arbitrary-turn fork conformance in `src/cxdb/conformance.test.ts`
  - broad endpoint coverage in `src/cxdb/server.test.ts`
- Ported upstream CXDB frontend into `frontend/` (Apache-2.0 licensed)
  and added root script `bun run build:frontend` in `package.json`.

## Why it changed

- Close the remaining parity gaps from phases 1-7:
  - fork-from-any-turn support
  - full CXDB frontend stack instead of a minimal local inspector
- Preserve journal-first runtime guarantees while improving compatibility
  with upstream clients and UX tooling.

## Verification

Typecheck:

```bash
bun run typecheck
```

- pass

Core tests:

```bash
bun run test
```

- 100 pass
- 0 fail

Frontend static build:

```bash
bun run build:frontend
```

- pass (Next.js export succeeds)

## Notes

- Frontend Playwright specs in `frontend/tests` are intentionally not run
  by `bun run test`; root test script now targets `src/` tests.
- Frontend build prints non-blocking Next.js warnings about rewrites under
  `output: export` and `<img>` usage.
