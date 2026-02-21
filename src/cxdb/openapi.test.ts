import { describe, expect, test } from "bun:test";
import { openapi } from "./openapi";

// Dedicated tests for the OpenAPI specification generator.
// Validates structure, paths, schemas, and parameter correctness.

describe("openapi spec: structure", () => {
  const spec = openapi("1.0.0");

  test("returns valid OpenAPI 3.1 object", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(typeof spec.info).toBe("object");
    expect(typeof spec.paths).toBe("object");
    expect(spec.servers).toBeDefined();
  });

  test("info block has required fields", () => {
    expect(spec.info.title).toBe("CXDB-Compatible Runtime API");
    expect(spec.info.version).toBe("1.0.0");
    expect(typeof spec.info.description).toBe("string");
    expect(spec.info.description.length).toBeGreaterThan(0);
  });

  test("version parameter is propagated", () => {
    const v2 = openapi("2.5.0");
    expect(v2.info.version).toBe("2.5.0");
  });

  test("servers array contains root path", () => {
    expect(Array.isArray(spec.servers)).toBe(true);
    expect(spec.servers.length).toBe(1);
    expect(spec.servers[0]!.url).toBe("/");
  });

  test("spec is valid JSON (serializable)", () => {
    const json = JSON.stringify(spec);
    const parsed = JSON.parse(json);
    expect(parsed.openapi).toBe("3.1.0");
    expect(Object.keys(parsed.paths).length).toBeGreaterThan(0);
  });
});

describe("openapi spec: paths", () => {
  const spec = openapi("1.0.0");
  const paths = Object.keys(spec.paths);

  test("contains all required health endpoints", () => {
    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/healthz"]).toBeDefined();
    expect(spec.paths["/health"].get).toBeDefined();
    expect(spec.paths["/healthz"].get).toBeDefined();
  });

  test("contains schema discovery endpoint", () => {
    expect(spec.paths["/v1/schema"]).toBeDefined();
    expect(spec.paths["/v1/schema"].get).toBeDefined();
  });

  test("contains SSE events endpoint", () => {
    expect(spec.paths["/v1/events"]).toBeDefined();
    const sse = spec.paths["/v1/events"].get;
    expect(sse.responses["200"].content["text/event-stream"]).toBeDefined();
  });

  test("contains all context CRUD endpoints", () => {
    expect(spec.paths["/v1/contexts"]).toBeDefined();
    expect(spec.paths["/v1/contexts"].get).toBeDefined();
    expect(spec.paths["/v1/contexts"].post).toBeDefined();
    expect(spec.paths["/v1/contexts/create"]).toBeDefined();
    expect(spec.paths["/v1/contexts/create"].post).toBeDefined();
    expect(spec.paths["/v1/contexts/fork"]).toBeDefined();
    expect(spec.paths["/v1/contexts/fork"].post).toBeDefined();
    expect(spec.paths["/v1/contexts/search"]).toBeDefined();
    expect(spec.paths["/v1/contexts/search"].get).toBeDefined();
  });

  test("contains context-specific endpoints", () => {
    expect(spec.paths["/v1/contexts/{context_id}"]).toBeDefined();
    expect(spec.paths["/v1/contexts/{context_id}"].get).toBeDefined();
    expect(spec.paths["/v1/contexts/{context_id}/events"]).toBeDefined();
    expect(spec.paths["/v1/contexts/{context_id}/children"]).toBeDefined();
    expect(spec.paths["/v1/contexts/{context_id}/provenance"]).toBeDefined();
    expect(spec.paths["/v1/contexts/{context_id}/turns"]).toBeDefined();
    expect(spec.paths["/v1/contexts/{context_id}/append"]).toBeDefined();
  });

  test("contains import/export endpoints", () => {
    expect(spec.paths["/v1/export"]).toBeDefined();
    expect(spec.paths["/v1/export"].get).toBeDefined();
    expect(spec.paths["/v1/import"]).toBeDefined();
    expect(spec.paths["/v1/import"].post).toBeDefined();
  });

  test("contains search endpoint", () => {
    expect(spec.paths["/v1/search"]).toBeDefined();
    expect(spec.paths["/v1/search"].post).toBeDefined();
  });

  test("contains blob endpoint", () => {
    expect(spec.paths["/v1/blobs/{payload_hash}"]).toBeDefined();
    expect(spec.paths["/v1/blobs/{payload_hash}"].get).toBeDefined();
  });

  test("contains filesystem stub endpoints", () => {
    expect(spec.paths["/v1/turns/{turn_id}/fs"]).toBeDefined();
    expect(spec.paths["/v1/turns/{turn_id}/fs/{path}"]).toBeDefined();
  });

  test("contains registry endpoints", () => {
    expect(spec.paths["/v1/registry/bundles/{bundle_id}"]).toBeDefined();
    expect(spec.paths["/v1/registry/bundles/{bundle_id}"].put).toBeDefined();
    expect(spec.paths["/v1/registry/bundles/{bundle_id}"].get).toBeDefined();
    expect(spec.paths["/v1/registry/types"]).toBeDefined();
    expect(
      spec.paths["/v1/registry/types/{type_id}/versions/{type_version}"],
    ).toBeDefined();
    expect(spec.paths["/v1/registry/renderers"]).toBeDefined();
  });

  test("contains stats endpoint", () => {
    expect(spec.paths["/v1/stats"]).toBeDefined();
    expect(spec.paths["/v1/stats"].get).toBeDefined();
  });

  test("has correct total path count", () => {
    // Ensure no paths were accidentally dropped
    expect(paths.length).toBe(25);
  });
});

