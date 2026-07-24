import * as THREE from 'three'
import type { BoardPart, BoxCut, CutId, Face, Part, Vec3 } from '../scene/types'
import type { MortiseTenonJoint } from '../scene/types'
import type { DeriveResult, DerivedCut } from './dado'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'

const DEG2RAD = Math.PI / 180
type Axis = 'x' | 'y' | 'z'
const EPS = 1e-4

const FACE_NORMALS: Record<Face, Vec3> = {
  '+X': { x: 1, y: 0, z: 0 },
  '-X': { x: -1, y: 0, z: 0 },
  '+Y': { x: 0, y: 1, z: 0 },
  '-Y': { x: 0, y: -1, z: 0 },
  '+Z': { x: 0, y: 0, z: 1 },
  '-Z': { x: 0, y: 0, z: -1 },
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
function boardDims(b: BoardPart): Record<Axis, number> {
  return { x: b.length, y: b.width, z: b.thickness }
}
function unitVec(a: Axis): Vec3 {
  return { x: a === 'x' ? 1 : 0, y: a === 'y' ? 1 : 0, z: a === 'z' ? 1 : 0 }
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
function isAxisAligned(b: BoardPart): boolean {
  const m = composeWorldMatrix(b)
  const cols = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ]
  return cols.every((c) => Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])) >= 1 - EPS)
}
function isPerpendicularSeat(
  mortise: BoardPart,
  mortiseFace: Face,
  tenon: BoardPart,
  tenonEnd: Face,
): boolean {
  return (
    localDirToWorld(mortise, FACE_NORMALS[mortiseFace]).dot(
      localDirToWorld(tenon, FACE_NORMALS[tenonEnd]),
    ) < -0.99
  )
}

export function isValidMortiseTenon(
  mortise: BoardPart,
  mortiseFace: Face,
  tenon: BoardPart,
  tenonEnd: Face,
): boolean {
  if (!isAxisAligned(mortise) || !isAxisAligned(tenon)) return false
  if (!isPerpendicularSeat(mortise, mortiseFace, tenon, tenonEnd)) return false
  return faceAxes(tenonEnd).depth !== 'z'
}

export function computeTenonShoulders(tenon: BoardPart, joint: MortiseTenonJoint): BoxCut[] {
  const dim = boardDims(tenon)
  const seatAx = faceAxes(joint.tenonEnd).depth
  const widthAx: Axis = seatAx === 'x' ? 'y' : 'x'
  const d = clamp(joint.tenonLength, 0.1, dim[seatAx] - 0.1)
  const tt = clamp(joint.tenonThickness, 0.1, dim.z)
  const tw = clamp(joint.tenonWidth, 0.1, dim[widthAx])
  const s0 = joint.tenonEnd.startsWith('+') ? dim[seatAx] - d : 0
  const zMargin = (dim.z - tt) / 2
  const wMargin = (dim[widthAx] - tw) / 2

  const make = (suffix: string, position: Vec3, size: Vec3): BoxCut => ({
    kind: 'box',
    id: `cut_${joint.id}_shoulder${suffix}` as CutId,
    label: `${joint.label} shoulder`,
    face: joint.tenonEnd,
    position,
    size,
    sourceJointId: joint.id,
  })
  const strip = (
    seatSize: number,
    waLo: number,
    waSize: number,
    zLo: number,
    zSize: number,
  ): [Vec3, Vec3] => {
    const position: Vec3 = { x: 0, y: 0, z: 0 }
    const size: Vec3 = { x: 0, y: 0, z: 0 }
    position[seatAx] = s0
    size[seatAx] = seatSize
    position[widthAx] = waLo
    size[widthAx] = waSize
    position.z = zLo
    size.z = zSize
    return [position, size]
  }

  const cuts: BoxCut[] = []
  if (zMargin > EPS) {
    cuts.push(make('Zhi', ...strip(d, 0, dim[widthAx], dim.z / 2 + tt / 2, zMargin)))
    cuts.push(make('Zlo', ...strip(d, 0, dim[widthAx], 0, zMargin)))
  }
  if (wMargin > EPS) {
    cuts.push(make('Whi', ...strip(d, dim[widthAx] / 2 + tw / 2, wMargin, 0, dim.z)))
    cuts.push(make('Wlo', ...strip(d, 0, wMargin, 0, dim.z)))
  }
  return cuts
}

export function computeMortisePocket(
  mortise: BoardPart,
  tenon: BoardPart,
  joint: MortiseTenonJoint,
): BoxCut {
  const dAx = faceAxes(joint.mortiseFace).depth
  const { u, v } = faceAxes(joint.mortiseFace)
  const dim = boardDims(mortise)
  const thicknessWorld = localDirToWorld(tenon, unitVec('z'))
  const uWorld = localDirToWorld(mortise, unitVec(u))
  const vWorld = localDirToWorld(mortise, unitVec(v))
  const thkAx: Axis =
    Math.abs(thicknessWorld.dot(uWorld)) >= Math.abs(thicknessWorld.dot(vWorld)) ? u : v
  const wAx: Axis = thkAx === u ? v : u

  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[dAx] = joint.through ? dim[dAx] : clamp(joint.tenonLength + joint.clearance, 0.1, dim[dAx])
  size[thkAx] = clamp(joint.tenonThickness + joint.clearance, 0.1, dim[thkAx])
  size[wAx] = clamp(joint.tenonWidth + joint.clearance, 0.1, dim[wAx])

  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[dAx] = joint.mortiseFace.startsWith('+') ? dim[dAx] - size[dAx] : 0
  position[u] = clamp(joint.offsetU - size[u] / 2, 0, dim[u] - size[u])
  position[v] = clamp(joint.offsetV - size[v] / 2, 0, dim[v] - size[v])

  return {
    kind: 'box',
    id: `cut_${joint.id}_mortise` as CutId,
    label: `${joint.label} mortise`,
    face: joint.mortiseFace,
    position,
    size,
    sourceJointId: joint.id,
  }
}

