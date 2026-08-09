import type { BoardPart, Face, FaceHit, Joint, Part, PartId, Vec3 } from './types'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'
import { worldAabb, isValidHalfLap } from '../geom/halflap'
import { isValidDadoSeat } from '../geom/dado'
import { isValidMortiseTenon } from '../geom/mortisetenon'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { isValidFingerJoint } from '../geom/fingerjoint'
import { faceAxes, computeLocalFaceCenter } from './snapMath'
import { jointInvolves } from './jointInvolves'

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }

// Private copy, matching the per-file convention in geom/{dado,mortisetenon,tonguegroove}.ts.
const FACE_NORMALS: Record<Face, Vec3> = {
  '+X': { x: 1, y: 0, z: 0 },
  '-X': { x: -1, y: 0, z: 0 },
  '+Y': { x: 0, y: 1, z: 0 },
  '-Y': { x: 0, y: -1, z: 0 },
  '+Z': { x: 0, y: 0, z: 1 },
  '-Z': { x: 0, y: 0, z: -1 },
}

interface SuggestionBase {
  neighborId: PartId
}

export type JointSuggestion = SuggestionBase &
  (
    | { kind: 'halflap'; partAId: PartId; partBId: PartId }
    | {
        kind: 'dado'
        housingPartId: PartId
        housingFace: Face
        housedPartId: PartId
        housedEnd: Face
      }
    | {
        kind: 'mortise-tenon'
        mortisePartId: PartId
        mortiseFace: Face
        tenonPartId: PartId
        tenonEnd: Face
      }
    | {
        kind: 'tongue-groove'
        groovePartId: PartId
        grooveEdge: Face
        tonguePartId: PartId
        tongueEdge: Face
      }
    | { kind: 'finger'; partAId: PartId; endA: Face; partBId: PartId; endB: Face }
  )

export function synthHit(partId: PartId, face: Face): FaceHit {
  const n = FACE_NORMALS[face]
  return {
    partId,
    faceNormal: n,
    faceCenter: ZERO,
    localFaceNormal: n,
    localHitPoint: ZERO,
    hitPoint: ZERO,
  }
}

