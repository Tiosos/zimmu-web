# PDF Export Design

**Date:** 2026-06-13
**Status:** Approved (L99 revision)

## Overview

Add a "Download PDF (all)" button to the 2D Drawing Viewer that produces a single multi-page A4-landscape PDF containing all drawing sheets (cover + one page per part). The PDF is vector — drawn directly with pdf-lib geometric primitives — so it zooms crisply and prints at full resolution.

## Architecture

### New file: `src/ui/buildPdf.ts`

```ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { DrawingSheet, DrawingView, DimLine } from '../geom/drawing'

export async function buildPdf(sheets: DrawingSheet[]): Promise<Uint8Array>
```

Takes the same `DrawingSheet[]` used by `buildSvg.ts` and `buildDxf.ts`. Returns a `Uint8Array` suitable for `downloadBlob`. One page per sheet, in order.

`buildPdf` is async because `PDFDocument.create()` and `doc.save()` are both promises. Structure:

```ts
export async function buildPdf(sheets: DrawingSheet[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font     = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  for (const sheet of sheets) {
    const page = doc.addPage([PAGE_W_PT, PAGE_H_PT])
    if (sheet.kind === 'cover') renderPdfCoverSheet(page, sheet, font, fontBold)
    else renderPdfPartSheet(page, sheet, font, fontBold)
  }

  return doc.save()
}
```

Internally mirrors the rendering functions in `buildSvg.ts`:

| buildSvg             | buildPdf                  | Called for        |
|----------------------|---------------------------|-------------------|
| `renderDimLine`      | `renderPdfDimLine`        | views             |
| `renderView`         | `renderPdfView`           | part sheet        |
| `renderTitleBlock`   | `renderPdfTitleBlock`     | part sheet        |
| `renderCoverSheet`   | `renderPdfCoverSheet`     | cover sheet       |

`renderPdfPartSheet` calls `renderPdfView` three times then `renderPdfTitleBlock` — mirrors the `buildSvg` top-level for `kind: 'part'`.

### Modified: `src/ui/DrawingViewer.tsx`

Add one async callback and one button. Import `buildPdf`:

```ts
import { buildPdf } from './buildPdf'

const handleDownloadPdf = useCallback(async () => {
  const bytes = await buildPdf(sheets)
  downloadBlob(bytes, `${projectName}-drawings.pdf`, 'application/pdf')
}, [sheets, projectName])
```

Footer button order (new button after "Print all"):
```
Print this sheet | Print all | Download PDF (all) | Download SVG | Download DXF
```

No loading state — pdf-lib in-browser generation is <50 ms for typical sheet counts.

### New file: `src/ui/buildPdf.test.ts`

Smoke tests only (rendering is not unit-testable without a viewer). See **Testing** section.

### New dependency: `pdf-lib`

```sh
pnpm add pdf-lib
```

Browser-safe, Node-safe, works in Vitest/happy-dom without mocks.

---

## Coordinate System

| Property           | Value                              |
|--------------------|------------------------------------|
| Page size          | A4 landscape: 297 × 210 mm         |
| pdf-lib unit       | Points: 1 pt = 1/72 in ≈ 0.3528 mm |
| Page size in pt    | 841.89 × 595.28 pt                 |
| SVG origin         | Top-left                           |
| pdf-lib origin     | Bottom-left                        |

Module-level constants:

```ts
const MM_TO_PT  = 72 / 25.4
const PAGE_W_PT = 297 * MM_TO_PT   // 841.89
const PAGE_H_PT = 210 * MM_TO_PT   // 595.28
```

Two helpers used everywhere:

```ts
function pt(mm: number): number { return mm * MM_TO_PT }
function yflip(y: number): number { return PAGE_H_PT - pt(y) }
```

**Coordinate translation rules:**

For lines:
```ts
page.drawLine({
  start: { x: pt(x1_svg), y: yflip(y1_svg) },
  end:   { x: pt(x2_svg), y: yflip(y2_svg) },
  thickness: pt(strokeWidth_mm),
  color: ...,
})
```