// Seed editable offsets at creation: project the tenon board's center onto the mortise face axes.
export function computeMortiseOffset(
  mortise: BoardPart,
  tenon: BoardPart,
  mortiseFace: Face,
): { offsetU: number; offsetV: number } {
  const { u, v } = faceAxes(mortiseFace)
  const dim = boardDims(mortise)
  const [cx, cy, cz] = applyMatrixToPoint(
    composeWorldMatrix(tenon),
    tenon.length / 2,
    tenon.width / 2,
    tenon.thickness / 2,
  )
  const rel = { x: cx - mortise.position.x, y: cy - mortise.position.y, z: cz - mortise.position.z }
  const uDir = localDirToWorld(mortise, unitVec(u))
  const vDir = localDirToWorld(mortise, unitVec(v))
  return {
    offsetU: clamp(rel.x * uDir.x + rel.y * uDir.y + rel.z * uDir.z, 0, dim[u]),
    offsetV: clamp(rel.x * vDir.x + rel.y * vDir.y + rel.z * vDir.z, 0, dim[v]),
  }
}

export function computeMortiseTenonSeat(
  mortise: BoardPart,
  tenon: BoardPart,
  joint: MortiseTenonJoint,
): { position: Vec3 } {
  const dAx = faceAxes(joint.mortiseFace).depth
  const { u, v } = faceAxes(joint.mortiseFace)
  const dim = boardDims(mortise)
  const d = clamp(joint.tenonLength, 0.1, dim[dAx])

  const endLocal = computeLocalFaceCenter(FACE_NORMALS[joint.tenonEnd], tenon)
  const [ex, ey, ez] = applyMatrixToPoint(
    composeWorldMatrix(tenon),
    endLocal.x,
    endLocal.y,
    endLocal.z,
  )
  const endWorld = new THREE.Vector3(ex, ey, ez)

  const mM = composeWorldMatrix(mortise)
  const faceCenter = computeLocalFaceCenter(FACE_NORMALS[joint.mortiseFace], mortise)
  const bottomLocal: Vec3 = { ...faceCenter }
  bottomLocal[dAx] = joint.mortiseFace.startsWith('+') ? dim[dAx] - d : d
  const [bx, by, bz] = applyMatrixToPoint(mM, bottomLocal.x, bottomLocal.y, bottomLocal.z)
  const bottomWorld = new THREE.Vector3(bx, by, bz)

  const centerLocal: Vec3 = { ...faceCenter }
  centerLocal[u] = joint.offsetU
  centerLocal[v] = joint.offsetV
  const [gx, gy, gz] = applyMatrixToPoint(mM, centerLocal.x, centerLocal.y, centerLocal.z)
  const centerWorld = new THREE.Vector3(gx, gy, gz)

  const faceN = localDirToWorld(mortise, FACE_NORMALS[joint.mortiseFace])
  const uDir = localDirToWorld(mortise, unitVec(u))
  const vDir = localDirToWorld(mortise, unitVec(v))

  const desired = endWorld.clone()
  desired.addScaledVector(faceN, bottomWorld.clone().sub(endWorld).dot(faceN))
  desired.addScaledVector(uDir, centerWorld.clone().sub(endWorld).dot(uDir))
  desired.addScaledVector(vDir, centerWorld.clone().sub(endWorld).dot(vDir))

  return {
    position: {
      x: tenon.position.x + (desired.x - endWorld.x),
      y: tenon.position.y + (desired.y - endWorld.y),
      z: tenon.position.z + (desired.z - endWorld.z),
    },
  }
}

export function deriveMortiseTenon(joint: MortiseTenonJoint, parts: Part[]): DeriveResult | null {
  const mortise = parts.find((p) => p.id === joint.mortisePartId)
  const tenon = parts.find((p) => p.id === joint.tenonPartId)
  if (mortise?.kind !== 'board' || tenon?.kind !== 'board') return null
  if (!isValidMortiseTenon(mortise, joint.mortiseFace, tenon, joint.tenonEnd)) return null
  const cuts: DerivedCut[] = [
    ...computeTenonShoulders(tenon, joint).map((cut) => ({ partId: tenon.id, cut })),
    { partId: mortise.id, cut: computeMortisePocket(mortise, tenon, joint) },
  ]
  const seat = {
    partId: tenon.id,
    position: computeMortiseTenonSeat(mortise, tenon, joint).position,
  }
  return { cuts, seat }
}
