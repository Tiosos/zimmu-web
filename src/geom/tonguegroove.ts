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
import type { TongueGrooveJoint } from '../scene/types'
import type { DeriveResult, DerivedCut } from './dado'
import { applyMatrixToPoint, resolveWorldMatrix } from './transform'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'

const DEG2RAD = Math.PI / 180
type Axis = 'x' | 'y' | 'z'
const EPS = 1e-4
const THICK_EPS = 0.01

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
function isAxisAligned(b: BoardPart, byId: Map<ComponentId, Component>): boolean {
  const m = resolveWorldMatrix(b, byId)
  const cols = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ]
  return cols.every((c) => Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])) >= 1 - EPS)
}
function worldPoint(m: Float64Array, p: Vec3): THREE.Vector3 {
  const [x, y, z] = applyMatrixToPoint(m, p.x, p.y, p.z)
  return new THREE.Vector3(x, y, z)
}

export function isValidTongueGroove(
  groove: BoardPart,
  grooveEdge: Face,
  tongue: BoardPart,
  tongueEdge: Face,
  byId: Map<ComponentId, Component>,
): boolean {
  if (!isAxisAligned(groove, byId) || !isAxisAligned(tongue, byId)) return false
  // Both faces must be long edges (their depth axis is width = local Y).
  if (faceAxes(grooveEdge).depth !== 'y' || faceAxes(tongueEdge).depth !== 'y') return false
  // Edges must face each other (anti-parallel world normals).
  const nG = localDirToWorld(groove, FACE_NORMALS[grooveEdge])
  const nT = localDirToWorld(tongue, FACE_NORMALS[tongueEdge])
  if (nG.dot(nT) > -(1 - EPS)) return false
  // Boards must be coplanar: thickness axes parallel (else it's a T-meeting, not a glue-up).
  const zG = localDirToWorld(groove, unitVec('z'))
  const zT = localDirToWorld(tongue, unitVec('z'))
  if (Math.abs(zG.dot(zT)) < 1 - EPS) return false
  // A centered tongue only meets a centered groove when thicknesses match.
  return Math.abs(groove.thickness - tongue.thickness) < THICK_EPS
}

export function computeGrooveCut(groove: BoardPart, joint: TongueGrooveJoint): BoxCut {
  const { depth: depthAx, u: runAx, v: narrowAx } = faceAxes(joint.grooveEdge)
  const dim = boardDims(groove)
  const width = clamp(joint.tongueThickness, 0.1, dim[narrowAx] - 0.1) + joint.clearance
  const depth = clamp(joint.tongueDepth, 0.1, dim[depthAx] - 1)
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[runAx] = dim[runAx] // full length (through groove)
  size[depthAx] = depth
  size[narrowAx] = width
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[runAx] = 0
  position[depthAx] = joint.grooveEdge.startsWith('+') ? dim[depthAx] - depth : 0
  position[narrowAx] = dim[narrowAx] / 2 - width / 2 // centered in thickness
  return {
    kind: 'box',
    id: `cut_${joint.id}_groove` as CutId,
    label: `${joint.label} groove`,
    face: joint.grooveEdge,
    position,
    size,
    sourceJointId: joint.id,
  }
}

export function computeTongueShoulders(tongue: BoardPart, joint: TongueGrooveJoint): BoxCut[] {
  const { depth: depthAx, u: runAx, v: narrowAx } = faceAxes(joint.tongueEdge)
  const dim = boardDims(tongue)
  const t = clamp(joint.tongueThickness, 0.1, dim[narrowAx] - 0.1)
  const shoulder = (dim[narrowAx] - t) / 2
  const depth = clamp(joint.tongueDepth, 0.1, dim[depthAx] - 1)
  const posDepth = joint.tongueEdge.startsWith('+') ? dim[depthAx] - depth : 0
  const mk = (side: 0 | 1): BoxCut => {
    const size: Vec3 = { x: 0, y: 0, z: 0 }
    size[runAx] = dim[runAx]
    size[depthAx] = depth
    size[narrowAx] = shoulder
    const position: Vec3 = { x: 0, y: 0, z: 0 }
    position[runAx] = 0
    position[depthAx] = posDepth
    position[narrowAx] = side === 0 ? 0 : dim[narrowAx] - shoulder
    return {
      kind: 'box',
      id: `cut_${joint.id}_shoulder${side}` as CutId,
      label: `${joint.label} shoulder`,
      face: joint.tongueEdge,
      position,
      size,
      sourceJointId: joint.id,
    }
  }
  return [mk(0), mk(1)]
}

// Seats the tongue board so its tongue enters the groove: tongue edge → groove bottom (along the
// groove edge normal), thickness mid-planes aligned, length preserved. Minimal & idempotent.
export function computeTongueGrooveSeat(
  groove: BoardPart,
  tongue: BoardPart,
  joint: TongueGrooveJoint,
  byId: Map<ComponentId, Component>,
): { position: Vec3 } {
  const mG = resolveWorldMatrix(groove, byId)
  const mT = resolveWorldMatrix(tongue, byId)
  const depth = clamp(joint.tongueDepth, 0.1, groove.width - 1)

  const nG = localDirToWorld(groove, FACE_NORMALS[joint.grooveEdge]) // groove edge normal (world)
  const tG = localDirToWorld(groove, unitVec('z')) // groove thickness normal (world)

  const gEdgeCenter = worldPoint(mG, computeLocalFaceCenter(FACE_NORMALS[joint.grooveEdge], groove))
  const gCenter = worldPoint(mG, {
    x: groove.length / 2,
    y: groove.width / 2,
    z: groove.thickness / 2,
  })
  const tEdgeCenter = worldPoint(mT, computeLocalFaceCenter(FACE_NORMALS[joint.tongueEdge], tongue))

  const desiredNG = gEdgeCenter.dot(nG) - depth // tongue tip seats to the groove bottom
  const desiredTG = gCenter.dot(tG) // thickness mid-planes coincide

  const desired = tEdgeCenter.clone()
  desired.addScaledVector(nG, desiredNG - tEdgeCenter.dot(nG))
  desired.addScaledVector(tG, desiredTG - tEdgeCenter.dot(tG))
  // The third world axis (the groove's run/length direction) is left untouched → length preserved.

  return {
    position: {
      x: tongue.position.x + (desired.x - tEdgeCenter.x),
      y: tongue.position.y + (desired.y - tEdgeCenter.y),
      z: tongue.position.z + (desired.z - tEdgeCenter.z),
    },
  }
}

export function deriveTongueGroove(
  joint: TongueGrooveJoint,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): DeriveResult | null {
  const groove = parts.find((p) => p.id === joint.groovePartId)
  const tongue = parts.find((p) => p.id === joint.tonguePartId)
  if (groove?.kind !== 'board' || tongue?.kind !== 'board') return null
  if (!isValidTongueGroove(groove, joint.grooveEdge, tongue, joint.tongueEdge, byId)) return null
  const cuts: DerivedCut[] = [
    { partId: groove.id, cut: computeGrooveCut(groove, joint) },
    ...computeTongueShoulders(tongue, joint).map((cut) => ({ partId: tongue.id, cut })),
  ]
  const seat = {
    partId: tongue.id,
    position: computeTongueGrooveSeat(groove, tongue, joint, byId).position,
  }
  return { cuts, seat }
}
