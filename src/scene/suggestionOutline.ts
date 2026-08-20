import type { BoardPart, BoxCut, Component, ComponentId, Face, Part, Vec3 } from './types'
import type { JointSuggestion } from './suggestJoints'
import { suggestionFaceRefs, faceHitForDisplay } from './suggestJoints'
import { computeFaceCorners } from './snapMath'
import { cutFootprintCorners } from './cutFootprint'
import {
  defaultDadoJoint,
  defaultFingerJoint,
  defaultHalfLapJoint,
  defaultMortiseTenonJoint,
  defaultTongueGrooveJoint,
} from './defaultJoint'
import { deriveJoint } from '../geom/dado'

export interface Outline {
  corners: [Vec3, Vec3, Vec3, Vec3]
  normal: Vec3 // world-space; the viewport lifts the loop clear along it
}

// Placeholders: the cut-geometry functions read a joint's id/label only to stamp the BoxCuts they
// return, never to place them, so a preview never needs a real id or the joint counter.
const PREVIEW_ID = 'joint_preview'
const PREVIEW_LABEL = 'preview'

function board(parts: Part[], id: string) {
  const p = parts.find((x) => x.id === id)
  return p && p.kind === 'board' ? p : null
}

// Whole-face outlines — what every suggestion drew before footprints existed. Now only a fallback
// for a joint deriveJoint declines to resolve; half-lap has no faces to fall back to.
function faceOutlines(s: JointSuggestion, parts: Part[]): Outline[] {
  return suggestionFaceRefs(s).flatMap((ref) => {
    const p = board(parts, ref.partId)
    if (!p) return []
    const hit = faceHitForDisplay(p, ref.face)
    return [{ corners: computeFaceCorners(hit, p), normal: hit.faceNormal }]
  })
}

// halflap.ts stamps every lap cut with face '+Z' and says so in a comment — the field is a
// placeholder there, the geometry lives in position/size. Recover the real side: isValidHalfLap
// requires both boards to share a stack axis, and stackAxis reads the board's local z column, so a
// lap always removes material through local z. Only the sign is in question, and where the cut
// sits in local z settles it. Every other producer sets a meaningful face, so this is scoped to
// laps rather than applied everywhere.
function lapFace(part: BoardPart, cut: BoxCut): Face {
  return cut.position.z <= (part.thickness - cut.size.z) / 2 ? '-Z' : '+Z'
}

// Outlines of the material a joint would actually remove, derived through deriveJoint so the
// preview shows the same cuts the creator would produce rather than a second guess at them.
function cutOutlines(
  joint: Parameters<typeof deriveJoint>[0],
  parts: Part[],
  byId: Map<ComponentId, Component>,
  faceOf?: (part: BoardPart, cut: BoxCut) => Face,
): Outline[] | null {
  const derived = deriveJoint(joint, parts, byId)
  if (!derived) return null
  return derived.cuts.flatMap(({ partId, cut }) => {
    const p = board(parts, partId)
    if (!p || cut.kind !== 'box') return []
    const face = faceOf ? faceOf(p, cut) : cut.face
    return [
      {
        corners: cutFootprintCorners(p, { ...cut, face }),
        normal: faceHitForDisplay(p, face).faceNormal,
      },
    ]
  })
}

// Every kind previews the material it would remove, so a hover means one thing throughout.
// Faces alone were never enough: half-lap has no mating face pair at all, dado and mortise & tenon
// share a contact pair and resolve to the *same* two faces (see suggestJoints.test.ts), and a
// finger joint's plain end face says nothing about the comb of slots that defines it.
// faceOutlines survives only as the fallback for a joint deriveJoint cannot resolve.
export function suggestionOutlines(
  s: JointSuggestion,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): Outline[] {
  if (s.kind === 'halflap') {
    // A crossing overlap has no pair of mating faces, so this kind previewed nothing at all
    // before footprints existed — only the neighbour tint. Its lap cuts give it one.
    const a = board(parts, s.partAId)
    const b = board(parts, s.partBId)
    if (!a || !b) return []
    const joint = defaultHalfLapJoint(a, b, PREVIEW_ID, PREVIEW_LABEL)
    return cutOutlines(joint, parts, byId, lapFace) ?? []
  }
  if (s.kind === 'dado') {
    const housing = board(parts, s.housingPartId)
    const housed = board(parts, s.housedPartId)
    if (!housing || !housed) return []
    const joint = defaultDadoJoint(
      housing,
      housed,
      s.housingFace,
      s.housedEnd,
      PREVIEW_ID,
      PREVIEW_LABEL,
      byId,
    )
    return cutOutlines(joint, parts, byId) ?? faceOutlines(s, parts)
  }
  if (s.kind === 'finger') {
    const a = board(parts, s.partAId)
    const b = board(parts, s.partBId)
    if (!a || !b) return []
    const joint = defaultFingerJoint(a, b, s.endA, s.endB, PREVIEW_ID, PREVIEW_LABEL)
    return cutOutlines(joint, parts, byId) ?? faceOutlines(s, parts)
  }
  if (s.kind === 'tongue-groove') {
    const groove = board(parts, s.groovePartId)
    const tongue = board(parts, s.tonguePartId)
    if (!groove || !tongue) return []
    const joint = defaultTongueGrooveJoint(
      groove,
      tongue,
      s.grooveEdge,
      s.tongueEdge,
      PREVIEW_ID,
      PREVIEW_LABEL,
    )
    return cutOutlines(joint, parts, byId) ?? faceOutlines(s, parts)
  }
  if (s.kind === 'mortise-tenon') {
    const mortise = board(parts, s.mortisePartId)
    const tenon = board(parts, s.tenonPartId)
    if (!mortise || !tenon) return []
    const joint = defaultMortiseTenonJoint(
      mortise,
      tenon,
      s.mortiseFace,
      s.tenonEnd,
      PREVIEW_ID,
      PREVIEW_LABEL,
      byId,
    )
    return cutOutlines(joint, parts, byId) ?? faceOutlines(s, parts)
  }
  return faceOutlines(s, parts)
}
