import { runtime } from "../src/config";
import { serveCxdb } from "../src/cxdb/server";

function home(value: string) {
  if (!value.startsWith("~/")) return value;
  const base = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return `${base}/${value.slice(2)}`;
}

const cfg = runtime();
const path = cfg.truthlog.path;
const server = serveCxdb({
  path: home(path),
  port: Number(process.env.CXDB_HTTP_PORT ?? "9010"),
});

console.log(`cxdb-compatible server listening on :${server.port}`);
