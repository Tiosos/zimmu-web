# PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download PDF (all)" button to the 2D Drawing Viewer that downloads a single multi-page A4-landscape vector PDF containing all drawing sheets.

**Architecture:** Install `pdf-lib`, create `src/ui/buildPdf.ts` that translates `DrawingSheet[]` directly into pdf-lib geometric primitives (mirrors the `buildSvg.ts` / `buildDxf.ts` serialiser pattern), and add one button + async callback to `DrawingViewer.tsx`.

**Tech Stack:** `pdf-lib` (new), Vitest (existing tests), React `useCallback`, existing `downloadBlob` helper.

**Spec:** `docs/superpowers/specs/2026-06-13-pdf-export-design.md`

---

## File Map

| Action  | File                          | Responsibility                              |
|---------|-------------------------------|---------------------------------------------|
| Create  | `src/ui/buildPdf.test.ts`     | Three smoke tests for `buildPdf`            |
| Create  | `src/ui/buildPdf.ts`          | Full PDF serialiser — all render functions  |
| Modify  | `src/ui/DrawingViewer.tsx`    | Import `buildPdf`, add button + handler     |
| Auto    | `package.json`, `pnpm-lock.yaml` | `pdf-lib` dependency                     |

---

## Task 1: Install `pdf-lib` and write the three failing tests

**Files:**
- Create: `src/ui/buildPdf.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)

- [ ] **Step 1: Install the dependency**

```bash
pnpm add pdf-lib
```

Expected: resolves cleanly, `pdf-lib` appears in `package.json` dependencies.

- [ ] **Step 2: Create the test file**

Create `src/ui/buildPdf.test.ts` with these exact contents:

```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildDrawingSheets } from '../geom/drawing'
import type { Part } from '../scene/types'
import { buildPdf } from './buildPdf'

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 400,
    width: 200,
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
      id: 'c1',
      label: 'Dado',
      face: '+Z' as const,
      position: { x: 100, y: 100, z: 18 },
      size: { x: 20, y: 20, z: 6 },
    }
    const withCuts = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'Test')
    await expect(buildPdf(withCuts)).resolves.toBeInstanceOf(Uint8Array)
  })
})
```

- [ ] **Step 3: Run the tests and confirm all three fail**

```bash
pnpm vitest run src/ui/buildPdf.test.ts
```

Expected output: 3 tests fail with `Cannot find module './buildPdf'` or similar import error.

- [ ] **Step 4: Commit the test file and package changes**

```bash
git add src/ui/buildPdf.test.ts package.json pnpm-lock.yaml
git commit -m "test(pdf): add smoke tests for buildPdf"
```

---

## Task 2: Minimal `buildPdf` — make all three tests pass

**Files:**
- Create: `src/ui/buildPdf.ts`

All three tests pass once `buildPdf` creates a PDF with the correct number of empty pages. Full rendering comes in Task 3.

- [ ] **Step 1: Create the minimal implementation**

Create `src/ui/buildPdf.ts`:

```ts
import { PDFDocument } from 'pdf-lib'
import type { DrawingSheet } from '../geom/drawing'

const MM_TO_PT = 72 / 25.4
const PAGE_W_PT = 297 * MM_TO_PT
const PAGE_H_PT = 210 * MM_TO_PT

export async function buildPdf(sheets: DrawingSheet[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const _sheet of sheets) {
    doc.addPage([PAGE_W_PT, PAGE_H_PT])
  }
  return doc.save()
}
```

- [ ] **Step 2: Run the tests — all three must pass**

```bash
pnpm vitest run src/ui/buildPdf.test.ts
```

Expected: 3 passed. If any fail, check the `pdf-lib` import resolves correctly.

- [ ] **Step 3: Commit**

```bash
git add src/ui/buildPdf.ts
git commit -m "feat(pdf): scaffold buildPdf — correct page count"
```

---

## Task 3: Full rendering implementation

**Files:**
- Modify: `src/ui/buildPdf.ts` (replace entirely)

Replace the minimal scaffold with the complete implementation. Tests stay green throughout.

**Key deviations from the spec noted here:**
- `renderPdfView` takes only `font` (no `fontBold`) — no view element uses bold; TypeScript `noUnusedParameters` would reject an unused `fontBold` param.
- All coordinates: `pt(mm)` scales mm → points; `yflip(y)` flips the Y-axis (SVG top-left → pdf-lib bottom-left).

- [ ] **Step 1: Replace `src/ui/buildPdf.ts` with the full implementation**

```ts
import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import type { DrawingSheet, DrawingView, DimLine } from '../geom/drawing'

const MM_TO_PT  = 72 / 25.4
const PAGE_W_PT = 297 * MM_TO_PT   // 841.89 pt
const PAGE_H_PT = 210 * MM_TO_PT   // 595.28 pt
const TICK      = 1.5               // mm — dimension line tick length

