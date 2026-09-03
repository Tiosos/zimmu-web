import { assemblyDimLine } from '../geom/drawing'
import type {
  DrawingSheet,
  DrawingView,
  DowelView,
  DimLine,
  DrawCircle,
  PlacedAssemblyView,
  Rect2D,
} from '../geom/drawing'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SHEET_H = 210
const TITLE_H = 25
const MARGIN = 15
const TICK = 1.5

function fmt(n: number): string {
  return n.toFixed(3)
}

function el(tag: string, attrs: Record<string, string | number>, content?: string): string {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${typeof v === 'string' ? escapeXml(v) : v}"`)
    .join(' ')
  if (content === undefined) return `<${tag} ${a}/>`
  return `<${tag} ${a}>${escapeXml(content)}</${tag}>`
}

function svgRect(
  x: number,
  y: number,
  w: number,
  h: number,
  style: Record<string, string | number>,
): string {
  return el('rect', { x: fmt(x), y: fmt(y), width: fmt(w), height: fmt(h), ...style })
}

function svgLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: Record<string, string | number>,
): string {
  return el('line', { x1: fmt(x1), y1: fmt(y1), x2: fmt(x2), y2: fmt(y2), ...style })
}

function svgText(
  x: number,
  y: number,
  content: string,
  style: Record<string, string | number>,
): string {
  return el('text', { x: fmt(x), y: fmt(y), ...style }, content)
}

function svgCircle(
  cx: number,
  cy: number,
  r: number,
  style: Record<string, string | number>,
): string {
  return el('circle', { cx: fmt(cx), cy: fmt(cy), r: fmt(r), ...style })
}

const DASH = { 'stroke-dasharray': '1.2,0.8' }

function renderCircles(circles: DrawCircle[], px: number, py: number): string {
  return circles
    .map((c) =>
      svgCircle(px + c.cx, py + c.cy, c.r, {
        stroke: '#000',
        fill: 'none',
        'stroke-width': c.dashed ? '0.2' : '0.3',
        ...(c.dashed ? DASH : {}),
      }),
    )
    .join('')
}

function renderDimLine(dim: DimLine, px: number, py: number): string {
  const lineStyle = { stroke: '#555', 'stroke-width': '0.15' }
  const textStyle = { 'font-size': '2', fill: '#444', 'font-family': 'sans-serif' }

  if (dim.axis === 'h') {
    const y = py + dim.offset
    const midX = px + (dim.start + dim.end) / 2
    return [
      svgLine(px + dim.start, y, px + dim.end, y, lineStyle),
      svgLine(px + dim.start, y - TICK, px + dim.start, y + TICK, lineStyle),
      svgLine(px + dim.end, y - TICK, px + dim.end, y + TICK, lineStyle),
      svgText(midX, y - 1, dim.label, { ...textStyle, 'text-anchor': 'middle' }),
    ].join('')
  } else {
    const x = px + dim.offset
    const midY = py + (dim.start + dim.end) / 2
    // A label reads AWAY from the line it belongs to. Anchoring every one at 'start' runs a
    // left-hand label rightward across the drawing it annotates. Every board vertical dim has a
    // positive offset, so `offset < 0` identifies an assembly view's left-hand ring exactly and
    // this branch is a no-op for a board sheet.
    const left = dim.offset < 0
    return [
      svgLine(x, py + dim.start, x, py + dim.end, lineStyle),
      svgLine(x - TICK, py + dim.start, x + TICK, py + dim.start, lineStyle),
      svgLine(x - TICK, py + dim.end, x + TICK, py + dim.end, lineStyle),
      svgText(left ? x - 1.5 : x + 1.5, midY, dim.label, {
        ...textStyle,
        'text-anchor': left ? 'end' : 'start',
        'dominant-baseline': 'middle',
      }),
    ].join('')
  }
}

function renderView(view: DrawingView): string {
  const {
    placement: { x: px, y: py },
    boardRect,
    boardOutline,
    cuts,
    circles,
    cutLabels,
    noteLabels,
    boardDims,
    cutPosDims,
  } = view
  const out: string[] = []

  out.push(
    svgText(px, py - 2, view.label, {
      'font-size': '3',
      fill: '#888',
      'font-family': 'sans-serif',
    }),
  )

  if (boardOutline) {
    const points = boardOutline.map((p) => `${fmt(px + p.x)},${fmt(py + p.y)}`).join(' ')
    out.push(el('polygon', { points, stroke: '#000', fill: 'none', 'stroke-width': '0.3' }))
  } else {
    out.push(
      svgRect(px + boardRect.x, py + boardRect.y, boardRect.w, boardRect.h, {
        stroke: '#000',
        fill: 'none',
        'stroke-width': '0.3',
      }),
    )
  }

  cuts.forEach((c: Rect2D, i: number) => {
    out.push(
      svgRect(px + c.x, py + c.y, c.w, c.h, {
        stroke: '#444',
        fill: 'rgba(0,0,0,0.06)',
        'stroke-width': '0.2',
      }),
    )
    const cl = cutLabels[i]
    if (cl) {
      out.push(
        svgText(px + cl.rect.x + cl.rect.w / 2, py + cl.rect.y + cl.rect.h / 2, cl.text, {
          'font-size': '2.5',
          fill: '#333',
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          'font-family': 'sans-serif',
        }),
      )
    }
  })

  out.push(renderCircles(circles, px, py))

  noteLabels.forEach((nl) =>
    out.push(
      svgText(px + nl.rect.x, py + nl.rect.y, nl.text, {
        'font-size': '2.5',
        fill: '#0a6',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'sans-serif',
      }),
    ),
  )

  boardDims.forEach((d: DimLine) => out.push(renderDimLine(d, px, py)))
  cutPosDims.forEach((d: DimLine) => out.push(renderDimLine(d, px, py)))

  return out.join('')
}

