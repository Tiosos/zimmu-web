import type { Grain } from './types'

export interface RunWorktopDraft {
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
  version: 1
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
  return null
}
export function runWorktopLinkError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return 'Run worktop link must be an object.'
  const link = value as Record<string, unknown>
  if (link.version !== 1) return 'Unsupported run worktop recipe version.'
  const error = runDraftError(link.draft)
  if (error) return error
  if ((link.draft as RunWorktopDraft).follow !== true)
    return 'A saved run link must follow its cabinets.'
  return null
}
