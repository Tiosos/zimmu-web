import { cabinetSpaceBox } from '../geom/assembly'
import type { CarcaseComponent, Scene, Joint } from './types'
import type { ProjectStructure } from './projectStructure'
import { defaultSlopedTop, slopedTopError, slopeMetrics, type SlopedTop } from './slopedTopRecipe'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import { validateCarcaseParams, openingRect } from './carcaseRoles'
import { applyPipeline } from './pipeline'
import { resolveWorldMatrix } from '../geom/transform'
export interface SlopeDraft {
  cabinetId: string
  enabled: boolean
  first: number
  second: number
  profile: SlopedTop
}
export const slopeSignature = (scene: Scene, project: ProjectStructure) =>
  JSON.stringify([scene, project])
export function defaultSlopeDraft(scene: Scene, cabinetId: string): SlopeDraft {
  const c = scene.components.find(
      (c): c is CarcaseComponent => c.kind === 'carcase' && c.id === cabinetId,
    ),
    profile = structuredClone(c?.params.slopedTop ?? defaultSlopedTop()),
    p = c?.params,
    m = p ? slopeMetrics({ ...p, slopedTop: profile }) : null
  return {
    cabinetId,
    enabled: !!p?.slopedTop,
    first: m?.start ?? 720,
    second: m?.end ?? 520,
    profile,
  }
}
export function slopeCompatibility(scene: Scene, id: string): string[] {
  const c = scene.components.find((c): c is CarcaseComponent => c.kind === 'carcase' && c.id === id)
  if (!c) return ['Choose an existing cabinet.']
  const issues: string[] = [],
    parts = scene.parts.filter((p) => p.parentId === id),
    matrix = resolveWorldMatrix(c, new Map(scene.components.map((c) => [c.id, c])))
  if (
    Math.abs(matrix[2]) > 0.00001 ||
    Math.abs(matrix[6]) > 0.00001 ||
    Math.abs(matrix[10] - 1) > 0.00001
  )
    issues.push('Sloped cabinets must be upright; rotation around the room is supported.')
  if (c.catalogue)
    issues.push('Detach the catalogue product rules before changing its construction.')
  if (parts.some((p) => p.role && !p.driven))
    issues.push('Detached cabinet roles are incompatible; restore or remove them first.')
  if (
    parts.some(
      (p) =>
        p.role !== undefined &&
        (p.cuts.some(
          (c) =>
            !('sourceComponentId' in c && c.sourceComponentId === id) &&
            !('sourceJointId' in c && c.sourceJointId),
        ) ||
          (p.kind === 'board' && p.operations?.some((op) => op.sourceComponentId !== id))),
    )
  )
    issues.push(
      'Manual panel machining must be removed or detached before changing slope geometry.',
    )
  if (
    parts.some(
      (p) =>
        p.kind === 'board' &&
        (p.hingeLayout ||
          p.serviceMachining ||
          p.frontPull ||
          p.finishing ||
          p.runWorktop ||
          p.wallFiller ||
          p.cornerPanel),
    )
  )
    issues.push(
      'Panel hardware or linked finishing recipes depend on this cabinet. Remove those dependencies first.',
    )
  const partIds = new Set(parts.map((p) => p.id))
  const references = (j: Joint): string[] => {
    switch (j.kind) {
      case 'dado':
        return [j.housingPartId, j.housedPartId]
      case 'halflap':
      case 'finger':
        return [j.partAId, j.partBId]
      case 'mortise-tenon':
        return [j.mortisePartId, j.tenonPartId]
      case 'tongue-groove':
        return [j.groovePartId, j.tonguePartId]
      case 'screw':
        return [j.throughPartId, j.receivingPartId]
    }
  }
  if (
    scene.joints.some((j) =>
      j.sourceComponentId === id ? !j.driven : references(j).some((pid) => partIds.has(pid)),
    )
  )
    issues.push('User-owned joints are incompatible with changing roof geometry.')
  if (scene.components.some((x) => x.kind === 'drawer' && x.parentId === id))
    issues.push('Drawer hardware is unsupported in open sloped cabinets.')
  if (
    scene.parts.some(
      (p) =>
        p.kind === 'board' &&
        (p.runWorktop?.draft.memberIds.includes(id) ||
          p.wallFiller?.draft.cabinetId === id ||
          p.cornerPanel?.draft.legs.some((l) => l.run.memberIds.includes(id))),
    ) ||
    scene.applianceBays?.some((b) => b.cabinetId === id) ||
    scene.installations?.some((r) => r.draft.memberIds.includes(id)) ||
    scene.grainMatches?.some((g) => g.draft.memberIds.some((pid) => partIds.has(pid)))
  )
    issues.push(
      'Linked installation, appliance or finishing geometry must be detached before changing this cabinet.',
    )

  return issues
}
export interface SlopePreview {
  signature: string
  draft: SlopeDraft
  scene: Scene | null
  errors: string[]
  warnings: string[]
  changed: boolean
  openingHeight: number
}
export function previewSlope(
  scene: Scene,
  project: ProjectStructure,
  draft: SlopeDraft,
): SlopePreview {
  const out: SlopePreview = {
    signature: slopeSignature(scene, project),
    draft: structuredClone(draft),
    scene: null,
    errors: [],
    warnings: [],
    changed: false,
    openingHeight: 0,
  }
  try {
    const c = scene.components.find(
      (c): c is CarcaseComponent => c.kind === 'carcase' && c.id === draft.cabinetId,
    )
    if (!c) throw Error('Choose an existing cabinet.')
    if (typeof draft.enabled !== 'boolean') throw Error('Choose whether to enable the sloped top.')
    const issues = slopeCompatibility(scene, c.id)
    if (issues.length) throw Error(issues.join(' '))
    const p = { ...c.params }
    if (draft.enabled) {
      const error = slopedTopError(draft.profile)
      if (error) throw Error(error)
      if (![draft.first, draft.second].every((n) => Number.isFinite(n) && n > 0 && n <= 100000))
        throw Error('End heights must be positive finite numbers up to 100000 mm.')
      p.height = Math.max(draft.first, draft.second)
      p.slopedTop = {
        ...draft.profile,
        drop: Math.abs(draft.second - draft.first),
        highEnd: draft.second > draft.first ? 'end' : 'start',
      }
    } else delete p.slopedTop
    const thickness = roleThicknessFor(p, scene.materials, overridesOf(scene.parts, c.id)),
      errors = validateCarcaseParams(p, thickness)
    if (errors.length) throw Error(errors.join(' '))
    const rect = openingRect(p, thickness)
    out.openingHeight = rect.z1 - rect.z0
    out.scene = applyPipeline({
      ...scene,
      components: scene.components.map((x) => (x.id === c.id ? { ...c, params: p } : x)),
    })
    if (slopeShelfClearances(out.scene, c.id).some((s) => s.headroom < -0.00001))
      throw Error('A horizontal shelf intersects the sloped roof.')
    out.changed = JSON.stringify(c.params) !== JSON.stringify(p)
    if (draft.enabled)
      out.warnings.push(
        'Automatic cabinet joints are omitted. Workshop joinery and fixing must be designed separately.',
        'Openings and shelves use a conservative rectangle below the lowest roof underside.',
        'Mitred edges have no automatic edgebanding quantities. Review shaped-edge treatment separately.',
        'Sloped panels reserve rectangular stock bounds in nesting; drawings and geometry retain their profiles.',
      )
  } catch (e) {
    out.errors.push(e instanceof Error ? e.message : String(e))
  }
  return out
}
export function acceptSlope(
  scene: Scene,
  project: ProjectStructure,
  preview: SlopePreview,
): Scene | null {
  if (preview.signature !== slopeSignature(scene, project)) return null
  const checked = previewSlope(scene, project, preview.draft)
  return checked.changed && checked.scene && !checked.errors.length ? checked.scene : null
}

export function slopeShelfClearances(
  scene: Scene,
  id: string,
): { id: string; label: string; headroom: number }[] {
  const c = scene.components.find((c): c is CarcaseComponent => c.kind === 'carcase' && c.id === id)
  if (!c?.params.slopedTop) return []
  const t = roleThicknessFor(c.params, scene.materials, overridesOf(scene.parts, id))('top'),
    m = slopeMetrics(c.params),
    byId = new Map(scene.components.map((c) => [c.id, c]))
  return scene.parts
    .filter(
      (p): p is import('./types').BoardPart =>
        p.kind === 'board' &&
        p.parentId === id &&
        !!p.role &&
        (p.role.startsWith('fixed-shelf-') ||
          p.role.startsWith('adj-shelf-') ||
          p.role.startsWith('division-')) &&
        Math.abs(p.rotation.x) < 0.00001 &&
        Math.abs(p.rotation.y) < 0.00001,
    )
    .map((p) => {
      const b = cabinetSpaceBox(p, byId, c),
        headroom = Math.min(...b.corners.map((v) => m.roof(v.x, v.y) - t / m.c - v.z))
      return { id: p.id, label: p.label, headroom }
    })
}
