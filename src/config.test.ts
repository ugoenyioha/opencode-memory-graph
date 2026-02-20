import { describe, expect, test } from "bun:test";
import { config } from "./config";

describe("security baseline config", () => {
  test("defaults to local mode, project scope, and embeddings off", () => {
    const out = config(undefined);
    expect(out.storage.mode).toBe("local");
    expect(out.embeddings).toBe("off");
    expect(out.default_scope).toBe("project");
    expect(out.packs).toEqual(["coding"]);
    expect(out.proactive.enabled).toBe(false);
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
});
