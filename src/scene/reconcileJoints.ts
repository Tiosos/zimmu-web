import type { Scene } from './types'
import { deriveJoint } from '../geom/dado'

// Regenerate every derived (joint-owned) cut and seated position from the joints.
// Joint-agnostic: it distributes whatever deriveJoint emits. Pure and idempotent.
export function reconcileJoints(scene: Scene): Scene {
  const jointIds = new Set(scene.joints.map((j) => j.id))

  // 1. Strip orphan derived cuts (owning joint gone).
  let parts = scene.parts.map((p) =>
    p.kind === 'board'
      ? {
          ...p,
          cuts: p.cuts.filter(
            (c) =>
              !(
                c.kind === 'box' &&
                c.sourceJointId !== undefined &&
                !jointIds.has(c.sourceJointId)
              ),
          ),
        }
      : p,
  )

  // 2. For each joint: derive → distribute across parts, or preserve last-good.
  for (const joint of scene.joints) {
    const result = deriveJoint(joint, parts)
    if (result === null) continue // stale/invalid → leave existing cuts + position

    // Remove this joint's derived cuts from every board, then scatter the fresh ones.
    parts = parts.map((p) =>
      p.kind === 'board'
        ? { ...p, cuts: p.cuts.filter((c) => !(c.kind === 'box' && c.sourceJointId === joint.id)) }
        : p,
    )
    for (const { partId, cut } of result.cuts) {
      parts = parts.map((p) =>
        p.id === partId && p.kind === 'board' ? { ...p, cuts: [...p.cuts, cut] } : p,
      )
    }
    parts = parts.map((p) =>
      p.id === result.seat.partId ? { ...p, position: result.seat.position } : p,
    )
  }

  return { ...scene, parts }
}
