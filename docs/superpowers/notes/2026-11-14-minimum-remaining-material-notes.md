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

### Task 3 — Box × drilling webs

`pairWeb` now takes the board and pairs a box with a hole row. `holeBoxWeb` composes the axial gap
(clipped interval from `rowDrillOf`, never rebuilt from nominal depth) and the in-plane gap
(centre-to-rectangle distance minus the radius) as a Euclidean distance. `flankingHoles` evaluates
only the two holes bracketing the box on the run axis, clamped into the row, so a billion-hole row
costs the same as five; `rowBoxWeb` takes the thinnest web over holes that do not touch, and a
touching neighbour no longer suppresses a farther hole's web. The shared bisection and interval
helpers come from `drillGeometry` — `intervalGap` is imported, not copied. Seven tests bring the
suite to 18; all five planned mutations (nominal-depth rebuild, one flank, no radius, no axial term,
per-pair instead of per-hole skip) were caught. Baseline: 254 files, 4560 passed, 10 skipped.
Commit: `feat: review the web between a box cut and a drilling row`.

### Task 4 — Drilling × drilling webs

`pairWeb` now pairs two hole rows via `rowRowWeb`. `holeHoleWeb` measures the shortest distance
between the two holes' clipped centrelines less the summed radii; treating flat-ended cylinders as
capsules can only overstate the web slightly, never miss one. `rowRowWeb` bounds each row to a
geometry-derived candidate window expanded by MIN_REMAINING_WEB_MM — never by `count` — and falls
back to the window's first pair past `maxExactCandidates`, so a billion-hole row answers by
arithmetic. Touching candidate pairs are measured too: any touch drives the minimum to 0 and yields
the whole row pair to the drilling pass, since webs beside a crossing are a pitch artefact. The hole
× hole branch sits before the box × drilling extraction in `pairWeb`, where a tail branch would be
unreachable. Seven tests bring the suite to 25; all four planned mutations (surfaces vs centrelines,
missing margin, per-hole instead of per-pair skip, full enumeration) were caught — the enumeration
mutation needed both the window and the cap removed to be observable, confirming each guard is
necessary. Baseline: 254 files, 4567 passed, 10 skipped.
Commit: `feat: review the web between two drilling rows`.
