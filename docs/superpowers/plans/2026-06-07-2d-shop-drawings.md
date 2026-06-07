# 2D Shop Drawings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate printable/downloadable three-view technical drawings (Face/Edge/End) for each visible board, with outer dimensions and cut callouts, delivered as browser Print, SVG, and DXF r12.

**Architecture:** Pure-function pipeline — `buildDrawingSheets()` (geometry, no DOM) → `buildSvg()` / `buildDxf()` (serializers) → `DrawingViewer` (modal, pre-built sheets, no computation). Everything downstream of `buildDrawingSheets` is I/O only.

**Tech Stack:** TypeScript strict, Vitest + happy-dom, Radix/Tailwind for UI. No new dependencies — DXF is hand-serialized r12 (LINE entities; no LWPOLYLINE which is DXF 2000+).

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/geom/drawing.ts` | **Create** | Types + `buildDrawingSheets()` |
| `src/geom/drawing.test.ts` | **Create** | TDD tests for drawing.ts |
| `src/ui/buildSvg.ts` | **Create** | `buildSvg(sheet): string` |
| `src/ui/buildSvg.test.ts` | **Create** | TDD tests for buildSvg |
| `src/ui/buildDxf.ts` | **Create** | `buildDxf(sheet): string` |
| `src/ui/buildDxf.test.ts` | **Create** | TDD tests for buildDxf |
| `src/ui/DrawingViewer.tsx` | **Create** | Modal: nav, print, download |
| `src/ui/DrawingViewer.test.tsx` | **Create** | TDD tests for DrawingViewer |
| `src/ui/FileMenu.tsx` | **Modify** | Add `onOpenDrawings` prop + menu item |
| `src/ui/FileMenu.test.tsx` | **Modify** | Tests for new prop/item |
| `src/App.tsx` | **Modify** | Wire viewer + `buildDrawingSheets` |
| `docs/superpowers/notes/2026-06-07-2d-shop-drawings-notes.md` | **Create** | Living implementation notes |

---

## Post-checklist (run after all tasks)

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All 3 must pass before marking the plan complete. Then follow with the next main task: **Enhanced Cutting List** (hardware items, cost/qty columns, supplier notes — full BOM).

---

## Task 1: Core types and `buildDrawingSheets`

**Files:**
- Create: `src/geom/drawing.ts`
- Create: `src/geom/drawing.test.ts`

### Background

`drawing.ts` is the geometry core. It converts `Part[]` into `DrawingSheet[]` — a pure intermediate representation consumed by both serializers. No DOM, no SVG strings, no Three.js.

Three views per board (local-space box L × W × T, origin at 0,0,0):

| View | Projection | Board rect | Cut faces |
|------|-----------|-----------|-----------|
| Face | X–Y (looking –Z) | L × W | `+Z` / `–Z` |
| Edge | X–Z (looking –Y) | L × T | `+Y` / `–Y` |
| End  | Y–Z (looking +X) | W × T | `+X` / `–X` |

`faceAxes(face)` from `src/scene/snapMath.ts` provides `{ depth, u, v }`:
- `+Z`/`–Z`: u=`'x'`, v=`'y'` → Face view, **no Y-flip**
- `+Y`/`–Y`: u=`'x'`, v=`'z'` → Edge view, **Y-flip** (Z increases upward in 3D, downward in SVG)
- `+X`/`–X`: u=`'y'`, v=`'z'` → End view, **Y-flip**

Y-flip for a cut: `y_svg = (boardH − (vPos + vSz/2)) × scale`
No-flip:         `y_svg = (vPos − vSz/2) × scale`

**Sheet constants (A4 landscape):**
- `SHEET_W = 297`, `SHEET_H = 210` (mm)
- `MARGIN = 15` (all sides)
- `TITLE_H = 25` (bottom strip)
- `DIM_MARGIN = 20` (reserved below/right drawing area for dim lines overhanging)
- `GAP = 15` (between views)
- `AREA_W = 297 − 2×15 − 20 = 247` (horizontal space for scale calc)
- `AREA_H = 210 − 2×15 − 25 − 20 = 135` (vertical space for scale calc)

**Scale selection:**
```
raw = min((AREA_W − GAP) / (L + W), (AREA_H − GAP) / (W + T))
scale = largest value from [1, 0.5, 0.2, 0.1, 0.05] that is ≤ raw
scaleLabel = "1:" + round(1 / scale)
```

**Spec deviation note:** The `DrawingSheet` `kind: 'part'` variant gains a `date: string` field (ISO `YYYY-MM-DD`) so the SVG/DXF title block can include a date without calling `new Date()` in the serializers.

- [ ] **Step 1: Write the failing tests**

Create `src/geom/drawing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildDrawingSheets } from './drawing'
import type { Part } from '../scene/types'

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 800,
    width: 300,
    thickness: 18,
    material: 'Plywood',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

