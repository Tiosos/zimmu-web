import type { BoardPart, Face, FaceHit, Joint, Part, PartId, Vec3 } from './types'
import { composeWorldMatrix } from '../geom/transform'
import { worldAabb, isValidHalfLap } from '../geom/halflap'
import { isValidDadoSeat } from '../geom/dado'
import { isValidMortiseTenon } from '../geom/mortisetenon'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { faceAxes } from './snapMath'
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

const KIND_PRIORITY: JointSuggestion['kind'][] = [
  'halflap',
  'dado',
  'mortise-tenon',
  'tongue-groove',
]
const MAX_SUGGESTIONS = 8

function aabbCenterDist(a: BoardPart, b: BoardPart): number {
  const A = worldAabb(a)
  const B = worldAabb(b)
  let sum = 0
  for (const ax of WORLD_AXES) {
    const ca = (A.min[ax] + A.max[ax]) / 2
    const cb = (B.min[ax] + B.max[ax]) / 2
    sum += (ca - cb) * (ca - cb)
  }
  return Math.sqrt(sum)
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

    if (isValidHalfLap(s, t)) {
      out.push({ kind: 'halflap', neighborId: t.id, partAId: s.id, partBId: t.id })
    }

    const pair = contactPair(s, t)
    if (!pair) continue
    const { faceA, faceB } = pair
    const dS = faceAxes(faceA).depth
    const dT = faceAxes(faceB).depth
    const sBroad = dS === 'z'
    const tBroad = dT === 'z'

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

  const distOf = (id: PartId) => {
    const t = parts.find((p) => p.id === id)
    return t && t.kind === 'board' ? aabbCenterDist(s, t) : Infinity
  }
  out.sort((a, b) => {
    const d = distOf(a.neighborId) - distOf(b.neighborId)
    if (Math.abs(d) > EPS) return d
    return KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind)
  })
  return out.slice(0, MAX_SUGGESTIONS)
}
