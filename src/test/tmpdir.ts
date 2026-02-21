// Shared test fixture root — uses /tmp to keep Unix socket paths under
// the macOS 104-byte UNIX_PATH_MAX limit.  The long workspace path
// (process.cwd() + ".tmp/...") produces socket paths of 105-120 bytes
// which causes falkordblite to fail on macOS.
//
// Usage:  import { testDir } from "../test/tmpdir";
//         const root = testDir("p0-graph");

import path from "node:path";

const BASE = path.join("/tmp", "omg-test");

/** Return a short, collision-free temp directory for a test suite. */
export function testDir(name: string): string {
  return path.join(BASE, name);
}