describe("openapi spec: parameters", () => {
  const spec = openapi("1.0.0");

  test("context_id path parameter uses string-serialized u64 schema", () => {
    const params =
      spec.paths["/v1/contexts/{context_id}"].get.parameters;
    const ctxParam = params.find(
      (p: Record<string, unknown>) => p.name === "context_id",
    );
    expect(ctxParam).toBeDefined();
    expect(ctxParam.in).toBe("path");
    expect(ctxParam.required).toBe(true);
    expect(ctxParam.schema.type).toBe("string");
    expect(ctxParam.schema.pattern).toBe("^[0-9]+$");
  });

  test("contexts list has limit query parameter", () => {
    const params = spec.paths["/v1/contexts"].get.parameters;
    const limitParam = params.find(
      (p: Record<string, unknown>) => p.name === "limit",
    );
    expect(limitParam).toBeDefined();
    expect(limitParam.in).toBe("query");
    expect(limitParam.schema.type).toBe("integer");
    expect(limitParam.schema.minimum).toBe(1);
  });

  test("turns endpoint has before_turn_id, limit, and view params", () => {
    const params =
      spec.paths["/v1/contexts/{context_id}/turns"].get.parameters;
    const names = params.map((p: Record<string, unknown>) => p.name);
    expect(names).toContain("context_id");
    expect(names).toContain("before_turn_id");
    expect(names).toContain("limit");
    expect(names).toContain("view");

    const viewParam = params.find(
      (p: Record<string, unknown>) => p.name === "view",
    );
    expect(viewParam.schema.enum).toEqual(["typed", "raw", "both"]);
  });

  test("children endpoint has recursive and limit params", () => {
    const params =
      spec.paths["/v1/contexts/{context_id}/children"].get.parameters;
    const names = params.map((p: Record<string, unknown>) => p.name);
    expect(names).toContain("recursive");
    expect(names).toContain("limit");

    const recursiveParam = params.find(
      (p: Record<string, unknown>) => p.name === "recursive",
    );
    expect(recursiveParam.schema.enum).toEqual(["0", "1"]);
  });

  test("search contexts has q and limit params", () => {
    const params = spec.paths["/v1/contexts/search"].get.parameters;
    const names = params.map((p: Record<string, unknown>) => p.name);
    expect(names).toContain("q");
    expect(names).toContain("limit");
  });

  test("export requires context_id query param", () => {
    const params = spec.paths["/v1/export"].get.parameters;
    const ctxParam = params.find(
      (p: Record<string, unknown>) => p.name === "context_id",
    );
    expect(ctxParam).toBeDefined();
    expect(ctxParam.in).toBe("query");
    expect(ctxParam.required).toBe(true);
  });

  test("import context_id query param is optional", () => {
    const params = spec.paths["/v1/import"].post.parameters;
    const ctxParam = params.find(
      (p: Record<string, unknown>) => p.name === "context_id",
    );
    expect(ctxParam).toBeDefined();
    expect(ctxParam.required).toBe(false);
  });

  test("type version parameter is integer with minimum 1", () => {
    const endpoint =
      spec.paths["/v1/registry/types/{type_id}/versions/{type_version}"];
    const versionParam = endpoint.get.parameters.find(
      (p: Record<string, unknown>) => p.name === "type_version",
    );
    expect(versionParam).toBeDefined();
    expect(versionParam.schema.type).toBe("integer");
    expect(versionParam.schema.minimum).toBe(1);
  });
});

