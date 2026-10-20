import { worldBoundsOf } from './carcaseWorldBounds'
import { resolvePlacement } from './resolvePlacement'
import { openingGeometry } from './openingLayouts'
import type { Bounds3 } from './carcaseBounds'
import type { CarcaseComponent, ComponentId, Scene } from './types'

export const PLACEMENT_ALIGNMENTS = [
  ['left', 'Align left'],
  ['right', 'Align right'],
  ['front', 'Align front'],
  ['back', 'Align back'],
  ['bottom', 'Align bottom'],
  ['top', 'Align top'],
  ['centre-x', 'Centre width'],
  ['centre-y', 'Centre depth'],
  ['centre-z', 'Centre height'],
] as const
export type PlacementAlignment = (typeof PLACEMENT_ALIGNMENTS)[number][0]
export interface PlacementDraft {
  x: string
  y: string
  z: string
  rx: string
  ry: string
  rz: string
  detach: boolean
}
export function placementDraft(c: CarcaseComponent): PlacementDraft {
  return {
    x: String(c.position.x),
    y: String(c.position.y),
    z: String(c.position.z),
    rx: String(c.rotation.x),
    ry: String(c.rotation.y),
    rz: String(c.rotation.z),
    detach: false,
  }
}
export function placementSignature(scene: Scene): string {
  return JSON.stringify({
    materials: scene.materials,
    components: scene.components
      .filter((c) => c.kind === 'carcase' || c.kind === 'group')
      .map((c) =>
        c.kind === 'carcase'
          ? {
              id: c.id,
              parentId: c.parentId,
              label: c.label,
              position: c.position,
              rotation: c.rotation,
              params: c.params,
              anchor: c.anchor,
            }
          : { id: c.id, parentId: c.parentId, position: c.position, rotation: c.rotation },
      )
      .sort((a, b) => a.id.localeCompare(b.id)),
  })
}
function cabinetOf(scene: Scene, id: ComponentId): CarcaseComponent {
  const cabinet = scene.components.find((c) => c.id === id)
  if (cabinet?.kind !== 'carcase') throw Error('The selected cabinet is no longer available.')
  return cabinet
}
export function placementTargets(scene: Scene, id: ComponentId): CarcaseComponent[] {
  const own = cabinetOf(scene, id)
  const depends = (c: CarcaseComponent) => {
    const seen = new Set<string>()
    let current: CarcaseComponent | undefined = c
    while (current?.anchor && !seen.has(current.id)) {
      seen.add(current.id)
      if (current.anchor.to === id) return true
      const next = scene.components.find((n) => n.id === current!.anchor!.to)
      current = next?.kind === 'carcase' ? next : undefined
    }
    return false
  }
  return scene.components.filter(
    (c): c is CarcaseComponent =>
      c.kind === 'carcase' && c.id !== id && c.parentId === own.parentId && !depends(c),
  )
}
function candidate(c: CarcaseComponent, draft: PlacementDraft): CarcaseComponent {
  const fields = ['x', 'y', 'z', 'rx', 'ry', 'rz'] as const
  const values = Object.fromEntries(
    fields.map((key) => [key, draft[key].trim() ? Number(draft[key]) : NaN]),
  )
  if (fields.some((key) => !Number.isFinite(values[key])))
    throw Error('Positions and rotations must be finite numbers; complete every field.')
  if (c.anchor && !draft.detach)
    throw Error('Detach the existing anchor before staging free placement.')
  return {
    ...c,
    position: { x: values.x, y: values.y, z: values.z },
    rotation: { x: values.rx, y: values.ry, z: values.rz },
    anchor: undefined,
  }
}
export function turnPlacement(draft: PlacementDraft, direction: -1 | 1): PlacementDraft {
  const angle = draft.rz.trim() ? Number(draft.rz) : NaN
  if (!Number.isFinite(angle)) throw Error('Complete the rotation before turning the cabinet.')
  return { ...draft, rz: String((((angle + direction * 90) % 360) + 360) % 360) }
}
const interval = (b: Bounds3, axis: 'x' | 'y' | 'z') =>
  axis === 'x' ? [b.x0, b.x1] : axis === 'y' ? [b.y0, b.y1] : [b.z0, b.z1]
