# develop-memory-graph

## Description
Workflow for developing, building, and testing the `opencode-memory-graph` plugin. Use this skill when making modifications to its source code, graph schema, embeddings, or its integrated frontend.

## Requirements
- You must be operating inside the `ai-forge/plugins/opencode-memory-graph/` directory.
- `bun` must be installed.

## Workflow Instructions

### 1. Code Modification & Type Checking
- After editing files in `src/`, always run `bun run typecheck` (`tsc --noEmit`) to verify strict typing.
- Run `bun run lint` to catch Biome linting errors.

### 2. Testing Logic
- Execute `bun test src` to run the plugin's comprehensive test suite. Ensure all tests pass before considering a modification complete.
- For heavier integration, you can run `bun run serve:cxdb` to manually inspect the database operations via the debug server.

### 3. Building the Plugin Bundle
- Run `bun run build` to compile the `src/` directory down to `dist/index.js` and `dist/index.d.ts`.
- The `dist/` directory is what the `ai-forge` scaffold uses when executing this plugin.

### 4. Frontend UI Development
- If you made changes to the web UI in `frontend/`, run `bun run build:frontend` to compile the Next.js assets.

### 5. Integration Testing with AI Forge
To verify that the plugin works when scaffolded into a production-like environment:
- Navigate back to the `ai-forge` workspace root (`../../`).
- Run `ai-forge init sample-graph-test --dev` (select default options).
- The CLI will copy the updated plugin (including the newly compiled `dist/` and `frontend/`) into `sample-graph-test/.opencode/plugins/opencode-memory-graph/`.
- Navigate into `sample-graph-test` and test the plugin in a live runtime by calling `OPENCODE_BIN=/tmp/opencode-wrapper.sh opencode serve`.