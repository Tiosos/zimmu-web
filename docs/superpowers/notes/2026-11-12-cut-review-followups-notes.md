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

### Task 2 — Invalid box-cut geometry

**Commits:**

- `e6bdc8b feat: report invalid box cut geometry`
- `7ddaad9 fix: clarify the cut-review policy sentence`

`CutIntersectionCode` gains `cut-geometry-review`. A box cut whose volume is `null` **and** whose
geometry is non-finite now produces one finding, anchored on that cut with its operation reference,
and stays out of the pair pass; a finite partner is still compared with every other finite box. A
sub-minimum box is silent, which the `else if (!boxGeometryIsFinite(cut))` guard pins.

`manufacturingChecks().unassessed` loses `'Non-finite box cut geometry'` — eight entries become
seven, now asserted with `toHaveLength(7)`. `productionReview` classifies the code as advisory and
the policy sentence names it.

**TDD evidence:**

| File | Red | Green |
| --- | --- | --- |
| `cutIntersections.test.ts` | 3 failed / 21 passed (24) | 24 passed |
| `manufacturingChecks.test.ts` | 2 failed / 18 passed (20), both the unassessed assertion | 20 passed |
| `productionReview.test.ts` | 1 failed / 8 passed (9), actual `{ needsCorrection: 2, advisory: 2 }` | 9 passed |

Combined: **53 passed** across the three files.

**Reviews:**

- Spec compliance: ✅. Exact message and policy strings, ordering (geometry before pair findings at
  this task), the seven-entry unassessed list, the advisory mapping, and six-file scope all verified
  against the code rather than the report.
- Code quality: changes required, then approved. Two real problems:
  1. The module header still said the module answers "only" two questions and that "both" verdicts
     are advisory for the same joinery reason. It now names all three questions and gives the
     non-finite case its own rationale (a record the designer is still editing).
  2. The policy sentence contradicted itself: "Invalid manufacturing definitions … need correction"
     followed by "non-finite box cuts … are advisory". The first clause is now scoped to "part,
     stock and cut-envelope definitions", which is the blocking family (`cut-size`, stock, part
     size). The same scoping must be mirrored in `docs/production-review.md` in Task 4; the plan's
     Task 4 Step 2 was updated to replace both bullets, not only the advisory one.
  3. Two hardenings from the review: the unassessed length is pinned at 7, and the review test is
     named "non-finite, overlapping and redundant cuts" because it still asserts that `cut-size`
     stays `needs-correction`.

**Intermediate state, superseded by Task 3:** geometry findings are emitted before all pair
findings, so at this commit an invalid cut that is not first in `part.cuts` gets an `M<n>` later than
an overlap on an earlier cut. Task 3's anchor sort replaces this. Do not ship at `e6bdc8b`/`7ddaad9`.

**Deviation recorded:** the plan's exact policy sentence was improved during review; the plan was
updated to the delivered wording.

### Task 3 — Overlap clusters and ordering

**Commits:**

- `8ff7368 feat: report an overlap cluster once`
- `55918ad test: pin the cut finding ordering`
- `f3f647a refactor: clarify cut-cluster membership and ordering`

Plain box-cut intersections are grouped into connected components via union-find and emitted
once per component at its first cut (the anchor), naming all other members in cut order:
`Cut "<anchor>" [<anchorId>]: forms one connected group of overlapping cuts with "<other1>" [<id1>]... and "<otherN>" [<idN>]; verify this is intended.`.
Two-cut isolated intersections continue to emit the existing pairwise message.

Contained cuts (`cut-redundant-review` inside) and repeated cuts remain separate findings attached
to the cut that removes no additional material. Containment joins cuts in the union-find component
so connected chains through containment are preserved, while only plain pairs trigger cluster review.

All findings (geometry, cluster, redundancy) are stably sorted by `anchor` (index in `part.cuts`),
ensuring `M<n>` references and findings follow cut order across the part.

**TDD evidence:**

| File | Red | Green |
| --- | --- | --- |
| `cutIntersections.test.ts` | 6 failed / 24 passed (30) | 30 passed |

**Verification:**
`pnpm vitest run src/scene/cutVolumes.test.ts src/scene/cutIntersections.test.ts src/scene/drillingIntersections.test.ts src/scene/manufacturingChecks.test.ts src/scene/productionReview.test.ts src/scene/machiningSchedule.test.ts`
→ 6 files, 108 tests passed.
`pnpm typecheck` and `pnpm lint` exit 0.

**Reviews:**

- Spec compliance: ✅. Grouped reporting for plain overlaps, 2-cut pairwise wording preserved for
  isolated pairs, multi-cut wording with natural language listing, contained cuts excluded from
  clusters, anchor-based ordering.
- Code quality: approved after clarifications and hardenings:
  1. Header comment updated to document group clustering and cut-order sorting.
  2. Redundant single-item branch in `clusterIssue` removed since it is only invoked when `others.length >= 2`.
  3. Renamed `plain` to `plainPairs` with explicit comment on containment edges.
  4. Pinned ascending cut-order anchor selection with defensive check on component lookup.
  5. Added explicit ordering tests pinning late invalid cuts and same-anchor redundancy ties.

