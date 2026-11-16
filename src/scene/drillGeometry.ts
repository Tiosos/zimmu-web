// Geometry shared by every pass that reasons about board drilling: a hole row as a lattice of
// cylinders, the bisection helpers that answer a row by arithmetic rather than by walking it, and
// the distance between two finite centreline segments. It holds no verdict and no finding — the
// intersection pass and the web pass ask the same geometry different questions, and a second copy
// of "where is hole k" is how the two would come to disagree about which volume the exporter
// removes.
import { faceAxes } from './snapMath'
import type { ManufacturingBoard } from './manufacturingPart'
import type { HoleArrayCut, Vec3 } from './types'

export const tolerance = 1e-6 // mm; the same boundary tolerance every cut check applies.

export type Axis = keyof Vec3

export interface RowDrill {
  depth: Axis
  run: Axis
  across: Axis
  count: number
  origin: number // run coordinate of hole 0
  pitch: number
  acrossAt: number // across coordinate, common to every hole
  axialLo: number // axial interval of every hole, entry face inward, clipped to the stock extent
  axialHi: number
  radius: number
  face: HoleArrayCut['face'] // as recorded — the same-face rule for coaxial pairs reads this
  nominalDiameter: number // recorded diameter, unclipped: the identity a coaxial repeat is judged on
  nominalDepth: number // recorded depth, unclipped: through holes clip the axial extent, not this
}

const positive = (n: number) => Number.isFinite(n) && n > 0
const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const

// A row is a family of cylinders on a lattice: hole k (0-based) sits at origin + k * pitch along
// the run axis at the common across coordinate, drilled from the entry face inward. A depth at or
// past the stock extent is a through hole, not an error, so the extent is clipped, never rejected.
//
// `null` means these recorded fields cannot describe a lattice at all — the precondition every
// consumer shares. It is not a verdict: `drillingChecks` stays the only place that reports *which*
// precondition failed, because its four messages distinguish them.
export function rowDrillOf(board: ManufacturingBoard, row: HoleArrayCut): RowDrill | null {
  const dims: Record<Axis, number> = {
    x: board.local.length,
    y: board.local.width,
    z: board.local.thickness,
  }
  if (!positive(dims.x) || !positive(dims.y) || !positive(dims.z)) return null
  if (!positive(row.diameter) || !positive(row.depth)) return null
  if (!Number.isSafeInteger(row.count) || row.count < 1) return null
  if (!Number.isFinite(row.pitch) || row.pitch < 0) return null
  if (row.count > 1 && row.pitch === 0) return null
  if (!(FACES as readonly string[]).includes(row.face)) return null
  if (row.axis !== 'U' && row.axis !== 'V') return null
  if (![row.start.x, row.start.y, row.start.z].every(Number.isFinite)) return null
  const axes = faceAxes(row.face)
  const inward = row.face.startsWith('+')
  const run = row.axis === 'U' ? axes.u : axes.v
  const across = row.axis === 'U' ? axes.v : axes.u
  const entry = inward ? dims[axes.depth] : 0
  const height = Math.min(row.depth, dims[axes.depth])
  return {
    depth: axes.depth,
    run,
    across,
    count: row.count,
    origin: row.start[run],
    pitch: row.pitch,
    acrossAt: row.start[across],
    axialLo: inward ? entry - height : 0,
    axialHi: inward ? entry : height,
    radius: row.diameter / 2,
    face: row.face,
    nominalDiameter: row.diameter,
    nominalDepth: row.depth,
  }
}

// Distance from a coordinate to a closed interval: 0 inside it, otherwise the nearest end.
export const intervalGap = (at: number, lo: number, hi: number): number =>
  Math.max(lo - at, 0, at - hi)

// First index in [0, count - 1] where a predicate that turns on once (and stays on) is already on.
// Costs about log2(count) probes, never count, so a billion-hole row costs the same as five.
export const firstIndex = (count: number, on: (k: number) => boolean): number | null => {
  if (count < 1 || !on(count - 1)) return null
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (on(mid)) hi = mid
    else lo = mid + 1
  }
  return lo
}

// Last index in [0, count - 1] where a predicate that is on first (and then turns off once, staying
// off) is still on.
export const lastIndex = (count: number, on: (k: number) => boolean): number | null => {
  if (count < 1 || !on(0)) return null
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2)
    if (on(mid)) lo = mid
    else hi = mid - 1
  }
  return lo
}

// First and last hole of a straight row whose per-index predicate holds. Distance to a convex
// obstacle is convex along the row, so the satisfying indices form one contiguous interval; the
// predicate is supplied as its two monotone edges — `enters` turns on exactly once as k grows, and
// `leaves` turns off exactly once. Their overlap is exactly the affected range. Callers in later
// stages reuse this with their own edges.
export function affectedRange(
  count: number,
  enters: (k: number) => boolean,
  leaves: (k: number) => boolean,
): [number, number] | null {
  const first = firstIndex(count, enters)
  if (first === null) return null
  const last = lastIndex(count, leaves)
  return last !== null && last >= first ? [first, last] : null
}

