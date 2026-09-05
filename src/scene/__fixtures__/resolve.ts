import { openingRect, sectionThickness } from '../carcaseRoles'
import { PRESET_MATERIALS } from '../carcasePresets'
import { roleThicknessFor } from '../resolveThickness'
import { resolveSections } from '../sectionTree'
import type { CarcaseParams, MaterialDef } from '../types'

// The resolved tree of a cabinet, with the thickness resolver its own materials imply. Shared
// because three test files need it and it was defined inside one of their `describe` blocks, where
// the others could not reach it — the scoping trap `toCarcase` sprang in Stage F.
export const resolvedOf = (p: CarcaseParams, materials: Record<string, MaterialDef> = PRESET_MATERIALS) => {
  const thicknessOf = roleThicknessFor(p, materials, new Map())
  return resolveSections(p.section, openingRect(p, thicknessOf), sectionThickness(thicknessOf))
}
