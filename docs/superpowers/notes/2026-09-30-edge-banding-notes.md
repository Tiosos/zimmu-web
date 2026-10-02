# Edge banding — implementation notes

2026-09-30: Design approved in brainstorming. Answers that shaped it: finished size is the model
size; edges derived by role rule with per-edge override; edge stock is a material (`use: 'edge'`);
no band or one material per edge; outputs are cutlist, BOM, nesting and a drawing text line.

- Rejected: stamping resolved edges onto every generated board at regeneration. It duplicates the
  truth (rule and stamped copy can disagree) and adds a field to reconcile.
- Rejected: a material-level default only, and manual-only edges.
- Rejected: a separate edge-band list in the scene. It would duplicate thickness and cost plumbing
  and need its own file-format addition.
- Deferred: shaped edges, per-edge trim allowance, graphical edge marks, a band waste allowance.
  None has a verified machine figure yet.
- `CLAUDE.md` says `FILE_FORMAT_VERSION = 21`; the code is at 23, so this stage takes it to 24.
- Reference fixture codes `1L`, `1S`, `2L2S`, `SHAPED` (`docs/superpowers/fixtures/`): `SHAPED` stays
  a manual note in this stage.
- Order agreed with the user: wall elevations (done), edge banding (this), then drawing-to-cutlist
  reconciliation.

## Refinements decided while planning and building (with reasons)

- Direction to edge by rotating edge normals: no thickness-axis table to hand-maintain; `orientedPanel` maps board axes to carcase axes positively, and a test checks the result against it.
- "Add edge band" form instead of a material form: materials come from presets, migrations, rate popovers and the Sheets tab, so there was no form to carry a flag.
- CSV columns appended after `Total`: existing columns and the subtotal row keep their positions.
- Mitre guard in `edgesOf`: one check covers cutlist, BOM, nest and drawing. A mitred outline is not the rectangle the rules measure.
- Dangling cabinet `edgeMaterial` means no banding, not a file error (face-frame rule: a validation error would hide the cabinet). `edgesOf` therefore takes the materials and requires edge stock; a panel material named as edge stock is also ignored.
- Seventh `buildDrawingSheets` parameter `edgeContext`, also passed by `buildProductionPacket`: the part sheet needs the cabinet and materials to resolve a board's edges.
- `useNest` takes components for the same reason.
- `isSwapped` lives in `src/scene/grain.ts` so the cutlist, the edge code and the part sheet share one orientation rule.
- The spec said SVG, DXF and PDF part title blocks already printed `manufacturingNotes`; PDF did not. Fixed in 631b909: PDF prints them, which also restores hinge/template notes PDF part sheets silently lacked.
- Editor edge labels are x0/x1/y0/y1: the board's own axes, with the cutlist meaning shown beside them.

## Mutation results (Task 8)

Unmutated run green first (154 tests across edgeBanding, buildCsv, edgeBandingFile, nest). Each mutation applied, grepped by exact-once replacement, run, restored from backup.

| # | Mutation | Predicted | Observed | Result |
|---|---|---|---|---|
| 1 | `edgeFacing` wrong sign | direction tests | 7 failures: direction tests, rule/explicit, cutPartOf, two groupParts tests | killed |
| 2 | rule applied to detached board | detached-board test | that test only | killed |
| 3 | explicit `null` ignored (`if (own)`) | explicit-null test | explicit-null test and "does not merge ... edges differ" | killed |
| 4 | mitre guard dropped | mitre test | mitre test | killed |
| 5 | x-edge reduces width | cut-size tests | 8 failures across cut size, cutPartOf, mask, groupParts | killed |
| 6 | one thickness for both edges | "each edge its own thickness" | 7 failures including that test | killed |
| 7 | clamp to 0, drop `problem` | problem tests | 4 failures (one as a `.toMatch(undefined)` TypeError alongside AssertionErrors naming the rule) | killed |
| 8 | `edgeCode` ignores `swapped` | orientation tests | edgeBanding and buildCsv orientation tests | killed |
| 9 | edge pattern + code dropped from group key | merge tests | all 154 passed | survived; test added ("does not merge boards of one cut size and code banded in different materials"); re-run killed |
| 10 | `cutPartOf` does not shift cuts | shift test | shift test | killed |
| 11 | `validateEdgeFacts` accepts any string | rejection test | rejection test | killed |
| 12 | new columns before `Total` (header) | column-order tests | 2 failures | killed |
| 13 | drop `use === 'edge'` | dangling / panel-material tests | 4 failures (edgeBanding x2, buildCsv x2) | killed |
| 14a | drop `code` from group key | orientation/merge tests | survived | equivalent: the code is a function of the edge pattern, orientation and cut size, all still in the key |
| 14b | drop edge pattern from group key | merge tests | survived until the test added for #9 | killed after the test |
| 14c | drop finished size from group key | orientation/merge tests | survived | equivalent: finished size equals cut size plus the thickness of the named edge materials, both in the key |

Mutation 9 survived because every existing "differ" case also changed the cut size. The added test uses two stocks of equal thickness so only the material differs.

## Known limitations

- No band waste allowance.
- `SHAPED` stays a manual note.
- Edge stock is added by name and thickness only; set its rate in the BOM Edge banding table.
- The default role rule is a stated figure awaiting a woodworker's review.
- `edgeNoteOf` for a board with mixed edge materials prints the code and the material list without saying which edge carries which.
- A missing thickness prints `?`.
- `wrapManufacturingNotes` now exists in three renderers (SVG, DXF, PDF); notes wrapped past about 8 lines or 90 characters at tbX+155 can reach the colour swatch.
- Commits 64f6c04 and 631b909 carry unrelated Prettier reformatting hunks in `App.tsx` and `buildPdf.ts`, left as is.
- Edge banding appears in the Boards tab and its CSV only.
- The CLAUDE.md file-format line had stopped at v21 while the code was at 23; fixed with this stage (v22 room geometry, v23 site levels and elevations, v24 edge banding).

## Review findings and open decisions (2026-10-01)

Facts recorded after review; no design decision is made here.

- A banded framed cabinet bands edges the face frame covers, because `edgeRuleOf` states its rule per role and ignores whether the cabinet wears a frame.
- Detaching a board drops its rule-derived banding. Only the user's explicit `edgeBanding` decisions survive on a detached board, so the cutlist cut size for that board changes at the moment it is detached.
- The "Add edge band" action in `CarcasePanel` calls `onAddMaterial`, which is `onUpdateMaterial` in `useScene`, and that pushes an undo entry labelled `Set <name> cost`. Still wrong at the time of this entry; not fixed, because the same callback also serves genuine cost edits and a correct label needs to tell a new material from an existing one, which wants its own test.
- `cutPartOf` shifts a part's through-cuts but not its hole arrays, so the nest mask of a banded part keeps its bores at the finished-size positions.
- Board cost is computed from the cut area, not the finished area.
- The part-sheet manufacturing note wrap (about 8 lines or 90 characters) can still reach the colour swatch, in all three renderers.
- The cutlist grouping key includes the edge pattern per edge, so boards of the same cut size and code banded in different stock are split into separate rows. This can over-split relative to what is sawn.
- The unrelated Prettier hunks in `App.tsx`, `buildPdf.ts` and `mask.test.ts` mentioned under Known limitations were reverted to the base text on 2026-10-02.
