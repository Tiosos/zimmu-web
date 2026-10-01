# Output reconciliation — implementation notes

2026-10-01: Design approved in brainstorming. Answers that shaped it: compare Zimmu's own two outputs;
compare declared facts (not measured, not rendered text); report and record, never block; a pure
comparison over the built outputs.

- Rejected: comparing against an imported external pair (needs an unspecified import format).
- Rejected: measuring size off the drawn outline (more complex, ties the check to view geometry, mitred
  and notched boards); can be added later without changing the fact model.
- Rejected: renderer parity by reading rendered text (the Stage 0 note says not to compare rendered text).
- Rejected: folding reconciliation into the readiness model as more findings. Readiness takes only a
  scene; reconciliation needs built sheets.
- Rejected: golden tests only — not a gate and cannot run on a real project.
- Deferred: blocking exports (the release stage owns the gate), cover/assembly/installation sheet
  facts, hardware and operations reconciliation.
- Background: the PDF part-sheet notes gap found during edge banding (PDF never printed
  `manufacturingNotes`) is the bug class this check exists to catch, but it is a renderer omission and
  this check compares declared facts, so it would not have caught that gap. Renderer parity stays a
  separate, later question.
- Order agreed with the user: wall elevations (done), edge banding (done), this.
