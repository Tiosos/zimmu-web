# Drilling intersection checks

**Date:** 2026-11-01
**Status:** Proposed — behaviour selected by the user on 2026-11-01, then checked by an independent
builder pass that raised six ambiguities; those are resolved in "Resolved calls". Implementation
waits for approval of this document.
**Related:** `src/scene/drillingChecks.ts`, `src/scene/manufacturingChecks.ts`,
`src/scene/machiningSchedule.ts`, `src/scene/productionReview.ts`

## Why

Two readiness documents currently admit the gap in their own `unassessed` lists:

- `manufacturingChecks()` — `'Drilling intersections with other cuts'`
- `buildMachiningSchedule()` — `'Interactions between cuts'`

`drillingChecks()` validates each drilling operation in isolation: size, array parameters, entry
face, and the opening's fit inside the stock face. It says so in a comment ("not a simulation of
intersecting cuts"). Nothing detects a shelf-pin hole landing in a shelf dado, a hinge cup breaking
into a groove, two bores meeting inside a rail, or a hole drilled entirely inside a cut-out.

The result is a production packet that can be released with a hole that will not exist, an opening
that is not circular, or a joint wall that has been breached. The readiness report does list the
gap, but only as one unassessed line among several, and it does not identify the part, cut or hole.

The people affected are the designer/draftsperson issuing the release and the operator reading the
readiness PDF. The first needs a correction before release; the second needs the part and the
operation, not a generic warning.

## What this check is, and is not

It is a **nominal part-local geometric consistency check** between drilling operations and other
material removals on the same part. It answers one question: do these two cutting volumes both claim
the same material?

It is not: a tool-path simulation, a machine-capability check, a tear-out or clamping analysis, an
order-of-operations check, or a cross-part (assembly) check. Those stay unassessed and are named in
the lists below.

## Behaviour (the decisions)

"Block" means `needs-correction`, which `PRODUCTION_RELEASE_POLICY` maps to block-release.
"Review" means `advisory`, which needs review but does not block. "Allow" means no finding.
"Unassessed" means the gap is named in the global `unassessed` list, not reported per hole.

### Board drilling × board drilling

| # | Situation | Verdict | Code |
|---|---|---|---|
| 1 | Adjacent holes in one row overlap (`pitch < diameter`) | Block | `drilling-intersection` |
| 2 | One row with `pitch = 0` and `count > 1` | unchanged: `drilling-array` | — |
| 3 | Two drills coaxial, same centre/diameter/depth (a repeat definition) | Review | `drilling-overlap-review` |
| 4 | Two drills coaxial, different diameter or depth (counterbore/stepped hole) | Allow | — |
| 5 | Two rows cross at a shared hole position; identical drills | Review | `drilling-overlap-review` |
| 6 | Two drills same face, non-concentric partial overlap | Block | `drilling-intersection` |
| 7 | Blind holes from opposite faces whose depths meet or overlap (`d1 + d2 ≥ T`) | Block | `drilling-intersection` |
| 8 | Holes from adjacent faces intersect at a corner | Block | `drilling-intersection` |
| 9 | Holes do not intersect but leave a thin web of material | Allow (not checked; named in unassessed) | — |

Rows 3–5 are one behaviour: a coaxial repeat is reviewed, a stepped coaxial pair is allowed. A
crossing row pair is judged per shared position by the same rule.

### Board drilling × box cut (dado, groove, notch, pocket, slot)

| # | Situation | Verdict | Code |
|---|---|---|---|
| 10 | The whole drill volume lies inside the cut's void | Block | `drilling-redundant` |
| 11 | The opening crosses the cut boundary (opening is not circular) | Block | `drilling-intersection` |
| 12 | The drill wall breaks into the cut's side wall | Block | `drilling-intersection` |
| 13 | The drill crosses a through-slot and is split into two segments | Block | `drilling-intersection` |
| 14 | The entry face is removed locally by a pocket (drill starts in air) | Block | `drilling-intersection` |
| 15 | Tangent contact only, or overlap within the tolerance | Allow | — |
| 16 | Drill and cut do not intersect but leave a thin web | Allow (not checked; named in unassessed) | — |