function renderDowelView(view: DowelView): string {
  const { placement: { x: px, y: py }, outline, circles, rects, segments, cutLabels, noteLabels, dims } = view // prettier-ignore
  const out: string[] = []

  out.push(
    svgText(px, py - 2, view.label, {
      'font-size': '3',
      fill: '#888',
      'font-family': 'sans-serif',
    }),
  )

  if (outline.length > 0) {
    const points = outline.map((p) => `${fmt(px + p.x)},${fmt(py + p.y)}`).join(' ')
    out.push(el('polygon', { points, stroke: '#000', fill: 'none', 'stroke-width': '0.3' }))
  }

  out.push(renderCircles(circles, px, py))

  rects.forEach((r) => {
    out.push(
      svgRect(px + r.rect.x, py + r.rect.y, r.rect.w, r.rect.h, {
        stroke: '#444',
        fill: 'rgba(0,0,0,0.06)',
        'stroke-width': '0.2',
        ...(r.dashed ? DASH : {}),
      }),
    )
  })

  segments.forEach((s) => {
    out.push(
      svgLine(px + s.x1, py + s.y1, px + s.x2, py + s.y2, {
        stroke: s.dashed ? '#444' : '#000',
        'stroke-width': s.dashed ? '0.2' : '0.3',
        ...(s.dashed ? DASH : {}),
      }),
    )
  })

  cutLabels.forEach((cl) =>
    out.push(
      svgText(px + cl.rect.x + cl.rect.w / 2, py + cl.rect.y + cl.rect.h / 2, cl.text, {
        'font-size': '2.5',
        fill: '#333',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'sans-serif',
      }),
    ),
  )

  noteLabels.forEach((nl) =>
    out.push(
      svgText(px + nl.rect.x, py + nl.rect.y, nl.text, {
        'font-size': '2.5',
        fill: '#0a6',
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-family': 'sans-serif',
      }),
    ),
  )

  dims.forEach((d) => out.push(renderDimLine(d, px, py)))

  return out.join('')
}

