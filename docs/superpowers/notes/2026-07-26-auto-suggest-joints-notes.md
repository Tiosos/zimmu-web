# Auto-Suggest Joints — Implementation Notes

Living notes. Audience: a future dev/AI who needs the *why*.

## 2026-07-26 — enumeration approach was geometrically wrong (design-time discovery)

The brainstorm settled on "enumerate the six faces of each board, run each joint's `isValid*` gate,
take the first pair that passes." Verifying against the real gates while writing the plan showed this
is wrong for four of the five joints:

- Only `isValidHalfLap` is **position-aware** (checks world-AABB overlap + coplanarity).
- `isValidDadoSeat`, `isValidMortiseTenon`, `isValidFingerJoint`, `isValidTongueGroove` check
  **orientation only** (anti-parallel / perpendicular face normals). They are intentionally weak
  because the two-click UI relies on the *human* clicking the actually-touching faces.

So blind enumeration picks the first *orientation*-passing pair — e.g. for the M&T derivation
fixture, the `+Y`/`-Y` edge faces (100 mm apart) rather than the real `+Z`/`+X` contact — and would
emit joints on the wrong faces.

Also learned: the joint creators **auto-seat** the mating board, so the derivation-test fixtures are
geometrically arbitrary (declared faces don't match the boards' positions). Do **not** reuse them for
suggester tests; build physically-coherent fixtures.

### Decision: contact-based detection

`contactPair(a, b)` infers the meeting axis as the world axis with the largest (least-negative)
AABB gap within `TOUCH_TOL`, then maps that ±axis to each board's actual touching face. The existing
gates validate that one physically-correct pair. Classification by the contact faces' local depth
axis:

- exactly one broad (`depth 'z'`) face → perpendicular tee → dado + mortise-tenon;
- both long edges (`depth 'y'`) → coplanar edge glue-up → tongue-groove;
- else (two broad = lamination, two ends = butt/corner) → nothing.

This also fixes a cross-type noise case: the raw M&T orientation gate accepts a coplanar edge
glue-up, but the classification never routes an edge contact to M&T.

Assumption: shallow post-snap contact (seat axis has the smallest overlap). Deep penetration could
flip the argmax; accepted for MVP.

### Decision: defer finger joints

A finger/box joint is a *perpendicular interlocking corner* — the two ends are perpendicular and the
boards overlap in the corner region, so it has no single anti-parallel contact face that
`contactPair` models. Detecting it needs a separate corner detector. Rather than bolt a second
heuristic onto the MVP, finger is deferred to a fast-follow (adds a fifth `JointSuggestion` variant +
an `onAddFingerJoint` dispatcher arm). MVP ships half-lap + dado + mortise-tenon + tongue-groove.

### Other choices

- `TOUCH_TOL = 1 mm`; `MAX_SUGGESTIONS = 8`; `KIND_PRIORITY = [halflap, dado, mortise-tenon, tongue-groove]`.
- Apply replays through the existing `onAdd*` creators via `synthHit` (creators read only `partId` +
  `localFaceNormal`), so undo/redo + cut derivation come for free and stale suggestions fail safe.
- `FACE_NORMALS` gets a fifth private copy (matches the per-file convention in `geom/*`); a shared
  export is a separate refactor.

## 2026-07-27 — implementation complete

- Implemented via subagent-driven development across 6 tasks; all merged with a spec review and a
  code-quality review each.
- Ships 4 joint types: half-lap, dado, mortise-tenon, tongue-groove. Finger deferred as designed above.
- One test-infra necessity discovered: `SuggestionsPanel.test.tsx` needs `afterEach(cleanup)` because
  the repo doesn't set vitest `globals: true` (matches the existing `src/ui/*.test.tsx` convention).
- A follow-up during Task 3 added a sort-order test and two classification "why" comments (from code
  review).

## 2026-07-27 — finger joints added (feature now covers all five joint types)

- `cornerPair` detects the right-angle corner `contactPair` cannot model: world-AABB adjacency, then
  each board's end face pointing toward the other, then a proximity gate.
- The proximity gate was **not** in the approved spec — planning found that without it, a board
  standing on another's broad face, off-centre toward one end, is reported as being at that end and
  passes `isValidFingerJoint` (which checks orientation and widths, never position). Threshold is
  `(Ta + Tb) / 2 + TOUCH_TOL`, derived from the flush-corner offset, not tuned. Same class of bug as
  the enumeration flaw recorded on 2026-07-26.
- `cornerPair` is position-only by design: it does not verify perpendicularity (collinear boards
  butted end-to-end also return a pair), so it must always be composed with `isValidFingerJoint`.
- Role assignment is load-bearing: `FingerJoint.partAId` stays put and `partBId` auto-seats, so the
  **selected** board is always A — clicking Add never moves the board the user selected.
- The dispatcher arm in `App.tsx` is not compile-enforced (the switch has no `never` guard), unlike
  `KIND_LABEL` which is. A missing arm would silently no-op. The round-trip test's kind chain does
  now carry a `never` guard, added after code review flagged that converting its bare `else` had
  removed exhaustiveness for a future sixth kind.
- A right-angle corner also satisfies the tee classification, so a box corner lists Dado, Mortise &
  tenon, and Finger joint together. Confirmed intentional — all three are legitimate for that
  geometry.

## 2026-07-27 — suggestion hover highlight

- Hovering a Suggested joints row lights the neighbouring board's edges amber (`0xfbbf24`) in the
  viewport, so "Dado with Rail 2" is self-explanatory. Matters more now that one box corner can list
  Dado, Mortise & tenon and Finger joint together.
- **Edge colour only, never emissive.** Selection uses both channels, so mirroring it is the
  instinct — but the flash animation's completion handler (`viewport.tsx`, animation loop) resets a
  mesh's emissive to a hardcoded `selected ? 0x222244 : 0x000000`. An emissive-based highlight would
  be silently wiped when a flash finished on that board, and stay wiped until `parts`/`geometries`/
  `selectedId`/`highlightedId` next changed. Staying on the edge channel sidesteps it without
  touching working animation code.
- `applySuggestion` clears the hover: applying makes the row unmount, and `onMouseLeave` never fires
  on an unmounted element, which would otherwise leave the board lit indefinitely.
- `onHoverSuggestion` is deliberately a **required** prop through the whole chain, so a missing
  wire-up is a compile error. `Viewport.highlightedId` is optional (matching the existing
  `flashTarget?` convention), so that one is not compile-enforced.
- Moving the pointer from the row onto its Add button does NOT clear the highlight: React's
  `onMouseEnter`/`onMouseLeave` use native mouseenter/mouseleave semantics, which ignore transitions
  onto descendant elements.
- Known minor gap: rows are keyed by array index, so if the distance-sorted `suggestions` reorder
  while the pointer sits motionless over a row, the highlight can go stale until the next mouse move.
  Self-correcting; not worth a guard yet.
- Face-level highlighting (outlining the two faces a joint would use) was considered and deferred.
  The groundwork exists: `computeFaceCorners` reads only `localFaceNormal`, which `synthHit` sets, so
  suggestion faces feed the existing `updateHighlight` LineLoops directly. Blockers were half-lap
  carrying no faces and the two LineLoops being owned by the snap/gesture modes.
