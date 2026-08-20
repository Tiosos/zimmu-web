import * as THREE from 'three'
import type {
  BoardPart,
  BoxCut,
  Component,
  ComponentId,
  CutId,
  Face,
  Part,
  Vec3,
} from '../scene/types'
import type { FingerJoint } from '../scene/types'
import type { DeriveResult, DerivedCut } from './dado'
import { applyMatrixToPoint, resolveWorldMatrix, localDirToWorld } from './transform'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'

type Axis = 'x' | 'y' | 'z'
const EPS = 1e-4
const WIDTH_EPS = 0.01

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
function worldDir(part: BoardPart, dir: Vec3, byId: Map<ComponentId, Component>): THREE.Vector3 {
  const d = localDirToWorld(part, dir, byId)
  return new THREE.Vector3(d.x, d.y, d.z)
}
function isAxisAligned(b: BoardPart, byId: Map<ComponentId, Component>): boolean {
  const m = resolveWorldMatrix(b, byId)
  const cols = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ]
  return cols.every((c) => Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])) >= 1 - EPS)
}
// The non-thickness in-plane axis of an end face — the finger (shared-edge) direction.
function fingerAxisOf(end: Face): Axis {
  return faceAxes(end).depth === 'x' ? 'y' : 'x'
}
function worldPoint(m: Float64Array, p: Vec3): THREE.Vector3 {
  const [x, y, z] = applyMatrixToPoint(m, p.x, p.y, p.z)
  return new THREE.Vector3(x, y, z)
}

export function isValidFingerJoint(
  a: BoardPart,
  endA: Face,
  b: BoardPart,
  endB: Face,
  byId: Map<ComponentId, Component>,
): boolean {
  if (!isAxisAligned(a, byId) || !isAxisAligned(b, byId)) return false
  if (faceAxes(endA).depth === 'z' || faceAxes(endB).depth === 'z') return false
  const nA = worldDir(a, FACE_NORMALS[endA], byId)
  const nB = worldDir(b, FACE_NORMALS[endB], byId)
  if (Math.abs(nA.dot(nB)) > EPS) return false // ends must be perpendicular (90° corner)
  const fA = worldDir(a, unitVec(fingerAxisOf(endA)), byId)
  const fB = worldDir(b, unitVec(fingerAxisOf(endB)), byId)
  if (Math.abs(fA.dot(fB)) < 1 - EPS) return false // finger axes must be parallel (shared edge)
  return Math.abs(boardDims(a)[fingerAxisOf(endA)] - boardDims(b)[fingerAxisOf(endB)]) < WIDTH_EPS
}

export function computeFingerCuts(
  board: BoardPart,
  end: Face,
  joint: FingerJoint,
  matingThickness: number,
  removeParity: 0 | 1,
  flip: boolean,
): BoxCut[] {
  const N = joint.fingerCount
  if (N < 2) return []
  const dim = boardDims(board)
  const seatAx = faceAxes(end).depth
  const fingerAx = fingerAxisOf(end)
  const W = dim[fingerAx]
  const seg = W / N
  const depth = clamp(matingThickness, 0.1, dim[seatAx])
  const s0 = end.startsWith('+') ? dim[seatAx] - depth : 0
  const half = joint.clearance / 2

  const cuts: BoxCut[] = []
  for (let i = 0; i < N; i++) {
    const worldIndex = flip ? N - 1 - i : i
    if (worldIndex % 2 !== removeParity) continue
    const lo = clamp(i * seg - half, 0, W)
    const hi = clamp((i + 1) * seg + half, 0, W)
    const position: Vec3 = { x: 0, y: 0, z: 0 }
    const size: Vec3 = { x: 0, y: 0, z: 0 }
    position[seatAx] = s0
    size[seatAx] = depth
    position[fingerAx] = lo
    size[fingerAx] = hi - lo
    position.z = 0
    size.z = dim.z
    cuts.push({
      kind: 'box',
      id: `cut_${joint.id}_finger${i}` as CutId,
      label: `${joint.label} finger`,
      face: end,
      position,
      size,
      sourceJointId: joint.id,
    })
  }
  return cuts
}

// Seats B so its end-region interpenetrates A's to a flush right-angle corner. Three world-plane
// alignments in A's orthonormal frame; the corner side (which of A's thickness faces) is picked
// nearest B's current end, so the move is minimal and idempotent once seated.
export function computeFingerSeat(
  a: BoardPart,
  b: BoardPart,
  joint: FingerJoint,
  byId: Map<ComponentId, Component>,
): { position: Vec3 } {
  const mA = resolveWorldMatrix(a, byId)
  const mB = resolveWorldMatrix(b, byId)
  const Tb = b.thickness

  const nA = worldDir(a, FACE_NORMALS[joint.endA], byId) // A's end normal
  const fA = worldDir(a, unitVec(fingerAxisOf(joint.endA)), byId) // A's width
  const tA = worldDir(a, unitVec('z'), byId) // A's thickness normal

  const aEndCenter = worldPoint(mA, computeLocalFaceCenter(FACE_NORMALS[joint.endA], a))
  const aCenter = worldPoint(mA, { x: a.length / 2, y: a.width / 2, z: a.thickness / 2 })
  const aFaceLo = worldPoint(mA, computeLocalFaceCenter(FACE_NORMALS['-Z'], a))
  const aFaceHi = worldPoint(mA, computeLocalFaceCenter(FACE_NORMALS['+Z'], a))
  const endWorldB = worldPoint(mB, computeLocalFaceCenter(FACE_NORMALS[joint.endB], b))

  const desiredNA = aEndCenter.dot(nA) - Tb / 2 // B's end-center sits half a thickness inside A's end plane
  const desiredFA = aCenter.dot(fA) // width-center aligned
  const curT = endWorldB.dot(tA)
  const loT = aFaceLo.dot(tA)
  const hiT = aFaceHi.dot(tA)
  const desiredTA = Math.abs(curT - loT) <= Math.abs(curT - hiT) ? loT : hiT // nearest outer face

  const desired = endWorldB.clone()
  desired.addScaledVector(nA, desiredNA - endWorldB.dot(nA))
  desired.addScaledVector(fA, desiredFA - endWorldB.dot(fA))
  desired.addScaledVector(tA, desiredTA - endWorldB.dot(tA))

  return {
    position: {
      x: b.position.x + (desired.x - endWorldB.x),
      y: b.position.y + (desired.y - endWorldB.y),
      z: b.position.z + (desired.z - endWorldB.z),
    },
  }
}

export function deriveFingerJoint(
  joint: FingerJoint,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): DeriveResult | null {
  const a = parts.find((p) => p.id === joint.partAId)
  const b = parts.find((p) => p.id === joint.partBId)
  if (a?.kind !== 'board' || b?.kind !== 'board') return null
  if (!isValidFingerJoint(a, joint.endA, b, joint.endB, byId)) return null
  const fA = worldDir(a, unitVec(fingerAxisOf(joint.endA)), byId)
  const fB = worldDir(b, unitVec(fingerAxisOf(joint.endB)), byId)
  const flip = fA.dot(fB) < 0
  const cuts: DerivedCut[] = [
    ...computeFingerCuts(a, joint.endA, joint, b.thickness, 1, false).map((cut) => ({
      partId: a.id,
      cut,
    })),
    ...computeFingerCuts(b, joint.endB, joint, a.thickness, 0, flip).map((cut) => ({
      partId: b.id,
      cut,
    })),
  ]
  const seat = { partId: b.id, position: computeFingerSeat(a, b, joint, byId).position }
  return { cuts, seat }
}