Row 14 is not caught by `drilling-position`: the entry coordinate still sits on the nominal stock
face, but the face no longer exists there.

### Drilling × bevel

| # | Situation | Verdict |
|---|---|---|
| 17 | Hole opening in a mitre's removed wedge | Unassessed |
| 18 | Hole wall through the mitre plane | Unassessed |

An angled end cut on round stock (row 25) is the same shape of problem and is deferred the same
way.

### Round stock

| # | Situation | Verdict | Code |
|---|---|---|---|
| 19 | Same-end axial bores, identical | Review | `drilling-overlap-review` |
| 20 | Same-end axial bores, stepped (different diameter/depth) | Allow | — |
| 21 | Axial bores from opposite ends meet or overlap inside the stock | Review | `drilling-overlap-review` |
| 22 | Axial bore × transverse bore | Block | `drilling-intersection` |
| 23 | Two transverse bores intersect (same position, different azimuths, or overlapping volumes) | Block | `drilling-intersection` |
| 24 | Bore × notch | Block | `drilling-intersection` |
| 25 | Bore × angled end cut | Unassessed | — |

Square end cuts (`end`, `angle = 0`) are **not obstacles**: they shorten the stock and move the
datum of a bore drilled from that end. See "Resolved calls — a square end cut moves the datum".

### Not assessable from the recorded geometry

| # | Situation | Verdict |
|---|---|---|
| 26 | Drill × `manual-machining` instruction (text only) | Unassessed |
| 27 | Drill that leaves this part and enters another part | Unassessed |
| 28 | Box cut × box cut | Out of scope (its own change) |

### Reporting and implementation choices

| # | Question | Decision |
|---|---|---|
| 29 | Granularity | One finding per drilling operation and other cut, splitting a partly voided row into a redundant run and a clipped run. A row that collides in several holes is still one finding per verdict, with the affected index range in the message. |
| 30 | Huge arrays | Never enumerate `count`. Every query is interval arithmetic; candidate windows are bounded by geometry (radius, pitch), not by the hole count. |
| 31 | Tolerance | `1e-6` mm, the same constant the existing boundary checks use. Contact or overlap no thicker than that is not reported. |
| 32 | Codes | `drilling-intersection` (block), `drilling-redundant` (block), `drilling-overlap-review` (advisory). Three codes, not two — see "Resolved calls". |

## Geometry model

Part-local millimetres, the frame already used by `drillingChecks` and the machining schedule.
Visibility, world placement, grain and rates must not change the answer; the check reads the part's
own records (`cuts`, and the recorded stock dimensions) and nothing else.

**Board** — material is `[0,L] × [0,W] × [0,T]` (x = length, y = width, z = thickness).

**Round stock** — material is the cylinder `r ≤ D/2`, `z ∈ [0,L]`, `L` and `D` the recorded stock
length and diameter.

**Finished extent (round stock only).** Every square end cut (`angle = 0`, `offset > 0`) shortens
the stock. The finished axial extent is `[offsetMinus, L − offsetPlus]`, where `offsetPlus` is the
largest square-end offset on `+Z` and `offsetMinus` the largest on `-Z` (several cuts on one end
are cumulative in effect; the innermost wins). All bore volumes are referenced to the *finished*
caps: a `bore-axial` with `end: '+Z'` starts at `L − offsetPlus`, and one with `end: '-Z'` starts at
`offsetMinus`. A bore whose recorded depth reaches or passes the far finished cap is a through
bore, not a defect. An extent that is empty or reversed is a stock problem the existing checks
cannot express; the pass skips that part's round stock and leaves it to `unassessed`. Angled end
cuts (`angle > 0`) do not move the extent and are not obstacles — they stay unassessed.

**Drill volumes**

- `hole-array`: a straight row of cylinders. Hole `i` has centre
  `start + i * pitch * e_run`, axis along the face normal (inward), radius `diameter/2`, and axial
  extent from the entry plane inward `depth`, clipped to the stock thickness. `depth ≥ T` is a
  through hole, not an error (existing rule).
- `bore-axial` (round stock): axis along z, from the chosen finished cap inward, clipped at the
  finished extent.