For rectangles — pdf-lib `y` is the **bottom-left** corner, but SVG `y` is the top-left:
```ts
page.drawRectangle({
  x:      pt(x_svg),
  y:      PAGE_H_PT - pt(y_svg + h_svg),   // flip: bottom-left
  width:  pt(w_svg),
  height: pt(h_svg),
  // see fill/stroke rules below
})
```

For text — pdf-lib `y` is the **baseline**:
- Default (left-anchored, baseline): `x: pt(x_svg), y: yflip(y_svg)`
- Horizontal-centered (`text-anchor: middle`): subtract half text width:
  ```ts
  x: pt(x_svg) - font.widthOfTextAtSize(text, fontSize) / 2
  ```
- Vertically centered (`dominant-baseline: middle`): add half cap height:
  ```ts
  y: yflip(y_svg) + font.heightAtSize(fontSize) / 2
  ```
- Both centered (cut labels use both):
  ```ts
  x: pt(x_svg) - font.widthOfTextAtSize(text, fontSize) / 2,
  y: yflip(y_svg) + font.heightAtSize(fontSize) / 2,
  ```

---

## Rendering Details

### Fonts

```ts
const font     = await doc.embedFont(StandardFonts.Helvetica)
const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
```

SVG `font-size` values are in mm — convert to pt with `pt(size_mm)`. Every `page.drawText` call requires **explicit** `font`, `size`, and `color`; there is no cascade.

### Colors

`hexRgb` is only used for the part color swatch (always stored as 6-digit hex from the color picker, e.g. `#d4a373`). Do **not** call `hexRgb` on the 3-char shorthand constants below — use the inline `rgb()` values instead.

```ts
function hexRgb(hex: string) {   // 6-digit hex only
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  )
}
```

Named color constants (module-level):

```ts
const C_BLACK     = rgb(0,     0,     0    )  // #000
const C_DARK_GRAY = rgb(0.267, 0.267, 0.267)  // #444
const C_MID_GRAY  = rgb(0.333, 0.333, 0.333)  // #555
const C_GRAY      = rgb(0.533, 0.533, 0.533)  // #888
const C_LIGHT_GRAY= rgb(0.8,   0.8,   0.8  )  // #ccc
const C_NEAR_WHITE= rgb(0.933, 0.933, 0.933)  // #eee
const C_SWATCH_BD = rgb(0.2,   0.2,   0.2  )  // #333 (swatch border)
const C_TABLE_BD  = rgb(0.4,   0.4,   0.4  )  // #666 (date on cover)
```

### Rectangle fill/stroke rules

pdf-lib's `drawRectangle` does not have a CSS-like "fill: none". Use these patterns:

| SVG style                          | pdf-lib params                                                                  |
|------------------------------------|---------------------------------------------------------------------------------|
| `fill:none; stroke:#000; sw:0.3`   | `borderColor:C_BLACK, borderWidth:pt(0.3)` — no `color` key                   |
| `fill:rgba(0,0,0,0.06); stroke:#444; sw:0.2` | `color:C_BLACK, opacity:0.06, borderColor:C_DARK_GRAY, borderWidth:pt(0.2)` |
| `fill:#eee; stroke:#ccc; sw:0.2`   | `color:C_NEAR_WHITE, borderColor:C_LIGHT_GRAY, borderWidth:pt(0.2)`            |
| `fill:none; stroke:#ccc; sw:0.2`   | `borderColor:C_LIGHT_GRAY, borderWidth:pt(0.2)` — no `color` key              |
| `fill:partColor; stroke:#333; sw:0.2` | `color:hexRgb(sheet.color), borderColor:C_SWATCH_BD, borderWidth:pt(0.2)`   |

### Stroke widths

All SVG stroke-width values are in mm and must be converted:

