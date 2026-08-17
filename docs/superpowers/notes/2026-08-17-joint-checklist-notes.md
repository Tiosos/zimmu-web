# Joint Checklist — Implementation Notes

Living notes for `docs/superpowers/specs/2026-08-17-joint-checklist-design.md`.

## 2026-08-17 — spec decided, not yet implemented

### Approaches considered

Three ways for the pair set to be reported. Recorded because the rejected two are the obvious
readings of the request ("have the engine report what it discards") and will look tempting again.

- **A — rich survey replaces the scene pass.** A new `surveyScenePairs(parts, joints)` doing one
  walk, absorbing `suggestJointsForScene` + `groupByPair`. Rejected: it rewrites a proven,
  heavily-tested engine function to add what is a reporting concern, and `groupByPair`'s interleaved-
  pair ordering guard would have to be re-proven inside the new function.
- **B — pure checklist layer above the engine.** Chosen. See spec.
- **C — stop discarding; tag jointed suggestions instead.** The literal reading of the request: drop
  the `continue` at `suggestJoints.ts:365` and mark those suggestions as already-jointed. Rejected as
  actively wrong, not merely wasteful — a jointed pair's geometry has already been cut, so re-scoring
  it produces offers against a shape that no longer exists ("add a dado" for a pair that has one).
  It also does nothing for the no-offer case, which is half the feature.

The request phrase "requires the engine to report what it currently discards" comes from the
2026-08-09 spec's rejection of this feature. Worth being explicit: **the engine never reports it.**
The touching-pair set is re-derived above the engine from the same predicate. That is what let the
2026-08-09 objection be answered without touching `suggestForOrderedPair`.

### `groupByPair`'s cap was a latent correctness bug for any classifier

Found while grounding the spec, not while implementing. `groupSuggestions.ts:36` truncates to
`MAX_SCENE_PAIRS`. Harmless while the only consumer rendered the groups directly — a capped list is
just a shorter list. The moment something *classifies* by "is there a group for this pair?", the cap
turns absent-because-truncated into a positive claim of "no joint available".

General shape worth remembering: **a runaway guard below a classifier is a wrong-answer generator.**
The 2026-08-09 work moved this same cap once already, for the same class of reason (partial rows).
It moved again here.

### `boardsTouch` extraction is three copies → two, not → one

Initially pitched as removing a duplicated predicate outright. On reading, `contactPair:142-149`
fuses the predicate with `contactAx`/`bestGap` selection in one loop, so delegating would walk the
axes twice for no benefit. `cornerPair:200-203` is the predicate verbatim and does delegate.

Left the overclaim out of the spec deliberately. The remaining two copies stay consistent by
construction (same `TOUCH_TOL`, same early return on the same comparison), which is weaker than one
definition and should be stated as such.

### Stale joints outrank the adjacency test (found in spec self-review)

First draft gated every row on `boardsTouch`. That silently loses joints: `reconcileJoints.ts:27-29`
does **not** delete a joint whose `deriveJoint` returns null — it leaves the last-good cuts and
position in place. So a joint outlives its boards being moved apart, and an adjacency-gated
checklist would drop the row and decrement `jointedCount` with nothing to explain it.

Row admission is therefore `boardsTouch(a, b) || pairHasJoint`. Secondary benefit: a jointed row
cannot flicker out when a board drifts a hair past `TOUCH_TOL`.

The general lesson is that the checklist has two independent sources of truth about what constitutes
a pair — geometry and `scene.joints` — and geometry is the weaker one. Anywhere the two disagree,
the recorded joint wins.

### Requirements settled with the user

- Row states are three, not two: `no-offer` is what distinguishes "engine has no opinion" from
  "these boards do not touch". Without it the checklist cannot be read against the physical model.
- The counter excludes `no-offer`, so 100% stays reachable.
- `no-offer` gets its own collapsed section rather than a muted sub-section inline — keeping it
  inline would re-inflate the row count that the 2026-08-09 grouping work reduced from 40 to 14.
- Done rows are hover-to-tint only. Click-to-select was offered and declined: it needs selection
  plumbing out of the scene panel plus a way to reveal a specific joint in `JointsPanel`, and
  editing already has a home.

### Why distance ordering is computed for every row

