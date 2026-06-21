# Dowel 2D Drawings — Sub-project 4: Side + End orthographic sheets

**Date:** 2026-06-21
**Status:** Approved design, pending implementation plan

---

## Context

The dowel effort has shipped in sub-projects:

| Sub-project | Contents | Status |
|---|---|---|
| 1. Dowel primitive + BOM | `CylinderPart`, OCCT cylinder, mesh, viewport, add/duplicate, dims, STL/STEP, Dowels BOM | Done |
| 2. Dowel cuts | end cuts, lateral notches, axial + transverse bores; click-to-seed + parametric edit | Done |
| 3. Dowel snap-align | cap-to-face snapping; `snapMath` cylinder variant | Done |
| **4. Dowel 2D drawings** | **circle + rectangle orthographic shop drawings** | **This spec** |

`CylinderPart` (`src/scene/types.ts`) carries `diameter`, `length`, and a
`cuts: DowelCut[]` union of four cut types (`DowelEndCut`, `DowelNotch`,
`DowelBoreAxial`, `DowelBoreTransverse`). The 2D shop-drawing pipeline
(`src/geom/drawing.ts` → `src/ui/buildSvg.ts` / `src/ui/buildDxf.ts` →
`src/ui/DrawingViewer.tsx`, design `2026-06-07-2d-shop-drawings-design.md`)
currently produces sheets for **boards only**: `buildDrawingSheets` filters
`p.kind === 'board'` and dowels silently disappear from both the cover sheet and
the per-part sheets. The SP2 spec explicitly deferred dowel drawings to "SP4 —
the drawings entry stays disabled for cylinders."

This spec lifts that restriction: every visible dowel gets a two-view technical
drawing, and dowels appear on the project cover sheet alongside boards.

## Goal

Generate printable, downloadable 2D shop drawings for dowels. Each visible
`CylinderPart` gets a **two-view** drawing — a **Side** (longitudinal rectangle)
view and an **End** (circle) view — with overall dimensions (⌀ + length) and
full geometric rendering of all four cut types with position/size dimensions.
Dowels are listed on the existing project cover sheet. Output reuses the
existing three delivery paths unchanged: browser Print, SVG download, DXF
download.

**Scope:** Visible dowels only, A4 landscape, one sheet per dowel plus the
shared cover sheet. Reuses all existing viewer/print/download infrastructure.

## Decisions resolved with the user

1. **Two views** — Side (rectangle, length × diameter) + End (circle, diameter).
   No third view (a dowel is rotationally symmetric; a second longitudinal view
   would be redundant).
2. **Full cut geometry + dimensions** — all four cut types are drawn to scale
   with position/size dimension callouts, not reduced to markers or a table.
3. **Roll all cuts into one Side view.** A dowel is rotationally continuous;
   `DowelNotch` and `DowelBoreTransverse` carry an azimuth, but the Side view is
   a single fixed longitudinal projection. The **End** (circle) view shows true
   azimuth (notch chord/flat, transverse-bore hole, axial-bore concentric
   circle at their real angular positions). The **Side** view shows each cut at
   its true **axial position and radial depth/size**, with azimuth as a text
   label (`az N°`). This is the standard turned-part convention (longitudinal +
   end). **Accepted v1 limitation:** two cuts at the same axial position but
   different azimuth can visually overlap in the Side view; the End view and the
   `az N°` labels disambiguate them. No overlap-resolution logic in v1.

## Approach (chosen)

**Approach A — a separate `DowelView` view type and a `shape: 'dowel'` part-sheet
variant, mirroring how SP2 chose a separate `DowelCut` union over generalizing
the board's `CutDef`.** The board's `DrawingView` is rectilinear: `boardRect`,
`cuts: Rect2D[]`, axis-aligned `DimLine`s. Dowel drawings need circles, chords,
and dashed (hidden) bore profiles — primitives the board view cannot express.
Bolting optional circle/segment arrays onto the board `DrawingView` (Approach B)
would leak dowel-only fields and `undefined` checks through the board render
paths in both `buildSvg` and `buildDxf`. Approach A keeps board rendering byte-
for-byte unchanged and gives the round geometry a clean primitive set.

Rejected:
- **Approach B (generalize `DrawingView`)** — pollutes the board type; every
  board cut rect would coexist with empty `circles`/`segments` arrays.
