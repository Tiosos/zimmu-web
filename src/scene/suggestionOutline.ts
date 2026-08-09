import type { BoardPart, BoxCut, Face, Part, Vec3 } from './types'
import type { JointSuggestion } from './suggestJoints'
import { suggestionFaceRefs, faceHitForDisplay } from './suggestJoints'
import { computeFaceCorners } from './snapMath'
import { cutFootprintCorners } from './cutFootprint'
import { defaultDadoJoint, defaultHalfLapJoint, defaultMortiseTenonJoint } from './defaultJoint'
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

// Whole-face outlines — what every suggestion drew before footprints existed, and still the right
// answer for kinds whose faces already tell them apart.
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
  faceOf?: (part: BoardPart, cut: BoxCut) => Face,
): Outline[] | null {
  const derived = deriveJoint(joint, parts)
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

// Which kinds preview cuts rather than faces, and why:
//   half-lap        — has no mating face pair, so face outlines gave it nothing at all.
//   dado, mortise&tenon — share a contact pair and resolve to the same two faces, so face outlines
//                     could not tell them apart (see suggestJoints.test.ts); their cuts plainly can.
// Finger and tongue & groove keep whole-face outlines: their faces already differ, and the faces
// are what the joint mates on, so they are the more honest thing to show.
export function suggestionOutlines(s: JointSuggestion, parts: Part[]): Outline[] {
  if (s.kind === 'halflap') {
    // A crossing overlap has no pair of mating faces, so this kind previewed nothing at all
    // before footprints existed — only the neighbour tint. Its lap cuts give it one.
    const a = board(parts, s.partAId)
    const b = board(parts, s.partBId)
    if (!a || !b) return []
    const joint = defaultHalfLapJoint(a, b, PREVIEW_ID, PREVIEW_LABEL)
    return cutOutlines(joint, parts, lapFace) ?? []
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
    )
    return cutOutlines(joint, parts) ?? faceOutlines(s, parts)
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
    )
    return cutOutlines(joint, parts) ?? faceOutlines(s, parts)
  }
  return faceOutlines(s, parts)
}