- `bore-transverse` (round stock): axis radial inward at `azimuth`, at `position` along z, clipped
  at the stock diameter. This matches `computeTransverseBoreTool` in `src/geom/dowelCut.ts`.

**Other removals**

- `box`: an axis-aligned box `[p, p+s]`. A box with any size `≤ 0.1` mm is not an obstacle: it is
  the same threshold `makeShape` uses to skip such a cut, so the exported solid and the check agree
  on what the part actually contains. Both sides import one constant (see "Integration points").
- `notch` (round stock): a rotated slab — `radial coordinate ≥ R − depth`, over
  `z ∈ [position ± width/2]`, rotated by `azimuth` about +Z. Matches `computeNotchTool`.
- `end` with `angle = 0`: a datum shift, not an obstacle (see "Finished extent").
- `end` with `angle > 0`: a rotated half-space; deferred (unassessed).
- `mitre`: a rotated half-space at the end; deferred (unassessed).
- `manual-machining`: no geometry.

**Predicate** — an intersection exists when the shared removed volume is thicker than the
tolerance:

- Cylinder × axis-aligned box: the axial intervals overlap by more than `eps`, and the
  circle-to-rectangle distance is `< radius - eps` on the cross-section plane. Exact.
- Cylinder × cylinder, parallel axes: axial intervals overlap by more than `eps`, and the centre
  distance is `< r1 + r2 - eps`. Exact.
- Cylinder × cylinder, perpendicular axes (all board pairs, and axial × transverse on round
  stock): solve the two-circle feasibility on the two remaining coordinates. For cylinder A along
  z (centre `ax, ay`; `z ∈ [z0,z1]`; radius `ra`) and B along x (centre `by, bz`;
  `x ∈ [x0,x1]`; radius `rb`), a point exists iff, for some `x ∈ [x0,x1] ∩ [ax−ra, ax+ra]` and
  `z ∈ [z0,z1] ∩ [bz−rb, bz+rb]`,
  `|ay−by| ≤ √(ra² − (x−ax)²) + √(rb² − (z−bz)²)`.
  The right side is maximised at `x = clamp(ax, x0, x1)` and `z = clamp(bz, z0, z1)`. Exact and
  O(1). The same expression applies under axis permutation.
- Cylinder × cylinder, skew axes (transverse × transverse on round stock): the check uses the
  minimum distance between the two finite axis segments, `< r1 + r2 - eps`. This is **conservative**
  — it cannot miss an intersection, but it can report a near miss at the capped ends. That is
  acceptable for a review-facing safety check and is recorded as a known limit.
- Cylinder × rotated slab / half-space: minimise and maximise the rotated coordinate over the
  cylinder. For a cylinder with axis unit vector `a`, base `b`, height `h`, radius `r`, and a
  linear function `n·P`, the range is
  `[min(n·b, n·(b+ha)) − r√(1−(n·a)²), max(n·b, n·(b+ha)) + r√(1−(n·a)²)]`.
  A slab intersects when the ranges overlap by more than `eps`. A notch is the *conjunction* of a
  depth half-space and a width slab, so it intersects only when both ranges overlap; testing each
  separately is conservative for the corner where they meet.
- A drill whose volume is **undefined** — non-finite or non-positive `diameter`/`depth`, a
  non-finite `start`, `pitch` or `position`, or a cut kind the check does not recognise — is not
  intersected. Those are exactly the cases that already produce `drilling-size`,
  `drilling-array`, `drilling-position` (non-finite entry coordinates) or `drilling-unassessed`.
  A drill that is merely out of bounds, or whose entry face is wrong, still has a computable
  nominal volume and **is** intersected: suppressing it would make the reported set depend on an
  unrelated finding and could hide a collision that survives the bounds fix.

**Arrays.** A row is a set of cylinders on a lattice. With one row against a box or a parallel row,
the affected indices are a contiguous interval in the run coordinate, obtained by solving the
predicate at the interval ends (no per-hole scan). With two non-parallel rows, only indices inside
the other row's expanded run window are candidates; that window is `(2·(r1+r2)/pitch)+2` wide, not
the row length. The implementation must never allocate or iterate proportionally to `count`; a
test with `count = 1_000_000_000` pins this.