// 1-based index wording: `the hole` for a single-hole row, `hole i of n`, `holes i–j of n`.
export function spanOf(count: number, first: number, last: number): string {
  if (count === 1) return 'the hole'
  if (first === last) return `hole ${first + 1} of ${count}`
  return `holes ${first + 1}–${last + 1} of ${count}`
}

// A hole's run coordinate: the origin plus the hole's lattice step.
export const runAt = (drill: RowDrill, k: number): number => drill.origin + k * drill.pitch

// A hole's centre on an in-plane axis. Only valid for axes other than the drill's depth axis:
// the run coordinate varies with the hole index, the across coordinate is common.
export const holeCentreAt = (drill: RowDrill, k: number, axis: Axis): number =>
  axis === drill.run ? runAt(drill, k) : drill.acrossAt

// The finite centreline segment of one hole. The run and across coordinates are fixed by the
// lattice; only the depth axis moves, over the interval `rowDrillOf` clipped to the stock — which
// is why nothing else may rebuild that interval from `row.depth`.
export function holeSegment(drill: RowDrill, k: number): [Vec3, Vec3] {
  const at = (axial: number): Vec3 => {
    const point = { x: 0, y: 0, z: 0 }
    point[drill.run] = runAt(drill, k)
    point[drill.across] = drill.acrossAt
    point[drill.depth] = axial
    return point
  }
  return [at(drill.axialLo), at(drill.axialHi)]
}

// The two in-plane axes of a hole (everything but its depth axis).
export const planeAxesOf = (drill: RowDrill): [Axis, Axis] =>
  drill.depth === 'x' ? ['y', 'z'] : drill.depth === 'y' ? ['x', 'z'] : ['x', 'y']

// The one axis that is neither of the two given distinct axes.
export const thirdAxis = (one: Axis, other: Axis): Axis =>
  one === 'x' ? (other === 'y' ? 'z' : 'y') : other === 'x' ? 'y' : 'x'

// The interval a row occupies along an axis, before any radial expansion: its hole-centre run span
// when the row runs along that axis, its common across coordinate when the axis is its across, and
// its axial interval when the axis is its depth axis. All three are closed intervals.
export function extentAlong(row: RowDrill, axis: Axis): { lo: number; hi: number } {
  if (axis === row.run) return { lo: row.origin, hi: row.origin + (row.count - 1) * row.pitch }
  if (axis === row.across) return { lo: row.acrossAt, hi: row.acrossAt }
  return { lo: row.axialLo, hi: row.axialHi }
}

// Candidate holes for one row against another: holes whose run coordinate lies inside the other
// row's extent along this row's run axis, expanded by the summed radii — and by `margin`, which is
// how the web pass asks for the holes within a further MIN_REMAINING_WEB_MM rather than the holes
// that touch. The expansion is conservative — when the other row's pitch is wider than the
// summed radii, a hole sitting in a gap between the other row's holes enters the window; inside
// the window every pair is classified exactly, so such a hole is only ever examined, never
// falsely reported.
export function candidateRange(row: RowDrill, other: RowDrill, margin = 0): [number, number] | null {
  const extent = extentAlong(other, row.run)
  const expansion = row.radius + other.radius + margin
  return affectedRange(
    row.count,
    (k) => runAt(row, k) >= extent.lo - expansion,
    (k) => runAt(row, k) <= extent.hi + expansion,
  )
}

// Upper bound on holes classified inside a candidate window per row. Real cabinet drilling never
// reaches it: a perpendicular window is only as wide as the summed radii over the pitch, and a
// parallel window is the other row's run span over the pitch — hundreds of holes at millimetre
// spacing. Past the cap the window is treated as one affected run (conservative, never a miss),
// because per-hole work would otherwise scale with two window widths.
export const maxExactCandidates = 512

// Minimum distance between two finite segments, clamped at both ends.
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z }
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z }
  const r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z }
  const a = d1.x * d1.x + d1.y * d1.y + d1.z * d1.z
  const e = d2.x * d2.x + d2.y * d2.y + d2.z * d2.z
  const f = d2.x * r.x + d2.y * r.y + d2.z * r.z
  const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)
  const tiny = tolerance * tolerance // squared length below which a segment is a point
  let s: number
  let t: number
  if (a <= tiny && e <= tiny) {
    s = 0
    t = 0
  } else if (a <= tiny) {
    s = 0
    t = clamp01(f / e)
  } else {
    const c = d1.x * r.x + d1.y * r.y + d1.z * r.z
    if (e <= tiny) {
      t = 0
      s = clamp01(-c / a)
    } else {
      const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z
      const denom = a * e - b * b
      s = denom > 0 ? clamp01((b * f - c * e) / denom) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = clamp01(-c / a)
      } else if (t > 1) {
        t = 1
        s = clamp01((b - c) / a)
      }
    }
  }
  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s }
  const c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t }
  return Math.hypot(c1.x - c2.x, c1.y - c2.y, c1.z - c2.z)
}
