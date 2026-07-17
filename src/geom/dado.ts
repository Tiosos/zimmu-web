import * as THREE from 'three'
import type { BoardPart, BoxCut, CutId, DadoJoint, Face, Vec3 } from '../scene/types'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'

const DEG2RAD = Math.PI / 180
type Axis = 'x' | 'y' | 'z'

const FACE_NORMALS: Record<Face, Vec3> = {
  '+X': { x: 1, y: 0, z: 0 },
  '-X': { x: -1, y: 0, z: 0 },
  '+Y': { x: 0, y: 1, z: 0 },
  '-Y': { x: 0, y: -1, z: 0 },
  '+Z': { x: 0, y: 0, z: 1 },
  '-Z': { x: 0, y: 0, z: -1 },
}

function boardDims(p: BoardPart): Record<Axis, number> {
  return { x: p.length, y: p.width, z: p.thickness }
}

function unitVec(axis: Axis): Vec3 {
  return { x: axis === 'x' ? 1 : 0, y: axis === 'y' ? 1 : 0, z: axis === 'z' ? 1 : 0 }
}

function localDirToWorld(part: BoardPart, dir: Vec3): THREE.Vector3 {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      part.rotation.x * DEG2RAD,
      part.rotation.y * DEG2RAD,
      part.rotation.z * DEG2RAD,
      part.rotationOrder,
    ),
  )
  return new THREE.Vector3(dir.x, dir.y, dir.z).applyQuaternion(q)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function isValidDadoSeat(
  housing: BoardPart,
  housingFace: Face,
  housed: BoardPart,
  housedEnd: Face,
): boolean {
  const hn = localDirToWorld(housing, FACE_NORMALS[housingFace])
  const en = localDirToWorld(housed, FACE_NORMALS[housedEnd])
  return hn.dot(en) < -0.99
}

export function deriveDadoAxes(
  housing: BoardPart,
  housed: BoardPart,
  housingFace: Face,
): { narrowAx: Axis; runAx: Axis } {
  const { u, v } = faceAxes(housingFace)
  const thicknessWorld = localDirToWorld(housed, unitVec('z'))
  const uWorld = localDirToWorld(housing, unitVec(u))
  const vWorld = localDirToWorld(housing, unitVec(v))
  const alignU = Math.abs(thicknessWorld.dot(uWorld))
  const alignV = Math.abs(thicknessWorld.dot(vWorld))
  return alignU >= alignV ? { narrowAx: u, runAx: v } : { narrowAx: v, runAx: u }
}

export function defaultDadoDepth(housing: BoardPart, housingFace: Face): number {
  const dAx = faceAxes(housingFace).depth
  const dim = boardDims(housing)
  return clamp(Math.round(dim[dAx] / 3), 3, dim[dAx] - 1)
}

export function computeDadoOffset(
  housing: BoardPart,
  housed: BoardPart,
  housingFace: Face,
): number {
  const { narrowAx } = deriveDadoAxes(housing, housed, housingFace)
  const [cx, cy, cz] = applyMatrixToPoint(
    composeWorldMatrix(housed),
    housed.length / 2,
    housed.width / 2,
    housed.thickness / 2,
  )
  const narrowDir = localDirToWorld(housing, unitVec(narrowAx))
  const raw =
    (cx - housing.position.x) * narrowDir.x +
    (cy - housing.position.y) * narrowDir.y +
    (cz - housing.position.z) * narrowDir.z
  const dim = boardDims(housing)
  const half = housed.thickness / 2
  return clamp(raw, half, dim[narrowAx] - half)
}

export function computeDadoGroove(housing: BoardPart, housed: BoardPart, joint: DadoJoint): BoxCut {
  const { narrowAx, runAx } = deriveDadoAxes(housing, housed, joint.housingFace)
  const dAx = faceAxes(joint.housingFace).depth
  const dim = boardDims(housing)
  const depth = clamp(joint.depth, 0.1, dim[dAx] - 1)
  const width = housed.thickness + joint.clearance
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[dAx] = depth
  size[narrowAx] = width
  size[runAx] = dim[runAx]
  const offset = clamp(joint.offset, width / 2, dim[narrowAx] - width / 2)
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[dAx] = joint.housingFace.startsWith('+') ? dim[dAx] - depth : 0
  position[runAx] = 0
  position[narrowAx] = offset - width / 2
  return {
    kind: 'box',
    id: `cut_${joint.id}` as CutId,
    label: joint.label,
    face: joint.housingFace,
    position,
    size,
    sourceJointId: joint.id,
  }
}

export function computeDadoSeat(
  housing: BoardPart,
  housed: BoardPart,
  joint: DadoJoint,
): { position: Vec3 } {
  const { narrowAx } = deriveDadoAxes(housing, housed, joint.housingFace)
  const dAx = faceAxes(joint.housingFace).depth
  const dim = boardDims(housing)
  const depth = clamp(joint.depth, 0.1, dim[dAx] - 1)

  const endLocal = computeLocalFaceCenter(FACE_NORMALS[joint.housedEnd], housed)
  const [ex, ey, ez] = applyMatrixToPoint(
    composeWorldMatrix(housed),
    endLocal.x,
    endLocal.y,
    endLocal.z,
  )
  const endWorld = new THREE.Vector3(ex, ey, ez)

  const gM = composeWorldMatrix(housing)
  const faceCenter = computeLocalFaceCenter(FACE_NORMALS[joint.housingFace], housing)

  const bottomLocal: Vec3 = { ...faceCenter }
  bottomLocal[dAx] = joint.housingFace.startsWith('+') ? dim[dAx] - depth : depth
  const [bx, by, bz] = applyMatrixToPoint(gM, bottomLocal.x, bottomLocal.y, bottomLocal.z)
  const bottomWorld = new THREE.Vector3(bx, by, bz)

  const centerLocal: Vec3 = { ...faceCenter }
  centerLocal[narrowAx] = joint.offset
  const [gx, gy, gz] = applyMatrixToPoint(gM, centerLocal.x, centerLocal.y, centerLocal.z)
  const centerWorld = new THREE.Vector3(gx, gy, gz)

  const faceN = localDirToWorld(housing, FACE_NORMALS[joint.housingFace])
  const narrowDir = localDirToWorld(housing, unitVec(narrowAx))

  const desired = endWorld.clone()
  desired.addScaledVector(faceN, bottomWorld.clone().sub(endWorld).dot(faceN))
  desired.addScaledVector(narrowDir, centerWorld.clone().sub(endWorld).dot(narrowDir))

  return {
    position: {
      x: housed.position.x + (desired.x - endWorld.x),
      y: housed.position.y + (desired.y - endWorld.y),
      z: housed.position.z + (desired.z - endWorld.z),
    },
  }
}
