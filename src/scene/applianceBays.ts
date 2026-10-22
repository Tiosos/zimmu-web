import { frameLeafKey } from './faceFrame'
import type { CarcaseComponent, Scene, Vec3 } from './types'
import { applianceBayError, applianceBaysError, type ApplianceBay } from './applianceRecipe'
import { resolveCarcase } from './carcaseOpenings'
import { clearDepth, frontGeometryOf, usableInteriorRect } from './carcaseLayout'
import { frontCells, frontRoleOf } from './frontCells'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import { componentsById } from './componentTree'
import { cabinetSpaceBox } from '../geom/assembly'
import { materialTargets } from './cabinetMaterials'
import { productionLimitIssue } from './readinessLimits'
export interface FitBox {
  min: Vec3
  max: Vec3
}
export const applianceSignature = (scene: Scene): string => JSON.stringify(scene)
function cabinetOf(scene: Scene, id: string): CarcaseComponent {
  const c = scene.components.find((c) => c.id === id)
  if (c?.kind !== 'carcase') throw Error('The appliance cabinet is no longer available.')
  const error = productionLimitIssue(c)
  if (error) throw Error(error)
  return c
}
export function applianceOpenings(scene: Scene, id: string) {
  const c = cabinetOf(scene, id),
    resolved = resolveCarcase(c, scene.parts, scene.materials)
  if (!resolved) throw Error('The cabinet openings cannot be resolved.')
  const geometry = frontGeometryOf(c.params, resolved.tree),
    thickness = roleThicknessFor(c.params, scene.materials, overridesOf(scene.parts, id))
  const openings = geometry.frameAccessOpenings
    ? [...geometry.frameAccessOpenings.values()]
    : resolved.openings.map((o) => ({ id: o.sectionId, sectionId: o.sectionId, rect: o.rect }))
  const cells = frontCells(c.params.section, resolved.tree, geometry)
  return openings.map((o, i) => {
    const structural = resolved.openings.find((s) => s.sectionId === o.sectionId)!
    const rect = usableInteriorRect(structural.rect, o.rect)
    const matching = cells.filter(
      (cell) => cell.openingId === o.id || frameLeafKey(cell.openingId, cell.leaf) === o.id,
    )
    const y0 =
      c.params.frontMount === 'inset' && matching.length
        ? Math.max(...matching.map((cell) => thickness(frontRoleOf(cell))))
        : 0
    const y1 = clearDepth(c.params, c.params.backMode === 'none' ? 0 : thickness('back'))
    return {
      id: o.id,
      number: i + 1,
      box: { min: { x: rect.x0, y: y0, z: rect.z0 }, max: { x: rect.x1, y: y1, z: rect.z1 } },
    }
  })
}
export function boxesOverlap(a: FitBox, b: FitBox, gap = 0): boolean {
  return (['x', 'y', 'z'] as const).every(
    (axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > -gap + 1e-6,
  )
}
export interface ResolvedAppliance {
  bay: ApplianceBay
  body: FitBox | null
  envelope: FitBox | null
  opening: FitBox | null
  required: Vec3 | null
  available: Vec3 | null
  errors: string[]
  issues: string[]
}
function resolvePosition(scene: Scene, bay: ApplianceBay): ResolvedAppliance {
  const result: ResolvedAppliance = {
    bay: structuredClone(bay),
    body: null,
    envelope: null,
    opening: null,
    required: null,
    available: null,
    errors: [],
    issues: [],
  }
  try {
    const error = applianceBayError(bay)
    if (error) throw Error(error)
    const opening = applianceOpenings(scene, bay.cabinetId).find((o) => o.id === bay.openingId)?.box
    if (!opening) throw Error('The saved appliance opening is no longer available.')
    const required = {
      x: bay.left + bay.width + bay.right,
      y: bay.depth + bay.rear,
      z: bay.bottom + bay.height + bay.top,
    }
    const available = {
      x: opening.max.x - opening.min.x,
      y: opening.max.y - opening.min.y,
      z: opening.max.z - opening.min.z,
    }
    const x =
      bay.alignment === 'left'
        ? opening.min.x + bay.offset
        : bay.alignment === 'right'
          ? opening.max.x - required.x - bay.offset
          : (opening.min.x + opening.max.x - required.x) / 2 + bay.offset
    const min = { x, y: opening.min.y + bay.recess, z: opening.min.z + bay.elevation }
    const envelope = {
      min,
      max: { x: min.x + required.x, y: min.y + required.y, z: min.z + required.z },
    }
    const bodyMin = { x: min.x + bay.left, y: min.y, z: min.z + bay.bottom }
    const body = {
      min: bodyMin,
      max: { x: bodyMin.x + bay.width, y: bodyMin.y + bay.depth, z: bodyMin.z + bay.height },
    }
    if (envelope.min.x < opening.min.x - 1e-6 || envelope.max.x > opening.max.x + 1e-6)
      result.issues.push('Required width or horizontal position exceeds the physical opening.')
    if (envelope.min.z < opening.min.z - 1e-6 || envelope.max.z > opening.max.z + 1e-6)
      result.issues.push('Required height or elevation exceeds the physical opening.')
    if (envelope.max.y > opening.max.y + 1e-6)
      result.issues.push('Required depth and rear clearance exceed the usable cabinet depth.')
    Object.assign(result, { body, envelope, opening, required, available })
  } catch (e) {
    result.errors = [e instanceof Error ? e.message : String(e)]
  }
  return result
}
export function resolveAppliance(scene: Scene, bay: ApplianceBay): ResolvedAppliance {
  const result = resolvePosition(scene, bay)
  if (!result.envelope || result.errors.length) return result
  const c = cabinetOf(scene, bay.cabinetId),
    byId = componentsById(scene.components)
  for (const { board } of materialTargets(scene, c.id)) {
    const box = cabinetSpaceBox(board, byId, c)
    if (boxesOverlap(result.envelope, box))
      result.issues.push(
        `Reserved space intersects ${board.label}${box.axisAligned ? '' : ' (conservative rotated bounds)'}.`,
      )
  }
  for (const sibling of scene.applianceBays ?? []) {
    if (sibling.id === bay.id || sibling.cabinetId !== bay.cabinetId) continue
    const resolved = resolvePosition(scene, sibling)
    if (resolved.envelope && boxesOverlap(result.envelope, resolved.envelope))
      result.issues.push(`Reserved space intersects appliance bay ${sibling.label}.`)
  }
  return result
}
export interface AppliancePreview {
  signature: string
  cabinetId: string
  bay: ApplianceBay
  action: 'save' | 'delete'
  resolved: ResolvedAppliance | null
  errors: string[]
  changed: boolean
}
export function previewAppliance(
  scene: Scene,
  bay: ApplianceBay,
  action: 'save' | 'delete' = 'save',
): AppliancePreview {
  const result: AppliancePreview = {
    signature: applianceSignature(scene),
    cabinetId: bay.cabinetId,
    bay: structuredClone(bay),
    action,
    resolved: null,
    errors: [],
    changed: false,
  }
  try {
    if (!['save', 'delete'].includes(action)) throw Error('Choose save or delete.')
    const listError = applianceBaysError(scene.applianceBays)
    if (listError) throw Error(listError)
    const old = scene.applianceBays?.find((b) => b.id === bay.id)
    if (old && old.cabinetId !== bay.cabinetId)
      throw Error('A bay ID already belongs to another cabinet.')
    if (action === 'delete') {
      if (!old) throw Error('The saved appliance bay no longer exists.')
      result.changed = true
      return result
    }
    const resolved = resolveAppliance(scene, bay)
    if (resolved.errors.length) throw Error(resolved.errors.join('; '))
    if (!old && (scene.applianceBays?.length ?? 0) >= 500)
      throw Error('Use at most 500 appliance bays.')
    result.resolved = resolved
    result.changed = JSON.stringify(old) !== JSON.stringify(bay)
  } catch (e) {
    result.errors = [e instanceof Error ? e.message : String(e)]
  }
  return result
}
export function acceptAppliance(scene: Scene, p: AppliancePreview): Scene | null {
  if (p.signature !== applianceSignature(scene) || p.cabinetId !== p.bay.cabinetId) return null
  const checked = previewAppliance(scene, p.bay, p.action)
  if (checked.errors.length || !checked.changed) return null
  const bays = scene.applianceBays ?? []
  const next =
    p.action === 'delete'
      ? bays.filter((b) => b.id !== p.bay.id)
      : bays.some((b) => b.id === p.bay.id)
        ? bays.map((b) => (b.id === p.bay.id ? structuredClone(p.bay) : b))
        : [...bays, structuredClone(p.bay)]
  const result: Scene = { ...scene, applianceBays: next }
  if (!next.length) delete result.applianceBays
  return result
}
export function copyAppliance(scene: Scene, sourceId: string, target: ApplianceBay): ApplianceBay {
  const source = scene.applianceBays?.find((b) => b.id === sourceId)
  if (!source) throw Error('Choose an existing source bay.')
  const next = {
    ...structuredClone(source),
    id: target.id,
    cabinetId: target.cabinetId,
    openingId: target.openingId,
    label: `${source.label} copy`,
  }
  const resolved = resolvePosition(scene, next)
  if (resolved.errors.length || resolved.issues.length)
    throw Error('The target opening cannot fit the copied specifications.')
  return next
}
