// Three.js math types run in Node/happy-dom without browser mocks needed.
import * as THREE from 'three'
import type { BoardPart, FaceHit, Part, Vec3 } from './types'

const DEG2RAD = Math.PI / 180

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

export function computeSnapDelta(sourceFace: FaceHit, targetFace: FaceHit): Vec3 {
  const gap = dot(sub(targetFace.faceCenter, sourceFace.faceCenter), targetFace.faceNormal)
  return scale(targetFace.faceNormal, gap)
}

// Analytic local face centre — OCCT places the box corner at the local origin.
// Exported for Viewport use (face center computation in raycaster hit handler).
export function computeLocalFaceCenter(localFaceNormal: Vec3, part: BoardPart): Vec3 {
  const { length, width, thickness } = part
  const { x, y, z } = localFaceNormal
  if (x === 1) return { x: length, y: width / 2, z: thickness / 2 }
  if (x === -1) return { x: 0, y: width / 2, z: thickness / 2 }
  if (y === 1) return { x: length / 2, y: width, z: thickness / 2 }
  if (y === -1) return { x: length / 2, y: 0, z: thickness / 2 }
  if (z === 1) return { x: length / 2, y: width / 2, z: thickness }
  return { x: length / 2, y: width / 2, z: 0 }
}

// Determine the half-extent of a box along a given local axis.
function halfExtent(axis: THREE.Vector3, length: number, width: number, thickness: number): number {
  const ax = Math.abs(axis.x),
    ay = Math.abs(axis.y),
    az = Math.abs(axis.z)
  if (ax > ay && ax > az) return length / 2
  if (ay > ax && ay > az) return width / 2
  return thickness / 2
}

export function computeFaceCorners(face: FaceHit, part: Part): [Vec3, Vec3, Vec3, Vec3] {
  if (part.kind !== 'board') {
    throw new Error(`computeFaceCorners: unsupported kind '${part.kind}'`)
  }
  const { length, width, thickness, position, rotation, rotationOrder } = part
  const { localFaceNormal: lfn } = face

  const localCenter = computeLocalFaceCenter(lfn, part)

  const n = new THREE.Vector3(lfn.x, lfn.y, lfn.z)
  const fallback = Math.abs(lfn.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(n, fallback).normalize()
  const v = new THREE.Vector3().crossVectors(n, u)

  const hU = halfExtent(u, length, width, thickness)
  const hV = halfExtent(v, length, width, thickness)

  const lc = new THREE.Vector3(localCenter.x, localCenter.y, localCenter.z)
  const localCorners = [
    lc.clone().addScaledVector(u, hU).addScaledVector(v, hV),
    lc.clone().addScaledVector(u, -hU).addScaledVector(v, hV),
    lc.clone().addScaledVector(u, -hU).addScaledVector(v, -hV),
    lc.clone().addScaledVector(u, hU).addScaledVector(v, -hV),
  ]

  const euler = new THREE.Euler(
    rotation.x * DEG2RAD,
    rotation.y * DEG2RAD,
    rotation.z * DEG2RAD,
    rotationOrder,
  )
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(position.x, position.y, position.z),
    new THREE.Quaternion().setFromEuler(euler),
    new THREE.Vector3(1, 1, 1),
  )

  const [c0, c1, c2, c3] = localCorners.map((c) => {
    c.applyMatrix4(matrix)
    return { x: c.x, y: c.y, z: c.z } as Vec3
  })
  return [c0, c1, c2, c3]
}
