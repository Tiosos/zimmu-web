# Cut-review follow-ups: invalid box cuts and overlap clusters

**Date:** 2026-11-12
**Status:** Proposed. Implementation plan:
`docs/superpowers/plans/2026-11-12-cut-review-followups.md`.
**Related:** `src/scene/cutVolumes.ts`, `src/scene/cutIntersections.ts`,
`src/scene/manufacturingChecks.ts`, `src/scene/productionReview.ts`,
`docs/superpowers/specs/2026-11-11-cut-interference-design.md`

## Why

The box-cut overlap work named two gaps it deliberately left open. Both became visible the moment
the check ran on real cabinets.

**A box cut with non-finite geometry is skipped in silence.** `boxVolumeOf` rejects it so the pair
pass cannot compare a `NaN` volume, but nothing reports the cut itself. The readiness document only
names the gap in the global unassessed list — `'Non-finite box cut geometry'` — which tells the
designer a class of problem exists, not which cut has it. The exported solid still contains whatever
`makeShape` did with that box, so the packet can carry an operation that no check ever looked at.
The designer needs the part, the cut ID and the label, exactly as the other findings give them.

**A cluster of overlaps is reported once per pair.** Three mutually overlapping boxes produce three
findings, a five-cut housing pile-up produces ten. Every one is true, and none is useful: the
reviewer already knows all five cuts meet, and must dismiss ten separate advisories to clear one
design decision. Pairwise findings are the right shape for two cuts; they are the wrong shape for a
connected group. The resolution a reviewer actually makes — "these housings are supposed to meet" —
is one decision, so it should be one finding.

The earlier design recorded both choices explicitly: "No per-cut box-validity check exists, so that
gap is named once in the global `unassessed` list" and "One finding per pair. Three mutually
overlapping boxes produce three findings, one per pair; a cluster is not merged" (row 24). This
design supersedes row 24 and closes the validity gap.

## Scope

This is an amendment to the stage-1 box × box pass, not a new check:

- It adds one advisory code for a box cut that cannot describe a volume.
- It changes how many findings a connected group of plain overlaps produces, and their attachment.
- It does **not** change pair classification, tolerance, containment, precedence, the drilling pass,
  the machining schedule, or the file format.

## Behaviour

### 1. Invalid box-cut geometry

`boxVolumeOf` currently returns `null` for two reasons that the caller cannot tell apart:

| Position              | Size                          | Meaning  | Finding               |
| --------------------- | ----------------------------- | -------- | --------------------- |
| finite                | finite and `> MIN_CUT_SIZE_MM` | volume   | compared with peers   |
| finite                | finite and `<= MIN_CUT_SIZE_MM` | absent   | none                  |
| any component non-finite | any                        | invalid  | `cut-geometry-review` |

- **Invalid** means any component of `position` or `size` is not `Number.isFinite` (`NaN`, `Infinity`
  or `-Infinity`).
- **Absent** is unchanged: a finite box at or below `MIN_CUT_SIZE_MM` (0.1 mm) removes no solid
  material, is skipped by the pair pass, and stays silent. A 0.05 mm score line is legitimate
  geometry, not a defect, and reporting it would fire on ordinary rank and ill cuts.
- An invalid box is **excluded from the pair pass**; it cannot be the subject or the obstacle of an
  overlap or redundancy finding. A finite partner is still compared with every other finite box.
- One finding per invalid box, in `part.cuts` order. Two invalid boxes produce two findings, not one
  merged finding: each has its own geometry to correct.
- The finding is anchored on the invalid cut and carries its `operation` reference, so review
  navigation lands on the cut to fix.
- `manufacturingChecks().unassessed` loses `'Non-finite box cut geometry'`; the list narrows from
  eight items to seven. `buildMachiningSchedule().unassessed` never named it.

### 2. Overlap clusters

Build an overlap graph over the finite box cuts of one board:

- One node per finite box cut.
- One edge per pair that shares removed material on all three axes beyond the tolerance. This is the
  same qualifying test the pair pass already uses; containment and identical pairs are edges too.
- A **cluster** is a connected component of that graph.

Emission rules:

1. **Pair classification is unchanged.** Each pair is still classified exactly once as repeat,
   contained, or plain intersection, in the existing order.
2. **Containment and repeat stay one finding per pair**, attached to the cut that removes nothing.
   A sink cut-out containing two pockets is two decisions and two findings, not one cluster.
3. **Plain intersections are emitted once per cluster.** The finding attaches to the first member of
   the cluster in `part.cuts` order and names every other member of the cluster, in `part.cuts`
   order. This is the only change to finding count.
4. **A two-cut cluster keeps the existing pairwise wording.** The common case — two housings meeting
   — reads as it does today, and the stage-1 message contract is preserved:

   `Cut "Shelf dado" [shelf]: shares removed material with cut "Bottom dado" [bottom]; verify this is intended.`

