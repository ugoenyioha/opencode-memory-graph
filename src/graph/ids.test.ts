import { describe, expect, test } from "bun:test";
import { entity, mutation, relation } from "./ids";

describe("deterministic ids", () => {
  test("entity id is stable across calls", () => {
    const a = entity("Tool", "FalkorDB");
    const b = entity("Tool", "falkordb");
    expect(a).toBe(b);
  });

  test("relation id is stable for same assertion", () => {
    const a = relation("ent_a", "uses", "ent_b");
    const b = relation("ent_a", "USES", "ent_b");
    expect(a).toBe(b);
  });

  test("mutation id is stable by scope and key", () => {
    const a = mutation("project", "batch_1");
    const b = mutation("project", "batch_1");
    const c = mutation("session", "batch_1");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