- **Approach C (a new top-level `kind: 'dowel-part'` sheet)** — would force
  `DrawingViewer.tsx` (filename + `Part N of M` label, both keyed on
  `kind === 'cover'` vs. else) to learn a third kind. Keeping `kind: 'part'`
  with a `shape` discriminant leaves the viewer untouched.

## Design

### 1. Data model (`src/geom/drawing.ts`)

Reused as-is: `Point2D`, `Rect2D`, `DimLine`, `CutLabel`.

New renderer-agnostic primitives (pure geometry, no SVG/DXF strings):

```ts
export interface DrawCircle {
  cx: number
  cy: number
  r: number
  dashed: boolean   // hidden bore profile when true
}

export interface DrawSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  dashed: boolean
}

export interface DrawRect {
  rect: Rect2D
  dashed: boolean
}
```

New view type for dowels (view-local mm coords, origin top-left, same
convention as `DrawingView`):

```ts
export interface DowelView {
  label: 'Side' | 'End'
  outline: Point2D[]        // closed silhouette polygon
                            //   Side: rectangle (length × ⌀), bevelled by end cuts
                            //   End:  empty; the boundary is the first DrawCircle
  circles: DrawCircle[]     // End boundary + axial-bore concentric; transverse-bore profiles
  rects: DrawRect[]         // Side notch slots
  segments: DrawSegment[]   // end-cut trim lines, notch chords (End), hidden bore walls
  cutLabels: CutLabel[]     // size/azimuth labels positioned on each cut
  noteLabels: CutLabel[]    // free-floating notes (end-cut angle)
  dims: DimLine[]           // overall + per-cut dimension lines
  placement: Point2D        // top-left on the A4 sheet (mm)
}
```

`CoverRow` is generalized so the cover table can list boards **and** dowels in
one column:

```ts
export interface CoverRow {
  index: number
  label: string
  material: string
  dimensions: string   // board "L×W×T"; dowel "⌀D×L"
  cutCount: number
}
```

(Replaces the board-only `length`/`width`/`thickness` fields. The cover-table
header column changes from `"L × W × T"` to `"Dimensions"`.)

`DrawingSheet` becomes a three-arm union; the part arm splits by `shape`:

```ts
interface PartSheetCommon {
  partLabel: string
  material: string
  color: string
  date: string
  scaleLabel: string
}

export type DrawingSheet =
  | { kind: 'cover'; projectName: string; date: string; rows: CoverRow[] }
  | (PartSheetCommon & { kind: 'part'; shape: 'board'; views: [DrawingView, DrawingView, DrawingView] })
  | (PartSheetCommon & { kind: 'part'; shape: 'dowel'; views: [DowelView, DowelView] })
```

The existing board sheet gains `shape: 'board'` (one-line change in
`buildDrawingSheets`). All `PartSheetCommon` fields are unchanged, so
`DrawingViewer.tsx` (which only reads those + `kind === 'cover'`) needs **no
change**.

### 2. Local frame & projection conventions

A dowel's local frame (per SP1): axis along **+Z**, base circle centered at the
local origin, extending to `z = length`. Radius `R = diameter / 2`. Azimuth `θ`
is degrees around +Z measured `atan2(y, x)`, `0°` facing +X (same convention as
`DowelCut`).

**Side view** (the rolled longitudinal projection):
- Horizontal axis `x2d` = axial position `z`, `0 … length`.
- Vertical axis `y2d` = radial, with the dowel **centerline at mid-height**.
  Top edge `y2d = 0` is `+R`, bottom edge `y2d = ⌀` is `−R`, centerline at
  `y2d = R`. All scaled by `scale`.
- `outline` = the rectangle `[(0,0),(L,0),(L,⌀),(0,⌀)]·scale`, trimmed at each
  capped end by any `DowelEndCut` (see §3, reusing the mitre-outline pattern).

**End view** (looking down −Z onto the `+Z` cap):
- A circle of radius `R·scale`, centered in its own placement box of side
  `⌀·scale`; center at `(R, R)·scale`. Stored as the first `DrawCircle`
  (`dashed: false`); `outline` is empty.
- Azimuth maps to screen angle: a feature at azimuth `θ` sits in direction
  `(cos θ, −sin θ)` from center (screen y is down, so the world +Y maps to
  screen −y). `0°` → screen right (+x), `90°` → screen up (−y).

