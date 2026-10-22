import type { BoardPart, CarcaseComponent, Part, Scene } from './types'
import type {
  InstallationDraft,
  InstallationRun,
  WallBinding,
  WallFillerDraft,
} from './installationRecipe'
import {
  installationDraftError,
  installationsError,
  wallBindingError,
  wallFillerDraftError,
  wallFillerLinkError,
} from './installationRecipe'
import type { ProjectStructure } from './projectStructure'
import { roomComponentIds } from './projectStructure'
import {
  installationSignature,
  wallBinding,
  fillerBinding,
  refreshInstallationSources,
} from './installationSources'
import { carcaseBounds, type Bounds3 } from './carcaseBounds'
import { roleThicknessFor } from './resolveThickness'
import { openingGeometry } from './openingLayouts'
import {
  ancestorWorldMatrix,
  resolveWorldMatrix,
  applyInverseToPoint,
  applyMatrixToPoint,
} from '../geom/transform'
import { orientedPanel } from './carcaseLayout'
import { finishingMaterials } from './finishingPanels'
import { cutSizeOf, edgesOf } from './edgeBanding'
import { applyPipeline } from './pipeline'
import { roomSceneIssues } from './roomGeometry'
import { clearanceIssues } from './roomAssessment'
import { nearestCarcase } from './nearestCarcase'
import { jointInvolves } from './jointInvolves'
import { serviceIssues } from './serviceMachining'
const EPS = 1e-6
const copy = <T>(v: T): T => structuredClone(v)
const cab = (s: Scene, id: string): CarcaseComponent => {
  const c = s.components.find((c) => c.id === id)
  if (c?.kind !== 'carcase') throw Error(`Cabinet ${id} is missing.`)
  return c
}
const bounds = (s: Scene, c: CarcaseComponent) =>
  carcaseBounds(c.params, roleThicknessFor(c.params, s.materials, new Map()))
