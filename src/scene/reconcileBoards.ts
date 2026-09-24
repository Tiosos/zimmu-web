import type { BoardPart, ComponentId, CutDef, Grain, Part } from './types'
import type { PanelSpec } from './carcaseRoles'
import { PART_COLORS } from './palette'

// A board a component-emitting pass wants to exist, keyed by the role that names it.
export interface GeneratedBoard {
  role: string
  label: string
  panel: PanelSpec
  grain: Grain
  // Not `BoxCut[]`: an undermount back carries a hole array rather than a box cut.
  cuts: CutDef[]
}

// Reconciles one component's boards against what it now wants, by role key. Shared by every pass
// that emits a component's boards — the drawer box and the face frame — because the preservation
// rules are the part that must not drift: a detached board is the user's, a driven one whose role
// is gone is deleted, and a released role cannot be reclaimed. A second copy of those rules is how
// a detached stile comes to be deleted while a detached drawer side survives.
export function reconcileBoards(
  parts: Part[],
  owner: { id: ComponentId },
  wanted: GeneratedBoard[],
  material: string,
): Part[] {
  const mine = parts.filter((p) => p.parentId === owner.id)
  const others = parts.filter((p) => p.parentId !== owner.id)
  const byRole = new Map<string, Part>()
  for (const p of mine) if (p.role !== undefined) byRole.set(p.role, p)

  const roles = new Set<string>(wanted.map((b) => b.role))
  const kept: Part[] = []
  for (const p of mine) {
    if (p.role !== undefined && roles.has(p.role)) continue // reconciled in the role pass below
    if (p.driven && p.role !== undefined) continue // driven, no longer implied → delete
    // Detached, or never role-bound: the user's. Keep it, and release a role key the owner no
    // longer implies so a later regeneration cannot reclaim the part.
    kept.push(p.role === undefined ? p : { ...p, role: undefined })
  }

  const generated: Part[] = wanted.map((b, i) => {
    const existing = byRole.get(b.role)
    if (existing !== undefined && !existing.driven) return existing

    const own = b.cuts.map((c) => ({ ...c, sourceComponentId: owner.id }))
    const existingCuts: CutDef[] = existing?.kind === 'board' ? existing.cuts : []
    const board: BoardPart = {
      kind: 'board',
      id: existing?.id ?? `board_${crypto.randomUUID()}`,
      label: existing?.label ?? b.label,
      length: b.panel.length,
      width: b.panel.width,
      thickness: b.panel.thickness,
      grain: b.grain,
      material,
      color: existing?.color ?? PART_COLORS[i % PART_COLORS.length],
      position: b.panel.position,
      rotation: b.panel.rotation,
      rotationOrder: b.panel.rotationOrder,
      // Only the owner's own cuts are the owner's to re-derive. A joint-owned cut belongs to
      // reconcileJoints and an untagged one to the user, exactly as on a carcase panel.
      cuts: [
        ...existingCuts.filter(
          (c) => !('sourceComponentId' in c && c.sourceComponentId !== undefined),
        ),
        ...own,
      ],
      visible: existing?.visible ?? true,
      parentId: owner.id,
      driven: true,
      role: b.role,
    }
    return board
  })

  return [...others, ...kept, ...generated]
}
