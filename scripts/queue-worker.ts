import { runtime } from "../src/config";
import { connect } from "../src/graph/client";
import { schema } from "../src/graph/schema";
import { drain } from "../src/plugin/queue";

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
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
