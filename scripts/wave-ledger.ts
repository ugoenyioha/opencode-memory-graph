#!/usr/bin/env bun

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

type PolicyKey = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7" | "P8"
type PolicySummary = Record<PolicyKey, { pass: number; fail: number; na: number }>

type Report = {
  run_id: string
  mode: string
  verdict: "PASS" | "PASS_WITH_WARNINGS" | "FAIL"
  warning_count: number
  blocking_count: number
  policy_advisory_failure_count: number
  policy_summary: PolicySummary
  perf?: {
    e2e_ms?: { p50?: number; p95?: number }
    memory_search_ms?: { p50?: number; p95?: number }
    memory_get_ms?: { p50?: number; p95?: number }
  }
}

function arg(name: string) {
  const i = process.argv.indexOf(name)
  if (i < 0) return undefined
  return process.argv[i + 1]
}

const sampleDir = arg("--sample-dir")
  ? path.resolve(arg("--sample-dir")!)
  : path.resolve(process.cwd(), "../../samples/sample-memory-graph-local")

const reportDir = path.resolve(sampleDir, ".local", "matrix-reports")
const mode = arg("--mode") ?? "full"
const limit = Number(arg("--limit") ?? "20")
const outBase =
  arg("--out") ?? path.resolve(reportDir, "wave-ledger-latest")

const waveMap: Record<"wave1" | "wave2" | "wave3", PolicyKey[]> = {
  wave1: ["P1", "P2", "P6"],
  wave2: ["P5", "P8"],
  wave3: ["P3", "P4", "P7"],
}

function runOrder(runId: string) {
  const n = Number(runId.split("-")[0] ?? 0)
  return Number.isFinite(n) ? n : 0
}

function waveFailCount(report: Report, keys: PolicyKey[]) {
  return keys.reduce((sum, key) => sum + Number(report.policy_summary?.[key]?.fail ?? 0), 0)
}

async function main() {
  const files = (await readdir(reportDir))
    .filter((f) => f.endsWith(".json") && f !== "wave-ledger-latest.json")
    .map((f) => path.resolve(reportDir, f))

  const reports: Report[] = []
  for (const file of files) {
    const raw = await readFile(file, "utf8")
    const parsed = JSON.parse(raw) as Report
    if (parsed?.mode !== mode) continue
    reports.push(parsed)
  }

  const selected = reports
    .sort((a, b) => runOrder(a.run_id) - runOrder(b.run_id))
    .slice(-Math.max(1, limit))

  if (selected.length === 0) {
    throw new Error(`no reports found in ${reportDir} for mode=${mode}`)
  }

  const counts = {
    runs: selected.length,
    pass: selected.filter((r) => r.verdict === "PASS").length,
    pass_with_warnings: selected.filter((r) => r.verdict === "PASS_WITH_WARNINGS").length,
    fail: selected.filter((r) => r.verdict === "FAIL").length,
    blocking_runs: selected.filter((r) => r.blocking_count > 0).length,
    warnings_total: selected.reduce((sum, r) => sum + r.warning_count, 0),
    policy_advisory_total: selected.reduce((sum, r) => sum + r.policy_advisory_failure_count, 0),
  }

  const wave = {
    wave1_fail_total: selected.reduce((sum, r) => sum + waveFailCount(r, waveMap.wave1), 0),
    wave2_fail_total: selected.reduce((sum, r) => sum + waveFailCount(r, waveMap.wave2), 0),
    wave3_fail_total: selected.reduce((sum, r) => sum + waveFailCount(r, waveMap.wave3), 0),
  }

  const ready = {
    wave1_candidate: counts.blocking_runs === 0 && wave.wave1_fail_total === 0,
    wave2_candidate: counts.blocking_runs === 0 && wave.wave2_fail_total === 0,
    wave3_candidate: counts.blocking_runs === 0 && wave.wave3_fail_total === 0,
  }

  const tableRows = selected.map((r) => {
    const w1 = waveFailCount(r, waveMap.wave1)
    const w2 = waveFailCount(r, waveMap.wave2)
    const w3 = waveFailCount(r, waveMap.wave3)
    return `| ${r.run_id} | ${r.verdict} | ${r.warning_count} | ${r.blocking_count} | ${r.policy_advisory_failure_count} | ${w1} | ${w2} | ${w3} | ${r.perf?.e2e_ms?.p50 ?? 0} | ${r.perf?.e2e_ms?.p95 ?? 0} |`
  })

  const markdown = [
    "# Wave Confidence Ledger",
    "",
    `- report_dir: ${reportDir}`,
    `- mode: ${mode}`,
    `- runs_analyzed: ${counts.runs}`,
    `- pass: ${counts.pass}`,
    `- pass_with_warnings: ${counts.pass_with_warnings}`,
    `- fail: ${counts.fail}`,
    `- blocking_runs: ${counts.blocking_runs}`,
    `- warnings_total: ${counts.warnings_total}`,
    `- policy_advisory_total: ${counts.policy_advisory_total}`,
    `- wave1_fail_total(P1,P2,P6): ${wave.wave1_fail_total}`,
    `- wave2_fail_total(P5,P8): ${wave.wave2_fail_total}`,
    `- wave3_fail_total(P3,P4,P7): ${wave.wave3_fail_total}`,
    `- wave1_candidate: ${ready.wave1_candidate}`,
    `- wave2_candidate: ${ready.wave2_candidate}`,
    `- wave3_candidate: ${ready.wave3_candidate}`,
    "",
    "| run_id | verdict | warnings | blocking | advisory | wave1_fail | wave2_fail | wave3_fail | e2e_p50_ms | e2e_p95_ms |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...tableRows,
    "",
  ].join("\n")

  const json = {
    generated_at: new Date().toISOString(),
    report_dir: reportDir,
    mode,
    window_limit: limit,
    counts,
    wave,
    ready,
    runs: selected,
  }

  await mkdir(path.dirname(outBase), { recursive: true })
  await writeFile(`${outBase}.md`, markdown)
  await writeFile(`${outBase}.json`, JSON.stringify(json, null, 2))

  console.log(`[wave-ledger] markdown=${outBase}.md`)
  console.log(`[wave-ledger] json=${outBase}.json`)
  console.log(markdown)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
