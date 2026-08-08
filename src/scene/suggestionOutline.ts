import type { Part, Vec3 } from './types'
import type { JointSuggestion } from './suggestJoints'
import { suggestionFaceRefs, faceHitForDisplay } from './suggestJoints'
import { computeFaceCorners } from './snapMath'
import { cutFootprintCorners } from './cutFootprint'
import { defaultDadoJoint, defaultMortiseTenonJoint } from './defaultJoint'
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

// Outlines of the material a joint would actually remove, derived through deriveJoint so the
// preview shows the same cuts the creator would produce rather than a second guess at them.
function cutOutlines(joint: Parameters<typeof deriveJoint>[0], parts: Part[]): Outline[] | null {
  const derived = deriveJoint(joint, parts)
  if (!derived) return null
  return derived.cuts.flatMap(({ partId, cut }) => {
    const p = board(parts, partId)
    if (!p || cut.kind !== 'box') return []
    return [
      {
        corners: cutFootprintCorners(p, cut),
        normal: faceHitForDisplay(p, cut.face).faceNormal,
      },
    ]
  })
}

// Dado and mortise & tenon are offered on the same contact pair and resolve to the same two faces,
// so face outlines cannot separate them (see suggestJoints.test.ts). Their *cuts* differ plainly —
// the groove runs clear across the housing board, the mortise pocket is inset — so those two kinds
// preview their footprints instead. The rest keep face outlines: finger and tongue & groove are
// already distinguishable, and half-lap has no face pair at all.
export function suggestionOutlines(s: JointSuggestion, parts: Part[]): Outline[] {
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