describe("openapi spec: request bodies", () => {
  const spec = openapi("1.0.0");

  test("fork requires base_turn_id in body", () => {
    const body = spec.paths["/v1/contexts/fork"].post.requestBody;
    expect(body.required).toBe(true);
    const schema = body.content["application/json"].schema;
    expect(schema.required).toContain("base_turn_id");
    expect(schema.properties.base_turn_id.type).toBe("string");
  });

  test("append requires type_id and type_version", () => {
    const body =
      spec.paths["/v1/contexts/{context_id}/append"].post.requestBody;
    expect(body.required).toBe(true);
    const schema = body.content["application/json"].schema;
    expect(schema.required).toContain("type_id");
    expect(schema.required).toContain("type_version");
    expect(schema.properties.type_id.type).toBe("string");
    expect(schema.properties.type_version.type).toBe("integer");
    expect(schema.properties.type_version.minimum).toBe(1);
  });

  test("append body includes optional fields", () => {
    const schema =
      spec.paths["/v1/contexts/{context_id}/append"].post.requestBody.content[
        "application/json"
      ].schema;
    expect(schema.properties.data).toBeDefined();
    expect(schema.properties.payload).toBeDefined();
    expect(schema.properties.parent_turn_id).toBeDefined();
    expect(schema.properties.idempotency_key).toBeDefined();
    expect(schema.properties.idempotency_key.type).toBe("string");
  });

  test("search body has required query and optional filters", () => {
    const body = spec.paths["/v1/search"].post.requestBody;
    expect(body.required).toBe(true);
    const schema = body.content["application/json"].schema;
    expect(schema.required).toEqual(["query"]);
    expect(schema.properties.query.type).toBe("string");
    expect(schema.properties.scope.enum).toEqual([
      "global",
      "project",
      "session",
    ]);
    expect(schema.properties.limit.maximum).toBe(50);
    expect(schema.properties.limit.minimum).toBe(1);
    expect(schema.properties.project_id.type).toBe("string");
  });

  test("import accepts ndjson and text content types", () => {
    const body = spec.paths["/v1/import"].post.requestBody;
    expect(body.required).toBe(true);
    expect(body.content["application/x-ndjson"]).toBeDefined();
    expect(body.content["text/plain"]).toBeDefined();
  });

  test("create context body is optional", () => {
    const body = spec.paths["/v1/contexts"].post.requestBody;
    expect(body.required).toBe(false);
  });

  test("bundle PUT accepts JSON object", () => {
    const body =
      spec.paths["/v1/registry/bundles/{bundle_id}"].put.requestBody;
    expect(body.required).toBe(true);
    expect(body.content["application/json"].schema.type).toBe("object");
  });
});

