import { describe, expect, test } from "bun:test";
import { extraction, extractionWithPacks } from "./schema";

describe("extraction schema", () => {
  test("accepts valid create payload", () => {
    const out = extraction({
      entities: [
        {
          action: "create",
          name: "FalkorDB",
          label_type: "Tool",
        },
      ],
      relationships: [],
    });
    expect(out.entities.length).toBe(1);
  });

  test("rejects invalid create payload", () => {
    expect(() =>
      extraction({
        entities: [{ action: "create" }],
        relationships: [],
      }),
    ).toThrow();
  });

  test("rejects unknown labels for selected packs", () => {
    expect(() =>
      extractionWithPacks(
        {
          entities: [
            { action: "create", name: "person", label_type: "Person" },
          ],
          relationships: [],
        },
        ["coding"],
      ),
    ).toThrow();
  });

  test("accepts labels from enabled packs", () => {
    const out = extractionWithPacks(
      {
        entities: [
          { action: "create", name: "spicedb", label_type: "Service" },
        ],
        relationships: [],
      },
      ["ops"],
    );
    expect(out.entities.length).toBe(1);
  });

  test("accepts labels from inline custom packs", () => {
    const out = extractionWithPacks(
      {
        entities: [
          { action: "create", name: "SOC2", label_type: "Regulation" },
        ],
        relationships: [],
      },
      [
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
    );
    expect(out.entities.length).toBe(1);
  });

  test("rejects unknown labels when custom packs are selected", () => {
    expect(() =>
      extractionWithPacks(
        {
          entities: [{ action: "create", name: "doc", label_type: "Policy" }],
          relationships: [],
        },
        [
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
      ),
    ).toThrow("unknown label_type: Policy");
  });
});
