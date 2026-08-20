import type {
  BoardPart,
  Component,
  ComponentId,
  Face,
  FaceHit,
  Joint,
  Part,
  PartId,
  Vec3,
} from './types'
import { resolveWorldMatrix, applyMatrixToPoint } from '../geom/transform'
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

function worldFaceNormal(b: BoardPart, f: Face, byId: Map<ComponentId, Component>): Vec3 {
  const m = resolveWorldMatrix(b, byId)
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
export function faceHitForDisplay(
  part: BoardPart,
  face: Face,
  byId: Map<ComponentId, Component>,
): FaceHit {
  return {
    partId: part.id,
    faceNormal: worldFaceNormal(part, face, byId),
    faceCenter: ZERO,
    localFaceNormal: FACE_NORMALS[face],
    localHitPoint: ZERO,
    hitPoint: ZERO,
  }
}

function faceTowardWorld(
  b: BoardPart,
  ax: WorldAxis,
  sign: number,
  byId: Map<ComponentId, Component>,
): Face | null {
  for (const f of FACES) {
    const n = worldFaceNormal(b, f, byId)
    if (n[ax] * sign > 1 - EPS) return f
  }
  return null
}

// The adjacency predicate: do these two boards meet at all? Shared by cornerPair and the scene
// checklist (jointChecklist.ts), which needs exactly the engine's own notion of "touching" for its
// denominator. contactPair deliberately keeps its own fused copy — it derives contactAx and bestGap
// from the same iteration, so delegating here would walk the axes twice for no gain.
export function boardsTouch(
  a: BoardPart,
  b: BoardPart,
  byId: Map<ComponentId, Component>,
): boolean {
  const A = worldAabb(a, byId)
  const B = worldAabb(b, byId)
  for (const ax of WORLD_AXES) {
    if (Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax]) > TOUCH_TOL) return false
  }
  return true
}

export function contactPair(
  a: BoardPart,
  b: BoardPart,
  byId: Map<ComponentId, Component>,
): { faceA: Face; faceB: Face } | null {
  // Separation is decided once, in boardsTouch. worldAabb is memoized, so re-reading the two boxes
  // below is a cache hit — the contact axis still needs the per-axis gaps that boardsTouch discards.
  if (!boardsTouch(a, b, byId)) return null
  const A = worldAabb(a, byId)
  const B = worldAabb(b, byId)
  let contactAx: WorldAxis = WORLD_AXES[0]
  let bestGap = -Infinity
  for (const ax of WORLD_AXES) {
    const gap = Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax])
    if (gap > bestGap) {
      bestGap = gap
      contactAx = ax
    }
  }
  const aMid = (A.min[contactAx] + A.max[contactAx]) / 2
  const bMid = (B.min[contactAx] + B.max[contactAx]) / 2
  const sign = bMid >= aMid ? 1 : -1
  const faceA = faceTowardWorld(a, contactAx, sign, byId)
  const faceB = faceTowardWorld(b, contactAx, -sign, byId)
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

function endTowardPoint(
  b: BoardPart,
  selfCenter: Vec3,
  target: Vec3,
  byId: Map<ComponentId, Component>,
): Face | null {
  const d = {
    x: target.x - selfCenter.x,
    y: target.y - selfCenter.y,
    z: target.z - selfCenter.z,
  }
  let best: Face | null = null
  let bestDot = 0 // strictly positive: the end must actually face the other board
  for (const f of NON_BROAD_FACES) {
    const n = worldFaceNormal(b, f, byId)
    const dot = n.x * d.x + n.y * d.y + n.z * d.z
    if (dot > bestDot) {
      bestDot = dot
      best = f
    }
  }
  return best
}

function endFaceCenterWorld(b: BoardPart, f: Face, byId: Map<ComponentId, Component>): Vec3 {
  const local = computeLocalFaceCenter(FACE_NORMALS[f], b)
  const [x, y, z] = applyMatrixToPoint(resolveWorldMatrix(b, byId), local.x, local.y, local.z)
  return { x, y, z }
}

