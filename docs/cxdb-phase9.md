# CXDB Phase 9: Schema, Search, JSONL Portability

Phase 9 adds three ConPort-inspired capabilities to the CXDB-compatible runtime while preserving the truth-log-first architecture:

1. OpenAPI schema discovery at `/v1/schema`
2. Hybrid search API at `/v1/search`
3. Lossless JSONL import/export at `/v1/export` and `/v1/import`

These are additive API capabilities. The SQLite truth log remains the canonical source of truth, and FalkorDB remains a rebuildable projection.

## 1) Schema discovery (`GET /v1/schema`)

The server now publishes an OpenAPI 3.1 spec that describes the full HTTP surface, including contexts, turns, registry, blobs, events, stats, and new Phase 9 routes.

- Endpoint: `GET /v1/schema`
- Response: OpenAPI 3.1 JSON
- Purpose: enables agent/tool/client auto-discovery and codegen from a standard schema format

Implementation files:

- `src/cxdb/openapi.ts`
- `src/cxdb/server.ts`

## 2) Hybrid search API (`POST /v1/search`)

The runtime now exposes the existing hybrid search engine used by the plugin (`src/search/hybrid.ts`) via HTTP.

### Request body

```json
{
  "query": "memory search query",
  "type": "optional-entity-type-filter",
  "scope": "global | project | session",
  "after": 0,
  "before": 9999999999999,
  "limit": 10,
  "project_id": "optional-project-id"
}
```

### Behavior

- Uses existing hybrid pipeline (vector/FTS + graph traversal + temporal + usage weighting)
- Applies endpoint-level filters for:
  - `type`
  - `after` / `before` time window (based on `created_at`)
  - `limit`
- Returns deterministic JSON response with `results`, `count`, and `elapsed_ms`

### Wiring

- `serveCxdb()` now accepts optional `graph` client input
- If no graph client is provided, `/v1/search` responds `501 NOT_IMPLEMENTED`
- `scripts/cxdb-server.ts` now connects graph storage and passes the client into `serveCxdb`

Implementation files:

- `src/cxdb/server.ts`
- `scripts/cxdb-server.ts`

## 3) JSONL import/export (`/v1/export`, `/v1/import`)

Phase 9 introduces lossless portable interchange for context turns.

### Export (`GET /v1/export?context_id=<id>`)

- Exports one context as NDJSON (`application/x-ndjson`)
- One turn per line
- Includes:
  - turn identifiers and lineage (`turn_id`, `parent_turn_id`, `idx`)
  - typing (`type_id`, `type_version`)
  - payload hash and decoded payload
  - timestamp and idempotency key
  - context metadata

### Import (`POST /v1/import`)

- Accepts NDJSON body (`application/x-ndjson` or `text/plain`)
- Replays each line with `append()` into:
  - provided `context_id` (if query param exists), or
  - a newly created context
- Returns structured import result:
  - `context_id`
  - `turns_imported`
  - `head_turn_id`
  - line-level `errors`

Implementation files:

- `src/cxdb/server.ts`

## Validation

Server tests were expanded to validate:

- schema endpoint availability and expected paths
- JSONL export format and import round-trip behavior
- `/v1/search` behavior for both unavailable (`501`) and wired graph backend modes

Test commands:

```bash
bun test src/cxdb/server.test.ts
bun test src
bun run typecheck
```

Observed status after Phase 9 implementation:

- `bun test src/cxdb/server.test.ts`: pass
- `bun test src`: pass
- `bun run typecheck`: pass
