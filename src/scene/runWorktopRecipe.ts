import type { Grain } from './types'

export interface RunWorktopDraft {
  profile?: 'plinth' | 'splashback'
  height?: string
  heightMode?: 'custom' | 'toe-kick'
  setback?: string
  memberIds: string[]
  label: string
  material: string
  thicknessMode: 'stock' | 'custom'
  thickness: string
  grain: Grain
  left: string
  right: string
  front: string
  rear: string
  bottom: string
  maxGap: string
  follow: boolean
}
export interface RunWorktopLink {
  version: 1 | 2
  draft: RunWorktopDraft & { follow: true }
}
export function runDraftError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Worktop settings must be an object.'
  const d = value as Record<string, unknown>
  if (
    !Array.isArray(d.memberIds) ||
    d.memberIds.length < 2 ||
    d.memberIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(d.memberIds).size !== d.memberIds.length
  )
    return 'Select at least two distinct cabinets.'
  for (const key of ['label', 'material'])
    if (typeof d[key] !== 'string' || !d[key].trim()) return `Complete the worktop ${key}.`
  if (!['stock', 'custom'].includes(d.thicknessMode as string))
    return 'Choose stock or custom thickness.'
  if (!['length', 'width', 'free'].includes(d.grain as string))
    return 'Choose length, width or free grain.'
  if (typeof d.follow !== 'boolean') return 'Choose whether the worktop follows its cabinets.'
  for (const key of ['thickness', 'left', 'right', 'front', 'rear', 'bottom', 'maxGap']) {
    if (typeof d[key] !== 'string' || !d[key].trim() || !Number.isFinite(Number(d[key])))
      return 'Complete every worktop dimension with a finite number.'
    if (key === 'thickness' ? Number(d[key]) <= 0 : Number(d[key]) < 0)
      return 'Thickness must be positive; overhangs, vertical gap and allowed gap must be zero or greater.'
  }
  if (d.profile !== undefined) {
    if (d.profile !== 'plinth' && d.profile !== 'splashback') return 'Choose plinth or splashback.'
    if (d.heightMode !== 'custom' && !(d.profile === 'plinth' && d.heightMode === 'toe-kick'))
      return 'Choose a supported panel height mode.'
    for (const key of ['height', 'setback']) {
      const value = d[key]
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        !Number.isFinite(Number(value)) ||
        (key === 'height' ? Number(value) <= 0 : Number(value) < 0)
      )
        return 'Panel height must be positive and setback/clearance must be finite and non-negative.'
    }
  }
  return null
}
export function runWorktopLinkError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Run worktop link must be an object.'
  const link = value as Record<string, unknown>
  if (link.version !== 1 && link.version !== 2) return 'Unsupported run worktop recipe version.'
  const error = runDraftError(link.draft)
  if (error) return error
  const profile = (link.draft as RunWorktopDraft).profile
  if (
    (link.version === 1 && profile !== undefined) ||
    (link.version === 2 && profile === undefined)
  )
    return 'Run panel profile requires recipe version 2; worktops use version 1.'
  if ((link.draft as RunWorktopDraft).follow !== true)
    return 'A saved run link must follow its cabinets.'
  return null
}
