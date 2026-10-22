import type { BoardPart, CarcaseComponent, Scene } from './types'
import { runDraftError, runWorktopLinkError, type RunWorktopDraft } from './runWorktopRecipe'
import { finishingDraft, finishingMaterials, finishingSignature } from './finishingPanels'
import { carcaseBounds, type Bounds3 } from './carcaseBounds'
import { roleThicknessFor } from './resolveThickness'
import { openingGeometry } from './openingLayouts'
import { orientedPanel } from './carcaseLayout'
import {
  applyInverseToPoint,
  applyMatrixToPoint,
  composeWorldMatrix,
  decomposeMatrix,
  multiplyMatrix,
  resolveWorldMatrix,
} from '../geom/transform'
import { jointInvolves } from './jointInvolves'
import { runsOf } from './runs'
export type { RunWorktopDraft } from './runWorktopRecipe'
const EPS = 1e-6
export interface WorktopMember {
  id: string
  label: string
  bounds: Bounds3
  gapBefore: number
}
export interface RunWorktopPreview {
  signature: string
  draft: RunWorktopDraft
  targetId?: string
  action?: 'save' | 'detach' | 'delete'
  part: BoardPart | null
  bounds: Bounds3 | null
  members: WorktopMember[]
  errors: string[]
  changed: boolean
}
const copy = (d: RunWorktopDraft): RunWorktopDraft => ({ ...d, memberIds: [...d.memberIds] })
const cabinetOf = (scene: Scene, id: string): CarcaseComponent => {
  const c = scene.components.find((c) => c.id === id)
  if (c?.kind !== 'carcase') throw Error(`A selected cabinet is no longer available: ${id}.`)
  return c
}
export function runWorktopDraft(scene: Scene, cabinetId: string): RunWorktopDraft {
  const d = finishingDraft(scene, cabinetId)
  return {
    memberIds: [cabinetId],
    label: 'Run worktop',
    material: d.material,
    thicknessMode: d.thicknessMode,
    thickness: d.thickness,
    grain: d.grain,
    left: '0',
    right: '0',
    front: '20',
    rear: '0',
    bottom: '0',
    maxGap: '0',
    follow: true,
  }
}
export function runPanelDraft(
  scene: Scene,
  cabinetId: string,
  profile: 'plinth' | 'splashback' = 'plinth',
): RunWorktopDraft {
  const cabinet = cabinetOf(scene, cabinetId)
  return {
    ...runWorktopDraft(scene, cabinetId),
    profile,
    label: profile === 'plinth' ? 'Run plinth' : 'Run splashback',
    height: String(profile === 'plinth' ? cabinet.params.toeKickHeight : 100),
    heightMode: profile === 'plinth' ? 'toe-kick' : 'custom',
    setback: String(profile === 'plinth' ? cabinet.params.toeKickSetback : 0),
    front: '0',
    rear: '0',
    grain: 'width',
  }
}
export function anchoredRunMembers(scene: Scene, cabinetId: string): string[] {
  cabinetOf(scene, cabinetId)
  return runsOf(scene.components, scene.materials)
    .find((r) => r.members.includes(cabinetId))!
    .members.slice()
}
function targetOf(scene: Scene, id?: string): BoardPart | undefined {
  if (id === undefined) return undefined
  const target = scene.parts.find((p) => p.id === id)
  if (
    !id.trim() ||
    target?.kind !== 'board' ||
    !target.runWorktop ||
    target.driven ||
    target.role !== undefined ||
    target.finishing ||
    target.frontPull
  )
    throw Error('The linked worktop is unavailable or no longer owned by this tool.')
  return target
}
export function buildRunWorktop(
  scene: Scene,
  draft: RunWorktopDraft,
  minimumMembers = 2,
): Pick<RunWorktopPreview, 'part' | 'bounds' | 'members'> {
  const error = runDraftError(draft, minimumMembers)
  if (error) throw Error(error)
  if (!finishingMaterials(scene).includes(draft.material))
    throw Error('Choose an existing panel material with positive stock thickness.')
  const cabinets = draft.memberIds.map((id) => cabinetOf(scene, id)),
    reference = cabinets[0]
  if (cabinets.some((c) => c.parentId !== reference.parentId))
    throw Error('Selected cabinets must share the same container.')
  const byId = new Map(scene.components.map((c) => [c.id, c]))
  const seen = new Set<string>()
  let parent = reference.parentId
  while (parent !== null) {
    const node = byId.get(parent)
    if (!node || seen.has(parent))
      throw Error('The shared container hierarchy is missing or cyclic.')
    seen.add(parent)
    parent = node.parentId
  }
  const refMatrix = composeWorldMatrix(reference)
  const rotationIndices = [0, 1, 2, 4, 5, 6, 8, 9, 10]
  const members = cabinets
    .map((c): WorktopMember => {
      if (![...Object.values(c.position), ...Object.values(c.rotation)].every(Number.isFinite))
        throw Error('Cabinet positions and rotations must be finite.')
      const matrix = composeWorldMatrix(c)
      if (rotationIndices.some((i) => Math.abs(matrix[i] - refMatrix[i]) > EPS))
        throw Error(
          'Selected cabinets must have matching orientations; corner runs need separate worktops.',
        )
      const issues = openingGeometry(c.params, scene.materials, scene.parts, c.id).errors
      if (issues.length) throw Error(`${c.label}: ${issues.join('; ')}`)
      const b = carcaseBounds(c.params, roleThicknessFor(c.params, scene.materials, new Map()))
      const point = (x: number, y: number, z: number) => {
        const p = applyMatrixToPoint(matrix, x, y, z)
        return applyInverseToPoint(refMatrix, ...p)
      }
      const points = [b.x0, b.x1].flatMap((x) =>
        [b.y0, b.y1].flatMap((y) => [b.z0, b.z1].map((z) => point(x, y, z))),
      )
      const top = [b.x0, b.x1].flatMap((x) => [b.y0, b.y1].map((y) => point(x, y, b.z1)[2]))
      if (
        draft.profile !== 'plinth' &&
        top.some((z) => !Number.isFinite(z) || Math.abs(z - reference.params.height) > EPS)
      )
        throw Error('Selected cabinets must have aligned top planes.')
      const bounds: Bounds3 = {
        x0: Math.min(...points.map((p) => p[0])),
        x1: Math.max(...points.map((p) => p[0])),
        y0: Math.min(...points.map((p) => p[1])),
        y1: Math.max(...points.map((p) => p[1])),
        z0: Math.min(...points.map((p) => p[2])),
        z1: Math.max(...points.map((p) => p[2])),
      }
      if (
        !Object.values(bounds).every(Number.isFinite) ||
        bounds.x1 <= bounds.x0 ||
        bounds.y1 <= bounds.y0 ||
        bounds.z1 <= bounds.z0
      )
        throw Error('Cabinet bounds must be positive and finite in the run frame.')
      return { id: c.id, label: c.label, bounds, gapBefore: 0 }
    })
    .sort((a, b) => a.bounds.x0 - b.bounds.x0)
  const frontLine = members[0].bounds.y0
  if (members.some((m) => Math.abs(m.bounds.y0 - frontLine) > EPS))
    throw Error('Occupied cabinet fronts must align in one straight line.')
  if (draft.profile === 'plinth') {
    if (cabinets.some((c) => c.params.baseMode !== 'toe-kick' && c.params.baseMode !== 'ladder'))
      throw Error('Run plinths require toe-kick or ladder bases.')
    if (members.some((m) => Math.abs(m.bounds.z0 - members[0].bounds.z0) > EPS))
      throw Error('Plinth cabinet base planes must align.')
  }
  if (
    draft.profile === 'splashback' &&
    members.some((m) => Math.abs(m.bounds.y1 - members[0].bounds.y1) > EPS)
  )
    throw Error('Splashback cabinet rear lines must align.')
  for (let i = 1; i < members.length; i++) {
    const gap = members[i].bounds.x0 - members[i - 1].bounds.x1
    if (gap < -EPS) throw Error('Selected cabinets overlap along the run.')
    if (gap > Number(draft.maxGap) + EPS)
      throw Error(
        'A cabinet gap exceeds the allowed gap. Adjust placement or the explicit allowance.',
      )
    members[i].gapBefore = Math.max(0, gap)
  }
  const thickness =
    draft.thicknessMode === 'stock'
      ? scene.materials[draft.material].thickness!
      : Number(draft.thickness)
  const bounds: Bounds3 = {
    x0: members[0].bounds.x0 - Number(draft.left),
    x1: members.at(-1)!.bounds.x1 + Number(draft.right),
    y0: frontLine - Number(draft.front),
    y1: Math.max(...members.map((m) => m.bounds.y1)) + Number(draft.rear),
    z0: reference.params.height + Number(draft.bottom),
    z1: reference.params.height + Number(draft.bottom) + thickness,
  }
  if (draft.profile === 'plinth') {
    const available =
      Math.min(...cabinets.map((c) => c.params.toeKickHeight)) - Number(draft.bottom)
    const height = draft.heightMode === 'toe-kick' ? available : Number(draft.height)
    if (!Number.isFinite(available) || height <= 0 || height > available + EPS)
      throw Error('Plinth height must fit every cabinet toe kick after bottom clearance.')
    bounds.y0 = frontLine + Number(draft.setback)
    bounds.y1 = bounds.y0 + thickness
    if (bounds.y1 > Math.min(...members.map((m) => m.bounds.y1)) + EPS)
      throw Error('Plinth setback and thickness must fit every cabinet depth.')
    bounds.z0 = members[0].bounds.z0 + Number(draft.bottom)
    bounds.z1 = bounds.z0 + height
  } else if (draft.profile === 'splashback') {
    bounds.y0 = members[0].bounds.y1 + Number(draft.setback)
    bounds.y1 = bounds.y0 + thickness
    bounds.z1 = bounds.z0 + Number(draft.height)
  }
  const panel = orientedPanel(bounds, draft.profile ? 'y' : 'z')
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    ![panel.length, panel.width, panel.thickness, panel.length * panel.width].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw Error('The worktop must have positive finite dimensions, area and bounds.')
  const position = applyMatrixToPoint(refMatrix, bounds.x0, bounds.y0, bounds.z0)
  const vertical = draft.profile
    ? decomposeMatrix(multiplyMatrix(refMatrix, composeWorldMatrix(panel)))
    : null
  let id = 'run-worktop-preview'
  while (scene.parts.some((p) => p.id === id) || byId.has(id)) id += ':'
  const part: BoardPart = {
    ...panel,
    id,
    kind: 'board',
    label: draft.label.trim(),
    material: draft.material,
    grain: draft.grain,
    color: '#b69b76',
    position: { x: position[0], y: position[1], z: position[2] },
    rotation: vertical?.rotation ?? { ...reference.rotation },
    rotationOrder: vertical ? 'XYZ' : reference.rotationOrder,
    parentId: reference.parentId,
    visible: true,
    driven: false,
    cuts: [],
    ...(draft.follow
      ? {
          runWorktop: {
            version: draft.profile ? (2 as const) : (1 as const),
            draft: { ...copy(draft), follow: true as const },
          },
        }
      : {}),
  }
  const world = resolveWorldMatrix(part, byId)
  const corners = [0, part.length].flatMap((x) =>
    [0, part.width].flatMap((y) =>
      [0, part.thickness].flatMap((z) => applyMatrixToPoint(world, x, y, z)),
    ),
  )
  if (!corners.every(Number.isFinite))
    throw Error('The shared hierarchy produces non-finite worktop placement.')
  return { part, bounds, members }
}
function merge(existing: BoardPart, candidate: BoardPart): BoardPart {
  return {
    ...existing,
    label: candidate.label,
    material: candidate.material,
    grain: candidate.grain,
    length: candidate.length,
    width: candidate.width,
    thickness: candidate.thickness,
    position: candidate.position,
    rotation: candidate.rotation,
    rotationOrder: candidate.rotationOrder,
    parentId: candidate.parentId,
    runWorktop: candidate.runWorktop,
  }
}
function partKey(p: BoardPart): string {
  const d = p.runWorktop?.draft
  return JSON.stringify([
    p.label,
    p.material,
    p.grain,
    p.length,
    p.width,
    p.thickness,
    p.position.x,
    p.position.y,
    p.position.z,
    p.rotation.x,
    p.rotation.y,
    p.rotation.z,
    p.parentId,
    d
      ? [
          d.memberIds,
          d.label.trim(),
          d.material,
          d.thicknessMode,
          Number(d.thickness),
          d.grain,
          ...[d.left, d.right, d.front, d.rear, d.bottom, d.maxGap].map(Number),
          d.follow,
          ...(d.profile ? [d.profile, d.heightMode, Number(d.height), Number(d.setback)] : []),
        ]
      : null,
  ])
}
export function previewRunWorktop(
  scene: Scene,
  draft: RunWorktopDraft,
  targetId?: string,
): RunWorktopPreview {
  const result: RunWorktopPreview = {
    signature: finishingSignature(scene),
    draft: copy(draft),
    targetId,
    part: null,
    bounds: null,
    members: [],
    errors: [],
    changed: false,
  }
  try {
    const target = targetOf(scene, targetId),
      built = buildRunWorktop(scene, draft)
    if (target && !!target.runWorktop?.draft.profile !== !!draft.profile)
      throw Error('Edit this board in its matching run workspace.')
    if (draft.profile && target?.worktopMachining)
      throw Error('Remove worktop machining before using a vertical run panel.')
    Object.assign(result, built)
    if (target) result.part = merge(target, built.part!)
    result.changed = !target || partKey(target) !== partKey(result.part!)
  } catch (cause) {
    result.errors = [cause instanceof Error ? cause.message : 'Run worktop could not be built.']
  }
  return result
}
function detached(part: BoardPart): BoardPart {
  const fixed = { ...part }
  delete fixed.runWorktop
  return fixed
}
export function runWorktopIssues(scene: Scene, part: BoardPart): string[] {
  if (!part.runWorktop) return []
  const malformed = runWorktopLinkError(part.runWorktop)
  if (malformed) return [malformed]
  try {
    buildRunWorktop(scene, part.runWorktop.draft)
    return []
  } catch (cause) {
    return [cause instanceof Error ? cause.message : 'Run worktop could not be built.']
  }
}
export function regenerateRunWorktops(scene: Scene): Scene {
  return {
    ...scene,
    parts: scene.parts.map((part) => {
      if (part.kind !== 'board' || !part.runWorktop || runWorktopLinkError(part.runWorktop))
        return part
      if (
        !part.runWorktop.draft.memberIds.some((id) =>
          scene.components.some((c) => c.kind === 'carcase' && c.id === id),
        )
      )
        return detached(part)
      try {
        return merge(part, buildRunWorktop(scene, part.runWorktop.draft).part!)
      } catch {
        return part
      }
    }),
  }
}
export function acceptRunWorktop(
  scene: Scene,
  preview: RunWorktopPreview,
  newId: string,
): Scene | null {
  if (preview.signature !== finishingSignature(scene)) return null
  try {
    const target = targetOf(scene, preview.targetId)
    if (preview.action === 'delete' || preview.action === 'detach') {
      if (!target) return null
      return preview.action === 'detach'
        ? { ...scene, parts: scene.parts.map((p) => (p.id === target.id ? detached(target) : p)) }
        : {
            ...scene,
            parts: scene.parts.filter((p) => p.id !== target.id),
            joints: scene.joints.filter((j) => !jointInvolves(j, target.id)),
          }
    }
    if (preview.action !== undefined && preview.action !== 'save') return null
    if (preview.errors.length || !preview.part || !preview.changed) return null
    const checked = previewRunWorktop(scene, preview.draft, preview.targetId)
    if (checked.errors.length || !checked.changed || !checked.part) return null
    if (target)
      return {
        ...scene,
        parts: scene.parts.map((p) => (p.id === target.id ? merge(target, checked.part!) : p)),
      }
    if (
      !newId.trim() ||
      scene.parts.some((p) => p.id === newId) ||
      scene.components.some((c) => c.id === newId)
    )
      return null
    return { ...scene, parts: [...scene.parts, { ...checked.part, id: newId }] }
  } catch {
    return null
  }
}
