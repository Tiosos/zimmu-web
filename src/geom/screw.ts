import type {
  BoardPart,
  Component,
  ComponentId,
  CutId,
  HoleArrayCut,
  Part,
  ScrewJoint,
  Vec3,
} from '../scene/types'
import type { DeriveResult, DerivedCut } from './dado'
import { faceAxes } from '../scene/snapMath'
import {
  applyInverseToPoint,
  applyMatrixToPoint,
  localDirToWorld,
  resolveWorldMatrix,
} from './transform'

type Axis = 'x' | 'y' | 'z'

function boardDims(b: BoardPart): Record<Axis, number> {
  return { x: b.length, y: b.width, z: b.thickness }
}

function unitVec(axis: Axis): Vec3 {
  return { x: axis === 'x' ? 1 : 0, y: axis === 'y' ? 1 : 0, z: axis === 'z' ? 1 : 0 }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// Two panels butted face to edge and screwed: clearance holes through the face of one, blind
// pilots into the end of the other, at the same points. The row is one line in space, so it is
// built once on the receiving panel and then carried into the through panel's own frame — that is
// what keeps the two rows on the same points whatever either panel's rotation.
//
// Returns null when the joint is stale (missing or non-board parts); the caller preserves
// last-good geometry.
export function deriveScrewJoint(
  joint: ScrewJoint,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): DeriveResult | null {
  const through = parts.find((p) => p.id === joint.throughPartId)
  const receiving = parts.find((p) => p.id === joint.receivingPartId)
  if (through?.kind !== 'board' || receiving?.kind !== 'board') return null

  const endAxes = faceAxes(joint.receivingEnd)
  // A board carries its thickness on local z, so an end whose depth axis *is* z is the panel's
  // broad face. Two faces meeting flat have no joint line to space screws along and no thickness
  // to centre the pilots in, which is a different joint than this one describes.
  if (endAxes.depth === 'z') return null

  const recvDims = boardDims(receiving)
  // The joint line is the receiving panel's end, running along whichever of that end's two in-face
  // axes is not the thickness. The pilots have to fall inside it; the panel screwed through only
  // has to reach it.
  const runAx: Axis = endAxes.u === 'z' ? endAxes.v : endAxes.u
  const span = recvDims[runAx]
  const inset = clamp(joint.endInset, 0, span / 2)
  // Spacing is not stored: it follows from the count and the panel's current length, so a resized
  // panel keeps its screws within it. A lone screw has no spacing — and the division would be
  // Infinity, which serializes as null.
  const pitch = joint.screwCount > 1 ? (span - 2 * inset) / (joint.screwCount - 1) : 0

  const pilotStart: Vec3 = { x: 0, y: 0, z: 0 }
  pilotStart[endAxes.depth] = joint.receivingEnd.startsWith('+') ? recvDims[endAxes.depth] : 0
  pilotStart[runAx] = inset
  pilotStart.z = receiving.thickness / 2

  const pilot: HoleArrayCut = {
    kind: 'hole-array',
    id: `cut_${joint.id}_pilot` as CutId,
    label: `${joint.label} pilots`,
    face: joint.receivingEnd,
    axis: runAx === endAxes.u ? 'U' : 'V',
    start: pilotStart,
    pitch,
    count: joint.screwCount,
    diameter: joint.pilotDiameter,
    // Blind, and clamped rather than trusted: a screw that reaches the far face bursts out of it.
    // Same 1 mm of material a dado groove leaves behind its floor.
    depth: clamp(joint.pilotDepth, 0.1, recvDims[endAxes.depth] - 1),
    sourceJointId: joint.id,
  }

  const throughAxes = faceAxes(joint.throughFace)
  const throughDims = boardDims(through)
  const runWorld = localDirToWorld(receiving, unitVec(runAx), byId)
  // Which of the through face's two in-face axes the joint line runs along, decided by comparing
  // world directions — the same way deriveDadoAxes decides where a groove runs, so a screw row
  // follows the line a dado would have.
  const alongU =
    Math.abs(dot(runWorld, localDirToWorld(through, unitVec(throughAxes.u), byId))) >=
    Math.abs(dot(runWorld, localDirToWorld(through, unitVec(throughAxes.v), byId)))
  const runDot = dot(
    runWorld,
    localDirToWorld(through, unitVec(alongU ? throughAxes.u : throughAxes.v), byId),
  )
  // A row only ever marches its axis upwards — pitch is a positive step from `start` — so when the
  // joint line runs the other way the through panel's row starts from the last screw instead.
  const anchorIndex = runDot >= 0 ? 0 : Math.max(0, joint.screwCount - 1)
  const anchorLocal: Vec3 = { ...pilotStart }
  anchorLocal[runAx] += pitch * anchorIndex
  const [wx, wy, wz] = applyMatrixToPoint(
    resolveWorldMatrix(receiving, byId),
    anchorLocal.x,
    anchorLocal.y,
    anchorLocal.z,
  )
  const [lx, ly, lz] = applyInverseToPoint(resolveWorldMatrix(through, byId), wx, wy, wz)
  const clearanceStart: Vec3 = { x: lx, y: ly, z: lz }
  // The anchor sits on the two panels' contact plane, so this only snaps it back from whatever the
  // matrix round trip left; it is the face the bore is drilled from.
  clearanceStart[throughAxes.depth] = joint.throughFace.startsWith('+')
    ? throughDims[throughAxes.depth]
    : 0

  const clearance: HoleArrayCut = {
    kind: 'hole-array',
    id: `cut_${joint.id}_clearance` as CutId,
    label: `${joint.label} clearance`,
    face: joint.throughFace,
    axis: alongU ? 'U' : 'V',
    start: clearanceStart,
    pitch,
    count: joint.screwCount,
    diameter: joint.clearanceDiameter,
    // Exactly the panel's extent, not a hair under: the shop drawing dashes a bore whose depth is
    // less than that, and this one is meant to read as passing right through.
    depth: throughDims[throughAxes.depth],
    sourceJointId: joint.id,
  }

  const cuts: DerivedCut[] = [
    { partId: through.id, cut: clearance },
    { partId: receiving.id, cut: pilot },
  ]
  // No seat. A dado returns one because the housed board drops into the groove; screwing a butt
  // joint moves neither panel, and a seat here would shift the cabinet.
  return { cuts }
}
