import type { CarcaseComponent, MaterialDef, Vec3 } from './types'
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'
import { anchorForDrop, type Drop } from './dragAnchor'

// Where a move gizmo's handles belong: the centre of the cabinet's occupied box.
//
// NOT its `position`, which is the front-left-bottom corner — a cabinet's origin is a corner, so
// handles placed there hang off the box rather than on it. The same reason `turnedInPlace`
// preserves the centre: the centre is what a person sees as "the cabinet".
export function gizmoCentreOf(c: CarcaseComponent, materials: Record<string, MaterialDef>): Vec3 {
  const b = worldBoundsOf(c, materials)
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 }
}

// The inverse: the `position` that puts this cabinet's centre at `centre`.
//
// Reads the LOCAL rotated box — the untranslated one — because the translation is exactly what is
// being solved for. Using `worldBoundsOf` here makes the round trip drift by the cabinet's own
// position, which looks right for a cabinet at the origin and for no other.
export function positionForCentre(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
  centre: Vec3,
): Vec3 {
  const local = localRotatedBoundsOf(c, materials)
  return {
    x: centre.x - (local.x0 + local.x1) / 2,
    y: centre.y - (local.y0 + local.y1) / 2,
    z: centre.z - (local.z0 + local.z1) / 2,
  }
}

// What a gizmo drag means, in anchor terms.
//
// The gizmo reports a CENTRE; `anchorForDrop` wants an ORIGIN, so the conversion happens here and
// the snapping rule itself is not touched — the plan view and the gizmo resolve a drop through
// exactly the same arithmetic, which is what keeps a cabinet dragged in 3D landing where the same
// cabinet dragged in plan would.
export function dropForCentre(
  dragged: CarcaseComponent,
  centre: Vec3,
  candidates: CarcaseComponent[],
  materials: Record<string, MaterialDef>,
): Drop {
  return anchorForDrop(dragged, positionForCentre(dragged, materials, centre), candidates, materials)
}
