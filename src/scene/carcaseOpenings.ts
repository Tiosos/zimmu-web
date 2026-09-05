import { openingRect, sectionThickness, validateCarcaseParams } from './carcaseRoles'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import { sectionNodes } from './sectionNodes'
import { sectionOpenings } from './sectionInterior'
import { resolveSections } from './sectionTree'
import type { CarcaseComponent, MaterialDef, Part } from './types'

// The whole chain from a cabinet to which of its openings owns which of its parts: thicknesses,
// validation, section rectangles, ownership. Stated once because the scene tree and the 3D
// highlight both ask it, and two copies would be free to disagree about an opening's membership.
//
// `null` says the cabinet cannot be resolved: `openingRect` reads thicknesses through a resolver
// that is fatal by design, so a cabinet naming a material the scene cannot resolve would throw
// here. What to show instead is the caller's to decide.
export function carcaseOpenings(
  component: CarcaseComponent,
  parts: Part[],
  materials: Record<string, MaterialDef>,
): ReturnType<typeof sectionNodes> | null {
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
  return sectionNodes(sectionOpenings(component.params.section, tree), own)
}
