# Cut interference checks

**Date:** 2026-11-11
**Status:** Proposed. Implementation plan:
`docs/superpowers/plans/2026-11-11-cut-interference.md`.
**Related:** `src/scene/drillingIntersections.ts`, `src/scene/drillingChecks.ts`,
`src/scene/manufacturingChecks.ts`, `src/scene/machiningSchedule.ts`,
`src/scene/productionReview.ts`

## Why

The readiness documents name the gap only partly:

- `buildMachiningSchedule()` names it directly — `'Interactions between cuts other than drilling'`.
- `manufacturingChecks()` names the related web gap — `'Minimum remaining material between cuts'` —
  but no line says "two board box cuts may overlap". The manufacturing line this plan replaces is
  the drilling-bevelled line, not the web line.

The drilling work answered every pair whose subject is a drill. A **box cut is only ever the
obstacle** in that module: a dado, groove, notch, pocket or slot is compared with a hole array, a
bore or another drilling row. Nothing compares one box cut with another box cut, so two housings
can claim the same material and the report says nothing.

The gap is real on both sides of the ledger:

- **A mistake:** two worktop cut-outs overlap, a pocket is drawn wholly inside a larger pocket, or a
  housing is placed at the same height as another housing from a different joint. The solid loses
  material twice, the machining schedule carries an operation that cuts air, and the designer finds
  out at the bench.
- **Ordinary joinery:** a back-panel groove runs into the bottom housing, a shelf housing runs into
  the toe-kick notch, and two joint housings meet at a corner. These are supposed to overlap. A
  check that blocked them would fail every cabinet built with a housing joint method.

The people affected are the designer issuing the release and the operator reading the readiness
PDF. The first needs to see the pair and decide whether it was intended; the second needs the part
and both operation IDs, not a generic warning.

## What this check is, and is not

It is a **nominal part-local geometric consistency check between box cuts on one board**. It
answers one question: do these two cutting volumes claim the same material, and does one of them
remove nothing at all?

It is not: a drill check (already answered by `drillingIntersections`), a round-stock check, a
bevel check, a thin-web check (designed in stage 2 below), a stock-fit check, a tool-path
simulation, an order-of-operations check, a structural or strength calculation, or a cross-part
(assembly) check. Those that remain unassessed are named in the lists below.

## Behaviour (the decisions)

"Review" means `advisory`, which needs review but does not block release. "Allow" means no finding.
"Absent" means the exported solid does not contain the cut, so it is not an obstacle; the machining
schedule may still list the definition, so this is solid-absent, not packet-absent.
"Undefined" means the record cannot describe a volume; the cut is skipped. No per-cut box-validity
check exists, so that gap is named once in the global `unassessed` list, not reported per pair.
"Unassessed" means the gap is named in that list.

### Board box cut × box cut

| #   | Situation                                                                                     | Verdict                                  | Code                      |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------- |
| 1   | Two boxes share material on all three axes, neither contains the other                        | Review                                   | `cut-intersection-review` |
| 2   | One box lies wholly inside the other                                                          | Review                                   | `cut-redundant-review`    |
| 3   | Two boxes are identical within the tolerance                                                  | Review                                   | `cut-redundant-review`    |
| 4   | Boxes touch on a face, an edge or a corner only                                               | Allow                                    | —                         |
| 5   | Shared material on any axis is no thicker than the tolerance                                  | Allow                                    | —                         |
| 6   | Boxes overlap in plane but are separated through the thickness                                | Allow                                    | —                         |
| 7   | A box has any size at or below `MIN_CUT_SIZE_MM` (0.1 mm)                                     | Absent                                   | —                         |
| 8   | A box has a non-finite position or size                                                       | Undefined; skipped                       | —                         |
| 9   | Two through-cuts cross                                                                         | Review                                   | `cut-intersection-review` |
| 10  | A housing runs into another housing or into a toe-kick notch                                  | Review                                   | `cut-intersection-review` |
| 11  | Box cut × hole array                                                                          | Not this module; `drillingChecks` owns it | —                        |
| 12  | Box cut × mitre or angled end cut                                                             | Unassessed                               | —                         |
| 13  | Round stock (notch × notch, notch × end, end × end)                                           | Unassessed                               | —                         |
| 14  | Three or more mutually overlapping boxes                                                      | One finding per pair                     | —                         |

