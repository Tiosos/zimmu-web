import type { BoardPart, CutDef, Scene, Vec3 } from './types'
import { serviceMachiningError, type ServiceMachining, type ServiceFeature } from './serviceRecipe'
import { resolveWorktopFeatures } from './worktopMachining'
import { applianceSignature, boxesOverlap, resolveAppliance, type FitBox } from './applianceBays'
import { materialTargets } from './cabinetMaterials'
import { faceAxes } from './snapMath'
import { applyPipeline } from './pipeline'
export const serviceCutId = (id: string, index: number) => `sm_${encodeURIComponent(id)}_${index}`
function ownedIds(recipe?: ServiceMachining): Set<string> {
  if (!recipe || serviceMachiningError(recipe)) return new Set()
  return new Set(
    recipe.features.flatMap((f) =>
      Array.from({ length: f.count }, (_, i) => serviceCutId(f.id, i)),
    ),
  )
}
export const serviceCutOwned = (p: BoardPart, id: string): boolean =>
  ownedIds(p.serviceMachining).has(id)
export interface ResolvedService {
  feature: ServiceFeature
  index: number
  x: number
  y: number
  length: number
  width: number
  depth: number
  cut: CutDef
  box: FitBox
}
function cutBoxes(cut: CutDef): FitBox[] {
  if (cut.kind === 'mitre') throw Error('Mitred panels require a separate machining assessment.')
  if (cut.kind === 'box') {
    if (
      ![...Object.values(cut.position), ...Object.values(cut.size)].every(Number.isFinite) ||
      Object.values(cut.size).some((n) => n <= 0)
    )
      throw Error('Existing machining has invalid dimensions.')
    return [
      {
        min: { ...cut.position },
        max: {
          x: cut.position.x + cut.size.x,
          y: cut.position.y + cut.size.y,
          z: cut.position.z + cut.size.z,
        },
      },
    ]
  }
  if (
    !Number.isSafeInteger(cut.count) ||
    cut.count < 1 ||
    cut.count > 5000 ||
    !Number.isFinite(cut.pitch) ||
    !Number.isFinite(cut.depth) ||
    !Number.isFinite(cut.diameter) ||
    cut.depth <= 0 ||
    cut.diameter <= 0 ||
    cut.pitch < 0 ||
    (cut.count > 1 && cut.pitch === 0) ||
    !Object.values(cut.start).every(Number.isFinite)
  )
    throw Error('Existing drilling cannot be assessed within supported bounds.')
  const axes = faceAxes(cut.face),
    run = cut.axis === 'U' ? axes.u : axes.v
  return Array.from({ length: cut.count }, (_, i) => {
    const min: Vec3 = { ...cut.start },
      max: Vec3 = { ...cut.start }
    min[run] += i * cut.pitch
    max[run] += i * cut.pitch
    for (const axis of [axes.u, axes.v]) {
      min[axis] -= cut.diameter / 2
      max[axis] += cut.diameter / 2
    }
    if (cut.face.startsWith('+')) min[axes.depth] -= cut.depth
    else max[axes.depth] += cut.depth
    return { min, max }
  })
}
export function resolveServices(
  scene: Scene,
  part: BoardPart,
  recipe: ServiceMachining,
): ResolvedService[] {
  const error = serviceMachiningError(recipe)
  if (error) throw Error(error)
  if (!recipe.features.length) return []
  const rows: ResolvedService[] = []
  // Reuse the same broad-face feature resolver without changing the worktop ownership contract.
  const proxy: BoardPart = {
    ...part,
    driven: false,
    role: undefined,
    finishing: undefined,
    runWorktop: undefined,
    cornerPanel: undefined,
    wallFiller: undefined,
    frontPull: undefined,
  }
  for (const f of recipe.features) {
    if (f.bayId) {
      const bay = scene.applianceBays?.find((b) => b.id === f.bayId)
      if (!bay) throw Error(`${f.label}: associated appliance bay no longer exists.`)
      if (!materialTargets(scene, bay.cabinetId).some((t) => t.board.id === part.id))
        throw Error('The associated bay must belong to this panel’s cabinet or run.')
      const resolved = resolveAppliance(scene, bay)
      if (resolved.errors.length)
        throw Error(`${f.label}: associated appliance opening cannot be resolved.`)
    }
    const first = resolveWorktopFeatures(proxy, { version: 1, features: [f] })[0]
    if (first.errors.length) throw Error(`${f.label}: ${first.errors.join('; ')}`)
    for (let i = 0; i < f.count; i++) {
      const x = first.x + (f.axis === 'x' ? i * f.pitch : 0),
        y = first.y + (f.axis === 'y' ? i * f.pitch : 0)
      const row = resolveWorktopFeatures(proxy, {
        version: 1,
        features: [{ ...f, xRef: 'left', yRef: 'front', x, y }],
      })[0]
      if (row.errors.length || !row.cut) throw Error(`${f.label}: ${row.errors.join('; ')}`)
      if (row.cut.kind === 'mitre') throw Error('Unsupported service cut geometry.')
      const cut: CutDef = { ...row.cut, id: serviceCutId(f.id, i), face: f.face }
      if (cut.kind === 'box' && f.face === '-Z') cut.position = { ...cut.position, z: 0 }
      if (cut.kind === 'hole-array' && f.face === '-Z') cut.start = { ...cut.start, z: 0 }
      rows.push({
        feature: { ...f },
        index: i,
        x,
        y,
        length: row.length,
        width: row.width,
        depth: row.depth,
        cut,
        box: cutBoxes(cut)[0],
      })
    }
  }
  const old = ownedIds(part.serviceMachining),
    ids = new Set(rows.map((r) => r.cut.id))
  if (
    part.cuts.some(
      (c) =>
        ids.has(c.id) &&
        (!old.has(c.id) ||
          ('sourceComponentId' in c && c.sourceComponentId !== undefined) ||
          ('sourceJointId' in c && c.sourceJointId !== undefined)),
    )
  )
    throw Error('A service cut ID conflicts with unrelated machining.')
  const otherCuts = part.cuts.filter((c) => !old.has(c.id))
  if (otherCuts.reduce((n, c) => n + (c.kind === 'hole-array' ? c.count : 1), 0) > 5000)
    throw Error('Existing machining exceeds the supported assessment limit.')
  const others = otherCuts.flatMap(cutBoxes)
  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]
    for (const b of rows.slice(i + 1))
      if (boxesOverlap(a.box, b.box, Math.max(a.feature.web, b.feature.web)))
        throw Error('Service openings overlap or violate minimum material between cuts.')
    if (others.some((b) => boxesOverlap(a.box, b, a.feature.web)))
      throw Error(
        `${a.feature.label}: service opening conflicts with existing machining or its minimum web.`,
      )
  }
  const removed = rows.reduce(
    (n, r) =>
      n +
      (r.feature.shape === 'circle' ? Math.PI * (r.length / 2) ** 2 : r.length * r.width) * r.depth,
    0,
  )
  if (
    rows.length &&
    (!Number.isFinite(removed) || removed >= part.length * part.width * part.thickness - 1e-6)
  )
    throw Error('Service machining must leave positive panel material.')
  return rows
}
function rebuild(part: BoardPart, recipe: ServiceMachining, rows: ResolvedService[]): BoardPart {
  const old = ownedIds(part.serviceMachining)
  return {
    ...part,
    serviceMachining: recipe.features.length ? structuredClone(recipe) : undefined,
    cuts: [...part.cuts.filter((c) => !old.has(c.id)), ...rows.map((r) => r.cut)],
  }
}
export function serviceIssues(scene: Scene, part: BoardPart): string[] {
  if (!part.serviceMachining) return []
  try {
    resolveServices(scene, part, part.serviceMachining)
    return []
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)]
  }
}
export function regenerateServices(scene: Scene): Scene {
  return {
    ...scene,
    parts: scene.parts.map((p) => {
      if (p.kind !== 'board' || !p.serviceMachining) return p
      try {
        return rebuild(p, p.serviceMachining, resolveServices(scene, p, p.serviceMachining))
      } catch {
        return p
      }
    }),
  }
}
export interface ServicePreview {
  signature: string
  cabinetId: string
  targetId: string
  recipe: ServiceMachining
  scene: Scene | null
  rows: ResolvedService[]
  errors: string[]
  changed: boolean
}
export function previewService(
  scene: Scene,
  cabinetId: string,
  targetId: string,
  recipe: ServiceMachining,
): ServicePreview {
  const p: ServicePreview = {
    signature: applianceSignature(scene),
    cabinetId,
    targetId,
    recipe: structuredClone(recipe),
    scene: null,
    rows: [],
    errors: [],
    changed: false,
  }
  try {
    const part = materialTargets(scene, cabinetId).find((t) => t.board.id === targetId)?.board
    if (!part) throw Error('Choose an available cabinet panel.')
    p.rows = resolveServices(scene, part, recipe)
    const candidate = rebuild(part, recipe, p.rows)
    const next = applyPipeline({
      ...scene,
      parts: scene.parts.map((b) => (b.id === targetId ? candidate : b)),
    })
    const actual = next.parts.find((b): b is BoardPart => b.id === targetId && b.kind === 'board')
    if (!actual) throw Error('The panel was not retained by regeneration.')
    const errors = serviceIssues(next, actual)
    if (errors.length) throw Error(errors.join('; '))
    if (
      JSON.stringify(actual.serviceMachining ?? { version: 1, features: [] }) !==
      JSON.stringify(recipe.features.length ? recipe : { version: 1, features: [] })
    )
      throw Error('The panel generator did not retain its service recipe.')
    p.rows = recipe.features.length ? resolveServices(next, actual, recipe) : []
    p.scene = next
    p.changed =
      JSON.stringify(part.serviceMachining ?? { version: 1, features: [] }) !==
        JSON.stringify(actual.serviceMachining ?? { version: 1, features: [] }) ||
      JSON.stringify(part.cuts) !== JSON.stringify(actual.cuts)
  } catch (e) {
    p.errors = [e instanceof Error ? e.message : String(e)]
  }
  return p
}
export function acceptService(scene: Scene, p: ServicePreview): Scene | null {
  if (p.signature !== applianceSignature(scene)) return null
  const checked = previewService(scene, p.cabinetId, p.targetId, p.recipe)
  return !checked.errors.length && checked.changed ? checked.scene : null
}
