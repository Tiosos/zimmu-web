# Half-Lap Joint (JP4) — Implementation Notes

**Date:** 2026-07-21

- First joint TYPE beyond the dado family. `Joint = DadoJoint | HalfLapJoint`; `deriveJoint` is now a
  `switch (joint.kind)` dispatcher (`deriveDadoJoint` + `deriveHalfLap`).
- `DeriveResult.seat` is now optional — a half-lap repositions nothing. `reconcileJoints` guards the
  seat application. This was the one necessary change to the otherwise-untouched reconciler.
- Geometry (`halflap.ts`) is self-contained and THREE-free: `worldAabb` (8 transformed corners),
  `stackAxis` (3rd matrix column), AABB-overlap, and `worldBoxToLocalCut` via the new rigid inverse
  `applyInverseToPoint` in `transform.ts` (Rᵀ·(p−t); valid because scale is 1).
- Validity = same stack axis + coincident thickness ranges (⟺ coplanar AND equal thickness) +
  overlapping footprint. Else stale (preserve last-good), like the dado.
- A keeps the low half, B the high half; `split` (clamped 0.05–0.95) sets the shared plane; `clearance`
  deepens each notch (mid-plane allowance, default 0). Both cuts are ordinary `BoxCut`s — no
  OCCT/mesh/export/drawing change.
- `onUpdateJoint` widened to `(j: Joint) => Joint`: its call sites only spread-and-write, so no dado
  call site changed. Half-lap `onUpdateJoint` calls stay inside a `j.kind === 'halflap'` narrow (the
  updater is not enforced to match the joint kind by the type — the narrow is the guard).
- `jointInvolves` (kind-aware) replaced the housing/housed membership checks in `useScene` and
  `JointsPanel`.
- New two-click `useAddHalfLap` gesture + a 4th exclusive viewport mode (shortcut `l`), mirroring the
  dado add-mode wiring across `App`/`Viewport`/`Sidebar`.
- Interactive 3D smoke test is a human step (OCCT WASM doesn't boot headless).
