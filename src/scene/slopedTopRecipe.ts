import type { CarcaseParams } from './types'
export interface SlopedTop {
  version: 1
  axis: 'width' | 'depth'
  highEnd: 'start' | 'end'
  drop: number
  left: number
  right: number
  front: number
  back: number
  minClearance: number
}
export const defaultSlopedTop = (): SlopedTop => ({
  version: 1,
  axis: 'width',
  highEnd: 'start',
  drop: 200,
  left: 0,
  right: 0,
  front: 0,
  back: 0,
  minClearance: 50,
})
export function slopedTopError(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Slope settings must be an object.'
  const s = v as Record<string, unknown>
  if (
    s.version !== 1 ||
    !['width', 'depth'].includes(s.axis as string) ||
    !['start', 'end'].includes(s.highEnd as string)
  )
    return 'Invalid slope version, direction or high end.'
  if (
    !['drop', 'left', 'right', 'front', 'back', 'minClearance'].every(
      (k) => typeof s[k] === 'number' && Number.isFinite(s[k]),
    )
  )
    return 'Complete slope dimensions with finite numbers.'
  if (
    Number(s.drop) < 0 ||
    Number(s.drop) > 10000 ||
    ['left', 'right', 'front', 'back'].some((k) => Number(s[k]) < 0 || Number(s[k]) > 200) ||
    Number(s.minClearance) < 1 ||
    Number(s.minClearance) > 1000
  )
    return 'Drop must be 0–10000 mm, overhangs 0–200 mm and clear height 1–1000 mm.'
  return null
}
export function slopeMetrics(p: CarcaseParams) {
  const s = p.slopedTop,
    dimension = s?.axis === 'depth' ? p.depth : p.width,
    span = Number.isFinite(dimension) && dimension > 0 ? dimension : 1,
    m = s ? (s.highEnd === 'start' ? -s.drop : s.drop) / span : 0,
    c = 1 / Math.sqrt(1 + m * m),
    angle = (Math.atan(m) * 180) / Math.PI
  const start = p.height - (s?.highEnd === 'end' ? s.drop : 0)
  return {
    span,
    m,
    c,
    angle,
    start,
    end: start + m * span,
    roof: (x: number, y: number) => start + m * (s?.axis === 'depth' ? y : x),
  }
}
export function lowestRoof(p: CarcaseParams, topThickness: number) {
  return p.slopedTop
    ? p.height - p.slopedTop.drop - topThickness / slopeMetrics(p).c
    : p.height - topThickness
}