function pt(mm: number): number { return mm * MM_TO_PT }
function yflip(y: number): number { return PAGE_H_PT - pt(y) }

// Only call hexRgb on 6-digit hex (e.g. part colors from the color picker).
// Short 3-char hex (#000, #555) use the named constants below instead.
function hexRgb(hex: string) {
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  )
}

const C_BLACK      = rgb(0,     0,     0    )  // #000
const C_DARK_GRAY  = rgb(0.267, 0.267, 0.267)  // #444
const C_MID_GRAY   = rgb(0.333, 0.333, 0.333)  // #555
const C_GRAY       = rgb(0.533, 0.533, 0.533)  // #888
const C_LIGHT_GRAY = rgb(0.8,   0.8,   0.8  )  // #ccc
const C_NEAR_WHITE = rgb(0.933, 0.933, 0.933)  // #eee
const C_SWATCH_BD  = rgb(0.2,   0.2,   0.2  )  // #333 — swatch border
const C_TABLE_BD   = rgb(0.4,   0.4,   0.4  )  // #666 — cover date text

function renderPdfDimLine(
  page: PDFPage,
  dim: DimLine,
  px: number,
  py: number,
  font: PDFFont,
): void {
  const fs = pt(2)
  if (dim.axis === 'h') {
    const y    = py + dim.offset
    const midX = px + (dim.start + dim.end) / 2
    page.drawLine({ start: { x: pt(px + dim.start), y: yflip(y) },            end: { x: pt(px + dim.end),    y: yflip(y) },            thickness: pt(0.15), color: C_MID_GRAY })
    page.drawLine({ start: { x: pt(px + dim.start), y: yflip(y - TICK) },     end: { x: pt(px + dim.start),  y: yflip(y + TICK) },     thickness: pt(0.15), color: C_MID_GRAY })
    page.drawLine({ start: { x: pt(px + dim.end),   y: yflip(y - TICK) },     end: { x: pt(px + dim.end),    y: yflip(y + TICK) },     thickness: pt(0.15), color: C_MID_GRAY })
    page.drawText(dim.label, {
      x:    pt(midX) - font.widthOfTextAtSize(dim.label, fs) / 2,
      y:    yflip(y - 1),
      size: fs, font, color: C_DARK_GRAY,
    })
  } else {
    const x    = px + dim.offset
    const midY = py + (dim.start + dim.end) / 2
    page.drawLine({ start: { x: pt(x),        y: yflip(py + dim.start) }, end: { x: pt(x),        y: yflip(py + dim.end)   }, thickness: pt(0.15), color: C_MID_GRAY })
    page.drawLine({ start: { x: pt(x - TICK), y: yflip(py + dim.start) }, end: { x: pt(x + TICK), y: yflip(py + dim.start) }, thickness: pt(0.15), color: C_MID_GRAY })
    page.drawLine({ start: { x: pt(x - TICK), y: yflip(py + dim.end)   }, end: { x: pt(x + TICK), y: yflip(py + dim.end)   }, thickness: pt(0.15), color: C_MID_GRAY })
    page.drawText(dim.label, {
      x:    pt(x + 1.5),
      y:    yflip(midY) + font.heightAtSize(fs) / 2,
      size: fs, font, color: C_DARK_GRAY,
    })
  }
}

function renderPdfView(page: PDFPage, view: DrawingView, font: PDFFont): void {
  const { placement: { x: px, y: py }, boardRect, cuts, cutLabels, boardDims, cutPosDims } = view

  page.drawText(view.label, { x: pt(px), y: yflip(py - 2), size: pt(3), font, color: C_GRAY })

  page.drawRectangle({
    x: pt(px + boardRect.x), y: PAGE_H_PT - pt(py + boardRect.y + boardRect.h),
    width: pt(boardRect.w),  height: pt(boardRect.h),
    borderColor: C_BLACK, borderWidth: pt(0.3),
  })

  cuts.forEach((c, i) => {
    page.drawRectangle({
      x: pt(px + c.x), y: PAGE_H_PT - pt(py + c.y + c.h),
      width: pt(c.w),  height: pt(c.h),
      color: C_BLACK, opacity: 0.06,
      borderColor: C_DARK_GRAY, borderWidth: pt(0.2),
    })
    const cl = cutLabels[i]
    if (cl) {
      const cx = px + cl.rect.x + cl.rect.w / 2
      const cy = py + cl.rect.y + cl.rect.h / 2
      const fs = pt(2.5)
      page.drawText(cl.text, {
        x:    pt(cx) - font.widthOfTextAtSize(cl.text, fs) / 2,
        y:    yflip(cy) + font.heightAtSize(fs) / 2,
        size: fs, font, color: C_DARK_GRAY,
      })
    }
  })

  boardDims.forEach((d) => renderPdfDimLine(page, d, px, py, font))
  cutPosDims.forEach((d) => renderPdfDimLine(page, d, px, py, font))
}