Rows 1 and 10 are the same geometry. Row 10 is called out because it is the case that forbids a
blocking verdict: the generator can emit it on purpose when a housing joint method is selected, and
the recorded geometry cannot distinguish it from a mistake. See "Severity" below.

### Minimum remaining material (stage 2)

| #   | Situation                                                          | Verdict                       | Code              |
| --- | ------------------------------------------------------------------ | ----------------------------- | ----------------- |
| 15  | Two box cuts leave a web thinner than `MIN_REMAINING_WEB_MM`       | Review                        | `cut-web-review`  |
| 16  | A box cut and a drilling row leave a web thinner than the floor    | Review                        | `cut-web-review`  |
| 17  | Two drilling rows leave a web thinner than the floor               | Review                        | `cut-web-review`  |
| 18  | A pair shares material (rows 1–3)                                  | Not a web; the overlap verdict | —                 |
| 19  | A pair is separated by bevelled-edge geometry                      | Unassessed                    | —                 |
| 20  | A pair is on round stock                                           | Unassessed                    | —                 |

Stage 2 is designed here but delivered by its own plan; that plan sets the value of
`MIN_REMAINING_WEB_MM`. Stage 1 leaves `'Minimum remaining material between cuts'` unchanged in
`manufacturingChecks().unassessed`; stage 2 narrows it to the pairs it has not covered.

### Not assessable from the recorded geometry

| #   | Situation                                              | Verdict    |
| --- | ------------------------------------------------------ | ---------- |
| 21  | Box × `manual-machining` instruction (text only)       | Unassessed |
| 22  | A drilling cut that leaves this part and enters another part | Unassessed |
| 23  | Whether an overlap was intended by the designer        | Review     |

### Reporting and implementation choices

| #   | Question    | Decision                                                                                                                                                                                                 |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24  | Granularity | One finding per pair. Three mutually overlapping boxes produce three findings, one per pair; a cluster is not merged.                                                                                     |
| 25  | Attachment  | A partial overlap attaches to the earlier cut in `part.cuts` and names the later. A redundancy attaches to the cut that removes nothing; for an identical pair, the later cut is the redundant one.      |
| 26  | Tolerance   | `1e-6` mm, the same constant the drilling checks apply. Contact, edge-touch and overlaps no thicker than that are not reported.                                                                         |
| 27  | Codes       | Two, both advisory: `cut-intersection-review` and `cut-redundant-review`.                                                                                                                                |
| 28  | Prefix      | `Cut "<label>" [<id>]: …`, matching the `Drilling "<label>" [<id>]: …` prefix.                                                                                                                           |
| 29  | Ordering    | Findings are appended after `drillingChecks` for the same part, so `M<n>` references stay positional and deterministic. Pairs are walked in `(i, j)` order over `part.cuts`.                            |
| 30  | Output      | The module returns code, message and a `ManufacturingOperationReference`; it does not number findings. `manufacturingChecks` owns `M<n>`.                                                                 |

## Geometry model

Part-local millimetres, the frame already used by `drillingChecks` and the machining schedule.
Visibility, world placement, grain, material rates and the part's label do not change the answer.

**Board** — material is `[0,L] × [0,W] × [0,T]` (x = length, y = width, z = thickness).

**Box volume** — a box cut removes `[position, position + size]`, axis-aligned. A box with any size
at or below `MIN_CUT_SIZE_MM` is absent from the solid: `makeShape` skips it. The machining schedule
still lists the definition, so "absent" here means solid-absent, not packet-absent. A box with a
non-finite position or size cannot describe a volume; this check skips it, but `makeShape` does not
(`NaN <= 0.1` and `Infinity <= 0.1` are false). That record-validity gap is named in the unassessed
list below.

**Shared extent** — for each axis, `min(maxA, maxB) − max(minA, minB)`. A non-positive value means
the boxes do not share material on that axis. Two boxes share removed material only when all three
shared extents are greater than the tolerance.

**Containment** — box A lies inside box B when, on every axis,
`A.min ≥ B.min − ε` and `A.max ≤ B.max + ε`. The boundary is inclusive at the same tolerance, so a
box that ends exactly on the other's face is contained. Identical means each contains the other.

**No clipping.** A box may extend beyond the stock (the toe-kick notch deliberately does, to keep
the boolean unambiguous). The check uses the nominal volume. It is not a stock-fit check: no per-cut
box-bounds check exists today, and a box that lies wholly outside the stock is a no-op. The overlap
message therefore means "these nominal volumes overlap", not "both remove stock material".

