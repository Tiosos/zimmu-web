# 2D Shop Drawings — Design Spec

**Date:** 2026-06-07
**Status:** Approved, pending implementation plan

---

## Goal

Generate printable, downloadable 2D shop drawings from the current scene. Each visible board gets a three-view technical drawing (Face/Edge/End) with outer dimensions, cut outlines, and cut dimension callouts. Output in three formats: browser Print/PDF, SVG download, DXF download.

**Scope:** Visible boards only. One sheet per board plus a cover sheet. A4 landscape. Sub-project 2 of the export effort; enhanced cutting list (hardware, cost, BOM) is the follow-on and explicitly out of scope here.

---

## Section 1: Architecture

Four new files. All existing infrastructure (downloadBlob, FileMenu, download.ts) reused without modification.

```
src/geom/drawing.ts       Pure projection + layout math.
                          buildDrawingSheets(parts, projectName) → DrawingSheet[]
                          No DOM, no SVG strings — geometry types only.

src/ui/buildSvg.ts        buildSvg(sheet: DrawingSheet): string
                          Serializes a DrawingSheet to a self-contained SVG string.

src/ui/buildDxf.ts        buildDxf(sheet: DrawingSheet): string
                          Serializes a DrawingSheet to a DXF r12 string.
                          Manual generation — no external dependency.

src/ui/DrawingViewer.tsx  Modal: sheet navigation, Print, SVG + DXF download.
```

**Data flow:**

```
App.tsx
  visibleParts + projectName
    → buildDrawingSheets(parts, projectName): DrawingSheet[]   [on viewer open]
        → <DrawingViewer sheets={sheets} ...>
              → buildSvg(currentSheet)  rendered inline
              → Print button            → iframe print
              → Download SVG            → downloadBlob(buildSvg(sheet), ...)
              → Download DXF            → downloadBlob(buildDxf(sheet), ...)
```

`buildDrawingSheets` is synchronous. No worker. `DrawingViewer` receives pre-built sheets and does no computation itself. `App.tsx` calls `buildDrawingSheets` once when the viewer opens, caches result in `useState`, re-computes only when parts change.

**File menu:** "2D Drawings…" item added after "Export STEP…", same `disabled={!canExport}` guard (enabled when at least one visible part exists).

---

## Section 2: Core Types (`src/geom/drawing.ts`)

```ts
interface Point2D { x: number; y: number }
interface Rect2D  { x: number; y: number; w: number; h: number }

interface DimLine {
  axis: 'h' | 'v'    // horizontal or vertical
  start: number       // near coordinate along the axis (mm)
  end: number         // far coordinate (mm)
  offset: number      // distance the line sits off the shape edge (mm)
  label: string       // e.g. "320mm"
}

interface CutLabel {
  rect: Rect2D        // the cut's view-space rect
  text: string        // e.g. "20×30mm"
}

interface DrawingView {
  label: 'Face' | 'Edge' | 'End'
  boardRect: Rect2D         // board outline in view-local coords (mm, origin top-left)
  cuts: Rect2D[]            // cut outlines in view-local coords
  cutLabels: CutLabel[]     // inline size labels centered in each cut rect
  cutPosDims: DimLine[]     // position-offset dim lines (2 per cut: u-axis and v-axis)
  boardDims: DimLine[]      // outer board dimension lines
  placement: Point2D        // top-left corner on the A4 sheet (mm)
}

interface CoverRow {
  index: number
  label: string
  material: string
  length: number
  width: number
  thickness: number
  cutCount: number
}

type DrawingSheet =
  | { kind: 'cover'; projectName: string; date: string; rows: CoverRow[] }
  | { kind: 'part';  partLabel: string; material: string; color: string;
      views: [DrawingView, DrawingView, DrawingView]; scaleLabel: string }
```

**Public API:**

```ts
export function buildDrawingSheets(parts: Part[], projectName: string): DrawingSheet[]
```

Returns cover sheet first, then one `'part'` sheet per part in input order. Parts with `visible: false` are excluded by the caller (`App.tsx` passes `visibleParts`).

---

## Section 3: Projection Math

### Three views

Each board is a box of dimensions L (length) × W (width) × T (thickness) in local space, origin at (0, 0, 0).

| View | Projection plane | Board rect | Cuts shown |
|------|-----------------|------------|------------|
| Face | X–Y (looking –Z) | L × W | cuts on `+Z` / `–Z` faces |
| Edge | X–Z (looking –Y) | L × T | cuts on `+Y` / `–Y` faces |
| End  | Y–Z (looking +X) | W × T | cuts on `+X` / `–X` faces |

Each cut appears only in its primary view (the view where the cut face is directly visible). No cross-view hidden-line projection in v1.

### Cut projection onto a view

Given a cut with `face`, `position: Vec3`, `size: Vec3`, and the view's two in-plane axes `(u, v)`:

```
cut view-rect:
  x = position[u] - size[u] / 2
  y = position[v] - size[v] / 2
  w = size[u]
  h = size[v]
```