## Findings

New codes are added to `DrillingCheckCode`:

```ts
| 'drilling-intersection'   // block
| 'drilling-redundant'      // block
| 'drilling-overlap-review' // advisory
```

Messages keep the existing prefix and identity: `Drilling "<label>" [<id>]: …`. Examples:

- `Drilling "Shelf pins 1" [holes_left-section-0-0]: holes 3–7 of 12 intersect cut "Shelf dado" [cut-12]; the opening is broken.`
- `Drilling "Shelf pins 1" [holes_left-section-0-0]: hole 4 of 12 lies entirely inside cut "Handle cut-out" [cut-5]; no hole will remain.`
- `Drilling "Shelf pins 1" [holes_left-section-0-0]: adjacent holes overlap (pitch 20 mm, diameter 5 mm); the openings merge into a continuous slot.`
- `Drilling "Door cup" [cup-1]: hole 1 of 1 repeats drilling "Hinge cup" [cup-2] at the same position and diameter; verify this is intended.`
- `Drilling "Shelf pin row" [pins-1]: hole 2 of 5 meets bore "Cross dowel" [bore-1] inside the stock; verify this is intended.`

Index conventions: 1-based; `hole i of n` for one; `holes i–j of n` for a contiguous run; `hole i
of n and others` when the affected set is not contiguous. A single-hole array omits the `of n`.

### One verdict per hole

A hole can match more than one row of the tables above, and a row can have some holes fully voided
and others only clipped. Classify each hole once, in this order, and emit at most one finding for
any hole, so no hole is reported twice:

**Board drilling × board drilling**

1. Coaxial (same axis line and the same centre on the face) with the same diameter and depth →
   **review** (rows 3 and 5) when both enter from the same face, or from opposite faces and their
   volumes meet. Identical blind bores from opposite ends that leave solid stock between them are
   two separate features → **allow**.
2. Coaxial, same face, different diameter or depth → **allow** — a counterbore or stepped hole
   (row 4).
3. Coaxial, opposite faces, different diameter or depth, volumes overlap → **block** (row 7).
4. Coaxial, opposite faces, different diameter or depth, no overlap → **allow**.
5. Non-coaxial, volumes overlap → **block** (rows 6 and 8).
6. Otherwise → **allow**.

The distinction in rule 1 matters in practice: a back panel is commonly fixed with edge screws
from both ends, so every cabinet would otherwise report its own screw pilots as duplicates.

**Drilling × box cut**

1. A hole whose cylinder lies wholly inside the cut's box → **`drilling-redundant`** (row 10).
2. Otherwise a hole whose cylinder overlaps the box → **`drilling-intersection`** (rows 11–14).
3. Otherwise → **allow**.

A row that is partly voided and partly clipped produces two findings for the same pair — one
`drilling-redundant` for the voided run and one `drilling-intersection` for the clipped run — but
never two for the same hole. `drilling-redundant` is emitted first.

**Round stock**

1. Same-end coaxial `bore-axial` pair, identical → **review** (row 19); different → **allow**
   (row 20).
2. Opposite-end coaxial `bore-axial` pair whose volumes overlap → **review** (row 21).
3. `bore-axial` × `bore-transverse` overlap → **block** (row 22).
4. `bore-transverse` × `bore-transverse` overlap → **block** (row 23).
5. Bore × notch overlap → **block** (row 24).

"Identical" means the same diameter and the same depth; a stepped pair is by definition not
identical, so rules 1 and 2 cannot both apply.

Pair ordering and de-duplication:

- Drills are processed in `part.cuts` order; obstacles in the same order.
- A drill–drill pair is reported once, on the earlier drill.
- A drill's own volume is never compared with itself.
- Each hole produces at most one finding against a given obstacle, and one finding is emitted per
  contiguous run of holes sharing a verdict. A row colliding with three obstacles produces at least
  three findings, one per obstacle; a partly voided, partly clipped row produces two against that
  obstacle, redundant first; a row clipped on both sides of a voided middle produces three, one
  redundant run and two clipped runs.
- Findings are appended after the existing per-cut `drillingChecks` findings for that part, so
  `M<n>` references stay positional and deterministic.