### 3. Per-cut projection (the core of this spec)

All math is pure and lives in `drawing.ts` (THREE-free, Node-testable). Each cut
contributes primitives to the Side and/or End view per the table; degenerate
cuts (e.g. `depth <= 0`, `offset <= 0 && angle <= 0`) contribute nothing,
matching the OCCT no-op rules in SP2.

| Cut | Side view | End view |
|---|---|---|
| **End cut** (`DowelEndCut`) | Trim the `outline` at the chosen cap. Square (`angle = 0`): the end edge moves inward by `offset` (shorter rectangle). Angled (`angle > 0`): the end edge becomes a slanted `segment`; drop across the diameter `= ⌀·tan(angle)` (worst-case silhouette, rolled). `noteLabel` `"{angle}°"` at the bevel midpoint; `dim` for `offset` from the end when `offset > 0`. | — (an end cut acts at the cap; not represented in the End view in v1). |
| **Notch** (`DowelNotch`) | `DrawRect` slot (solid): `x = (position − width/2)·scale`, `w = width·scale`, against the **top** edge (`y = 0`), `h = depth·scale`. `cutLabel` `"{width}×{depth} az{azimuth}°"` centered in the slot. `dim`s: axial `position` from the near end (horizontal) and `depth` (vertical). | Chord flat: a `segment` perpendicular to the azimuth direction at radial distance `(R − depth)` from center, clipped to the circle (the flat the notch leaves). `cutLabel` `"d{depth}"` near the chord. |
| **Axial bore** (`DowelBoreAxial`) | Two **dashed** `segment`s (the bore walls) at `y = R ± boreR`, running from the chosen cap inward by `min(depth, length)`; a dashed end `segment` closes a blind hole. `cutLabel` `"⌀{diameter} {depth≥length ? 'through' : depth}"`. `dim`: bore `depth` along the axis when blind. | Concentric **dashed** `DrawCircle`, radius `boreR·scale`, centered on the dowel center. |
| **Transverse bore** (`DowelBoreTransverse`) | Two **dashed** `segment`s (hidden hole walls) at `x = (position ± boreR)`, spanning the full diameter (top to bottom edge). `cutLabel` `"⌀{diameter} az{azimuth}°"`. `dim`: axial `position` from the near end. | Two **dashed** `segment`s (the hole walls) parallel to the azimuth direction, separated by `diameter`, each clipped to the circle — the slot the crosswise hole projects to when viewed end-on. |

`boreR = diameter / 2` of the bore (not the dowel). All primitive coordinates
are pre-multiplied by `scale` and expressed in the view's local frame; the
renderer offsets by `placement`.

### 4. Scale, layout, dimensions (`buildDrawingSheets`)

Reuse the board sheet's constants (`MARGIN`, `TITLE_H`, `DIM_MARGIN`, `GAP`,
`AREA_W`, `AREA_H`, `STANDARD_SCALES`, `toScaleLabel`).

- **Scale:** `raw = min((AREA_W − GAP)/(L + ⌀), AREA_H/⌀)`; round **down** to the
  nearest `STANDARD_SCALES` factor (a dowel-specific `selectDowelScale`, since
  the board `selectScale` takes `L, W, T`). Label via the shared
  `toScaleLabel`.
- **Layout:** third-angle, mirroring the board's Face/End pairing:
  - Side: `placement = (MARGIN, MARGIN)`, box `L·scale × ⌀·scale`.
  - End: `placement = (MARGIN + L·scale + GAP, MARGIN)`, box `⌀·scale × ⌀·scale`.
- **Overall dims:** Side view carries `length` (horizontal `DimLine` below,
  `offset = ⌀·scale + BOARD_DIM_OFFSET`) and `⌀{diameter}mm` (vertical `DimLine`
  to the right). End view carries no overall dims (diameter already labelled).
- **Cut dims:** per the §3 table, offset `CUT_DIM_OFFSET` beyond the overall
  dims, matching the board convention.

`buildDrawingSheets` keeps its current signature and structure:

```ts
export function buildDrawingSheets(parts: Part[], projectName: string): DrawingSheet[]
```