export function suggestionFaceRefs(s: JointSuggestion): Array<{ partId: PartId; face: Face }> {
  switch (s.kind) {
    case 'halflap':
      return [] // crossing overlap — no single pair of faces
    case 'dado':
      return [
        { partId: s.housingPartId, face: s.housingFace },
        { partId: s.housedPartId, face: s.housedEnd },
      ]
    case 'mortise-tenon':
      return [
        { partId: s.mortisePartId, face: s.mortiseFace },
        { partId: s.tenonPartId, face: s.tenonEnd },
      ]
    case 'tongue-groove':
      return [
        { partId: s.groovePartId, face: s.grooveEdge },
        { partId: s.tonguePartId, face: s.tongueEdge },
      ]
    case 'finger':
      return [
        { partId: s.partAId, face: s.endA },
        { partId: s.partBId, face: s.endB },
      ]
    default: {
      // A new suggestion kind must declare its faces here, not silently highlight nothing.
      const _exhaustive: never = s
      throw new Error(`unhandled suggestion kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

const EPS = 1e-4
const TOUCH_TOL = 1 // mm
const FACES: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']
type WorldAxis = 'x' | 'y' | 'z'
const WORLD_AXES: WorldAxis[] = ['x', 'y', 'z']

function worldFaceNormal(b: BoardPart, f: Face): Vec3 {
  const m = composeWorldMatrix(b)
  const col = f.includes('X')
    ? [m[0], m[1], m[2]]
    : f.includes('Y')
      ? [m[4], m[5], m[6]]
      : [m[8], m[9], m[10]]
  const s = f[0] === '+' ? 1 : -1
  return { x: col[0] * s, y: col[1] * s, z: col[2] * s }
}

// Render-ready hit: computeFaceCorners reads localFaceNormal, while updateHighlight's 1mm
// clearance offset reads faceNormal and needs it in WORLD space. synthHit sets both to the
// local normal, which is correct for the onAdd* creators but wrong for drawing.
export function faceHitForDisplay(part: BoardPart, face: Face): FaceHit {
  return {
    partId: part.id,
    faceNormal: worldFaceNormal(part, face),
    faceCenter: ZERO,
    localFaceNormal: FACE_NORMALS[face],
    localHitPoint: ZERO,
    hitPoint: ZERO,
  }
}

function faceTowardWorld(b: BoardPart, ax: WorldAxis, sign: number): Face | null {
  for (const f of FACES) {
    const n = worldFaceNormal(b, f)
    if (n[ax] * sign > 1 - EPS) return f
  }
  return null
}

export function contactPair(a: BoardPart, b: BoardPart): { faceA: Face; faceB: Face } | null {
  const A = worldAabb(a)
  const B = worldAabb(b)
  let contactAx: WorldAxis | null = null
  let bestGap = -Infinity
  for (const ax of WORLD_AXES) {
    const gap = Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax])
    if (gap > TOUCH_TOL) return null // separated on this axis
    if (gap > bestGap) {
      bestGap = gap
      contactAx = ax
    }
  }
  if (!contactAx) return null
  const aMid = (A.min[contactAx] + A.max[contactAx]) / 2
  const bMid = (B.min[contactAx] + B.max[contactAx]) / 2
  const sign = bMid >= aMid ? 1 : -1
  const faceA = faceTowardWorld(a, contactAx, sign)
  const faceB = faceTowardWorld(b, contactAx, -sign)
  return faceA && faceB ? { faceA, faceB } : null
}

const NON_BROAD_FACES: Face[] = ['+X', '-X', '+Y', '-Y']

function aabbCenter(box: { min: Vec3; max: Vec3 }): Vec3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  }
}

function endTowardPoint(b: BoardPart, selfCenter: Vec3, target: Vec3): Face | null {
  const d = {
    x: target.x - selfCenter.x,
    y: target.y - selfCenter.y,
    z: target.z - selfCenter.z,
  }
  let best: Face | null = null
  let bestDot = 0 // strictly positive: the end must actually face the other board
  for (const f of NON_BROAD_FACES) {
    const n = worldFaceNormal(b, f)
    const dot = n.x * d.x + n.y * d.y + n.z * d.z
    if (dot > bestDot) {
      bestDot = dot
      best = f
    }
  }
  return best
}

function endFaceCenterWorld(b: BoardPart, f: Face): Vec3 {
  const local = computeLocalFaceCenter(FACE_NORMALS[f], b)
  const [x, y, z] = applyMatrixToPoint(composeWorldMatrix(b), local.x, local.y, local.z)
  return { x, y, z }
}

// Position-only: finds which ends meet, but does NOT verify they are perpendicular — collinear
// boards butted end-to-end also return a pair. Always compose with isValidFingerJoint before
// treating the result as a corner.
export function cornerPair(a: BoardPart, b: BoardPart): { endA: Face; endB: Face } | null {
  const A = worldAabb(a)
  const B = worldAabb(b)
  for (const ax of WORLD_AXES) {
    const gap = Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax])
    if (gap > TOUCH_TOL) return null
  }
  const ca = aabbCenter(A)
  const cb = aabbCenter(B)
  const endA = endTowardPoint(a, ca, cb)
  const endB = endTowardPoint(b, cb, ca)
  if (!endA || !endB) return null

  // Orientation alone is not enough: a board standing on A's broad face, merely off-centre toward
  // A's +X, would otherwise be reported as being at A's +X end. In a flush corner the two end
  // centres are offset by about (Ta/2, Tb/2), so their distance never exceeds (Ta + Tb) / 2.
  const pa = endFaceCenterWorld(a, endA)
  const pb = endFaceCenterWorld(b, endB)
  const d = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z)
  if (d > (a.thickness + b.thickness) / 2 + TOUCH_TOL) return null

  return { endA, endB }
}

const KIND_PRIORITY: JointSuggestion['kind'][] = [
  'halflap',
  'dado',
  'mortise-tenon',
  'finger',
  'tongue-groove',
]

function aabbCenterDist(a: BoardPart, b: BoardPart): number {
  const ca = aabbCenter(worldAabb(a))
  const cb = aabbCenter(worldAabb(b))
  let sum = 0
  for (const ax of WORLD_AXES) sum += (ca[ax] - cb[ax]) * (ca[ax] - cb[ax])
  return Math.sqrt(sum)
}

// Suggestions for the ordered pair (s, t): what joints s could form with t, with s in the role the
// caller's selection implies. Ordered, not symmetric — see ORIENTATION_MATTERS.
function suggestForOrderedPair(s: BoardPart, t: BoardPart): JointSuggestion[] {
  const out: JointSuggestion[] = []
  {
    if (isValidHalfLap(s, t)) {
      out.push({ kind: 'halflap', neighborId: t.id, partAId: s.id, partBId: t.id })
    }

    // A right-angle corner is neither an anti-parallel face contact nor a coplanar cross, so it is
    // detected on its own rather than through the contactPair classification below.
    const corner = cornerPair(s, t)
    if (corner && isValidFingerJoint(s, corner.endA, t, corner.endB)) {
      out.push({
        kind: 'finger',
        neighborId: t.id,
        partAId: s.id, // lead board — stays put, so it must be the selected one
        endA: corner.endA,
        partBId: t.id, // mating board — auto-seats into the corner
        endB: corner.endB,
      })
    }

    const pair = contactPair(s, t)
    if (!pair) return out
    const { faceA, faceB } = pair
    const dS = faceAxes(faceA).depth
    const dT = faceAxes(faceB).depth
    const sBroad = dS === 'z'
    const tBroad = dT === 'z'

    // Exactly one broad (depth 'z') contact face => perpendicular tee: the broad-face board is the housing/mortise, the other seats its end/edge into it.
    if (sBroad !== tBroad) {
      const housing = sBroad ? s : t
      const housingFace = sBroad ? faceA : faceB
      const housed = sBroad ? t : s
      const housedEnd = sBroad ? faceB : faceA
      if (isValidDadoSeat(housing, housingFace, housed, housedEnd)) {
        out.push({
          kind: 'dado',
          neighborId: t.id,
          housingPartId: housing.id,
          housingFace,
          housedPartId: housed.id,
          housedEnd,
        })
      }
      if (isValidMortiseTenon(housing, housingFace, housed, housedEnd)) {
        out.push({
          kind: 'mortise-tenon',
          neighborId: t.id,
          mortisePartId: housing.id,
          mortiseFace: housingFace,
          tenonPartId: housed.id,
          tenonEnd: housedEnd,
        })
      }
    } else if (dS === 'y' && dT === 'y') {
      // Both contact faces are long edges (depth 'y') => coplanar edge glue-up.
      if (isValidTongueGroove(s, faceA, t, faceB)) {
        out.push({
          kind: 'tongue-groove',
          neighborId: t.id,
          groovePartId: s.id,
          grooveEdge: faceA,
          tonguePartId: t.id,
          tongueEdge: faceB,
        })
      }
    }
  }

  return out
}

export function suggestJointsFor(
  selectedId: PartId | null,
  parts: Part[],
  joints: Joint[],
): JointSuggestion[] {
  if (selectedId == null) return []
  const s = parts.find((p) => p.id === selectedId)
  if (!s || s.kind !== 'board' || !s.visible) return []

  const out: JointSuggestion[] = []
  for (const t of parts) {
    if (t.id === s.id || t.kind !== 'board' || !t.visible) continue
    if (joints.some((j) => jointInvolves(j, s.id) && jointInvolves(j, t.id))) continue
    out.push(...suggestForOrderedPair(s, t))
  }

  const distOf = (id: PartId) => {
    const t = parts.find((p) => p.id === id)
    return t && t.kind === 'board' ? aabbCenterDist(s, t) : Infinity
  }
  // Nearest neighbour first, so the most likely joint is at the top. The list is not truncated:
  // it is bounded by how many boards actually touch the selection, and a hidden row is
  // indistinguishable from a joint the engine cannot make. See the 2026-08-09 note in
  // docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md.
  out.sort((a, b) => {
    const d = distOf(a.neighborId) - distOf(b.neighborId)
    if (Math.abs(d) > EPS) return d
    return KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind)
  })
  return out
}

// Kinds whose two orientations are genuinely different joints, so both are worth offering.
// FingerJoint.partAId is the lead board that stays put while the other auto-seats into the corner;
// TongueGrooveJoint.groovePartId decides which board is grooved and which is tongued. Measured
// 2026-08-07: scoring a pair from both sides yields identical roles for dado and mortise-tenon
// (housing/housed is chosen by geometry, not by which board was selected), so those must be
// collapsed. Half-lap only swaps partA/partB, immaterial at the default split of 0.5 — treated as
// symmetric here, which is worth revisiting if split ever gets a non-centred default.
const ORIENTATION_MATTERS: ReadonlySet<JointSuggestion['kind']> = new Set(['finger', 'tongue-groove'])

// Runaway guard on an all-pairs list, not a curation device. Measured 2026-08-09: three 8-board
// carcases — a modest kitchen run — produce 120 candidates and are cut to 100, so this IS reachable
// by a real scene and truncates it silently. Grouping rows by pair is the fix; raising the number
// only moves the cliff.
const MAX_SCENE_SUGGESTIONS = 100

// Every joint available anywhere in the scene, with no selection. Pairs are visited once as an
// unordered pair; the reverse direction contributes only the kinds whose orientation is a real
// choice (see ORIENTATION_MATTERS), which is what keeps dado and mortise-tenon from appearing twice
// while still offering both ways round for finger and tongue & groove.
export function suggestJointsForScene(parts: Part[], joints: Joint[]): JointSuggestion[] {
  const boards = parts.filter((p): p is BoardPart => p.kind === 'board' && p.visible)
  const out: JointSuggestion[] = []

  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const a = boards[i]
      const b = boards[j]
      if (joints.some((joint) => jointInvolves(joint, a.id) && jointInvolves(joint, b.id))) continue
      out.push(...suggestForOrderedPair(a, b))
      out.push(...suggestForOrderedPair(b, a).filter((sug) => ORIENTATION_MATTERS.has(sug.kind)))
    }
  }

  // No selected board to measure from, so order pairs by how close the two boards are — touching
  // boards first — and keep the per-part kind order within a pair.
  const board = (id: PartId) => boards.find((p) => p.id === id)
  const pairDist = (sug: JointSuggestion) => {
    const ids = pairIdsOf(sug)
    const x = board(ids[0])
    const y = board(ids[1])
    return x && y ? aabbCenterDist(x, y) : Infinity
  }
  out.sort((x, y) => {
    const d = pairDist(x) - pairDist(y)
    if (Math.abs(d) > EPS) return d
    return KIND_PRIORITY.indexOf(x.kind) - KIND_PRIORITY.indexOf(y.kind)
  })
  return out.slice(0, MAX_SCENE_SUGGESTIONS)
}

// The two boards a suggestion involves, without leaning on neighborId — which means "the other
// board relative to the selection" and has no meaning in a scene-wide list.
export function pairIdsOf(s: JointSuggestion): [PartId, PartId] {
  switch (s.kind) {
    case 'halflap':
      return [s.partAId, s.partBId]
    case 'dado':
      return [s.housingPartId, s.housedPartId]
    case 'mortise-tenon':
      return [s.mortisePartId, s.tenonPartId]
    case 'finger':
      return [s.partAId, s.partBId]
    case 'tongue-groove':
      return [s.groovePartId, s.tonguePartId]
    default: {
      const _exhaustive: never = s
      throw new Error(`unhandled suggestion kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
