import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { sqlite } from "./sqlite";
import { sessions } from "./session";
import { testDir } from "../test/tmpdir";

const root = testDir("p2-session");

describe("cxdb session mapping", () => {
  beforeAll(async () => {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("ensure creates a context once per project/session", () => {
    const log = sqlite(path.join(root, "truth.sqlite"));
    const store = sessions(path.join(root, "sessions.sqlite"));

    const one = store.ensure(log, "project-a", "session-1");
    const two = store.ensure(log, "project-a", "session-1");
    const other = store.ensure(log, "project-a", "session-2");

    expect(one).toBe(two);
    expect(other).not.toBe(one);

    store.close();
    log.close();
  });

  test("fork creates a new child context", () => {
    const log = sqlite(path.join(root, "truth-fork.sqlite"));
    const store = sessions(path.join(root, "sessions-fork.sqlite"));

    const source = store.ensure(log, "project-a", "session-1");
    const child = store.fork(log, "project-a", "session-1", "session-2");

    expect(child).not.toBe(source);
    expect(store.get("project-a", "session-2")).toBe(child);

    store.close();
    log.close();
  });
});
