// Three.js math types run in Node/happy-dom without browser mocks needed.
import * as THREE from 'three'
import type {
  BoardPart,
  Component,
  ComponentId,
  CylinderPart,
  Face,
  FaceHit,
  Part,
  Vec3,
} from './types'
import { ancestorWorldMatrix, resolveWorldMatrix } from '../geom/transform'
import { ancestorsOf } from './componentTree'

const DEG2RAD = Math.PI / 180

function localQuaternion(node: Part | Component): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      node.rotation.x * DEG2RAD,
      node.rotation.y * DEG2RAD,
      node.rotation.z * DEG2RAD,
      node.rotationOrder,
    ),
  )
}

// A part's orientation in world space. rotation/rotationOrder are parent-local, so a snap — whose
// FaceHit inputs are all world-space — must resolve them through the ancestor chain first.
// Composed quaternion-side rather than decomposed out of resolveWorldMatrix so a top-level part,
// which has no ancestors, is left with the exact quaternion the pre-component-tree code produced.
function worldQuaternion(part: Part, byId: Map<ComponentId, Component>): THREE.Quaternion {
  const q = localQuaternion(part)
  for (const ancestor of ancestorsOf(part, byId)) q.premultiply(localQuaternion(ancestor))
  return q
}

// A world placement re-expressed in the frame part.position/part.rotation are stored in — the
// parent's. The ancestor frame is the identity for a top-level part, so this leaves such a part's
// values untouched, which is why every snap was correct before components existed.
function toParentFrame(
  part: Part,
  byId: Map<ComponentId, Component>,
  worldPosition: Vec3,
  worldQuat: THREE.Quaternion,
): { position: Vec3; rotation: Vec3 } {
  const parent = new THREE.Matrix4().fromArray(ancestorWorldMatrix(part, byId))
  const parentPos = new THREE.Vector3()
  const parentQuat = new THREE.Quaternion()
  parent.decompose(parentPos, parentQuat, new THREE.Vector3())
  const invParent = parentQuat.invert()

  const localPos = new THREE.Vector3(
    worldPosition.x - parentPos.x,
    worldPosition.y - parentPos.y,
    worldPosition.z - parentPos.z,
  ).applyQuaternion(invParent)
  const localQuat = invParent.clone().multiply(worldQuat)
  const euler = new THREE.Euler().setFromQuaternion(localQuat, part.rotationOrder)

  return {
    position: { x: localPos.x, y: localPos.y, z: localPos.z },
    rotation: { x: euler.x / DEG2RAD, y: euler.y / DEG2RAD, z: euler.z / DEG2RAD },
  }
}

type FaceAxis = 'x' | 'y' | 'z'

export function faceAxes(face: Face): { depth: FaceAxis; u: FaceAxis; v: FaceAxis } {
  if (face === '+X' || face === '-X') return { depth: 'x', u: 'y', v: 'z' }
  if (face === '+Y' || face === '-Y') return { depth: 'y', u: 'x', v: 'z' }
  return { depth: 'z', u: 'x', v: 'y' }
}

