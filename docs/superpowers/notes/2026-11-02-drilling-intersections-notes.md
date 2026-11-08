# Drilling intersection checks — notes

Design: `docs/superpowers/specs/2026-11-01-drilling-intersections-design.md`
Plan: `docs/superpowers/plans/2026-11-02-drilling-intersections.md`

## What changed

Stage 1 replaced the `unassessed` line **"Drilling intersections with other cuts"** with a real
check on boards. `src/scene/drillingChecks.ts` still validates each cut on its own; it now also
calls `drillingIntersections()` in `src/scene/drillingIntersections.ts`, which builds nominal
part-local volumes from the manufacturing records and classifies every hole against every other
cut. Nothing downstream changed shape: `manufacturingChecks()`, the machining schedule and the
release review all consume the findings through the existing path, so `M<n>` references stay
positional and deterministic.

Stage 2 extends the same module to `cylinder` parts: axial and transverse bores, notches, and the
square-end finished extent. The board loop is untouched — the function branches on `part.kind` and
the round-stock pass has its own predicates. "Drilling intersections with round stock" then leaves
`unassessed`, and the machining schedule's remaining gap is narrowed to
"Interactions between cuts other than drilling".

Three codes join `DrillingCheckCode`:

| Code                      | Severity | Meaning                                                                                                   |
| ------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `drilling-intersection`   | blocking | the hole's removed volume runs into another cut, or two adjacent holes in one row merge into a slot       |
| `drilling-redundant`      | blocking | a cut removes the hole entirely, so no hole would remain                                                  |
| `drilling-overlap-review` | advisory | the hole repeats another drill at the same position and diameter (same face, or opposite faces that meet) |

`drilling-overlap-review` is the only new code with special treatment in
`buildProductionReview()`: it lands in `advisory` rather than `needs-correction`, and the review
policy sentence now names "repeated or meeting drilling".

`MIN_CUT_SIZE_MM` moved to `src/geom/cutLimits.ts` so the check and the OCCT exporter agree on
which box cuts exist: a box thinner than 0.1 mm in any direction is not manufactured, so it is not
an obstacle either.

## Why it is answered by arithmetic, not by scanning

A `hole-array` is a lattice: hole `k` sits at `start + k * pitch`. Every predicate the design uses
is monotone in `k` for one row against one obstacle (distance to a convex rectangle, to a parallel
row, or inside an expanded window), so the affected indices are found by bisection on the interval
edges. No code path allocates or iterates in proportion to `count`; a row of 1 000 000 000 holes is
answered in constant time, and two such rows against each other are answered by a candidate window
whose width is `(2·(r1+r2)/pitch) + 2`.

## Known limits

These are deliberate, and each is either named in `unassessed` or recorded here:

- **A row clipped on both sides of a voided middle** produces three findings for the pair — one
  `drilling-redundant` run and two `drilling-intersection` runs — because a verdict is emitted per
  contiguous run. No hole is ever reported twice.
- **The 512-candidate cap.** Windows wider than 512 holes are reported as one conservative run
  instead of per-hole. It over-reports (a block where a hole may be clear) and never misses; real
  cabinet drilling stays far below it.
- **Parallel rows do not falsely claim a hole in a gap** when the window is exact: every candidate
  pair is classified, so a gap hole is allowed. The exception is the 512-candidate cap, which
  reports the whole window as one blocking run; it is conservative in the blocking direction.
- **Skew transverse pairs on round stock** use the minimum distance between the two finite axis
  segments. It cannot miss an intersection, but it can report a near miss at the capped ends; the
  design accepts that for a review-facing safety check.
- **Bevelled edges** (mitre, angled end cuts) are unassessed: a square end cut moves the datum, but
  an angled one is neither modelled nor an obstacle.
- **Drilling that breaks into a different part** is unassessed: this module is part-local.
- **Minimum remaining material** (a thin web between two non-intersecting cuts) is unassessed.

## Two rules worth knowing before changing this code

1. **A square end cut is a datum shift, not an obstacle.** On round stock the finished extent
   governs bore depth; a bore that reaches the finished cap is a through bore. Several square cuts
   on one end get the innermost offset.
2. **Two identical blind bores from opposite ends are two features, not a duplicate.** Cabinets
   fix their back panel with edge screws from both sides — 30 mm bores from opposite faces of a
   564 mm board, with half a metre of solid stock between them. The repeat rule therefore requires
   the two bores to touch before calling them a repeat.

## Test coverage

- `src/scene/drillingIntersections.test.ts` — the geometry: hole × box, tangency and tolerance,
  the sub-0.1 mm box, undefined volumes, a billion-hole row, voided holes and split runs, coaxial
  precedence, corner meetings, crossing rows, merged openings, the candidate cap, and the
  opposite-end carve-out. The round-stock block covers the finished extent (trim as datum, empty
  and reversed extents), same-end repeat and stepped pairs, opposite-end meeting and separated
  pairs, axial × transverse, parallel and skew transverse pairs, bore × notch, the stop-short web,
  undefined volumes, and the angled end cut staying unassessed.
- `src/scene/drillingChecks.test.ts` — the wiring: a collision reaches the manufacturing record
  with its operation and targets, and a row that is both out of bounds and intersecting reports
  both, bounds first.
- `src/scene/productionReview.test.ts` — the advisory mapping.
- `src/scene/__fixtures__/machiningProject.ts` — the transverse bore's `depth` drops from 4 to 2,
  leaving the 0.5 mm web the design calls for, so the fixture stays finding-free without weakening
  the check. Nothing asserts the old depth.

The Stage 1 sweep found no stale assertions: the removed `'Drilling intersections with other cuts'`
string appears nowhere in `src`. The Stage 2 sweep found two once round stock left the list:
`drillingChecks.test.ts` named the removed string, and `buildReadinessPdf.test.ts` expected it in
the exported PDF text. Both now name the still-unassessed bevelled-edges item, and the
manufacturing assertion also pins the round-stock item's absence. `ManufacturingReadiness.test.tsx`
reads its count from live data rather than a literal, so no header or count needed changing.

Full suite on this host: 249 files, 4484 passed, 10 skipped
(`pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts`).
