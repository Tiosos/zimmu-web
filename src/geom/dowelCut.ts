import type {
  DowelBoreAxial,
  DowelBoreTransverse,
  DowelEndCut,
  DowelNotch,
  Vec3,
} from '../scene/types'

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

export function computeAxialBoreTool(
  dowel: DowelDims,
  cut: DowelBoreAxial,
): CylinderToolDescriptor {
  const over = dowel.diameter
  const through = cut.depth >= dowel.length
  const height = (through ? dowel.length : cut.depth) + over
  if (cut.end === '+Z') {
    return {
      radius: cut.diameter / 2,
      height,
      basePoint: { x: 0, y: 0, z: dowel.length + over },
      dir: { x: 0, y: 0, z: -1 },
    }
  }
  return {
    radius: cut.diameter / 2,
    height,
    basePoint: { x: 0, y: 0, z: -over },
    dir: { x: 0, y: 0, z: 1 },
  }
}

export function computeTransverseBoreTool(
  dowel: DowelDims,
  cut: DowelBoreTransverse,
): CylinderToolDescriptor {
  const R = dowel.diameter / 2
  const over = dowel.diameter
  const az = cut.azimuth * DEG2RAD
  const through = cut.depth >= dowel.diameter
  const height = (through ? dowel.diameter : cut.depth) + over
  return {
    radius: cut.diameter / 2,
    height,
    basePoint: { x: (R + over) * Math.cos(az), y: (R + over) * Math.sin(az), z: cut.position },
    dir: { x: -Math.cos(az) || 0, y: -Math.sin(az) || 0, z: 0 },
  }
}

// Before rotation the notch faces +X: removes material with x ≥ R − depth over
// z ∈ [position − width/2, position + width/2]. azimuth is a rotation about +Z.
export function computeNotchTool(dowel: DowelDims, cut: DowelNotch): BoxToolDescriptor {
  const R = dowel.diameter / 2
  const BIG = 4 * (dowel.diameter + dowel.length)
  const span = 2 * BIG
  return {
    boxOrigin: { x: R - cut.depth, y: -BIG, z: cut.position - cut.width / 2 },
    boxSize: { x: span, y: span, z: cut.width },
    pivot: { x: 0, y: 0, z: 0 },
    axisDir: { x: 0, y: 0, z: 1 },
    angleRad: cut.azimuth * DEG2RAD,
  }
}
