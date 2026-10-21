import type { CarcaseComponent, DrawerComponent, Scene } from './types'
import { defaultHingeLayout, hingeLayoutError, type HingeLayout } from './hingeLayout'
import { cupRow } from './frontMachining'
import { pullTargets, type PullTarget } from './pullLayout'
import { pullPattern } from './pullPattern'
import {
  frontTargets,
  frontsSignature,
  previewFronts,
  stageDrawer,
  type DrawerAction,
  type FrontsDraft,
  type FrontTarget,
} from './frontsDrawers'
import { applyPipeline } from './pipeline'
import { carcaseHardware } from './carcaseHardware'
export type MotionDraft = {
  hinges: Record<string, HingeLayout | null>
  drawers: FrontsDraft['drawers']
}
export interface MotionPreview {
  signature: string
  cabinetId: string
  draft: MotionDraft
  scene: Scene | null
  errors: string[]
  changed: boolean
  hardware: { key: string; before: number; after: number }[]
}
export const emptyMotionDraft = (): MotionDraft => ({ hinges: {}, drawers: {} })
const clone = (d: MotionDraft): MotionDraft => structuredClone(d)
export function motionDoors(scene: Scene, cabinetId: string): PullTarget[] {
  return pullTargets(scene, cabinetId).filter((t) => t.kind === 'door')
}
export function motionDrawers(scene: Scene, cabinetId: string): FrontTarget[] {
  return frontTargets(scene, cabinetId).filter((t) => t.front?.kind === 'drawer-front')
}
export function motionDrawer(
  scene: Scene,
  cabinetId: string,
  target: FrontTarget,
): DrawerComponent | undefined {
  return scene.components.find(
    (c): c is DrawerComponent =>
      c.kind === 'drawer' &&
      c.parentId === cabinetId &&
      c.sectionId === target.sectionId &&
      (c.frameOpeningId ?? c.sectionId) === target.openingId,
  )
}
function cabinetOf(scene: Scene, id: string): CarcaseComponent {
  const c = scene.components.find((c) => c.id === id)
  if (c?.kind !== 'carcase') throw Error('The cabinet is no longer available.')
  return c
}
export function stageHinges(
  scene: Scene,
  cabinetId: string,
  draft: MotionDraft,
  ids: string[],
  layout: HingeLayout | null,
): MotionDraft {
  const c = cabinetOf(scene, cabinetId)
  if (c.params.frame !== undefined)
    throw Error(
      'Custom hinge positioning is available only for frameless cabinets; face-frame applications retain their modeled layout.',
    )
  if (!ids.length || new Set(ids).size !== ids.length)
    throw Error('Select distinct door leaves first.')
  if (layout) {
    const error = hingeLayoutError(layout)
    if (error) throw Error(error)
  }
  const targets = motionDoors(scene, cabinetId),
    next = clone(draft)
  for (const id of ids) {
    const target = targets.find((t) => t.id === id)
    if (!target || target.locked) throw Error('A selected door is unavailable or detached.')
    next.hinges[id] = layout ? { ...layout } : null
  }
  return next
}
export function stageMotionDrawer(
  scene: Scene,
  cabinetId: string,
  draft: MotionDraft,
  ids: string[],
  action: DrawerAction,
): MotionDraft {
  const staged = stageDrawer(scene, cabinetId, { fronts: {}, drawers: draft.drawers }, ids, action)
  return { ...clone(draft), drawers: staged.drawers }
}
const qty = (s: Scene, id: string) => {
  const m = new Map<string, number>()
  for (const line of carcaseHardware(s))
    if (line.componentId === id) m.set(line.key, (m.get(line.key) ?? 0) + line.qty)
  return m
}
export function motionDoorIssues(scene: Scene, cabinetId: string, target: PullTarget): string[] {
  const c = cabinetOf(scene, cabinetId)
  if (c.params.frame !== undefined)
    return [
      'Face-frame hinge layout uses its existing modeled application; custom positioning is read-only.',
    ]
  const layout = target.part.hingeLayout
  if (layout) {
    const e = hingeLayoutError(layout)
    if (e) return [e]
  }
  const cup = cupRow(
    target.part,
    target.hinge!,
    target.part.role!,
    undefined,
    layout ?? defaultHingeLayout(),
  )
  if (!cup)
    return ['The hinge cups do not fit the door dimensions, spacing or remaining face thickness.']
  const pull = target.part.frontPull
  if (pull) {
    const r = pullPattern(
      { ...target.part, cuts: [...target.part.cuts.filter((c) => !c.id.startsWith('cups_')), cup] },
      pull,
      target.hinge,
      target.part.role!,
    )
    if (r.errors.length) return r.errors
  }
  return []
}
export function previewMotion(scene: Scene, cabinetId: string, draft: MotionDraft): MotionPreview {
  const result: MotionPreview = {
    signature: frontsSignature(scene),
    cabinetId,
    draft: clone(draft),
    scene: null,
    errors: [],
    changed: false,
    hardware: [],
  }
  try {
    cabinetOf(scene, cabinetId)
    let staged = emptyMotionDraft()
    for (const [id, layout] of Object.entries(draft.hinges))
      staged = stageHinges(scene, cabinetId, staged, [id], layout)
    const front = previewFronts(scene, cabinetId, { fronts: {}, drawers: draft.drawers })
    if (front.errors.length || !front.scene)
      throw Error(front.errors.join('; ') || 'Drawer settings could not be applied.')
    let proposed: Scene = {
      ...front.scene,
      parts: front.scene.parts.map((p) =>
        p.kind === 'board' && Object.hasOwn(staged.hinges, p.id)
          ? { ...p, hingeLayout: staged.hinges[p.id] ?? undefined }
          : p,
      ),
    }
    proposed = applyPipeline(proposed)
    for (const target of motionDoors(proposed, cabinetId))
      if (Object.hasOwn(draft.hinges, target.id)) {
        const errors = motionDoorIssues(proposed, cabinetId, target)
        if (errors.length) throw Error(`${target.label}: ${errors.join('; ')}`)
        const cups = target.part.cuts.find(
          (c) => c.kind === 'hole-array' && c.id === `cups_${target.part.role}`,
        )
        if (!cups) throw Error('The selected door did not emit a valid hinge cup row.')
      }
    const sameHinges = Object.keys(draft.hinges).every((id) => {
      const before = scene.parts.find((p) => p.id === id),
        after = proposed.parts.find((p) => p.id === id)
      const key = (p: typeof before) =>
        p?.kind === 'board' ? JSON.stringify(p.hingeLayout ?? null) : ''
      return key(before) === key(after)
    })
    result.changed = front.changed || !sameHinges
    result.scene = proposed
    const before = qty(scene, cabinetId),
      after = qty(proposed, cabinetId)
    result.hardware = [...new Set([...before.keys(), ...after.keys()])]
      .sort()
      .map((key) => ({ key, before: before.get(key) ?? 0, after: after.get(key) ?? 0 }))
      .filter((r) => r.before !== r.after)
  } catch (cause) {
    result.errors = [cause instanceof Error ? cause.message : 'Hardware could not be built.']
  }
  return result
}
export function acceptMotion(scene: Scene, p: MotionPreview): Scene | null {
  if (p.signature !== frontsSignature(scene) || p.errors.length || !p.scene || !p.changed)
    return null
  const checked = previewMotion(scene, p.cabinetId, p.draft)
  return checked.errors.length || !checked.scene || !checked.changed ? null : checked.scene
}
export { defaultHingeLayout }
