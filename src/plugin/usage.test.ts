import { describe, expect, test } from "bun:test";
import { toolName } from "./usage";

describe("tool usage parsing", () => {
  test("extracts tool name from known fields", () => {
    expect(toolName({ tool: "memory_search" })).toBe("memory_search");
    expect(toolName({ toolName: "memory_get" })).toBe("memory_get");
    expect(toolName({ name: "bash" })).toBe("bash");
  });

  test("falls back to unknown", () => {
    expect(toolName({})).toBe("unknown");
    expect(toolName(null)).toBe("unknown");
  });
});
