import { frontTargets, frontsSignature } from './frontsDrawers'
import { frontCells, frontRoleOf } from './frontCells'
import { resolveCarcase } from './carcaseOpenings'
import { frontGeometryOf } from './carcaseLayout'
import { applyPipeline } from './pipeline'
import { carcaseHardware } from './carcaseHardware'
import { defaultPull, pullPattern, pullSpecError, type PullSpec } from './pullPattern'
import type { BoardPart, CarcaseComponent, Scene } from './types'

export interface PullTarget {
  id: string
  label: string
  kind: 'door' | 'drawer-front'
  leaf: number
  hinge: 'left' | 'right' | undefined
  part: BoardPart
  locked: boolean
}
export type PullDraft = Record<string, PullSpec | null>
export interface PullPreview {
  signature: string
  cabinetId: string
  draft: PullDraft
  scene: Scene | null
  changed: boolean
  errors: string[]
  hardware: { key: string; before: number; after: number }[]
}
export function pullTargets(scene: Scene, cabinetId: string): PullTarget[] {
  const openings = frontTargets(scene, cabinetId)
  const cabinet = scene.components.find(
    (c): c is CarcaseComponent => c.id === cabinetId && c.kind === 'carcase',
  )!
  const resolved = resolveCarcase(cabinet, scene.parts, scene.materials)!
  const cells = frontCells(
    cabinet.params.section,
    resolved.tree,
    frontGeometryOf(cabinet.params, resolved.tree),
  )
  return cells.flatMap((cell): PullTarget[] => {
    if (cell.spec.kind !== 'door' && cell.spec.kind !== 'drawer-front') return []
    const part = scene.parts.find(
      (p): p is BoardPart =>
        p.kind === 'board' && p.parentId === cabinetId && p.role === frontRoleOf(cell),
    )
    if (!part) return []
    const opening = openings.find(
      (o) => o.sectionId === cell.sectionId && o.openingId === cell.openingId,
    )
    return [
      {
        id: part.id,
        label: part.label,
        kind: cell.spec.kind,
        leaf: cell.leaf,
        hinge: cell.hinge,
        part,
        locked: !part.driven || !!opening?.locked,
      },
    ]
  })
}
const copyDraft = (draft: PullDraft): PullDraft =>
  Object.fromEntries(
    Object.entries(draft).map(([id, setting]) => [id, setting ? { ...setting } : null]),
  )
function samePull(a: PullSpec | undefined, b: PullSpec | null): boolean {
  if (!a || !b) return !a && !b
  return (Object.keys(defaultPull()) as (keyof PullSpec)[]).every((key) => a[key] === b[key])
}
function selected(scene: Scene, cabinetId: string, ids: string[]): PullTarget[] {
  if (!ids.length || new Set(ids).size !== ids.length) throw Error('Select distinct fronts first.')
  const targets = pullTargets(scene, cabinetId)
  return ids.map((id) => {
    const target = targets.find((t) => t.id === id)
    if (!target) throw Error('A selected front is no longer available.')
    if (target.locked) throw Error('Detached front or drawer parts lock this front.')
    return target
  })
}
export function stagePull(
  scene: Scene,
  cabinetId: string,
  draft: PullDraft,
  ids: string[],
  setting: PullSpec | null,
): PullDraft {
  const targets = selected(scene, cabinetId, ids)
  if (setting !== null) {
    const error = pullSpecError(setting)
    if (error) throw Error(error)
  }
  const next = copyDraft(draft)
  for (const target of targets) next[target.id] = setting ? { ...setting } : null
  return next
}
export function pullIssues(target: PullTarget): string[] {
  return target.part.frontPull
    ? pullPattern(target.part, target.part.frontPull, target.hinge, target.part.role!).errors
    : []
}
export function previewPulls(scene: Scene, cabinetId: string, draft: PullDraft): PullPreview {
  const result: PullPreview = {
    signature: frontsSignature(scene),
    cabinetId,
    draft: copyDraft(draft),
    scene: null,
    changed: false,
    errors: [],
    hardware: [],
  }
  try {
    const ids = Object.keys(draft)
    if (!ids.length) {
      pullTargets(scene, cabinetId)
      result.scene = scene
      return result
    }
    const targets = selected(scene, cabinetId, ids)
    const proposed = applyPipeline({
      ...scene,
      parts: scene.parts.map((p) =>
        Object.hasOwn(draft, p.id) && p.kind === 'board'
          ? { ...p, frontPull: draft[p.id] ?? undefined }
          : p,
      ),
    })
    const after = pullTargets(proposed, cabinetId)
    for (const target of targets) {
      const current = after.find((t) => t.id === target.id)
      if (!current) throw Error('The proposed front is unavailable.')
      const errors = pullIssues(current)
      if (errors.length) throw Error(`${target.label}: ${errors.join('; ')}`)
    }
    result.changed = targets.some((t) => !samePull(t.part.frontPull, draft[t.id]))
    const hardware = (s: Scene) =>
      new Map(
        carcaseHardware(s)
          .filter((h) => h.componentId === cabinetId)
          .map((h) => [h.key, h.qty]),
      )
    const before = hardware(scene),
      next = hardware(proposed)
    result.hardware = [...new Set([...before.keys(), ...next.keys()])]
      .filter((key) => before.get(key) !== next.get(key))
      .map((key) => ({ key, before: before.get(key) ?? 0, after: next.get(key) ?? 0 }))
    result.scene = proposed
  } catch (cause) {
    result.errors = [cause instanceof Error ? cause.message : 'Pull settings could not be built.']
  }
  return result
}
export function acceptPulls(scene: Scene, preview: PullPreview): Scene | null {
  if (preview.errors.length || !preview.changed || preview.signature !== frontsSignature(scene))
    return null
  const checked = previewPulls(scene, preview.cabinetId, preview.draft)
  return checked.errors.length || !checked.changed ? null : checked.scene
}
