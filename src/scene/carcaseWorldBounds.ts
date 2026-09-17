import type { CarcaseComponent, MaterialDef } from './types'
import { carcaseBounds, type Bounds3 } from './carcaseBounds'
import { rotatedBounds, translatedBounds } from './anchor'
import { roleThicknessFor, type PartOverrides } from './resolveThickness'

// Slots only. Overrides live on emitted parts and placement runs before they exist; see
// carcaseBounds for why reading them would make the pipeline a fixed-point iteration.
const NO_OVERRIDES = new Map<string, PartOverrides>()

// A cabinet's occupied box, rotated about its local origin but NOT translated — what
// `anchoredPosition` wants for the cabinet being placed, whose position is the thing being solved
// for.
export function localRotatedBoundsOf(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): Bounds3 {
  const own = carcaseBounds(c.params, roleThicknessFor(c.params, materials, NO_OVERRIDES))
  return rotatedBounds(own, c.rotation)
}

// Where a cabinet's occupied box actually is, in its parent's frame.
//
// Stated here rather than inline in `resolvePlacement` because the plan view draws the same box and
// `dragAnchor` measures against it. Three copies of a rotate-then-translate composition is how a
// cabinet comes to be drawn somewhere other than where it resolves.
//
// Reads `c.position`, so it is the answer for a cabinet whose position is already settled — a
// free-placed one, or an anchored one after `resolvePlacement` has run. Mid-resolution the target's
// position is not yet written, which is why that pass translates `localRotatedBoundsOf` by the
// position it is computing rather than calling this.
export function worldBoundsOf(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): Bounds3 {
  return translatedBounds(localRotatedBoundsOf(c, materials), c.position)
}
