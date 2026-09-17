import type { Anchor, CarcaseComponent, MaterialDef, Vec3 } from './types'
import { FACE_NORMAL, IN_PLANE, hi, lo } from './anchor'
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'

// How near a face a drop has to land before it becomes a relationship rather than a position.
// One figure, used for the normal axis and for the flush-offset snap alike.
export const SNAP_MM = 60

const FACES: Anchor['face'][] = ['left', 'right', 'front', 'back']

export type Drop =
  // `rotationZ` is the TARGET's rotation, offered as a UI default. It stays OUT of `Anchor`: an
  // anchor derives position only, and a corner is a cabinet both turned and anchored — two facts,
  // not one. Rotation is always the user's, so this is a suggestion the caller may ignore.
  | { kind: 'anchor'; anchor: Anchor; rotationZ: number }
  | { kind: 'free'; position: Vec3 }

// Flush is the stated default and the common case, so a near-flush drag becomes exactly flush.
// Past the snap the dragged figure survives untouched, which is what lets a deliberate reveal be
// dragged in rather than typed.
const flush = (v: number): number => (Math.abs(v) <= SNAP_MM ? 0 : v)

// What anchor, if any, would put `dragged` at `drop`.
//
// Inverts `anchoredPosition` at gap 0, reading that function's own FACE_NORMAL and IN_PLANE tables
// rather than restating them. The face fixes the dragged cabinet on the normal axis, and the two
// in-plane offsets are read off the drop.
//
// Candidates rank by distance on the face's NORMAL axis alone. The in-plane axes are where the user
// is free to slide, so counting them would let a cabinet dragged far along the right face lose to a
// nearer but wrong one.
export function anchorForDrop(
  dragged: CarcaseComponent,
  drop: Vec3,
  candidates: CarcaseComponent[],
  materials: Record<string, MaterialDef>,
): Drop {
  const own = localRotatedBoundsOf(dragged, materials)

  let best: { anchor: Anchor; distance: number; rotationZ: number } | undefined
  for (const t of candidates) {
    // Exactly resolvePlacement's honouring rule: offering a target it would silently undo is
    // offering a relationship that does not survive the next pipeline run.
    if (t.id === dragged.id || t.parentId !== dragged.parentId) continue
    const target = worldBoundsOf(t, materials)

    for (const face of FACES) {
      const { axis, positive } = FACE_NORMAL[face]
      const [u, v] = IN_PLANE[axis]
      const snapped = positive ? hi(target, axis) - lo(own, axis) : lo(target, axis) - hi(own, axis)
      const distance = Math.abs(drop[axis] - snapped)
      if (distance > SNAP_MM) continue
      if (best !== undefined && distance >= best.distance) continue
      best = {
        distance,
        rotationZ: t.rotation.z,
        anchor: {
          to: t.id,
          face,
          gap: 0,
          offset: {
            u: flush(drop[u] + lo(own, u) - lo(target, u)),
            v: flush(drop[v] + lo(own, v) - lo(target, v)),
          },
        },
      }
    }
  }

  return best === undefined
    ? { kind: 'free', position: drop }
    : { kind: 'anchor', anchor: best.anchor, rotationZ: best.rotationZ }
}