// Position-only: finds which ends meet, but does NOT verify they are perpendicular — collinear
// boards butted end-to-end also return a pair. Always compose with isValidFingerJoint before
// treating the result as a corner.
export function cornerPair(
  a: BoardPart,
  b: BoardPart,
  byId: Map<ComponentId, Component>,
): { endA: Face; endB: Face } | null {
  if (!boardsTouch(a, b, byId)) return null
  const A = worldAabb(a, byId)
  const B = worldAabb(b, byId)
  const ca = aabbCenter(A)
  const cb = aabbCenter(B)
  const endA = endTowardPoint(a, ca, cb, byId)
  const endB = endTowardPoint(b, cb, ca, byId)
  if (!endA || !endB) return null

  // Orientation alone is not enough: a board standing on A's broad face, merely off-centre toward
  // A's +X, would otherwise be reported as being at A's +X end. In a flush corner the two end
  // centres are offset by about (Ta/2, Tb/2), so their distance never exceeds (Ta + Tb) / 2.
  const pa = endFaceCenterWorld(a, endA, byId)
  const pb = endFaceCenterWorld(b, endB, byId)
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

export function aabbCenterDist(
  a: BoardPart,
  b: BoardPart,
  byId: Map<ComponentId, Component>,
): number {
  const ca = aabbCenter(worldAabb(a, byId))
  const cb = aabbCenter(worldAabb(b, byId))
  let sum = 0
  for (const ax of WORLD_AXES) sum += (ca[ax] - cb[ax]) * (ca[ax] - cb[ax])
  return Math.sqrt(sum)
}

// Suggestions for the ordered pair (s, t): what joints s could form with t, with s in the role the
// caller's selection implies. Ordered, not symmetric — see ORIENTATION_MATTERS.
function suggestForOrderedPair(
  s: BoardPart,
  t: BoardPart,
  byId: Map<ComponentId, Component>,
): JointSuggestion[] {
  const out: JointSuggestion[] = []
  {
    if (isValidHalfLap(s, t, byId)) {
      out.push({ kind: 'halflap', neighborId: t.id, partAId: s.id, partBId: t.id })
    }

    // A right-angle corner is neither an anti-parallel face contact nor a coplanar cross, so it is
    // detected on its own rather than through the contactPair classification below.
    const corner = cornerPair(s, t, byId)
    if (corner && isValidFingerJoint(s, corner.endA, t, corner.endB, byId)) {
      out.push({
        kind: 'finger',
        neighborId: t.id,
        partAId: s.id, // lead board — stays put, so it must be the selected one
        endA: corner.endA,
        partBId: t.id, // mating board — auto-seats into the corner
        endB: corner.endB,
      })
    }

    const pair = contactPair(s, t, byId)
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
      if (isValidMortiseTenon(housing, housingFace, housed, housedEnd, byId)) {
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
      if (isValidTongueGroove(s, faceA, t, faceB, byId)) {
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
  byId: Map<ComponentId, Component>,
): JointSuggestion[] {
  if (selectedId == null) return []
  const s = parts.find((p) => p.id === selectedId)
  if (!s || s.kind !== 'board' || !s.visible) return []

  const out: JointSuggestion[] = []
  for (const t of parts) {
    if (t.id === s.id || t.kind !== 'board' || !t.visible) continue
    if (joints.some((j) => jointInvolves(j, s.id) && jointInvolves(j, t.id))) continue
    out.push(...suggestForOrderedPair(s, t, byId))
  }

  const distOf = (id: PartId) => {
    const t = parts.find((p) => p.id === id)
    return t && t.kind === 'board' ? aabbCenterDist(s, t, byId) : Infinity
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
const ORIENTATION_MATTERS: ReadonlySet<JointSuggestion['kind']> = new Set([
  'finger',
  'tongue-groove',
])

// Every joint available anywhere in the scene, with no selection. Pairs are visited once as an
// unordered pair; the reverse direction contributes only the kinds whose orientation is a real
// choice (see ORIENTATION_MATTERS), which is what keeps dado and mortise-tenon from appearing twice
// while still offering both ways round for finger and tongue & groove.
export function suggestJointsForScene(
  parts: Part[],
  joints: Joint[],
  byId: Map<ComponentId, Component>,
): JointSuggestion[] {
  const boards = parts.filter((p): p is BoardPart => p.kind === 'board' && p.visible)
  const out: JointSuggestion[] = []

  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const a = boards[i]
      const b = boards[j]
      if (joints.some((joint) => jointInvolves(joint, a.id) && jointInvolves(joint, b.id))) continue
      out.push(...suggestForOrderedPair(a, b, byId))
      out.push(
        ...suggestForOrderedPair(b, a, byId).filter((sug) => ORIENTATION_MATTERS.has(sug.kind)),
      )
    }
  }

  // No selected board to measure from, so order pairs by how close the two boards are — touching
  // boards first — and keep the per-part kind order within a pair.
  const board = (id: PartId) => boards.find((p) => p.id === id)
  const pairDist = (sug: JointSuggestion) => {
    const ids = pairIdsOf(sug)
    const x = board(ids[0])
    const y = board(ids[1])
    return x && y ? aabbCenterDist(x, y, byId) : Infinity
  }
  out.sort((x, y) => {
    const d = pairDist(x) - pairDist(y)
    if (Math.abs(d) > EPS) return d
    return KIND_PRIORITY.indexOf(x.kind) - KIND_PRIORITY.indexOf(y.kind)
  })
  // Not truncated: the cap now applies to rows, after grouping (groupSuggestions.ts), so a rendered
  // row is always complete. Capping here would render a pair with only some of its kinds.
  return out
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