function renderPdfTitleBlock(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'part' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const tbY = 170  // 210 - 15 - 25
  const tbX = 15
  const tbW = 267  // 297 - 2*15

  page.drawRectangle({
    x: pt(tbX), y: PAGE_H_PT - pt(tbY + 25),
    width: pt(tbW), height: pt(25),
    borderColor: C_BLACK, borderWidth: pt(0.3),
  })
  page.drawText(sheet.partLabel,           { x: pt(tbX + 4),   y: yflip(tbY + 8),  size: pt(7), font: fontBold, color: C_BLACK })
  page.drawText(sheet.material || '—',{ x: pt(tbX + 4),   y: yflip(tbY + 16), size: pt(4), font, color: C_DARK_GRAY })
  page.drawText(`Scale: ${sheet.scaleLabel}`,{ x: pt(tbX + 100), y: yflip(tbY + 8),  size: pt(4), font, color: C_DARK_GRAY })
  page.drawText(`Date: ${sheet.date}`,     { x: pt(tbX + 100), y: yflip(tbY + 16), size: pt(4), font, color: C_DARK_GRAY })
  page.drawRectangle({
    x: pt(tbX + tbW - 20), y: PAGE_H_PT - pt(tbY + 8 + 4),
    width: pt(6), height: pt(4),
    color: hexRgb(sheet.color), borderColor: C_SWATCH_BD, borderWidth: pt(0.2),
  })
}

function renderPdfCoverSheet(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'cover' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const cx = 15, cy = 15
  const rowH   = 8
  const tableY = cy + 26  // 41mm
  const cols   = [0, 12, 60, 100, 170, 220]

  page.drawText(sheet.projectName, { x: pt(cx), y: yflip(cy + 10), size: pt(12), font: fontBold, color: C_BLACK })
  page.drawText(sheet.date,        { x: pt(cx), y: yflip(cy + 18), size: pt(5),  font,           color: C_TABLE_BD })

  // Header row
  page.drawRectangle({
    x: pt(cx), y: PAGE_H_PT - pt(tableY + rowH),
    width: pt(267), height: pt(rowH),
    color: C_NEAR_WHITE, borderColor: C_LIGHT_GRAY, borderWidth: pt(0.2),
  })
  const headers = ['#', 'Label', 'Material', 'L × W × T', 'Cuts']
  headers.forEach((h, i) => {
    page.drawText(h, { x: pt(cx + cols[i] + 1), y: yflip(tableY + 5.5), size: pt(3.5), font: fontBold, color: C_BLACK })
  })

  // Data rows
  sheet.rows.forEach((row, ri) => {
    const ry = tableY + rowH * (ri + 1)
    page.drawRectangle({
      x: pt(cx), y: PAGE_H_PT - pt(ry + rowH),
      width: pt(267), height: pt(rowH),
      borderColor: C_LIGHT_GRAY, borderWidth: pt(0.2),
    })
    const cells = [
      String(row.index),
      row.label,
      row.material || '—',
      `${row.length}×${row.width}×${row.thickness}`,
      String(row.cutCount),
    ]
    cells.forEach((c, i) => {
      page.drawText(c, { x: pt(cx + cols[i] + 1), y: yflip(ry + 5.5), size: pt(3.5), font, color: C_BLACK })
    })
  })
}

export async function buildPdf(sheets: DrawingSheet[]): Promise<Uint8Array> {
  const doc      = await PDFDocument.create()
  const font     = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  for (const sheet of sheets) {
    const page = doc.addPage([PAGE_W_PT, PAGE_H_PT])
    if (sheet.kind === 'cover') {
      renderPdfCoverSheet(page, sheet, font, fontBold)
    } else {
      sheet.views.forEach((v) => renderPdfView(page, v, font))
      renderPdfTitleBlock(page, sheet, font, fontBold)
    }
  }

  return doc.save()
}
```

- [ ] **Step 2: Run the buildPdf tests — all three must still pass**

```bash
pnpm vitest run src/ui/buildPdf.test.ts
```

Expected: 3 passed. If any fail, check the error — most likely a coordinate bug or a missing `font` argument on a `drawText` call.

- [ ] **Step 3: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: both exit cleanly. Common issue: if TypeScript complains about `PDFPage` or `PDFFont` not exported, change those to `import type { PDFPage, PDFFont } from 'pdf-lib'`.

- [ ] **Step 4: Run the full test suite**

```bash
pnpm test
```

Expected: all 377 tests pass (374 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/ui/buildPdf.ts
git commit -m "feat(pdf): implement full PDF rendering — views, title block, cover sheet"
```