| Usage                     | SVG `stroke-width` | pdf-lib `thickness` / `borderWidth` |
|---------------------------|--------------------|--------------------------------------|
| Board outline             | 0.3 mm             | `pt(0.3)`                            |
| Title block border        | 0.3 mm             | `pt(0.3)`                            |
| Cut outline               | 0.2 mm             | `pt(0.2)`                            |
| Color swatch border       | 0.2 mm             | `pt(0.2)`                            |
| Cover table borders       | 0.2 mm             | `pt(0.2)`                            |
| Dimension lines and ticks | 0.15 mm            | `pt(0.15)`                           |

---

## `renderPdfDimLine`

Signature:
```ts
function renderPdfDimLine(
  page: PDFPage, dim: DimLine, px: number, py: number,
  font: PDFFont
): void
```

Mirrors `renderDimLine` in `buildSvg.ts`. `TICK = 1.5` (mm). Font size: 2mm → `pt(2)`.

**Horizontal dim line (`dim.axis === 'h'`):**
```ts
const y    = py + dim.offset
const midX = px + (dim.start + dim.end) / 2
// main line
page.drawLine({ start:{x:pt(px+dim.start), y:yflip(y)}, end:{x:pt(px+dim.end), y:yflip(y)}, thickness:pt(0.15), color:C_MID_GRAY })
// left tick
page.drawLine({ start:{x:pt(px+dim.start), y:yflip(y-TICK)}, end:{x:pt(px+dim.start), y:yflip(y+TICK)}, thickness:pt(0.15), color:C_MID_GRAY })
// right tick
page.drawLine({ start:{x:pt(px+dim.end), y:yflip(y-TICK)}, end:{x:pt(px+dim.end), y:yflip(y+TICK)}, thickness:pt(0.15), color:C_MID_GRAY })
// label — text-anchor:middle, y offset −1mm above line
const fs = pt(2)
page.drawText(dim.label, {
  x:    pt(midX) - font.widthOfTextAtSize(dim.label, fs) / 2,
  y:    yflip(y - 1),
  size: fs, font, color: C_DARK_GRAY,
})
```

**Vertical dim line (`dim.axis === 'v'`):**
```ts
const x    = px + dim.offset
const midY = py + (dim.start + dim.end) / 2
// main line + top/bottom ticks (same pattern as horizontal, axis swapped)
// label — text-anchor:start (+1.5mm right of line), dominant-baseline:middle
const fs = pt(2)
page.drawText(dim.label, {
  x:    pt(x + 1.5),
  y:    yflip(midY) + font.heightAtSize(fs) / 2,
  size: fs, font, color: C_DARK_GRAY,
})
```

---

## `renderPdfView`

Signature:
```ts
function renderPdfView(page: PDFPage, view: DrawingView, font: PDFFont, fontBold: PDFFont): void
```

Renders in this order (matches `renderView` in `buildSvg.ts`):

1. **View label** — `font-size: 3mm`, color `C_GRAY`, baseline at `yflip(py - 2)`, left-anchored at `pt(px)`.
2. **Board outline** — stroke-only rectangle (fill: none, stroke: C_BLACK, borderWidth: `pt(0.3)`).
3. **Cuts** — for each cut rect: filled+stroked rectangle (`color:C_BLACK, opacity:0.06, borderColor:C_DARK_GRAY, borderWidth:pt(0.2)`). Cut label (if present): centered text (`text-anchor:middle, dominant-baseline:middle`), font-size 2.5mm, color C_DARK_GRAY, at center of `cl.rect`.
4. **Board dim lines** — call `renderPdfDimLine` for each in `view.boardDims`.
5. **Cut position dim lines** — call `renderPdfDimLine` for each in `view.cutPosDims`.

---

## `renderPdfTitleBlock`

Signature:
```ts
function renderPdfTitleBlock(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'part' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void
```

Constants (identical to `buildSvg.ts`):
```ts
const SHEET_H = 210, TITLE_H = 25, MARGIN = 15
const tbY = SHEET_H - MARGIN - TITLE_H  // 170mm
const tbX = MARGIN                        // 15mm
const tbW = 297 - 2 * MARGIN             // 267mm
```

Elements to draw:

