import type { Scene } from './types'
import { isValidDadoSeat, computeDadoGroove, computeDadoSeat } from '../geom/dado'

// Regenerate every derived (joint-owned) cut and seated position from the joints.
// Pure and idempotent: safe to run after any scene mutation and on file load.
export function reconcileJoints(scene: Scene): Scene {
  const jointIds = new Set(scene.joints.map((j) => j.id))

  // 1. Strip derived cuts whose owning joint no longer exists (orphans).
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

  // 2. For each joint: regenerate if the seat is valid; otherwise preserve last-good.
  for (const joint of scene.joints) {
    const housing = parts.find((p) => p.id === joint.housingPartId)
    const housed = parts.find((p) => p.id === joint.housedPartId)
    if (housing?.kind !== 'board' || housed?.kind !== 'board') continue
    if (!isValidDadoSeat(housing, joint.housingFace, housed, joint.housedEnd)) continue

    const groove = computeDadoGroove(housing, housed, joint)
    const seat = computeDadoSeat(housing, housed, joint)

    parts = parts.map((p) => {
      if (p.id === joint.housingPartId && p.kind === 'board') {
        const others = p.cuts.filter((c) => !(c.kind === 'box' && c.sourceJointId === joint.id))
        return { ...p, cuts: [...others, groove] }
      }
      if (p.id === joint.housedPartId && p.kind === 'board') {
        return { ...p, position: seat.position }
      }
      return p
    })
  }

  return { ...scene, parts }
}
