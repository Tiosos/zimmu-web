import type { BoardPart, DadoJoint, Face, MortiseTenonJoint } from './types'
import { computeDadoOffset, defaultDadoDepth } from '../geom/dado'
import { computeMortiseOffset } from '../geom/mortisetenon'

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
): DadoJoint {
  return {
    kind: 'dado',
    id,
    label,
    housingPartId: housing.id,
    housingFace,
    housedPartId: housed.id,
    housedEnd,
    offset: computeDadoOffset(housing, housed, housingFace),
    depth: defaultDadoDepth(housing, housingFace),
    clearance: 0,
    profile: 'plain',
    tongueThickness: Math.round(housed.thickness / 2),
    rabbetFace: '+Z',
    stopStart: 0,
    stopEnd: 0,
  }
}

export function defaultMortiseTenonJoint(
  mortise: BoardPart,
  tenon: BoardPart,
  mortiseFace: Face,
  tenonEnd: Face,
  id: string,
  label: string,
): MortiseTenonJoint {
  const tenonThickness = Math.round(tenon.thickness / 3)
  const { offsetU, offsetV } = computeMortiseOffset(mortise, tenon, mortiseFace)
  return {
    kind: 'mortise-tenon',
    id,
    label,
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
