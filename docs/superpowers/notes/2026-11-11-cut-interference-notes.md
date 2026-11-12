# Cut interference checks — notes

Design: `docs/superpowers/specs/2026-11-11-cut-interference-design.md`
Plan: `docs/superpowers/plans/2026-11-11-cut-interference.md`

## What changed

`src/scene/cutVolumes.ts` is the one statement of what a box cut removes; `boxVolumeOf` moved
there from `drillingIntersections.ts`, and both passes now import it. `src/scene/cutIntersections.ts`
compares every pair of box cuts on a board and reports two new advisory codes:

| Code                      | Severity | Meaning                                                              |
| ------------------------- | -------- | -------------------------------------------------------------------- |
| `cut-intersection-review` | advisory | two boxes share removed material                                     |
| `cut-redundant-review`    | advisory | one box lies wholly inside another, or repeats it at the same volume |

`manufacturingChecks()` appends these after the drilling findings for the same part, so `M<n>`
references stay positional. `productionReview` classifies both as advisory and the policy sentence
names "overlapping or redundant cuts". No schema version changes.

## Why advisory, not blocking

The generator can run one housing into another when a housing joint method is selected: a back-panel
groove into the bottom housing, a shelf housing into the toe-kick notch, two joint housings into each
other at a corner. `sourceJointId` says which joint emitted a cut, not whether the meeting was
intended, so a blocking verdict would fail ordinary cabinets. The precedent is
`drilling-overlap-review`.

The probe behind that decision: the default `butt-screw` catalogue emits 6 box cuts and 0 overlaps;
`dado-rabbet` emits 44 overlapping pairs across 52 boxes; `finger` 44 across 168. Advisory is
therefore essential for housing methods, and the default project stays finding-free.

## Known limits

- Bevelled edges (mitre and angled end cuts) are still unassessed, for box cuts as for drilling.
- Round-stock notch × notch is still unassessed.
- Minimum remaining material between cuts is stage 2; it is still named in the list.
- A cluster of three mutually overlapping boxes produces three findings, one per pair.
- A box with non-finite geometry is skipped; no per-cut box validity check exists, so the gap is
  named as `'Non-finite box cut geometry'` in the manufacturing unassessed list.

## Test coverage

- `src/scene/cutVolumes.test.ts` — the volume, the exporter minimum, non-finite geometry.
- `src/scene/drillingIntersections.test.ts` — the non-finite-box regression for the shared builder.
- `src/scene/cutIntersections.test.ts` — 21 tests: no-op cases, partial overlap, tolerance, thickness
  separation in both orders, edge and corner contact, through-cuts, containment, identical repeats,
  precedence, clusters, order, the non-finite skip, and the sub-tolerance overhang.
- `src/scene/manufacturingChecks.test.ts` — operation provenance, targets, drilling-before-cut
  ordering, independence from visibility/placement/material rates, the finding-free representative
  fixtures, and the narrowed unassessed list.
- `src/scene/productionReview.test.ts` — both codes advisory, classification sentence.
- `src/scene/machiningSchedule.test.ts` — the narrowed unassessed list and the `depthMode` guard.
- `src/ui/buildReadinessPdf.test.ts` — the new unassessed line in the PDF, and the old line's absence.

## Verification