| Element           | x (mm)       | y (mm)     | font-size (mm) | font      | color       |
|-------------------|--------------|------------|----------------|-----------|-------------|
| Outer border rect | tbX, tbY     | 267×25     | —              | —         | stroke only |
| Part label text   | tbX+4        | tbY+8      | 7              | fontBold  | C_BLACK     |
| Material text     | tbX+4        | tbY+16     | 4              | font      | C_DARK_GRAY |
| Scale text        | tbX+100      | tbY+8      | 4              | font      | C_DARK_GRAY |
| Date text         | tbX+100      | tbY+16     | 4              | font      | C_DARK_GRAY |
| Color swatch rect | tbX+tbW−20   | tbY+8, 6×4 | —              | —         | filled+stroked (hexRgb + C_SWATCH_BD) |

Note: DXF omits the color swatch; PDF follows SVG and includes it.

---

## `renderPdfCoverSheet`

Signature:
```ts
function renderPdfCoverSheet(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'cover' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void
```

Constants:
```ts
const MARGIN = 15
const cx = MARGIN, cy = MARGIN   // 15mm, 15mm
const rowH = 8
const tableY = cy + 26           // 41mm
const cols = [0, 12, 60, 100, 170, 220]  // column offsets from cx (6 entries, 5 used for headers)
```

Elements to draw:

1. **Project name** — `fontBold`, 12mm, C_BLACK. Position: `(cx, cy+10)` i.e. `(15, 25)`.
2. **Date** — `font`, 5mm, `C_TABLE_BD` (`#666`). Position: `(cx, cy+18)` i.e. `(15, 33)`.
3. **Table header row** — filled+stroked rect at `(cx, tableY)` width 267mm height 8mm. Fill: C_NEAR_WHITE, border: C_LIGHT_GRAY, borderWidth: `pt(0.2)`.
4. **Header labels** `['#', 'Label', 'Material', 'L × W × T', 'Cuts']` — `fontBold`, 3.5mm, C_BLACK. Position for column `i`: `x = cx + cols[i] + 1`, `y = tableY + 5.5`.
5. **Data rows** — for each row at `ry = tableY + rowH * (ri + 1)`:
   - Stroke-only border rect (no fill, C_LIGHT_GRAY, `pt(0.2)`).
   - Five cells `[String(row.index), row.label, row.material||'—', \`${row.length}×${row.width}×${row.thickness}\`, String(row.cutCount)]` — `font`, 3.5mm, C_BLACK. Position `x = cx + cols[i] + 1`, `y = ry + 5.5`.

Note: use the `×` Unicode multiplication sign (U+00D7), matching SVG. DXF uses ASCII `x` — follow SVG here.

---

## Testing

`src/ui/buildPdf.test.ts` — smoke tests only; pixel-level rendering is not unit-testable:

```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildDrawingSheets } from '../geom/drawing'
import type { Part } from '../scene/types'
import { buildPdf } from './buildPdf'

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board', id: 'p1', label: 'Shelf',
    length: 400, width: 200, thickness: 18,
    material: 'Plywood', color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ', cuts: [], visible: true,
    ...overrides,
  }
}

const sheets = buildDrawingSheets([makeBoard()], 'Test Project')

describe('buildPdf', () => {
  it('returns a Uint8Array starting with %PDF-', async () => {
    const bytes = await buildPdf(sheets)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('produces one page per sheet', async () => {
    const bytes = await buildPdf(sheets)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(sheets.length)
  })

  it('handles a part with cuts without throwing', async () => {
    const cut = {
      id: 'c1', label: 'Dado', face: '+Z' as const,
      position: { x: 100, y: 100, z: 18 },
      size: { x: 20, y: 20, z: 6 },
    }
    const withCuts = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'Test')
    await expect(buildPdf(withCuts)).resolves.toBeInstanceOf(Uint8Array)
  })
})
```

---

## Out of Scope

- Per-sheet PDF download (multi-page is the unique value over SVG)
- PDF/A archival compliance
- Embedded fonts beyond Helvetica/HelveticaBold
- Colour management or print profiles
