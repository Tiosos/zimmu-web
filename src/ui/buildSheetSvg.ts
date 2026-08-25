import type { Placement, SheetSpec } from '../nest/nest'

// Roughly how wide a character is at a given font size, for deciding whether a label fits its part.
// A measurement is impossible in a string serialiser and unnecessary: the only decision it feeds is
// "draw the label or leave it out", where erring toward leaving it out costs nothing.
const CHAR_ASPECT = 0.6
const LABEL_SIZE = 9

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// A nest has its origin bottom-left, like a sheet lying on a bench, and SVG y grows downward — so
// every y is flipped. Stated here and pinned by a test rather than assumed: the shop drawings
// carried a half-size offset for months because a projection's convention was never checked.
export function buildSheetSvg(
  sheet: SheetSpec,
  placements: Placement[],
  labelOf: (id: string) => string,
  viewportWidth = 600,
): string {
  const scale = viewportWidth / sheet.length
  const w = sheet.length * scale
  const h = sheet.width * scale

  const parts = placements
    .map((p) => {
      const px = p.x * scale
      const py = (sheet.width - (p.y + p.h)) * scale
      const pw = p.w * scale
      const ph = p.h * scale

      const label = labelOf(p.id)
      const fits = label.length * LABEL_SIZE * CHAR_ASPECT <= pw - 4 && LABEL_SIZE + 2 <= ph
      const text = fits
        ? `<text x="${(px + pw / 2).toFixed(2)}" y="${(py + ph / 2 + LABEL_SIZE / 3).toFixed(2)}" text-anchor="middle" font-size="${LABEL_SIZE}" fill="currentColor" opacity="0.75">${escapeXml(label)}</text>`
        : ''

      return `<rect data-part="${escapeXml(p.id)}" x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${pw.toFixed(2)}" height="${ph.toFixed(2)}" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-opacity="0.55" stroke-width="0.75" />${text}`
    })
    .join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" role="img">`,
    `<rect data-sheet="1" x="0" y="0" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="none" stroke="currentColor" stroke-opacity="0.4" stroke-width="1" />`,
    parts,
    `</svg>`,
  ].join('')
}
