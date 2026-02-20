import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { connect } from "./graph/client";
import { schema } from "./graph/schema";

export const MemoryPlugin: Plugin = async (ctx) => {
  const db = await connect();
  await schema(db);

  return {
    // --- Tools: two-tool retrieval pattern ---
    tool: {
      memory_search: tool({
        description:
          "Search the knowledge graph for memories related to a query. " +
          "Returns ranked summaries with UUIDs. Use memory_get for full details.",
        args: {
          query: tool.schema.string().describe("natural language search query"),
          scope: tool.schema
            .enum(["global", "project", "session"])
            .optional()
            .describe("filter by scope"),
          limit: tool.schema
            .number()
            .optional()
            .describe("max results (default 10)"),
        },
        async execute(args) {
          // TODO: implement hybrid search pipeline
          return JSON.stringify({ results: [], query: args.query });
        },
      }),

      memory_get: tool({
        description:
          "Get full details of a memory entity by UUID, including its " +
          "1-hop relationships and connected entities.",
        args: {
          uuid: tool.schema.string().describe("entity UUID"),
        },
        async execute(args) {
          // TODO: implement entity fetch with neighborhood
          return JSON.stringify({ uuid: args.uuid, found: false });
        },
      }),
    },

    // --- Hooks ---

    // Inject core-tier memories into system prompt
    "experimental.chat.system.transform": async (_input, output) => {
      // TODO: load core tier and inject into output.system
    },

    // Queue messages for entity extraction
    "chat.message": async (_input, _output) => {
      // TODO: debounce and queue for async extraction
    },

    // Pre-compaction flush — most critical hook
    "experimental.session.compacting": async (_input, output) => {
      // TODO: extract all memories from conversation before compaction
      output.context.push(
        "Note: memories from this conversation have been saved to the knowledge graph.",
      );
    },

    // Track tool usage patterns
    "tool.execute.after": async (_input, _output) => {
      // TODO: record tool usage for pattern detection
    },
  };
};
