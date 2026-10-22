import { motionDoors, motionDoorIssues } from './motionHardware'
import { buildShelfReadiness } from './shelfReadiness'
import { carcaseHardware } from './carcaseHardware'
import type {
  BoardPart,
  CarcaseComponent,
  DrawerComponent,
  EdgeDecisions,
  EdgeKey,
  Grain,
  Scene,
} from './types'
import { componentsById } from './componentTree'
import { nearestCarcase } from './nearestCarcase'
import { openingLayoutErrors } from './openingLayouts'
import { sectionOpenings } from './sectionInterior'
import { openingGeometry } from './openingLayouts'
import { applyPipeline } from './pipeline'
import { productionLimitIssue } from './readinessLimits'
import { finishingMaterials, previewFinishing } from './finishingPanels'
import { previewRunWorktop } from './runWorktops'
import { EDGE_KEYS, edgesOf, requestedEdgesOf, cutSizeOf, bandedEdgeLengths } from './edgeBanding'
import { localDirToWorld } from '../geom/transform'

export interface BoardTreatment {
  material?: string | null
  grain?: Grain | null
  edges?: Partial<Record<EdgeKey, string | null | { inherit: true }>>
}
export type MaterialsDraft = Record<string, BoardTreatment>
export interface MaterialTarget {
  board: BoardPart
  family: string
  opening: string
  locked: boolean
  shared: boolean
}
export interface MaterialsPreview {
  signature: string
  cabinetId: string
  mode: 'materials' | 'edges'
  draft: MaterialsDraft
  scene: Scene | null
  errors: string[]
  changed: boolean
  rows: { id: string; label: string; before: BoardPart | null; after: BoardPart }[]
  hardware: { key: string; before: number; after: number }[]
  totals: { material: string; before: number; after: number }[]
}
export const materialsSignature = (scene: Scene): string => JSON.stringify(scene)

