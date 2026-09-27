# Face frames stage 3 — interiors follow the frame

**Date:** 2026-09-27  
**Scope:** Stage 3 of `docs/superpowers/specs/2026-09-24-face-frames-design.md`.

## Goal

Make every removable/moving interior item that must pass through a face-frame opening use the exact
opening already produced by `faceFrameGeometry`.

The section tree remains the source of the cabinet structure. The frame opening is a clearance
constraint layered on that structure; it does not replace section geometry.

## Decisions

- Drawer boxes use their leaf's framed opening for x/z extents.
- Adjustable shelves use their leaf's framed opening for width and usable pin-row height.
- Fixed shelves remain structural: they span the carcase section and keep their existing joinery.
  Narrowing them to the frame would detach them from their housings.
- Frameless cabinets keep using the section rectangle exactly as before.
- A framed inset front only consumes the depth that protrudes behind the back face of the frame.
  If the frame stock is at least as thick as the front, the front consumes zero carcase depth.
- Stage 4 hinge/plate machining remains out of scope.

## One geometry authority

`resolveCarcase` exposes its resolved section tree. Consumers obtain framed openings through
`frontGeometryOf(params, tree)`, which delegates to `faceFrameGeometry`.

No drawer or shelf re-derives stile/rail widths.

## Drawer depth

For a front of thickness `FT` and built frame depth `FD`:

- overlay / half-overlay: intrusion = 0
- frameless inset: intrusion = FT
- framed inset: intrusion = max(0, FT - FD)

The box starts at `y = intrusion`, and runner selection uses
`clearDepth - intrusion`. Box generation, slide machining, and hardware quoting must use the same
rule.

## Adjustable shelves

For a framed leaf, the usable shelf rectangle is the intersection of the section rectangle and its
frame opening.

- shelf width is usable x span minus the existing 2 mm clearance each side;
- pin-row first/count use the usable z span;
- depth rules stay unchanged;
- fixed shelves and structural divisions stay on section geometry.

## Tests

Use asymmetric frame widths and divided cabinets.

- a framed drawer box is narrower and vertically bounded by its frame opening;
- frameless drawer output is byte/value identical;
- framed inset drawer depth accounts only for front intrusion behind the frame;
- slide machining and hardware select the same runner as the generated box;
- adjustable shelf width follows the frame opening;
- pin rows and shelf seating use the framed opening's z span;
- fixed shelf width/joinery is unchanged by framing;
- divided leaves use their own frame openings;
- typecheck, lint, unit tests, production build, and Playwright E2E pass.
