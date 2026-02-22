# Local Matrix Confidence Notes

Date: 2026-02-22

## Context

This note captures local confidence evidence for `sample-memory-graph-local` using foundational model matrix runs.

Models:

- `anthropic/claude-opus-4-6`
- `openai/gpt-5.3-codex`
- `google/gemini-3.1-pro-preview`

## Root-cause fix before confidence batch

- `scripts/smoke-local-opencode.ts` cleanup scope corrected.
- Previous behavior removed `sample/.local` entirely, which deleted matrix report history.
- New behavior removes only `.local/memory`, preserving report artifacts needed for trend tracking.

## Full-run confidence window (recent)

Reports:

- `1771776070705-48d175` => `PASS` (warnings: 0, blocking: 0, policy advisory: 0)
- `1771776256830-eaf1f5` => `PASS_WITH_WARNINGS` (warnings: 1, blocking: 0, policy advisory: 1)
- `1771776427916-8dd6c0` => `PASS` (warnings: 0, blocking: 0, policy advisory: 0)

Observed transient:

- Single warning on `S7` for Claude (sanitization evidence miss).
- No blocking required-scenario failures in this window.

## Focused S7 rerun (Claude)

Command pattern:

- repeated `opencode run` with `memory_search` sanitization probe in local mode

Result:

- 10/10 PASS
- 0/10 FAIL

Interpretation:

- transient warning is likely non-systemic model-output variability, not persistent plugin/runtime defect.

## Promotion decision (current)

Waves 1, 2, and 3 are accepted for delivery with monitoring.

Decision basis:

- no blocking required-scenario failures in decision windows
- prompt-guidance hardening removed deterministic Claude S1 regressions
- remaining misses are intermittent single-model warnings (primarily Claude S7/P6)

Latest ledger snapshot (full mode):

- runs: 15
- pass: 5
- pass_with_warnings: 10
- fail: 0
- blocking_runs: 0
- wave1_fail_total: 11
- wave2_fail_total: 3
- wave3_fail_total: 0

Operational posture:

- continue shipping under current block policy (2+ models same required scenario)
- keep single-model policy misses as visible warnings and triage items

## Ledger artifacts

Generated with:

```bash
cd plugins/opencode-memory-graph
bun run smoke:local:wave-ledger -- --sample-dir ../../samples/sample-memory-graph-local --mode full --limit 20
```

Outputs:

- `samples/sample-memory-graph-local/.local/matrix-reports/wave-ledger-latest.md`
- `samples/sample-memory-graph-local/.local/matrix-reports/wave-ledger-latest.json`
