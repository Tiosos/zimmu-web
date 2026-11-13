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
