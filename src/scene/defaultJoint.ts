import type {
  BoardPart,
  Component,
  ComponentId,
  DadoJoint,
  Face,
  FingerJoint,
  HalfLapJoint,
  MortiseTenonJoint,
  ScrewJoint,
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

// The widest gap the rule leaves between two screws in one joint. A chosen figure — the spacing a
// shop reaches for on carcase work — not one derived from the fastener, the panel or any load.
// Change it and the screw count follows.
export const MAX_SCREW_SPACING = 250

// Chosen too: far enough from the end of a panel that a pilot does not split it, near enough that
// the corner is actually pulled together.
const SCREW_END_INSET = 30

// A #8 (⌀4.2) carcase screw: 5 mm clearance so the shank passes freely, 3 mm pilot so the thread
// bites, 30 mm of pilot for a 40 mm screw. Chosen figures — the screw itself is not modelled.
const CLEARANCE_DIAMETER = 5
const PILOT_DIAMETER = 3
const PILOT_DEPTH = 30

// The through panel is the housing and the receiving panel is the housed one — you screw through
// the side into the bottom's edge, the same pair a dado names.
export function defaultScrewJoint(
  through: BoardPart,
  receiving: BoardPart,
  throughFace: Face,
  receivingEnd: Face,
  id: string,
  label: string,
): ScrewJoint {
  const end = faceAxes(receivingEnd)
  // The joint line runs along whichever of the receiving end's two in-face axes is not the panel's
  // thickness — the line deriveScrewJoint spaces the screws on.
  const runAx = end.u === 'z' ? end.v : end.u
  const span = { x: receiving.length, y: receiving.width, z: receiving.thickness }[runAx]
  // One screw at each end, then intermediates until no gap is wider than the maximum.
  const run = span - 2 * SCREW_END_INSET
  return {
    kind: 'screw',
    id,
    label,
    driven: false,
    throughPartId: through.id,
    throughFace,
    receivingPartId: receiving.id,
    receivingEnd,
    screwCount: Math.max(2, Math.ceil(run / MAX_SCREW_SPACING) + 1),
    endInset: SCREW_END_INSET,
    clearanceDiameter: CLEARANCE_DIAMETER,
    pilotDiameter: PILOT_DIAMETER,
    pilotDepth: PILOT_DEPTH,
  }
}
