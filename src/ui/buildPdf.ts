import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import { assemblyDimLine } from '../geom/drawing'
import type {
  DrawingSheet,
  DrawingView,
  DowelView,
  DimLine,
  PlacedAssemblyView,
  PlacedWallElevationView,
} from '../geom/drawing'

const MM_TO_PT = 72 / 25.4
const PAGE_W_PT = 297 * MM_TO_PT // 841.89 pt
const PAGE_H_PT = 210 * MM_TO_PT // 595.28 pt
const TICK = 1.5 // mm — dimension line tick length

function pt(mm: number): number {
  return mm * MM_TO_PT
}
function yflip(y: number): number {
  return PAGE_H_PT - pt(y)
}

function hexRgb(hex: string) {
  const value = /^#[0-9a-f]{3}$/i.test(hex)
    ? `#${Array.from(hex.slice(1), (c) => c + c).join('')}`
    : hex
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid part color: ${hex}`)
  return rgb(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  )
}

const C_BLACK = rgb(0, 0, 0) // #000
const C_DARK_GRAY = rgb(0.267, 0.267, 0.267) // #444
const C_MID_GRAY = rgb(0.333, 0.333, 0.333) // #555
const C_GRAY = rgb(0.533, 0.533, 0.533) // #888
const C_LIGHT_GRAY = rgb(0.8, 0.8, 0.8) // #ccc
const C_NEAR_WHITE = rgb(0.933, 0.933, 0.933) // #eee
const C_SWATCH_BD = rgb(0.2, 0.2, 0.2) // #333 — swatch border
const C_TABLE_BD = rgb(0.4, 0.4, 0.4) // #666 — cover date text

function renderPdfDimLine(
  page: PDFPage,
  dim: DimLine,
  px: number,
  py: number,
  font: PDFFont,
): void {
  const fs = pt(2)
  if (dim.axis === 'h') {
    const y = py + dim.offset
    const midX = px + (dim.start + dim.end) / 2
    page.drawLine({
      start: { x: pt(px + dim.start), y: yflip(y) },
      end: { x: pt(px + dim.end), y: yflip(y) },
      thickness: pt(0.15),
      color: C_MID_GRAY,
    })
    page.drawLine({
      start: { x: pt(px + dim.start), y: yflip(y - TICK) },
      end: { x: pt(px + dim.start), y: yflip(y + TICK) },
      thickness: pt(0.15),
      color: C_MID_GRAY,
    })
    page.drawLine({
      start: { x: pt(px + dim.end), y: yflip(y - TICK) },
      end: { x: pt(px + dim.end), y: yflip(y + TICK) },
      thickness: pt(0.15),
      color: C_MID_GRAY,
    })
    page.drawText(dim.label, {
      x: pt(midX) - font.widthOfTextAtSize(dim.label, fs) / 2,
      y: yflip(y - 1),
      size: fs,
      font,
      color: C_DARK_GRAY,
    })
  } else {
    const x = px + dim.offset
    const midY = py + (dim.start + dim.end) / 2
    page.drawLine({
      start: { x: pt(x), y: yflip(py + dim.start) },
      end: { x: pt(x), y: yflip(py + dim.end) },
      thickness: pt(0.15),
      color: C_MID_GRAY,
    })
    page.drawLine({
      start: { x: pt(x - TICK), y: yflip(py + dim.start) },
      end: { x: pt(x + TICK), y: yflip(py + dim.start) },
      thickness: pt(0.15),
      color: C_MID_GRAY,
    })
    page.drawLine({
      start: { x: pt(x - TICK), y: yflip(py + dim.end) },
      end: { x: pt(x + TICK), y: yflip(py + dim.end) },
      thickness: pt(0.15),
      color: C_MID_GRAY,
    })
    // A label reads AWAY from the line it belongs to. pdf-lib draws from the left edge, so a
    // left-hand label is shifted by its own measured width. Every board vertical dim has a positive
    // offset, so `offset < 0` identifies an assembly view's left-hand ring exactly.
    page.drawText(dim.label, {
      x: dim.offset < 0 ? pt(x - 1.5) - font.widthOfTextAtSize(dim.label, fs) : pt(x + 1.5),
      y: yflip(midY) + font.heightAtSize(fs) / 2,
      size: fs,
      font,
      color: C_DARK_GRAY,
    })
  }
}

function renderPdfView(page: PDFPage, view: DrawingView, font: PDFFont): void {
  const {
    placement: { x: px, y: py },
    boardRect,
    cuts,
    cutLabels,
    boardDims,
    cutPosDims,
  } = view

  page.drawText(view.label, { x: pt(px), y: yflip(py - 2), size: pt(3), font, color: C_GRAY })

  page.drawRectangle({
    x: pt(px + boardRect.x),
    y: PAGE_H_PT - pt(py + boardRect.y + boardRect.h),
    width: pt(boardRect.w),
    height: pt(boardRect.h),
    borderColor: C_BLACK,
    borderWidth: pt(0.3),
  })

  cuts.forEach((c, i) => {
    page.drawRectangle({
      x: pt(px + c.x),
      y: PAGE_H_PT - pt(py + c.y + c.h),
      width: pt(c.w),
      height: pt(c.h),
      color: C_BLACK,
      opacity: 0.06,
      borderColor: C_DARK_GRAY,
      borderWidth: pt(0.2),
    })
    const cl = cutLabels[i]
    if (cl) {
      const cx = px + cl.rect.x + cl.rect.w / 2
      const cy = py + cl.rect.y + cl.rect.h / 2
      const fs = pt(2.5)
      page.drawText(cl.text, {
        x: pt(cx) - font.widthOfTextAtSize(cl.text, fs) / 2,
        y: yflip(cy) + font.heightAtSize(fs) / 2,
        size: fs,
        font,
        color: C_DARK_GRAY,
      })
    }
  })

  boardDims.forEach((d) => renderPdfDimLine(page, d, px, py, font))
  cutPosDims.forEach((d) => renderPdfDimLine(page, d, px, py, font))
}

const DASH_PT = [pt(1.2), pt(0.8)]

function renderPdfDowelView(page: PDFPage, view: DowelView, font: PDFFont): void {
  const { placement: { x: px, y: py }, outline, circles, rects, segments, cutLabels, noteLabels, dims } = view // prettier-ignore

  page.drawText(view.label, { x: pt(px), y: yflip(py - 2), size: pt(3), font, color: C_GRAY })

  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    page.drawLine({
      start: { x: pt(px + a.x), y: yflip(py + a.y) },
      end: { x: pt(px + b.x), y: yflip(py + b.y) },
      thickness: pt(0.3),
      color: C_BLACK,
    })
  }

  circles.forEach((c) => {
    page.drawCircle({
      x: pt(px + c.cx),
      y: yflip(py + c.cy),
      size: pt(c.r),
      borderColor: c.dashed ? C_DARK_GRAY : C_BLACK,
      borderWidth: pt(c.dashed ? 0.2 : 0.3),
      borderDashArray: c.dashed ? DASH_PT : undefined,
    })
  })

  rects.forEach((r) => {
    page.drawRectangle({
      x: pt(px + r.rect.x),
      y: PAGE_H_PT - pt(py + r.rect.y + r.rect.h),
      width: pt(r.rect.w),
      height: pt(r.rect.h),
      color: C_BLACK,
      opacity: 0.06,
      borderColor: C_DARK_GRAY,
      borderWidth: pt(0.2),
      borderDashArray: r.dashed ? DASH_PT : undefined,
    })
  })

  segments.forEach((s) => {
    page.drawLine({
      start: { x: pt(px + s.x1), y: yflip(py + s.y1) },
      end: { x: pt(px + s.x2), y: yflip(py + s.y2) },
      thickness: pt(s.dashed ? 0.2 : 0.3),
      color: s.dashed ? C_DARK_GRAY : C_BLACK,
      dashArray: s.dashed ? DASH_PT : undefined,
    })
  })

  const drawCenteredLabel = (text: string, cx: number, cy: number) => {
    const fs = pt(2.5)
    page.drawText(text, {
      x: pt(cx) - font.widthOfTextAtSize(text, fs) / 2,
      y: yflip(cy) + font.heightAtSize(fs) / 2,
      size: fs,
      font,
      color: C_DARK_GRAY,
    })
  }
  cutLabels.forEach((cl) =>
    drawCenteredLabel(cl.text, px + cl.rect.x + cl.rect.w / 2, py + cl.rect.y + cl.rect.h / 2),
  )
  noteLabels.forEach((nl) => drawCenteredLabel(nl.text, px + nl.rect.x, py + nl.rect.y))

  dims.forEach((d) => renderPdfDimLine(page, d, px, py, font))
}

function renderPdfAssemblyView(
  page: PDFPage,
  view: PlacedAssemblyView,
  scale: number,
  font: PDFFont,
): void {
  const { x: px, y: py } = view.placement
  const H = view.bounds.h
  // Sheet millimetres with y running down, which is what yflip and pt take. Carcase v runs up, so
  // this is the only flip: the page is reached through the same two helpers every other view uses.
  const fx = (u: number) => px + u * scale
  const fy = (v: number) => py + (H - v) * scale
  const line = (x1: number, y1: number, x2: number, y2: number, dashed: boolean) =>
    page.drawLine({
      start: { x: pt(x1), y: yflip(y1) },
      end: { x: pt(x2), y: yflip(y2) },
      thickness: pt(dashed ? 0.2 : 0.3),
      color: dashed ? C_GRAY : C_BLACK,
      dashArray: dashed ? DASH_PT : undefined,
    })

  // Named exactly where and how a board sheet names its views. Three unnamed orthographic
  // projections on one page is not a drawing anyone can read.
  page.drawText(view.label, { x: pt(px), y: yflip(py - 2), size: pt(3), font, color: C_GRAY })

  // Nearest first, the order the projector emits. Nothing here is filled or clickable, so the paint
  // order is unobservable and a reversal would be a line no test could falsify.
  for (const part of view.parts) {
    // `outline` and `solid` are alternatives, never both: a part that is not an axis-aligned box
    // has only its bounding rectangle in `rects`, and drawing that puts a box around a tilted dowel.
    if (part.outline !== undefined) {
      for (let i = 0; i < part.outline.length; i++) {
        const a = part.outline[i]
        const b = part.outline[(i + 1) % part.outline.length]
        line(fx(a.x), fy(a.y), fx(b.x), fy(b.y), false)
      }
    } else {
      for (const s of part.solid) line(fx(s.x1), fy(s.y1), fx(s.x2), fy(s.y2), false)
    }
    for (const s of part.hidden) line(fx(s.x1), fy(s.y1), fx(s.x2), fy(s.y2), true)
    for (const c of part.cutRects) {
      page.drawRectangle({
        x: pt(fx(c.rect.x)),
        y: yflip(fy(c.rect.y)),
        width: pt(c.rect.w * scale),
        height: pt(c.rect.h * scale),
        borderColor: C_GRAY,
        borderWidth: pt(0.2),
        borderDashArray: DASH_PT,
      })
    }
    for (const o of part.circles) {
      page.drawCircle({
        x: pt(fx(o.cx)),
        y: yflip(fy(o.cy)),
        size: pt(o.r * scale),
        borderColor: C_GRAY,
        borderWidth: pt(0.15),
        borderDashArray: DASH_PT,
      })
    }
  }

  for (const d of view.dims) {
    renderPdfDimLine(page, assemblyDimLine(d, view.bounds, scale), px, py, font)
  }
}

function renderPdfAssemblyTitleBlock(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'assembly' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const tbY = 170 // 210 - 15 - 25
  const tbX = 15
  const tbW = 267 // 297 - 2*15

  page.drawRectangle({
    x: pt(tbX),
    y: PAGE_H_PT - pt(tbY + 25),
    width: pt(tbW),
    height: pt(25),
    borderColor: C_BLACK,
    borderWidth: pt(0.3),
  })
  page.drawText(sheet.cabinetLabel, {
    x: pt(tbX + 4),
    y: yflip(tbY + 8),
    size: pt(7),
    font: fontBold,
    color: C_BLACK,
  })
  page.drawText('Assembly', {
    x: pt(tbX + 4),
    y: yflip(tbY + 16),
    size: pt(4),
    font,
    color: C_DARK_GRAY,
  })
  page.drawText(`Scale: ${sheet.scaleLabel}`, {
    x: pt(tbX + 100),
    y: yflip(tbY + 8),
    size: pt(4),
    font,
    color: C_DARK_GRAY,
  })
  page.drawText(`Date: ${sheet.date}`, {
    x: pt(tbX + 100),
    y: yflip(tbY + 16),
    size: pt(4),
    font,
    color: C_DARK_GRAY,
  })
}

function renderPdfElevationView(
  page: PDFPage,
  view: PlacedWallElevationView,
  scale: number,
  font: PDFFont,
): void {
  const { x: px, y: py } = view.placement
  const H = view.bounds.h
  const fx = (u: number) => px + u * scale
  const fy = (v: number) => py + (H - v) * scale
  const line = (x1: number, y1: number, x2: number, y2: number, dashed: boolean) =>
    page.drawLine({
      start: { x: pt(x1), y: yflip(y1) },
      end: { x: pt(x2), y: yflip(y2) },
      thickness: pt(dashed ? 0.25 : 0.3),
      color: dashed ? C_GRAY : C_BLACK,
      dashArray: dashed ? DASH_PT : undefined,
    })

  page.drawText(view.wallName, { x: pt(px), y: yflip(py - 2), size: pt(3), font, color: C_GRAY })
  page.drawLine({
    start: { x: pt(px), y: yflip(fy(view.floorZ)) },
    end: { x: pt(fx(view.bounds.w)), y: yflip(fy(view.floorZ)) },
    thickness: pt(0.5),
    color: C_BLACK,
  })
  for (const span of view.spans) {
    const dashed = span.kind === 'opening'
    const [x0, x1, y0, y1] = [fx(span.x0), fx(span.x1), fy(span.z1), fy(span.z0)]
    line(x0, y0, x1, y0, dashed)
    line(x1, y0, x1, y1, dashed)
    line(x1, y1, x0, y1, dashed)
    line(x0, y1, x0, y0, dashed)
    const size = pt(2)
    page.drawText(span.label, {
      x: pt(fx((span.x0 + span.x1) / 2)) - font.widthOfTextAtSize(span.label, size) / 2,
      y: yflip(fy((span.z0 + span.z1) / 2)),
      size,
      font,
      color: C_DARK_GRAY,
    })
  }
  for (const d of view.dims) {
    renderPdfDimLine(page, assemblyDimLine(d, view.bounds, scale), px, py, font)
  }
}

function renderPdfElevationTitleBlock(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'elevation' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const tbY = 170
  const tbX = 15
  page.drawRectangle({
    x: pt(tbX),
    y: PAGE_H_PT - pt(tbY + 25),
    width: pt(267),
    height: pt(25),
    borderColor: C_BLACK,
    borderWidth: pt(0.3),
  })
  const text = (s: string, x: number, y: number, size: number, f: PDFFont, color = C_DARK_GRAY) =>
    page.drawText(s, { x: pt(x), y: yflip(y), size: pt(size), font: f, color })
  text(`${sheet.roomName} — ${sheet.wallName}`, tbX + 4, tbY + 8, 7, fontBold, C_BLACK)
  text('Wall elevation', tbX + 4, tbY + 16, 4, font)
  if (!sheet.verified) text('Wall length not site-verified', tbX + 4, tbY + 22, 3, font)
  text(`Scale: ${sheet.scaleLabel}`, tbX + 140, tbY + 8, 4, font)
  text(`Date: ${sheet.date}`, tbX + 140, tbY + 16, 4, font)
}

function wrapManufacturingNotes(notes: string[], maxChars = 90): string[] {
  return notes.flatMap((note) => {
    const lines: string[] = []
    let line = ''
    for (const word of note.split(' ')) {
      const next = line === '' ? word : `${line} ${word}`
      if (line !== '' && next.length > maxChars) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    if (line !== '') lines.push(line)
    return lines
  })
}

function renderPdfTitleBlock(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'part' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const tbY = 170 // 210 - 15 - 25
  const tbX = 15
  const tbW = 267 // 297 - 2*15

  page.drawRectangle({
    x: pt(tbX),
    y: PAGE_H_PT - pt(tbY + 25),
    width: pt(tbW),
    height: pt(25),
    borderColor: C_BLACK,
    borderWidth: pt(0.3),
  })
  page.drawText(sheet.partLabel, {
    x: pt(tbX + 4),
    y: yflip(tbY + 8),
    size: pt(7),
    font: fontBold,
    color: C_BLACK,
  })
  page.drawText(sheet.material || '—', {
    x: pt(tbX + 4),
    y: yflip(tbY + 16),
    size: pt(4),
    font,
    color: C_DARK_GRAY,
  })
  page.drawText(`Scale: ${sheet.scaleLabel}`, {
    x: pt(tbX + 100),
    y: yflip(tbY + 8),
    size: pt(4),
    font,
    color: C_DARK_GRAY,
  })
  page.drawText(`Date: ${sheet.date}`, {
    x: pt(tbX + 100),
    y: yflip(tbY + 16),
    size: pt(4),
    font,
    color: C_DARK_GRAY,
  })
  if (sheet.shape === 'board') {
    wrapManufacturingNotes(sheet.manufacturingNotes).forEach((line, i) => {
      page.drawText(line, {
        x: pt(tbX + 155),
        y: yflip(tbY + 4 + i * 2.4),
        size: pt(2),
        font,
        color: C_BLACK,
      })
    })
  }
  page.drawRectangle({
    x: pt(tbX + tbW - 20),
    y: PAGE_H_PT - pt(tbY + 8 + 4),
    width: pt(6),
    height: pt(4),
    color: hexRgb(sheet.color),
    borderColor: C_SWATCH_BD,
    borderWidth: pt(0.2),
  })
}

function renderPdfCoverSheet(
  page: PDFPage,
  sheet: Extract<DrawingSheet, { kind: 'cover' }>,
  font: PDFFont,
  fontBold: PDFFont,
): void {
  const cx = 15,
    cy = 15
  const rowH = 8
  const tableY = cy + 26 // 41mm
  const cols = [0, 12, 60, 100, 170, 220]

  page.drawText(sheet.projectName, {
    x: pt(cx),
    y: yflip(cy + 10),
    size: pt(12),
    font: fontBold,
    color: C_BLACK,
  })
  page.drawText(sheet.date, { x: pt(cx), y: yflip(cy + 18), size: pt(5), font, color: C_TABLE_BD })

  // Header row
  page.drawRectangle({
    x: pt(cx),
    y: PAGE_H_PT - pt(tableY + rowH),
    width: pt(267),
    height: pt(rowH),
    color: C_NEAR_WHITE,
    borderColor: C_LIGHT_GRAY,
    borderWidth: pt(0.2),
  })
  const headers = ['#', 'Label', 'Material', 'Dimensions', 'Cuts']
  headers.forEach((h, i) => {
    page.drawText(h, {
      x: pt(cx + cols[i] + 1),
      y: yflip(tableY + 5.5),
      size: pt(3.5),
      font: fontBold,
      color: C_BLACK,
    })
  })

  // Data rows
  sheet.rows.forEach((row, ri) => {
    const ry = tableY + rowH * (ri + 1)
    page.drawRectangle({
      x: pt(cx),
      y: PAGE_H_PT - pt(ry + rowH),
      width: pt(267),
      height: pt(rowH),
      borderColor: C_LIGHT_GRAY,
      borderWidth: pt(0.2),
    })
    const cells = [
      String(row.index),
      row.label,
      row.material || '—',
      row.dimensions,
      String(row.cutCount),
    ]
    cells.forEach((c, i) => {
      page.drawText(c, {
        x: pt(cx + cols[i] + 1),
        y: yflip(ry + 5.5),
        size: pt(3.5),
        font,
        color: C_BLACK,
      })
    })
  })
}

export async function buildPdf(sheets: DrawingSheet[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  // Standard PDF fonts cannot encode every label in a project (or the diameter sign on a dowel).
  // Keep the drawing geometry intact while preserving unsupported text as an explicit reference.
  const supported = new Set(font.getCharacterSet())
  const safeSheets = JSON.parse(
    JSON.stringify(sheets, (_key, value: unknown) =>
      typeof value === 'string'
        ? Array.from(value.normalize('NFC'))
            .map((char) =>
              char === '⌀'
                ? 'DIA '
                : supported.has(char.codePointAt(0)!)
                  ? char
                  : `[U+${char.codePointAt(0)!.toString(16).toUpperCase()}]`,
            )
            .join('')
        : value,
    ),
  ) as DrawingSheet[]

  for (const sheet of safeSheets) {
    const page = doc.addPage([PAGE_W_PT, PAGE_H_PT])
    if (sheet.kind === 'cover') {
      renderPdfCoverSheet(page, sheet, font, fontBold)
    } else if (sheet.kind === 'installation') {
      sheet.lines.forEach((line) => page.drawLine({
        start: { x: pt(line.a.x), y: yflip(line.a.y) },
        end: { x: pt(line.b.x), y: yflip(line.b.y) },
        thickness: pt(line.role === 'structure' ? 0.15 : 0.4),
        color: line.role === 'structure' ? C_LIGHT_GRAY : C_BLACK,
        ...(line.role === 'entry' ? { dashArray: [pt(1.2), pt(0.8)] } : {}),
      }))
      sheet.texts.forEach((text) => page.drawText(text.text, {
        x: pt(text.x) - font.widthOfTextAtSize(text.text, pt(text.size)) / 2,
        y: yflip(text.y), size: pt(text.size), font, color: C_BLACK,
      }))
    } else if (sheet.kind === 'elevation') {
      renderPdfElevationView(page, sheet.view, sheet.scale, font)
      renderPdfElevationTitleBlock(page, sheet, font, fontBold)
    } else if (sheet.kind === 'assembly') {
      sheet.views.forEach((v) => renderPdfAssemblyView(page, v, sheet.scale, font))
      renderPdfAssemblyTitleBlock(page, sheet, font, fontBold)
    } else if (sheet.shape === 'dowel') {
      sheet.views.forEach((v) => renderPdfDowelView(page, v, font))
      renderPdfTitleBlock(page, sheet, font, fontBold)
    } else {
      sheet.views.forEach((v) => renderPdfView(page, v, font))
      renderPdfTitleBlock(page, sheet, font, fontBold)
    }
  }

  return doc.save()
}