function renderTitleBlock(sheet: Extract<DrawingSheet, { kind: 'part' }>): string {
  const tbY = SHEET_H - MARGIN - TITLE_H
  const tbX = MARGIN
  const tbW = 297 - 2 * MARGIN

  return [
    svgRect(tbX, tbY, tbW, TITLE_H, { stroke: '#000', fill: 'none', 'stroke-width': '0.3' }),
    svgText(tbX + 4, tbY + 8, sheet.partLabel, {
      'font-size': '7',
      'font-weight': 'bold',
      fill: '#000',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 4, tbY + 16, sheet.material || '—', {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 100, tbY + 8, `Scale: ${sheet.scaleLabel}`, {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 100, tbY + 16, `Date: ${sheet.date}`, {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
    svgRect(tbX + tbW - 20, tbY + 8, 6, 4, {
      fill: sheet.color,
      stroke: '#333',
      'stroke-width': '0.2',
    }),
  ].join('')
}

function renderAssemblyView(view: PlacedAssemblyView, scale: number): string {
  const out: string[] = []
  const { x: px, y: py } = view.placement
  const H = view.bounds.h
  // Carcase v runs up and SVG y runs down; the flip is written once, here, exactly as the pane
  // writes it once in CabinetProjection.
  const fx = (u: number) => px + u * scale
  const fy = (v: number) => py + (H - v) * scale

  // Named exactly where and how a board sheet names its views. Three unnamed orthographic
  // projections on one page is not a drawing anyone can read.
  out.push(
    svgText(px, py - 2, view.label, {
      'font-size': '3',
      fill: '#888',
      'font-family': 'sans-serif',
    }),
  )

  // Nearest first, the order the projector emits. The pane reverses it so the nearest part paints
  // last and takes the click; nothing here is filled and nothing is clickable, so on a sheet the
  // order is unobservable and a reversal would be a line no test could falsify.
  for (const part of view.parts) {
    // A part that is not an axis-aligned box carries `outline` — its real silhouette — while its
    // `rects`, and so its `solid`, is only the bounding rectangle. The two are alternatives, never
    // both: drawing `solid` for such a part puts a box around a tilted dowel. Same rule and same
    // reason as the polygon branch in CabinetProjection. A POLYGON, not a polyline: `hullOf`
    // returns a closed ring with no repeated first point, so a polyline leaves one edge undrawn.
    if (part.outline !== undefined) {
      const points = part.outline.map((q) => `${fmt(fx(q.x))},${fmt(fy(q.y))}`).join(' ')
      out.push(el('polygon', { points, stroke: '#000', fill: 'none', 'stroke-width': '0.3' }))
    } else {
      for (const s of part.solid) {
        out.push(
          svgLine(fx(s.x1), fy(s.y1), fx(s.x2), fy(s.y2), {
            stroke: '#000',
            'stroke-width': '0.3',
          }),
        )
      }
    }
    for (const s of part.hidden) {
      out.push(
        svgLine(fx(s.x1), fy(s.y1), fx(s.x2), fy(s.y2), {
          stroke: '#888',
          'stroke-width': '0.2',
          ...DASH,
        }),
      )
    }
    for (const c of part.cutRects) {
      out.push(
        svgRect(fx(c.rect.x), fy(c.rect.y + c.rect.h), c.rect.w * scale, c.rect.h * scale, {
          fill: 'none',
          stroke: '#888',
          'stroke-width': '0.2',
          ...DASH,
        }),
      )
    }
    for (const o of part.circles) {
      out.push(
        svgCircle(fx(o.cx), fy(o.cy), o.r * scale, {
          fill: 'none',
          stroke: '#888',
          'stroke-width': '0.15',
          ...DASH,
        }),
      )
    }
  }

  for (const d of view.dims) {
    out.push(renderDimLine(assemblyDimLine(d, view.bounds, scale), px, py))
  }

  return out.join('')
}

function renderAssemblyTitleBlock(sheet: Extract<DrawingSheet, { kind: 'assembly' }>): string {
  const tbY = SHEET_H - MARGIN - TITLE_H
  const tbX = MARGIN
  return [
    svgRect(tbX, tbY, 297 - 2 * MARGIN, TITLE_H, {
      stroke: '#000',
      fill: 'none',
      'stroke-width': '0.3',
    }),
    svgText(tbX + 4, tbY + 8, sheet.cabinetLabel, {
      'font-size': '7',
      'font-weight': 'bold',
      fill: '#000',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 4, tbY + 16, 'Assembly', {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 100, tbY + 8, `Scale: ${sheet.scaleLabel}`, {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
    svgText(tbX + 100, tbY + 16, `Date: ${sheet.date}`, {
      'font-size': '4',
      fill: '#444',
      'font-family': 'sans-serif',
    }),
  ].join('')
}

function renderCoverSheet(sheet: Extract<DrawingSheet, { kind: 'cover' }>): string {
  const out: string[] = []
  const cx = MARGIN
  const cy = MARGIN

  out.push(
    svgText(cx, cy + 10, sheet.projectName, {
      'font-size': '12',
      'font-weight': 'bold',
      fill: '#000',
      'font-family': 'sans-serif',
    }),
  )
  out.push(
    svgText(cx, cy + 18, sheet.date, {
      'font-size': '5',
      fill: '#666',
      'font-family': 'sans-serif',
    }),
  )

  const rowH = 8
  const tableY = cy + 26
  const cols = [0, 12, 60, 100, 170, 220]
  const headers = ['#', 'Label', 'Material', 'Dimensions', 'Cuts']

  out.push(svgRect(cx, tableY, 267, rowH, { fill: '#eee', stroke: '#ccc', 'stroke-width': '0.2' }))
  headers.forEach((h, i) => {
    out.push(
      svgText(cx + cols[i] + 1, tableY + 5.5, h, {
        'font-size': '3.5',
        'font-weight': 'bold',
        fill: '#000',
        'font-family': 'sans-serif',
      }),
    )
  })

  sheet.rows.forEach((row, ri) => {
    const ry = tableY + rowH * (ri + 1)
    out.push(svgRect(cx, ry, 267, rowH, { fill: 'none', stroke: '#ccc', 'stroke-width': '0.2' }))
    const cells = [
      String(row.index),
      row.label,
      row.material || '—',
      row.dimensions,
      String(row.cutCount),
    ]
    cells.forEach((c, i) => {
      out.push(
        svgText(cx + cols[i] + 1, ry + 5.5, c, {
          'font-size': '3.5',
          fill: '#000',
          'font-family': 'sans-serif',
        }),
      )
    })
  })

  return out.join('')
}

export function buildSvg(sheet: DrawingSheet): string {
  const printStyle = `<style>@media print{svg{width:100%;height:auto;page-break-after:always;}}</style>`

  let body: string
  if (sheet.kind === 'cover') {
    body = renderCoverSheet(sheet)
  } else if (sheet.kind === 'assembly') {
    body =
      sheet.views.map((v) => renderAssemblyView(v, sheet.scale)).join('') +
      renderAssemblyTitleBlock(sheet)
  } else if (sheet.shape === 'dowel') {
    body = sheet.views.map(renderDowelView).join('') + renderTitleBlock(sheet)
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
