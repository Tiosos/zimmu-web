# Cut interference checks — notes

Design: `docs/superpowers/specs/2026-11-11-cut-interference-design.md`
Plan: `docs/superpowers/plans/2026-11-11-cut-interference.md`

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
