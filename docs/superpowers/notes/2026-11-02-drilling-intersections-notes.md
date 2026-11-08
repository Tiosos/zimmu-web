# Drilling intersection checks — Stage 1 notes

Design: `docs/superpowers/specs/2026-11-01-drilling-intersections-design.md`
Plan: `docs/superpowers/plans/2026-11-02-drilling-intersections.md`

## What changed

Stage 1 replaces the `unassessed` line **"Drilling intersections with other cuts"** with a real
check on boards. `src/scene/drillingChecks.ts` still validates each cut on its own; it now also
calls `drillingIntersections()` in `src/scene/drillingIntersections.ts`, which builds nominal
part-local volumes from the manufacturing records and classifies every hole against every other
cut. Nothing downstream changed shape: `manufacturingChecks()`, the machining schedule and the
release review all consume the findings through the existing path, so `M<n>` references stay
positional and deterministic.

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
- **Parallel rows can claim a hole that sits in a gap** between the other row's holes, because the
  spec's rule is to solve the predicate at the ends of the other row's expanded run span. Again
  conservative in the blocking direction, and reachable only when the pitch exceeds the summed
  radii while the rows are nearly concentric.
- **Round-stock bores are still unassessed** — the stage-1 list names
  "Drilling intersections with round stock". Stage 2 adds them.
- **Bevelled edges** (mitre, angled end cuts) are unassessed.
- **Drilling that breaks into a different part** is unassessed: this module is board-local.
- **Minimum remaining material** (a thin web between two non-intersecting cuts) is unassessed.
- **Skew transverse pairs on round stock** will use finite-segment distance, which is conservative
  and can report a near miss at capped ends (Stage 2).

## Two rules worth knowing before changing this code

1. **A square end cut is a datum shift, not an obstacle.** On round stock the finished extent
   governs bore depth; a bore that reaches the finished cap is a through bore. Stage 2 implements
   this.
2. **Two identical blind bores from opposite ends are two features, not a duplicate.** Cabinets
   fix their back panel with edge screws from both sides — 30 mm bores from opposite faces of a
   564 mm board, with half a metre of solid stock between them. The repeat rule therefore requires
   the two bores to touch before calling them a repeat.

## Test coverage

- `src/scene/drillingIntersections.test.ts` — the geometry: hole × box, tangency and tolerance,
  the sub-0.1 mm box, undefined volumes, a billion-hole row, voided holes and split runs, coaxial
  precedence, corner meetings, crossing rows, merged openings, the candidate cap, and the
  opposite-end carve-out.
- `src/scene/drillingChecks.test.ts` — the wiring: a collision reaches the manufacturing record
  with its operation and targets, and a row that is both out of bounds and intersecting reports
  both, bounds first.
- `src/scene/productionReview.test.ts` — the advisory mapping.

Full suite on this host: 249 files, 4471 passed, 10 skipped
(`pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts`).

## Still to come in Stage 2

- Axial and transverse bores, notches and the square-end finished extent on `cylinder` parts.
- Removing "Drilling intersections with round stock" from `unassessed`, and renaming the machining
  schedule's "Interactions between cuts other than board drilling".
- The `machiningProject` fixture's transverse bore drops from `depth: 4` to `depth: 2`, leaving a
  0.5 mm web so the fixture stays finding-free without weakening the check.
