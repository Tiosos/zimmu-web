import { openingRect, sectionThickness, validateCarcaseParams } from './carcaseRoles'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import { sectionNodes } from './sectionNodes'
import { sectionOpenings } from './sectionInterior'
import { resolveSections } from './sectionTree'
import type { CarcaseComponent, MaterialDef, Part } from './types'

export interface ResolvedCarcase {
  openings: ReturnType<typeof sectionOpenings>
  nodes: ReturnType<typeof sectionNodes>
}

// The whole chain from a cabinet to its openings and to which of its parts each one owns:
// thicknesses, validation, section rectangles, ownership. Stated once because three callers ask
// it — the scene tree, the 3D highlight and the hardware pass — and copies would be free to
// disagree about an opening's membership.
//
// `null` says the cabinet cannot be resolved: `openingRect` reads thicknesses through a resolver
// that is fatal by design, so a cabinet naming a material the scene cannot resolve would throw
// here. What to show instead is the caller's to decide.
export function resolveCarcase(
  component: CarcaseComponent,
  parts: Part[],
  materials: Record<string, MaterialDef>,
): ResolvedCarcase | null {
  // Filtered here rather than by each caller. Section ids and role keys are shared by every cabinet
  // built from one preset — `params` is assigned by reference — so an unfiltered array files
  // another cabinet's `front-<sec>-0` into this cabinet's opening, silently, which is the exact
  // confusion this module exists to prevent.
  const own = parts.filter((p) => p.parentId === component.id)
  const thicknessOf = roleThicknessFor(component.params, materials, overridesOf(own, component.id))
  if (validateCarcaseParams(component.params, thicknessOf).length > 0) return null
  const tree = resolveSections(
    component.params.section,
    openingRect(component.params, thicknessOf),
    sectionThickness(thicknessOf),
  )
  const openings = sectionOpenings(component.params.section, tree)
  return { openings, nodes: sectionNodes(openings, own) }
}

// Which opening owns which part. The shape two callers already take.
export function carcaseOpenings(
  component: CarcaseComponent,
  parts: Part[],
  materials: Record<string, MaterialDef>,
): ReturnType<typeof sectionNodes> | null {
  return resolveCarcase(component, parts, materials)?.nodes ?? null
}
