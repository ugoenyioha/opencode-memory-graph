import { describe, expect, test } from "bun:test";
import { config, runtime } from "./config";

describe("security baseline config", () => {
  test("defaults to local mode, project scope, and embeddings off", () => {
    const out = config(undefined);
    expect(out.storage.mode).toBe("local");
    expect(out.embeddings).toBe("off");
    expect(out.default_scope).toBe("project");
    expect(out.packs).toEqual(["coding"]);
    expect(out.proactive.enabled).toBe(false);
    expect(out.truthlog.enabled).toBe(false);
    expect(out.truthlog.path).toBe("~/.opencode/memory/truthlog.sqlite");
  });

  test("rejects insecure remote mode without tls", () => {
    expect(() =>
      config({
        storage: {
          mode: "remote",
          host: "spicedb-grpc.usableapps.local",
          port: 6379,
          password: "secret",
          tls: false,
        },
      }),
    ).toThrow();
  });

  test("rejects localhost remote mode", () => {
    expect(() =>
      config({
        storage: {
          mode: "remote",
          host: "localhost",
          port: 6379,
          password: "secret",
          tls: true,
        },
      }),
    ).toThrow();
  });

  test("rejects loopback ipv6 remote mode", () => {
    expect(() =>
      config({
        storage: {
          mode: "remote",
          host: "::1",
          port: 6379,
          password: "secret",
          tls: true,
        },
      }),
    ).toThrow();
  });

  test("accepts inline custom ontology pack", () => {
    const out = config({
      packs: [
        "coding",
        {
          name: "compliance",
          labels: [
            {
              name: "Regulation",
              description: "Compliance requirement",
            },
          ],
        },
      ],
    });

    expect(out.packs).toEqual([
      "coding",
      {
        name: "compliance",
        labels: [
          {
            name: "Regulation",
            description: "Compliance requirement",
          },
        ],
      },
    ]);
  });

  test("runtime helper selects local mode by default", () => {
    delete process.env.MEMORY_GRAPH_MODE;
    delete process.env.MEMORY_GRAPH_PATH;
    const out = runtime();
    expect(out.storage.mode).toBe("local");
  });

  test("runtime helper parses remote mode from env", () => {
    process.env.MEMORY_GRAPH_MODE = "remote";
    process.env.MEMORY_GRAPH_HOST = "falkordb.example.internal";
    process.env.MEMORY_GRAPH_PORT = "6380";
    process.env.MEMORY_GRAPH_PASSWORD = "secret";
    process.env.MEMORY_GRAPH_TLS = "true";

    const out = runtime();
    expect(out.storage.mode).toBe("remote");
    if (out.storage.mode !== "remote") return;
    expect(out.storage.host).toBe("falkordb.example.internal");
    expect(out.storage.port).toBe(6380);
    expect(out.storage.tls).toBe(true);

    delete process.env.MEMORY_GRAPH_MODE;
    delete process.env.MEMORY_GRAPH_HOST;
    delete process.env.MEMORY_GRAPH_PORT;
    delete process.env.MEMORY_GRAPH_PASSWORD;
    delete process.env.MEMORY_GRAPH_TLS;
  });

  test("runtime helper toggles proactive from env", () => {
    process.env.MEMORY_GRAPH_PROACTIVE = "1";
    const on = runtime();
    expect(on.proactive.enabled).toBe(true);

    delete process.env.MEMORY_GRAPH_PROACTIVE;
    const off = runtime();
    expect(off.proactive.enabled).toBe(false);
  });

  test("runtime helper configures truthlog from env", () => {
    process.env.MEMORY_GRAPH_TRUTHLOG = "1";
    process.env.MEMORY_GRAPH_TRUTHLOG_PATH = "/tmp/truthlog.sqlite";

    const out = runtime();
    expect(out.truthlog.enabled).toBe(true);
    expect(out.truthlog.path).toBe("/tmp/truthlog.sqlite");

    delete process.env.MEMORY_GRAPH_TRUTHLOG;
    delete process.env.MEMORY_GRAPH_TRUTHLOG_PATH;
  });

  test("runtime helper parses cloud embedding mode", () => {
    process.env.MEMORY_EMBEDDINGS = "cloud";
    const out = runtime();
    expect(out.embeddings).toBe("cloud");
    delete process.env.MEMORY_EMBEDDINGS;
  });
});
