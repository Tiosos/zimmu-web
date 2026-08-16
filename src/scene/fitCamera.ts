import type { Part, Vec3 } from './types'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'

export interface Bounds {
  min: Vec3
  max: Vec3
}

// The local axis-aligned box of a part, in its own coordinates. The two kinds genuinely differ:
// a board is corner-origin on all three axes (BRepPrimAPI_MakeBox_1 spans 0..d, per snapMath.ts:43-48),
// while a cylinder's local origin lies on the axis at the base circle, so it is centred in x/y but
// corner-origin in z.
function localBox(part: Part): Bounds {
  switch (part.kind) {
    case 'board':
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: part.length, y: part.width, z: part.thickness },
      }
    case 'cylinder': {
      const r = part.diameter / 2
      return { min: { x: -r, y: -r, z: 0 }, max: { x: r, y: r, z: part.length } }
    }
    default: {
      const _exhaustive: never = part
      throw new Error(`unhandled part kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

export function worldBounds(parts: Part[]): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  let found = false

  for (const part of parts) {
    if (!part.visible) continue
    found = true
    const m = composeWorldMatrix(part)
    const { min, max } = localBox(part)
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          const [wx, wy, wz] = applyMatrixToPoint(m, x, y, z)
          if (wx < minX) minX = wx
          if (wy < minY) minY = wy
          if (wz < minZ) minZ = wz
          if (wx > maxX) maxX = wx
          if (wy > maxY) maxY = wy
          if (wz > maxZ) maxZ = wz
        }
      }
    }
  }

  if (!found) return null
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}
