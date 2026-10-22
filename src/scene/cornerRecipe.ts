import { runDraftError, type RunWorktopDraft } from './runWorktopRecipe'
import type { EdgeDecisions } from './types'
export interface CornerLeg {
  run: RunWorktopDraft
  edges: EdgeDecisions
  endReturn: boolean
}
export interface CornerDraft {
  label: string
  through: 0 | 1
  gap: string
  legs: [CornerLeg, CornerLeg]
}
export interface CornerLink {
  version: 1
  assemblyId: string
  slot: 0 | 1 | 2 | 3
  draft: CornerDraft
}
export function cornerDraftError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Complete the corner assembly settings.'
  const d = value as CornerDraft
  if (typeof d.label !== 'string' || !d.label.trim()) return 'Name the corner assembly.'
  if (d.through !== 0 && d.through !== 1) return 'Choose the through leg.'
  if (
    typeof d.gap !== 'string' ||
    !d.gap.trim() ||
    !Number.isFinite(Number(d.gap)) ||
    Number(d.gap) < 0 ||
    Number(d.gap) > 1000
  )
    return 'Joint clearance must be finite, between 0 and 1000 mm.'
  if (!Array.isArray(d.legs) || d.legs.length !== 2) return 'Choose two corner legs.'
  for (const leg of d.legs) {
    if (!leg || typeof leg !== 'object') return 'Complete both corner legs.'
    const error = runDraftError(leg.run, 1)
    if (error) return error
    if (leg.run.memberIds.length > 100 || !leg.run.follow)
      return 'Each corner leg must follow 1–100 cabinets.'
    for (const key of [
      'thickness',
      'left',
      'right',
      'front',
      'rear',
      'bottom',
      'maxGap',
      'height',
      'setback',
    ] as const)
      if (leg.run[key] !== undefined && Math.abs(Number(leg.run[key])) > 100000)
        return 'Corner dimensions must not exceed 100000 mm.'
    if (typeof leg.endReturn !== 'boolean' || (leg.endReturn && !leg.run.profile))
      return 'End returns require a vertical panel profile.'
    if (
      !leg.edges ||
      typeof leg.edges !== 'object' ||
      Array.isArray(leg.edges) ||
      Object.entries(leg.edges).some(
        ([key, v]) =>
          !['x0', 'x1', 'y0', 'y1'].includes(key) ||
          (v !== null && (typeof v !== 'string' || !v.trim())),
      )
    )
      return 'Choose valid local edge treatments.'
  }
  if (d.legs[0].run.profile !== d.legs[1].run.profile) return 'Both legs must use the same profile.'
  const ids = d.legs.flatMap((l) => l.run.memberIds)
  if (new Set(ids).size !== ids.length) return 'A cabinet can belong to only one corner leg.'
  return null
}
export function cornerLinkError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Corner link must be an object.'
  const l = value as CornerLink
  if (
    l.version !== 1 ||
    typeof l.assemblyId !== 'string' ||
    !l.assemblyId.trim() ||
    ![0, 1, 2, 3].includes(l.slot)
  )
    return 'Invalid corner link identity or version.'
  const error = cornerDraftError(l.draft)
  if (error) return error
  if (l.slot > 1 && !l.draft.legs[l.slot - 2].endReturn) return 'Unexpected corner return slot.'
  return null
}