export function defaultCutSize(face: Face): Vec3 {
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

export function computeDowelLocalFaceCenter(localFaceNormal: Vec3, dowel: CylinderPart): Vec3 {
  return localFaceNormal.z > 0 ? { x: 0, y: 0, z: dowel.length } : { x: 0, y: 0, z: 0 }
}

export function isSnapFace(part: Part, localFaceNormal: Vec3): boolean {
  if (part.kind === 'board') return true
  return Math.abs(localFaceNormal.z) > 0.9
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

export function computeFaceCorners(
  face: FaceHit,
  part: Part,
  byId: Map<ComponentId, Component>,
): [Vec3, Vec3, Vec3, Vec3] {
  if (part.kind !== 'board') {
    throw new Error(`computeFaceCorners: unsupported kind '${part.kind}'`)
  }
  const { length, width, thickness } = part
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

  const matrix = new THREE.Matrix4().fromArray(resolveWorldMatrix(part, byId))

  const [c0, c1, c2, c3] = localCorners.map((c) => {
    c.applyMatrix4(matrix)
    return { x: c.x, y: c.y, z: c.z } as Vec3
  })
  return [c0, c1, c2, c3]
}

export function localNormalToFaceString(n: Vec3): Face {
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
  byId: Map<ComponentId, Component>,
): { position: Vec3; rotation: Vec3 } {
  // Step 1: current world rotation as quaternion
  const Q_current = worldQuaternion(sourcePart, byId)

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

  // 3c. The two canonical axes of the target face plane. Board targets are axis-aligned;
  //     a dowel-cap target may be off-axis (see SP3 notes) — the fallbacks below handle that.
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

  // Step 4: convert to world Euler degrees
  const euler = new THREE.Euler().setFromQuaternion(Q_final, sourcePart.rotationOrder)
  const worldRotation: Vec3 = {
    x: euler.x / DEG2RAD,
    y: euler.y / DEG2RAD,
    z: euler.z / DEG2RAD,
  }

  // Step 5: find new world position — compute where source face centre lands at the new rotation,
  // then translate so it coincides with target face centre. The temp part is unparented on
  // purpose: worldRotation is already world, so resolving it through the ancestors again would
  // count them twice. sourcePart.position then cancels between the two terms below, leaving the
  // world placement targetFace.faceCenter − (rotated local face centre).
  const tempPart: BoardPart = { ...sourcePart, rotation: worldRotation, parentId: null }
  const corners = computeFaceCorners(sourceFace, tempPart, byId)
  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
  const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4

  const worldPosition: Vec3 = {
    x: sourcePart.position.x + targetFace.faceCenter.x - cx,
    y: sourcePart.position.y + targetFace.faceCenter.y - cy,
    z: sourcePart.position.z + targetFace.faceCenter.z - cz,
  }

  return toParentFrame(sourcePart, byId, worldPosition, Q_final)
}

export function computeDowelSnapTransform(
  sourceFace: FaceHit,
  targetFace: FaceHit,
  sourceDowel: CylinderPart,
  coaxial: boolean,
  byId: Map<ComponentId, Component>,
): { position: Vec3; rotation: Vec3 } {
  // Current world rotation as a quaternion
  const Q_current = worldQuaternion(sourceDowel, byId)

  // Recompute the cap's outward world normal from the dowel rotation (do NOT trust
  // sourceFace.faceNormal, which the raycaster may have axis-rounded).
  const capSign = Math.sign(sourceFace.localFaceNormal.z) || 1
  const srcWorldNormal = new THREE.Vector3(0, 0, capSign).applyQuaternion(Q_current)

  // Minimum rotation to make the cap normal oppose the target normal.
  const negTgt = new THREE.Vector3(
    -targetFace.faceNormal.x,
    -targetFace.faceNormal.y,
    -targetFace.faceNormal.z,
  )
  const Q_normal = new THREE.Quaternion().setFromUnitVectors(srcWorldNormal, negTgt)

  // No roll-snap — a cylinder is rotationally symmetric about its axis.
  const Q_final = new THREE.Quaternion().copy(Q_normal).multiply(Q_current)

  // Cap center in the local frame: +Z cap is at (0,0,length), -Z cap at (0,0,0).
  const capLocal = computeDowelLocalFaceCenter(sourceFace.localFaceNormal, sourceDowel)
  const capWorldOffset = new THREE.Vector3(capLocal.x, capLocal.y, capLocal.z).applyQuaternion(
    Q_final,
  )

  // Landing point: target face center (coaxial cap-to-cap) or the clicked hit point.
  const landing = coaxial ? targetFace.faceCenter : targetFace.hitPoint
  const worldPosition: Vec3 = {
    x: landing.x - capWorldOffset.x,
    y: landing.y - capWorldOffset.y,
    z: landing.z - capWorldOffset.z,
  }

  return toParentFrame(sourceDowel, byId, worldPosition, Q_final)
}
