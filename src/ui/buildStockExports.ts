import type { StockResult } from '../nest/stockOptimisation'
import { buildSheetSvg } from './buildSheetSvg'
const quote = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
export function buildStockCsv(result: StockResult, label: (id: string) => string): string {
  const rows: unknown[][] = [
    [
      'Type',
      'Stock ID',
      'Stock name',
      'Sheet',
      'Part ID',
      'Part',
      'X mm',
      'Y mm',
      'Length mm',
      'Width mm',
      'Rotation',
      'Quantity',
      'Cost',
      'Remaining / reason',
    ],
  ]
  result.sheets.forEach((s, i) =>
    s.placements.forEach((p) =>
      rows.push([
        'Panel',
        s.stock.id,
        s.stock.name,
        i + 1,
        p.id,
        label(p.id),
        p.x,
        p.y,
        p.w,
        p.h,
        p.rotation,
        '',
        '',
        '',
      ]),
    ),
  )
  result.counts.forEach((c) =>
    rows.push([
      c.kind === 'sheet' ? 'Purchase' : 'Offcut use',
      c.stockId,
      c.name,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      c.count,
      c.cost ?? 'Unknown',
      c.remaining ?? 'Unlimited',
    ]),
  )
  result.remnants.forEach((r) =>
    rows.push([
      'Remnant',
      r.stockId,
      '',
      r.sheet + 1,
      r.id,
      '',
      r.x,
      r.y,
      r.w,
      r.h,
      '',
      1,
      0,
      'Proposed only',
    ]),
  )
  result.unplaced.forEach((p) =>
    rows.push(['Unplaced', '', '', '', p.id, label(p.id), '', '', '', '', '', '', '', p.reason]),
  )
  const extra = [
    'Material',
    'Thickness mm',
    'Stock length mm',
    'Stock width mm',
    'Stock grain',
    'Storage location',
    'Grain group ID',
    'Sequence',
  ]
  return (
    rows
      .map((r, i) => {
        if (!i) return [...r, ...extra].map(quote).join(',')
        const stock = result.sheets.find((s) => s.stock.id === r[1])?.stock
        const panel =
          r[0] === 'Panel'
            ? result.sheets[Number(r[3]) - 1].placements.find((p) => p.id === r[4])
            : undefined
        return [
          ...r,
          stock?.material,
          stock?.thickness,
          stock?.length,
          stock?.width,
          stock?.grain,
          stock?.location,
          panel?.grainMatch?.groupId,
          panel?.grainMatch?.sequence,
        ]
          .map(quote)
          .join(',')
      })
      .join('\n') + '\n'
  )
}
export function buildStockSheetSvg(
  result: StockResult,
  index: number,
  label: (id: string) => string,
): string {
  const s = result.sheets[index],
    svg = buildSheetSvg(
      { length: s.stock.length, width: s.stock.width },
      s.placements,
      label,
      600,
      undefined,
      s.blanks,
    ),
    scale = 600 / s.stock.length,
    t = s.stock.trim
  const boundary = `<rect data-usable-stock="1" x="${t * scale}" y="${t * scale}" width="${(s.stock.length - 2 * t) * scale}" height="${(s.stock.width - 2 * t) * scale}" fill="none" stroke="#059669" stroke-dasharray="3 3" />`
  const remnants = result.remnants
    .filter((r) => r.sheet === index)
    .map(
      (r) =>
        `<rect data-remnant="${r.id}" x="${r.x * scale}" y="${(s.stock.width - r.y - r.h) * scale}" width="${r.w * scale}" height="${r.h * scale}" fill="#059669" fill-opacity="0.08" stroke="#059669"><title>Proposed remnant ${r.w.toFixed(2)} × ${r.h.toFixed(2)} mm</title></rect>`,
    )
    .join('')
  const escape = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  const identity = escape(
    `${s.stock.name}; Stock ID ${s.stock.id}; ${s.stock.material}; ${s.stock.thickness} mm; grain ${s.stock.grain}; ${s.stock.location}`,
  )
  return svg
    .replace(/(<svg[^>]*>)/, (prefix) => `${prefix}<title>${identity}</title>`)
    .replace('</svg>', boundary + remnants + '</svg>')
}
