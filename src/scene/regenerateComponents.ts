import type { BoardPart, CarcaseComponent, Part, Scene } from './types'
import { carcaseRoles } from './carcaseRoles'
import { PART_COLORS } from './palette'

function regenerateOne(component: CarcaseComponent, parts: Part[]): Part[] {
  const roles = carcaseRoles(component.params)
  // Invalid parameters produce no roles. Preserve the last good parts rather than emptying the
  // cabinet mid-keystroke — the same contract deriveJoint has when it returns null.
  if (roles.length === 0) return parts

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
      // Joint-derived cuts belong to reconcileJoints, which runs next and preserves its own
      // last-good state; dropping them here would defeat that.
      cuts: existing?.kind === 'board' ? existing.cuts : [],
      visible: existing?.visible ?? true,
      parentId: component.id,
      driven: true,
      role: r.role,
    }
    return board
  })

  return [...others, ...kept, ...generated]
}

// Runs immediately before reconcileJoints: carcases emit driven parts here, reconcileJoints then
// derives cuts and seats from the joints. Pure and idempotent.
export function regenerateComponents(scene: Scene): Scene {
  const carcases = scene.components.filter((c) => c.kind === 'carcase')
  if (carcases.length === 0) return scene

  let parts = scene.parts
  for (const c of carcases) parts = regenerateOne(c, parts)
  return parts === scene.parts ? scene : { ...scene, parts }
}