## Severity mapping

`productionReview` currently classifies every manufacturing finding except `label-empty` and
`label-duplicate` as `needs-correction`. Add `drilling-overlap-review` to the advisory condition:

```ts
f.code === 'label-empty' ||
f.code === 'label-duplicate' ||
f.code === 'drilling-overlap-review'
  ? 'advisory'
  : 'needs-correction'
```

Update the policy sentence in the same file (the paragraph that names labels, joinery reminders and
angled insertion as advisory) to include repeated/meeting drilling.

No schema version changes: findings are additive, and the release policy's shape is unchanged.

## Integration points

| File | Change |
|---|---|
| `src/scene/drillingIntersections.ts` (new) | Pure geometry: build drill volumes and obstacle volumes, evaluate the predicates, return findings with code/message/operation id. No React, no clock, no randomness. |
| `src/scene/drillingChecks.ts` | Extend `DrillingCheckCode`; call the new module after per-cut validation; append its issues. Malformed cuts are still rejected before the intersection pass. |
| `src/scene/manufacturingChecks.ts` | Remove `'Drilling intersections with other cuts'` from `unassessed`; add the remaining gaps (bevels, cross-part, thin webs, and — in stage 1 only — round stock). |
| `src/scene/machiningSchedule.ts` | Narrow its `unassessed` entry to interactions other than drilling; **do not** mark a depth mode `unassessed` because of an intersection finding (see below). |
| `src/scene/productionReview.ts` | Advisory mapping and policy sentence. |
| `src/geom/cutLimits.ts` (new) | `MIN_CUT_SIZE_MM = 0.1`, the one constant the exporter and the check share so both agree on which box cuts exist. |
| `src/geom/occt.ts` | Import `MIN_CUT_SIZE_MM` instead of the inline `0.1` in `makeShape`. Behaviour unchanged. |
| Tests | New geometry unit tests; integration assertions in the existing readiness/review tests. |
| Docs | `docs/superpowers/notes/2026-11-01-drilling-intersections-notes.md` after implementation; `CLAUDE.md` only if a new invariant is worth recording. |

**Machining-schedule side effect (must be handled).** `buildMachiningSchedule` builds
`invalidDrilling` — a set of operation IDs — from every issue returned by `drillingChecks`, and
uses it to set `depthMode: 'unassessed'`. Intersection and review findings say nothing about a
bore's depth, so the set must be built by **excluding** the three new codes rather than by
whitelisting the old ones:

```ts
const invalidDrilling = new Set(
  drillingChecks(p)
    .filter((issue) =>
      issue.code !== 'drilling-intersection' &&
      issue.code !== 'drilling-redundant' &&
      issue.code !== 'drilling-overlap-review',
    )
    .map((issue) => issue.operation.id),
)
```

A whitelist would silently drop any validity code added later. Without this filter, every
collision would quietly change the schedule's depth mode, which is a deeper regression than the
finding itself.

## Unassessed after this change

The lists are different at the end of each delivery stage, because a gap must be named while it
still exists.

**Stage 1 (boards shipped, round stock not yet).**

`manufacturingChecks().unassessed`:

1. `Drilling intersections with round stock`
2. `Drilling intersections with bevelled edges (mitre and angled end cuts)`
3. `Drilling that breaks into a different part`
4. `Minimum remaining material between cuts`
5. `Manual machining geometry`
6. `Machine operation compatibility`
7. `Hardware suitability`
8. `Physical installation`

`buildMachiningSchedule().unassessed`:

1. `Interactions between cuts other than board drilling`
2. `Manual machining geometry`
3. `Machine compatibility and tool access`

**Stage 2 (round stock shipped).** Item 1 of the first list and the word "board" in the second
disappear:

1. `Drilling intersections with bevelled edges (mitre and angled end cuts)`
2. `Drilling that breaks into a different part`
3. `Minimum remaining material between cuts`
4. `Manual machining geometry`
5. `Machine operation compatibility`
6. `Hardware suitability`
7. `Physical installation`

and `buildMachiningSchedule().unassessed` becomes:

1. `Interactions between cuts other than drilling`
2. `Manual machining geometry`
3. `Machine compatibility and tool access`

