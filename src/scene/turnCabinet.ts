import type { CarcaseComponent, MaterialDef } from './types'
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'

// A component's transform is translate(position) ∘ rotate(euler) about its LOCAL ORIGIN, and a
// cabinet's origin is its front-left-bottom corner — not its centre. So turning a cabinet by
// changing `rotation` alone swings it bodily around that corner: a 600 × 578 base unit moves most
// of its own size. Every turn therefore carries a compensating translation, and it is stated here
// rather than in a click handler.
//
// The invariant chosen is "the footprint centre does not move", which is what a plan-view turn
// looks like to a person. An ANCHORED cabinet has its position rewritten by `resolvePlacement`
// anyway, so for one this is harmless rather than wrong; a free-placed cabinet is the case that
// needs it.
export function turnedInPlace(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
  degrees: number,
): CarcaseComponent {
  const before = worldBoundsOf(c, materials)
  // Wrapped, so repeated turns cannot grow the stored number without bound — a rotation of 3600 is
  // the same cabinet and a worse thing to read in a file.
  const z = (((c.rotation.z + degrees) % 360) + 360) % 360
  const turned = { ...c, rotation: { ...c.rotation, z } }

  const local = localRotatedBoundsOf(turned, materials)
  return {
    ...turned,
    position: {
      ...c.position,
      x: (before.x0 + before.x1) / 2 - (local.x0 + local.x1) / 2,
      y: (before.y0 + before.y1) / 2 - (local.y0 + local.y1) / 2,
    },
  }
}
