const id = {
  type: "string",
  pattern: "^[0-9]+$",
  description: "string-serialized u64",
};

const error = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
};

export function openapi(version: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "CXDB-Compatible Runtime API",
      version,
      description:
        "Turn-DAG truth log API with registry, blobs, SSE events, hybrid search, and JSONL import/export.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          responses: {
            "200": {
              description: "OK",
            },
          },
        },
      },
      "/healthz": {
        get: {
          summary: "Health alias",
          responses: {
            "200": {
              description: "OK",
            },
          },
        },
      },
      "/v1/schema": {
        get: {
          summary: "OpenAPI schema discovery",
          responses: {
            "200": {
              description: "OpenAPI 3.1 schema",
            },
          },
        },
      },
      "/v1/events": {
        get: {
          summary: "Server-sent events stream",
          responses: {
            "200": {
              description: "SSE stream",
              content: { "text/event-stream": {} },
            },
          },
        },
      },
      "/v1/contexts": {
        get: {
          summary: "List contexts",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: { "200": { description: "Context list" } },
        },
        post: {
          summary: "Create context",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { base_turn_id: id },
                },
              },
            },
          },
          responses: { "200": { description: "Context created" } },
        },
      },
      "/v1/contexts/create": {
        post: {
          summary: "Create context (alias)",
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { base_turn_id: id },
                },
              },
            },
          },
          responses: { "200": { description: "Context created" } },
        },
      },
      "/v1/contexts/fork": {
        post: {
          summary: "Fork context from base turn",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["base_turn_id"],
                  properties: { base_turn_id: id },
                },
              },
            },
          },
          responses: {
            "200": { description: "Context created" },
            "400": {
              description: "Bad request",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/contexts/search": {
        get: {
          summary: "Search contexts by metadata text",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: { "200": { description: "Context search results" } },
        },
      },
      "/v1/contexts/{context_id}": {
        get: {
          summary: "Get context metadata",
          parameters: [
            { name: "context_id", in: "path", required: true, schema: id },
          ],
          responses: {
            "200": { description: "Context metadata" },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/contexts/{context_id}/events": {
        get: {
          summary: "Context-scoped SSE stream",
          parameters: [
            { name: "context_id", in: "path", required: true, schema: id },
          ],
          responses: {
            "200": {
              description: "SSE stream",
              content: { "text/event-stream": {} },
            },
          },
        },
      },
      "/v1/contexts/{context_id}/children": {
        get: {
          summary: "List child contexts",
          parameters: [
            { name: "context_id", in: "path", required: true, schema: id },
            {
              name: "recursive",
              in: "query",
              schema: { type: "string", enum: ["0", "1"] },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: { "200": { description: "Child contexts" } },
        },
      },
      "/v1/contexts/{context_id}/provenance": {
        get: {
          summary: "Get context provenance",
          parameters: [
            { name: "context_id", in: "path", required: true, schema: id },
          ],
          responses: {
            "200": { description: "Provenance" },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/contexts/{context_id}/turns": {
        get: {
          summary: "Get turns from context head chain",
          parameters: [
            { name: "context_id", in: "path", required: true, schema: id },
            { name: "before_turn_id", in: "query", schema: id },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1 },
            },
            {
              name: "view",
              in: "query",
              schema: { type: "string", enum: ["typed", "raw", "both"] },
            },
          ],
          responses: {
            "200": { description: "Turn list" },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/contexts/{context_id}/append": {
        post: {
          summary: "Append turn to context head",
          parameters: [
            { name: "context_id", in: "path", required: true, schema: id },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["type_id", "type_version"],
                  properties: {
                    type_id: { type: "string" },
                    type_version: { type: "integer", minimum: 1 },
                    data: {},
                    payload: {},
                    parent_turn_id: id,
                    idempotency_key: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Turn appended" },
            "400": {
              description: "Bad request",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/export": {
        get: {
          summary: "Export one context as JSONL turns",
          parameters: [
            { name: "context_id", in: "query", required: true, schema: id },
          ],
          responses: {
            "200": {
              description: "NDJSON stream",
              content: { "application/x-ndjson": {} },
            },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/import": {
        post: {
          summary: "Import JSONL turns into context",
          parameters: [
            { name: "context_id", in: "query", required: false, schema: id },
          ],
          requestBody: {
            required: true,
            content: {
              "application/x-ndjson": { schema: { type: "string" } },
              "text/plain": { schema: { type: "string" } },
            },
          },
          responses: {
            "200": { description: "Import result" },
            "400": {
              description: "Bad request",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/search": {
        post: {
          summary: "Hybrid memory search",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: {
                    query: { type: "string" },
                    type: { type: "string" },
                    scope: {
                      type: "string",
                      enum: ["global", "project", "session"],
                    },
                    after: { type: "integer" },
                    before: { type: "integer" },
                    limit: { type: "integer", minimum: 1, maximum: 50 },
                    project_id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Search results" },
            "501": {
              description: "Search backend unavailable",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/blobs/{payload_hash}": {
        get: {
          summary: "Read blob bytes",
          parameters: [
            {
              name: "payload_hash",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Blob bytes",
              content: { "application/octet-stream": {} },
            },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/turns/{turn_id}/fs": {
        get: {
          summary: "List virtual filesystem for turn (stub)",
          parameters: [
            { name: "turn_id", in: "path", required: true, schema: id },
            {
              name: "path",
              in: "query",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Filesystem listing" },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/turns/{turn_id}/fs/{path}": {
        get: {
          summary: "Read virtual filesystem file for turn (stub)",
          parameters: [
            { name: "turn_id", in: "path", required: true, schema: id },
            {
              name: "path",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Filesystem file" },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/registry/bundles/{bundle_id}": {
        put: {
          summary: "Register a type bundle",
          parameters: [
            {
              name: "bundle_id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "201": { description: "Bundle created" },
            "204": { description: "Bundle unchanged" },
            "409": {
              description: "Conflict",
              content: { "application/json": { schema: error } },
            },
          },
        },
        get: {
          summary: "Read a type bundle",
          parameters: [
            {
              name: "bundle_id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Bundle" },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/registry/types": {
        get: {
          summary: "List types and latest versions",
          responses: { "200": { description: "Type list" } },
        },
      },
      "/v1/registry/types/{type_id}/versions/{type_version}": {
        get: {
          summary: "Read type descriptor for exact version",
          parameters: [
            {
              name: "type_id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "type_version",
              in: "path",
              required: true,
              schema: { type: "integer", minimum: 1 },
            },
          ],
          responses: {
            "200": { description: "Type descriptor" },
            "404": {
              description: "Not found",
              content: { "application/json": { schema: error } },
            },
          },
        },
      },
      "/v1/registry/renderers": {
        get: {
          summary: "Renderer manifest",
          responses: { "200": { description: "Renderer manifest" } },
        },
      },
      "/v1/stats": {
        get: {
          summary: "Storage and cardinality stats",
          responses: { "200": { description: "Runtime stats" } },
        },
      },
    },
  };
}
