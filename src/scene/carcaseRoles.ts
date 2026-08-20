import type { CarcaseParams, Vec3 } from './types'

export interface LocalBox {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

export interface PanelSpec {
  length: number
  width: number
  thickness: number
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
}

// Every carcase part is an axis-aligned panel; only which axis carries the material thickness
// differs. Each rotation maps all three board axes onto carcase axes positively, so the board's
// local origin always lands on the box's min corner and `position` needs no compensation.
export function orientedPanel(b: LocalBox, thicknessAxis: 'x' | 'y' | 'z'): PanelSpec {
  const dx = b.x1 - b.x0
  const dy = b.y1 - b.y0
  const dz = b.z1 - b.z0
  const position = { x: b.x0, y: b.y0, z: b.z0 }
  const rotationOrder = 'XYZ' as const

  if (thicknessAxis === 'z') {
    return {
      length: dx,
      width: dy,
      thickness: dz,
      position,
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder,
    }
  }
  if (thicknessAxis === 'x') {
    // board x→carcase y, y→z, z→x
    return {
      length: dy,
      width: dz,
      thickness: dx,
      position,
      rotation: { x: 0, y: 90, z: 90 },
      rotationOrder,
    }
  }
  // board x→carcase z, y→x, z→y
  return {
    length: dz,
    width: dx,
    thickness: dy,
    position,
    rotation: { x: -90, y: 0, z: -90 },
    rotationOrder,
  }
}

// Total and side-effect free by contract: the generator calls this on every keystroke and emits
// nothing when it returns errors, so the last-good parts survive transient states like a width of
// `6` on the way to `600`. Every problem is collected — a panel that reported one at a time would
// turn fixing three mistakes into three round trips.
export function validateCarcaseParams(p: CarcaseParams): string[] {
  const errors: string[] = []
  if (p.thickness <= 0) errors.push('thickness must be positive')
  if (p.width <= 2 * p.thickness) errors.push('width must exceed 2 × thickness')
  if (p.height <= 2 * p.thickness) errors.push('height must exceed 2 × thickness')
  if (p.depth <= p.thickness) errors.push('depth must exceed thickness')
  if (p.baseMode === 'toe-kick') {
    if (p.toeKickHeight >= p.height) {
      errors.push('toeKickHeight must be less than height')
    } else if (p.toeKickHeight + 2 * p.thickness >= p.height) {
      errors.push('toeKickHeight leaves no room between top and bottom')
    }
    if (p.toeKickSetback >= p.depth) {
      errors.push('toeKickSetback must be less than depth')
    }
  }
  if (p.backMode !== 'none' && p.backThickness >= p.depth) {
    errors.push('backThickness must be less than depth')
  }
  if (p.fixedShelves < 0) errors.push('fixedShelves must be 0 or more')
  if (p.adjustableShelves.count < 0) errors.push('adjustable shelf count must be 0 or more')
  if (p.dividers.some((d) => d <= 0 || d >= 1)) {
    errors.push('dividers must lie strictly between 0 and 1')
  }
  if (p.dividers.some((d, i) => i > 0 && d <= p.dividers[i - 1])) {
    errors.push('dividers must be ascending')
  }
  return errors
}