---

## Task 4: Wire "Download PDF (all)" button into `DrawingViewer.tsx`

**Files:**
- Modify: `src/ui/DrawingViewer.tsx`

Two changes: import + callback, and one new button in the footer.

- [ ] **Step 1: Add the import at the top of `DrawingViewer.tsx`**

Current imports end with:
```ts
import { downloadBlob } from './download'
```

Add the new import after it:
```ts
import { downloadBlob } from './download'
import { buildPdf } from './buildPdf'
```

- [ ] **Step 2: Add the async callback inside the component body**

The component already has `handleKey` defined via `useCallback`. Add `handleDownloadPdf` immediately after the existing callbacks (before the `if (!open ...)` guard):

```ts
const handleDownloadPdf = useCallback(() => {
  void buildPdf(sheets).then((bytes) => {
    downloadBlob(bytes, `${projectName}-drawings.pdf`, 'application/pdf')
  })
}, [sheets, projectName])
```

Note: uses `.then()` instead of `await` because `useCallback` itself cannot be `async` without a linting warning — the void-wrapped `.then()` is the idiomatic pattern in this codebase (matches `App.tsx` usage of `void (async () => {...})()`).

- [ ] **Step 3: Add the button to the footer**

Current footer (line ~107 in `DrawingViewer.tsx`):
```tsx
<div className="flex items-center gap-3 px-4 py-3 border-t flex-shrink-0">
  <Button variant="outline" size="sm" onClick={() => printSheets([sheet])}>
    Print this sheet
  </Button>
  <Button variant="outline" size="sm" onClick={() => printSheets(sheets)}>
    Print all
  </Button>
  <Button
    variant="outline"
    size="sm"
    onClick={() =>
      downloadBlob(buildSvg(sheet), sheetFilename(sheet, projectName, 'svg'), 'image/svg+xml')
    }
  >
    Download SVG
  </Button>
```

Insert the new button between "Print all" and "Download SVG":
```tsx
  <Button variant="outline" size="sm" onClick={() => printSheets(sheets)}>
    Print all
  </Button>
  <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
    Download PDF (all)
  </Button>
  <Button
    variant="outline"
    size="sm"
    onClick={() =>
      downloadBlob(buildSvg(sheet), sheetFilename(sheet, projectName, 'svg'), 'image/svg+xml')
    }
  >
    Download SVG
  </Button>
```

- [ ] **Step 4: Run typecheck, lint, and full suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all 377 tests pass, no type errors, no lint warnings.

- [ ] **Step 5: Commit and push**

```bash
git add src/ui/DrawingViewer.tsx
git commit -m "feat(ui): add Download PDF (all) button to DrawingViewer"
git push
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task that covers it |
|---|---|
| `buildPdf(sheets): Promise<Uint8Array>` | Task 2 + 3 |
| One page per sheet, in order | Task 2 (addPage loop) |
| A4 landscape (297×210mm) | Task 2 (`PAGE_W_PT`, `PAGE_H_PT`) |
| pdf-lib bottom-left origin, Y-flip | Task 3 (`yflip` helper) |
| mm→pt conversion | Task 3 (`pt` helper) |
| Text centering — horizontal (`widthOfTextAtSize`) | Task 3 (cut labels, h-dim labels) |
| Text centering — vertical (`heightAtSize`) | Task 3 (cut labels, v-dim labels) |
| `hexRgb` for 6-digit part color only | Task 3 (explicit comment) |
| Named color constants | Task 3 (`C_*` constants) |
| Stroke widths converted via `pt()` | Task 3 (all `borderWidth`/`thickness` calls) |
| Fill vs stroke rectangle rules | Task 3 (each `drawRectangle` call) |
| `renderPdfDimLine` — h + v branches | Task 3 |
| `renderPdfView` — label, board, cuts, dims | Task 3 |
| `renderPdfTitleBlock` — border, label, material, scale, date, swatch | Task 3 |
| `renderPdfCoverSheet` — name, date, table header, data rows | Task 3 |
| `×` Unicode multiplication sign in cover | Task 3 (`×`) |
| `—` Unicode em-dash for empty material | Task 3 (`—`) |
| `pdf-lib` dependency installed | Task 1 |
| Three smoke tests | Task 1 |
| "Download PDF (all)" button, footer order | Task 4 |
| Filename `{projectName}-drawings.pdf` | Task 4 |
| No loading state | Task 4 (void+then is fire-and-forget) |

**Placeholder scan:** No TBDs, todos, or "similar to above" patterns. All code blocks are complete and executable.

**Type consistency:** `renderPdfView` signature intentionally omits `fontBold` (spec had it but it's unused — TypeScript `noUnusedParameters` would reject it). All other signatures match the spec exactly. `PDFPage` and `PDFFont` used consistently in all four internal functions.
