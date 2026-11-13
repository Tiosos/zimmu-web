import { MIN_CUT_SIZE_MM } from '../geom/cutLimits'
import type { BoxCut, Vec3 } from './types'

export interface BoxVolume {
  min: Vec3
  max: Vec3
}

const isFiniteVec = (v: Vec3) => [v.x, v.y, v.z].every(Number.isFinite)

// True when every position and size component is finite. A box that fails this is an invalid
// record. A finite box at or below MIN_CUT_SIZE_MM is a different thing: valid geometry that is
// merely absent from the solid. This predicate flags only the first.
export function boxGeometryIsFinite(box: BoxCut): boolean {
  return isFiniteVec(box.position) && isFiniteVec(box.size)
}

// A box cut removes [position, position + size]. A box with any size at or below the exporter's
// minimum is absent from the solid: makeShape skips it. The machining schedule still lists the
// definition, so "absent" means solid-absent, not packet-absent. A non-finite position or size
// cannot describe a volume either, so no volume is returned; that is a different case from a box
// the exporter skips.
export function boxVolumeOf(box: BoxCut): BoxVolume | null {
  if (!boxGeometryIsFinite(box)) return null
  const { x, y, z } = box.size
  if (![x, y, z].every((n) => n > MIN_CUT_SIZE_MM)) return null
  return {
    min: box.position,
    max: { x: box.position.x + x, y: box.position.y + y, z: box.position.z + z },
  }
}
