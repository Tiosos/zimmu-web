import * as THREE from 'three'
import type { Component, ComponentId, Part, PartId } from '../scene/types'
import { resolveWorldMatrix, applyMatrixToPoint } from './transform'

type Vec = [number, number, number]

function facetNormal(a: Vec, b: Vec, c: Vec): Vec {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  if (len === 0) return [0, 0, 0]
  return [nx / len, ny / len, nz / len]
}

export function buildBinaryStl(
  parts: Part[],
  geometries: Map<PartId, THREE.BufferGeometry>,
  byId: Map<ComponentId, Component>,
): ArrayBuffer {
  const tris: number[] = [] // per triangle: nx,ny,nz, ax,ay,az, bx,by,bz, cx,cy,cz
  let count = 0
  for (const part of parts) {
    const geo = geometries.get(part.id)
    if (!geo) continue
    const pos = geo.getAttribute('position')
    if (!pos) continue
    const m = resolveWorldMatrix(part, byId)
    for (let i = 0; i < pos.count; i += 3) {
      const a = applyMatrixToPoint(m, pos.getX(i), pos.getY(i), pos.getZ(i))
      const b = applyMatrixToPoint(m, pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1))
      const c = applyMatrixToPoint(m, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2))
      const n = facetNormal(a, b, c)
      tris.push(n[0], n[1], n[2], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
      count++
    }
  }

  const buffer = new ArrayBuffer(84 + count * 50)
  const view = new DataView(buffer)
  const header = 'Zimmu STL export'
  for (let i = 0; i < header.length && i < 80; i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, count, true)

  let off = 84
  for (let t = 0; t < tris.length; t += 12) {
    for (let k = 0; k < 12; k++) view.setFloat32(off + k * 4, tris[t + k], true)
    view.setUint16(off + 48, 0, true) // attribute byte count
    off += 50
  }
  return buffer
}
