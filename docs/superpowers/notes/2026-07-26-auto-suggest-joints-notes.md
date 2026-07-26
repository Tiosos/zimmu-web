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
</content>
