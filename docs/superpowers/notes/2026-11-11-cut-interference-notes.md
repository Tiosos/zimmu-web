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