Item `Minimum remaining material between cuts` is deliberate in both lists: rows 9 and 16 were
chosen "allow", but a thin web is still not checked, and the readiness report should say so rather
than imply it is covered.

## Testing

Every behaviour row gets at least one test, and every "unassessed" row gets an assertion that the
gap is named. The geometry module is tested directly; `drillingChecks` and `productionReview` are
tested through their public functions.

Required cases:

- **Tolerance:** tangent circles, a 1e-7 overlap, a 1e-3 overlap; the first two allowed, the third
  reported.
- **Row spacing:** `pitch = diameter + 1e-3` allowed; `pitch = diameter - 1e-3` reported; a single
  hole with zero pitch unchanged.
- **Box cut:** centre inside, partial opening, side-wall breach, through-slot split, entry in a
  pocket's void, fully redundant hole, and a cut with any size ≤ 0.1 mm treated as absent.
- **Opposite faces:** depths summing below/at/above the thickness.
- **Adjacent faces:** near-corner pair that overlaps, and one that misses by more than the
  tolerance.
- **Coaxial pairs:** identical → review; stepped → allowed; both on the same face and from
  opposite faces.
- **Round stock:** same-end duplicates, stepped bores, opposite-end meeting, axial × transverse,
  transverse × transverse (parallel, perpendicular and skew), bore × notch, angled end cut →
  unassessed.
- **Finished extent:** a square end trim plus a through axial bore is allowed (the bore is
  re-referenced to the trimmed cap); the same trim with a blind bore is measured from the trimmed
  cap, not the stock cap; an angled end cut changes nothing and stays unassessed.
- **Sub-threshold box:** a box cut with any size ≤ 0.1 mm is not an obstacle, matching `makeShape`.
- **Verdict precedence:** a drill wholly inside a box reports `drilling-redundant` and not
  `drilling-intersection`; an identical coaxial pair reports `drilling-overlap-review` and not a
  block; a stepped coaxial pair reports nothing.
- **Invalid geometry:** a drill with a non-finite entry is skipped by the intersection pass, while a
  drill that is merely out of bounds is still intersected and can produce a second finding.
- **Huge arrays:** `count = 1_000_000_000` with a box and with another row; the test must finish
  under the suite timeout, proving no expansion.
- **Determinism:** identical input gives identical references/messages; reordering independent
  parts does not change a part's findings.
- **Independence:** visibility, world position/rotation, grain and material rates do not change the
  result (mirroring the existing drilling test).
- **Integration:** `manufacturingChecks` reports the new codes with the drilling operation's
  `operation` reference and the board as the target; `productionReview` classifies
  `drilling-overlap-review` as advisory and the other two as needs-correction; the machining
  schedule keeps `depthMode` assessed for a colliding but geometrically valid bore.
- **Representative fixtures:** `manufacturingProject()` and `machiningProject()` must produce no new
  findings. `machiningProject()` currently collides: its 8 mm dowel carries an axial through bore
  plus a transverse bore at `position: 100, depth: 4`, which reaches the axis and opens into the
  axial bore (row 22, block). Change that bore's depth to `2` — it then stops 0.5 mm short of the
  axial bore wall, keeps its `blind` depth mode and its existing CSV/packet assertions, and stays a
  plausible cross-hole. If any other finding appears, inspect it: a real collision is a fixture
  defect to fix, not a reason to weaken the check.

Also update the existing assertions that name `'Drilling intersections with other cuts'`
(`src/scene/drillingChecks.test.ts`) and any count/reference expectations that shift.

## Performance

Per part, the pair count is `O(c²)` in the number of cuts, with `c` typically below 30. The only
unbounded quantity is a row's `count`, which is never expanded. The check runs inside
`readinessSnapshot` and the machining schedule; it must stay allocation-light and must not
`structuredClone` whole cut arrays.

## Delivery

The behaviour is one design, but it should land in two reviewable stages:

1. **Boards** — rows 1–16, plus the three codes, severity mapping, the `MIN_CUT_SIZE_MM`
   extraction, the stage-1 `unassessed` texts, and the machining-schedule filter. This is the
   production-critical path (dados, shelf pins, hinge cups, worktop cut-outs). The intersection
   pass must return nothing for `cylinder` parts in this stage; the round-stock gap is carried by
   `manufacturingChecks().unassessed` instead.