The alternative — ordering rows by the suggestion list and appending jointed rows — was rejected on
use, not on cost. A row that jumps position the moment you joint it loses your place halfway through
a carcase, which defeats the checklist framing entirely. Computing `aabbCenterDist` for jointed and
no-offer pairs too is ~3 lines and is the only thing keeping a row in its slot across the
`open → jointed` flip. It has a dedicated test because nothing else would catch a regression.

## 2026-08-17 — shipped

Implemented in nine steps, TDD throughout. Verified in Chromium against the live app with a
temporary e2e spec (deleted after, following the 2026-08-09 precedent): a two-board tee showed
`Joints — 0 / 1` with `Dado` and `M&T` chips, and clicking `Dado` left the row **in place** as
`✓ Board 1 + Board 2` with the header at `Joints — 1 / 1`. On `main` that row disappears; that
difference is the whole feature.

### The no-offer group is empty on a well-formed carcase

This was the open design risk — that AABB adjacency would over-report and fill the group with noise.
Measured on a 7-board 800×600×720 carcase (two sides, divider, bottom, two shelves, top, 18 mm ply):

```
21 possible pairs → 12 actionable rows → 0 no-offer rows
```

The nine non-touching pairs (side-to-side, shelf-to-shelf) were dropped entirely; **none** leaked
into no-offer. The section does not render at all when empty, so on clean geometry it is invisible
and costs nothing. It surfaces only for genuinely odd placements — stacked panels being the case we
have. **OBB adjacency is not needed**, and the collapsed-section design stands as specced.

Also worth recording: the 12 rows split 8 × `[dado, mortise-tenon]` and 4 ×
`[dado, mortise-tenon, finger, finger]` (the four corners, where both finger orientations are
offered). That matches the 2026-08-09 grouping analysis exactly.

### Fixture traps that cost real time

Three of these bit during implementation, all the same shape — geometry that looks inert but is not:

- **Coincident boards are a valid half-lap.** Two boards at the same place overlap on every axis
  with identical spans, which is exactly `isValidHalfLap`'s condition. Used as a "no-offer" fixture
  they silently produce an open row instead. The stacked pair (different z-spans) is the correct
  no-offer fixture.
- **Under `Ry=-90`, `position.x` is the board's MAX x edge**, not the min. Mirroring a board about a
  shelf centre by naive arithmetic lands it off by its own thickness, which quietly breaks an
  "equidistant" fixture into two different distances. Measured rather than derived, in the end.
- **The app seeds `[makeDefaultBoard()]`**, so `+ Board` twice gives three boards, not two. An e2e
  fixture assuming two got `Joints — 0 / 3` and looked like a counting bug.

None of these were product defects. All three were tests asserting the wrong thing, and each was
found only because a red test disagreed with the expected number — which is the argument for
writing the expected count into the test rather than snapshotting whatever comes out.

### Deviation from the plan: tasks 6 and 7 committed together

The plan had them as separate commits. They cannot be: Task 6 adds a required `onHoverPair` prop,
which leaves `sidebar.tsx` failing typecheck until Task 7 passes it, and the repo's pre-commit hook
blocks a commit while typecheck is red. Splitting them would have meant committing a broken build.
The hook was right; the plan was wrong.

`sidebar.test.tsx` also needed the new prop added to its props factory — a file the plan's file list
did not mention.

### The `orientationArrow` risk did not materialise

Flagged before implementation: `orientationArrow(r, s)` passes a `ChecklistRow` where `PairGroup` is
declared, and might need the parameter widened. TypeScript accepted it structurally — `ChecklistRow`
carries both `aId` and `options` — so no change was needed.

## Open

- Unobserved, same caveat the 2026-08-07 notes recorded for the panel itself: the gap was found by
  reading code and by reasoning about the end of a carcase run, not by watching the app be used.
  Whether the `9 / 14` counter is the signal a woodworker actually wants is still untested against a
  real session. The carcase measurement above says the *shape* of the list is right; it says nothing
  about whether anyone wants to read it.
- `MAX_SCENE_PAIRS` headroom shrank — it now counts touching pairs, not offering pairs. The carcase
  measurement puts a real scene at 12 rows against a cap of 100, so this is comfortable, but the
  2026-08-09 "unreachable by any scene we have measured" claim is less generous than it reads.
- No permanent e2e coverage. The verification spec was deleted per repo convention; the flip from
  open to `✓` is pinned by unit tests only.
