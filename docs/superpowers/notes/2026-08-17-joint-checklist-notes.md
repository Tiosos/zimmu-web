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

## Open

- Unobserved, same caveat the 2026-08-07 notes recorded for the panel itself: the gap was found by
  reading code and by reasoning about the end of a carcase run, not by watching the app be used.
  Whether the `9 / 14` counter is the signal a woodworker actually wants is still untested against a
  real session.
- The no-offer group's length on real data is unknown. AABB adjacency will over-report (diagonal
  corner kisses, rotated boards), and if that group reads as noise rather than information, the fix
  is OBB adjacency rather than hiding the group.
- `MAX_SCENE_PAIRS` headroom shrank — it now counts touching pairs, not offering pairs. Not
  reachable at measured scene sizes, but the 2026-08-09 "unreachable by any scene we have measured"
  claim is now less generous than it reads.