**No arrays.** Box cuts are a flat list. The pair count is `O(c²)` in the number of cuts, with `c`
typically well below 30. There is no quantity that can grow without bound.

## Findings

Two codes are added to `ManufacturingCheckCode`:

```ts
| 'cut-intersection-review' // advisory
| 'cut-redundant-review'    // advisory
```

Messages keep the existing identity: `Cut "<label>" [<id>]: …`. Examples:

- `Cut "Shelf dado" [dado-1]: shares removed material with cut "Bottom dado" [dado-2]; verify this is intended.`
- `Cut "Pocket" [pocket-1]: lies entirely inside cut "Sink cut-out" [cut-2]; it removes no additional material.`
- `Cut "Pocket" [pocket-2]: repeats cut "Pocket" [pocket-1] at the same volume; one of the two can be removed.`

### One verdict per pair

A pair is classified once, in this order, and emits at most one finding:

1. Any shared extent is at or below the tolerance → **allow** (touching, edge contact, or no
   overlap).
2. Each box contains the other → **redundant**, attached to the later cut (an identical repeat).
3. The first contains the second → **redundant**, attached to the second.
4. The second contains the first → **redundant**, attached to the first.
5. Otherwise → **intersection**, attached to the earlier cut.

The same pair is never reported twice. A pair that is contained is not also an intersection; a pair
that touches is not an overlap.

Pair ordering and de-duplication:

- Boxes are read in `part.cuts` order; non-box cuts are ignored.
- A pair is reported once, on the cut the rule above names.
- A cut is never compared with itself.
- The output is deterministic: identical input produces identical messages and operation references.
- Findings are appended after the drilling findings for that part. Reordering independent parts does
  not change a part's findings.

## Severity

Both codes are **advisory**, not `needs-correction`. This is deliberate and is the main design
decision of this change.

- The generator can emit legitimate meetings: a back groove runs into a bottom housing, a shelf
  housing runs into the toe-kick notch, and two joints meet at a corner. A blocking verdict would
  fail every cabinet built with a housing joint method. The default `butt-screw` catalogue emits no
  box×box meetings (probe: 6 box cuts, 0 overlaps); `dado-rabbet` emits 44 across 52 boxes and
  `finger` 44 across 168. Advisory is therefore essential for those methods, and the default
  project stays finding-free.
- Provenance does not disambiguate. `sourceJointId` says which joint emitted a cut, but two
  different joints may legitimately meet, and the same joint may emit cuts that meet. A rule that
  trusted provenance would be wrong in both directions.
- The precedent is `drilling-overlap-review`: repeated or meeting drilling is advisory because the
  record cannot tell a duplicate definition from an intentional feature. A box overlap has the same
  epistemic status.
- A redundant cut is harmless to the solid but wasteful to machine. Naming it is useful; blocking a
  release for it is not.

`productionReview` classifies every manufacturing finding as `needs-correction` except the advisory
codes. Add both new codes to that advisory condition:

```ts
f.code === 'label-empty' ||
f.code === 'label-duplicate' ||
f.code === 'drilling-overlap-review' ||
f.code === 'cut-intersection-review' ||
f.code === 'cut-redundant-review'
  ? 'advisory'
  : 'needs-correction'
```

Update the policy sentence in the same file to name overlapping or redundant cuts.

No schema version changes: findings are additive, and the release policy's shape is unchanged.

## Integration points

