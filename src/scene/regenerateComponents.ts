import type {
  BoardPart,
  CarcaseComponent,
  Component,
  ComponentId,
  Joint,
  Part,
  Scene,
} from './types'
import { carcaseCuts, carcaseJoints, carcaseRoles } from './carcaseRoles'
import { componentsById } from './componentTree'
import { defaultDadoJoint, defaultFingerJoint } from './defaultJoint'
import { PART_COLORS } from './palette'

function regenerateOne(
  component: CarcaseComponent,
  parts: Part[],
  joints: Joint[],
  byId: Map<ComponentId, Component>,
): { parts: Part[]; joints: Joint[] } {
  const roles = carcaseRoles(component.params)
  // Invalid parameters produce no roles. Preserve the last good parts rather than emptying the
  // cabinet mid-keystroke — the same contract deriveJoint has when it returns null.
  if (roles.length === 0) return { parts, joints }

  const mine = parts.filter((p) => p.parentId === component.id)
  const others = parts.filter((p) => p.parentId !== component.id)
  // Built from this component's parts only: a role key is unique per carcase, not per scene.
  const byRole = new Map<string, Part>()
  for (const p of mine) if (p.role !== undefined) byRole.set(p.role, p)
  const wanted = new Set(roles.map((r) => r.role))

  const kept: Part[] = []
  for (const p of mine) {
    if (p.role !== undefined && wanted.has(p.role)) continue // reconciled in the role pass below
    if (p.driven && p.role !== undefined) continue // driven, no longer implied → delete
    // Detached, or never role-bound: the user's. Keep it, and release a role key the params no
    // longer imply so a later regeneration cannot reclaim the part.
    kept.push(p.role === undefined ? p : { ...p, role: undefined })
  }

  const generated: Part[] = roles.map((r, i) => {
    const existing = byRole.get(r.role)
    if (existing !== undefined && !existing.driven) return existing

    const componentCuts = carcaseCuts(component.params, r.role).map((c) => ({
      ...c,
      sourceComponentId: component.id,
    }))
    const existingCuts = existing?.kind === 'board' ? existing.cuts : []

    const board: BoardPart = {
      kind: 'board',
      id: existing?.id ?? `board_${crypto.randomUUID()}`,
      label: existing?.label ?? r.label,
      length: r.panel.length,
      width: r.panel.width,
      thickness: r.panel.thickness,
      material: component.params.material,
      color: existing?.color ?? PART_COLORS[i % PART_COLORS.length],
      position: r.panel.position,
      rotation: r.panel.rotation,
      rotationOrder: r.panel.rotationOrder,
      // Two owners write cuts on the same part and neither may strip the other's. Only
      // component-owned cuts are ours to re-derive; joint-owned cuts belong to reconcileJoints,
      // which runs next and preserves its own last-good state, and unowned cuts are the user's.
      cuts: [
        ...existingCuts.filter((c) => !(c.kind === 'box' && c.sourceComponentId !== undefined)),
        ...componentCuts,
      ],
      visible: existing?.visible ?? true,
      parentId: component.id,
      driven: true,
      role: r.role,
    }
    return board
  })

  // Joints reference part ids, so they are built against the parts this pass just reconciled —
  // and only against boards: a detached part holding a role could be a cylinder.
  const seats = new Map<string, { part: BoardPart; label: string }>()
  generated.forEach((p, i) => {
    if (p.kind === 'board') seats.set(roles[i].role, { part: p, label: roles[i].label })
  })

  const emitted = carcaseJoints(component.params, component.id).flatMap((d): Joint[] => {
    const housing = seats.get(d.housingRole)
    const housed = seats.get(d.housedRole)
    if (housing === undefined || housed === undefined) return []

    // Derived from the component and the role pair, so a regeneration reproduces the same id
    // without looking anything up.
    const id = `joint_${component.id}_${d.housingRole}__${d.housedRole}`
    const kindLabel = d.kind === 'dado' ? 'Dado' : 'Finger joint'
    const label = `${kindLabel} — ${housing.label} / ${housed.label}`
    const joint =
      d.kind === 'dado'
        ? defaultDadoJoint(housing.part, housed.part, d.housingFace, d.housedEnd, id, label, byId)
        : defaultFingerJoint(housing.part, housed.part, d.housingFace, d.housedEnd, id, label)
    return [{ ...joint, sourceComponentId: component.id, driven: true }]
  })

  return {
    parts: [...others, ...kept, ...generated],
    joints: [...joints.filter((j) => j.sourceComponentId !== component.id), ...emitted],
  }
}

// Runs immediately before reconcileJoints: carcases emit driven parts and the joints they imply
// here, reconcileJoints then derives cuts and seats from the joints. Pure and idempotent.
export function regenerateComponents(scene: Scene): Scene {
  const carcases = scene.components.filter((c) => c.kind === 'carcase')
  if (carcases.length === 0) return scene

  const byId = componentsById(scene.components)
  let parts = scene.parts
  let joints = scene.joints
  for (const c of carcases) {
    const next = regenerateOne(c, parts, joints, byId)
    parts = next.parts
    joints = next.joints
  }
  return parts === scene.parts && joints === scene.joints ? scene : { ...scene, parts, joints }
}
