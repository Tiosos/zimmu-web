// Three.js math types run in Node/happy-dom without browser mocks needed.
import * as THREE from 'three'
import type { BoardPart, CutDef, FaceHit, Part, Vec3 } from './types'

const DEG2RAD = Math.PI / 180

type FaceAxis = 'x' | 'y' | 'z'

export function faceAxes(face: CutDef['face']): { depth: FaceAxis; u: FaceAxis; v: FaceAxis } {
  if (face === '+X' || face === '-X') return { depth: 'x', u: 'y', v: 'z' }
  if (face === '+Y' || face === '-Y') return { depth: 'y', u: 'x', v: 'z' }
  return { depth: 'z', u: 'x', v: 'y' }
}

export function defaultCutSize(face: CutDef['face']): Vec3 {
  if (face === '+X' || face === '-X') return { x: 10, y: 20, z: 20 }
  if (face === '+Y' || face === '-Y') return { x: 20, y: 10, z: 20 }
  return { x: 20, y: 20, z: 10 }
}

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

function localNormalToFaceString(n: Vec3): CutDef['face'] {
  if (n.x > 0.5) return '+X'
  if (n.x < -0.5) return '-X'
  if (n.y > 0.5) return '+Y'
  if (n.y < -0.5) return '-Y'
  if (n.z > 0.5) return '+Z'
  return '-Z'
}

export function computeSnapTransform(
  sourceFace: FaceHit,
  targetFace: FaceHit,
  sourcePart: BoardPart,
): { position: Vec3; rotation: Vec3 } {
  // Step 1: current world rotation as quaternion
  const Q_current = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      sourcePart.rotation.x * DEG2RAD,
      sourcePart.rotation.y * DEG2RAD,
      sourcePart.rotation.z * DEG2RAD,
      sourcePart.rotationOrder,
    ),
  )

  // Step 2: minimum rotation to align source normal with -target normal
  const srcNormal = new THREE.Vector3(
    sourceFace.faceNormal.x,
    sourceFace.faceNormal.y,
    sourceFace.faceNormal.z,
  )
  const negTgt = new THREE.Vector3(
    -targetFace.faceNormal.x,
    -targetFace.faceNormal.y,
    -targetFace.faceNormal.z,
  )
  const Q_normal = new THREE.Quaternion().setFromUnitVectors(srcNormal, negTgt)
  // THREE handles degenerate cases:
  //   srcNormal ≈ negTgt (dot ≈ +1): identity quaternion
  //   srcNormal ≈ -negTgt (dot ≈ -1): 180° flip around arbitrary perpendicular axis

  // Step 3: snap roll to nearest 90°
  // 3a. Find the source face u-axis in world space after applying Q_normal × Q_current
  const { u: uKey } = faceAxes(localNormalToFaceString(sourceFace.localFaceNormal))
  const localU = new THREE.Vector3()
  localU[uKey] = 1
  const worldU = localU
    .clone()
    .applyQuaternion(new THREE.Quaternion().copy(Q_normal).multiply(Q_current))

  // 3b. Project worldU onto the target face plane
  const projected = worldU.clone().addScaledVector(negTgt, -worldU.dot(negTgt))
  if (projected.lengthSq() < 1e-10) {
    const fb = Math.abs(negTgt.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    projected.copy(fb).addScaledVector(negTgt, -fb.dot(negTgt))
  }
  projected.normalize()

  // 3c. The two canonical axes of the target face plane (always ±X/Y/Z per raycaster)
  const WORLD = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
  const planePair = WORLD.filter((a) => Math.abs(a.dot(negTgt)) < 0.01)
  const axis1 = planePair[0] ?? new THREE.Vector3(1, 0, 0)
  const axis2 = planePair[1] ?? new THREE.Vector3(0, 1, 0)

  // 3d. Measure roll angle and snap to nearest multiple of π/2
  const angle = Math.atan2(projected.dot(axis2), projected.dot(axis1))
  const snapped = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  const Q_roll = new THREE.Quaternion().setFromAxisAngle(negTgt, snapped - angle)

  // 3e. Compose: Q_final = Q_roll × Q_normal × Q_current
  const Q_final = new THREE.Quaternion().copy(Q_roll).multiply(Q_normal).multiply(Q_current)

  // Step 4: convert to Euler degrees
  const euler = new THREE.Euler().setFromQuaternion(Q_final, sourcePart.rotationOrder)
  const newRotation: Vec3 = {
    x: euler.x / DEG2RAD,
    y: euler.y / DEG2RAD,
    z: euler.z / DEG2RAD,
  }

  // Step 5: find new position — compute where source face centre lands at new rotation,
  // then translate so it coincides with target face centre
  const tempPart: BoardPart = { ...sourcePart, rotation: newRotation }
  const corners = computeFaceCorners(sourceFace, tempPart)
  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
  const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4

  const newPosition: Vec3 = {
    x: sourcePart.position.x + targetFace.faceCenter.x - cx,
    y: sourcePart.position.y + targetFace.faceCenter.y - cy,
    z: sourcePart.position.z + targetFace.faceCenter.z - cz,
  }

  return { position: newPosition, rotation: newRotation }
}