`faceAxes(face)` from `snapMath.ts` gives `{ depth, u, v }`. The `u` and `v` fields are the two in-plane axes.

### Sheet layout

- **Sheet:** A4 landscape, 297 × 210 mm
- **Margins:** 15 mm all sides
- **Title block:** 25 mm strip at the bottom
- **Drawing area:** 267 × 155 mm (above title block, inside margins)

Third-angle arrangement (origins relative to drawing area top-left):

```
[Face L×W]   [End W×T]
[Edge L×T]
```

- Face: placement = (0, 0)
- End: placement = (Face.scaledW + gap, 0)
- Edge: placement = (0, Face.scaledH + gap)

Gap between views: 15 mm.

### Scale selection

```
scale = min((areaW - gap) / (L + W), (areaH - gap) / (W + T))
```

Rounded **down** to the nearest standard factor from `[1, 0.5, 0.2, 0.1, 0.05]` (i.e., 1:1, 1:2, 1:5, 1:10, 1:20). Scale label written in the title block as `"1:N"`.

Note: `areaW` and `areaH` above are the drawing area minus an additional 20 mm margin on dim-line sides (Face view has dims below and to the right; Edge view has dims to the right). The view placement algorithm must shift views inward by the dim-line overhang so labels don't overflow the margins.

### Dimension lines

**Board dims:**
- Face view: `length` as a horizontal `DimLine` below the board rect (offset = 8 mm); `width` as a vertical `DimLine` to the right (offset = 8 mm).
- Edge view: `thickness` as a vertical `DimLine` to the right (offset = 8 mm). Length is already labelled on Face view.
- End view: no board dims (width and thickness already labelled).

**Cut dims (per cut, in its primary view):**
- 2 `DimLine`s: distance from nearest board edge to near edge of cut, one per in-plane axis (u and v).
- Offset: 5 mm beyond the board dim lines (13 mm from board edge).
- Inline size label: `"${size[u]}×${size[v]}mm"` centered in the cut rect (via `CutLabel`).

---

## Section 4: SVG Builder (`src/ui/buildSvg.ts`)

```ts
export function buildSvg(sheet: DrawingSheet): string
```

Returns a self-contained SVG string with `<?xml version="1.0"?>` header, `xmlns="http://www.w3.org/2000/svg"`, `viewBox="0 0 297 210"`, `width="297mm"`, `height="210mm"`.

All coordinates in mm. A small private `el(tag, attrs, ...children): string` helper serializes elements without DOM.

**Visual spec per part sheet:**

| Element | SVG element | Style |
|---------|-------------|-------|
| Board outline | `<rect>` | `stroke="#000" fill="none" stroke-width="0.3"` |
| Cut outline | `<rect>` | `stroke="#444" fill="rgba(0,0,0,0.06)" stroke-width="0.2"` |
| Cut size label | `<text>` centered in cut rect | `font-size="2.5" fill="#333" text-anchor="middle" dominant-baseline="middle"` |
| Dim line + ticks | 3× `<line>` | `stroke="#555" stroke-width="0.15"` |
| Dim label | `<text>` centered on dim line | `font-size="2" fill="#444" text-anchor="middle"` |
| View label | `<text>` above each view | `font-size="3" fill="#888"` |
| Title block border | `<rect>` | `stroke="#000" fill="none" stroke-width="0.3"` |
| Part label | `<text>` in title block | `font-size="7" font-weight="bold" fill="#000"` |
| Material / scale / date | `<text>` in title block | `font-size="4" fill="#444"` |
| Color swatch | `<rect fill="{color}">` | 6 × 4 mm in title block |

**Tick marks:** each `DimLine` has 1.5 mm perpendicular ticks at both ends.

**Cover sheet:** project name (12pt bold), date (5pt), then a table drawn as `<rect>` cells + `<text>`. Header row background `fill="#eee"`. Columns: `#`, Label, Material, L × W × T, Cuts.

**Print:** the SVG includes a `<style>` block:
```css
@media print { svg { width: 100%; height: auto; page-break-after: always; } }
```

---

## Section 5: DXF Builder (`src/ui/buildDxf.ts`)

```ts
export function buildDxf(sheet: DrawingSheet): string
```

DXF r12. Structure: `HEADER` → `TABLES` (layer definitions) → `ENTITIES` → `EOF`. No external dependency; hand-serialized template strings.

**Layers:**

| Layer | Contents |
|-------|----------|
| `OUTLINE` | Board outline polylines |
| `CUTS` | Cut outline polylines |
| `DIM` | Dimension lines and ticks |
| `TEXT` | All text (labels, dim values, title block text) |
| `TITLE` | Title block border |

**Entities:**

| Source | Entity |
|--------|--------|
| Board outline | `LWPOLYLINE` closed, 4 vertices |
| Cut outline | `LWPOLYLINE` closed, 4 vertices |
| Dim line + ticks | 3× `LINE` |
| Dim label / cut size label / view label | `TEXT` center-justified |
| Title block border | `LWPOLYLINE` closed |
| Title block text fields | `TEXT` |

