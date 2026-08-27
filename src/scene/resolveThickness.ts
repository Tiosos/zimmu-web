import type { MaterialDef } from './types'

export interface PartOverrides {
  thickness?: number
  material?: string
}

export interface MaterialSlots {
  carcaseMaterial: string
  backMaterial: string
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
    const name = own?.material ?? (role === 'back' ? slots.backMaterial : slots.carcaseMaterial)
    const thickness = materials[name]?.thickness
    // Deliberately fatal. A zero here would collapse every panel the layout derives from it, and
    // the symptom would appear nowhere near the cause.
    if (thickness === undefined) throw new Error(`zimmu: material "${name}" has no thickness`)
    return thickness
  }
}
