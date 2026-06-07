import type { DrawingSheet, DrawingView, DimLine, Rect2D } from '../geom/drawing'

const SHEET_H = 210

function fmt(n: number): string {
  return n.toFixed(3)
}

// DXF Y-axis is up; SVG Y-axis is down.
function fy(y: number): number {
  return SHEET_H - y
}

function dxfLine(layer: string, x1: number, y1: number, x2: number, y2: number): string {
  return (
    [
      '0',
      'LINE',
      '8',
      layer,
      '10',
      fmt(x1),
      '20',
      fmt(fy(y1)),
      '30',
      '0.000',
      '11',
      fmt(x2),
      '21',
      fmt(fy(y2)),
      '31',
      '0.000',
    ].join('\n') + '\n'
  )
}

// Draws 4 LINE entities forming a closed rectangle.
function dxfRect(layer: string, x: number, y: number, w: number, h: number): string {
  return (
    dxfLine(layer, x, y, x + w, y) +
    dxfLine(layer, x + w, y, x + w, y + h) +
    dxfLine(layer, x + w, y + h, x, y + h) +
    dxfLine(layer, x, y + h, x, y)
  )
}

// Center-justified TEXT entity.
function dxfText(layer: string, x: number, y: number, height: number, content: string): string {
  return (
    [
      '0',
      'TEXT',
      '8',
      layer,
      '10',
      fmt(x),
      '20',
      fmt(fy(y)),
      '30',
      '0.000',
      '40',
      fmt(height),
      '1',
      content,
      '72',
      '1',
      '11',
      fmt(x),
      '21',
      fmt(fy(y)),
      '31',
      '0.000',
    ].join('\n') + '\n'
  )
}

const TICK = 1.5

function dxfDimLine(dim: DimLine, px: number, py: number): string {
  const out: string[] = []
  if (dim.axis === 'h') {
    const y = py + dim.offset
    const midX = px + (dim.start + dim.end) / 2
    out.push(dxfLine('DIM', px + dim.start, y, px + dim.end, y))
    out.push(dxfLine('DIM', px + dim.start, y - TICK, px + dim.start, y + TICK))
    out.push(dxfLine('DIM', px + dim.end, y - TICK, px + dim.end, y + TICK))
    out.push(dxfText('TEXT', midX, y - 1.5, 2, dim.label))
  } else {
    const x = px + dim.offset
    const midY = py + (dim.start + dim.end) / 2
    out.push(dxfLine('DIM', x, py + dim.start, x, py + dim.end))
    out.push(dxfLine('DIM', x - TICK, py + dim.start, x + TICK, py + dim.start))
    out.push(dxfLine('DIM', x - TICK, py + dim.end, x + TICK, py + dim.end))
    out.push(dxfText('TEXT', x + 2, midY, 2, dim.label))
  }
  return out.join('')
}

function dxfView(view: DrawingView): string {
  const {
    placement: { x: px, y: py },
    boardRect,
    cuts,
    cutLabels,
    boardDims,
    cutPosDims,
  } = view
  const out: string[] = []

  out.push(dxfText('TEXT', px, py - 2, 3, view.label))
  out.push(dxfRect('OUTLINE', px + boardRect.x, py + boardRect.y, boardRect.w, boardRect.h))

  cuts.forEach((c: Rect2D, i: number) => {
    out.push(dxfRect('CUTS', px + c.x, py + c.y, c.w, c.h))
    const cl = cutLabels[i]
    if (cl) {
      out.push(
        dxfText(
          'TEXT',
          px + cl.rect.x + cl.rect.w / 2,
          py + cl.rect.y + cl.rect.h / 2,
          2.5,
          cl.text,
        ),
      )
    }
  })

  boardDims.forEach((d: DimLine) => out.push(dxfDimLine(d, px, py)))
  cutPosDims.forEach((d: DimLine) => out.push(dxfDimLine(d, px, py)))

  return out.join('')
}

function dxfTitleBlock(sheet: Extract<DrawingSheet, { kind: 'part' }>): string {
  const MARGIN = 15
  const tbY = SHEET_H - MARGIN - 25
  const tbX = MARGIN
  const tbW = 297 - 2 * MARGIN

  return [
    dxfRect('TITLE', tbX, tbY, tbW, 25),
    dxfText('TITLE', tbX + 4, tbY + 8, 7, sheet.partLabel),
    dxfText('TEXT', tbX + 4, tbY + 16, 4, sheet.material || '—'),
    dxfText('TEXT', tbX + 100, tbY + 8, 4, `Scale: ${sheet.scaleLabel}`),
    dxfText('TEXT', tbX + 100, tbY + 16, 4, `Date: ${sheet.date}`),
  ].join('')
}

function dxfCoverSheet(sheet: Extract<DrawingSheet, { kind: 'cover' }>): string {
  const MARGIN = 15
  const cx = MARGIN
  const cy = MARGIN
  const out: string[] = []

  out.push(dxfText('TEXT', cx, cy + 10, 12, sheet.projectName))
  out.push(dxfText('TEXT', cx, cy + 18, 5, sheet.date))

  const rowH = 8
  const tableY = cy + 26
  const cols = [0, 12, 60, 100, 170]

  out.push(dxfRect('TITLE', cx, tableY, 267, rowH))
  const headers = ['#', 'Label', 'Material', 'L x W x T', 'Cuts']
  headers.forEach((h, i) => out.push(dxfText('TEXT', cx + cols[i] + 1, tableY + 5.5, 3.5, h)))

  sheet.rows.forEach((row, ri) => {
    const ry = tableY + rowH * (ri + 1)
    out.push(dxfRect('TITLE', cx, ry, 267, rowH))
    const cells = [
      String(row.index),
      row.label,
      row.material || '-',
      `${row.length}x${row.width}x${row.thickness}`,
      String(row.cutCount),
    ]
    cells.forEach((c, i) => out.push(dxfText('TEXT', cx + cols[i] + 1, ry + 5.5, 3.5, c)))
  })

  return out.join('')
}

function dxfTables(): string {
  const layers = ['OUTLINE', 'CUTS', 'DIM', 'TEXT', 'TITLE']
  const layerDefs = layers
    .map((name) => ['0', 'LAYER', '2', name, '70', '0', '62', '7', '6', 'CONTINUOUS'].join('\n'))
    .join('\n')

  return (
    [
      '0',
      'SECTION',
      '2',
      'TABLES',
      '0',
      'TABLE',
      '2',
      'LAYER',
      '70',
      String(layers.length),
      layerDefs,
      '0',
      'ENDTAB',
      '0',
      'ENDSEC',
    ].join('\n') + '\n'
  )
}

export function buildDxf(sheet: DrawingSheet): string {
  const header =
    [
      '0',
      'SECTION',
      '2',
      'HEADER',
      '9',
      '$ACADVER',
      '1',
      'AC1009',
      '9',
      '$EXTMIN',
      '10',
      '0.000',
      '20',
      '0.000',
      '30',
      '0.000',
      '9',
      '$EXTMAX',
      '10',
      '297.000',
      '20',
      '210.000',
      '30',
      '0.000',
      '0',
      'ENDSEC',
    ].join('\n') + '\n'

  let entities: string
  if (sheet.kind === 'cover') {
    entities = dxfCoverSheet(sheet)
  } else {
    entities = sheet.views.map(dxfView).join('') + dxfTitleBlock(sheet)
  }

  return header + dxfTables() + '0\nSECTION\n2\nENTITIES\n' + entities + '0\nENDSEC\n' + '0\nEOF'
}
