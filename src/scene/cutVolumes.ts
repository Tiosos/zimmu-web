import { MIN_CUT_SIZE_MM } from '../geom/cutLimits'
import type { BoxCut, Vec3 } from './types'

export interface BoxVolume {
  min: Vec3
  max: Vec3
}

// A box cut removes [position, position + size]. A box with any size at or below the exporter's
// minimum is absent from the solid: makeShape skips it. The machining schedule still lists the
// definition, so "absent" means solid-absent, not packet-absent. A non-finite position or size
// cannot describe a volume, so it is absent for the same reason; makeShape does not skip it.
export function boxVolumeOf(box: BoxCut): BoxVolume | null {
  const { x, y, z } = box.size
  if (![x, y, z].every((n) => Number.isFinite(n) && n > MIN_CUT_SIZE_MM)) return null
  if (![box.position.x, box.position.y, box.position.z].every(Number.isFinite)) return null
  return {
    min: box.position,
    max: { x: box.position.x + x, y: box.position.y + y, z: box.position.z + z },
  }
}
