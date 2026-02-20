---
name: agentic-team-delivery
description: Use this when running a multi-agent delivery team with adversarial reviews, phase gates, and a deferred backlog for risky features.
---

## Use this when

- Coordinating a multi-phase engineering plan with multiple reviewers
- Running security, quality, and red-team checks at each milestone
- Enforcing go/no-go gates before moving to the next phase
- Tracking deferred features so scope cuts are not lost

## Team blueprint

- `implementer`: builds current phase scope
- `review-security`: adversarial security reviewer
- `review-quality`: adversarial reliability and testability reviewer
- `review-redteam`: adversarial architecture and sequencing reviewer

Use one implementation owner per phase. Keep reviewers independent.

## Delivery loop per phase

1. Define phase scope and acceptance criteria.
2. Run implementation work only for that phase.
3. Run adversarial reviews (security, quality, red-team).
4. Consolidate findings into:
   - required fixes now
   - deferred items (post-mvp backlog)
5. Update docs for the phase before close (design notes, decisions, risks, and any behavior changes).
6. Re-run phase gate checks.
7. Mark phase complete only if all must-pass checks pass.

## Documentation requirements

- Every completed phase must include a docs update.
- Docs update must cover:
  - what changed
  - why it changed
  - security/reliability caveats
  - test evidence and gate outcome
- For breaking behavior changes (validation strictness, defaults, limits), include migration notes.

## Must-pass gates

- Determinism: repeated replay produces same logical outcome.
- Idempotency: retrying same mutation is a no-op.
- Invariants: temporal and scope invariants are enforced.
- Degraded mode: dependency failures do not corrupt state.
- Observability: metrics and logs are sufficient to debug incidents.

## Phase review cadence

- Mandatory review at end of each phase (`p0` to `p8`)
- Weekly architecture checkpoint during active implementation
- Immediate mini-review after blockers or incidents

## Deferred backlog policy

When scope is cut for mvp, add explicit deferred tasks with IDs.
Do not leave cut features as implicit notes.

Suggested deferred IDs:

- `d1` remote mode hardening
- `d2` proactive warnings rollout
- `d3` lmm delete/supersede with quarantine
- `d4` custom ontology packs
- `d5` hybrid ranking expansion
- `d6` multi-model embedding fallback
- `d7` tier automation and autonomous compaction

## Output contract for reviews

Each reviewer must return:

1. Top risks (ordered)
2. Missing tasks and hidden dependencies
3. Required tests and gates
4. Revised sequencing or scope cuts
5. Go/no-go recommendation
