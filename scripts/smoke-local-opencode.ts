#!/usr/bin/env bun

import { access, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { MemoryPlugin } from "../src/index"
import { merge } from "../src/extraction"
import { sqlite } from "../src/cxdb/sqlite"

type Check = { id: string; pass: boolean; detail: string }

function arg(name: string) {
  const i = process.argv.indexOf(name)
  if (i < 0) return undefined
  return process.argv[i + 1]
}

const mode = process.argv.includes("--embeddings-local") ? "local" : "off"
const sampleDir = arg("--sample-dir")
  ? path.resolve(arg("--sample-dir")!)
  : path.resolve(process.cwd(), "../../samples/sample-memory-graph-local")
const memoryDir = path.resolve(sampleDir, ".local/memory")
const truthlogPath = path.resolve(memoryDir, "truthlog.sqlite")
const clean = !process.argv.includes("--no-clean")

async function exists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function parseSearch(raw: string) {
  return JSON.parse(raw) as {
    query: string
    results: Array<{ uuid: string; name: string; summary: string }>
  }
}

function parseGet(raw: string) {
  return JSON.parse(raw) as {
    found?: boolean
    entity?: { uuid?: string; name?: string }
    relationships?: unknown[]
  }
}

async function run() {
  if (clean) {
    await rm(path.resolve(sampleDir, ".local"), { recursive: true, force: true })
  }
  await mkdir(memoryDir, { recursive: true })

  process.env.MEMORY_GRAPH_MODE = "local"
  process.env.MEMORY_GRAPH_PATH = memoryDir
  process.env.MEMORY_GRAPH_TRUTHLOG = "1"
  process.env.MEMORY_GRAPH_TRUTHLOG_PATH = truthlogPath
  process.env.MEMORY_EMBEDDINGS = mode

  const checks: Check[] = []
  const record = (id: string, pass: boolean, detail: string) => {
    checks.push({ id, pass, detail })
  }

  const mkCtx = (directory: string) =>
    ({
      directory,
      client: {
        session: {
          messages: async () => ({
            data: [
              {
                info: { id: "m1" },
                parts: [
                  {
                    type: "text",
                    text: "We chose FalkorDB because local and remote modes share query semantics.",
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
                    text: "Working tier should prioritize active tasks and decisions.",
                  },
                ],
              },
            ],
          }),
        },
      },
    }) as const

  const projectA = path.resolve(sampleDir)
  const projectB = path.resolve(sampleDir, "..", "sample-memory-graph-local-b")

  const pluginA = (await MemoryPlugin(mkCtx(projectA) as never)) as any
  const pluginB = (await MemoryPlugin(mkCtx(projectB) as never)) as any

  record(
    "AC-01-Boot",
    Boolean(pluginA.tool?.memory_search && pluginA.tool?.memory_get),
    "memory_search and memory_get registered",
  )

  await pluginA["chat.message"](
    { sessionID: "s-a", messageID: "m-a-1" },
    {
      parts: [
        {
          type: "text",
          text: "Alpha decision token: falkordb-local-parity-alpha",
        },
      ],
    },
  )

  await pluginB["chat.message"](
    { sessionID: "s-b", messageID: "m-b-1" },
    {
      parts: [
        {
          type: "text",
          text: "Beta isolation token: memory-graph-beta-only",
        },
      ],
    },
  )

  const queries = [
    "falkordb-local-parity-alpha",
    "message",
    "decision",
  ]
  let search = { query: "", results: [] as Array<{ uuid: string; name: string; summary: string }> }
  for (const query of queries) {
    const raw = await pluginA.tool.memory_search.execute(
      { query, scope: "project", limit: 10 },
      {},
    )
    const parsed = parseSearch(raw)
    if ((parsed.results?.length ?? 0) > 0) {
      search = parsed
      break
    }
    search = parsed
  }
  const top = search.results?.[0]
  record(
    "AC-03-WritePath",
    (search.results?.length ?? 0) > 0,
    `query=${search.query} results=${search.results?.length ?? 0}`,
  )
  record(
    "AC-04-SearchPath",
    Boolean(top?.uuid),
    `top_uuid=${top?.uuid ?? "none"}`,
  )

  if (top?.uuid) {
    const getRaw = await pluginA.tool.memory_get.execute({ uuid: top.uuid }, {})
    const detail = parseGet(getRaw)
    record(
      "AC-05-GetPath",
      Boolean(detail.found && detail.entity?.uuid),
      `found=${Boolean(detail.found)} rels=${detail.relationships?.length ?? 0}`,
    )
  } else {
    record("AC-05-GetPath", false, "skipped: no search result")
  }

  const compactA = { context: [] as string[] }
  const compactB = { context: [] as string[] }
  await pluginA["experimental.session.compacting"]({ sessionID: "s-a" }, compactA)
  await pluginA["experimental.session.compacting"]({ sessionID: "s-a" }, compactB)
  const compactPass = compactA.context.length > 0 && compactB.context.length === 0
  record(
    "AC-07-CompactionIdempotency",
    compactPass,
    `first=${compactA.context.length} second=${compactB.context.length}`,
  )

  let securityGate = false
  try {
    await merge(
      {} as never,
      {
        entities: [
          {
            action: "create",
            name: "global-write-test",
            label_type: "Concept",
            summary: "should be blocked",
            scope: "global",
          },
        ],
        relationships: [],
      },
      { scope: "global", project_id: projectA, packs: ["coding"] },
    )
  } catch (error) {
    securityGate =
      error instanceof Error &&
      error.message === "global writes require trusted_global=true"
  }
  record(
    "AC-08-SecurityGate",
    securityGate,
    securityGate ? "blocked as expected" : "global write unexpectedly allowed",
  )

  const truthlogExists = await exists(truthlogPath)
  const sessionStoreExists = await exists(`${truthlogPath}.sessions.sqlite`)
  let turnCount = 0
  let contextCount = 0
  if (truthlogExists) {
    const log = sqlite(truthlogPath)
    const contexts = log.contexts({ limit: 100_000 })
    contextCount = contexts.length
    turnCount = contexts.reduce((sum, item) => {
      return sum + log.turns(item.context_id, { after: -1, limit: 100_000 }).length
    }, 0)
    log.close()
  }
  const truthPass = truthlogExists && sessionStoreExists && contextCount > 0 && turnCount > 0
  record(
    "AC-09-Truthlog",
    truthPass,
    `truthlog=${truthlogExists} sessions=${sessionStoreExists} contexts=${contextCount} turns=${turnCount}`,
  )

  const isolationRaw = await pluginA.tool.memory_search.execute(
    { query: "memory-graph-beta-only", scope: "project", limit: 10 },
    {},
  )
  const isolation = parseSearch(isolationRaw)
  const leaked = (isolation.results ?? []).some((item) =>
    `${item.name} ${item.summary}`.includes("memory-graph-beta-only"),
  )
  record(
    "AC-06-ScopeIsolation",
    !leaked,
    leaked
      ? "beta token leaked into project A scope"
      : `project_scoped_results=${isolation.results?.length ?? 0}`,
  )

  await pluginA["tool.execute.after"]({} as never, {} as never)

  const passed = checks.filter((x) => x.pass).length
  const failed = checks.length - passed
  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${check.id} :: ${check.detail}`)
  }
  console.log(`\nSummary: ${passed}/${checks.length} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run()
  .then(() => {
    // falkordblite keeps background handles alive; force clean exit for harness usage.
    process.exit(0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exit(1)
  })