describe('buildDrawingSheets', () => {
  it('returns 2 sheets for a single board (cover + 1 part)', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'My Project')
    expect(sheets).toHaveLength(2)
    expect(sheets[0].kind).toBe('cover')
    expect(sheets[1].kind).toBe('part')
  })

  it('part sheet has Face/Edge/End views with board rects matching L×W, L×T, W×T', () => {
    const sheets = buildDrawingSheets(
      [makeBoard({ length: 400, width: 200, thickness: 18 })],
      'P',
    )
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    // scale 1:5 → factor 0.2
    const s = 0.2
    const [face, edge, end] = sheet.views
    expect(face.label).toBe('Face')
    expect(face.boardRect.w).toBeCloseTo(400 * s, 3)
    expect(face.boardRect.h).toBeCloseTo(200 * s, 3)
    expect(edge.label).toBe('Edge')
    expect(edge.boardRect.w).toBeCloseTo(400 * s, 3)
    expect(edge.boardRect.h).toBeCloseTo(18 * s, 3)
    expect(end.label).toBe('End')
    expect(end.boardRect.w).toBeCloseTo(200 * s, 3)
    expect(end.boardRect.h).toBeCloseTo(18 * s, 3)
  })

  it('cut on +Z face appears only in Face view', () => {
    const cut = {
      id: 'c1', label: 'Dado', face: '+Z' as const,
      position: { x: 100, y: 150, z: 18 },
      size: { x: 20, y: 300, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(1)
    expect(edge.cuts).toHaveLength(0)
    expect(end.cuts).toHaveLength(0)
  })

  it('cut on +Y face appears only in Edge view', () => {
    const cut = {
      id: 'c1', label: 'Groove', face: '+Y' as const,
      position: { x: 400, y: 300, z: 9 },
      size: { x: 20, y: 10, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(0)
    expect(edge.cuts).toHaveLength(1)
    expect(end.cuts).toHaveLength(0)
  })

  it('cut on +X face appears only in End view', () => {
    const cut = {
      id: 'c1', label: 'Tenon', face: '+X' as const,
      position: { x: 800, y: 150, z: 9 },
      size: { x: 10, y: 20, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(0)
    expect(edge.cuts).toHaveLength(0)
    expect(end.cuts).toHaveLength(1)
  })

  it('selects scale 1:5 for a 400×200×18 board', () => {
    // raw = min((247-15)/(400+200), (135-15)/(200+18)) = min(0.387, 0.550) = 0.387 → 0.2
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200, thickness: 18 })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    expect(sheet.scaleLabel).toBe('1:5')
  })

  it('selects scale 1:10 for a 1200×600×20 board', () => {
    // raw = min((247-15)/1800, (135-15)/620) = min(0.129, 0.194) = 0.129 → 0.1
    const sheets = buildDrawingSheets([makeBoard({ length: 1200, width: 600, thickness: 20 })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part') throw new Error('expected part')
    expect(sheet.scaleLabel).toBe('1:10')
  })

  it('cover sheet has correct rows for all parts', () => {
    const parts = [
      makeBoard({ id: 'p1', label: 'Top', material: 'Oak', length: 800, width: 400, thickness: 18, cuts: [] }),
      makeBoard({ id: 'p2', label: 'Side', material: 'Plywood', length: 600, width: 300, thickness: 12, cuts: [] }),
    ]
    const sheets = buildDrawingSheets(parts, 'Cabinet')
    const cover = sheets[0]
    if (cover.kind !== 'cover') throw new Error('expected cover')
    expect(cover.projectName).toBe('Cabinet')
    expect(cover.rows).toHaveLength(2)
    expect(cover.rows[0]).toMatchObject({ label: 'Top', material: 'Oak', length: 800 })
    expect(cover.rows[1]).toMatchObject({ label: 'Side', material: 'Plywood', length: 600 })
  })

  it('sheet count = 1 + part count', () => {
    const parts = [makeBoard({ id: 'p1' }), makeBoard({ id: 'p2' }), makeBoard({ id: 'p3' })]
    const sheets = buildDrawingSheets(parts, 'P')
    expect(sheets).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/geom/drawing.test.ts
```

Expected: all tests fail with `Cannot find module './drawing'`.

- [ ] **Step 3: Implement `src/geom/drawing.ts`**

```ts
import type { CutDef, Part } from '../scene/types'
import { faceAxes } from '../scene/snapMath'

export interface Point2D { x: number; y: number }
export interface Rect2D  { x: number; y: number; w: number; h: number }

export interface DimLine {
  axis: 'h' | 'v'
  start: number    // near coordinate along the axis in view-local space (mm)
  end: number      // far coordinate in view-local space (mm)
  offset: number   // perpendicular distance from view origin (mm)
  label: string    // e.g. "320mm"
}

export interface CutLabel {
  rect: Rect2D   // view-local cut rect (same as cuts[i])
  text: string   // e.g. "20×18mm"
}

export interface DrawingView {
  label: 'Face' | 'Edge' | 'End'
  boardRect: Rect2D        // board outline in view-local coords (mm)
  cuts: Rect2D[]           // cut outlines in view-local coords (mm)
  cutLabels: CutLabel[]    // inline size labels, one per cut
  cutPosDims: DimLine[]    // offset-from-edge dims, up to 2 per cut
  boardDims: DimLine[]     // outer dimension lines
  placement: Point2D       // top-left of this view on the A4 sheet (mm)
}

export interface CoverRow {
  index: number
  label: string
  material: string
  length: number
  width: number
  thickness: number
  cutCount: number
}

export type DrawingSheet =
  | { kind: 'cover'; projectName: string; date: string; rows: CoverRow[] }
  | {
      kind: 'part'
      partLabel: string
      material: string
      color: string
      date: string
      views: [DrawingView, DrawingView, DrawingView]
      scaleLabel: string
    }

// ── Sheet constants (A4 landscape, mm) ────────────────────────────────────
const SHEET_H     = 210
const MARGIN      = 15
const TITLE_H     = 25
const DIM_MARGIN  = 20   // space reserved on bottom + right for overhanging dim lines
const GAP         = 15   // gap between views (also absorbs dim lines into the gap)
const AREA_W      = 297 - 2 * MARGIN - DIM_MARGIN   // 247
const AREA_H      = SHEET_H - 2 * MARGIN - TITLE_H - DIM_MARGIN  // 135
const BOARD_DIM_OFFSET = 8   // mm beyond board edge for outer dim line
const CUT_DIM_OFFSET   = 13  // mm beyond board edge for cut position dim line

const STANDARD_SCALES = [1, 0.5, 0.2, 0.1, 0.05]

function selectScale(L: number, W: number, T: number): number {
  const raw = Math.min((AREA_W - GAP) / (L + W), (AREA_H - GAP) / (W + T))
  return STANDARD_SCALES.find((s) => s <= raw) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1]
}

function toScaleLabel(scale: number): string {
  return `1:${Math.round(1 / scale)}`
}

// ── Cut projection ─────────────────────────────────────────────────────────
type Axis = 'x' | 'y' | 'z'

function projectCut(
  c: CutDef,
  uAxis: Axis,
  vAxis: Axis,
  boardH: number,
  scale: number,
  flipV: boolean,
): Rect2D {
  const uPos = c.position[uAxis]
  const vPos = c.position[vAxis]
  const uSz  = c.size[uAxis]
  const vSz  = c.size[vAxis]
  const x = (uPos - uSz / 2) * scale
  // flipV: Z increases upward in 3D but downward in SVG — invert so board top = view top
  const y = flipV
    ? (boardH - (vPos + vSz / 2)) * scale
    : (vPos - vSz / 2) * scale
  return { x, y, w: uSz * scale, h: vSz * scale }
}

// ── View builder ───────────────────────────────────────────────────────────
function buildView(
  viewLabel: 'Face' | 'Edge' | 'End',
  facePair: [CutDef['face'], CutDef['face']],
  cuts: CutDef[],
  boardW: number,
  boardH: number,
  scale: number,
  flipV: boolean,
  boardDimValues: { h?: number; v?: number },
): Omit<DrawingView, 'placement'> {
  const { u: uAxis, v: vAxis } = faceAxes(facePair[0])
  const boardRect: Rect2D = { x: 0, y: 0, w: boardW * scale, h: boardH * scale }

  const viewCuts = cuts.filter((c) => c.face === facePair[0] || c.face === facePair[1])

  const cutRects: Rect2D[] = viewCuts.map((c) =>
    projectCut(c, uAxis, vAxis, boardH, scale, flipV),
  )

  const cutLabels: CutLabel[] = viewCuts.map((c, i) => ({
    rect: cutRects[i],
    text: `${c.size[uAxis]}×${c.size[vAxis]}mm`,
  }))

  const cutPosDims: DimLine[] = []
  cutRects.forEach((cr) => {
    // Horizontal: distance from left edge of board to near edge of cut
    if (cr.x > 0.5) {
      cutPosDims.push({
        axis: 'h',
        start: 0,
        end: cr.x,
        offset: boardRect.h + CUT_DIM_OFFSET,
        label: `${Math.round(cr.x / scale)}mm`,
      })
    }
    // Vertical: distance from top edge of view to near edge of cut
    if (cr.y > 0.5) {
      cutPosDims.push({
        axis: 'v',
        start: 0,
        end: cr.y,
        offset: boardRect.w + CUT_DIM_OFFSET,
        label: `${Math.round(cr.y / scale)}mm`,
      })
    }
  })

  const boardDims: DimLine[] = []
  if (boardDimValues.h !== undefined) {
    boardDims.push({
      axis: 'h',
      start: 0,
      end: boardRect.w,
      offset: boardRect.h + BOARD_DIM_OFFSET,
      label: `${boardDimValues.h}mm`,
    })
  }
  if (boardDimValues.v !== undefined) {
    boardDims.push({
      axis: 'v',
      start: 0,
      end: boardRect.h,
      offset: boardRect.w + BOARD_DIM_OFFSET,
      label: `${boardDimValues.v}mm`,
    })
  }

  return { label: viewLabel, boardRect, cuts: cutRects, cutLabels, cutPosDims, boardDims }
}

// ── Public API ─────────────────────────────────────────────────────────────
export function buildDrawingSheets(parts: Part[], projectName: string): DrawingSheet[] {
  const date = new Date().toISOString().slice(0, 10)

  const coverRows: CoverRow[] = parts.map((p, i) => ({
    index: i + 1,
    label: p.label,
    material: p.material,
    length: p.length,
    width: p.width,
    thickness: p.thickness,
    cutCount: p.cuts.length,
  }))

  const cover: DrawingSheet = { kind: 'cover', projectName, date, rows: coverRows }

  const partSheets: DrawingSheet[] = parts.map((p) => {
    const { length: L, width: W, thickness: T, cuts } = p
    const scale = selectScale(L, W, T)

    // View origins: offset from sheet top-left by MARGIN
    const ox = MARGIN
    const oy = MARGIN

    const faceData = buildView('Face', ['+Z', '-Z'], cuts, L, W, scale, false, { h: L, v: W })
    const edgeData = buildView('Edge', ['+Y', '-Y'], cuts, L, T, scale, true, { v: T })
    const endData  = buildView('End',  ['+X', '-X'], cuts, W, T, scale, true, {})

    const faceView: DrawingView = { ...faceData, placement: { x: ox, y: oy } }
    const endView:  DrawingView = {
      ...endData,
      placement: { x: ox + faceData.boardRect.w + GAP, y: oy },
    }
    const edgeView: DrawingView = {
      ...edgeData,
      placement: { x: ox, y: oy + faceData.boardRect.h + GAP },
    }

    return {
      kind: 'part',
      partLabel: p.label,
      material: p.material,
      color: p.color,
      date,
      views: [faceView, edgeView, endView],
      scaleLabel: toScaleLabel(scale),
    }
  })

  return [cover, ...partSheets]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/geom/drawing.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/geom/drawing.ts src/geom/drawing.test.ts
git commit -m "feat: add buildDrawingSheets projection math and types"
```

---

## Task 2: SVG builder

**Files:**
- Create: `src/ui/buildSvg.ts`
- Create: `src/ui/buildSvg.test.ts`

### Background

`buildSvg` consumes a `DrawingSheet` and returns a self-contained SVG string. All coordinates are in mm (`viewBox="0 0 297 210"`). Coordinates in `DrawingView` are view-local; add `view.placement.x` / `view.placement.y` when rendering.

**DimLine rendering:**
- `axis: 'h'`: horizontal dim at `y = placement.y + dim.offset`. Line from `(px + dim.start, y)` to `(px + dim.end, y)`. Two vertical ticks 1.5mm tall at each end. Label centered above the line at mid-X.
- `axis: 'v'`: vertical dim at `x = placement.x + dim.offset`. Line from `(x, py + dim.start)` to `(x, py + dim.end)`. Two horizontal ticks at each end. Label to the right of the line at mid-Y.

**Title block:** bottom 25mm strip. Part label (bold 7pt), material + scale on one row (4pt), color swatch (6×4mm `<rect>`), date (4pt).

- [ ] **Step 1: Write the failing tests**

Create `src/ui/buildSvg.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildSvg } from './buildSvg'
import { buildDrawingSheets } from '../geom/drawing'
import type { Part } from '../scene/types'

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board', id: 'p1', label: 'Shelf',
    length: 400, width: 200, thickness: 18,
    material: 'Plywood', color: '#d4a373',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ', cuts: [], visible: true, ...overrides,
  }
}

describe('buildSvg', () => {
  it('returns well-formed XML', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const svgStr = buildSvg(sheets[1])
    const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

  it('SVG root has A4 landscape dimensions', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('width="297mm"')
    expect(svgStr).toContain('height="210mm"')
    expect(svgStr).toContain('viewBox="0 0 297 210"')
  })

  it('Face view board rect width matches L×scale', () => {
    // scale 1:5 (0.2) → 400×0.2 = 80mm wide
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200 })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('width="80.000"')
  })

  it('contains a cut rect for each cut in the sheet', () => {
    const cut = {
      id: 'c1', label: 'Dado', face: '+Z' as const,
      position: { x: 100, y: 100, z: 18 }, size: { x: 20, y: 20, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'Test')
    const svgStr = buildSvg(sheets[1])
    // At minimum 5 rects: 3 board outlines + 1 cut + 1 title block
    expect((svgStr.match(/<rect /g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('dim text contains the length label', () => {
    const sheets = buildDrawingSheets([makeBoard({ length: 750 })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('750mm')
  })

  it('title block contains the part label', () => {
    const sheets = buildDrawingSheets([makeBoard({ label: 'Top Rail' })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('Top Rail')
  })

  it('title block contains the scale label', () => {
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200 })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('1:5')
  })

  it('cover sheet contains all part labels', () => {
    const parts = [
      makeBoard({ id: 'p1', label: 'Top' }),
      makeBoard({ id: 'p2', label: 'Bottom' }),
    ]
    const svgStr = buildSvg(buildDrawingSheets(parts, 'Cabinet')[0])
    expect(svgStr).toContain('Top')
    expect(svgStr).toContain('Bottom')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/ui/buildSvg.test.ts
```

Expected: all fail with `Cannot find module './buildSvg'`.

- [ ] **Step 3: Implement `src/ui/buildSvg.ts`**

```ts
import type { DrawingSheet, DrawingView, DimLine, CutLabel, Rect2D } from '../geom/drawing'

const SHEET_H = 210
const TITLE_H = 25
const MARGIN  = 15
const TICK    = 1.5   // dim line tick length (mm)

// ── Serialization helpers ──────────────────────────────────────────────────

function fmt(n: number): string { return n.toFixed(3) }

function el(
  tag: string,
  attrs: Record<string, string | number>,
  content?: string,
): string {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  if (content === undefined) return `<${tag} ${a}/>`
  return `<${tag} ${a}>${content}</${tag}>`
}

function svgRect(x: number, y: number, w: number, h: number, style: Record<string, string | number>): string {
  return el('rect', { x: fmt(x), y: fmt(y), width: fmt(w), height: fmt(h), ...style })
}

function svgLine(x1: number, y1: number, x2: number, y2: number, style: Record<string, string | number>): string {
  return el('line', { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), ...style })
}

function svgText(x: number, y: number, content: string, style: Record<string, string | number>): string {
  return el('text', { x: fmt(x), y: fmt(y), ...style }, content)
}

// ── Dim line ───────────────────────────────────────────────────────────────

function renderDimLine(dim: DimLine, px: number, py: number): string {
  const lineStyle = { stroke: '#555', 'stroke-width': '0.15' }
  const textStyle = { 'font-size': '2', fill: '#444', 'font-family': 'sans-serif' }

  if (dim.axis === 'h') {
    const y = py + dim.offset
    const midX = px + (dim.start + dim.end) / 2
    return [
      svgLine(px + dim.start, y, px + dim.end, y, lineStyle),
      svgLine(px + dim.start, y - TICK, px + dim.start, y + TICK, lineStyle),
      svgLine(px + dim.end,   y - TICK, px + dim.end,   y + TICK, lineStyle),
      svgText(midX, y - 1, dim.label, { ...textStyle, 'text-anchor': 'middle' }),
    ].join('')
  } else {
    const x = px + dim.offset
    const midY = py + (dim.start + dim.end) / 2
    return [
      svgLine(x, py + dim.start, x, py + dim.end, lineStyle),
      svgLine(x - TICK, py + dim.start, x + TICK, py + dim.start, lineStyle),
      svgLine(x - TICK, py + dim.end,   x + TICK, py + dim.end,   lineStyle),
      svgText(x + 1.5, midY, dim.label, {
        ...textStyle, 'text-anchor': 'start', 'dominant-baseline': 'middle',
      }),
    ].join('')
  }
}

// ── View ───────────────────────────────────────────────────────────────────

function renderView(view: DrawingView): string {
  const { placement: { x: px, y: py }, boardRect, cuts, cutLabels, boardDims, cutPosDims } = view
  const out: string[] = []

  // View label
  out.push(svgText(px, py - 2, view.label, {
    'font-size': '3', fill: '#888', 'font-family': 'sans-serif',
  }))

  // Board outline
  out.push(svgRect(px + boardRect.x, py + boardRect.y, boardRect.w, boardRect.h, {
    stroke: '#000', fill: 'none', 'stroke-width': '0.3',
  }))

  // Cut outlines + labels
  cuts.forEach((c: Rect2D, i: number) => {
    out.push(svgRect(px + c.x, py + c.y, c.w, c.h, {
      stroke: '#444', fill: 'rgba(0,0,0,0.06)', 'stroke-width': '0.2',
    }))
    const cl: CutLabel = cutLabels[i]
    if (cl) {
      out.push(svgText(
        px + cl.rect.x + cl.rect.w / 2,
        py + cl.rect.y + cl.rect.h / 2,
        cl.text,
        { 'font-size': '2.5', fill: '#333', 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-family': 'sans-serif' },
      ))
    }
  })

  // Dim lines
  boardDims.forEach((d: DimLine) => out.push(renderDimLine(d, px, py)))
  cutPosDims.forEach((d: DimLine) => out.push(renderDimLine(d, px, py)))

  return out.join('')
}

// ── Title block ────────────────────────────────────────────────────────────

function renderTitleBlock(sheet: Extract<DrawingSheet, { kind: 'part' }>): string {
  const tbY = SHEET_H - MARGIN - TITLE_H
  const tbX = MARGIN
  const tbW = 297 - 2 * MARGIN

  return [
    svgRect(tbX, tbY, tbW, TITLE_H, { stroke: '#000', fill: 'none', 'stroke-width': '0.3' }),
    svgText(tbX + 4, tbY + 8, sheet.partLabel, {
      'font-size': '7', 'font-weight': 'bold', fill: '#000', 'font-family': 'sans-serif',
    }),
    svgText(tbX + 4, tbY + 16, sheet.material || '—', {
      'font-size': '4', fill: '#444', 'font-family': 'sans-serif',
    }),
    svgText(tbX + 100, tbY + 8, `Scale: ${sheet.scaleLabel}`, {
      'font-size': '4', fill: '#444', 'font-family': 'sans-serif',
    }),
    svgText(tbX + 100, tbY + 16, `Date: ${sheet.date}`, {
      'font-size': '4', fill: '#444', 'font-family': 'sans-serif',
    }),
    svgRect(tbX + tbW - 20, tbY + 8, 6, 4, {
      fill: sheet.color, stroke: '#333', 'stroke-width': '0.2',
    }),
  ].join('')
}

// ── Cover sheet ────────────────────────────────────────────────────────────

function renderCoverSheet(sheet: Extract<DrawingSheet, { kind: 'cover' }>): string {
  const out: string[] = []
  const cx = MARGIN
  const cy = MARGIN

  // Title
  out.push(svgText(cx, cy + 10, sheet.projectName, {
    'font-size': '12', 'font-weight': 'bold', fill: '#000', 'font-family': 'sans-serif',
  }))
  out.push(svgText(cx, cy + 18, sheet.date, {
    'font-size': '5', fill: '#666', 'font-family': 'sans-serif',
  }))

  // Table header
  const rowH  = 8
  const tableY = cy + 26
  const cols   = [0, 12, 60, 100, 170, 220]
  const headers = ['#', 'Label', 'Material', 'L × W × T', 'Cuts']

  out.push(svgRect(cx, tableY, 267, rowH, { fill: '#eee', stroke: '#ccc', 'stroke-width': '0.2' }))
  headers.forEach((h, i) => {
    out.push(svgText(cx + cols[i] + 1, tableY + 5.5, h, {
      'font-size': '3.5', 'font-weight': 'bold', fill: '#000', 'font-family': 'sans-serif',
    }))
  })

  // Table rows
  sheet.rows.forEach((row, ri) => {
    const ry = tableY + rowH * (ri + 1)
    out.push(svgRect(cx, ry, 267, rowH, { fill: 'none', stroke: '#ccc', 'stroke-width': '0.2' }))
    const cells = [
      String(row.index),
      row.label,
      row.material || '—',
      `${row.length}×${row.width}×${row.thickness}`,
      String(row.cutCount),
    ]
    cells.forEach((c, i) => {
      out.push(svgText(cx + cols[i] + 1, ry + 5.5, c, {
        'font-size': '3.5', fill: '#000', 'font-family': 'sans-serif',
      }))
    })
  })

  return out.join('')
}

// ── Public API ─────────────────────────────────────────────────────────────

export function buildSvg(sheet: DrawingSheet): string {
  const printStyle = `<style>@media print{svg{width:100%;height:auto;page-break-after:always;}}</style>`

  let body: string
  if (sheet.kind === 'cover') {
    body = renderCoverSheet(sheet)
  } else {
    body = sheet.views.map(renderView).join('') + renderTitleBlock(sheet)
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 297 210" width="297mm" height="210mm">`,
    printStyle,
    body,
    `</svg>`,
  ].join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/ui/buildSvg.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/buildSvg.ts src/ui/buildSvg.test.ts
git commit -m "feat: add buildSvg sheet serializer"
```

---

## Task 3: DXF builder

**Files:**
- Create: `src/ui/buildDxf.ts`
- Create: `src/ui/buildDxf.test.ts`

### Background

DXF r12 (AC1009). Uses LINE entities only — `LWPOLYLINE` is DXF 2000+ and not strictly r12. Structure: `HEADER → TABLES (layers) → ENTITIES → EOF`. All coordinates in mm. Y-flip: `y_dxf = 210 − y_svg` (DXF Y-axis is up; SVG is down).

Layers: `OUTLINE` (board rects), `CUTS` (cut rects), `DIM` (dim lines + ticks), `TEXT` (all text), `TITLE` (title block border + text).

DXF `TEXT` entity format (center-justified):
```
0
TEXT
8
LAYER_NAME
10
x_insert
20
y_insert
30
0.0
40
height
1
text content
72
1
11
x_align
21
y_align
31
0.0
```
(Group 72=1 means center-justified; group 11/21/31 is the alignment point, same as insert for center.)

- [ ] **Step 1: Write the failing tests**

Create `src/ui/buildDxf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildDxf } from './buildDxf'
import { buildDrawingSheets } from '../geom/drawing'
import type { Part } from '../scene/types'

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board', id: 'p1', label: 'Shelf',
    length: 400, width: 200, thickness: 18,
    material: 'Plywood', color: '#d4a373',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ', cuts: [], visible: true, ...overrides,
  }
}

describe('buildDxf', () => {
  it('starts with DXF HEADER section', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER')).toBe(true)
  })

  it('ends with EOF', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true)
  })

  it('contains all 5 required layer names in TABLES section', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    for (const layer of ['OUTLINE', 'CUTS', 'DIM', 'TEXT', 'TITLE']) {
      expect(dxf).toContain(layer)
    }
  })

  it('contains LINE entities for board outlines (at least 3 views × 4 lines = 12)', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    const count = (dxf.match(/^0\nLINE$/gm) ?? []).length
    expect(count).toBeGreaterThanOrEqual(12)
  })

  it('applies Y-flip: SVG y=0 maps to DXF y=210', () => {
    // Face view placement.y = MARGIN = 15 in SVG → y_dxf for top of Face = 210 - 15 = 195
    // The board top-left corner in DXF should contain y=195.000
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    expect(dxf).toContain('\n195.000\n')
  })

  it('contains TEXT entity with the length label', () => {
    const sheets = buildDrawingSheets([makeBoard({ length: 750 })], 'Test')
    const dxf = buildDxf(sheets[1])
    expect(dxf).toContain('750mm')
  })

  it('cover sheet DXF also starts with HEADER and ends with EOF', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'My Project')
    const dxf = buildDxf(sheets[0])
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER')).toBe(true)
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true)
    expect(dxf).toContain('My Project')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/ui/buildDxf.test.ts
```

Expected: all fail with `Cannot find module './buildDxf'`.

- [ ] **Step 3: Implement `src/ui/buildDxf.ts`**

```ts
import type { DrawingSheet, DrawingView, DimLine, Rect2D } from '../geom/drawing'

const SHEET_H = 210

// ── Coordinate helpers ─────────────────────────────────────────────────────

function fmt(n: number): string { return n.toFixed(3) }

// DXF Y-axis is up; SVG Y-axis is down.
function fy(y: number): number { return SHEET_H - y }

// ── Entity builders ────────────────────────────────────────────────────────

function dxfLine(layer: string, x1: number, y1: number, x2: number, y2: number): string {
  return [
    '0', 'LINE',
    '8', layer,
    '10', fmt(x1), '20', fmt(fy(y1)), '30', '0.000',
    '11', fmt(x2), '21', fmt(fy(y2)), '31', '0.000',
  ].join('\n') + '\n'
}

// Draws 4 LINE entities forming a closed rectangle.
function dxfRect(layer: string, x: number, y: number, w: number, h: number): string {
  return (
    dxfLine(layer, x,     y,     x + w, y    ) +
    dxfLine(layer, x + w, y,     x + w, y + h) +
    dxfLine(layer, x + w, y + h, x,     y + h) +
    dxfLine(layer, x,     y + h, x,     y    )
  )
}

// Center-justified TEXT entity.
function dxfText(layer: string, x: number, y: number, height: number, content: string): string {
  return [
    '0', 'TEXT',
    '8', layer,
    '10', fmt(x), '20', fmt(fy(y)), '30', '0.000',
    '40', fmt(height),
    '1', content,
    '72', '1',
    '11', fmt(x), '21', fmt(fy(y)), '31', '0.000',
  ].join('\n') + '\n'
}

const TICK = 1.5

function dxfDimLine(dim: DimLine, px: number, py: number): string {
  const out: string[] = []
  if (dim.axis === 'h') {
    const y = py + dim.offset
    const midX = px + (dim.start + dim.end) / 2
    out.push(dxfLine('DIM', px + dim.start, y, px + dim.end, y))
    out.push(dxfLine('DIM', px + dim.start, y - TICK, px + dim.start, y + TICK))
    out.push(dxfLine('DIM', px + dim.end,   y - TICK, px + dim.end,   y + TICK))
    out.push(dxfText('TEXT', midX, y - 1.5, 2, dim.label))
  } else {
    const x = px + dim.offset
    const midY = py + (dim.start + dim.end) / 2
    out.push(dxfLine('DIM', x, py + dim.start, x, py + dim.end))
    out.push(dxfLine('DIM', x - TICK, py + dim.start, x + TICK, py + dim.start))
    out.push(dxfLine('DIM', x - TICK, py + dim.end,   x + TICK, py + dim.end))
    out.push(dxfText('TEXT', x + 2, midY, 2, dim.label))
  }
  return out.join('')
}

// ── View ───────────────────────────────────────────────────────────────────

function dxfView(view: DrawingView): string {
  const { placement: { x: px, y: py }, boardRect, cuts, cutLabels, boardDims, cutPosDims } = view
  const out: string[] = []

  // View label
  out.push(dxfText('TEXT', px, py - 2, 3, view.label))

  // Board outline (4 lines)
  out.push(dxfRect('OUTLINE', px + boardRect.x, py + boardRect.y, boardRect.w, boardRect.h))

  // Cut outlines + labels
  cuts.forEach((c: Rect2D, i: number) => {
    out.push(dxfRect('CUTS', px + c.x, py + c.y, c.w, c.h))
    const cl = cutLabels[i]
    if (cl) {
      out.push(dxfText(
        'TEXT',
        px + cl.rect.x + cl.rect.w / 2,
        py + cl.rect.y + cl.rect.h / 2,
        2.5,
        cl.text,
      ))
    }
  })

  boardDims.forEach((d: DimLine) => out.push(dxfDimLine(d, px, py)))
  cutPosDims.forEach((d: DimLine) => out.push(dxfDimLine(d, px, py)))

  return out.join('')
}

// ── Title block ────────────────────────────────────────────────────────────

function dxfTitleBlock(sheet: Extract<DrawingSheet, { kind: 'part' }>): string {
  const MARGIN = 15
  const tbY = SHEET_H - MARGIN - 25
  const tbX = MARGIN
  const tbW = 297 - 2 * MARGIN

  return [
    dxfRect('TITLE', tbX, tbY, tbW, 25),
    dxfText('TITLE', tbX + 4, tbY + 8, 7, sheet.partLabel),
    dxfText('TEXT',  tbX + 4, tbY + 16, 4, sheet.material || '—'),
    dxfText('TEXT',  tbX + 100, tbY + 8,  4, `Scale: ${sheet.scaleLabel}`),
    dxfText('TEXT',  tbX + 100, tbY + 16, 4, `Date: ${sheet.date}`),
  ].join('')
}

// ── Cover sheet ────────────────────────────────────────────────────────────

function dxfCoverSheet(sheet: Extract<DrawingSheet, { kind: 'cover' }>): string {
  const MARGIN = 15
  const cx = MARGIN
  const cy = MARGIN
  const out: string[] = []

  out.push(dxfText('TEXT', cx, cy + 10, 12, sheet.projectName))
  out.push(dxfText('TEXT', cx, cy + 18, 5,  sheet.date))

  const rowH  = 8
  const tableY = cy + 26
  const cols   = [0, 12, 60, 100, 170]

  // Header row
  out.push(dxfRect('TITLE', cx, tableY, 267, rowH))
  const headers = ['#', 'Label', 'Material', 'L x W x T', 'Cuts']
  headers.forEach((h, i) => out.push(dxfText('TEXT', cx + cols[i] + 1, tableY + 5.5, 3.5, h)))

  // Data rows
  sheet.rows.forEach((row, ri) => {
    const ry = tableY + rowH * (ri + 1)
    out.push(dxfRect('TITLE', cx, ry, 267, rowH))
    const cells = [
      String(row.index), row.label, row.material || '-',
      `${row.length}x${row.width}x${row.thickness}`, String(row.cutCount),
    ]
    cells.forEach((c, i) => out.push(dxfText('TEXT', cx + cols[i] + 1, ry + 5.5, 3.5, c)))
  })

  return out.join('')
}

// ── TABLES section (layer definitions) ────────────────────────────────────

function dxfTables(): string {
  const layers = ['OUTLINE', 'CUTS', 'DIM', 'TEXT', 'TITLE']
  const layerDefs = layers
    .map((name) =>
      ['0', 'LAYER', '2', name, '70', '0', '62', '7', '6', 'CONTINUOUS'].join('\n'),
    )
    .join('\n')

  return [
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', String(layers.length),
    layerDefs,
    '0', 'ENDTAB',
    '0', 'ENDSEC',
  ].join('\n') + '\n'
}

// ── Public API ─────────────────────────────────────────────────────────────

export function buildDxf(sheet: DrawingSheet): string {
  const header = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$EXTMIN', '10', '0.000', '20', '0.000', '30', '0.000',
    '9', '$EXTMAX', '10', '297.000', '20', '210.000', '30', '0.000',
    '0', 'ENDSEC',
  ].join('\n') + '\n'

  let entities: string
  if (sheet.kind === 'cover') {
    entities = dxfCoverSheet(sheet)
  } else {
    entities = sheet.views.map(dxfView).join('') + dxfTitleBlock(sheet)
  }

  return (
    header +
    dxfTables() +
    '0\nSECTION\n2\nENTITIES\n' +
    entities +
    '0\nENDSEC\n' +
    '0\nEOF'
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/ui/buildDxf.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/buildDxf.ts src/ui/buildDxf.test.ts
git commit -m "feat: add buildDxf DXF r12 serializer"
```

---

## Task 4: `DrawingViewer` component

**Files:**
- Create: `src/ui/DrawingViewer.tsx`
- Create: `src/ui/DrawingViewer.test.tsx`

### Background

Full-screen modal that receives pre-built `DrawingSheet[]`. Sheet index is local state. Keyboard `←`/`→` navigates, `Escape` closes. Print uses a hidden `<iframe>`. Downloads reuse `downloadBlob`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/DrawingViewer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DrawingViewer } from './DrawingViewer'
import { buildDrawingSheets } from '../geom/drawing'
import * as downloadModule from './download'
import type { Part } from '../scene/types'

// Mock heavy serializers — component tests focus on UI behaviour, not SVG/DXF output.
vi.mock('./buildSvg', () => ({
  buildSvg: (sheet: { kind: string }) => `<svg data-testid="svg-${sheet.kind}"></svg>`,
}))
vi.mock('./buildDxf', () => ({
  buildDxf: () => 'mock-dxf',
}))

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board', id: 'p1', label: 'Shelf',
    length: 400, width: 200, thickness: 18,
    material: 'Plywood', color: '#d4a373',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ', cuts: [], visible: true, ...overrides,
  }
}

const sheets = buildDrawingSheets(
  [makeBoard({ id: 'p1', label: 'Top' }), makeBoard({ id: 'p2', label: 'Side' })],
  'Cabinet',
)

describe('DrawingViewer', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('renders nothing when open=false', () => {
    render(<DrawingViewer open={false} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    expect(screen.queryByText('2D Drawings')).toBeNull()
  })

  it('renders the viewer header when open=true', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    expect(screen.getByText('2D Drawings')).toBeTruthy()
  })

  it('shows "Cover" label for the first sheet', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    expect(screen.getByText(/Cover/)).toBeTruthy()
  })

  it('Next button advances to next sheet', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    expect(screen.getByText(/Part 1 of 2/)).toBeTruthy()
  })

  it('Prev button goes back to previous sheet', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: '→' }))
    fireEvent.click(screen.getByRole('button', { name: '←' }))
    expect(screen.getByText(/Cover/)).toBeTruthy()
  })

  it('ArrowRight key advances sheet', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText(/Part 1 of 2/)).toBeTruthy()
  })

  it('ArrowLeft key goes back', () => {
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText(/Cover/)).toBeTruthy()
  })

  it('Close button calls onClose', () => {
    const onClose = vi.fn()
    render(<DrawingViewer open={true} onClose={onClose} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: /Close/ }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Download SVG calls downloadBlob with .svg extension', () => {
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: /Download SVG/ }))
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/\.svg$/),
      'image/svg+xml',
    )
  })

  it('Download DXF calls downloadBlob with .dxf extension', () => {
    const spy = vi.spyOn(downloadModule, 'downloadBlob').mockImplementation(() => {})
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: /Download DXF/ }))
    expect(spy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/\.dxf$/),
      'application/dxf',
    )
  })

  it('Print button creates an iframe element', () => {
    const spy = vi.spyOn(document, 'createElement')
    render(<DrawingViewer open={true} onClose={vi.fn()} sheets={sheets} projectName="Cabinet" />)
    fireEvent.click(screen.getByRole('button', { name: /^Print this/ }))
    expect(spy).toHaveBeenCalledWith('iframe')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/ui/DrawingViewer.test.tsx
```

Expected: all fail with `Cannot find module './DrawingViewer'`.

- [ ] **Step 3: Implement `src/ui/DrawingViewer.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import type { DrawingSheet } from '../geom/drawing'
import { buildSvg } from './buildSvg'
import { buildDxf } from './buildDxf'
import { downloadBlob } from './download'

export interface DrawingViewerProps {
  open: boolean
  onClose: () => void
  sheets: DrawingSheet[]
  projectName: string
}

function sheetFilename(sheet: DrawingSheet, projectName: string, ext: string): string {
  const base = sheet.kind === 'cover'
    ? `${projectName}-cover`
    : `${projectName}-${sheet.partLabel}`
  return base.toLowerCase().replace(/\s+/g, '-') + '.' + ext
}

function printSheets(sheetList: DrawingSheet[]): void {
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  document.body.appendChild(iframe)
  const html = sheetList
    .map((s) => `<div style="page-break-after:always">${buildSvg(s)}</div>`)
    .join('')
  iframe.contentDocument?.write(
    `<!DOCTYPE html><html><body style="margin:0">${html}</body></html>`,
  )
  iframe.contentDocument?.close()
  iframe.contentWindow?.print()
  // Remove after a short delay to allow the print dialog to open
  setTimeout(() => document.body.removeChild(iframe), 1000)
}

export function DrawingViewer({ open, onClose, sheets, projectName }: DrawingViewerProps) {
  const [idx, setIdx] = useState(0)

  // Reset to first sheet when viewer opens
  useEffect(() => {
    if (open) setIdx(0)
  }, [open])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  setIdx((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(sheets.length - 1, i + 1))
      if (e.key === 'Escape') onClose()
    },
    [sheets.length, onClose],
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, handleKey])

  if (!open || sheets.length === 0) return null

  const sheet = sheets[idx]
  const sheetLabel =
    sheet.kind === 'cover'
      ? 'Cover'
      : `Part ${idx} of ${sheets.length - 1} — ${sheet.partLabel}`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
        <span className="font-semibold text-sm">2D Drawings</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            aria-label="←"
          >
            ←
          </Button>
          <span className="text-sm min-w-[200px] text-center">{sheetLabel}</span>
          <Button
            variant="ghost" size="sm"
            onClick={() => setIdx((i) => Math.min(sheets.length - 1, i + 1))}
            disabled={idx === sheets.length - 1}
            aria-label="→"
          >
            →
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          ✕ Close
        </Button>
      </div>

      {/* SVG preview */}
      <div className="flex-1 overflow-auto flex items-center justify-center bg-muted p-6">
        <div
          className="bg-white shadow-lg"
          style={{ maxWidth: '100%', maxHeight: '100%', aspectRatio: '297 / 210' }}
          dangerouslySetInnerHTML={{ __html: buildSvg(sheet) }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-3 border-t flex-shrink-0">
        <Button variant="outline" size="sm" onClick={() => printSheets([sheet])}>
          Print this sheet
        </Button>
        <Button variant="outline" size="sm" onClick={() => printSheets(sheets)}>
          Print all
        </Button>
        <Button
          variant="outline" size="sm"
          onClick={() =>
            downloadBlob(buildSvg(sheet), sheetFilename(sheet, projectName, 'svg'), 'image/svg+xml')
          }
        >
          Download SVG
        </Button>
        <Button
          variant="outline" size="sm"
          onClick={() =>
            downloadBlob(buildDxf(sheet), sheetFilename(sheet, projectName, 'dxf'), 'application/dxf')
          }
        >
          Download DXF
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/ui/DrawingViewer.test.tsx
```

Expected: all 12 tests pass.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/DrawingViewer.tsx src/ui/DrawingViewer.test.tsx
git commit -m "feat: add DrawingViewer modal with sheet navigation and print/download"
```

---

## Task 5: Wire `FileMenu` and `App.tsx`

**Files:**
- Modify: `src/ui/FileMenu.tsx`
- Modify: `src/ui/FileMenu.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add failing FileMenu tests**

Add to the bottom of `src/ui/FileMenu.test.tsx`:

```ts
// Add onOpenDrawings to baseProps
// (Replace the existing baseProps definition with this updated one)
```

Because the `baseProps` constant must include the new prop for all existing tests to keep compiling, find the `baseProps` declaration and add the new prop:

```ts
// In baseProps, add:
onOpenDrawings: vi.fn(),
```

Then add new test cases at the bottom of the `describe('FileMenu', ...)` block:

```ts
  it('renders a "2D Drawings…" item in the dropdown', () => {
    render(<FileMenu {...baseProps} />)
    openMenu()
    expect(screen.getByRole('button', { name: '2D Drawings…' })).toBeTruthy()
  })

  it('"2D Drawings…" is disabled when canExport=false', () => {
    render(<FileMenu {...baseProps} canExport={false} />)
    openMenu()
    expect(
      (screen.getByRole('button', { name: '2D Drawings…' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('"2D Drawings…" calls onOpenDrawings when clicked', () => {
    const onOpenDrawings = vi.fn()
    render(<FileMenu {...baseProps} onOpenDrawings={onOpenDrawings} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: '2D Drawings…' }))
    expect(onOpenDrawings).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/ui/FileMenu.test.tsx
```

Expected: the 3 new tests fail (prop missing on type); existing tests may also fail due to missing prop in baseProps.

- [ ] **Step 3: Add the prop to `FileMenu.tsx`**

In `src/ui/FileMenu.tsx`, add `onOpenDrawings: () => void` to `FileMenuProps` and to the destructuring list, then add the menu item after `'Export STEP…'`:

```tsx
// In FileMenuProps interface, after onExportStep:
onOpenDrawings: () => void

// In the function signature destructuring, after onExportStep:
onOpenDrawings,

// In the JSX, after the Export STEP… menuItem line:
{menuItem('2D Drawings…', '', onOpenDrawings, !canExport)}
```

The full diff to the interface (just the added line):
```tsx
export interface FileMenuProps {
  // ... existing props unchanged ...
  onExportStl: () => void
  onExportStep: () => void
  onOpenDrawings: () => void   // ← add this
  canExport: boolean
  // ...
}
```

The full diff to the destructuring (just the added binding):
```tsx
export function FileMenu({
  // ... existing bindings unchanged ...
  onExportStl,
  onExportStep,
  onOpenDrawings,   // ← add this
  canExport,
  // ...
}: FileMenuProps) {
```

The full diff to the JSX (the new menu item after Export STEP):
```tsx
{menuItem('Export STL…',   '', onExportStl,   !canExport)}
{menuItem('Export STEP…',  '', onExportStep,  !canExport)}
{menuItem('2D Drawings…',  '', onOpenDrawings, !canExport)}
```

- [ ] **Step 4: Run FileMenu tests to verify they pass**

```bash
pnpm vitest run src/ui/FileMenu.test.tsx
```

Expected: all tests pass (including the 3 new ones).

- [ ] **Step 5: Wire `App.tsx`**

Make the following additions to `src/App.tsx`:

**Imports** (add after the `downloadBlob` import line):
```tsx
import { buildDrawingSheets } from './geom/drawing'
import type { DrawingSheet } from './geom/drawing'
import { DrawingViewer } from './ui/DrawingViewer'
```

**State** (add after the `cuttingListOpen` useState):
```tsx
const [drawingsOpen, setDrawingsOpen] = useState(false)
const [drawingSheets, setDrawingSheets] = useState<DrawingSheet[]>([])
const closeDrawings = useCallback(() => setDrawingsOpen(false), [])

const handleOpenDrawings = useCallback(() => {
  setDrawingSheets(buildDrawingSheets(visibleParts, projectName))
  setDrawingsOpen(true)
}, [visibleParts, projectName])
```

**FileMenu prop** (add after `onExportStep={handleExportStep}`):
```tsx
onOpenDrawings={handleOpenDrawings}
```

**DrawingViewer component** (add after the `{cuttingListOpen && <CuttingList ... />}` block):
```tsx
<DrawingViewer
  open={drawingsOpen}
  onClose={closeDrawings}
  sheets={drawingSheets}
  projectName={projectName}
/>
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all existing + new tests pass (252+ passed, 0 failures).

- [ ] **Step 7: Commit**

```bash
git add src/ui/FileMenu.tsx src/ui/FileMenu.test.tsx src/App.tsx
git commit -m "feat: wire 2D Drawings into File menu and App"
```

---

## Task 6: Implementation notes

**Files:**
- Create: `docs/superpowers/notes/2026-06-07-2d-shop-drawings-notes.md`

- [ ] **Step 1: Create the notes file**

Create `docs/superpowers/notes/2026-06-07-2d-shop-drawings-notes.md` with this initial content:

```markdown
# 2D Shop Drawings — Implementation Notes

**Date:** 2026-06-07
**Spec:** `docs/superpowers/specs/2026-06-07-2d-shop-drawings-design.md`
**Plan:** `docs/superpowers/plans/2026-06-07-2d-shop-drawings.md`

Living record of decisions and surprises. Audience: future developer who needs to know *why*.

## Spec deviation: `date` field on part sheets

The spec's `DrawingSheet` `kind: 'part'` type did not include a `date` field. Added it so
serializers can include the build date in the title block without calling `new Date()` inside
`buildSvg`/`buildDxf` (which would make tests non-deterministic). `buildDrawingSheets` sets
`date = new Date().toISOString().slice(0, 10)` for both cover and part sheets.

## DXF r12: LINE entities, not LWPOLYLINE

The spec mentioned `LWPOLYLINE` for rectangles. `LWPOLYLINE` is a DXF 2000+ entity (AC1015),
not r12 (AC1009). Switched to 4× `LINE` entities per rectangle. All target applications
(FreeCAD, AutoCAD, CNC importers) accept LINE entities in r12 files.

## Y-flip in DXF

SVG origin is top-left, Y increases downward. DXF r12 default is bottom-left, Y increases
upward. Conversion: `y_dxf = 210 − y_svg` (sheet height 210mm). Applied in `dxfLine` and
`dxfText` via the `fy()` helper in `buildDxf.ts`.

## Projection math: flipV for Edge and End views

`faceAxes('+Y')` and `faceAxes('+X')` both return `v='z'`. Z increases upward in 3D local
space but downward in SVG. Without flipping, the top of the board (z=T) would render at the
bottom of the Edge/End views. The `flipV=true` path in `projectCut` corrects this:
`y_svg = (boardH − (vPos + vSz/2)) × scale`.

## Manual browser verification required post-merge

Two steps that cannot be verified in tests:

1. **Visual correctness:** Open `pnpm dev`, add 2-3 parts with cuts, open File ▸ 2D Drawings…,
   navigate through sheets, confirm views are correctly sized and dimensioned.
2. **DXF round-trip:** Download a DXF and open in FreeCAD. Verify all 5 layers are present,
   lines align correctly with the SVG preview, and text is readable.

## Out of scope (future cycles)

Cross-view hidden-line projection of cuts; per-part export selection; user-configurable paper
size or scale override; 3D isometric thumbnail; grain direction annotation.

**Next main task:** Enhanced Cutting List — hardware items, cost/qty columns, supplier notes
(full BOM).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/notes/2026-06-07-2d-shop-drawings-notes.md
git commit -m "docs: add 2D shop drawings implementation notes"
```

---

## Final gate

- [ ] **Run full check suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected output:
```
Test Files  XX passed
     Tests  252+ passed | 6 skipped
```

Zero failures. Zero type errors. Zero lint errors.

- [ ] **Push branch**

```bash
git push -u origin claude/optimistic-cori-FltT4
```
