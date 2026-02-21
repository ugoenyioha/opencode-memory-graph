import { connect } from "../src/graph/client";

const host = process.env.MEMORY_GRAPH_HOST;
if (!host) {
  throw new Error("MEMORY_GRAPH_HOST is required");
}

const port = process.env.MEMORY_GRAPH_PORT
  ? Number(process.env.MEMORY_GRAPH_PORT)
  : 6379;
const duration = process.env.REMOTE_SOAK_SECONDS
  ? Number(process.env.REMOTE_SOAK_SECONDS)
  : 300;
const tls = process.env.MEMORY_GRAPH_TLS === "false" ? false : true;
const password = process.env.MEMORY_GRAPH_PASSWORD || undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const db = await connect({ mode: "remote", host, port, password, tls });
  const start = Date.now();
  const deadline = start + duration * 1000;

  let reads = 0;
  let writes = 0;
  let errors = 0;
  const writeDurations: number[] = [];
  const readDurations: number[] = [];

  const pct = (list: number[], value: number) => {
    if (list.length === 0) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    const idx = Math.min(
      sorted.length - 1,
      Math.floor((value / 100) * sorted.length),
    );
    return sorted[idx] ?? 0;
  };

  while (Date.now() < deadline) {
    try {
      const now = Date.now();
      const writeStart = Date.now();
      await db.query(
        `MERGE (e:Entity {uuid: $uuid})
         ON CREATE SET e.name = $name, e.summary = $summary, e.label_type = 'Concept',
                       e.labels = ['Entity', 'Concept'], e.scope = 'project', e.project_id = 'soak',
                       e.source = 'auto', e.confidence = 'suspected', e.created_at = $now
         ON MATCH SET e.summary = $summary`,
        {
          uuid: `soak-${Math.floor(now / 5000)}`,
          name: `soak:${Math.floor(now / 5000)}`,
          summary: `remote soak heartbeat ${now}`,
          now,
        },
      );
      writes++;
      writeDurations.push(Date.now() - writeStart);

      const readStart = Date.now();
      await db.roQuery(
        `MATCH (e:Entity) WHERE e.project_id = 'soak' RETURN count(e) AS count`,
      );
      reads++;
      readDurations.push(Date.now() - readStart);
    } catch {
      errors++;
    }

    await sleep(250);
  }

  await db.close();

  console.log(
    JSON.stringify(
      {
        duration_seconds: duration,
        reads,
        writes,
        errors,
        write_p95_ms: pct(writeDurations, 95),
        write_p99_ms: pct(writeDurations, 99),
        read_p95_ms: pct(readDurations, 95),
        read_p99_ms: pct(readDurations, 99),
      },
      null,
      2,
    ),
  );

  if (errors > 0) {
    throw new Error(`remote soak observed ${errors} errors`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
