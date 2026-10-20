import type { BoardPart, CarcaseComponent, Grain, Scene, ThicknessAxis } from './types'
import { carcaseBounds } from './carcaseBounds'
import { orientedPanel, type LocalBox } from './carcaseLayout'
import { roleThicknessFor } from './resolveThickness'
import { openingGeometry } from './openingLayouts'
import { placementSignature } from './placementTools'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'

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
}
export interface FinishingPreview {
  signature: string
  cabinetId: string
  draft: FinishingDraft
  part: BoardPart | null
  bounds: LocalBox | null
  errors: string[]
}
export function finishingSignature(scene: Scene): string {
  return JSON.stringify({
    placement: placementSignature(scene),
    transforms: scene.components.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      position: c.position,
      rotation: c.rotation,
    })),
    parts: scene.parts.map((p) => ({
      id: p.id,
      kind: p.kind,
      label: p.label,
      parentId: p.parentId,
      visible: p.visible,
      position: p.position,
      rotation: p.rotation,
      length: p.length,
      dimensions: p.kind === 'board' ? [p.width, p.thickness] : [p.diameter],
      material: p.material,
      grain: p.kind === 'board' ? p.grain : undefined,
      cuts: p.cuts,
      operations: p.kind === 'board' ? p.operations : undefined,
      edges: p.kind === 'board' ? p.edgeBanding : undefined,
      overrides: p.kind === 'board' ? p.overrides : undefined,
    })),
  })
}
function cabinetOf(scene: Scene, id: string): CarcaseComponent {
  const c = scene.components.find((item) => item.id === id)
  if (c?.kind !== 'carcase') throw Error('The source cabinet is no longer available.')
  return c
}
export function finishingMaterials(scene: Scene): string[] {
  return Object.entries(scene.materials)
    .filter(([, m]) => m.use !== 'edge' && Number.isFinite(m.thickness) && m.thickness! > 0)
    .map(([name]) => name)
}
export function finishingDraft(
  scene: Scene,
  cabinetId: string,
  kind: FinishingKind = 'worktop',
): FinishingDraft {
  const c = cabinetOf(scene, cabinetId)
  const material = finishingMaterials(scene).includes(c.params.carcaseMaterial)
    ? c.params.carcaseMaterial
    : (finishingMaterials(scene)[0] ?? '')
  return {
    kind,
    label: FINISHING_KINDS.find(([id]) => id === kind)?.[1] ?? '',
    material,
    thicknessMode: 'stock',
    thickness: String(scene.materials[material]?.thickness ?? 18),
    grain: 'length',
    left: '0',
    right: '0',
    front: kind === 'worktop' ? '20' : '0',
    rear: '0',
    height: String(
      kind === 'splashback'
        ? 100
        : kind === 'plinth'
          ? c.params.toeKickHeight || 100
          : c.params.height,
    ),
    fillerWidth: '50',
    bottom: '0',
    setback: kind === 'plinth' ? String(c.params.toeKickSetback ?? 0) : '0',
  }
}
const numeric = (raw: string): number => {
  const value = raw.trim() ? Number(raw) : NaN
  if (!Number.isFinite(value)) throw Error('Complete every dimension with a finite number.')
  return value
}
export function previewFinishing(
  scene: Scene,
  cabinetId: string,
  draft: FinishingDraft,
): FinishingPreview {
  const result: FinishingPreview = {
    signature: finishingSignature(scene),
    cabinetId,
    draft: { ...draft },
    part: null,
    bounds: null,
    errors: [],
  }
  try {
    const c = cabinetOf(scene, cabinetId)
    if (!FINISHING_KINDS.some(([kind]) => kind === draft.kind))
      throw Error('Choose a supported finishing panel.')
    if (!draft.label.trim()) throw Error('Name the finishing board before previewing.')
    if (!finishingMaterials(scene).includes(draft.material))
      throw Error('Choose an existing panel material with a positive stock thickness.')
    if (!['length', 'width', 'free'].includes(draft.grain))
      throw Error('Choose length, width or free grain.')
    if (!['stock', 'custom'].includes(draft.thicknessMode))
      throw Error('Choose stock or custom thickness.')
    const errors = openingGeometry(c.params, scene.materials, scene.parts, c.id).errors
    if (errors.length) throw Error(errors.join('; '))
    const t =
      draft.thicknessMode === 'stock'
        ? scene.materials[draft.material].thickness!
        : numeric(draft.thickness)
    const height = numeric(draft.height),
      width = numeric(draft.fillerWidth)
    const left = numeric(draft.left),
      right = numeric(draft.right),
      front = numeric(draft.front),
      rear = numeric(draft.rear),
      bottom = numeric(draft.bottom),
      setback = numeric(draft.setback)
    if (t <= 0 || height <= 0 || width <= 0)
      throw Error('Thickness, height and filler width must be greater than zero.')
    if ([left, right, front, rear, bottom, setback].some((n) => n < 0))
      throw Error('Overhangs, clearance and setback must be zero or greater.')
    const b = carcaseBounds(c.params, roleThicknessFor(c.params, scene.materials, new Map()))
    let bounds: LocalBox, axis: ThicknessAxis
    if (draft.kind === 'worktop') {
      bounds = {
        x0: b.x0 - left,
        x1: b.x1 + right,
        y0: b.y0 - front,
        y1: b.y1 + rear,
        z0: b.z1 + bottom,
        z1: b.z1 + bottom + t,
      }
      axis = 'z'
    } else if (draft.kind === 'left-end' || draft.kind === 'right-end') {
      const x = draft.kind === 'left-end' ? b.x0 - t : b.x1
      bounds = {
        x0: x,
        x1: x + t,
        y0: b.y0,
        y1: b.y1,
        z0: b.z0 + bottom,
        z1: b.z0 + bottom + height,
      }
      axis = 'x'
    } else if (draft.kind === 'left-filler' || draft.kind === 'right-filler') {
      const x = draft.kind === 'left-filler' ? b.x0 - width : b.x1
      bounds = {
        x0: x,
        x1: x + width,
        y0: b.y0,
        y1: b.y0 + t,
        z0: b.z0 + bottom,
        z1: b.z0 + bottom + height,
      }
      axis = 'y'
    } else if (draft.kind === 'plinth') {
      if (b.y0 + setback + t > b.y1)
        throw Error('Plinth setback and thickness exceed the occupied depth.')
      bounds = {
        x0: b.x0,
        x1: b.x1,
        y0: b.y0 + setback,
        y1: b.y0 + setback + t,
        z0: b.z0 + bottom,
        z1: b.z0 + bottom + height,
      }
      axis = 'y'
    } else {
      bounds = {
        x0: b.x0,
        x1: b.x1,
        y0: b.y1,
        y1: b.y1 + t,
        z0: b.z1 + bottom,
        z1: b.z1 + bottom + height,
      }
      axis = 'y'
    }
    const panel = orientedPanel(bounds, axis)
    if (
      ![panel.length, panel.width, panel.thickness].every((v) => Number.isFinite(v) && v > 0) ||
      !Number.isFinite(panel.length * panel.width) ||
      !Object.values(bounds).every(Number.isFinite)
    )
      throw Error('The finishing panel must have positive finite dimensions and bounds.')
    let id = `finishing-preview:${cabinetId}`
    while (scene.parts.some((p) => p.id === id)) id += ':'
    const part: BoardPart = {
      ...panel,
      kind: 'board',
      id,
      label: draft.label.trim(),
      material: draft.material,
      grain: draft.grain,
      color: '#b69b76',
      parentId: c.id,
      driven: false,
      visible: true,
      cuts: [],
    }
    const matrix = resolveWorldMatrix(
      part,
      new Map(scene.components.map((item) => [item.id, item])),
    )
    const points = [0, part.length].flatMap((x) =>
      [0, part.width].flatMap((y) =>
        [0, part.thickness].flatMap((z) => applyMatrixToPoint(matrix, x, y, z)),
      ),
    )
    if (!points.every(Number.isFinite))
      throw Error('The cabinet hierarchy produces non-finite board placement.')
    result.part = part
    result.bounds = bounds
  } catch (error) {
    result.errors = [error instanceof Error ? error.message : 'Finishing board could not be built.']
  }
  return result
}
export function acceptFinishing(
  scene: Scene,
  preview: FinishingPreview,
  newId: string,
): Scene | null {
  if (preview.errors.length || !preview.part || preview.signature !== finishingSignature(scene))
    return null
  if (
    !newId.trim() ||
    scene.parts.some((p) => p.id === newId) ||
    scene.components.some((c) => c.id === newId)
  )
    return null
  const checked = previewFinishing(scene, preview.cabinetId, preview.draft)
  if (checked.errors.length || !checked.part) return null
  return { ...scene, parts: [...scene.parts, { ...checked.part, id: newId }] }
}
