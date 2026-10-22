export interface GrainMatchDraft {
  label: string
  memberIds: string[]
  referenceId: string
  direction: 'vertical' | 'horizontal'
  origin: 'blank' | 'reference'
  offsetX: number
  offsetY: number
  margin: number
  gap: number
}
export interface GrainMatchGroup {
  version: 1
  id: string
  draft: GrainMatchDraft
}
export interface GrainMatchBinding {
  version: 1
  groupId: string
  label: string
  memberCount: number
  sequence: number
  direction: GrainMatchDraft['direction']
  x: number
  y: number
  width: number
  height: number
  blankWidth: number
  blankHeight: number
  patternX: number
  patternY: number
  problem?: string
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const name = (v: unknown) => typeof v === 'string' && !!v.trim() && v.length <= 200
export function grainMatchDraftError(v: unknown): string | null {
  if (!record(v)) return 'Grain matching settings must be an object.'
  if (!name(v.label) || !name(v.referenceId))
    return 'Enter a group name and choose a reference front.'
  if (
    !Array.isArray(v.memberIds) ||
    v.memberIds.length < 2 ||
    v.memberIds.length > 100 ||
    v.memberIds.some((id) => !name(id)) ||
    new Set(v.memberIds).size !== v.memberIds.length
  )
    return 'Select 2–100 distinct fronts.'
  if (!v.memberIds.includes(v.referenceId)) return 'The reference front must belong to the group.'
  if (
    !['vertical', 'horizontal'].includes(v.direction as string) ||
    !['blank', 'reference'].includes(v.origin as string)
  )
    return 'Choose supported grain direction and pattern origin.'
  if (
    !['offsetX', 'offsetY', 'margin', 'gap'].every(
      (k) =>
        typeof v[k] === 'number' && Number.isFinite(v[k]) && Math.abs(v[k] as number) <= 100000,
    )
  )
    return 'Complete dimensions with finite numbers up to 100000 mm.'
  if (
    (v.margin as number) < 0 ||
    (v.margin as number) > 1000 ||
    (v.gap as number) < 0 ||
    (v.gap as number) > 100
  )
    return 'Margin must be 0–1000 mm and additional cutting gap 0–100 mm.'
  return null
}
export function grainMatchesError(v: unknown): string | null {
  if (!Array.isArray(v) || v.length > 50) return 'Use at most 50 grain matching groups.'
  const ids = new Set<string>(),
    members = new Set<string>()
  for (const g of v) {
    if (!record(g) || g.version !== 1 || !name(g.id))
      return 'Invalid grain group identity or version.'
    const e = grainMatchDraftError(g.draft)
    if (e) return e
    const group = g as unknown as GrainMatchGroup
    if (ids.has(group.id) || group.draft.memberIds.some((id) => members.has(id)))
      return 'Grain group identities and front membership must be unique.'
    ids.add(group.id)
    group.draft.memberIds.forEach((id) => members.add(id))
  }
  return null
}
export function grainMatchBindingError(v: unknown): string | null {
  if (!record(v) || v.version !== 1 || !name(v.groupId) || !name(v.label))
    return 'Invalid grain binding identity or version.'
  if (
    !Number.isInteger(v.memberCount) ||
    Number(v.memberCount) < 2 ||
    Number(v.memberCount) > 100 ||
    !Number.isInteger(v.sequence) ||
    Number(v.sequence) < 1 ||
    Number(v.sequence) > Number(v.memberCount)
  )
    return 'Invalid grain member count or sequence.'
  if (!['vertical', 'horizontal'].includes(v.direction as string))
    return 'Invalid grain binding direction.'
  if (v.problem !== undefined && !name(v.problem)) return 'Invalid grain binding diagnostic.'
  if (
    !['x', 'y', 'width', 'height', 'blankWidth', 'blankHeight', 'patternX', 'patternY'].every(
      (k) =>
        typeof v[k] === 'number' && Number.isFinite(v[k]) && Math.abs(v[k] as number) <= 1000000,
    )
  )
    return 'Grain binding coordinates must be finite and bounded.'
  if (['x', 'y', 'width', 'height', 'blankWidth', 'blankHeight'].some((k) => Number(v[k]) < 0))
    return 'Grain binding dimensions cannot be negative.'
  if (
    !v.problem &&
    (['width', 'height', 'blankWidth', 'blankHeight'].some((k) => Number(v[k]) <= 0) ||
      Number(v.x) + Number(v.width) > Number(v.blankWidth) + 0.00001 ||
      Number(v.y) + Number(v.height) > Number(v.blankHeight) + 0.00001)
  )
    return 'Matched cut rectangles must fit a positive blank.'
  return null
}
