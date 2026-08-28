import type { BoardPart, Component, ComponentId, Face, Joint, Part } from './types'
import { isValidDadoSeat } from '../geom/dado'
import { defaultDadoJoint, defaultScrewJoint } from './defaultJoint'
import { faceAxes } from './snapMath'

// The two kinds that describe one pairing: a panel's face, and the perpendicular end of the panel
// meeting it. carcaseJoints emits one or the other for exactly the same role pairs with the same
// two faces, which is what makes them interchangeable. No other kind of the union names its parts
// that way — a finger joint meets two *ends* at a corner, and which end of the housing panel that
// is cannot be read off a joint naming its face instead, so none is offered.
export type ConvertibleKind = 'dado' | 'screw'

export const CONVERTIBLE_KIND_LABEL: Record<ConvertibleKind, string> = {
  dado: 'Dado',
  screw: 'Screw fixing',
}

interface Seat {
  housing: BoardPart
  housingFace: Face
  housed: BoardPart
  housedEnd: Face
}

function seatOf(joint: Joint, parts: Part[]): Seat | null {
  const pair =
    joint.kind === 'dado'
      ? {
          housingId: joint.housingPartId,
          housingFace: joint.housingFace,
          housedId: joint.housedPartId,
          housedEnd: joint.housedEnd,
        }
      : joint.kind === 'screw'
        ? {
            housingId: joint.throughPartId,
            housingFace: joint.throughFace,
            housedId: joint.receivingPartId,
            housedEnd: joint.receivingEnd,
          }
        : null
  if (pair === null) return null

  const housing = parts.find((p) => p.id === pair.housingId)
  const housed = parts.find((p) => p.id === pair.housedId)
  if (housing?.kind !== 'board' || housed?.kind !== 'board') return null
  return { housing, housingFace: pair.housingFace, housed, housedEnd: pair.housedEnd }
}

function legalKinds(seat: Seat, byId: Map<ComponentId, Component>): ConvertibleKind[] {
  if (!isValidDadoSeat(seat.housing, seat.housingFace, seat.housed, seat.housedEnd, byId)) return []
  // A screw needs a real edge to drive into: an end whose depth axis is the board's thickness is
  // its broad face, which has no thickness to centre a pilot in. That is the case deriveScrewJoint
  // refuses, and offering it would only produce a joint with no holes.
  return faceAxes(seat.housedEnd).depth === 'z' ? ['dado'] : ['dado', 'screw']
}

// What this joint could be made into, this joint's own kind included. Empty for a pairing no
// convertible kind describes, and for one whose panels have moved so that they no longer meet.
export function convertibleKinds(
  joint: Joint,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): ConvertibleKind[] {
  const seat = seatOf(joint, parts)
  return seat === null ? [] : legalKinds(seat, byId)
}

// Seeded from the matching creator rather than by carrying fields across: a dado's depth and
// profile mean nothing to a screw. The id and label stay, so reconcileJoints re-derives this
// joint's cuts in place and the scene tree does not jump; sourceComponentId stays so the cabinet
// still knows the joint as its own — the one it must not regenerate, and one to take with it when
// it is deleted.
export function changeJointKind(
  joint: Joint,
  kind: ConvertibleKind,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): Joint | null {
  const seat = seatOf(joint, parts)
  if (seat === null || !legalKinds(seat, byId).includes(kind)) return null

  const next =
    kind === 'dado'
      ? defaultDadoJoint(
          seat.housing,
          seat.housed,
          seat.housingFace,
          seat.housedEnd,
          joint.id,
          joint.label,
          byId,
        )
      : defaultScrewJoint(
          seat.housing,
          seat.housed,
          seat.housingFace,
          seat.housedEnd,
          joint.id,
          joint.label,
        )
  return { ...next, sourceComponentId: joint.sourceComponentId, driven: false }
}