export function alignPlacement(
  scene: Scene,
  id: ComponentId,
  draft: PlacementDraft,
  targetId: ComponentId,
  action: PlacementAlignment,
): PlacementDraft {
  if (!placementTargets(scene, id).some((c) => c.id === targetId))
    throw Error('Choose another independent cabinet in the same parent frame.')
  const resolved = resolvePlacement(scene)
  const own = candidate(cabinetOf(resolved, id), draft)
  const target = cabinetOf(resolved, targetId)
  const a = worldBoundsOf(own, scene.materials),
    b = worldBoundsOf(target, scene.materials)
  const axis =
    action === 'left' || action === 'right' || action === 'centre-x'
      ? 'x'
      : action === 'front' || action === 'back' || action === 'centre-y'
        ? 'y'
        : 'z'
  const [a0, a1] = interval(a, axis),
    [b0, b1] = interval(b, axis)
  const delta = action.startsWith('centre')
    ? (b0 + b1 - a0 - a1) / 2
    : ['right', 'back', 'top'].includes(action)
      ? b1 - a1
      : b0 - a0
  const value = own.position[axis] + delta
  if (!Number.isFinite(value)) throw Error('The cabinet bounds cannot be aligned.')
  return { ...draft, [axis]: String(value) }
}
export interface PlacementOverlap {
  a: string
  b: string
  x: number
  y: number
  z: number
}
export interface PlacementPreview {
  signature: string
  id: ComponentId
  draft: PlacementDraft
  scene: Scene | null
  errors: string[]
  overlaps: PlacementOverlap[]
  changed: boolean
}
export function previewPlacement(
  scene: Scene,
  id: ComponentId,
  draft: PlacementDraft,
): PlacementPreview {
  const result: PlacementPreview = {
    signature: placementSignature(scene),
    id,
    draft: { ...draft },
    scene: null,
    errors: [],
    overlaps: [],
    changed: false,
  }
  try {
    const own = cabinetOf(scene, id),
      next = candidate(own, draft)
    const siblings = scene.components.filter(
      (c): c is CarcaseComponent => c.kind === 'carcase' && c.parentId === own.parentId,
    )
    for (const cabinet of siblings) {
      const errors = openingGeometry(cabinet.params, scene.materials, [], cabinet.id).errors
      if (errors.length) throw Error(`${cabinet.label}: ${errors.join('; ')}`)
      if (
        ![
          cabinet.position.x,
          cabinet.position.y,
          cabinet.position.z,
          cabinet.rotation.x,
          cabinet.rotation.y,
          cabinet.rotation.z,
        ].every(Number.isFinite)
      )
        throw Error(`${cabinet.label}: placement values must be finite.`)
    }
    const proposed = resolvePlacement({
      ...scene,
      components: scene.components.map((c) => (c.id === id ? next : c)),
    })
    const boxes = siblings.map((c) => {
      const resolved = cabinetOf(proposed, c.id)
      const bounds = worldBoundsOf(resolved, scene.materials)
      if (!Object.values(bounds).every(Number.isFinite))
        throw Error('The cabinet bounds are not finite.')
      return { c: resolved, bounds }
    })
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j]
        const x = Math.min(a.bounds.x1, b.bounds.x1) - Math.max(a.bounds.x0, b.bounds.x0)
        const y = Math.min(a.bounds.y1, b.bounds.y1) - Math.max(a.bounds.y0, b.bounds.y0)
        const z = Math.min(a.bounds.z1, b.bounds.z1) - Math.max(a.bounds.z0, b.bounds.z0)
        if (x > 1e-6 && y > 1e-6 && z > 1e-6)
          result.overlaps.push({ a: a.c.label, b: b.c.label, x, y, z })
      }
    result.scene = proposed
    result.changed =
      JSON.stringify({ position: own.position, rotation: own.rotation, anchor: own.anchor }) !==
      JSON.stringify({ position: next.position, rotation: next.rotation, anchor: next.anchor })
  } catch (error) {
    result.errors = [error instanceof Error ? error.message : 'Placement could not be resolved.']
  }
  return result
}
export function acceptPlacement(scene: Scene, preview: PlacementPreview): Scene | null {
  if (preview.errors.length || !preview.changed || placementSignature(scene) !== preview.signature)
    return null
  const checked = previewPlacement(scene, preview.id, preview.draft)
  return checked.errors.length || !checked.changed ? null : checked.scene
}
