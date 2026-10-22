import type { EdgeDecisions, Grain } from './types'
export interface WallBinding {
  start: { x: number; y: number }
  end: { x: number; y: number }
  datum: number
}
export interface InstallationDraft {
  roomId: string
  wallId: string
  label: string
  memberIds: string[]
  side: 'left' | 'right'
  direction: 'forward' | 'reverse'
  from: 'start' | 'end' | 'centre'
  offset: string
  gap: string
  startReserve: string
  endReserve: string
  rear: string
  elevationMode: 'base' | 'top'
  elevation: string
  datumLevelId: string
  floor: string
  ceiling: string
  detach: boolean
}
export interface InstallationRun {
  version: 1
  id: string
  draft: InstallationDraft
  binding: WallBinding | null
  sourceIssue?: string
}
export interface WallFillerDraft {
  roomId: string
  wallId: string
  cabinetId: string
  label: string
  side: 'left' | 'right'
  minimum: string
  maximum: string
  wallGap: string
  setback: string
  material: string
  thicknessMode: 'stock' | 'custom'
  thickness: string
  grain: Grain
  heightMode: 'cabinet' | 'custom'
  height: string
  bottom: string
  top: string
  edges: EdgeDecisions
}
export interface WallFillerLink {
  version: 1
  draft: WallFillerDraft
  binding: WallBinding | null
  sourceIssue?: string
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
function names(d: Record<string, unknown>, keys: string[]): string | null {
  return keys.some((k) => typeof d[k] !== 'string' || !(d[k] as string).trim())
    ? 'Choose the room, wall, cabinet selection and name.'
    : null
}
function numbers(d: Record<string, unknown>, keys: string[], signed: string[] = []): string | null {
  for (const key of keys) {
    const v = d[key]
    if (
      typeof v !== 'string' ||
      !v.trim() ||
      !Number.isFinite(Number(v)) ||
      Math.abs(Number(v)) > 100000 ||
      (!signed.includes(key) && Number(v) < 0)
    )
      return 'Complete dimensions with finite numbers up to 100000 mm; clearances cannot be negative.'
  }
  return null
}
export function installationDraftError(value: unknown): string | null {
  if (!record(value)) return 'Installation settings must be an object.'
  const d = value
  const name = names(d, ['roomId', 'wallId', 'label'])
  if (name) return name
  if (
    !Array.isArray(d.memberIds) ||
    d.memberIds.length < 1 ||
    d.memberIds.length > 100 ||
    d.memberIds.some((v) => typeof v !== 'string' || !v.trim()) ||
    new Set(d.memberIds).size !== d.memberIds.length
  )
    return 'Select 1–100 distinct cabinets.'
  if (
    !['left', 'right'].includes(d.side as string) ||
    !['forward', 'reverse'].includes(d.direction as string) ||
    !['start', 'end', 'centre'].includes(d.from as string) ||
    !['base', 'top'].includes(d.elevationMode as string)
  )
    return 'Choose supported installation alignment settings.'
  if (
    typeof d.detach !== 'boolean' ||
    typeof d.datumLevelId !== 'string' ||
    typeof d.ceiling !== 'string'
  )
    return 'Complete anchor, datum and ceiling settings.'
  const error = numbers(
    d,
    [
      'offset',
      'gap',
      'startReserve',
      'endReserve',
      'rear',
      'elevation',
      'floor',
      ...(d.ceiling.trim() ? ['ceiling'] : []),
    ],
    ['offset', 'elevation', 'floor', 'ceiling'],
  )
  if (error) return error
  if (d.ceiling.trim() && Number(d.ceiling) <= Number(d.floor))
    return 'Ceiling must be above the stated floor.'
  return null
}
export function wallFillerDraftError(value: unknown): string | null {
  if (!record(value)) return 'Filler settings must be an object.'
  const d = value,
    name = names(d, ['roomId', 'wallId', 'cabinetId', 'label', 'material'])
  if (name) return name
  if (
    !['left', 'right'].includes(d.side as string) ||
    !['stock', 'custom'].includes(d.thicknessMode as string) ||
    !['cabinet', 'custom'].includes(d.heightMode as string) ||
    !['length', 'width', 'free'].includes(d.grain as string)
  )
    return 'Choose supported filler settings.'
  const error = numbers(d, [
    'minimum',
    'maximum',
    'wallGap',
    'setback',
    'thickness',
    'height',
    'bottom',
    'top',
  ])
  if (error) return error
  if (
    Number(d.minimum) <= 0 ||
    Number(d.maximum) < Number(d.minimum) ||
    Number(d.thickness) <= 0 ||
    Number(d.height) <= 0
  )
    return 'Filler minimum, height and thickness must be positive; maximum must cover minimum.'
  if (
    !record(d.edges) ||
    Object.entries(d.edges).some(
      ([k, v]) =>
        !['x0', 'x1', 'y0', 'y1'].includes(k) ||
        (v !== null && (typeof v !== 'string' || !v.trim())),
    )
  )
    return 'Choose valid board-local edge treatments.'
  return null
}
export function wallBindingError(v: unknown): string | null {
  if (v === null) return null
  if (
    !record(v) ||
    !record(v.start) ||
    !record(v.end) ||
    [v.start.x, v.start.y, v.end.x, v.end.y, v.datum].some(
      (n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1000000,
    )
  )
    return 'Cached wall binding must contain finite coordinates and datum.'
  if (Math.hypot(Number(v.end.x) - Number(v.start.x), Number(v.end.y) - Number(v.start.y)) < 0.001)
    return 'Wall must have positive length.'
  return null
}
export function installationRunError(v: unknown): string | null {
  if (!record(v) || v.version !== 1 || typeof v.id !== 'string' || !v.id.trim())
    return 'Invalid installation identity or recipe version.'
  return (
    installationDraftError(v.draft) ||
    wallBindingError(v.binding) ||
    (v.sourceIssue !== undefined && typeof v.sourceIssue !== 'string'
      ? 'Invalid installation source diagnostic.'
      : null)
  )
}
export function installationsError(v: unknown): string | null {
  if (!Array.isArray(v) || v.length > 100) return 'Use at most 100 installation runs.'
  const ids = new Set<string>(),
    members = new Set<string>()
  for (const run of v) {
    const e = installationRunError(run)
    if (e) return e
    const r = run as InstallationRun
    if (ids.has(r.id) || r.draft.memberIds.some((id) => members.has(id)))
      return 'Installation IDs and member ownership must be unique.'
    ids.add(r.id)
    r.draft.memberIds.forEach((id) => members.add(id))
  }
  return null
}
export function wallFillerLinkError(v: unknown): string | null {
  if (!record(v) || v.version !== 1) return 'Unsupported wall filler recipe version.'
  return (
    wallFillerDraftError(v.draft) ||
    wallBindingError(v.binding) ||
    (v.sourceIssue !== undefined && typeof v.sourceIssue !== 'string'
      ? 'Invalid filler source diagnostic.'
      : null)
  )
}
