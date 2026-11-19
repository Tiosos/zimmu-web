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

### Task 2 — Threshold and box × box webs

Added `MIN_REMAINING_WEB_MM = 3.0` to `src/geom/cutLimits.ts` and a new `src/scene/cutWebs.ts`
that reports the solid material left between two box cuts on a board. Each axis contributes its
gap (zero where the intervals overlap); the three compose as a Euclidean distance. A pair is
reported only when its web is greater than the geometry `tolerance` (a closer pair is a meeting,
already owned by the overlap passes) and less than the 3 mm minimum. The value is truncated to two
decimals so a 2.999 mm web never reads as "3.00 mm … thinner than the 3.00 mm minimum". Findings
anchor on the earlier cut, walked in (i, j) order, and are advisory only. Bevelled edges stay
unassessed; boxes with non-finite geometry or at or below the exporter minimum are left to the
geometry review. Eleven tests cover the gates, truncation, ordering and provenance; all five
planned mutations (rounding, both gates, single-axis distance, later-cut anchor) were caught.
Baseline after merge: 254 files, 4553 passed, 10 skipped.
Commit: `feat: review the web between two box cuts`.
