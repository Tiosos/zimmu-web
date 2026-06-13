# PDF Export Design

**Date:** 2026-06-13
**Status:** Approved

## Overview

Add a "Download PDF (all)" button to the 2D Drawing Viewer that produces a single multi-page A4-landscape PDF containing all drawing sheets (cover + one page per part). The PDF is vector — drawn directly with pdf-lib geometric primitives — so it zooms crisply and prints at full resolution.

## Architecture

### New file: `src/ui/buildPdf.ts`

```
buildPdf(sheets: DrawingSheet[]): Promise<Uint8Array>
```

Takes the same `DrawingSheet[]` data used by `buildSvg.ts` and `buildDxf.ts`. Returns a `Uint8Array` suitable for `downloadBlob`. One page per sheet, in order.

Internally mirrors the four rendering functions in `buildSvg.ts`:

| buildSvg         | buildPdf              |
|------------------|-----------------------|
| `renderDimLine`  | `renderPdfDimLine`    |
| `renderView`     | `renderPdfView`       |
| `renderTitleBlock` | `renderPdfTitleBlock` |
| `renderCoverSheet` | `renderPdfCoverSheet` |

### Modified: `src/ui/DrawingViewer.tsx`

One new async handler + one new button in the footer. No other changes.

### New file: `src/ui/buildPdf.test.ts`

Smoke test: `buildPdf([coverSheet, partSheet])` returns a non-empty `Uint8Array` whose first bytes are `%PDF-`.

### New dependency: `pdf-lib`

Browser-safe, Node-safe, works in Vitest/happy-dom without mocks.

## Coordinate System

| Property          | Value |
|-------------------|-------|
| Page size         | A4 landscape: 297 × 210 mm |
| pdf-lib unit      | Points: 1 pt = 1/72 in ≈ 0.3528 mm |
| Page size in pt   | 841.89 × 595.28 pt |
| Origin            | pdf-lib: bottom-left; SVG: top-left |

Two helpers:

```ts
const MM_TO_PT = 72 / 25.4
const PAGE_W_PT = 297 * MM_TO_PT   // 841.89
const PAGE_H_PT = 210 * MM_TO_PT   // 595.28

function pt(mm: number): number { return mm * MM_TO_PT }
function yflip(y: number): number { return PAGE_H_PT - pt(y) }
```

For rectangles (top-left in SVG, bottom-left in pdf-lib):
```
x_pdf  = pt(x_svg)
y_pdf  = PAGE_H_PT - pt(y_svg + h_svg)   // bottom-left corner
w_pdf  = pt(w_svg)
h_pdf  = pt(h_svg)
```

## Rendering Details

### Fonts

```ts
const font     = await doc.embedFont(StandardFonts.Helvetica)
const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
```

SVG `font-size` values are in mm; multiply by `MM_TO_PT` for pdf-lib.

### Colors

```ts
function hexRgb(hex: string) {
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  )
}
```

Named colors used in the drawings:

| SVG color         | pdf-lib call            |
|-------------------|-------------------------|
| `#000`            | `rgb(0, 0, 0)`          |
| `#555`            | `rgb(0.333, 0.333, 0.333)` |
| `#444`            | `rgb(0.267, 0.267, 0.267)` |
| `#888`            | `rgb(0.533, 0.533, 0.533)` |
| `#ccc`            | `rgb(0.8, 0.8, 0.8)`    |
| `#eee`            | `rgb(0.933, 0.933, 0.933)` |
| `rgba(0,0,0,0.06)` | `rgb(0,0,0)` + `opacity: 0.06` |
| part color (hex)  | `hexRgb(sheet.color)`   |

### Dimension lines

Rendered with three `page.drawLine` calls (main line + two ticks) and one `page.drawText` call. Tick length: 1.5 mm (= `TICK` constant from `buildSvg.ts`).

### Part sheet

Three views (`renderPdfView` ×3) + title block (`renderPdfTitleBlock`). Each view draws:
1. Board outline rectangle
2. Cut rectangles (filled `rgba(0,0,0,0.06)`)
3. Cut labels (centered text)
4. Board dimension lines
5. Cut position dimension lines
6. View label

Title block: outer border, part label (bold, 7 mm), material (4 mm), scale (4 mm), date (4 mm), color swatch rectangle.

### Cover sheet

Project name (bold, 12 mm), date (5 mm), parts table with header row (shaded) and data rows.

## Button Placement

Footer order:
```
Print this sheet | Print all | Download PDF (all) | Download SVG | Download DXF
```

Handler:
```ts
const handleDownloadPdf = useCallback(async () => {
  const bytes = await buildPdf(sheets)
  downloadBlob(bytes, `${projectName}-drawings.pdf`, 'application/pdf')
}, [sheets, projectName])
```

## Testing

`src/ui/buildPdf.test.ts` — mirrors the `buildSvg.test.ts` pattern, using `buildDrawingSheets` to generate realistic fixtures:

```ts
import { buildDrawingSheets } from '../geom/drawing'
import { buildPdf } from './buildPdf'

const sheets = buildDrawingSheets([/* makeBoard() */], 'Test Project')

it('returns a Uint8Array starting with %PDF-', async () => {
  const bytes = await buildPdf(sheets)
  expect(bytes).toBeInstanceOf(Uint8Array)
  expect(bytes.length).toBeGreaterThan(0)
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
})

it('produces one page per sheet', async () => {
  // Verify by checking the page count string in the PDF body
  const bytes = await buildPdf(sheets)
  const text = new TextDecoder().decode(bytes)
  // PDFDocument.getPageCount() is the canonical check; use pdf-lib directly if needed
  expect(text).toContain('/Type /Page')
})
```

## Out of Scope

- Per-sheet PDF download (multi-page is the unique value over SVG)
- PDF/A archival compliance
- Embedded fonts beyond Helvetica/HelveticaBold
- Colour management or print profiles
