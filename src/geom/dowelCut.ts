import type { DowelEndCut, Vec3 } from '../scene/types'

const DEG2RAD = Math.PI / 180

export interface BoxToolDescriptor {
  boxOrigin: Vec3 // axis-aligned oversized box min-corner, BEFORE rotation
  boxSize: Vec3 // oversized box dimensions
  pivot: Vec3 // rotation axis point
  axisDir: Vec3 // unit rotation axis
  angleRad: number // signed rotation
}

export interface CylinderToolDescriptor {
  radius: number
  height: number
  basePoint: Vec3 // cylinder base center
  dir: Vec3 // unit axis direction (cylinder extends +dir from basePoint)
}

interface DowelDims {
  diameter: number
  length: number
}

// Oversized box half-space subtracted at one end. angle 0 ⇒ square trim at
// `offset` from the chosen end; angle > 0 ⇒ wedge pivoting on the cap toward
// `azimuth`. Sign of angleRad is pinned by tests and confirmed in the live spike.
export function computeEndTool(dowel: DowelDims, cut: DowelEndCut): BoxToolDescriptor {
  const { diameter: D, length: L } = dowel
  const BIG = 4 * (D + L)
  const span = 2 * BIG
  const zCut = cut.end === '+Z' ? L - cut.offset : cut.offset
  const az = cut.azimuth * DEG2RAD
  return {
    boxOrigin: { x: -BIG, y: -BIG, z: cut.end === '+Z' ? zCut : zCut - span },
    boxSize: { x: span, y: span, z: span },
    pivot: { x: 0, y: 0, z: zCut },
    // rotation axis is horizontal, perpendicular to the azimuth direction
    // (cos az, sin az, 0) so the cut plane tilts toward `azimuth`.
    axisDir: { x: -Math.sin(az), y: Math.cos(az), z: 0 },
    angleRad: (cut.end === '+Z' ? 1 : -1) * cut.angle * DEG2RAD,
  }
}

export type DowelSurface = 'cap+' | 'cap-' | 'lateral'

export function dowelSurfaceFromNormal(localNormal: Vec3): DowelSurface {
  const az = Math.abs(localNormal.z)
  const radial = Math.hypot(localNormal.x, localNormal.y)
  if (az >= radial) return localNormal.z >= 0 ? 'cap+' : 'cap-'
  return 'lateral'
}

export function azimuthFromHit(localHit: Vec3): number {
  return Math.atan2(localHit.y, localHit.x) / DEG2RAD
}
