# Minimum remaining material (stage 2) — delivery notes

Date: 2026-11-14
Design: `docs/superpowers/specs/2026-11-14-minimum-remaining-material-design.md`
Plan: `docs/superpowers/plans/2026-11-14-minimum-remaining-material.md`

## What changed

`src/geom/cutLimits.ts` gains `MIN_REMAINING_WEB_MM = 3.0`.

`src/scene/drillGeometry.ts` (new) owns the drill geometry both passes share: `RowDrill`,
`rowDrillOf`, `holeSegment`, the bisection helpers, `candidateRange` (now with a `margin`) and
`segmentDistance`, moved out of `drillingIntersections.ts`. `rowDrillOf` returns `null` for a row
that cannot describe a lattice — a precondition, not a verdict; `drillingChecks` still reports which
one failed.

`src/scene/cutWebs.ts` (new) reports `cut-web-review` for two cuts on one board that leave less than
the threshold between them. `manufacturingChecks` runs it after `cutIntersections`, so `M<n>`
references stay in cut order, and `unassessed` narrows to `'Minimum remaining material on round
stock'` (still seven items). `productionReview` classifies the code advisory and names thin webs in
its policy sentence. No schema or file-format change.

## Why advisory

The model cannot know grain density, fastener length or screw gauge, and legitimate joinery puts
features close together on purpose — a hinge cup beside a door groove, a runner pilot hole beside a
bottom rebate. The finding names both cuts and the measured web so a reviewer can act; promoting it
to `needs-correction` is a one-line change if thin webs reach packets.

## Known limits

- Round stock is unassessed; the unassessed item says so.
- Bevelled edges (mitre and angled end cuts) are skipped entirely.
- A pair whose closest approach is within 1e-6 mm is silent as a *pair*: one touching hole pair
  suppresses the web verdict for the rest of that row pair. Per-hole yielding was rejected because
  it reports two codes for one physical meeting.
- The cylinder-to-capsule substitution under-reports by the end-cap geometry: a capsule contains the
  cylinder, so the distance between two capsules is no greater than the distance between the two
  solids, and the printed web is no thicker than the real one. The error is a fraction of a
  millimetre and always in the conservative direction.
- Box × drilling evaluates the two holes flanking the box, relying on web thickness being monotone
  in the distance from it. A flanking hole that touches the box silences that side; its outward
  neighbour would have to be within the same 3 mm for a web to be missed, which needs a pitch
  smaller than about 6 mm.
- Drilling × drilling is capped at `maxExactCandidates` per window; past the cap the window's first
  pair is reported instead. Real cabinet drilling never reaches it.

## Test coverage

- `drillGeometry.test.ts` — the clipped axial interval (blind, through, negative face), the `null`
  preconditions, `holeSegment` endpoints, and `segmentDistance`'s parallel, skew, perpendicular and
  degenerate branches.
- `cutWebs.test.ts` — box × box (thin, threshold boundary, touching, diagonal, truncation,
  sub-minimum, non-finite), box × drilling (plane, axial, stock clamp, either order, meeting,
  unbuildable row, a touching hole that must not silence its neighbour), drilling × drilling
  (parallel, perpendicular, meeting, a meeting that must silence the whole pair, too far, own row,
  huge row), ordering and operation provenance.
- `manufacturingChecks.test.ts` — `cut-web-review` carries `M1`, the cut operation with joint
  provenance and the board target; the unassessed list narrows.
- `productionReview.test.ts` — the new code is advisory and the policy sentence names it.
- `buildReadinessPdf.test.ts` — the new unassessed wording renders.

## Verification

Full suite on this Windows host, 2026-11-20: **253 files, 4559 passed, 10 skipped.**
`pnpm typecheck`, `pnpm lint` and `pnpm check:file-casing` all exit 0.

Mutation testing:

| Mutation | Observed failure |
| --- | --- |
| round the web instead of truncating | the 2.999 mm display test |
| drop the lower threshold gate | the touching-dados test |
| drop the upper threshold gate | the at-threshold test |
| measure one axis only | the diagonal test |
| anchor on the later cut | the ordering test |
| rebuild the axial interval from `row.depth` | the through-hole stock-clamp test |
| evaluate only the left flank | the far-hole-beyond-a-touching-hole test |
| drop the radius from the plane gap | the box × drilling plane test |
| drop the axial term | the blind-hole-over-groove test |
| compare centrelines, not surfaces | the parallel-rows test |
| skip touching pairs instead of yielding the pair | the meeting-drives-the-minimum test |
| forget the web margin in the window | the perpendicular-rows test |
| enumerate the whole row | the huge-row test (times out) |

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

### Task 2 — Threshold and box × box

`MIN_REMAINING_WEB_MM`; `cutWebs` with box × box, the two gates, the truncating formatter and
anchor ordering. Commit: `feat: review the web between two box cuts`.

### Task 3 — Box × drilling

`holeBoxWeb` composes the axial gap with the in-plane disc-to-rectangle gap; `flankingHoles` answers
a row of any count in two evaluations. Commit: `feat: review the web between a box cut and a
drilling row`.

### Task 4 — Drilling × drilling

`holeHoleWeb` is the segment distance less both radii; `rowRowWeb` windows by `candidateRange` with
the web margin and caps at `maxExactCandidates`. Commit: `feat: review the web between two drilling
rows`.

### Task 5 — Readiness, review and PDF

Code added to `ManufacturingCheckCode`, run after `cutIntersections`, unassessed narrowed, advisory
classification and policy sentence. Commit: `feat: report thin webs in manufacturing readiness`.

### Task 6 — Documentation and verification

README, `docs/production-review.md`, `CLAUDE.md`, these notes, the structure HTML, the full suite
and the mutation table. Commit: `docs: record the minimum remaining material`.
