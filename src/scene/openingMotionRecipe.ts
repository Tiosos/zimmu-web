export interface OpeningSetting {
  frontId: string
  kind: 'door' | 'drawer-front'
  limit: number
  axisOffset: number
}
export interface OpeningMotion {
  version: 1
  clearance: number
  pullProjection: number
  entries: OpeningSetting[]
}
export const defaultOpeningMotion = (): OpeningMotion => ({
  version: 1,
  clearance: 2,
  pullProjection: 30,
  entries: [],
})
export function openingMotionError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Opening motion must be an object.'
  const v = value as OpeningMotion
  if (v.version !== 1) return 'Unsupported opening motion version.'
  if (![v.clearance, v.pullProjection].every((n) => typeof n === 'number' && n >= 0 && n <= 100))
    return 'Clearance and handle projection must be finite numbers from 0 to 100 mm.'
  if (!Array.isArray(v.entries) || v.entries.length > 200)
    return 'Use at most 200 opening settings.'
  const ids = new Set<string>()
  for (const entry of v.entries) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.frontId !== 'string' ||
      !entry.frontId.trim() ||
      ids.has(entry.frontId)
    )
      return 'Opening front identities must be distinct nonempty strings.'
    ids.add(entry.frontId)
    if (entry.kind !== 'door' && entry.kind !== 'drawer-front')
      return 'Choose a supported opening kind.'
    if (
      typeof entry.limit !== 'number' ||
      !Number.isFinite(entry.limit) ||
      entry.limit <= 0 ||
      entry.limit > (entry.kind === 'door' ? 180 : 3000)
    )
      return 'Opening angle must be within 0–180 degrees; travel within 0–3000 mm, excluding zero.'
    if (
      typeof entry.axisOffset !== 'number' ||
      !Number.isFinite(entry.axisOffset) ||
      Math.abs(entry.axisOffset) > 100 ||
      (entry.kind === 'drawer-front' && entry.axisOffset !== 0)
    )
      return 'Hinge offset must be within −100–100 mm and zero for drawers.'
  }
  return null
}