5. **A cluster of three or more uses the group wording:**

   `Cut "Span" [span]: forms one connected group of overlapping cuts with "Shelf" [shelf] and "Bottom" [bottom]; verify this is intended.`

   Names are joined with `, ` and a final ` and `. The named cuts are the other members of the
   component, including a member joined to the cluster only through containment; "overlapping" is
   true of every member because every edge means shared material.

A cluster containing only containment or repeat edges produces no intersection finding; its
redundancies are reported individually by rule 2.

### 3. Ordering

Every finding carries the index, in `part.cuts`, of the cut it is anchored on:

- geometry finding → the invalid cut;
- redundancy finding → the cut that removes nothing;
- cluster finding → the first member of the cluster.

Findings are sorted stably by that index, so `M<n>` references follow cut order rather than pair-loop
order. Ties keep emission order: geometry findings first, then redundancies in pair order, then
clusters. The output is deterministic for identical input.

## Findings

`CutIntersectionCode` gains one member:

```ts
export type CutIntersectionCode =
  | 'cut-intersection-review' // advisory
  | 'cut-redundant-review'    // advisory
  | 'cut-geometry-review'     // advisory
```

Messages keep the `Cut "<label>" [<id>]: …` identity:

- `Cut "Shelf dado" [dado]: has a non-finite position or size, so its removed volume is undefined; correct the geometry before machining.`
- `Cut "Span" [span]: forms one connected group of overlapping cuts with "Shelf" [shelf] and "Bottom" [bottom]; verify this is intended.`

Examples that do not change:

- `Cut "Shelf dado" [dado-1]: shares removed material with cut "Bottom dado" [dado-2]; verify this is intended.`
- `Cut "Pocket" [pocket-1]: lies entirely inside cut "Sink cut-out" [cut-2]; it removes no additional material.`
- `Cut "Pocket" [pocket-2]: repeats cut "Pocket" [pocket-1] at the same volume; one of the two can be removed.`

## Severity

All three codes are **advisory**, not `needs-correction`.

- A non-finite box is a defect, but the release gate already has the blocking `cut-size` code for
  the part's cut envelope, and a designer meets this finding mid-edit, while a dimension change is
  half-entered. Blocking on it would make the assessment depend on how far through an edit the
  designer is. The finding names the part, the cut and the label, so the reviewer can act on it; if
  experience shows non-finite cuts reaching packets, promoting it is a one-line change in
  `productionReview`.
- A cluster is a count of one design decision, not a new defect class. It inherits the advisory
  reasoning of stage 1: the generator can emit legitimate meetings on purpose.

`productionReview` adds the new code to the advisory condition:

```ts
f.code === 'label-empty' ||
f.code === 'label-duplicate' ||
f.code === 'drilling-overlap-review' ||
f.code === 'cut-intersection-review' ||
f.code === 'cut-redundant-review' ||
f.code === 'cut-geometry-review'
  ? 'advisory'
  : 'needs-correction'
```

The policy sentence in the same module, and the advisory bullet in `docs/production-review.md`, name
invalid box-cut geometry alongside overlapping or redundant cuts.

No schema version changes: findings are additive and the release policy's shape is unchanged.

## Geometry model

The box volume model is unchanged: part-local millimetres, `[position, position + size]`, absent at
or below `MIN_CUT_SIZE_MM`, tolerance `1e-6` mm.

One predicate is extracted in `cutVolumes.ts` so the finiteness rule has a single home:

```ts
const isFiniteVec = (v: Vec3) => [v.x, v.y, v.z].every(Number.isFinite)

export function boxGeometryIsFinite(box: BoxCut): boolean {
  return isFiniteVec(box.position) && isFiniteVec(box.size)
}
```

`boxVolumeOf` calls it before its size-minimum test. `drillingIntersections` is unchanged: a
non-finite box remains an absent obstacle, not an invalid one, because that pass only compares
obstacles with drills.

Cluster membership uses a small union-find over the box list. The pair loop stays `O(c²)`; union-find
adds `O(c² α(c))`, which is not a new order. No `structuredClone`, no per-pair allocation beyond the
existing classification.

## Integration points

