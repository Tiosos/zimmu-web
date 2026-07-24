# Mortise & Tenon Joint (JP5) — Implementation Notes

**Date:** 2026-07-23

- Fifth joint type; first with a blind pocket + multi-cut tenon. Asymmetric (mortise board + tenon
  board), mirrors the dado. `Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint`.
- `mortisetenon.ts` is self-contained (no runtime import from `dado.ts`, which imports
  `deriveMortiseTenon` back). It reimplements the perpendicular-seat check (`isPerpendicularSeat`)
  and `isAxisAligned` locally; the gesture/creation code (`useAddMortiseTenon`, `useScene`) imports
  the exported `isValidDadoSeat` directly (those modules aren't imported by `dado.ts`).
- Tenon = 0/2/4 shoulder strips over `tenonLength`, leaving a centered `tenonThickness × tenonWidth`
  tongue; a strip vanishes when its margin is 0 (full-width / full-thickness).
- Mortise = one pocket `BoxCut`, cross-section oriented to the tenon's thickness/width via a
  `deriveDadoAxes`-style world-axis alignment; blind depth = `tenonLength + clearance`, or full
  thickness when `through`.
- Seat mirrors `computeDadoSeat` with `depth = tenonLength` and 2-axis centering: drops the tongue tip
  on the pocket bottom and aligns the tongue center to `(offsetU, offsetV)` on the face.
- `offsetU`/`offsetV` are auto-derived at creation (`computeMortiseOffset`) and editable.
- 5th exclusive viewport mode (shortcut `m`), mirroring the half-lap wiring. JP4's suggested
  `activeMode` refactor was deliberately deferred.
- No OCCT/mesh/export/drawing change — everything is ordinary `BoxCut`s. Interactive 3D verification
  is a human step (OCCT WASM doesn't boot headless).
