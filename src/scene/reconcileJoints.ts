import type { Scene } from './types'
import { deriveJoint } from '../geom/dado'
import { componentsById } from './componentTree'
import { isJointOwned, isOwnedBy } from './cutOwnership'

// Regenerate every derived (joint-owned) cut and seated position from the joints.
// Joint-agnostic: it distributes whatever deriveJoint emits. Pure and idempotent.
export function reconcileJoints(scene: Scene): Scene {
  const byId = componentsById(scene.components)

  // 1. Strip orphan derived cuts (owning joint gone).
  let parts = scene.parts.map((p) =>
    p.kind === 'board'
      ? {
          ...p,
          cuts: p.cuts.filter(
            (c) => !isJointOwned(c) || scene.joints.some((j) => isOwnedBy(c, j.id)),
          ),
        }
      : p,
  )

  // 2. For each joint: derive → distribute across parts, or preserve last-good.
  for (const joint of scene.joints) {
    const result = deriveJoint(joint, parts, byId)
    if (result === null) continue // stale/invalid → leave existing cuts + position

    // Remove this joint's derived cuts from every board, then scatter the fresh ones.
    parts = parts.map((p) =>
      p.kind === 'board' ? { ...p, cuts: p.cuts.filter((c) => !isOwnedBy(c, joint.id)) } : p,
    )
    for (const { partId, cut } of result.cuts) {
      parts = parts.map((p) =>
        p.id === partId && p.kind === 'board' ? { ...p, cuts: [...p.cuts, cut] } : p,
      )
    }
    const seat = result.seat
    if (seat) {
      parts = parts.map((p) => (p.id === seat.partId ? { ...p, position: seat.position } : p))
    }
  }

  return { ...scene, parts }
}
