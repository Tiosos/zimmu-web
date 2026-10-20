import type { CarcaseComponent, ComponentId, Scene, Vec3 } from './types'
import { worldBoundsOf } from './carcaseWorldBounds'
import { resolvePlacement } from './resolvePlacement'
import {
  placementDraft,
  placementSignature,
  previewPlacement,
  type PlacementAlignment,
  type PlacementOverlap,
} from './placementTools'

export type LayoutAxis = 'x' | 'y' | 'z'
export interface LayoutDraft {
  ids: ComponentId[]
  positions: Record<ComponentId, Vec3>
  detach: boolean
}
export type LayoutAction =
  | { kind: 'move'; offset: Record<LayoutAxis, string> }
  | { kind: 'run'; axis: LayoutAxis; gap: string }
  | { kind: 'align'; alignment: PlacementAlignment }
  | { kind: 'distribute'; axis: LayoutAxis }
export interface LayoutPreview {
  signature: string
  draft: LayoutDraft
  scene: Scene | null
  errors: string[]
  overlaps: PlacementOverlap[]
  changed: boolean
}
export function layoutCabinets(scene: Scene, parentId: ComponentId | null): CarcaseComponent[] {
  return scene.components.filter(
    (c): c is CarcaseComponent => c.kind === 'carcase' && c.parentId === parentId,
  )
}
function selected(scene: Scene, ids: ComponentId[]): CarcaseComponent[] {
  if (!ids.length || new Set(ids).size !== ids.length)
    throw Error('Select distinct cabinets before staging a layout.')
  const cabinets = ids.map((id) => {
    const c = scene.components.find((item) => item.id === id)
    if (c?.kind !== 'carcase') throw Error('A selected cabinet is no longer available.')
    return c
  })
  if (cabinets.some((c) => c.parentId !== cabinets[0].parentId))
    throw Error('Selected cabinets must share the same parent frame.')
  return cabinets
}
export function layoutDraft(scene: Scene, ids: ComponentId[]): LayoutDraft {
  const resolved = resolvePlacement(scene)
  return {
    ids: [...ids],
    positions: Object.fromEntries(selected(resolved, ids).map((c) => [c.id, { ...c.position }])),
    detach: false,
  }
}
const copyDraft = (draft: LayoutDraft): LayoutDraft => ({
  ids: [...draft.ids],
  positions: Object.fromEntries(Object.entries(draft.positions).map(([id, p]) => [id, { ...p }])),
  detach: draft.detach,
})
export function previewLayout(scene: Scene, draft: LayoutDraft): LayoutPreview {
  const result: LayoutPreview = {
    signature: placementSignature(scene),
    draft: copyDraft(draft),
    scene: null,
    errors: [],
    overlaps: [],
    changed: false,
  }
  try {
    const cabinets = selected(scene, draft.ids)
    if (cabinets.some((c) => c.anchor) && !draft.detach)
      throw Error('Detach selected anchors before staging a layout.')
    const positions = draft.positions
    for (const c of cabinets) {
      const p = positions[c.id]
      if (!p || ![p.x, p.y, p.z].every(Number.isFinite))
        throw Error('Every selected position must contain finite X, Y and Z values.')
    }
    const ids = new Set(draft.ids)
    const proposed = resolvePlacement({
      ...scene,
      components: scene.components.map((c) =>
        ids.has(c.id) ? { ...c, position: { ...positions[c.id] }, anchor: undefined } : c,
      ),
    })
    // Reuse the placement validator: geometry, finite sibling transforms/bounds and 3D overlaps.
    const first = selected(proposed, draft.ids)[0]
    const assessment = previewPlacement(proposed, first.id, placementDraft(first))
    if (assessment.errors.length) throw Error(assessment.errors.join('; '))
    result.scene = assessment.scene
    result.overlaps = assessment.overlaps
    result.changed = cabinets.some(
      (c) =>
        c.anchor !== undefined ||
        (['x', 'y', 'z'] as const).some((axis) => c.position[axis] !== positions[c.id][axis]),
    )
  } catch (error) {
    result.errors = [error instanceof Error ? error.message : 'Layout could not be resolved.']
  }
  return result
}
export function acceptLayout(scene: Scene, preview: LayoutPreview): Scene | null {
  if (preview.errors.length || !preview.changed || preview.signature !== placementSignature(scene))
    return null
  const checked = previewLayout(scene, preview.draft)
  return checked.errors.length || !checked.changed ? null : checked.scene
}
const number = (raw: string) => {
  const n = raw.trim() ? Number(raw) : NaN
  if (!Number.isFinite(n)) throw Error('Complete every value with a finite number.')
  return n
}
function interval(scene: Scene, c: CarcaseComponent, axis: LayoutAxis): [number, number] {
  const b = worldBoundsOf(c, scene.materials)
  return axis === 'x' ? [b.x0, b.x1] : axis === 'y' ? [b.y0, b.y1] : [b.z0, b.z1]
}
export function sortLayout(scene: Scene, draft: LayoutDraft, axis: LayoutAxis): LayoutDraft {
  const resolved = resolvePlacement(scene)
  const cabinets = selected(resolved, draft.ids)
  const staged = cabinets.map((c) => ({ ...c, position: draft.positions[c.id] }))
  const sorted = staged.map((c) => ({ id: c.id, start: interval(scene, c, axis)[0] }))
  if (sorted.some((c) => !Number.isFinite(c.start)))
    throw Error('The cabinet bounds are not finite.')
  sorted.sort((a, b) => a.start - b.start)
  return { ...copyDraft(draft), ids: sorted.map((c) => c.id) }
}
export function stageLayout(scene: Scene, draft: LayoutDraft, action: LayoutAction): LayoutDraft {
  const checked = previewLayout(scene, draft)
  if (!checked.scene || checked.errors.length) throw Error(checked.errors.join('; '))
  const cabinets = selected(checked.scene, draft.ids)
  if (action.kind !== 'move' && cabinets.length < (action.kind === 'distribute' ? 3 : 2))
    throw Error(
      action.kind === 'distribute'
        ? 'Select at least three cabinets to distribute.'
        : 'Select at least two cabinets to arrange or align.',
    )
  const next = copyDraft(draft)
  const shift = (c: CarcaseComponent, axis: LayoutAxis, delta: number) => {
    const value = c.position[axis] + delta
    if (!Number.isFinite(value)) throw Error('The resulting position must be finite.')
    next.positions[c.id][axis] = value
  }
  if (action.kind === 'move') {
    const offsets = {
      x: number(action.offset.x),
      y: number(action.offset.y),
      z: number(action.offset.z),
    }
    for (const c of cabinets)
      for (const axis of ['x', 'y', 'z'] as const) shift(c, axis, offsets[axis])
  } else if (action.kind === 'align') {
    const a = action.alignment
    const axis =
      a === 'left' || a === 'right' || a === 'centre-x'
        ? 'x'
        : a === 'front' || a === 'back' || a === 'centre-y'
          ? 'y'
          : 'z'
    const metric = (c: CarcaseComponent) => {
      const [lo, hi] = interval(scene, c, axis)
      return a.startsWith('centre') ? (lo + hi) / 2 : ['right', 'back', 'top'].includes(a) ? hi : lo
    }
    const reference = metric(cabinets[0])
    for (const c of cabinets.slice(1)) shift(c, axis, reference - metric(c))
  } else {
    const axis = action.axis
    const boxes = cabinets.map((c) => ({ c, bounds: interval(scene, c, axis) }))
    if (action.kind === 'run') {
      const gap = number(action.gap)
      if (gap < 0) throw Error('Run gap must be zero or greater.')
      let end = boxes[0].bounds[1]
      for (const {
        c,
        bounds: [lo, hi],
      } of boxes.slice(1)) {
        const start = end + gap
        shift(c, axis, start - lo)
        end = start + hi - lo
      }
    } else {
      boxes.sort((a, b) => a.bounds[0] - b.bounds[0])
      const last = boxes.at(-1)!
      const span = last.bounds[1] - boxes[0].bounds[0]
      const occupied = boxes.reduce((sum, b) => sum + b.bounds[1] - b.bounds[0], 0)
      const gap = (span - occupied) / (boxes.length - 1)
      if (!Number.isFinite(gap) || gap < 0)
        throw Error(
          'Not enough span for nonnegative equal gaps. Move the outer cabinets farther apart.',
        )
      let end = boxes[0].bounds[1]
      for (const {
        c,
        bounds: [lo, hi],
      } of boxes.slice(1, -1)) {
        const start = end + gap
        shift(c, axis, start - lo)
        end = start + hi - lo
      }
    }
  }
  const final = previewLayout(scene, next)
  if (final.errors.length) throw Error(final.errors.join('; '))
  return next
}
