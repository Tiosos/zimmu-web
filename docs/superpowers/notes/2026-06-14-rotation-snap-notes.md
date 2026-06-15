# Rotation Snap — Implementation Notes

**Date:** 2026-06-14 (notes backfilled 2026-06-15 from a plan/code cross-check)
**Spec:** `docs/superpowers/specs/2026-06-14-rotation-snap-design.md`
**Plan:** `docs/superpowers/plans/2026-06-14-rotation-snap.md`

Living record of decisions/deviations. This file was missing and is reconstructed from the shipped code.

## Status

Fully implemented, to spec. `computeSnapTransform` + `localNormalToFaceString` in `snapMath.ts`; `useSnap.ts` switched from `computeSnapDelta` to `computeSnapTransform` (anti-parallel guards and the `dot`/`vecLen` helpers removed); `viewport.tsx` ghost mesh now applies rotation as well as position. `computeSnapDelta` is retained (still tested) but unused in the snap flow.

## Decisions / deviations

- **`computeSnapTransform` reads `sourcePart.rotationOrder` dynamically** rather than hardcoding `'XYZ'`. This is stricter than the CLAUDE.md warning implies, but `BoardPart.rotationOrder` is still the single literal `'XYZ'`, so it is safe today. (`composeWorldMatrix` would be the first thing to break if a non-XYZ order were ever added.)
- **No-op detection replaced.** The old `vecLen(delta) < 0.001` guard became a 6-component `noMove` check comparing both position and rotation against the source part, so pure-rotation snaps are no longer silently discarded.
- **`TARGET` test fixture dropped.** The plan first added then retracted a `TARGET` fixture; the final tests inline their own face data and omit it (would have tripped `noUnusedLocals`).
- **Extra test added** beyond the plan's three: a pre-rotated-source case (`Q_current ≠ identity`) was added in a follow-up commit to exercise non-identity starting rotation.
- **Ghost mesh recomputes every hover frame.** `computeSnapTransform` is pure and cheap (no OCCT/async) and the hover path is rAF-throttled, so calling it per frame is fine.
- **Degenerate normals** (parallel / anti-parallel source vs. target) are handled by `setFromUnitVectors` plus a zero-length-projection fallback in the roll-snap step.
