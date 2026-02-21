import { runtime } from "../src/config";
import { connect } from "../src/graph/client";
import { sqlite } from "../src/cxdb/sqlite";
import { integrity } from "../src/cxdb/integrity";

function home(value: string) {
  if (!value.startsWith("~/")) return value;
  const base = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return `${base}/${value.slice(2)}`;
}

async function main() {
  const cfg = runtime();
  if (!cfg.truthlog.enabled) {
    throw new Error("truthlog must be enabled to run integrity check");
  }

  const log = sqlite(home(cfg.truthlog.path));
  const db = await connect(cfg.storage);
  const out = await integrity(log, db, process.cwd());
  log.close();
  await db.close();
  console.log(JSON.stringify(out));
}

await main();
