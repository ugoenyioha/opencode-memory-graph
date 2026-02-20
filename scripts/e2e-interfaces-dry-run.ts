import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { merge } from "../src/extraction";
import { MemoryPlugin } from "../src/index";

const root = path.join(process.cwd(), ".tmp", "e2e-interfaces");

const messages = [
  {
    info: { id: "m1" },
    parts: [
      {
        type: "text",
        text: "We chose FalkorDB because local and remote modes share Cypher queries.",
      },
    ],
  },
  {
    info: { id: "m2" },
    parts: [
      {
        type: "text",
        text: "Compaction should persist one idempotent snapshot before context collapse.",
      },
    ],
  },
  {
    info: { id: "m3" },
    parts: [
      {
        type: "text",
        text: "Working tier should prioritize current tasks and decisions.",
      },
    ],
  },
];

async function run() {
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  process.env.MEMORY_GRAPH_MODE = "local";
  process.env.MEMORY_GRAPH_PATH = root;
  process.env.MEMORY_EMBEDDINGS = "off";

  const ctx = {
    directory: "e2e-project",
    client: {
      session: {
        messages: async () => ({ data: messages }),
      },
    },
  } as const;

  const plugin = await MemoryPlugin(ctx as never);
  const p = plugin as any;

  const boot = !!p.tool?.memory_search && !!p.tool?.memory_get;
  if (!boot) {
    throw new Error("plugin tools were not registered");
  }

  const chatInput = { sessionID: "s-e2e", messageID: "m-chat-1" };
  const chatOutput = {
    parts: [
      {
        type: "text",
        text: "Architecture decision: use FalkorDB for local-remote parity and graph-first memory retrieval.",
      },
    ],
  };
  await p["chat.message"](chatInput, chatOutput);

  const systemOutput = { system: [] as string[] };
  await p["experimental.chat.system.transform"]({}, systemOutput);

  const searchRaw = await p.tool.memory_search.execute(
    {
      query: "FalkorDB decision parity",
      scope: "project",
      limit: 5,
    },
    {},
  );
  const search = JSON.parse(searchRaw) as {
    results?: Array<{ uuid: string; name: string }>;
  };
  const top = search.results?.[0];
  if (!top?.uuid) {
    throw new Error("memory_search returned no results in dry run");
  }

  const getRaw = await p.tool.memory_get.execute({ uuid: top.uuid }, {});
  const detail = JSON.parse(getRaw) as { found?: boolean };

  const compactOutputA = { context: [] as string[] };
  await p["experimental.session.compacting"](
    { sessionID: "s-e2e" },
    compactOutputA,
  );
  const compactOutputB = { context: [] as string[] };
  await p["experimental.session.compacting"](
    { sessionID: "s-e2e" },
    compactOutputB,
  );

  await p["tool.execute.after"]({}, {});

  let securityGate = false;
  try {
    await merge(
      {} as never,
      {
        entities: [
          {
            action: "create",
            name: "global-test",
            label_type: "Concept",
            summary: "should fail without trusted_global",
            scope: "global",
          },
        ],
        relationships: [],
      },
      {
        scope: "global",
        project_id: "e2e-project",
        packs: ["coding"],
      },
    );
  } catch (error) {
    securityGate =
      error instanceof Error &&
      error.message === "global writes require trusted_global=true";
  }

  if ((search.results ?? []).length === 0) {
    throw new Error("search did not return results");
  }
  if (!detail.found) {
    throw new Error("memory_get did not return entity details");
  }
  if (compactOutputA.context.length === 0) {
    throw new Error("compaction hook did not append context note");
  }
  if (compactOutputB.context.length !== 0) {
    throw new Error("compaction cooldown policy did not suppress repeat run");
  }
  if (!securityGate) {
    throw new Error("global trust security gate did not trigger");
  }

  console.log(
    JSON.stringify(
      {
        AC_01_Boot: "PASS",
        AC_03_WritePath: "PASS",
        AC_04_SearchPath: "PASS",
        AC_05_GetPath: "PASS",
        AC_07_CompactionHook: "PASS",
        AC_07_CooldownPolicy: "PASS",
        AC_08_SecurityGate: "PASS",
        hook_context_note: compactOutputA.context[0] ?? "",
        idempotency_validation: "covered by src/plugin/compaction.test.ts",
      },
      null,
      2,
    ),
  );
}

run()
  .then(async () => {
    await rm(root, { recursive: true, force: true });
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await rm(root, { recursive: true, force: true });
    process.exit(1);
  });
