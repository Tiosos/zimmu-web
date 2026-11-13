# Cut-review follow-ups — delivery notes

Date: 2026-11-13
Design: `docs/superpowers/specs/2026-11-12-cut-review-followups-design.md`
Plan: `docs/superpowers/plans/2026-11-12-cut-review-followups.md`

This file is written task by task as the plan is executed. The delivery sections (What changed,
Why advisory, Known limits, Test coverage, Verification) are added in Task 4, above this log.

## Progress log

### Task 1 — Box geometry validity predicate

**Commits:**

- `3f41dc8 feat: expose box geometry validity`
- `9129ddf refactor: clarify invalid versus absent box geometry`

`boxGeometryIsFinite(box)` is now the one statement of "every position and size component is
finite". `boxVolumeOf` delegates to it before applying the `MIN_CUT_SIZE_MM` exclusion, so the
finiteness rule has a single home and still returns `null` for both an invalid record and a
solid-absent box.

The new test pins the discriminator the whole change depends on: a finite box at `0.05` mm is
**valid geometry** (predicate `true`) even though `boxVolumeOf` returns `null`. TDD evidence: red
with `TypeError: boxGeometryIsFinite is not a function`, then 4/4 green.

**Verification:** `pnpm vitest run src/scene/cutVolumes.test.ts` → 1 file, 4 tests passed. Diff
touches only `src/scene/cutVolumes.ts` and `src/scene/cutVolumes.test.ts`.

**Reviews:**

- Spec compliance: ✅. Verified the five test assertions, delegation, unchanged `boxVolumeOf`
  accept/reject set, and that no symbol beyond `boxGeometryIsFinite` was exported.
- Code quality: approved after one fix. The first version's two comments contradicted each other —
  the predicate called non-finite geometry "invalid… a different thing" while `boxVolumeOf` called
  it "absent for the same reason". `9129ddf` reserves "absent" for the exporter-skip case and
  describes non-finite as an invalid record with no volume returned. Re-review confirmed the fix
  is comment-only and the tests still pass.

**Deviation from the plan:** the delivery notes are started here, in Task 1, rather than created in
Task 4, so each task is recorded as it lands. Task 4 updates this file instead of creating it.
