# Tongue & Groove Joint (JP7) — Implementation Notes

**Date:** 2026-07-26

- Seventh joint type; first **edge-to-edge** joint (all prior joints meet at an end or corner). Two
  equal-thickness coplanar boards meet along a long edge (±Y); one gets a full-length centered groove,
  the other a centered tongue that seats into it. `Joint` union += `TongueGrooveJoint`.
- `tonguegroove.ts` is self-contained (type-only import of `DeriveResult`/`DerivedCut` from `dado.ts`;
  `dado.ts` runtime-imports `deriveTongueGroove` back — no cycle). The gesture/scene/panel import the
  runtime `isValidTongueGroove` directly: create gate === derive gate (carrying forward the JP5/JP6
  "no dead joints" fix).
- **Geometry is near-total reuse:** the groove is a `computeDadoGroove`-shaped box (centered in
  thickness, through-length); the centered tongue is **two** symmetric `computeRabbet`-shaped shoulder
  cuts (vs. the rabbeted dado's single asymmetric rabbet). The seat is a fixed-axis special case of
  `computeDadoSeat` (depth=Y, narrow=Z, run=X): tongue tip → groove bottom, thickness mid-planes
  aligned, length preserved; minimal and idempotent (re-derive doesn't drift the tongue board).
- **Extra validity gate discovered during planning:** anti-parallel ±Y edges + axis-aligned do NOT
  imply the boards are coplanar — a tongue board rotated `y:90` presents a facing −Y edge but its
  thickness runs along world X (a T-meeting, not a glue-up), so a centered tongue wouldn't align with
  the centered groove. `isValidTongueGroove` therefore also requires the two thickness axes to be
  parallel (`|zG·zT| > 1−EPS`). A test covers the `y:90` rejection.
- **Clearance is groove-only** (widens the groove across thickness; the tongue keeps its nominal
  thickness), matching the dado convention. Default `clearance = 0`; defaults seed `tongueThickness ≈
  thickness/3`, `tongueDepth ≈ 8 mm` (clamped to half the narrower board's width).
- 7th exclusive viewport mode via the post-refactor `useInteractionMode` coordinator: **new gesture
  hook + one registry entry + a keyboard case + Sidebar props/button. Viewport needs zero changes** —
  exactly the runway the interaction-mode refactor (2026-07-25) built. **Shortcut is `T`.**
- `FILE_FORMAT_VERSION` 9 → 10 (adds `tongue-groove`; inert backfill defaults in `parseFile`).
- No OCCT/mesh/export/drawing change — ordinary `BoxCut`s. Interactive 3D verification is a human step
  (OCCT WASM doesn't boot headless).
- **Known minor edges (non-blocking):** (1) the `tongueDepth` default is `Math.min(8, floor(min(width)/2)−1)`
  — for real boards (≥ 8 mm wide) it's always 8; on absurdly narrow boards it can seed below the spec's
  nominal 3 mm floor, but downstream `clamp(…, 0.1, …)` keeps every cut valid. (2) `isValidTongueGroove`
  requires equal *thickness* but not equal *width* (edge glue-ups legitimately mix widths); the seat clamps
  its depth by the groove board's width while the shoulders clamp by the tongue board's width, so a
  *manually* over-large `tongueDepth` on boards narrower than the tongue depth could leave a small gap or
  interference — unreachable via the create defaults (clamped by `min(groove.width, tongue.width)`).
