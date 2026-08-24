import * as THREE from 'three'
import type {
  BoardPart,
  BoxCut,
  Component,
  ComponentId,
  CutId,
  DadoJoint,
  Face,
  Joint,
  Part,
  PartId,
  Vec3,
} from '../scene/types'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'
import { resolveWorldMatrix, applyMatrixToPoint, localDirToWorld } from './transform'
import { deriveHalfLap } from './halflap'
import { deriveMortiseTenon } from './mortisetenon'
import { deriveFingerJoint } from './fingerjoint'
import { deriveTongueGroove } from './tonguegroove'

type Axis = 'x' | 'y' | 'z'

export type DerivedCut = { partId: PartId; cut: BoxCut }
export type DeriveResult = { cuts: DerivedCut[]; seat?: { partId: PartId; position: Vec3 } }

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

function worldDir(part: BoardPart, dir: Vec3, byId: Map<ComponentId, Component>): THREE.Vector3 {
  const d = localDirToWorld(part, dir, byId)
  return new THREE.Vector3(d.x, d.y, d.z)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function isValidDadoSeat(
  housing: BoardPart,
  housingFace: Face,
  housed: BoardPart,
  housedEnd: Face,
  byId: Map<ComponentId, Component>,
): boolean {
  const hn = worldDir(housing, FACE_NORMALS[housingFace], byId)
  const en = worldDir(housed, FACE_NORMALS[housedEnd], byId)
  return hn.dot(en) < -0.99
}

export function deriveDadoAxes(
  housing: BoardPart,
  housed: BoardPart,
  housingFace: Face,
  byId: Map<ComponentId, Component>,
): { narrowAx: Axis; runAx: Axis } {
  const { u, v } = faceAxes(housingFace)
  const thicknessWorld = worldDir(housed, unitVec('z'), byId)
  const uWorld = worldDir(housing, unitVec(u), byId)
  const vWorld = worldDir(housing, unitVec(v), byId)
  const alignU = Math.abs(thicknessWorld.dot(uWorld))
  const alignV = Math.abs(thicknessWorld.dot(vWorld))
  return alignU >= alignV ? { narrowAx: u, runAx: v } : { narrowAx: v, runAx: u }
}

// The scalar behind defaultDadoDepth. Split out so a caller that knows only the housing's
// thickness — the carcase role table, sizing a panel to the groove it will sit in — gets the same
// number the joint will be seeded with instead of a second copy of the formula.
export function dadoDepthFor(housingDim: number): number {
  // The ceiling is applied last so it always wins. `clamp(v, 3, dim - 1)` inverted below 4 mm
  // stock — the 3 mm floor exceeded the `dim - 1` ceiling, `Math.max` took the tie, and a 3 mm
  // panel was seeded with a 3 mm groove. `computeDadoGroove` then clamped the cut to `dim - 1`
  // while the generator had already grown the housed panel by the larger figure, so the two
  // disagreed by the difference.
  //
  // `dim / 2` only takes over below 2 mm, where `dim - 1` stops leaving material behind. It keeps
  // the function total rather than adding a guard for stock nobody cuts.
  return Math.min(Math.max(Math.round(housingDim / 3), 3), Math.max(housingDim - 1, housingDim / 2))
}

export function defaultDadoDepth(housing: BoardPart, housingFace: Face): number {
  return dadoDepthFor(boardDims(housing)[faceAxes(housingFace).depth])
}

export function computeDadoOffset(
  housing: BoardPart,
  housed: BoardPart,
  housingFace: Face,
  byId: Map<ComponentId, Component>,
): number {
  const { narrowAx } = deriveDadoAxes(housing, housed, housingFace, byId)
  const [cx, cy, cz] = applyMatrixToPoint(
    resolveWorldMatrix(housed, byId),
    housed.length / 2,
    housed.width / 2,
    housed.thickness / 2,
  )
  const narrowDir = worldDir(housing, unitVec(narrowAx), byId)
  const raw =
    (cx - housing.position.x) * narrowDir.x +
    (cy - housing.position.y) * narrowDir.y +
    (cz - housing.position.z) * narrowDir.z
  const dim = boardDims(housing)
  const half = housed.thickness / 2
  return clamp(raw, half, dim[narrowAx] - half)
}

// True when the joint cuts a tongue on the housed end (rabbeted, and the housed
// end is a length/width end — a thickness end can't be reduced, so it falls back to plain).
export function hasTongue(joint: DadoJoint): boolean {
  return joint.profile === 'rabbeted' && faceAxes(joint.housedEnd).depth !== 'z'
}

export function computeDadoGroove(
  housing: BoardPart,
  housed: BoardPart,
  joint: DadoJoint,
  byId: Map<ComponentId, Component>,
): BoxCut {
  const { narrowAx, runAx } = deriveDadoAxes(housing, housed, joint.housingFace, byId)
  const dAx = faceAxes(joint.housingFace).depth
  const dim = boardDims(housing)
  const depth = clamp(joint.depth, 0.1, dim[dAx] - 1)
  const width =
    (hasTongue(joint)
      ? clamp(joint.tongueThickness, 0.1, housed.thickness - 0.1)
      : housed.thickness) + joint.clearance
  const ss = clamp(joint.stopStart, 0, dim[runAx] - 1)
  const se = clamp(joint.stopEnd, 0, dim[runAx] - 1 - ss) // leave ≥ 1 mm of groove
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[dAx] = depth
  size[narrowAx] = width
  size[runAx] = dim[runAx] - ss - se
  const offset = clamp(joint.offset, width / 2, dim[narrowAx] - width / 2)
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[dAx] = joint.housingFace.startsWith('+') ? dim[dAx] - depth : 0
  position[runAx] = ss
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
  byId: Map<ComponentId, Component>,
): { position: Vec3 } {
  const { narrowAx } = deriveDadoAxes(housing, housed, joint.housingFace, byId)
  const dAx = faceAxes(joint.housingFace).depth
  const dim = boardDims(housing)
  const depth = clamp(joint.depth, 0.1, dim[dAx] - 1)

  const endLocal = computeLocalFaceCenter(FACE_NORMALS[joint.housedEnd], housed)
  if (hasTongue(joint)) {
    const t = clamp(joint.tongueThickness, 0.1, housed.thickness - 0.1)
    endLocal.z = joint.rabbetFace === '+Z' ? t / 2 : housed.thickness - t / 2
  }
  const [ex, ey, ez] = applyMatrixToPoint(
    resolveWorldMatrix(housed, byId),
    endLocal.x,
    endLocal.y,
    endLocal.z,
  )
  const endWorld = new THREE.Vector3(ex, ey, ez)

  const gM = resolveWorldMatrix(housing, byId)
  const faceCenter = computeLocalFaceCenter(FACE_NORMALS[joint.housingFace], housing)

  const bottomLocal: Vec3 = { ...faceCenter }
  bottomLocal[dAx] = joint.housingFace.startsWith('+') ? dim[dAx] - depth : depth
  const [bx, by, bz] = applyMatrixToPoint(gM, bottomLocal.x, bottomLocal.y, bottomLocal.z)
  const bottomWorld = new THREE.Vector3(bx, by, bz)

  const centerLocal: Vec3 = { ...faceCenter }
  centerLocal[narrowAx] = joint.offset
  const [gx, gy, gz] = applyMatrixToPoint(gM, centerLocal.x, centerLocal.y, centerLocal.z)
  const centerWorld = new THREE.Vector3(gx, gy, gz)

  const faceN = worldDir(housing, FACE_NORMALS[joint.housingFace], byId)
  const narrowDir = worldDir(housing, unitVec(narrowAx), byId)

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

export function computeRabbet(_housing: BoardPart, housed: BoardPart, joint: DadoJoint): BoxCut {
  const dim = boardDims(housed)
  const seatAx = faceAxes(joint.housedEnd).depth
  // Precondition: hasTongue(joint) is true (seatAx ∈ {'x','y'}); deriveJoint enforces it.
  const widthAx: Axis = seatAx === 'x' ? 'y' : 'x'
  const thickness = housed.thickness
  const t = clamp(joint.tongueThickness, 0.1, thickness - 0.1)
  const len = clamp(joint.depth, 0.1, dim[seatAx] - 0.1)
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[seatAx] = len
  size[widthAx] = dim[widthAx]
  size.z = thickness - t
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[seatAx] = joint.housedEnd.startsWith('+') ? dim[seatAx] - len : 0
  position[widthAx] = 0
  position.z = joint.rabbetFace === '+Z' ? t : 0
  return {
    kind: 'box',
    id: `cut_${joint.id}_rabbet` as CutId,
    label: `${joint.label} tongue`,
    face: joint.rabbetFace,
    position,
    size,
    sourceJointId: joint.id,
  }
}

// Corner box removed from the housed board at one stopped end so its front corner
// clears the un-grooved solid housing. Precondition (enforced by deriveJoint): the
// housed end is a length/width end (faceAxes(joint.housedEnd).depth !== 'z').
export function computeNotch(
  housing: BoardPart,
  housed: BoardPart,
  joint: DadoJoint,
  end: 'start' | 'end',
  byId: Map<ComponentId, Component>,
): BoxCut {
  const dim = boardDims(housed)
  const seatAx = faceAxes(joint.housedEnd).depth
  const widthAx: Axis = seatAx === 'x' ? 'y' : 'x'
  const d = clamp(joint.depth, 0.1, dim[seatAx] - 0.1) // notch-back distance = groove depth
  const stop = clamp(end === 'start' ? joint.stopStart : joint.stopEnd, 0.1, dim[widthAx] - 0.1)

  const { runAx } = deriveDadoAxes(housing, housed, joint.housingFace, byId)
  const aligned =
    worldDir(housed, unitVec(widthAx), byId).dot(worldDir(housing, unitVec(runAx), byId)) > 0
  const atLow = (end === 'start') === aligned // notch sits at housed widthAx 0 vs the far end

  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[seatAx] = d
  size[widthAx] = stop
  size.z = housed.thickness // full thickness — removes the tongue too if rabbeted
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[seatAx] = joint.housedEnd.startsWith('+') ? dim[seatAx] - d : 0
  position[widthAx] = atLow ? 0 : dim[widthAx] - stop
  position.z = 0

  return {
    kind: 'box',
    id: `cut_${joint.id}_notch${end === 'start' ? 0 : 1}` as CutId,
    label: `${joint.label} notch`,
    face: joint.housedEnd,
    position,
    size,
    sourceJointId: joint.id,
  }
}

export function deriveJoint(
  joint: Joint,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): DeriveResult | null {
  switch (joint.kind) {
    case 'dado':
      return deriveDadoJoint(joint, parts, byId)
    case 'halflap':
      return deriveHalfLap(joint, parts, byId)
    case 'mortise-tenon':
      return deriveMortiseTenon(joint, parts, byId)
    case 'finger':
      return deriveFingerJoint(joint, parts, byId)
    case 'tongue-groove':
      return deriveTongueGroove(joint, parts, byId)
  }
}

// Returns null when the joint is stale/invalid (missing/non-board parts, or a
// non-perpendicular seat); the caller preserves last-good geometry.
function deriveDadoJoint(
  joint: DadoJoint,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): DeriveResult | null {
  const housing = parts.find((p) => p.id === joint.housingPartId)
  const housed = parts.find((p) => p.id === joint.housedPartId)
  if (housing?.kind !== 'board' || housed?.kind !== 'board') return null
  if (!isValidDadoSeat(housing, joint.housingFace, housed, joint.housedEnd, byId)) return null

  const notchable = faceAxes(joint.housedEnd).depth !== 'z' // housed seats on a length/width end
  const cuts: DerivedCut[] = [
    { partId: housing.id, cut: computeDadoGroove(housing, housed, joint, byId) },
  ]
  if (hasTongue(joint)) {
    cuts.push({ partId: housed.id, cut: computeRabbet(housing, housed, joint) })
  }
  if (notchable && joint.stopStart > 0) {
    cuts.push({ partId: housed.id, cut: computeNotch(housing, housed, joint, 'start', byId) })
  }
  if (notchable && joint.stopEnd > 0) {
    cuts.push({ partId: housed.id, cut: computeNotch(housing, housed, joint, 'end', byId) })
  }
  const seat = {
    partId: housed.id,
    position: computeDadoSeat(housing, housed, joint, byId).position,
  }
  return { cuts, seat }
}
