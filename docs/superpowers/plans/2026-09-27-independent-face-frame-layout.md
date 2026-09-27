# Independent face-frame layout — Stage 1

**Date:** 2026-09-27
**Base:** main at `39055f4597fdcbfb262dab6a34ee6f9a87dfd954`

## Goal

Allow a face frame to contain a centre stile for a pair of doors without requiring a structural
carcase division behind that stile.

This is the first independent-layout slice. It deliberately implements the case the current front
model can manufacture truthfully: one structural opening, one two-leaf door front, and one
frame-only centre stile. Arbitrary independent rails/front zones remain a later slice because the
current section model owns one front specification per leaf section.

## Model

- `FaceFrameParams.pairStile?: boolean` opts a framed cabinet into frame-only pair stiles.
- Absence/false is byte-for-byte legacy behavior: structural divisions still derive mid members.
- `FrameGeometry.openings` remains the section-level clear opening used by interiors.
- `FrameGeometry.leafOpenings` adds clear rectangles keyed by section + door leaf.
- A pair stile role is stable: `stile-pair-${sectionId}`.
- Pair stile width uses the existing `midStileWidth`; there is still one stated width for an
  internal stile.

## Geometry

For every leaf section whose front is a two-leaf door and whose cabinet enables `pairStile`:

1. Centre a `midStileWidth` stile in that section's already-resolved framed rectangle.
2. Keep the section-level opening unchanged for interior ownership.
3. Emit left/right leaf clear openings on either side of the stile.
4. Size inset leaves from those clear openings.
5. Size overlay/half-overlay leaves to the pair-stile centreline with one reveal between leaves.

The pair stile is frame-only. It must not create a carcase division panel, joint or section.

## Manufacturing

- `regenerateFaceFrames` emits the new stile as solid frame stock.
- Door cup boring and outer-stile hinge hardware continue to derive from emitted front cells.
- BOM quantity remains cup-driven.
- Shop drawings receive the new stile automatically through the existing frame-board pipeline.

## UI

Add a **Pair centre stile** checkbox under Frame. It is independent of the Structure divider field.
The control may be enabled before a pair front exists; geometry simply emits no pair stile until a
two-leaf door needs one.

## Tests

- Geometry: pair stile appears without a structural division and creates two leaf openings.
- Fronts: inset and overlay pairs size against the stile correctly.
- Regeneration: pair stile board exists while no division board exists.
- Hardware: hinge quantity still equals emitted cup count.
- UI: toggling Pair centre stile updates frame params independently of Structure.
- Legacy parity: omitted/false `pairStile` preserves existing geometry.

## Deferred

Independent rails, arbitrary user-positioned members, multiple front zones in one structural
section, and shelf insertion/access rules behind a frame-only centre stile.
