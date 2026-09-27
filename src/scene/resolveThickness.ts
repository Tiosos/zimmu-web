import type { ComponentId, MaterialDef, Part } from './types'

export interface PartOverrides {
  thickness?: number
  material?: string
}

export interface MaterialSlots {
  carcaseMaterial: string
  backMaterial: string
  frontMaterial: string
  frameMaterial: string
}

export type RoleThickness = (role: string) => number

// The one statement of where a panel's thickness comes from: its own explicit override, else its
// own material, else the slot its role belongs to. Stated once because four callers need it and a
// second copy would drift — the same argument grainFieldFor makes for the grain table.
//
// Read *before* the layout resolves boxes, never applied after: a 25 mm override on a side is what
// makes the bottom come out at `W − 50`, so the layout has to see it. That keeps the generator a
// function in one direction — overrides in, boxes out — and an override must never depend on a
// generated dimension.
export function roleThicknessFor(
  slots: MaterialSlots,
  materials: Record<string, MaterialDef>,
  overrides: Map<string, PartOverrides>,
): RoleThickness {
  return (role) => {
    const own = overrides.get(role)
    if (own?.thickness !== undefined) return own.thickness
    const name = materialForRole(slots, overrides, role)
    const thickness = materials[name]?.thickness
    // Deliberately fatal. A zero here would collapse every panel the layout derives from it, and
    // the symptom would appear nowhere near the cause.
    if (thickness === undefined) throw new Error(`zimmu: material "${name}" has no thickness`)
    return thickness
  }
}

// Which material a role is made of: its own override, else the slot its role belongs to. The one
// place the four slots are told apart — the thickness rule above reads it, and so does the
// regeneration that writes the name onto the part.
export function materialForRole(
  slots: MaterialSlots,
  overrides: Map<string, PartOverrides>,
  role: string,
): string {
  const own = overrides.get(role)?.material
  if (own !== undefined) return own
  if (role === 'back') return slots.backMaterial
  // A family, not a name: a front's role carries the section it covers and which leaf it is.
  if (role.startsWith('front-')) return slots.frontMaterial
  // Families for the same reason: stage 2's mid members carry an index, and must resolve here
  // without a new entry.
  if (role.startsWith('stile-') || role.startsWith('rail-')) return slots.frameMaterial
  return slots.carcaseMaterial
}

// The overrides a component's own parts carry, keyed by role. Both the generator and anything that
// re-derives a carcase's layout have to resolve against the same map, so it is read out of the
// parts in one place rather than assembled at each call site.
export function overridesOf(parts: Part[], componentId: ComponentId): Map<string, PartOverrides> {
  const overrides = new Map<string, PartOverrides>()
  for (const p of parts) {
    if (p.kind !== 'board' || p.parentId !== componentId) continue
    if (p.role !== undefined && p.overrides !== undefined) overrides.set(p.role, p.overrides)
  }
  return overrides
}
