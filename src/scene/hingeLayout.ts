export interface HingeLayout {
  version: 1
  countMode: 'auto' | 'manual'
  count: number
  insetMode: 'auto' | 'manual'
  endInset: number
}
export const defaultHingeLayout = (): HingeLayout => ({
  version: 1,
  countMode: 'auto',
  count: 2,
  insetMode: 'auto',
  endInset: 100,
})
export function hingeLayoutError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Hinge layout must be an object.'
  const p = value as Record<string, unknown>
  if (p.version !== 1) return 'Unsupported hinge layout version.'
  if (
    !['auto', 'manual'].includes(p.countMode as string) ||
    !['auto', 'manual'].includes(p.insetMode as string)
  )
    return 'Choose automatic or manual hinge layout.'
  if (typeof p.count !== 'number' || !Number.isSafeInteger(p.count) || p.count < 2 || p.count > 8)
    return 'Manual hinge count must be an integer from 2 to 8.'
  if (typeof p.endInset !== 'number' || !Number.isFinite(p.endInset) || p.endInset <= 0)
    return 'Hinge end inset must be positive and finite.'
  return null
}
export function hingeLayoutRow(
  height: number,
  layout: HingeLayout,
  autoCount: number,
): { first: number; pitch: number; count: number } | null {
  if (hingeLayoutError(layout) || !Number.isFinite(height) || height <= 0) return null
  const count = layout.countMode === 'auto' ? autoCount : layout.count
  const first = layout.insetMode === 'auto' ? Math.min(100, height / 4) : layout.endInset
  const pitch = (height - 2 * first) / (count - 1)
  if (first < 17.5 || height - first < 17.5 || !Number.isFinite(pitch) || pitch < 35) return null
  return { first, pitch, count }
}