2. **Round stock** — rows 19–24, using the same module and codes, plus the square-end-cut datum
   rule. Item 1 of the stage-1 `unassessed` list is removed and the schedule's line loses the word
   "board".

Bevels (17, 18, 25) and cross-part (27) stay unassessed. Box × box (28) is a separate change.

## Resolved calls

These are the places where two of the selected answers pulled against each other, or where the
selection left a detail open. Each is settled here so the builder does not have to guess.

- **Three codes, not two.** Choice 32 named `drilling-intersection` and `drilling-redundant`, but
  choices 3, 5, 19 and 21 ask for an advisory verdict on repeated or meeting drills. Two codes
  cannot carry both severities, so a third advisory code, `drilling-overlap-review`, is added.
- **A square end cut moves the datum, it is not an obstacle.** Choice 25 deferred angled end cuts
  only, which left the square trim open. A square `end` cut on round stock is a stock-length
  adjustment, and the exporter builds its tool at the nominal offset, so treating the removed slab
  as an obstacle would flag a perfectly ordinary *through-drilled, then trimmed* dowel — the shape
  of the `manual-round` fixture. It is therefore handled as a datum: the finished extent shrinks,
  bores from that end are measured from the new cap, and reaching the far finished cap is a through
  bore. The `occt` exporter still builds its tool from the nominal stock length; reconciling that
  with the record's finished-part intent is an exporter change, out of scope here and not caused by
  this work.
- **Each hole gets exactly one verdict.** The rows overlap in practice — a hole wholly inside a
  pocket is also "an intersection" — so the classification order in "One verdict per hole" is
  normative. A fully voided hole is `drilling-redundant`, not also a collision; an identical
  coaxial repeat is a review rather than a block. Without an order, the same geometry could produce
  two findings with different severities for one hole.
- **A sub-threshold box cut does not exist.** `makeShape` skips a box cut with any size ≤ 0.1 mm,
  so the exported solid does not contain it either. The check shares that constant rather than
  inventing a second, stricter rule: reporting a collision with a cut the packet never
  manufactures would be wrong.
- **Only undefined geometry suppresses the pass.** A drill that is out of bounds or whose entry is
  off the face still has a nominal volume and is still intersected. Skipping it would couple two
  independent checks and could hide a collision that remains after the first defect is fixed.
- **Thin webs are allowed but not hidden.** Rows 9 and 16 were chosen "allow"; the gap is still
  named in `unassessed`, because silence would read as coverage.
- **Conservative skew tests are acceptable.** The selected "block" verdicts for round-stock bores
  require a decision on skew transverse pairs. The check uses the segment-distance test, which can
  over-report but never misses. The limit is documented here and in the module.
- **The representative fixtures are not allowed to weaken the check.** Both `manufacturingProject()`
  and `machiningProject()` must stay finding-free, and `machiningProject()` currently is not: its
  transverse bore reaches the axial bore's axis (see "Testing"). Its depth is reduced from 4 to 2,
  which leaves 0.5 mm of material, keeps the `blind` depth mode and touches no existing assertion.
  The check is not widened to accommodate the fixture.
- **Unassessed lists are staged.** A gap is named while it exists, so stage 1 says "round stock" and
  stage 2 removes that line. Shipping stage 1 with the stage-2 list would claim coverage that does
  not exist.
- **One finding per hole and obstacle.** Choice 29 asked for per-operation reporting. A row hitting
  three obstacles therefore produces three findings (or more if a row is both voided and clipped by
  one obstacle), and one row overlapping another produces one.

## Left to the builder

- The internal layout of `drillingIntersections.ts` and the names of its helpers.
- The exact wording of messages beyond the templates above, provided labels, IDs, indices and the
  other cut's identity are present.
- How to compute the affected-index count when the set is not contiguous (the first index and
  "and others" is the required minimum; an exact count is welcome but must not enumerate).
- Whether to share the linear-function range helper with any existing geometry module, provided no
  existing behaviour changes.
