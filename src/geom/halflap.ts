import type {
  BoardPart,
  BoxCut,
  Component,
  ComponentId,
  CutId,
  HalfLapJoint,
  Part,
  Vec3,
} from '../scene/types'
import type { DeriveResult } from './dado'
import { applyInverseToPoint, applyMatrixToPoint, resolveWorldMatrix } from './transform'

type Axis = 'x' | 'y' | 'z'
const AXES: Axis[] = ['x', 'y', 'z']
const EPS = 1e-4

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function boardDims(b: BoardPart): Record<Axis, number> {
  return { x: b.length, y: b.width, z: b.thickness }
}

// Keyed by board identity, but validated against the resolved world matrix: an ancestor component
// can move without producing a new part object, so identity alone would serve a stale box. The
// matrix is compared by value, not the tree by reference, so a rebuilt-but-equal tree still hits.
// This turns the checklist's two O(n^2) pair walks — each recomputing every board's AABB — into one
// compute per board. A WeakMap lets a deleted part's entry be collected with it.
const aabbCache = new WeakMap<BoardPart, { matrix: Float64Array; box: { min: Vec3; max: Vec3 } }>()

function sameMatrix(a: Float64Array, b: Float64Array): boolean {
  for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false
  return true
}

export function worldAabb(
  b: BoardPart,
  byId: Map<ComponentId, Component>,
): { min: Vec3; max: Vec3 } {
  const m = resolveWorldMatrix(b, byId)
  const cached = aabbCache.get(b)
  if (cached && sameMatrix(cached.matrix, m)) return cached.box

  const d = boardDims(b)
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity }
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const cx of [0, d.x]) {
    for (const cy of [0, d.y]) {
      for (const cz of [0, d.z]) {
        const [wx, wy, wz] = applyMatrixToPoint(m, cx, cy, cz)
        if (wx < min.x) min.x = wx
        if (wx > max.x) max.x = wx
        if (wy < min.y) min.y = wy
        if (wy > max.y) max.y = wy
        if (wz < min.z) min.z = wz
        if (wz > max.z) max.z = wz
      }
    }
  }
  const box = { min, max }
  aabbCache.set(b, { matrix: m, box })
  return box
}

export function stackAxis(b: BoardPart, byId: Map<ComponentId, Component>): Axis {
  const m = resolveWorldMatrix(b, byId)
  const ax = Math.abs(m[8])
  const ay = Math.abs(m[9])
  const az = Math.abs(m[10])
  if (az >= ax && az >= ay) return 'z'
  if (ay >= ax) return 'y'
  return 'x'
}

function isAxisAligned(b: BoardPart, byId: Map<ComponentId, Component>): boolean {
  const m = resolveWorldMatrix(b, byId)
  const cols = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ]
  return cols.every((c) => Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])) >= 1 - EPS)
}

export function isValidHalfLap(
  a: BoardPart,
  b: BoardPart,
  byId: Map<ComponentId, Component>,
): boolean {
  if (!isAxisAligned(a, byId) || !isAxisAligned(b, byId)) return false
  const s = stackAxis(a, byId)
  if (stackAxis(b, byId) !== s) return false
  const A = worldAabb(a, byId)
  const B = worldAabb(b, byId)
  if (Math.abs(A.min[s] - B.min[s]) > EPS || Math.abs(A.max[s] - B.max[s]) > EPS) return false
  for (const ax of AXES) {
    if (ax === s) continue
    const lo = Math.max(A.min[ax], B.min[ax])
    const hi = Math.min(A.max[ax], B.max[ax])
    if (hi - lo <= EPS) return false
  }
  return true
}

function worldBoxToLocalCut(
  b: BoardPart,
  wmin: Vec3,
  wmax: Vec3,
  id: CutId,
  label: string,
  jointId: string,
  byId: Map<ComponentId, Component>,
): BoxCut {
  const m = resolveWorldMatrix(b, byId)
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity }
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const px of [wmin.x, wmax.x]) {
    for (const py of [wmin.y, wmax.y]) {
      for (const pz of [wmin.z, wmax.z]) {
        const [lx, ly, lz] = applyInverseToPoint(m, px, py, pz)
        if (lx < min.x) min.x = lx
        if (lx > max.x) max.x = lx
        if (ly < min.y) min.y = ly
        if (ly > max.y) max.y = ly
        if (lz < min.z) min.z = lz
        if (lz > max.z) max.z = lz
      }
    }
  }
  return {
    kind: 'box',
    id,
    label,
    face: '+Z', // cosmetic; geometry lives in position/size
    position: { x: min.x, y: min.y, z: min.z },
    size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
    sourceJointId: jointId,
  }
}

export function deriveHalfLap(
  joint: HalfLapJoint,
  parts: Part[],
  byId: Map<ComponentId, Component>,
): DeriveResult | null {
  const a = parts.find((p) => p.id === joint.partAId)
  const b = parts.find((p) => p.id === joint.partBId)
  if (a?.kind !== 'board' || b?.kind !== 'board') return null
  if (!isValidHalfLap(a, b, byId)) return null

  const s = stackAxis(a, byId)
  const A = worldAabb(a, byId)
  const B = worldAabb(b, byId)
  const s0 = A.min[s]
  const s1 = A.max[s]
  const mid = s0 + clamp(joint.split, 0.05, 0.95) * (s1 - s0)
  const c = Math.max(0, joint.clearance)

  const lo: Vec3 = { x: 0, y: 0, z: 0 }
  const hi: Vec3 = { x: 0, y: 0, z: 0 }
  for (const ax of AXES) {
    lo[ax] = ax === s ? s0 : Math.max(A.min[ax], B.min[ax])
    hi[ax] = ax === s ? s1 : Math.min(A.max[ax], B.max[ax])
  }

  const aMin: Vec3 = { ...lo }
  const aMax: Vec3 = { ...hi }
  aMin[s] = mid - c
  aMax[s] = s1
  const bMin: Vec3 = { ...lo }
  const bMax: Vec3 = { ...hi }
  bMin[s] = s0
  bMax[s] = mid + c

  const cutA = worldBoxToLocalCut(
    a,
    aMin,
    aMax,
    `cut_${joint.id}_lapA` as CutId,
    `${joint.label} lap A`,
    joint.id,
    byId,
  )
  const cutB = worldBoxToLocalCut(
    b,
    bMin,
    bMax,
    `cut_${joint.id}_lapB` as CutId,
    `${joint.label} lap B`,
    joint.id,
    byId,
  )
  return {
    cuts: [
      { partId: a.id, cut: cutA },
      { partId: b.id, cut: cutB },
    ],
  }
}
