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
  up. Size on the sheet is still the part's own dimensions, not measured. (Corrected below: the cut
  count and the edge facts turned out to come from the same function on both sides, so the check's value
  is coverage, duplicate ids and the grouping key, not orientation, edge or cut count.)
- Cut count: the cutlist prints a summed `Cuts` per merged row, so the row-level sum is compared and
  `qty`/`labels` are checked against members; dowel cut count is unassessed (the dowel list has none).
  These are record-keeping comparisons, not independent ones (see the honesty correction below).
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

## 2026-10-01 — decisions made while planning and building

- `cutCount` is counted from the builder's own cut partition; it equals `p.cuts.length` today, so it is
  not an independent check. Stated, not hidden.
- Finding sides are `left`/`right` rather than drawings/cutlist because the row-level checks compare a
  row against its own members, where neither word fits.
- The panel's drawing location says "sheet N of the checked drawing set". The panel builds its own
  part-sheet list, which is not the deck any exported file contains, so a page number would be a claim
  about a file that does not exist. The packet's location is the real PDF page ("PDF page N");
  `reconcileOutputs` takes a `locate` option, `'pdf-page'` by default and `'checked-set'` from
  `reconcileScene`.
- `NO_LIBRARY` is a module constant: a default `{}` parameter is a new object per render and made the
  `useMemo` recompute every time.
- `compareFindings` (first called `byOrder`) is exported because the order cannot be observed through
  the capped, already-sorted result without a test that restates the comparator.
- Row-level findings use the first member's label: the joined `row.labels` is a printed figure under
  test and names no part. Skipping the row-level `cuts` check when a member has no sheet avoids
  reporting one absent sheet twice. A corrupted sheet cutCount gives two findings (per-part `cutCount`
  and row-level `cuts`) by design; the test excludes the `cuts` echo explicitly.
- Process: several implementers skipped the red phase on first pass, and review found an ordering test
  that did not discriminate (it passed with the tiers removed); it was rewritten against
  `compareFindings`. The mutation run below found four more gaps, each closed with a test.

## Mutation results (Task 7)

Run against the code at HEAD ad49e91; every file was restored from a scratchpad copy and compared with
`cmp` afterwards. "Observed" is what failed; all failures were `AssertionError`s naming the rule.

| # | Mutation | Predicted | Observed | Result |
|---|---|---|---|---|
| 1 | sheet size not canonicalised | agree + size tests | 7 failed (agree, no-sheet, no-edge-context, readiness, packet, scene) | killed |
| 1b | cutlist size not canonicalised (extra) | grain-width test | grain-width test only | killed |
| 2 | skip edge comparison | edgeCode/edgeMaterials tests | those two | killed |
| 3 | edge compared when absent (treated as empty) | no-edge-context test | that test | killed |
| 4 | duplicate: last occurrence wins (drawings and cutlist) | duplicate tests | **none failed** | survived; added "compares the first occurrence of a repeated id, not the last" (a repeat that differs); both sides now killed |
| 5 | ordering reduced to id only | three `compareFindings` tests | the three | killed |
| 5k/5f/5o | each of kind, field, output tier dropped alone | one test each | one each | killed |
| 6 | no 200 cap | cap test | cap test | killed |
| 7 | row-level `qty` dropped | qty test | qty and first-member-label tests | killed |
| 8 | row-level `cuts` dropped | cuts test | cuts test | killed |
| 9 | `passed` when `compared === 0` | unassessed test | that test | killed |
| 10 | sheet cutCount read as 0 | cutCount tests | cutCount, no-echo, packet | killed |
| 11 | merged members not pushed (boards; dowels) | members tests | 20 failed (boards); dowel members test (dowels) | killed |
| 12 | `sheetEdgeOf` drops `.sort()` | a two-material case | **none failed** (the reconciler sorts both sides, so it is equivalent there) | survived; added a drawing test that the sheet's own `edge.materials` is sorted; killed |
| 12b | `groupParts` edge list not sorted (extra) | sorted-list test | that test | killed |
| 13 | packet reconciles rebuilt rows (`groupParts(..., [])`) | equivalence/CSV tests | **none failed** (the fixture is unbanded, so rebuilt rows match) | survived; added a banded-cabinet packet test; killed |
| 14 | board sheet `cutCount` + 1 | "counts the cuts it draws" | that test and 18 others | killed |
| 14b | dowel sheet `cutCount` + 1 (extra) | none predicted | **none failed** | survived; added a dowel sheet test (part id, dimensions, cut count); killed |
| 15 | row `cuts` check without the no-sheet guard | no-echo test | that test | killed |
| 16 | row-level findings labelled with `row.labels` | first-member-label test | one test, but only for `qty`; `cuts` and `labels` individually **survived** | survived; the test now sets qty, labels and cuts together and asserts all three findings name the first member; each killed |
| 17 | `compared` counts every cutlist part | missing-part tests | **none failed** | survived; both missing-part tests now assert `compared` is one fewer; killed (also with `drawings.size`) |

## 2026-10-01 — honesty correction after a second max-level review

The review proved by mutation that the check is sound as a guard on **coverage, duplicate ids and the
`groupParts` grouping key**, and found the earlier wording claimed more. Corrected here, in the spec and
in CLAUDE.md:

- **Orientation** is erased by the canonical sort, so a swapped length and width cannot be seen.
- **Edge code and edge materials** are produced on both sides by `edgesOf` / `edgeCode(isSwapped)` called
  on the same part, so they cannot disagree unless a line is deleted.
- **Cut count**: the sheet's count comes from an exhaustive switch that always equals `p.cuts.length`.
- **Row-level `qty` and `labels`** are incremented in the same branch as `members.push`.
- Dropping `${code}` and the per-edge materials from the grouping key left every reconciliation and
  packet test green; a test with two boards in different edge stock of one thickness now kills it.

None of these is an independent check; each catches only a deleted line. The panel and the packet must
not be read as verifying them.

## Known limitations

- Size on the sheet is the part's own dimensions, not measured off the drawn geometry. Orientation, edge
  derivation and cut count are not independent checks: the check's value is coverage, duplicate ids and
  the grouping key.
- Renderer parity is unchecked: SVG, DXF and PDF each drawing every declared field is not compared, so
  a gap such as the PDF notes would not be caught. A `failed` result does not prove the PDF or CSV bytes.
- A `failed` result means the two builders disagree. The designer cannot clear it by editing the model;
  what the release stage does with it is open.
- `BomModal` keeps its own copy of the library merge; only the packet and `reconcileScene` share
  `effectiveMaterialsOf`.
- The panel checks all parts (as the packet does), while the toolbar drawing deck uses visible parts.
- A row with zero members passes silently. It is unreachable: the grouper only creates a row with a
  member.

## Review findings and open decisions (2026-10-01)

Facts recorded after review; no design decision is made here.

- The production packet's drawing deck omits wall elevations (`rooms = []` is passed), so reconciliation and the packet never see an elevation sheet. The decision is pending with the user.
- Detaching a board drops its rule-derived banding, so the edge field the reconciliation compares for a detached board is only its explicit decisions.
- `cutPartOf` does not shift hole arrays; board cost uses cut area; the part-sheet note wrap can reach the colour swatch; the edge-band grouping key can over-split rows. Detail is in the edge-banding notes.
- Correction: the earlier line saying BomModal keeps its own copy of the library merge is stale. BomModal and App's nest materials now call `effectiveMaterialsOf`, which lives in `src/scene/effectiveMaterials.ts` (moved from `src/ui`).