Full suite on this Windows host, 2026-11-12:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts
```

**251 files, 4515 passed, 10 skipped.** `pnpm typecheck`, `pnpm lint` and `pnpm check:file-casing`
all exit 0 (file-casing needs `C:\Program Files\Git\cmd` on `PATH`).

Mutation testing — five mutations killed, one plan mutation found to be *equivalent*:

| Mutation                                              | Observed failure                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| tolerance gate `<= tolerance` → `<= 0`                | `1e-7` contact reports a finding                                        |
| containment bounds lose `± tolerance`                 | sub-tolerance overhang becomes an intersection (test added for this)    |
| emit redundancy *and* intersection for a contained pair | contained pair yields two findings                                    |
| attach intersections to the later cut                 | partial-overlap message/identity test fails                             |
| remove both non-finite guards in `boxVolumeOf`        | `cutVolumes` and the drilling regression both fail                      |
| `MIN_CUT_SIZE_MM` → `0`                               | `0.05`/`0.1` boxes stop being absent                                    |

The plan's original "`<=` → `<` on one containment bound" survived because `200 < 200.000001` still
holds — an equivalent mutation, not a gap in the test. It did reveal that no test pinned the
sub-tolerance overhang the epsilon exists to allow, so `cutIntersections.test.ts` gained one case
(20 → 21).

## Behaviour change to record

`boxVolumeOf` now rejects a non-finite position or size, where the local builder in
`drillingIntersections` could treat an infinite-size box as covering everything. That box is no
longer a drilling obstacle, so the old `drilling-redundant` finding for it disappears. The
regression in `drillingIntersections.test.ts` pins this.

## Progress log

### Task 1 — Extract the box-volume builder

**Commit:** `51fe963 refactor: state the box-cut volume once`

Approach: strict red-green-refactor from the plan. The regression test was written before the
extraction, and the pre-fix failure was captured verbatim, because the plan claims a behaviour
change that is otherwise invisible.

1. Created `src/scene/cutVolumes.test.ts` with three tests: the min/max box, the exporter minimum
   (`0, -1, 0.05, 0.1` all absent) and non-finite position/size.
2. Added the regression to `src/scene/drillingIntersections.test.ts` — a hole array plus a box with
   `size.x = Infinity` must produce no finding.
3. Ran `pnpm vitest run src/scene/cutVolumes.test.ts src/scene/drillingIntersections.test.ts`.
   Expected and observed failure: `cutVolumes.ts` missing, and the regression returned
   `drilling-redundant` with detail
   `holes 1–5 of 5 lie entirely inside cut "Shelf dado" [infinite]; no hole will remain.`
   That is the old behaviour: an infinite-size box covered every hole. It confirms the plan's
   behaviour-change note is real, not theoretical.
4. Created `src/scene/cutVolumes.ts` with `BoxVolume` and `boxVolumeOf`. The builder rejects a
   non-finite position or size before computing `max`, so no `Infinity`/`NaN` can leak into a
   comparison.
5. Re-ran the two suites: `cutVolumes.test.ts` passed (3), the regression still failed — the correct
   intermediate state, because `drillingIntersections` still had its local copy.
6. Replaced the local `boxVolumeOf` in `drillingIntersections.ts` with the shared import, deleted
   `MIN_CUT_SIZE_MM` and the now-unused `BoxCut` type import.
7. Re-ran both suites: **35 passed** (3 in `cutVolumes`, 32 in `drillingIntersections`).
   `pnpm typecheck` exit 0, `pnpm lint` exit 0 — the `BoxCut` import removal was necessary; leaving
   it would have failed `noUnusedLocals` and `@typescript-eslint/no-unused-vars`.

**Decisions recorded**

- `min: box.position` is returned by reference, matching the old local builder. Both callers treat
  the volume as read-only; no copy is added.
- The shared builder is strictly narrower than the old one: it also rejects a non-finite *position*,
  which the old builder passed through. That was already broken geometry; making it absent is the
  intended behaviour change recorded above.
- `MIN_CUT_SIZE_MM` is still the only threshold; no second cutoff was introduced.

**Deviation:** this notes file was created during Task 1 at the user's request ("do the record"),
where the plan has Task 9 create it. Task 9 becomes "update the notes" and still owns the final
template sections (What changed / Why advisory / Known limits / Test coverage / Verification).

### Task 2 — Move the operation reference to the manufacturing record

**Commit:** `fbdaf13 refactor: share the manufacturing operation reference`

Type-only move, no runtime shape change.

1. Added `ManufacturingOperationReference` to `manufacturingPart.ts`, immediately after
   `ManufacturingContext`, with `kind: CutDef['kind'] | DowelCut['kind']` — wider than the drilling
   version's `DrillingCut['kind']`, so a box cut can be the subject of a finding.
2. `drillingChecks.ts` now imports the type and re-exports it:
   `import type { ManufacturingOperationReference, ManufacturingPart } from './manufacturingPart'`
   plus `export type { ManufacturingOperationReference } from './manufacturingPart'`. The local
   interface is gone. `DrillingCut` is still imported and still used by the internal `add` helper.
3. `manufacturingChecks.ts` imports the type directly from `manufacturingPart` and keeps
   `drillingChecks` for the function and `DrillingCheckCode` only.

**Verification:** `pnpm typecheck` exit 0; `pnpm lint` exit 0;
`pnpm vitest run src/scene/drillingChecks.test.ts src/scene/manufacturingChecks.test.ts` → 2 files,
**48 passed**.

**Decision:** `drillingChecks.ts` keeps the re-export even though `manufacturingChecks` no longer
needs it, because `productionReview` and existing tests import the type from the drilling module.
Removing the re-export would be a wider, unnecessary break in this task.

**Check:** the widened `kind` is a superset of the old one, so every existing assignment stays
valid; no cast was needed anywhere.

### Task 3 — Create the cut-intersection module with its no-op cases

**Commit:** `bd4f1cd feat: add the cut-intersection seam`

1. Created `src/scene/cutIntersections.test.ts` with the shared `boardOf` / `box` / `hole` helpers
   (same shapes as the drilling tests) and four no-op cases: only a hole array, a single box,
   box × drilling (the drilling pass owns it), and round stock.
2. Ran `pnpm vitest run src/scene/cutIntersections.test.ts` → 1 file failed, no tests:
   `Failed to resolve import "./cutIntersections" from "src/scene/cutIntersections.test.ts"`.
3. Created `src/scene/cutIntersections.ts` with the module comment, `CutIntersectionCode`,
   `CutIntersectionIssue`, and `cutIntersections` returning `[]` (and `[]` immediately for
   non-boards).
4. Re-ran: 1 file, **4 passed**. `pnpm typecheck` exit 0; `pnpm lint` exit 0.

**Decision:** the round-stock test passes the `ManufacturingRoundStock` record directly, not a
`ManufacturingBoard` cast. The early `part.kind !== 'board'` guard is the behaviour under test, so
the test deliberately exercises the union.

**Note:** `cutIntersections` takes the finished `ManufacturingPart`, so no React, clock or world
transform can reach it. The module has no import from `drillingChecks`, which keeps the schedule
coupling impossible to reintroduce by accident.

### Task 4 — Report shared box volume

**Commit:** `50ac8af feat: report overlapping box cuts`

1. Appended 10 test cases to `cutIntersections.test.ts`: partial overlap with the full message and
   operation, a three-case `it.each` tolerance table (`0` and `1e-7` silent, `1e-3` reported),
   thickness separation in both input orders, an edge-touch pair, a corner-touch pair, two
   full-thickness crossing boxes, a three-box cluster, and the non-finite skip.
2. Red run: **14 tests, 5 failed, 9 passed**. The five failures were exactly the predicted ones —
   the partial overlap, the `1e-3` tolerance case, the crossing pair, the cluster and the
   non-finite skip. The silent cases already passed because the previous module returned `[]`.
3. Implemented `sharedExtent` (axis overlap = `min(max) - max(min)`), `operationOf`,
   `intersectionIssue`, and the `i < j` pair loop. A pair is skipped if **any** axis extent is
   `<= 1e-6`.
4. Green: **14 passed**. `pnpm typecheck` exit 0, `pnpm lint` exit 0.

**Geometry checks recorded**

- Edge versus corner: the edge pair shares `z` (`z = 12`, same thickness) while the corner pair
  differs in `z` (`12` vs `18`), so the corner case leaves no shared extent at all. The earlier
  design draft had these conflated; the split is now explicit.
- Thickness separation is tested in both input orders because attachment follows input order; a
  one-order test would not catch an ordering bug in the allowance branch.
- `boxVolumeOf` still filters non-finite boxes before the pair loop, so the skip test proves the
  remaining finite pair is still compared — not merely that the broken box is ignored.
- The message attaches to the earlier cut and names the later one, matching decision 25.

**Kept from the plan:** the tolerance constant is local to this module and equal to the drilling
value. It is not imported from `drillingIntersections`, so the two modules stay independent.

### Task 5 — Report redundant box cuts

**Commit:** `9dab687 feat: report redundant box cuts`

1. Appended six tests: contained-on-the-inner-cut, identical-on-the-later-cut, `1e-7` identical,
   containment ending exactly on the container face, a `1e-3` poke-out (must stay an intersection),
   and a contained pair reported once as a redundancy.
2. Red run: **20 tests, 5 failed, 15 passed**. The five failures were the five containment cases
   reporting `cut-intersection-review`; the poke-out case already passed because it expects an
   intersection.
3. Added `containedBy(outer, inner)` with inclusive bounds at `1e-6`, and `redundantIssue(inner,
   outer, 'inside' | 'repeat')` carrying the two message templates.
4. Replaced the loop tail with the decision-25 order: identical → repeat on the later cut; first
   inside second → redundancy on the first; second inside first → redundancy on the second;
   otherwise an intersection on the earlier cut.
5. Green: **20 passed**. `pnpm typecheck` exit 0, `pnpm lint` exit 0.

**Precedence checks recorded**

- The tolerance gate runs **before** containment, so a pair that touches on any axis is allowed,
  never promoted to a redundancy. That order is what makes edge-touch and a face-flush containment
  different questions.
- `identical` is tested as "each contains the other" rather than by comparing positions and sizes,
  so a `1e-7` size difference is still identical. The `1e-3` poke-out test is the counterpart: it
  proves the inclusive bound is not simply accepting everything.
- A contained pair emits exactly one finding; the "reported once" test guards against emitting both
  a redundancy and an intersection for the same pair.
- Attachment is the inner cut for containment and the later cut for a repeat, so `M<n>` references
  and the operation identity point at the cut that removes nothing.

### Task 6 — Wire the findings into the manufacturing record

**Commit:** `923560e feat: surface cut overlaps in readiness`

1. Added `import { machiningProject } from './__fixtures__/machiningProject'` and four tests:
   - overlapping pair with operation provenance and the board target;
   - cut findings appended after `drilling-intersection` for the same part
     (`['drilling-intersection', 'cut-intersection-review']`);
   - independence from `visible`, world `position.x` and `costPerM2`;
   - both representative fixtures produce no `cut-*` finding.
2. Red run: **19 tests, 2 failed, 17 passed**. Only the two overlap tests failed, which is the
   correct red state — the independence and fixture tests are expected to pass before the wiring.
3. Wired it in:
   ```ts
   for (const issue of drillingChecks(p)) add(issue.code, issue.message, [p], issue.operation)
   for (const issue of cutIntersections(p)) add(issue.code, issue.message, [p], issue.operation)
   ```
   and added `CutIntersectionCode` to `ManufacturingCheckCode`.
4. Green: **19 passed**. Also re-ran `productionReview.test.ts`, `machiningSchedule.test.ts`
   (**20 passed**) to check the widened union did not disturb the existing classification.
   `pnpm typecheck` exit 0, `pnpm lint` exit 0.

**Integration checks recorded**

- The target assertion passes with `cabinetId: null, parentId: null`, confirming the manual-board
  provenance the design assumed.
- The ordering test proves `M<n>` references stay positional: drilling first, cuts second, for the
  same part.
- `sourceJointId` survives on the reference (`joint-shelf`) while `sourceComponentId` stays `null`,
  so the operation identity is the cut's own provenance, not the pair's.
- The fixtures stay finding-free after wiring — the check is live, not inert, and the default
  catalogue still emits no overlapping box pair.

### Task 7 — Classify both codes as advisory

**Commit:** `8b4fd18 feat: classify cut overlaps as advisory`

1. Added the test `treats overlapping and redundant cuts as advisory`: one `cut-size` plus one of
   each new code must give `needsCorrection: 1, advisory: 2`, and the classification sentence must
   contain `overlapping or redundant cuts`.
2. Red run: **9 tests, 1 failed, 8 passed** — both new codes were `needs-correction` and the
   sentence did not name them.
3. Added both codes to the advisory condition and extended the sentence to
   "…repeated or meeting drilling, and overlapping or redundant cuts are advisory."
4. Green: **9 passed**. `pnpm typecheck` exit 0, `pnpm lint` exit 0.

**Checks recorded**

- `cut-size` remains `needs-correction` in the same test, so the mapping is additive and does not
  weaken an existing blocking code.
- A grep for the old sentence fragment found no other assertion depending on the exact wording.
- This is the whole severity decision the design calls out: no policy gate was added, only the
  classification of two codes.

### Task 8 — Narrow the unassessed lists and update the docs

**Commit:** `4e06df3 docs: name the cut interactions that remain unassessed`

1. **Source strings.** `manufacturingChecks.ts` now names
   `'Cut interactions involving bevelled edges or round-stock notches'`,
   `'Drilling that breaks into a different part'`, `'Non-finite box cut geometry'`, then the
   unchanged minimum-web, manual-machining, compatibility, hardware and installation lines.
   `machiningSchedule.ts` uses the same combined interaction line, replacing
   `'Interactions between cuts other than drilling'`.
2. **Assertions.** Updated `manufacturingChecks.test.ts` (new line present, non-finite line present,
   old drilling-bevelled line absent), `drillingChecks.test.ts` (combined line present, old absent),
   `buildReadinessPdf.test.ts` (new line rendered, old absent), and `machiningSchedule.test.ts`
   (combined line present, old broad line absent).
3. **`depthMode` guard.** Added
   `keeps a colliding but valid bore depth mode when cut interference also exists`: a colliding
   `hole-array` plus two overlapping dados must still report `depthMode: 'blind'`. This works because
   `machiningSchedule` excludes `drilling-intersection` from `invalidDrilling`; the cut finding is
   not consulted at all.
4. **Docs.** `README.md` readiness bullet now says overlapping or redundant box cuts are advisory
   and lists the remaining gaps. `docs/production-review.md` advisory list now names repeated or
   meeting drilling and overlapping or redundant cuts.
5. **Verification:**
   `pnpm vitest run src/scene/manufacturingChecks.test.ts src/scene/drillingChecks.test.ts src/scene/machiningSchedule.test.ts src/ui/buildReadinessPdf.test.ts`
   → 4 files, **72 passed**. `pnpm typecheck` exit 0, `pnpm lint` exit 0.
   Follow-up regression check: `buildProductionPacket.test.ts`, `ManufacturingReadiness.test.tsx`
   and `productionReview.test.ts` → 3 files, **38 passed**.

**Recorded decisions**

- The non-finite line sits immediately after the cross-part drilling line, matching the design's
  ordered list. No other unassessed item moved.
- `'Minimum remaining material between cuts'` is deliberately untouched; stage 2 owns it.
- No test asserts the list length, only membership, so adding the eighth item did not require a
  count update in the readiness dialog tests.
- The PDF absence assertion is the important one: it proves the generated document no longer
  advertises a gap that stage 1 now covers (partly), rather than only that new text appears.

### Task 9 — Full verification, notes, invariant and mutations

**Commits:** `test: pin the sub-tolerance containment boundary` and
`docs: record the cut-interference delivery`

1. Full suite with the pinned host command: **251 files, 4514 passed, 10 skipped** before the
   mutation step (baseline was 249 / 4484 / 10; the delta is the 30 new tests).
   `pnpm typecheck`, `pnpm lint` and `pnpm check:file-casing` all exit 0 (Git on `PATH` for the
   last one).
2. Completed the delivery notes: What changed, Why advisory, Known limits, Test coverage,
   Verification and Behaviour change. The progress log below is the per-task record.
3. Added the `CLAUDE.md` invariant immediately after the joint-owned-cut invariant.
4. Mutation testing: five mutations killed. The plan's containment `<=` → `<` mutation was
   **equivalent** (`200 < 200.000001` is still true), so it survived for the right reason. The real
   mutation — removing `± tolerance` from both containment bounds — exposed an unpinned guard: no
   test covered a sub-tolerance overhang. Added
   `treats a sub-tolerance overhang as contained` (both the overhang and underhang directions),
   which the real mutation kills. `cutIntersections.test.ts` is therefore 21 tests, not 20.
5. Re-ran the full suite after the added test: **251 files, 4515 passed, 10 skipped**.
6. Ran `node scripts/update-structure-html.mjs`; it regenerated the trees and reported
   `No RELEASE_TAG set — regenerated trees only, left version/date untouched`.
7. Updated the plan's counts (21 instead of 20), its mutation table (the real mutations, not the
   equivalent one) and its Task 9 step 2 wording (the notes are updated, not created, because they
   were started in Task 1).

**Recorded decision:** the extra test is a genuine coverage fix discovered by mutation testing, not
a relaxed expectation. It is committed separately from the delivery docs so the history shows why it
exists.
