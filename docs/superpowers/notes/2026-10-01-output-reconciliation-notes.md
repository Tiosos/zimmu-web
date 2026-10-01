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
  `manufacturingNotes`) was a renderer omission. This check reads built outputs' data, so it would not
  have caught that gap. Renderer parity stays a separate, later question.
- Order agreed with the user: wall elevations (done), edge banding (done), this.

## 2026-10-01 — max-level review and revision

A single-pass max-level review (no fan-out) of the first spec found 14 issues; all accepted.

- **Serious:** the first design added a parallel `facts` block on sheets and `members` on rows, filled
  from the same part by the same functions and printed by neither renderer, so apart from a duplicated id
  the check could not fail. Revised: no parallel structure. Each side's own *printed* fields are read
  (sheet `partLabel`/`material`/`color` plus new typed `partId`, `board`, `cutCount`, `edge`; row printed
  columns plus `members`). The sheet's `cutCount` counts the cuts it draws, not `part.cuts.length`, and
  the sheet's `board` is what its views are drawn from, so a divergence between the two builders can show
  up. Size on the sheet is still the part's own dimensions, not measured; discrimination on size is low
  and the check's value is mostly identity, quantity, orientation, edge and cut count.
- Cut count: the cutlist prints a summed `Cuts` per merged row, so the row-level sum is compared and
  `qty`/`labels` are checked against members; dowel cut count is unassessed (the dowel list has none).
- Packet: `buildCsv` regroups internally, so the packet now groups once and serialises via new
  `...FromRows` functions; existing signatures unchanged.
- Panel: scoped and titled as the packet's inputs (all parts); toolbar deck uses visible parts only and
  is not what the panel checks. Shared `effectiveMaterialsOf`; BomModal's copy left alone (duplication
  remains, noted).
- Edges: the cutlist prints only a count code, so materials are compared as sorted lists and edge
  position/band thickness are unassessed. An absent edge context is "not carried".
- Dropped: the "over readiness size limits" claim (those limits are per cabinet and bound regeneration,
  not sheet building) and the facts-less-sheet runtime handling (made impossible by required fields,
  per CLAUDE.md).
- Added: `color` compared; findings located by deck page and cutlist row; inspect via `onInspect`; total
  ordering and duplicate handling; 200-finding cap with truncation fields; more tests.
- Open for the release stage: a `failed` result is a generator defect, which the plan's "designer
  corrects the model" wording does not cover.
