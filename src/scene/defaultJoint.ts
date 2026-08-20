import type {
  BoardPart,
  Component,
  ComponentId,
  DadoJoint,
  Face,
  FingerJoint,
  HalfLapJoint,
  MortiseTenonJoint,
  TongueGrooveJoint,
} from './types'
import { computeDadoOffset, defaultDadoDepth } from '../geom/dado'
import { computeMortiseOffset } from '../geom/mortisetenon'
import { faceAxes } from './snapMath'

// Seeded joint parameters, extracted from useScene's creators so a caller that only wants to
// *preview* a joint can build the same object the creator would without touching scene state.
//
// `id` and `label` are parameters rather than generated here on purpose: the cut-geometry
// functions (computeDadoGroove, computeMortisePocket, computeTenonShoulders) read them only to
// stamp the resulting BoxCut's id/label/sourceJointId — position and size do not depend on them.
// A preview can therefore pass placeholders and skip crypto.randomUUID() and the joint counter,
// while the real creators pass the values they already derive.

export function defaultDadoJoint(
  housing: BoardPart,
  housed: BoardPart,
  housingFace: Face,
  housedEnd: Face,
  id: string,
  label: string,
  byId: Map<ComponentId, Component>,
): DadoJoint {
  return {
    kind: 'dado',
    id,
    label,
    driven: false,
    housingPartId: housing.id,
    housingFace,
    housedPartId: housed.id,
    housedEnd,
    offset: computeDadoOffset(housing, housed, housingFace, byId),
    depth: defaultDadoDepth(housing, housingFace),
    clearance: 0,
    profile: 'plain',
    tongueThickness: Math.round(housed.thickness / 2),
    rabbetFace: '+Z',
    stopStart: 0,
    stopEnd: 0,
  }
}

export function defaultHalfLapJoint(
  a: BoardPart,
  b: BoardPart,
  id: string,
  label: string,
): HalfLapJoint {
  return {
    kind: 'halflap',
    id,
    label,
    driven: false,
    partAId: a.id,
    partBId: b.id,
    split: 0.5,
    clearance: 0,
  }
}

export function defaultMortiseTenonJoint(
  mortise: BoardPart,
  tenon: BoardPart,
  mortiseFace: Face,
  tenonEnd: Face,
  id: string,
  label: string,
  byId: Map<ComponentId, Component>,
): MortiseTenonJoint {
  const tenonThickness = Math.round(tenon.thickness / 3)
  const { offsetU, offsetV } = computeMortiseOffset(mortise, tenon, mortiseFace, byId)
  return {
    kind: 'mortise-tenon',
    id,
    label,
    driven: false,
    mortisePartId: mortise.id,
    mortiseFace,
    tenonPartId: tenon.id,
    tenonEnd,
    tenonLength: Math.round((mortise.thickness * 2) / 3),
    tenonThickness,
    tenonWidth: Math.max(0.1, tenon.width - 2 * tenonThickness),
    clearance: 0,
    through: false,
    offsetU,
    offsetV,
  }
}

export function defaultFingerJoint(
  a: BoardPart,
  b: BoardPart,
  endA: Face,
  endB: Face,
  id: string,
  label: string,
): FingerJoint {
  const widthA = faceAxes(endA).depth === 'x' ? a.width : a.length
  return {
    kind: 'finger',
    id,
    label,
    driven: false,
    partAId: a.id,
    endA,
    partBId: b.id,
    endB,
    fingerCount: Math.min(15, Math.max(3, Math.round(widthA / (2 * a.thickness)))),
    clearance: 0,
  }
}

export function defaultTongueGrooveJoint(
  groove: BoardPart,
  tongue: BoardPart,
  grooveEdge: Face,
  tongueEdge: Face,
  id: string,
  label: string,
): TongueGrooveJoint {
  return {
    kind: 'tongue-groove',
    id,
    label,
    driven: false,
    groovePartId: groove.id,
    grooveEdge,
    tonguePartId: tongue.id,
    tongueEdge,
    tongueThickness: Math.min(Math.max(3, Math.round(groove.thickness / 3)), groove.thickness - 2),
    tongueDepth: Math.min(8, Math.floor(Math.min(groove.width, tongue.width) / 2) - 1),
    clearance: 0,
  }
}
