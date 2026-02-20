import { describe, expect, test } from "bun:test";
import { registry } from "./registry";

describe("ontology registry", () => {
  test("loads core + default coding pack", () => {
    const out = registry();
    expect(out.has("Decision")).toBe(true);
    expect(out.has("Tool")).toBe(true);
    expect(out.has("Endpoint")).toBe(false);
  });

  test("loads selected packs", () => {
    const out = registry(["coding", "ops"]);
    expect(out.has("Tool")).toBe(true);
    expect(out.has("Endpoint")).toBe(true);
    expect(out.has("Person")).toBe(false);
  });

  test("loads inline custom pack", () => {
    const out = registry([
      "coding",
      {
        name: "compliance",
        labels: [{ name: "Regulation", description: "Compliance requirement" }],
      },
    ]);

    expect(out.has("Tool")).toBe(true);
    expect(out.has("Regulation")).toBe(true);
  });

  test("rejects custom labels colliding with builtin labels", () => {
    expect(() =>
      registry([
        {
          name: "custom",
          labels: [{ name: "Tool", description: "Conflicting label" }],
        },
      ]),
    ).toThrow("label collision: Tool");
  });
});
