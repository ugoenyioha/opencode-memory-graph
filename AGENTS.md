# OpenCode Memory Graph — Agent Guidelines

## What This Project Is

This is the `opencode-memory-graph` repository. It is a standalone OpenCode plugin package located within the `ai-forge` workspace (`plugins/opencode-memory-graph/`).

It provides a **Knowledge-Graph Memory** capability for OpenCode agents, granting them persistent, structured AI coding memory. 
It uses graph databases (like `falkordblite` or an external `falkordb` container) to build semantic relationships across codebases, projects, users, and tasks.

## Architecture & Components

- **Runtime Target:** OpenCode `@opencode-ai/plugin` v1.2.7+
- **Graph Database Engine:** 
  - Uses `falkordblite` (in-memory/embedded graph engine) by default.
  - Optionally supports remote `falkordb` connections (via the `falkordb` package).
- **Core Abstractions:**
  - `src/cxdb/`: Context Database (CxDB) logic for managing the graph lifecycle, schema, and persistence.
  - `src/embedding/`: Handling embeddings for semantic search (using `@huggingface/transformers`).
  - `src/extraction/`: Heuristics and LLM-assisted tools for pulling entities from agent interactions.
  - `src/ontology/`: The schema rules and structures (e.g., Node: `Project`, `File`, `Skill`, `Commit`).
  - `frontend/`: A web-based UI for exploring the knowledge graph, built with Next.js.

## Build and Testing Lifecycle

This plugin contains a complex build graph. When modifying its core functionality, be aware of the available npm scripts:

1. **`bun test src`** — Runs the comprehensive test suite (unit and integration tests).
2. **`bun run build`** — Compiles the TypeScript plugin (`src/index.ts`) into a standalone JavaScript bundle (`dist/index.js`) using Bun's bundler.
3. **`bun run serve:cxdb`** — Starts a local debugging/serving instance of the context database (`scripts/cxdb-server.ts`).
4. **`bun run build:frontend`** — Installs dependencies and builds the Next.js explorer UI located in the `frontend/` directory.

## Testing within `ai-forge`

To do full end-to-end integration testing of this plugin within an active agentic environment:
1. Run `ai-forge init sample-test-project --dev` at the workspace root to scaffold a new project.
2. The `ai-forge` CLI automatically copies this plugin directory (excluding `.git` and `node_modules`) into the new project's `.opencode/plugins/` directory.
3. You can then navigate to the generated project and run `opencode serve` to watch your changes execute in a live sidecar container context.