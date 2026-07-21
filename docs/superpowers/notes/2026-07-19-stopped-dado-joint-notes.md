# Stopped (Blind) Dado Joint (JP3) — Implementation Notes

**Date:** 2026-07-19

- Composable `stopStart`/`stopEnd` on `DadoJoint` (default 0 = through, byte-identical to a
  through dado). Format 5→6; `parseFile` defaults both to 0 (defaults-first spread).
- Groove shortening lives entirely in `computeDadoGroove`'s run-axis lines; `ss = se = 0` is the
  identity, guarded by the pre-existing full-span groove test.
- The notch is a new pure `computeNotch` (full-thickness corner box, `depth` deep × `stop` wide),
  placed by the `atLow = (end === 'start') === aligned` world-direction sign mapping.
- **Notch is gated on a length/width housed end** (`faceAxes(housedEnd).depth !== 'z'`), mirroring
  how JP2's rabbet falls back to plain for thickness-seated ends. Without the gate a thickness-end
  notch degenerates (size.z assigned twice → zero-extent box). See spec §2/§5.
- Notch/groove clamp against different boards (housed width/length vs housing run/thickness):
  exact only for normal proportions; documented as out of scope for extreme stop/depth values.
- `reconcileJoints` needed no change — the generic distributor already scatters 1–4 cuts. Verified
  by test, not by editing production.
- No OCCT/mesh/export/drawing changes: the notch is an ordinary `BoxCut`.