| File                                  | Change                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scene/cutVolumes.ts`             | Add `boxGeometryIsFinite`; `boxVolumeOf` delegates its finiteness check to it. No behaviour change.                                                        |
| `src/scene/cutIntersections.ts`       | Third code; report invalid boxes; union-find clusters; group message; anchor-index ordering. Pair classification, tolerance and precedence unchanged.        |
| `src/scene/manufacturingChecks.ts`    | Remove `'Non-finite box cut geometry'` from `unassessed`. No other change: the code union comes from `CutIntersectionCode`.                                |
| `src/scene/productionReview.ts`       | Advisory condition and policy sentence.                                                                                                                    |
| `src/ui/buildReadinessPdf.ts`         | No code change; the PDF prints `unassessed` generically, so the removed line disappears with the list.                                                     |
| `README.md`                           | Readiness paragraph: invalid box geometry is now advisory; remove it from the unassessed sentence; mention one finding per overlap cluster.                |
| `docs/production-review.md`           | Advisory bullet adds invalid box-cut geometry.                                                                                                             |
| `CLAUDE.md`                           | Extend the box-cut invariant with the cluster rule and the validity code.                                                                                  |
| Tests                                 | `cutVolumes`, `cutIntersections`, `manufacturingChecks`, `productionReview`; no change needed in `drillingChecks`, `buildReadinessPdf` or packet tests, whose assertions are relative or name other lines. |

## Unassessed after this change

`manufacturingChecks().unassessed` (eight items become seven):

1. `Cut interactions involving bevelled edges or round-stock notches`
2. `Drilling that breaks into a different part`
3. `Minimum remaining material between cuts`
4. `Manual machining geometry`
5. `Machine operation compatibility`
6. `Hardware suitability`
7. `Physical installation`

`'Non-finite box cut geometry'` disappears because the per-cut check now names the cut. The
minimum-remaining-material line stays until stage 2, which is designed in
`2026-11-11-cut-interference-design.md` and is the next plan.

## Testing

Every rule above gets at least one test. The geometry module is tested directly; the integration is
tested through `manufacturingChecks` and `productionReview`.

Required cases:

- **Predicate:** `boxGeometryIsFinite` is true for a normal box, false for a `NaN` position, an
  `Infinity` size and a `-Infinity` size.
- **Invalid reporting:** a non-finite box produces one `cut-geometry-review` with its label and ID;
  a finite partner is still compared with the remaining finite boxes; two invalid boxes produce two
  findings in cut order; a broken box is never named by an overlap or redundancy finding.
- **Absent stays silent:** a box at `0.05` and at `0.1` mm produces no finding, and still does not
  participate in a pair.
- **Cluster of three:** three mutually overlapping boxes produce **one** `cut-intersection-review`
  anchored on the first, naming the other two in cut order. (This replaces the stage-1
  `reports one finding per overlapping pair` expectation.)
- **Chain of four:** A overlaps B, B overlaps C, C overlaps D, A does not overlap D — one finding
  anchored on A naming B, C and D.
- **Two-cut cluster:** wording and attachment are unchanged, proving the common case is preserved.
- **Two disjoint clusters:** two findings, each anchored on the first member of its own cluster.
- **Containment is not merged:** a container plus two contained pockets still produces two
  `cut-redundant-review` findings.
- **Mixed cluster:** a container, one contained cut and one cut that pokes out produce one cluster
  finding and one redundancy finding, ordered by anchor.
- **Ordering:** geometry finding, cluster finding and redundancy finding appear in anchor order, with
  `M<n>` references contiguous in `manufacturingChecks`.
- **Integration:** `manufacturingChecks` reports `cut-geometry-review` with the cut's `operation`
  reference and the board as the target; `productionReview` classifies it advisory; the unassessed
  list no longer contains `'Non-finite box cut geometry'`.
- **Representative fixtures:** `manufacturingProject()` and `machiningProject()` stay finding-free
  for these codes.

## Out of scope

- **Sub-minimum boxes** stay silent. Reporting them is a separate decision with a much higher
  false-positive rate.
- **Containment chains** still duplicate: A ⊃ B ⊃ C reports C twice, once inside A and once inside B.
  Collapsing to the outermost container is a different question from cluster noise.
- **Drilling cluster de-duplication.** `drilling-overlap-review` remains pairwise per hole range.
- **Stage 2 webs.** Minimum remaining material, `cut-web-review` and `MIN_REMAINING_WEB_MM` are the
  next plan, not this one.
- **Bevelled edges and round-stock notches** stay unassessed in both stages.

## Resolved calls

- **Advisory, not blocking.** A non-finite cut could not be manufactured, which argues for
  `needs-correction`. Rejected because it would split one geometry defect class across two
  severities based on whether the cut happened to overlap something, and because the readiness model
  already treats invalid *definitions* in this pass as advisory. `cut-size` remains the blocking
  part-envelope check.
- **Group only plain intersections.** Collapsing containment into the cluster would attach one
  finding to a container and lose the per-cut "removes nothing" navigation. Containment stays
  individual.
- **Box cuts only.** The same cluster noise exists in `drilling-overlap-review`, but its findings are
  per hole range and its contract is independently tested; changing it in the same slice would make
  neither change reviewable on its own.
- **Two-cut wording preserved.** Rewriting every two-cut finding into group language would churn the
  common case for no reviewer benefit and would invalidate the stage-1 message tests without
  changing behaviour.
- **Naming every component member.** Naming only the anchor's direct neighbours would lose cuts that
  are two hops away in a chain. The message says "connected group", so listing the component is both
  accurate and complete.