function cabinetOf(scene: Scene, id: string): CarcaseComponent {
  const c = scene.components.find((c) => c.id === id)
  if (c?.kind !== 'carcase') throw Error('The cabinet is no longer available.')
  const issue = productionLimitIssue(c)
  if (issue) throw Error(issue)
  return c
}
export function boardFamily(p: BoardPart): string {
  const r = p.role ?? ''
  if (p.finishing || p.runWorktop || !r) return 'Finishing / manual'
  if (r.startsWith('fixed-shelf-')) return 'Fixed shelves'
  if (r.startsWith('adj-shelf-')) return 'Adjustable shelves'
  if (r.startsWith('front-')) return 'Fronts'
  if (r.startsWith('box-')) return 'Drawer boxes'
  if (r.startsWith('stile-') || r.startsWith('rail-')) return 'Face frame'
  if (r.startsWith('division-')) return 'Divisions'
  return r === 'left-side' || r === 'right-side' ? 'Cabinet sides' : 'Carcase'
}
export function materialTargets(scene: Scene, id: string): MaterialTarget[] {
  const c = cabinetOf(scene, id),
    byId = componentsById(scene.components)
  const geometry = openingGeometry(c.params, scene.materials, scene.parts, id)
  const openings = geometry.tree ? sectionOpenings(c.params.section, geometry.tree) : []
  return scene.parts
    .filter(
      (p): p is BoardPart =>
        p.kind === 'board' &&
        (nearestCarcase(p, byId)?.id === id || !!p.runWorktop?.draft.memberIds.includes(id) || !!p.cornerPanel?.draft.legs.some((l) => l.run.memberIds.includes(id))),
    )
    .map((board) => {
      const owner = board.parentId ? byId.get(board.parentId) : undefined
      const n = openings.findIndex((o) =>
        owner?.kind === 'drawer'
          ? owner.sectionId === o.sectionId
          : board.role?.includes(o.sectionId),
      )
      return {
        board,
        family: boardFamily(board),
        opening: n < 0 ? 'Cabinet / run' : `Opening ${n + 1}`,
        locked:
          !!board.cornerPanel ||
          (!board.driven && board.role !== undefined) ||
          ((owner?.kind === 'drawer' || owner?.kind === 'faceFrame') && !owner.driven),
        shared: !!board.runWorktop || !!board.cornerPanel,
      }
    })
}
const NORMALS = {
  x0: { x: -1, y: 0, z: 0 },
  x1: { x: 1, y: 0, z: 0 },
  y0: { x: 0, y: -1, z: 0 },
  y1: { x: 0, y: 1, z: 0 },
} as const
const EDGE_LABELS = { x0: 'Length start', x1: 'Length end', y0: 'Width start', y1: 'Width end' }
export function cabinetEdgeDirection(scene: Scene, id: string, p: BoardPart, key: EdgeKey): string {
  const c = cabinetOf(scene, id),
    byId = componentsById(scene.components)
  const n = localDirToWorld(p, NORMALS[key], byId)
  for (const [axis, plus, minus] of [
    ['x', 'right', 'left'],
    ['y', 'rear', 'front'],
    ['z', 'top', 'bottom'],
  ] as const) {
    const basis = localDirToWorld(
      c,
      { x: +(axis === 'x'), y: +(axis === 'y'), z: +(axis === 'z') },
      byId,
    )
    const dot = n.x * basis.x + n.y * basis.y + n.z * basis.z
    if (Math.abs(dot) > 1 - 1e-6) return dot > 0 ? plus : minus
  }
  return 'angled'
}
export function cabinetEdgeLabel(scene: Scene, id: string, p: BoardPart, key: EdgeKey): string {
  return `${EDGE_LABELS[key]} (${key}; cabinet ${cabinetEdgeDirection(scene, id, p, key)})`
}
function distinctTargets(scene: Scene, id: string, ids: string[]): MaterialTarget[] {
  if (!ids.length || ids.length > 1000 || new Set(ids).size !== ids.length)
    throw Error('Select 1–1000 distinct editable boards.')
  const targets = materialTargets(scene, id)
  return ids.map((id) => {
    const t = targets.find((t) => t.board.id === id)
    if (!t || t.locked) throw Error('A selected board is unavailable or detached.')
    return t
  })
}
export function stageMaterials(
  scene: Scene,
  id: string,
  draft: MaterialsDraft,
  ids: string[],
  patch: Pick<BoardTreatment, 'material' | 'grain'>,
): MaterialsDraft {
  const selected = distinctTargets(scene, id, ids),
    next = structuredClone(draft),
    byId = componentsById(scene.components)
  if (patch.material === undefined && patch.grain === undefined)
    throw Error('Choose a material or grain change.')
  for (const t of selected) {
    let affected = [t]
    const owner = t.board.parentId ? byId.get(t.board.parentId) : undefined
    if (patch.material !== undefined && owner?.kind === 'drawer') {
      affected = materialTargets(scene, id).filter((other) => other.board.parentId === owner.id)
      if (affected.length !== 5 || affected.some((t) => t.locked))
        throw Error(
          'Material changes require a complete driven drawer box without detached boards.',
        )
    }
    for (const a of affected)
      next[a.board.id] = {
        ...next[a.board.id],
        ...(patch.material !== undefined ? { material: patch.material } : {}),
        ...(a.board.id === t.board.id && patch.grain !== undefined ? { grain: patch.grain } : {}),
      }
  }
  return next
}
export function stageEdges(
  scene: Scene,
  id: string,
  draft: MaterialsDraft,
  ids: string[],
  keys: EdgeKey[],
  value: string | null,
  inherit = false,
  preserve = true,
  preset: 'selected' | 'front' | 'perimeter' = 'selected',
): MaterialsDraft {
  const next = structuredClone(draft)
  for (const { board } of distinctTargets(scene, id, ids)) {
    if (board.cuts.some((c) => c.kind === 'mitre'))
      throw Error('Mitred boards do not support rectangular edge treatments.')
    const chosen =
      preset === 'perimeter'
        ? [...EDGE_KEYS]
        : preset === 'front'
          ? EDGE_KEYS.filter((k) => cabinetEdgeDirection(scene, id, board, k) === 'front')
          : keys
    if (!chosen.length || chosen.some((k) => !EDGE_KEYS.includes(k)))
      throw Error('Choose edges that exist on every selected board.')
    const edges = { ...next[board.id]?.edges }
    for (const key of chosen) {
      if (preserve && board.edgeBanding?.[key] !== undefined) continue
      edges[key] = inherit ? { inherit: true } : value
    }
    next[board.id] = { ...next[board.id], edges }
  }
  return next
}
export function copyBoardTreatments(
  scene: Scene,
  id: string,
  draft: MaterialsDraft,
  sourceId: string,
  ids: string[],
  mode: 'materials' | 'edges',
  preserve = true,
): MaterialsDraft {
  const targets = materialTargets(scene, id),
    source = targets.find((t) => t.board.id === sourceId)?.board
  if (!source) throw Error('Choose an available source board.')
  const proposal = previewMaterials(scene, id, draft, mode)
  if (proposal.errors.length || !proposal.scene) throw Error(proposal.errors.join('; '))
  const p = proposal.scene.parts.find((p) => p.id === sourceId)
  if (p?.kind !== 'board') throw Error('Source board is no longer available.')
  if (mode === 'materials')
    return stageMaterials(scene, id, draft, ids, { material: p.material || null, grain: p.grain })
  let next = structuredClone(draft)
  const byId = componentsById(proposal.scene.components),
    effective = edgesOf(p, byId, scene.materials)
  for (const { board } of distinctTargets(scene, id, ids)) {
    if (
      Math.abs(board.length - p.length) > 1e-6 ||
      Math.abs(board.width - p.width) > 1e-6 ||
      EDGE_KEYS.some((key) => {
        const a = localDirToWorld(board, NORMALS[key], byId)
        const b = localDirToWorld(p, NORMALS[key], byId)
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) > 1e-6
      })
    )
      throw Error('Copy edges only between boards with matching dimensions and orientation.')
    for (const key of EDGE_KEYS)
      next = stageEdges(scene, id, next, [board.id], [key], effective[key], false, preserve)
  }
  return next
}
function validatePatch(patch: BoardTreatment, mode: MaterialsPreview['mode']): void {
  if (
    !patch ||
    typeof patch !== 'object' ||
    Array.isArray(patch) ||
    Object.keys(patch).some((k) => !['material', 'grain', 'edges'].includes(k))
  )
    throw Error('Invalid board treatment.')
  if (
    mode === 'materials'
      ? patch.edges !== undefined
      : patch.material !== undefined || patch.grain !== undefined
  )
    throw Error('Use the matching treatment workspace.')
  if (patch.material !== undefined && patch.material !== null && typeof patch.material !== 'string')
    throw Error('Choose a valid material.')
  if (
    patch.grain !== undefined &&
    patch.grain !== null &&
    !['length', 'width', 'free'].includes(patch.grain)
  )
    throw Error('Choose length, width, free or inherited grain.')
  if (
    patch.edges !== undefined &&
    (!patch.edges ||
      Array.isArray(patch.edges) ||
      typeof patch.edges !== 'object' ||
      Object.entries(patch.edges).some(
        ([key, v]) =>
          !EDGE_KEYS.includes(key as EdgeKey) ||
          (v !== null &&
            typeof v !== 'string' &&
            !(typeof v === 'object' && v.inherit === true && Object.keys(v).length === 1)),
      ))
  )
    throw Error('Choose valid board edges.')
}
function treatmentKey(p: BoardPart): string {
  return JSON.stringify([
    p.material,
    p.thickness,
    p.grain,
    p.overrides?.material ?? null,
    p.overrides?.grain ?? null,
    EDGE_KEYS.map((k) => (p.edgeBanding?.[k] === undefined ? 'inherit' : p.edgeBanding[k])),
    p.finishing?.draft,
    p.runWorktop?.draft,
  ])
}
export function previewMaterials(
  scene: Scene,
  id: string,
  input: MaterialsDraft,
  mode: MaterialsPreview['mode'],
): MaterialsPreview {
  const result: MaterialsPreview = {
    signature: materialsSignature(scene),
    cabinetId: id,
    mode,
    draft: structuredClone(input),
    scene: null,
    errors: [],
    changed: false,
    rows: [],
    totals: [],
    hardware: [],
  }
  try {
    const cabinet = cabinetOf(scene, id),
      targets = materialTargets(scene, id),
      ids = Object.keys(input)
    if (ids.length > 1000) throw Error('Stage at most 1000 boards.')
    const selected = ids.length ? distinctTargets(scene, id, ids) : []
    let next = structuredClone(scene)
    for (const { board } of selected) {
      const patch = input[board.id]
      validatePatch(patch, mode)
      const p = next.parts.find((p): p is BoardPart => p.id === board.id && p.kind === 'board')!
      const owner = next.components.find((c) => c.id === board.parentId)
      if (patch.material !== undefined) {
        if (patch.material !== null && !finishingMaterials(scene).includes(patch.material))
          throw Error('Choose an existing panel material with positive stock thickness.')
        if (owner?.kind === 'drawer') {
          const box = targets.filter((t) => t.board.parentId === owner.id)
          if (
            !owner.driven ||
            box.length !== 5 ||
            box.some((t) => t.locked || input[t.board.id]?.material !== patch.material)
          )
            throw Error('Material changes require a complete driven drawer box with one material.')
          owner.params.material = patch.material ?? ''
        } else if (p.driven && p.role) {
          if (
            owner?.kind === 'faceFrame' &&
            patch.material !== null &&
            scene.materials[patch.material].thickness !== p.thickness
          )
            throw Error(
              'Face-frame board replacements must retain the current thickness; change frame construction for a different thickness.',
            )
          p.overrides = { ...p.overrides }
          if (patch.material === null) delete p.overrides.material
          else p.overrides.material = patch.material
        } else {
          if (patch.material === null)
            throw Error('Manual and linked panels have no inherited material.')
          p.material = patch.material
          if (p.finishing) p.finishing.draft.material = patch.material
          else if (p.runWorktop) p.runWorktop.draft.material = patch.material
          else p.thickness = scene.materials[patch.material].thickness!
        }
      }
      if (patch.grain !== undefined) {
        if (p.driven && p.role) {
          p.overrides = { ...p.overrides }
          if (patch.grain === null) delete p.overrides.grain
          else p.overrides.grain = patch.grain
        } else {
          if (patch.grain === null) throw Error('Manual and linked panels have no inherited grain.')
          p.grain = patch.grain
          if (p.finishing) p.finishing.draft.grain = patch.grain
          if (p.runWorktop) p.runWorktop.draft.grain = patch.grain
        }
      }
      if (p.overrides && !Object.keys(p.overrides).length) delete p.overrides
      if (patch.edges !== undefined) {
        if (p.cuts.some((c) => c.kind === 'mitre'))
          throw Error('Mitred boards do not support rectangular edge treatments.')
        const edges: EdgeDecisions = { ...p.edgeBanding }
        for (const key of EDGE_KEYS) {
          const value = patch.edges[key]
          if (value === undefined) continue
          if (typeof value === 'object' && value !== null) delete edges[key]
          else edges[key] = value
        }
        if (Object.keys(edges).length) p.edgeBanding = edges
        else delete p.edgeBanding
      }
    }
    const drawers = next.components.filter(
      (c): c is DrawerComponent => c.kind === 'drawer' && c.parentId === id,
    )
    const errors = openingLayoutErrors(
      cabinet.params,
      cabinet.params.section.id,
      next.materials,
      next.parts,
      id,
      drawers,
    )
    if (errors.length) throw Error(errors.join('; '))
    next = applyPipeline(next)
    const afterTargets = materialTargets(next, id)
    if (mode === 'materials' && ids.length) {
      for (const door of motionDoors(next, id)) {
        if (cabinet.params.frame === undefined) {
          const issues = motionDoorIssues(next, id, door)
          if (issues.length) throw Error(`${door.label}: ${issues.join('; ')}`)
        }
      }
      const readiness = buildShelfReadiness({
        ...next,
        components: next.components.filter((c) => c.kind !== 'carcase' || c.id === id),
      })[0]
      if (readiness?.shelves.some((s) => !s.generated))
        throw Error('Requested shelf boards could not be generated with the proposed materials.')
    }
    const quantity = (s: Scene) => {
      const map = new Map<string, number>()
      for (const line of carcaseHardware(s))
        if (line.componentId === id) map.set(line.key, (map.get(line.key) ?? 0) + line.qty)
      return map
    }
    const beforeHardware = quantity(scene),
      afterHardware = quantity(next)
    result.hardware = [...new Set([...beforeHardware.keys(), ...afterHardware.keys()])].map(
      (key) => ({ key, before: beforeHardware.get(key) ?? 0, after: afterHardware.get(key) ?? 0 }),
    )

    for (const { board } of targets) {
      if (board.driven && !afterTargets.some((t) => t.board.id === board.id))
        throw Error(`${board.label}: proposed material changes would remove a generated board.`)
    }
    const byId = componentsById(next.components),
      totals = new Map<string, { before: number; after: number }>()
    for (const { board: p } of afterTargets) {
      const board = targets.find((t) => t.board.id === p.id)?.board
      if (
        mode === 'materials' &&
        board?.cuts.some((c) => c.id.startsWith('cups_')) &&
        !p.cuts.some((c) => c.id.startsWith('cups_'))
      )
        throw Error(
          `${p.label}: proposed material thickness removes the supported hinge cup machining.`,
        )
      if (![p.length, p.width, p.thickness].every((n) => Number.isFinite(n) && n > 0))
        throw Error(`${p.label}: resulting board dimensions must be positive.`)
      // Linked recipes can decline and retain old geometry: validate them explicitly before acceptance.
      if (p.finishing) {
        const checked = previewFinishing(next, p.parentId!, p.finishing.draft)
        if (checked.errors.length) throw Error(`${p.label}: ${checked.errors.join('; ')}`)
      }
      if (p.runWorktop) {
        const checked = previewRunWorktop(next, p.runWorktop.draft, p.id)
        if (checked.errors.length) throw Error(`${p.label}: ${checked.errors.join('; ')}`)
      }
      const requested = requestedEdgesOf(p, byId)
      for (const name of Object.values(requested)) {
        if (
          name !== null &&
          (next.materials[name]?.use !== 'edge' ||
            !Number.isFinite(next.materials[name]?.thickness) ||
            next.materials[name].thickness! <= 0)
        )
          throw Error(`${p.label}: edge-band material is missing or invalid.`)
      }
      const effective = edgesOf(p, byId, next.materials),
        cut = cutSizeOf(p, effective, next.materials)
      if (cut.problem) throw Error(`${p.label}: ${cut.problem}`)
      result.rows.push({ id: p.id, label: p.label, before: board ?? null, after: p })
      if (ids.length && (!board || treatmentKey(board) !== treatmentKey(p))) result.changed = true
      for (const key of ['before', 'after'] as const) {
        const part = key === 'before' ? board : p
        if (!part) continue
        const edge =
          key === 'before'
            ? edgesOf(part, componentsById(scene.components), scene.materials)
            : effective
        for (const { material, mm } of bandedEdgeLengths(part, edge)) {
          const total = totals.get(material) ?? { before: 0, after: 0 }
          total[key] += mm
          totals.set(material, total)
        }
      }
    }
    result.totals = [...totals].map(([material, values]) => ({ material, ...values }))
    result.scene = next
  } catch (error) {
    result.errors = [error instanceof Error ? error.message : String(error)]
  }
  return result
}
export function acceptMaterials(scene: Scene, preview: MaterialsPreview): Scene | null {
  if (
    preview.signature !== materialsSignature(scene) ||
    !['materials', 'edges'].includes(preview.mode)
  )
    return null
  const checked = previewMaterials(scene, preview.cabinetId, preview.draft, preview.mode)
  return !checked.errors.length && checked.changed ? checked.scene : null
}
