import { runtime } from "../src/config";
import { connect } from "../src/graph/client";
import { schema } from "../src/graph/schema";
import { sqlite } from "../src/cxdb/sqlite";
import { rebuild } from "../src/cxdb/replay";

function home(value: string) {
  if (!value.startsWith("~/")) return value;
  const base = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return `${base}/${value.slice(2)}`;
}

async function main() {
  const cfg = runtime();
  if (!cfg.truthlog.enabled) {
    throw new Error("truthlog must be enabled to rebuild");
  }

  const log = sqlite(home(cfg.truthlog.path));
  const db = await connect(cfg.storage);

  await schema(db);
  await db.query("MATCH (n) DETACH DELETE n");

  const out = await rebuild(log, db);
  log.close();
  await db.close();
  console.log(JSON.stringify(out));
}

await main();
