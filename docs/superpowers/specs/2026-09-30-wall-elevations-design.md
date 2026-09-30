# Dimensioned wall elevations — design

Status: approved in brainstorming, 2026-09-30.
Plan: `docs/superpowers/plans/2026-09-30-wall-elevations.md`.
Notes: `docs/superpowers/notes/2026-09-30-wall-elevations-notes.md`.

Part of Stage 2 of `2026-09-29-design-to-manufacturing-architecture-design.md`. It closes the
first follow-up listed in `notes/2026-09-29-stage-2-room-geometry-notes.md`.

## Problem

`wallElevation()` in `src/scene/roomAssessment.ts` returns spans for one wall, and
`RoomAssessmentPanel` draws them as an ad hoc SVG: no scale, no dimension chains, no export. The
architecture spec requires one drawing model to supply plans, elevations and sheets with shared
dimensions. This stage makes the elevation a real drawing.

## Decisions

- **Output:** the Room panel and an exported drawing-deck sheet, both fed by one pure function.
- **Dimensions:** the full set (chain from wall start, gaps, sill heights, overall length with
  provenance). Floor and site-level evidence and clearance warnings on the drawing are out of
  scope: their rules are not settled.
- **Structure:** a new builder beside `assembly.ts`, not an extension of `AssemblyView`.

## Data shape (`src/geom/wallElevation.ts`)

Pure: no React, no THREE. `buildWallElevation(room, wall, scene, cabinetIds)` returns, in
**unscaled millimetres** (x along the wall from `wall.start`, z up from the floor):

```
WallElevationView {
  wallId, wallName
  bounds: Rect2D            // 0..wallLength x 0..top of tallest span
  spans: ElevationSpan[]    // opening | cabinet: x0 x1 z0 z1, id, label
  dims: AssemblyDim[]       // the assembly views' own type, so assemblyDimLine works unchanged
  length: { drawn; measured?: { value, uncertainty, source }; verified: boolean }
}
```

`wallElevation()` and `ElevationSpan` stay in `roomAssessment.ts` as the span source and the builder
calls them (refinement, see below); `ElevationSpan` gains `kind: 'opening' | 'cabinet'`. The builder emits a side and a ring, never a
page offset or a scale.

### Dimensions

- **Ring 1, below (horizontal):** one chain from the wall start, broken at every cabinet edge and
  opening edge; each segment labelled with its length (cabinet widths, gaps, opening widths). The
  segments before the first and after the last item are the gaps to the wall ends. Zero-width
  segments are skipped.
- **Ring 2, below (horizontal):** the overall wall length, labelled by provenance:
  - site-measured: `3983 ±5 (site)`
  - drawn only: `3983 drawn — unverified`
  - drawn and measured disagree beyond the uncertainty: `drawn 3983 / site 3950 ±5`
  - drawn and measured agree within the uncertainty: the measured form.
  The word "drawn" is in the label itself, honouring the Stage 2 rule that a drawn length is never
  presented as a site measurement.
- **Left (vertical):** each cabinet's height; each opening's sill height and height. Overlapping
  dimensions stack into rings 1 and 2.

## Sheet (`drawing.ts`)

New `DrawingSheet` member `{ kind: 'elevation'; roomName; wallName; date; scale; scaleLabel;
ring; view: PlacedWallElevationView }`.

- One sheet per wall that has a span or a measured length. A zero-length wall gives none; a wall
  with no spans still shows its length dimension.
- Scale: the largest `ELEVATION_SCALES` entry that fits (`[...STANDARD_SCALES, 0.02, 0.01, 0.005]`;
  `STANDARD_SCALES` stops at 1:20 and is left alone for board and assembly sheets), with the ring reserved on all four sides
  (as `selectAssemblyScale` does). About 3983 mm fits at 1:20 on A4 landscape; over about 4900 mm
  drops to 1:50.
- Ring size comes from `assembly.ts`'s em table (`RING_EM`, `TICK_EM`, `TEXT_GAP_EM`, `CHAR_EM`),
  sized by the widest **vertical** label only; the long horizontal provenance label lies along
  ring 2 and needs height, not width. No absolute-millimetre ring.
- `buildDrawingSheets` takes an optional wall-elevation input; elevation sheets follow the cover
  and precede the assembly sheets. Inputs are scoped by the same `cabinetIds` the Room panel uses.

## Renderers and UI

- `buildSvg.ts`, `buildDxf.ts`, `buildPdf.ts` each gain an `'elevation'` case: floor line, spans
  (openings dashed), span labels, and every dimension through `assemblyDimLine`. The DXF uses the
  assembly sheet's layers. Title block: `<room> — <wall>`, scale, date; a wall that is not
  site-verified also gets "Wall length not site-verified".
- `RoomAssessmentPanel` replaces its ad hoc SVG with the same sheet via
  `buildSvg(sheet, { embedded: true })` (fluid width, no mm size, no document-global print rule),
  memoised per wall, keeps the
  `data-testid="elevation-<id>"` hooks, and adds per-wall SVG/DXF export via `sheetFilename.ts` and
  `downloadBlob`.
- `DrawingViewer` lists elevation sheets without change to its switching logic; `App` builds the
  inputs from the project's rooms.

## Out of scope

Floor/site-level evidence and clearance annotations on the drawing; door-swing refinement; any
scene-data, file-format or IndexedDB change (nothing new is stored, so no `FILE_FORMAT_VERSION`
bump).

## Errors

A placement offset beyond a wall end keeps its existing Stage 2 warning; the drawing shows the real
extent and does not clip.

## Tests

Deterministic tests on the pure builder; each guard mutation-tested per CLAUDE.md.

- Kitchenette fixture (about 3983 mm) and the synthetic two-wall rotated return; the rotated wall
  pins the tangent projection, which a straight fixture cannot.
- Chain segments sum to the wall length.
- Four provenance cases: measured, drawn-only, in-tolerance, out-of-tolerance.
- A lopsided fixture pins wall-start versus wall-end orientation; a rendered-`y` test pins the z
  flip.
- One wall that forces 1:50.
- SVG, DXF and PDF draw the same dimension count for one fixture.
- Panel and deck each rendered once from the same scene.

## Refinements decided during planning and review

- `wallElevation()` stays in `roomAssessment.ts`; the builder wraps it. Surgical, no behaviour change.
- `ELEVATION_SCALES` extends `STANDARD_SCALES` with 1:50, 1:100, 1:200 for elevation sheets only.
- A span hanging past a wall end widens `bounds`; `originX` is where the wall start sits in view space.
- Ring width is sized from vertical labels only.
- Vertical dimensions: cabinet heights left, opening sill/height right; overlapping ones go to ring 2;
  identical ones are emitted once.
- The Room panel takes `roomName` and `projectName` props, passed by `ProjectPanel`.
- Review fix: `buildSvg(sheet, { embedded: true })` for the panel, so the embedded preview carries no
  fixed page size and no global `@media print` rule.
