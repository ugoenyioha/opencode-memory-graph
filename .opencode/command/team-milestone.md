---
description: run a milestone with adversarial reviews and hard gates
---

Run a milestone workflow for the roadmap phase in `$ARGUMENTS`.

If no phase is provided, pick the next pending phase from the todo list.

Use the `agentic-team-delivery` skill and execute this sequence:

1. Restate scope for the target phase in one short paragraph.
2. Define must-pass acceptance gates for this phase.
3. Run implementation actions for this phase only.
4. Run three adversarial reviews in parallel:
   - security review
   - quality/reliability review
   - red-team architecture/sequencing review
5. Consolidate findings into:
   - fixes required before phase close
   - deferred backlog additions (`d*` tasks)
6. Update project docs for this phase (what changed, why, risks, migration notes, test evidence).
7. Re-check gates with evidence (tests, outputs, invariants).
8. Mark phase:
   - `completed` if all gates pass
   - `blocked` if any must-pass gate fails
9. Print a concise phase report with:
   - status
   - passed/failed gates
   - open risks
   - updated next phase

Non-negotiables:

- Do not advance to next phase on partial pass.
- Keep risky features as explicit deferred tasks.
- Prefer deterministic and idempotent behavior over feature breadth.
- Do not close a phase without docs updates.
