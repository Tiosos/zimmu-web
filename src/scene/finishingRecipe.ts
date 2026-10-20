import type { Grain } from './types'

export const FINISHING_KINDS = [
  ['worktop', 'Worktop'],
  ['left-end', 'Left end panel'],
  ['right-end', 'Right end panel'],
  ['left-filler', 'Left filler'],
  ['right-filler', 'Right filler'],
  ['plinth', 'Front plinth'],
  ['splashback', 'Rear splashback'],
] as const
export type FinishingKind = (typeof FINISHING_KINDS)[number][0]
export interface FinishingDraft {
  kind: FinishingKind
  label: string
  material: string
  thicknessMode: 'stock' | 'custom'
  thickness: string
  grain: Grain
  left: string
  right: string
  front: string
  rear: string
  height: string
  fillerWidth: string
  bottom: string
  setback: string
  follow?: boolean
  heightMode?: 'custom' | 'cabinet' | 'toe-kick'
  setbackMode?: 'custom' | 'toe-kick'
}
export interface FinishingLink {
  version: 1
  draft: FinishingDraft & {
    follow: true
    heightMode: NonNullable<FinishingDraft['heightMode']>
    setbackMode: NonNullable<FinishingDraft['setbackMode']>
  }
}

/** Structural boundary for saved recipes; geometry/material availability is checked on rebuild. */
export function finishingLinkError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'must be an object'
  const link = value as Record<string, unknown>
  if (link.version !== 1) return 'must use recipe version 1'
  if (!link.draft || typeof link.draft !== 'object' || Array.isArray(link.draft))
    return 'must contain a draft object'
  const d = link.draft as Record<string, unknown>
  if (d.follow !== true) return 'must explicitly follow the cabinet'
  if (!FINISHING_KINDS.some(([kind]) => kind === d.kind)) return 'must name a supported panel kind'
  if (!['length', 'width', 'free'].includes(d.grain as string)) return 'must name a valid grain'
  if (!['stock', 'custom'].includes(d.thicknessMode as string)) return 'must name a thickness mode'
  if (!['custom', 'cabinet', 'toe-kick'].includes(d.heightMode as string))
    return 'must name a height mode'
  if (!['custom', 'toe-kick'].includes(d.setbackMode as string)) return 'must name a setback mode'
  if (
    d.heightMode === 'cabinet' &&
    !['left-end', 'right-end', 'left-filler', 'right-filler'].includes(d.kind as string)
  )
    return 'cabinet height is only available for ends and fillers'
  if ((d.heightMode === 'toe-kick' || d.setbackMode === 'toe-kick') && d.kind !== 'plinth')
    return 'toe-kick modes are only available for plinths'
  for (const key of ['label', 'material'] as const)
    if (typeof d[key] !== 'string' || !d[key].trim()) return `must contain a non-empty ${key}`
  for (const key of [
    'thickness',
    'left',
    'right',
    'front',
    'rear',
    'height',
    'fillerWidth',
    'bottom',
    'setback',
  ]) {
    if (
      typeof d[key] !== 'string' ||
      !d[key].trim() ||
      !Number.isFinite(Number(d[key])) ||
      Number(d[key]) < 0
    )
      return `must contain a finite non-negative ${key}`
    if (['thickness', 'height', 'fillerWidth'].includes(key) && Number(d[key]) <= 0)
      return `must contain a positive ${key}`
  }
  return null
}