function checkedBinding(b: WallBinding | null, issue?: string): WallBinding {
  if (!b) throw Error(issue ?? 'The source wall cannot be resolved.')
  const e = wallBindingError(b)
  if (e) throw Error(e)
  return b
}
function parentFrame(s: Scene, c: CarcaseComponent) {
  const byId = new Map(s.components.map((c) => [c.id, c])),
    seen = new Set<string>()
  let id = c.parentId
  while (id !== null) {
    if (seen.has(id) || !byId.has(id)) throw Error('The cabinet container is missing or cyclic.')
    seen.add(id)
    id = byId.get(id)!.parentId
  }
  const frame = ancestorWorldMatrix(c, byId)
  if (
    Math.abs(frame[2]) > EPS ||
    Math.abs(frame[6]) > EPS ||
    Math.abs(frame[10] - 1) > EPS ||
    Math.abs(c.rotation.x) > EPS ||
    Math.abs(c.rotation.y) > EPS
  )
    throw Error('Installation requires upright cabinets and upright containers.')
  return frame
}
export function installationDraft(
  project: ProjectStructure,
  scene: Scene,
  roomId?: string,
): InstallationDraft {
  const rooms = project.areas.flatMap((a) => a.rooms),
    r = rooms.find((r) => r.id === roomId) ?? rooms[0]
  const ids = r
    ? roomComponentIds(
        r.items.flatMap((i) => i.rootComponentIds),
        scene,
      )
    : new Set<string>()
  const first = scene.components.find((c) => c.kind === 'carcase' && ids.has(c.id))
  return {
    roomId: r?.id ?? '',
    wallId: r?.geometry?.walls[0]?.id ?? '',
    label: 'Cabinet installation',
    memberIds: first ? [first.id] : [],
    side: 'left',
    direction: 'forward',
    from: 'start',
    offset: '0',
    gap: '0',
    startReserve: '0',
    endReserve: '0',
    rear: '10',
    elevationMode: 'base',
    elevation: '0',
    datumLevelId: '',
    floor: '0',
    ceiling: '',
    detach: false,
  }
}
export function wallFillerDraft(
  project: ProjectStructure,
  scene: Scene,
  roomId?: string,
): WallFillerDraft {
  const run = installationDraft(project, scene, roomId),
    c = scene.components.find((c) => c.id === run.memberIds[0]),
    material =
      c?.kind === 'carcase' && finishingMaterials(scene).includes(c.params.carcaseMaterial)
        ? c.params.carcaseMaterial
        : (finishingMaterials(scene)[0] ?? '')
  return {
    roomId: run.roomId,
    wallId: run.wallId,
    cabinetId: run.memberIds[0] ?? '',
    label: 'Wall filler',
    side: 'left',
    minimum: '10',
    maximum: '300',
    wallGap: '2',
    setback: '0',
    material,
    thicknessMode: 'stock',
    thickness: String(scene.materials[material]?.thickness ?? 18),
    grain: 'length',
    heightMode: 'cabinet',
    height: '720',
    bottom: '0',
    top: '0',
    edges: {},
  }
}
function runComponents(s: Scene, run: InstallationRun): CarcaseComponent[] {
  const d = run.draft,
    error = installationDraftError(d)
  if (error) throw Error(error)
  const binding = checkedBinding(run.binding, run.sourceIssue),
    members = d.memberIds.map((id) => cab(s, id)),
    reference = members[0]
  if (members.some((c) => c.parentId !== reference.parentId))
    throw Error('Selected cabinets must share one container.')
  if (members.some((c) => c.anchor))
    throw Error('Detach existing anchors explicitly before installing this run.')
  const frame = parentFrame(s, reference)
  for (const c of members) {
    parentFrame(s, c)
    const issues = openingGeometry(c.params, s.materials, s.parts, c.id).errors
    if (issues.length) throw Error(`${c.label}: ${issues.join('; ')}`)
  }
  const b = members.map((c) => bounds(s, c)),
    length = Math.hypot(binding.end.x - binding.start.x, binding.end.y - binding.start.y),
    tx = (binding.end.x - binding.start.x) / length,
    ty = (binding.end.y - binding.start.y) / length,
    sign = d.side === 'left' ? 1 : -1
  const span = b.reduce((sum, b) => sum + b.x1 - b.x0, 0) + Number(d.gap) * (members.length - 1),
    start = Number(d.startReserve),
    end = length - Number(d.endReserve)
  let cursor =
    d.from === 'start'
      ? start + Number(d.offset)
      : d.from === 'end'
        ? end - Number(d.offset) - span
        : (start + end - span) / 2 + Number(d.offset)
  if (cursor < start - EPS || cursor + span > end + EPS)
    throw Error('The run does not fit the reserved wall span.')
  const order = members.map((_, i) => i)
  if (d.direction === 'reverse') order.reverse()
  const result: CarcaseComponent[] = []
  for (const i of order) {
    const c = members[i],
      box = b[i],
      origin = cursor + (sign === 1 ? box.x1 : -box.x0),
      rear = Number(d.rear) + box.y1
    const world = {
      x: binding.start.x + tx * origin - ty * sign * rear,
      y: binding.start.y + ty * origin + tx * sign * rear,
      z: binding.datum + Number(d.elevation) - (d.elevationMode === 'base' ? box.z0 : box.z1),
    }
    const local = applyInverseToPoint(frame, world.x, world.y, world.z),
      parentAngle = (Math.atan2(frame[1], frame[0]) * 180) / Math.PI,
      angle = (Math.atan2(ty, tx) * 180) / Math.PI + (sign === 1 ? 180 : 0) - parentAngle
    if (![...local, angle].every(Number.isFinite))
      throw Error('Installation placement is not finite.')
    result.push({
      ...c,
      position: { x: local[0], y: local[1], z: local[2] },
      rotation: { x: 0, y: 0, z: angle },
      anchor: undefined,
    })
    cursor += box.x1 - box.x0 + Number(d.gap)
  }
  return result
}
export function installationIssues(s: Scene, run: InstallationRun): string[] {
  try {
    runComponents(s, run)
    return []
  } catch (e) {
    return [e instanceof Error ? e.message : 'Installation could not be resolved.']
  }
}
export function resolveInstallations(s: Scene): Scene {
  if (!s.installations?.length) return s
  const allError = installationsError(s.installations)
  if (allError) return s
  let components = s.components
  for (const run of s.installations) {
    try {
      const resolved = new Map(runComponents({ ...s, components }, run).map((c) => [c.id, c]))
      components = components.map((c) => resolved.get(c.id) ?? c)
    } catch {
      /* Last valid poses remain available for repair. */
    }
  }
  return { ...s, components }
}
export interface InstallationRow extends Bounds3 {
  id: string
  label: string
}
function wallBox(
  s: Scene,
  node: Part | CarcaseComponent,
  b: Bounds3,
  binding: WallBinding,
): Bounds3 {
  const matrix = resolveWorldMatrix(node, new Map(s.components.map((c) => [c.id, c]))),
    length = Math.hypot(binding.end.x - binding.start.x, binding.end.y - binding.start.y),
    tx = (binding.end.x - binding.start.x) / length,
    ty = (binding.end.y - binding.start.y) / length
  const points = [b.x0, b.x1].flatMap((x) =>
    [b.y0, b.y1].flatMap((y) =>
      [b.z0, b.z1].map((z) => {
        const p = applyMatrixToPoint(matrix, x, y, z),
          dx = p[0] - binding.start.x,
          dy = p[1] - binding.start.y
        return [dx * tx + dy * ty, -dx * ty + dy * tx, p[2]]
      }),
    ),
  )
  return {
    x0: Math.min(...points.map((p) => p[0])),
    x1: Math.max(...points.map((p) => p[0])),
    y0: Math.min(...points.map((p) => p[1])),
    y1: Math.max(...points.map((p) => p[1])),
    z0: Math.min(...points.map((p) => p[2])),
    z1: Math.max(...points.map((p) => p[2])),
  }
}
export function installationRows(s: Scene, binding: WallBinding, ids: string[]): InstallationRow[] {
  return s.components
    .filter((c): c is CarcaseComponent => c.kind === 'carcase' && ids.includes(c.id))
    .map((c) => ({ ...wallBox(s, c, bounds(s, c), binding), id: c.id, label: c.label }))
}
const intersects = (a: Bounds3, b: Bounds3) =>
  (['x', 'y', 'z'] as const).every(
    (k) => a[`${k}0`] < b[`${k}1`] - EPS && a[`${k}1`] > b[`${k}0`] + EPS,
  )
