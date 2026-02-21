import { runtime } from "../src/config";
import { connect } from "../src/graph/client";
import { schema } from "../src/graph/schema";
import { sqlite } from "../src/cxdb/sqlite";
import { drain } from "../src/plugin/queue";

function home(value: string) {
  if (!value.startsWith("~/")) return value;
  const base = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return `${base}/${value.slice(2)}`;
}

const projectID = process.env.MEMORY_GRAPH_PROJECT_ID ?? "default";
const interval = process.env.MEMORY_GRAPH_QUEUE_INTERVAL_MS
  ? Number(process.env.MEMORY_GRAPH_QUEUE_INTERVAL_MS)
  : 1000;
const batch = process.env.MEMORY_GRAPH_QUEUE_BATCH
  ? Number(process.env.MEMORY_GRAPH_QUEUE_BATCH)
  : 10;
const packs = (process.env.MEMORY_GRAPH_QUEUE_PACKS ?? "coding")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const cfg = runtime();
  const db = await connect(cfg.storage);
  await schema(db);
  const truthlog = cfg.truthlog.enabled
    ? sqlite(home(cfg.truthlog.path))
    : null;

  let stop = false;
  const halt = () => {
    stop = true;
  };
  process.on("SIGINT", halt);
  process.on("SIGTERM", halt);

  while (!stop) {
    const done = await drain(db, {
      project_id: projectID,
      packs,
      truthlog: truthlog ?? undefined,
      limit: batch,
    });
    if (done > 0) {
      console.log(
        JSON.stringify({
          event: "queue_drain",
          project_id: projectID,
          processed: done,
          at: Date.now(),
        }),
      );
      continue;
    }
    await sleep(interval);
  }

  await db.close();
  truthlog?.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