| File                                        | Change                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scene/cutVolumes.ts` (new)             | `BoxVolume` and `boxVolumeOf` moved out of `drillingIntersections`, with finite-position and non-finite-size guards. One statement of what a box cut removes.       |
| `src/scene/cutIntersections.ts` (new)       | Pure geometry: compare box volumes, classify pairs, return code/message/operation. No React, no clock, no randomness.                                                |
| `src/scene/manufacturingPart.ts`            | `ManufacturingOperationReference` moves here and its `kind` widens to `CutDef['kind'] \| DowelCut['kind']`, because a box cut is now an operation subject too.        |
| `src/scene/drillingChecks.ts`               | Import and re-export the shared operation type; build its own references as before.                                                                                  |
| `src/scene/drillingIntersections.ts`        | Import `boxVolumeOf` from `cutVolumes` instead of defining it locally. Behaviour changes only for non-finite box geometry: the finite guard makes such a box an absent obstacle, where the local builder could treat an infinite-size box as covering everything. |
| `src/scene/manufacturingChecks.ts`          | Add the two codes to the union; call `cutIntersections(p)` after `drillingChecks(p)`; narrow the unassessed text.                                                    |
| `src/scene/machiningSchedule.ts`            | Narrow the unassessed text only. `depthMode` is untouched: neither new code says anything about a bore's depth, and the existing filter already excludes only drilling codes. |
| `src/scene/productionReview.ts`             | Advisory mapping and policy sentence.                                                                                                                                |
| Tests                                       | New `cutVolumes` and `cutIntersections` unit tests; integration assertions in the readiness/review/schedule tests; update every assertion that names the old unassessed line. |
| Docs                                        | `README.md` readiness paragraph; `docs/production-review.md` advisory list; delivery notes after implementation; `CLAUDE.md` only for the invariant below.          |

**Machining-schedule side effect (must not happen).** `buildMachiningSchedule` builds
`invalidDrilling` from `drillingChecks` and uses it to set `depthMode: 'unassessed'`. The new module
is called by `manufacturingChecks`, not by the schedule, so a cut finding cannot change a drilling
depth mode. Do not merge the two modules' outputs into `drillingChecks`; that would couple them and
reintroduce the regression the drilling work guarded against.

## Unassessed after this change

Stage 1 (this plan) narrows the interaction lists to what it does not cover and names the
non-finite box-validity gap. A gap must be named while it still exists.

`manufacturingChecks().unassessed`:

1. `Cut interactions involving bevelled edges or round-stock notches`
2. `Drilling that breaks into a different part`
3. `Non-finite box cut geometry`
4. `Minimum remaining material between cuts`
5. `Manual machining geometry`
6. `Machine operation compatibility`
7. `Hardware suitability`
8. `Physical installation`

`buildMachiningSchedule().unassessed`:

1. `Cut interactions involving bevelled edges or round-stock notches`
2. `Manual machining geometry`
3. `Machine compatibility and tool access`

The old strings `'Drilling intersections with bevelled edges (mitre and angled end cuts)'` and
`'Interactions between cuts other than drilling'` disappear. Item 1 is deliberately broader than
the drilling line it replaces: a box cut meeting a mitre is now the same unassessed shape of
problem, and a round-stock notch meeting another notch is not covered by this module. Item 3 is the
record-validity gap this stage deliberately leaves open: the new pass skips a non-finite box, and no
per-cut box check names it.

Stage 2 (minimum remaining material) removes the minimum-remaining-material item from the
manufacturing list, narrowing it to `'Minimum remaining material on round stock'` if round-stock
webs remain uncovered. Stage 2 also adds `cut-web-review` to the advisory mapping.

## Testing

Every behaviour row gets at least one test, and every "unassessed" row gets an assertion that the
gap is named. The geometry module is tested directly; `manufacturingChecks`, `productionReview` and
`machiningSchedule` are tested through their public functions.

Required cases:

- **Volume:** position/size produce the expected min/max; a size of 0, −1, 0.05 or 0.1 is absent; a
  non-finite position or size is absent.
- **Tolerance:** two boxes touching on a face, an edge and a corner are allowed; a `1e-7` shared
  thickness is allowed; a `1e-3` shared thickness is reported.
- **Thickness separation:** two boxes overlapping in x/y but separated in z are allowed, in both
  orders.
- **Partial overlap:** one finding, attached to the earlier cut, with both labels and IDs.
- **Containment:** the contained cut carries the finding; the message names the container; a box
  ending exactly on the container's face is contained.
- **Identical:** one finding on the later cut; the message names the earlier; a `1e-7` size
  difference is still an identical pair.
- **Precedence:** a contained pair produces `cut-redundant-review` and not `cut-intersection-review`;
  a pair with one axis at the tolerance produces nothing.
- **Through-cuts:** two full-thickness crossing boxes are reported once.
- **Clusters:** three mutually overlapping boxes produce three findings; order is deterministic.
- **Invalid geometry:** a non-finite box is skipped while a finite partner is still compared with
  the other valid boxes.
- **Independence:** visibility, world position/rotation, grain, material rates and labels do not
  change the result.
- **Integration:** `manufacturingChecks` reports the new codes with the cut's `operation` reference
  (including `sourceJointId`/`sourceComponentId`) and the board as the target; drilling findings
  precede cut findings for the same part; `productionReview` classifies both as advisory;
  `buildMachiningSchedule` still marks a colliding but geometrically valid bore's depth mode
  correctly.
- **Representative fixtures:** `manufacturingProject()` and `machiningProject()` must produce no new
  findings. A local probe of `manufacturingProject()` found six boards with box cuts and zero
  overlapping pairs; if the new check reports one, inspect it — a real overlap is a fixture defect to
  fix, not a reason to weaken the check.
- **Unassessed text:** both lists name the new combined line and no longer contain the old broad
  line; the manufacturing list names `'Non-finite box cut geometry'`; the readiness PDF and the
  existing schedule/drilling tests assert the new text and the old text's absence.

Also update the existing assertions that name
`'Drilling intersections with bevelled edges (mitre and angled end cuts)'` in
`drillingChecks.test.ts`, `manufacturingChecks.test.ts` and `buildReadinessPdf.test.ts`.

## Performance

Per board, the pair count is `O(c²)` in the number of cuts, with `c` typically below 30. The module
allocates one volume record per box cut and two numbers per pair comparison; it must not
`structuredClone` whole cut arrays. It runs inside `readinessSnapshot`, alongside the existing
drilling pass, and adds no unbounded work.

## Delivery

The design covers two reviewable stages:

1. **Box × box (this plan).** Rows 1–14, the two codes, the advisory mapping, the `boxVolumeOf`
   extraction, the operation-type move, the narrowed interaction texts, the new non-finite gap
   line, and the README update. This
   is the manufacturing-critical path: housings, pockets, notches and worktop cut-outs.
2. **Minimum remaining material (separate plan).** Rows 15–18, the `cut-web-review` advisory code,
   and the removal of the minimum-remaining-material item from the manufacturing list. It reuses the
   same volumes and adds only distance queries; it is deliberately deferred so stage 1 stays a
   geometry change with no new threshold.

Bevelled edges (12, 19) and round stock (13, 20) stay unassessed in both stages.

## Resolved calls

- **Advisory, not blocking.** The earlier sketch named `cut-intersection` and `cut-redundant` as
  blocking. That would fail ordinary cabinets: the generator can run one housing into another, and
  into the toe-kick notch, when a housing joint method is selected. The record cannot distinguish
  those from a mistake, so both codes are advisory, exactly as repeated drilling is. The readiness
  report still names the part and both operations, which is the actionable part.
- **Stage 1 is box × box only.** Drilling × box and drilling × drilling are already answered. Round
  stock and bevels are named precisely rather than claimed. Webs are a separate threshold decision
  and get a separate plan.
- **Identical is a redundancy, not a third code.** A duplicate cut and a contained cut have the same
  consequence — one operation removes nothing new — so one code carries both, with wording that
  distinguishes them.
- **Attachment follows the defect.** A partial overlap is a property of the pair, so it attaches to
  the earlier cut, mirroring the drilling pair rule. A redundancy is a property of the inner cut, so
  it attaches there; for an identical pair that means the later definition.
- **A sub-threshold box does not exist.** `makeShape` skips a box with any size at or below 0.1 mm,
  so the exported solid does not contain it. The check shares `MIN_CUT_SIZE_MM` rather than
  inventing a second rule.
- **Non-finite geometry is skipped, not reported per pair.** A box with a NaN position cannot be
  compared with anything. The check skips it; the record-validity gap is named once in
  `manufacturingChecks().unassessed` rather than reported per pair.
- **Clusters are not merged.** One finding per pair is the drilling precedent and keeps the message
  tied to two concrete operations. A cluster of three is noisier but never hides which pair is
  which.
- **The fixtures are not allowed to weaken the check.** Both representative projects must stay
  finding-free. The probe found no overlaps in `manufacturingProject()`, so a finding there is a
  fixture defect to inspect, not a threshold to relax.
- **The schedule is not coupled to the new module.** `buildMachiningSchedule` keeps calling only
  `drillingChecks`. A cut finding must never change a bore's `depthMode`.

## Left to the builder

- The internal layout of `cutIntersections.ts` and the names of its helpers.
- The exact wording beyond the templates above, provided both labels, both IDs and the verdict are
  present.
- Whether to share the containment/shared-extent helpers with the stage-2 web work.
- Whether the partial-overlap message names the shared extents (optional; the two identities are the
  required minimum).
