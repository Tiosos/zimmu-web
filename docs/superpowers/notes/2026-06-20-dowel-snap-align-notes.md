# Dowel Snap-Align (SP3) — Implementation Notes

- 2026-06-20: `buildFaceHit` returned `null` for all non-board parts, so the
  raycaster emitted no dowel `FaceHit`s. SP3 extends it to cylinders. Side effect:
  this also enabled SP2's dowel click-to-seed cuts, which were inert before.
- `computeDowelSnapTransform` recomputes the cap's world normal from the dowel's
  rotation (`Q_current · (0,0,±1)`) rather than trusting `sourceFace.faceNormal`,
  because a rotated dowel's cap normal must stay exact and the raycaster's board
  path axis-rounds. The dowel path therefore does NOT axis-round cap normals.
- Lateral dowel `faceNormal` is built from the zeroed radial vector (not the raw
  interpolated triangle normal `ln`), so it stays consistent with the radial
  `localFaceNormal`. No current consumer reads a lateral `faceNormal` (snap rejects
  lateral; add-cut uses `localFaceNormal`/`localHitPoint`), but the consistency
  avoids a latent bug.
- Landing point: `coaxial` (cap-to-cap) seats at `targetFace.faceCenter`;
  otherwise at `targetFace.hitPoint`. `coaxial = targetPart.kind === 'cylinder'`,
  decided in `useSnap`.
- No roll-snap for dowels (rotational symmetry) — `Q_final = Q_normal · Q_current`.
- Follow-up (not in scope): `useSnap.onFaceHover` does not gate on `isSnapFace`, so
  a lateral dowel face can be highlighted as a hover target even though clicking it
  is rejected on the target pick. Pre-existing limitation, made more visible now
  that target gating exists. Consider gating hover similarly.
- Follow-up (not in scope): board → **off-axis** dowel-cap roll. `computeSnapTransform`'s
  roll-snap assumes an axis-aligned target normal (`// always ±X/Y/Z per raycaster`). A
  dowel cap is now a valid board-snap target and the viewport emits its exact, non-axis-
  rounded world normal. For an axis-aligned dowel (0°/90°) this is fine; for an off-axis
  dowel the roll-snap reference axes fall back to defaults, so the board still seats flush
  and centered on the cap but at an unspecified in-plane roll. A circular cap has no
  canonical roll, so this is a cosmetic limitation, not a flush-seating bug.
- Deferred: lateral/side-lay snapping; snapping by a mitred (cut) end uses the
  nominal square cap; 2D dowel drawings (SP4).
