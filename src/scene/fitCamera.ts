import type { Part, Vec3 } from './types'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'

export interface Bounds {
  min: Vec3
  max: Vec3
}

function localBox(part: Part): Bounds {
  return {
    min: { x: 0, y: 0, z: 0 },
    max: { x: part.length, y: part.width, z: part.thickness },
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