describe("openapi spec: responses", () => {
  const spec = openapi("1.0.0");

  test("error responses use standard error schema", () => {
    // Check a few endpoints that return errors
    const fork400 =
      spec.paths["/v1/contexts/fork"].post.responses["400"];
    expect(fork400.content["application/json"].schema).toBeDefined();
    const errorSchema = fork400.content["application/json"].schema;
    expect(errorSchema.required).toContain("error");
    expect(errorSchema.properties.error.required).toContain("code");
    expect(errorSchema.properties.error.required).toContain("message");
  });

  test("export returns ndjson content type", () => {
    const export200 = spec.paths["/v1/export"].get.responses["200"];
    expect(export200.content["application/x-ndjson"]).toBeDefined();
  });

  test("blob returns octet-stream", () => {
    const blob200 =
      spec.paths["/v1/blobs/{payload_hash}"].get.responses["200"];
    expect(blob200.content["application/octet-stream"]).toBeDefined();
  });

  test("search has 501 response for unavailable backend", () => {
    const search501 = spec.paths["/v1/search"].post.responses["501"];
    expect(search501).toBeDefined();
    expect(search501.description).toContain("unavailable");
  });

  test("bundle PUT has 201, 204, and 409 responses", () => {
    const bundleResponses =
      spec.paths["/v1/registry/bundles/{bundle_id}"].put.responses;
    expect(bundleResponses["201"]).toBeDefined();
    expect(bundleResponses["204"]).toBeDefined();
    expect(bundleResponses["409"]).toBeDefined();
  });

  test("context SSE stream returns text/event-stream", () => {
    const ctxSse =
      spec.paths["/v1/contexts/{context_id}/events"].get.responses["200"];
    expect(ctxSse.content["text/event-stream"]).toBeDefined();
  });

  test("404 responses exist for context, provenance, turns, blob, fs", () => {
    const pathsWithNotFound = [
      "/v1/contexts/{context_id}",
      "/v1/contexts/{context_id}/provenance",
      "/v1/contexts/{context_id}/turns",
      "/v1/blobs/{payload_hash}",
      "/v1/turns/{turn_id}/fs",
      "/v1/turns/{turn_id}/fs/{path}",
      "/v1/export",
    ];

    for (const p of pathsWithNotFound) {
      const endpoint = spec.paths[p];
      const method = endpoint.get;
      expect(method.responses["404"]).toBeDefined();
    }
  });
});

describe("openapi spec: consistency checks", () => {
  const spec = openapi("1.0.0");

  test("all paths start with / ", () => {
    for (const p of Object.keys(spec.paths)) {
      expect(p.startsWith("/")).toBe(true);
    }
  });

  test("every endpoint has at least one response", () => {
    for (const [pathKey, methods] of Object.entries(spec.paths)) {
      for (const [method, def] of Object.entries(
        methods as Record<string, Record<string, unknown>>,
      )) {
        const responses = def.responses as Record<string, unknown> | undefined;
        expect(responses).toBeDefined();
        expect(Object.keys(responses!).length).toBeGreaterThan(0);
      }
    }
  });

  test("every endpoint has a summary", () => {
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const [, def] of Object.entries(
        methods as Record<string, Record<string, unknown>>,
      )) {
        expect(typeof def.summary).toBe("string");
        expect((def.summary as string).length).toBeGreaterThan(0);
      }
    }
  });

  test("all path parameters are marked required", () => {
    for (const [, methods] of Object.entries(spec.paths)) {
      for (const [, def] of Object.entries(
        methods as Record<string, Record<string, unknown>>,
      )) {
        const params = def.parameters as
          | Array<Record<string, unknown>>
          | undefined;
        if (!params) continue;
        for (const param of params) {
          if (param.in === "path") {
            expect(param.required).toBe(true);
          }
        }
      }
    }
  });
});