**Coordinate system:** DXF Y-axis is up; SVG Y-axis is down. Flip: `y_dxf = 210 - y_svg`. X is unchanged. All units mm.

**Text encoding:** plain `TEXT` entities only (no `MTEXT`). Labels that exceed available cell width are truncated with `…` at generation time.

**One DXF file per sheet** (matching SVG: one download per sheet).

---

## Section 6: `DrawingViewer` Component (`src/ui/DrawingViewer.tsx`)

```ts
interface DrawingViewerProps {
  open: boolean
  onClose: () => void
  sheets: DrawingSheet[]
  projectName: string
}
```

Full-screen modal, same pattern as `CuttingList`. Sheet index tracked in local `useState`.

**Layout:**

```
┌──────────────────────────────────────────────────┐
│  2D Drawings        [← Cover  1/6 →]   [✕ Close] │
├──────────────────────────────────────────────────┤
│                                                  │
│          [current sheet SVG, fills panel]        │
│                                                  │
├──────────────────────────────────────────────────┤
│  [Print this sheet]  [Print all]                 │
│  [Download SVG]      [Download DXF]              │
└──────────────────────────────────────────────────┘
```

**Sheet label:** `"Cover"` for the cover sheet; `"Part N of M — {partLabel}"` for part sheets.

**Keyboard:** `←` / `→` navigate sheets (only when viewer is open).

**SVG preview:** `<div dangerouslySetInnerHTML={{ __html: buildSvg(currentSheet) }} />`. The wrapping div constrains width to the panel and centers the SVG.

**Print this sheet:** creates a hidden `<iframe>`, writes the current SVG into it wrapped in a minimal HTML document, calls `iframe.contentWindow.print()`, removes the iframe after the print dialog closes.

**Print all:** same iframe approach, but all sheets concatenated — each SVG wrapped in `<div style="page-break-after:always">`. This produces an N-page print job.

**Download SVG:** `downloadBlob(buildSvg(sheet), \`${filename}.svg\`, 'image/svg+xml')`

**Download DXF:** `downloadBlob(buildDxf(sheet), \`${filename}.dxf\`, 'application/dxf')`

Filename for part sheets: `{projectName}-{partLabel}.svg/.dxf`. Filename for cover: `{projectName}-cover.svg/.dxf`. Spaces replaced with `-`, lowercased.

---

## Section 7: Testing

All tests run in Vitest + happy-dom, no browser or WASM needed.

### `drawing.test.ts`

- Single board no cuts: 2 sheets (cover + 1 part); Face/Edge/End board rects match L×W, L×T, W×T; board dim labels correct; scale label format `"1:N"`
- Board with cut on `+Z`: cut rect in Face view, absent from Edge and End views; position dim offsets correct; size label text correct
- Cuts on all three face pairs: each cut lands in expected view only
- Scale selection: boards at various sizes produce expected rounded-down factor
- Cover sheet rows: one row per part, correct fields, parts in input order
- Multi-part scene: sheet count = 1 (cover) + part count

### `buildSvg.test.ts`

- Output is well-formed XML (parsed with `DOMParser` in happy-dom without errors)
- Board outline `<rect>` attributes match board rect dimensions
- Cut `<rect>` present for each cut in sheet
- Dim `<text>` content contains expected label strings (e.g. `"320mm"`)
- Title block contains part label and scale label
- Cover sheet `<text>` elements include all part labels

### `buildDxf.test.ts`

- Output starts with `"0\nSECTION\n2\nHEADER"` and ends with `"0\nEOF"`
- `LWPOLYLINE` count matches expected (1 board + N cuts + title block per sheet)
- Layer names `OUTLINE`, `CUTS`, `DIM`, `TEXT`, `TITLE` present in TABLES section
- TEXT entities contain expected label strings
- Y-flip: a point at `y_svg = 0` appears at `y_dxf = 210` in the output

### `DrawingViewer.test.tsx`

- Renders SVG content for initial sheet
- Prev/Next buttons update sheet label
- Keyboard `←` / `→` navigates between sheets
- Download SVG calls `downloadBlob` with `.svg` extension and `image/svg+xml` mime
- Download DXF calls `downloadBlob` with `.dxf` extension
- Print button creates an `<iframe>` element
- "Print all" includes content from all sheets

---

## Out of Scope

- Per-selected-part export (whole scene / visible parts only)
- ASCII DXF MTEXT encoding
- DXF 2000+ format (r12 is sufficient for FreeCAD/AutoCAD/CNC)
- Cross-view hidden-line projection of cuts
- 3D isometric thumbnail on sheets
- User-configurable paper size (A4 landscape fixed)
- User-configurable scale override (auto-fit only)
- Annotation of grain direction or edge banding
- Enhanced cutting list / BOM with hardware and cost (next cycle)
