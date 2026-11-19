# Minimum remaining material (stage 2) — delivery notes

Date: 2026-11-14
Design: `docs/superpowers/specs/2026-11-14-minimum-remaining-material-design.md`
Plan: `docs/superpowers/plans/2026-11-14-minimum-remaining-material.md`

## Progress log

### Task 0 — Baseline

Baseline: 251 files, 4527 passed, 10 skipped.

### Task 1 — Shared drill geometry

`src/scene/drillGeometry.ts` now owns `RowDrill`, `rowDrillOf`, the bisection helpers,
`candidateRange`, `maxExactCandidates` and `segmentDistance`, moved verbatim out of
`drillingIntersections.ts`. Two changes: `rowDrillOf` returns `RowDrill | null` for a row that
cannot describe a lattice, and `holeSegment(drill, k)` states a hole's finite centreline once.
`candidateRange` gained a `margin` parameter, defaulting to 0 so the intersection pass is unchanged.
Commit: `refactor: share the drill geometry`.