- **Cover rows:** iterate **all** parts (boards and dowels) in input order;
  board rows format `dimensions = "${L}×${W}×${T}"`, dowel rows
  `dimensions = "⌀${diameter}×${length}"`; `cutCount = cuts.length`.
- **Part sheets:** for each board emit the existing `shape: 'board'` sheet
  (unchanged logic + the `shape` tag); for each dowel emit a new `shape: 'dowel'`
  sheet built by a new private `buildDowelViews(dowel, scale)` →
  `[DowelView, DowelView]`.

### 5. SVG renderer (`src/ui/buildSvg.ts`)

Board paths untouched. Add:

- `svgCircle(cx, cy, r, style)` helper (`<circle>`).
- A `dashed` style fragment: `'stroke-dasharray': '1.2,0.8'` applied to dashed
  circles/segments/rects.
- `renderDowelView(view: DowelView)` — emits, in order: view label `<text>`;
  `outline` as `<polygon>` (Side) when non-empty; each `DrawCircle` as
  `<circle stroke=#000 fill=none>` (dashed gets the dash-array, solid the
  boundary stroke `0.3`); each `DrawRect` as the existing cut-rect style; each
  `DrawSegment` as `<line>` (solid `#000 0.3` for trim lines/chords, dashed for
  hidden walls); `cutLabels` and `noteLabels` via the existing text styles;
  `dims` via the existing `renderDimLine`.
- `buildSvg` switch: `kind === 'cover'` → cover; else `shape === 'dowel'` →
  `views.map(renderDowelView)` + `renderTitleBlock`; else the existing board
  path. `renderTitleBlock` is shape-agnostic (reads `PartSheetCommon`) — reused
  verbatim.
- `renderCoverSheet`: header `"Dimensions"`; row cell reads `row.dimensions`.

### 6. DXF renderer (`src/ui/buildDxf.ts`)

Board paths untouched. Add:

- `dxfCircle(layer, cx, cy, r)` → `CIRCLE` entity (`0/CIRCLE, 8/layer, 10/x,
  20/fy(y), 30/0, 40/r`).
- **Dashed lines in DXF r12** require a linetype. Add a `DASHED` `LTYPE` to the
  `TABLES` section (an `LTYPE` table alongside the existing `LAYER` table:
  pattern length `2.0`, two elements `[1.2, −0.8]`) and emit a per-entity
  linetype override (group code `6\nDASHED`) on dashed `CIRCLE`/`LINE` entities.
  Solid entities omit the override (inherit `CONTINUOUS`). This is the one new
  DXF mechanism; everything else reuses `dxfLine`/`dxfText`/`dxfRect`.
- A `HIDDEN` layer is added to the `LAYER` table for dashed geometry (keeps
  hidden lines on their own toggleable layer, CAD convention).
- `dxfDowelView(view)` — mirrors `renderDowelView`: `outline` as `LINE`s on
  `OUTLINE`; circles via `dxfCircle` (solid on `OUTLINE`/`CUTS`, dashed on
  `HIDDEN`); rects via `dxfRect` on `CUTS`; segments as `LINE`s (solid on
  `OUTLINE`/`CUTS`, dashed on `HIDDEN`); labels via `dxfText` on `TEXT`; dims
  via `dxfDimLine`.
- `buildDxf` switch gains the `shape === 'dowel'` branch (parallel to §5).
- `dxfCoverSheet`: `"Dimensions"` header; cell reads `row.dimensions`.

### 7. Integration (`src/App.tsx`, `src/ui/DrawingViewer.tsx`, `src/ui/FileMenu.tsx`)

**No changes required.**

- `App.tsx` already passes `visibleParts` (boards + dowels) to
  `buildDrawingSheets`; `canExport` already counts any visible part.
- The "2D Drawings…" menu item's `disabled={!canExport}` guard already enables
  for dowel-only scenes — today such a scene yields a cover with rows but no
  part sheets; this spec makes the part sheets appear.
- `DrawingViewer.tsx` reads only `kind === 'cover'`, `partLabel`, and the SVG
  string from `buildSvg`; the `shape` discriminant is invisible to it.

This is the payoff of Approach A's `kind: 'part'` + `shape` choice: the entire
viewer/menu/app surface is untouched; the change is confined to `drawing.ts`,
`buildSvg.ts`, `buildDxf.ts`.

### 8. File format

