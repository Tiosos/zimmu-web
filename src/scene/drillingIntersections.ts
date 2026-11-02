// Intersections between board drilling and other material removals, in part-local millimetres —
// the same frame the per-cut drilling checks use. Visibility, world placement, grain and rates
// cannot reach this answer: only the recorded cut definitions and the recorded stock do.
//
// Findings are appended after the per-cut findings, so a row that is both out of bounds and
// crossing a cut reports `drilling-bounds` first, then `drilling-intersection`. A drill whose
// volume cannot be built is suppressed through `undefinedVolume`; a drill that is merely out of
// bounds keeps its nominal volume and is still intersected — suppressing it would hide a collision
// that survives the bounds fix.
//
// A hole that falls wholly inside a cut's void currently reports here as an intersection too;
// classifying fully voided holes as `drilling-redundant` is a separate pass over the same
// drill volumes and index ranges.
import type { ManufacturingBoard, ManufacturingPart } from './manufacturingPart'
import { faceAxes } from './snapMath'
import { MIN_CUT_SIZE_MM } from '../geom/cutLimits'
import type { BoxCut, DowelBoreAxial, DowelBoreTransverse, HoleArrayCut, Vec3 } from './types'

export type DrillingCut = HoleArrayCut | DowelBoreAxial | DowelBoreTransverse
export type DrillingIntersectionCode =
  | 'drilling-intersection'
  | 'drilling-redundant'
  | 'drilling-overlap-review'
export interface DrillingIntersectionIssue {
  code: DrillingIntersectionCode
  cut: DrillingCut
  detail: string // message suffix only; drillingChecks adds the `Drilling "<label>" [<id>]: ` prefix
}

const tolerance = 1e-6 // mm; the same boundary tolerance the per-cut checks apply.

type Axis = keyof Vec3

interface RowDrill {
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
}

// A row is a family of cylinders on a lattice: hole k (0-based) sits at origin + k * pitch along
// the run axis at the common across coordinate, drilled from the entry face inward. A depth at or
// past the stock extent is a through hole, not an error, so the extent is clipped, never rejected.
function rowDrillOf(board: ManufacturingBoard, row: HoleArrayCut): RowDrill {
  const dims: Record<Axis, number> = {
    x: board.local.length,
    y: board.local.width,
    z: board.local.thickness,
  }
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
  }
}

// A box cut removes [position, position + size]. A box with any size at or below the exporter's
// minimum is absent: makeShape skips it, so the packet never manufactures it either.
function boxVolumeOf(box: BoxCut): { min: Vec3; max: Vec3 } | null {
  return box.size.x > MIN_CUT_SIZE_MM &&
    box.size.y > MIN_CUT_SIZE_MM &&
    box.size.z > MIN_CUT_SIZE_MM
    ? {
        min: box.position,
        max: {
          x: box.position.x + box.size.x,
          y: box.position.y + box.size.y,
          z: box.position.z + box.size.z,
        },
      }
    : null
}

// Distance from a coordinate to a closed interval: 0 inside it, otherwise the nearest end.
const intervalGap = (at: number, lo: number, hi: number): number => Math.max(lo - at, 0, at - hi)

// First index in [0, count - 1] where a predicate that turns on once (and stays on) is already on.
// Costs about log2(count) probes, never count, so a billion-hole row costs the same as five.
const firstIndex = (count: number, on: (k: number) => boolean): number | null => {
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
const lastIndex = (count: number, on: (k: number) => boolean): number | null => {
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
function affectedRange(
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
function spanOf(count: number, first: number, last: number): string {
  if (count === 1) return 'the hole'
  if (first === last) return `hole ${first + 1} of ${count}`
  return `holes ${first + 1}–${last + 1} of ${count}`
}

export function drillingIntersections(
  part: ManufacturingPart,
  undefinedVolume: ReadonlySet<string>, // ids of cuts whose volume is undefined; skip them
): DrillingIntersectionIssue[] {
  if (part.kind !== 'board') return [] // boards only in this stage; rows on round stock stay unassessed.
  const issues: DrillingIntersectionIssue[] = []
  const cuts = part.cuts
  // Pairs are walked in (i, j) order and reported as they come, so output is sorted by the pair's
  // position in `cuts`. Roles come from the cut kinds, not the loop position: a box defined before
  // a row forms the same pair as one defined after it.
  for (let i = 0; i < cuts.length; i++) {
    for (let j = i + 1; j < cuts.length; j++) {
      const first = cuts[i]
      const second = cuts[j]
      const row = first.kind === 'hole-array' ? first : second.kind === 'hole-array' ? second : null
      const boxCut = first.kind === 'box' ? first : second.kind === 'box' ? second : null
      if (row === null || boxCut === null) continue
      if (undefinedVolume.has(row.id) || undefinedVolume.has(boxCut.id)) continue
      const drill = rowDrillOf(part, row)
      const obstacle = boxVolumeOf(boxCut)
      if (obstacle === null) continue
      // Cylinder against axis-aligned box, exact: the axial intervals must overlap by more than the
      // tolerance, and the circle-to-rectangle distance in the cross-section plane must beat the
      // radius by more than it. Tangency and overlaps no thicker than the tolerance are allowed.
      const axialOverlap =
        Math.min(drill.axialHi, obstacle.max[drill.depth]) -
        Math.max(drill.axialLo, obstacle.min[drill.depth])
      if (!(axialOverlap > tolerance)) continue
      const acrossGap = intervalGap(
        drill.acrossAt,
        obstacle.min[drill.across],
        obstacle.max[drill.across],
      )
      const reachSq = (drill.radius - tolerance) ** 2 - acrossGap * acrossGap
      if (!(reachSq > 0)) continue
      const reach = Math.sqrt(reachSq)
      const range = affectedRange(
        drill.count,
        (k) => drill.origin + k * drill.pitch > obstacle.min[drill.run] - reach,
        (k) => drill.origin + k * drill.pitch < obstacle.max[drill.run] + reach,
      )
      if (range === null) continue
      const [firstHole, lastHole] = range
      issues.push({
        code: 'drilling-intersection',
        cut: row,
        detail: `${spanOf(drill.count, firstHole, lastHole)} ${
          drill.count === 1 || firstHole === lastHole ? 'intersects' : 'intersect'
        } cut "${boxCut.label}" [${boxCut.id}]; the opening is broken.`,
      })
    }
  }
  return issues
}
