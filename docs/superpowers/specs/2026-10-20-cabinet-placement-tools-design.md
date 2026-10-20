# Cabinet placement tools

Fifteen capabilities: Placement tab, staged XYZ, left/right quarter turns, reset rotation, six envelope-edge alignments, three axis-centre alignments and validated preview/apply with one undo step.

Use existing occupied slot-based envelopes and rotation/placement resolvers, in the cabinet's shared parent frame. Reference targets must be other carcases sharing the parent and must not depend transitively on the selected cabinet's anchor. Proposed free placement requires an explicit detach choice for an anchored cabinet; followers remain anchored and are resolved in preview.

Drafts store raw numerical strings. Finite validation precedes geometry. Alignments change one axis only, considering proposed rotation and occupied front/frame/applied-back extents. Rotation reset clears tilt as well as Z. Preview shows sibling footprints with PlanView and reports positive-volume bounding-box overlaps (touching is allowed); overlap warnings do not block Apply because envelopes are conservative for rotated cabinets. Room/production assessments remain responsible for other clearance checks.

Keep scene geometry/material signature snapshots, excluding meshes. Scene changes retain but stale the draft and invalidate previews; reset explicitly loads current coordinates. Accept rechecks signature and reconstructs the proposal against the current scene, rejects errors/no-ops and records a discrete history entry. Placement must preserve all current non-placement scene data, unrelated component identity and detached/retained drawer configuration.

Verify all alignment axes, rotations/front/back bounds, parent/dependency filtering, anchor detach/followers, overlap/touching, finite checks, immutable snapshots, stale acceptance, UI staging/reset/cancel, and real scene-hook undo/redo. Mutation-test guards from backups before final checks.