No change. Drawings are derived from scene state at viewer-open time and are not
persisted. No `FILE_FORMAT_VERSION` bump.

## Testing

All tests run in Vitest + happy-dom, no browser or WASM.

### `drawing.test.ts` (extend)
- Dowel, no cuts → cover (rows include the dowel with `dimensions = "⌀D×L"`) +
  one `shape: 'dowel'` part sheet; Side `outline` is the `L×⌀` rectangle; End
  has one solid `DrawCircle` of radius `R·scale`; overall dim labels
  (`"{L}mm"`, `"⌀{D}mm"`); scale label `"1:N"`.
- One of each cut type, asserted independently:
  - **End cut** square → Side `outline` shortened by `offset`; angled → a trim
    `segment` + `"{angle}°"` note; nothing in End view.
  - **Notch** → Side solid `DrawRect` at the right axial position + `az` label +
    position/depth dims; End view chord `segment` at radius `R − depth`.
  - **Axial bore** → Side two dashed wall `segment`s from the chosen cap +
    `through`/depth label; End concentric dashed `DrawCircle`.
  - **Transverse bore** → Side two dashed `segment`s at `position ± boreR`; End
    two dashed `segment`s.
- Degenerate cuts contribute no primitives (`depth = 0`, `offset = 0 &&
  angle = 0`).
- Mixed scene (board + dowel) → cover rows in input order with correct
  per-kind `dimensions`; sheet count = 1 + boards + dowels; board sheet carries
  `shape: 'board'`, dowel sheet `shape: 'dowel'`.
- Scale selection: dowels at various ⌀/L produce the expected rounded-down
  factor.

### `buildSvg.test.ts` (extend)
- Dowel sheet output is well-formed XML (`DOMParser`, no errors).
- End view emits a `<circle>` with radius matching `R·scale`.
- Dashed primitives carry `stroke-dasharray`; solid ones do not.
- Notch slot `<rect>` present; cut labels contain `"az"` and size text.
- Title block contains the dowel `partLabel` and scale label (shared renderer).
- Cover header is `"Dimensions"`; a dowel row contains `"⌀"`.

### `buildDxf.test.ts` (extend)
- Dowel sheet contains `CIRCLE` entities (End boundary + any bores).
- `TABLES` defines a `DASHED` `LTYPE` and a `HIDDEN` layer; dashed entities
  carry the `6\nDASHED` override.
- Y-flip holds for dowel coordinates (a point at `y_svg = 0` → `y_dxf = 210`).
- Cover header `"Dimensions"`; dowel row text contains `"⌀"`.

### `DrawingViewer.test.tsx` (extend, light)
- A `shape: 'dowel'` sheet renders (SVG present, `Part N of M — {label}` label,
  SVG/DXF download with the dowel filename). Confirms the viewer is genuinely
  shape-agnostic.

## Phasing

One spec, shippable increments; each phase green (`typecheck && lint && test`)
before the next:

1. **Model + scaffold + overall views** — new `drawing.ts` types
   (`DrawCircle`/`DrawSegment`/`DrawRect`/`DowelView`, `CoverRow.dimensions`,
   `shape`-tagged `DrawingSheet`); `buildDrawingSheets` dowel cover rows +
   cut-less dowel `[Side, End]`; `buildSvg`/`buildDxf` dowel branches +
   `svgCircle`/`dxfCircle` + cover `Dimensions` column; tests for an uncut
   dowel. Board sheets unchanged.
2. **End cut + notch** (outline trimming + solid slot + chord) — the
   non-hidden-line cuts; reuses mitre-outline trimming.
3. **Bores** (axial + transverse) — introduces dashed/hidden primitives, the
   SVG dash-array, and the DXF `DASHED` `LTYPE`/`HIDDEN` layer.

## Out of scope (queued)

- Cross-view hidden-line projection beyond the per-cut profiles specified above.
- Overlap resolution for cuts colliding at the same axial position in the Side
  view (disambiguated by the End view + `az` labels in v1).
- A second longitudinal view at a chosen azimuth (the user chose two views).
- Sectional views / true cross-sections.
- 3D isometric thumbnail on sheets.
- User-configurable paper size or scale override (A4 landscape, auto-fit only).
- Grain/finish annotation; smooth-shaded curved-surface rendering.