function boardBounds(s: Scene, p: BoardPart, b: WallBinding) {
  return wallBox(s, p, { x0: 0, x1: p.length, y0: 0, y1: p.width, z0: 0, z1: p.thickness }, b)
}
function diagnostics(
  s: Scene,
  project: ProjectStructure,
  roomId: string,
  binding: WallBinding,
  affected: Set<string>,
  fillerId?: string,
): string[] {
  const room = project.areas.flatMap((a) => a.rooms).find((r) => r.id === roomId)
  if (!room?.geometry) return ['Room diagnostics are unavailable.']
  const ids = roomComponentIds(
      room.items.flatMap((i) => i.rootComponentIds),
      s,
    ),
    byId = new Map(s.components.map((c) => [c.id, c])),
    issues = [...roomSceneIssues(room.geometry, s, ids), ...clearanceIssues(room.geometry, s, ids)]
  const looseIds = new Set(room.items.flatMap((i) => i.rootPartIds))
  const boards = s.parts
    .filter(
      (p): p is BoardPart =>
        p.kind === 'board' &&
        (ids.has(nearestCarcase(p, byId)?.id ?? '') ||
          looseIds.has(p.id) ||
          p.id === fillerId ||
          !!p.runWorktop?.draft.memberIds.some((id) => ids.has(id)) ||
          !!p.cornerPanel?.draft.legs.some((l) => l.run.memberIds.some((id) => ids.has(id)))),
    )
    .map((p) => ({ p, owner: nearestCarcase(p, byId)?.id, box: boardBounds(s, p, binding) }))
  for (let i = 0; i < boards.length; i++)
    for (let j = i + 1; j < boards.length; j++) {
      const a = boards[i],
        b = boards[j]
      if (
        !(
          (fillerId && (a.p.id === fillerId || b.p.id === fillerId)) ||
          (!fillerId && (affected.has(a.owner ?? '') || affected.has(b.owner ?? '')))
        )
      )
        continue
      if (!fillerId && a.owner && a.owner === b.owner) continue
      if (intersects(a.box, b.box)) {
        issues.push(
          `Board interference: ${a.p.label} / ${b.p.label} (solid envelopes; machining not subtracted).`,
        )
        if (issues.length >= 100)
          return [
            ...new Set(issues.slice(0, 100)),
            'Additional board findings omitted; inspect the complete layout.',
          ]
      }
    }
  return [...new Set(issues)]
}
export interface InstallationPreview {
  signature: string
  draft: InstallationDraft
  targetId?: string
  action?: 'save' | 'detach'
  scene: Scene | null
  rows: InstallationRow[]
  binding: WallBinding | null
  errors: string[]
  issues: string[]
  changed: boolean
}
export function previewInstallation(
  scene: Scene,
  project: ProjectStructure,
  draft: InstallationDraft,
  targetId?: string,
): InstallationPreview {
  const p: InstallationPreview = {
    signature: installationSignature(scene, project),
    draft: copy(draft),
    targetId,
    scene: null,
    rows: [],
    binding: null,
    errors: [],
    issues: [],
    changed: false,
  }
  try {
    const error = installationDraftError(draft)
    if (error) throw Error(error)
    const old = scene.installations?.find((r) => r.id === targetId)
    if (targetId && !old) throw Error('The saved installation is unavailable.')
    if (
      scene.installations?.some(
        (r) => r.id !== targetId && r.draft.memberIds.some((id) => draft.memberIds.includes(id)),
      )
    )
      throw Error('A cabinet already belongs to another installation run.')
    if (!targetId && (scene.installations?.length ?? 0) >= 100)
      throw Error('Use at most 100 installation runs.')
    const selected = draft.memberIds.map((id) => cab(scene, id))
    if (selected.some((c) => c.anchor) && !draft.detach)
      throw Error('Detach existing anchors explicitly before installing this run.')
    const resolved = wallBinding(scene, project, draft, true)
    p.binding = checkedBinding(resolved.binding, resolved.sourceIssue)
    let id = targetId ?? 'installation-preview'
    while (!targetId && scene.installations?.some((r) => r.id === id)) id += ':'
    const stored = { ...copy(draft), label: draft.label.trim(), detach: false },
      run: InstallationRun = { version: 1, id, draft: stored, ...resolved }
    let next = refreshInstallationSources(scene, project)
    next = {
      ...next,
      components: next.components.map((c) =>
        c.kind === 'carcase' && draft.memberIds.includes(c.id) && draft.detach
          ? { ...c, anchor: undefined }
          : c,
      ),
      installations: [...(next.installations ?? []).filter((r) => r.id !== targetId), run],
    }
    runComponents(next, run)
    next = applyPipeline(next)
    p.scene = next
    p.rows = installationRows(next, p.binding, draft.memberIds)
    p.issues = diagnostics(next, project, draft.roomId, p.binding, new Set(draft.memberIds))
    for (const row of p.rows) {
      if (row.z0 < Number(draft.floor) - EPS) p.issues.push(`${row.label}: below the stated floor.`)
      if (draft.ceiling.trim() && row.z1 > Number(draft.ceiling) + EPS)
        p.issues.push(`${row.label}: exceeds the stated ceiling.`)
    }
    if (!draft.ceiling.trim())
      p.issues.push('Ceiling clearance is unassessed; enter a ceiling elevation to check it.')
    const map = new Map(next.components.map((c) => [c.id, c]))
    for (const part of next.parts)
      if (part.kind === 'board' && draft.memberIds.includes(nearestCarcase(part, map)?.id ?? '')) {
        const b = boardBounds(next, part, p.binding)
        if ((draft.side === 'left' ? b.y0 : -b.y1) < -EPS)
          p.issues.push(`${part.label}: actual board envelope crosses the reference wall.`)
      }
    p.issues = [...new Set(p.issues)]
    p.changed = !old || JSON.stringify(old.draft) !== JSON.stringify(stored)
  } catch (e) {
    p.errors = [e instanceof Error ? e.message : 'Installation could not be previewed.']
  }
  return p
}
export function acceptInstallation(
  scene: Scene,
  project: ProjectStructure,
  p: InstallationPreview,
  id: string,
): Scene | null {
  if (p.signature !== installationSignature(scene, project)) return null
  if (p.action === 'detach') {
    if (!p.targetId || !scene.installations?.some((r) => r.id === p.targetId)) return null
    const next = { ...scene },
      runs = scene.installations.filter((r) => r.id !== p.targetId)
    if (runs.length) next.installations = runs
    else delete next.installations
    return next
  }
  if (p.action !== undefined && p.action !== 'save') return null
  const checked = previewInstallation(scene, project, p.draft, p.targetId)
  if (checked.errors.length || !checked.changed || !checked.scene) return null
  if (
    !p.targetId &&
    (!id.trim() ||
      scene.installations?.some((r) => r.id === id) ||
      scene.parts.some((p) => p.id === id) ||
      scene.components.some((c) => c.id === id))
  )
    return null
  return {
    ...checked.scene,
    installations: checked.scene.installations!.map((r) =>
      r.id === (p.targetId ?? checked.scene!.installations!.at(-1)!.id)
        ? { ...r, id: p.targetId ?? id }
        : r,
    ),
  }
}
function buildFiller(
  scene: Scene,
  d: WallFillerDraft,
  binding: WallBinding | null,
  sourceIssue?: string,
): BoardPart {
  const error = wallFillerDraftError(d)
  if (error) throw Error(error)
  const wall = checkedBinding(binding, sourceIssue),
    c = cab(scene, d.cabinetId)
  parentFrame(scene, c)
  if (!finishingMaterials(scene).includes(d.material))
    throw Error('Choose an existing panel material with positive stock thickness.')
  const issues = openingGeometry(c.params, scene.materials, scene.parts, c.id).errors
  if (issues.length) throw Error(issues.join('; '))
  const matrix = resolveWorldMatrix(c, new Map(scene.components.map((c) => [c.id, c]))),
    a = applyInverseToPoint(matrix, wall.start.x, wall.start.y, 0),
    b = applyInverseToPoint(matrix, wall.end.x, wall.end.y, 0),
    box = bounds(scene, c)
  if (Math.abs(a[0] - b[0]) > EPS)
    throw Error('Angled filler walls are unsupported; choose a wall parallel to the cabinet side.')
  const x = (a[0] + b[0]) / 2,
    thickness =
      d.thicknessMode === 'stock' ? scene.materials[d.material].thickness! : Number(d.thickness),
    y0 = box.y0 + Number(d.setback)
  if (Math.min(a[1], b[1]) > y0 + EPS || Math.max(a[1], b[1]) < y0 + thickness - EPS)
    throw Error('The wall segment does not span the filler depth at its front alignment.')
  const width = (d.side === 'left' ? box.x0 - x : x - box.x1) - Number(d.wallGap)
  if (width < Number(d.minimum) - EPS || width > Number(d.maximum) + EPS)
    throw Error(
      `Calculated filler width ${width.toFixed(2)} mm is outside the minimum/maximum range.`,
    )
  const height =
    d.heightMode === 'cabinet'
      ? box.z1 - box.z0 - Number(d.bottom) - Number(d.top)
      : Number(d.height)
  const x0 = d.side === 'left' ? box.x0 - width : box.x1,
    z0 = box.z0 + Number(d.bottom)
  const spec = orientedPanel(
    { x0, x1: x0 + width, y0, y1: y0 + thickness, z0, z1: z0 + height },
    'y',
  )
  if (
    ![spec.length, spec.width, spec.thickness].every(
      (n) => Number.isFinite(n) && n > 0 && n <= 100000,
    )
  )
    throw Error('Filler dimensions must be positive, finite and at most 100000 mm.')
  const part: BoardPart = {
    ...spec,
    id: 'wall-filler-preview',
    kind: 'board',
    label: d.label.trim(),
    material: d.material,
    grain: d.grain,
    color: '#b69b76',
    cuts: [],
    edgeBanding: copy(d.edges),
    parentId: c.id,
    visible: true,
    driven: false,
    wallFiller: { version: 1, draft: copy(d), binding: copy(wall) },
  }
  const cut = cutSizeOf(
      part,
      edgesOf(part, new Map(scene.components.map((c) => [c.id, c])), scene.materials),
      scene.materials,
    ),
    bad = Object.values(d.edges).some(
      (stock) =>
        stock !== null && stock !== undefined && !((scene.materials[stock]?.thickness ?? 0) > 0),
    )
  if (cut.problem || bad) throw Error(cut.problem ?? 'Edge stock must have positive thickness.')
  return part
}
function mergeFiller(old: BoardPart, fresh: BoardPart): BoardPart {
  return {
    ...old,
    ...fresh,
    id: old.id,
    color: old.color,
    visible: old.visible,
    cuts: old.cuts,
    operations: old.operations,
    serviceMachining: old.serviceMachining,
  }
}
export function wallFillerIssues(scene: Scene, part: BoardPart): string[] {
  if (!part.wallFiller) return []
  try {
    const e = wallFillerLinkError(part.wallFiller)
    if (e) throw Error(e)
    buildFiller(scene, part.wallFiller.draft, part.wallFiller.binding, part.wallFiller.sourceIssue)
    return serviceIssues(scene, part)
  } catch (e) {
    return [e instanceof Error ? e.message : 'Filler cannot be resolved.']
  }
}
export function regenerateWallFillers(scene: Scene): Scene {
  return {
    ...scene,
    parts: scene.parts.map((p) => {
      if (p.kind !== 'board' || !p.wallFiller || wallFillerLinkError(p.wallFiller)) return p
      try {
        return mergeFiller(
          p,
          buildFiller(scene, p.wallFiller.draft, p.wallFiller.binding, p.wallFiller.sourceIssue),
        )
      } catch {
        return p
      }
    }),
  }
}
export interface WallFillerPreview {
  signature: string
  draft: WallFillerDraft
  targetId?: string
  action?: 'save' | 'detach' | 'delete'
  scene: Scene | null
  part: BoardPart | null
  binding: WallBinding | null
  errors: string[]
  issues: string[]
  changed: boolean
}
function fillerTarget(scene: Scene, id?: string): BoardPart | undefined {
  if (id === undefined) return undefined
  const p = scene.parts.find((p) => p.id === id)
  if (
    p?.kind !== 'board' ||
    !p.wallFiller ||
    p.driven ||
    p.role !== undefined ||
    p.finishing ||
    p.runWorktop ||
    p.cornerPanel ||
    p.frontPull ||
    p.worktopMachining
  )
    throw Error('The wall filler is unavailable or no longer owned by this workspace.')
  return p
}
export function previewWallFiller(
  scene: Scene,
  project: ProjectStructure,
  draft: WallFillerDraft,
  targetId?: string,
): WallFillerPreview {
  const p: WallFillerPreview = {
    signature: installationSignature(scene, project),
    draft: copy(draft),
    targetId,
    scene: null,
    part: null,
    binding: null,
    errors: [],
    issues: [],
    changed: false,
  }
  try {
    const old = fillerTarget(scene, targetId),
      resolved = fillerBinding(scene, project, draft)
    p.binding = checkedBinding(resolved.binding, resolved.sourceIssue)
    const current = applyPipeline(refreshInstallationSources(scene, project)),
      fresh = buildFiller(current, draft, p.binding)
    let part = old ? mergeFiller(old, fresh) : fresh
    if (part.cuts.some((c) => c.kind === 'mitre'))
      throw Error('Remove mitre machining before resizing a rectangular wall filler.')
    if (!old) {
      let id = part.id
      while (scene.parts.some((p) => p.id === id) || scene.components.some((c) => c.id === id))
        id += ':'
      part = { ...part, id }
    }
    const newBox = boardBounds(current, part, p.binding)
    for (const other of current.parts)
      if (
        other.kind === 'board' &&
        other.wallFiller &&
        other.wallFiller.draft.roomId === draft.roomId &&
        other.id !== targetId
      ) {
        if (intersects(newBox, boardBounds(current, other, p.binding)))
          throw Error('Another linked filler already covers this gap. Edit or remove it first.')
      }
    const next = applyPipeline({
      ...current,
      parts: [...current.parts.filter((p) => p.id !== targetId), part],
    })
    p.scene = next
    p.part = next.parts.find((q): q is BoardPart => q.id === part.id && q.kind === 'board')!
    const machining = serviceIssues(next, p.part)
    if (machining.length) throw Error(machining.join('; '))
    p.issues = diagnostics(
      next,
      project,
      draft.roomId,
      p.binding,
      new Set([draft.cabinetId]),
      part.id,
    )
    if (p.part.cuts.length || p.part.operations?.length)
      p.issues.push(
        'Retained machining needs boundary and installation review; independent cuts are not automatically routed.',
      )
    p.changed = !old || JSON.stringify(old.wallFiller!.draft) !== JSON.stringify(draft)
  } catch (e) {
    p.errors = [e instanceof Error ? e.message : 'Filler could not be previewed.']
  }
  return p
}
export function acceptWallFiller(
  scene: Scene,
  project: ProjectStructure,
  p: WallFillerPreview,
  id: string,
): Scene | null {
  if (p.signature !== installationSignature(scene, project)) return null
  try {
    const old = fillerTarget(scene, p.targetId)
    if (p.action === 'delete' || p.action === 'detach') {
      if (!old) return null
      return {
        ...scene,
        parts: scene.parts.flatMap((q): Part[] =>
          q.id !== old.id ? [q] : p.action === 'delete' ? [] : [{ ...old, wallFiller: undefined }],
        ),
        joints:
          p.action === 'delete'
            ? scene.joints.filter((j) => !jointInvolves(j, old.id))
            : scene.joints,
      }
    }
    if (p.action !== undefined && p.action !== 'save') return null
    const checked = previewWallFiller(scene, project, p.draft, p.targetId)
    if (checked.errors.length || !checked.changed || !checked.part || !checked.scene) return null
    if (
      !old &&
      (!id.trim() ||
        scene.parts.some((p) => p.id === id) ||
        scene.components.some((c) => c.id === id))
    )
      return null
    return {
      ...checked.scene,
      parts: checked.scene.parts.map((q) =>
        q.id === checked.part!.id ? { ...checked.part!, id: old?.id ?? id } : q,
      ),
    }
  } catch {
    return null
  }
}
