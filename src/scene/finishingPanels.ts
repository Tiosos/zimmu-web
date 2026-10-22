import type { BoardPart, CarcaseComponent, Scene, ThicknessAxis } from './types'
import { jointInvolves } from './jointInvolves'
import { carcaseBounds } from './carcaseBounds'
import { orientedPanel, type LocalBox } from './carcaseLayout'
import { roleThicknessFor } from './resolveThickness'
import { openingGeometry } from './openingLayouts'
import { placementSignature } from './placementTools'
import { applyMatrixToPoint, resolveWorldMatrix } from '../geom/transform'

import {
  FINISHING_KINDS,
  finishingLinkError,
  type FinishingDraft,
  type FinishingKind,
  type FinishingLink,
} from './finishingRecipe'
export { FINISHING_KINDS } from './finishingRecipe'
export type { FinishingDraft, FinishingKind } from './finishingRecipe'

export interface FinishingPreview {
  signature: string
  cabinetId: string
  targetId?: string
  action?: 'save' | 'detach' | 'delete'
  draft: FinishingDraft
  part: BoardPart | null
  bounds: LocalBox | null
  errors: string[]
}
export function finishingSignature(scene: Scene): string {
  return JSON.stringify({
    placement: placementSignature(scene),
    applianceBays: scene.applianceBays,
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
      serviceMachining: p.kind === 'board' ? p.serviceMachining : undefined,
      worktopMachining: p.kind === 'board' ? p.worktopMachining : undefined,
      cornerPanel: p.kind === 'board' ? p.cornerPanel : undefined,
      runWorktop: p.kind === 'board' ? p.runWorktop : undefined,
      hingeLayout: p.kind === 'board' ? p.hingeLayout : undefined,
      frontPull: p.kind === 'board' ? p.frontPull : undefined,
      finishing: p.kind === 'board' ? p.finishing : undefined,
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
    follow: false,
    heightMode: 'custom',
    setbackMode: 'custom',
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
  targetId?: string,
): FinishingPreview {
  const built = buildFinishing(scene, cabinetId, draft)
  const target = targetId ? scene.parts.find((p) => p.id === targetId) : undefined
  return {
    signature: finishingSignature(scene),
    cabinetId,
    targetId,
    draft: { ...draft },
    ...built,
    part: target?.kind === 'board' && built.part ? mergeFinishing(target, built.part) : built.part,
  }
}

function buildFinishing(
  scene: Scene,
  cabinetId: string,
  draft: FinishingDraft,
): Pick<FinishingPreview, 'part' | 'bounds' | 'errors'> {
  const result: Pick<FinishingPreview, 'part' | 'bounds' | 'errors'> = {
    part: null,
    bounds: null,
    errors: [],
  }
  try {
    const c = cabinetOf(scene, cabinetId)
    if (draft.follow !== undefined && typeof draft.follow !== 'boolean')
      throw Error('Choose whether to follow cabinet dimensions.')
    if (draft.follow) {
      const error = finishingLinkError(linkOf(draft))
      if (error) throw Error(error)
    }
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
    let height = numeric(draft.height)
    const width = numeric(draft.fillerWidth)
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
    if (draft.follow && draft.heightMode === 'cabinet') height = b.z1 - b.z0 - bottom
    if (draft.follow && draft.heightMode === 'toe-kick') height = c.params.toeKickHeight - bottom
    if (height <= 0) throw Error('Following height must remain greater than zero after clearance.')
    const resolvedSetback =
      draft.follow && draft.setbackMode === 'toe-kick' ? c.params.toeKickSetback : setback
    if (!Number.isFinite(resolvedSetback) || resolvedSetback < 0)
      throw Error('Following setback must be finite and zero or greater.')
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
      if (b.y0 + resolvedSetback + t > b.y1)
        throw Error('Plinth setback and thickness exceed the occupied depth.')
      bounds = {
        x0: b.x0,
        x1: b.x1,
        y0: b.y0 + resolvedSetback,
        y1: b.y0 + resolvedSetback + t,
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
      ...(draft.follow ? { finishing: linkOf(draft) } : {}),
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
function linkOf(draft: FinishingDraft): FinishingLink {
  return {
    version: 1,
    draft: {
      ...draft,
      follow: true,
      heightMode: draft.heightMode ?? 'custom',
      setbackMode: draft.setbackMode ?? 'custom',
    },
  }
}

export function finishingIssues(scene: Scene, part: BoardPart): string[] {
  if (!part.finishing) return []
  const malformed = finishingLinkError(part.finishing)
  if (malformed) return [malformed]
  return buildFinishing(scene, part.parentId ?? '', part.finishing.draft).errors
}

/** Invalid recipes keep their last-good geometry. A lost parent releases ownership. */
export function regenerateFinishing(scene: Scene): Scene {
  return {
    ...scene,
    parts: scene.parts.map((part) => {
      if (part.kind !== 'board' || !part.finishing) return part
      if (!scene.components.some((c) => c.id === part.parentId && c.kind === 'carcase')) {
        return detachedFinishing(part)
      }
      if (finishingLinkError(part.finishing)) return part
      const built = buildFinishing(scene, part.parentId!, part.finishing.draft)
      return built.part ? mergeFinishing(part, built.part) : part
    }),
  }
}

function detachedFinishing(part: BoardPart): BoardPart {
  const fixed = { ...part }
  delete fixed.runWorktop
  delete fixed.finishing
  return fixed
}

function mergeFinishing(existing: BoardPart, candidate: BoardPart): BoardPart {
  return {
    ...existing,
    length: candidate.length,
    width: candidate.width,
    thickness: candidate.thickness,
    position: candidate.position,
    rotation: candidate.rotation,
    rotationOrder: candidate.rotationOrder,
    label: candidate.label,
    material: candidate.material,
    grain: candidate.grain,
    finishing: candidate.finishing,
  }
}

/** Editing fields owned by a recipe through normal part tools makes the board fixed-size. */
export function releaseEditedFinishing(before: BoardPart, after: BoardPart): BoardPart {
  if (!before.finishing && !before.runWorktop) return after
  const owned = (p: BoardPart) => [
    p.length,
    p.width,
    p.thickness,
    p.position,
    p.rotation,
    p.rotationOrder,
    p.parentId,
    p.label,
    p.material,
    p.grain,
  ]
  if (JSON.stringify(owned(before)) === JSON.stringify(owned(after))) return after
  return detachedFinishing(after)
}

export function acceptFinishing(
  scene: Scene,
  preview: FinishingPreview,
  newId: string,
): Scene | null {
  if (preview.signature !== finishingSignature(scene)) return null
  if (preview.targetId !== undefined && !preview.targetId.trim()) return null
  const target = preview.targetId ? scene.parts.find((p) => p.id === preview.targetId) : undefined
  if (
    preview.targetId &&
    (target?.kind !== 'board' ||
      !target.finishing ||
      target.parentId !== preview.cabinetId ||
      target.driven ||
      target.role !== undefined)
  )
    return null
  if (preview.action === 'detach' || preview.action === 'delete') {
    if (target?.kind !== 'board') return null
    if (preview.action === 'delete') {
      // Joint ownership must be removed with the board, as with the normal delete tool.
      return {
        ...scene,
        parts: scene.parts.filter((p) => p.id !== target.id),
        joints: scene.joints.filter((j) => !jointInvolves(j, target.id)),
      }
    }
    const fixed = detachedFinishing(target)
    return { ...scene, parts: scene.parts.map((p) => (p.id === target.id ? fixed : p)) }
  }
  if (preview.action !== undefined && preview.action !== 'save') return null
  if (preview.errors.length || !preview.part) return null
  if (
    !target &&
    (!newId.trim() ||
      scene.parts.some((p) => p.id === newId) ||
      scene.components.some((c) => c.id === newId))
  )
    return null
  const checked = previewFinishing(scene, preview.cabinetId, preview.draft)
  if (checked.errors.length || !checked.part) return null
  return {
    ...scene,
    parts:
      target?.kind === 'board'
        ? scene.parts.map((p) => (p.id === target.id ? mergeFinishing(target, checked.part!) : p))
        : [...scene.parts, { ...checked.part, id: newId }],
  }
}
