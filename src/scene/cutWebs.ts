// Findings for two cuts on one board that leave too little solid material between them, in
// part-local millimetres, ordered by cut. A web thinner than MIN_REMAINING_WEB_MM tears out under a
// router or drill and collapses in edge-banding or transport, but ordinary joinery puts features
// close together on purpose — a hinge cup beside a door groove, a runner pilot hole beside a bottom
// rebate — so the verdict is advisory and never blocks an export. A pair that touches or shares
// material belongs to cutIntersections or drillingIntersections, which name the meeting itself;
// this module reports only what is left between two volumes that do not meet.
import { MIN_REMAINING_WEB_MM } from '../geom/cutLimits'
import type {
  ManufacturingBoard,
  ManufacturingOperationReference,
  ManufacturingPart,
} from './manufacturingPart'
import { boxVolumeOf, type BoxVolume } from './cutVolumes'
import {
  candidateRange,
  holeCentreAt,
  holeSegment,
  intervalGap,
  maxExactCandidates,
  planeAxesOf,
  rowDrillOf,
  segmentDistance,
  tolerance,
  type RowDrill,
} from './drillGeometry'
import type { CutDef } from './types'

export type CutWebCode = 'cut-web-review'
export interface CutWebIssue {
  code: CutWebCode
  message: string
  operation: ManufacturingOperationReference
}

const axes = ['x', 'y', 'z'] as const

// Two decimals, truncated rather than rounded: a web of 2.999 mm would otherwise print
// "3.00 mm … thinner than the 3.00 mm minimum", a sentence that contradicts itself in a document
// a workshop reads. The cost is at most 0.01 mm of understatement in an advisory message.
const webText = (web: number) => (Math.floor(web * 100) / 100).toFixed(2)

function operationOf(cut: CutDef): ManufacturingOperationReference {
  return {
    id: cut.id,
    label: cut.label,
    kind: cut.kind,
    sourceComponentId: cut.sourceComponentId ?? null,
    sourceJointId: cut.kind === 'mitre' ? null : (cut.sourceJointId ?? null),
  }
}

// The material two boxes leave between them: each axis contributes its gap — zero where the two
// intervals overlap — and the three compose as a Euclidean distance.
function boxBoxWeb(a: BoxVolume, b: BoxVolume): number {
  let total = 0
  for (const axis of axes) {
    const gap = Math.max(
      0,
      Math.max(a.min[axis], b.min[axis]) - Math.min(a.max[axis], b.max[axis]),
    )
    total += gap * gap
  }
  return Math.sqrt(total)
}

// The web one hole leaves with a box. The axial gap and the in-plane gap between the hole's disc
// and the box's rectangle are independent — the cylinder and the box are both prisms on the same
// axis — so they compose as a Euclidean distance. Both terms are zero where the volumes overlap,
// which is the overlap passes' case, not this one.
function holeBoxWeb(drill: RowDrill, k: number, box: BoxVolume): number {
  const [u, v] = planeAxesOf(drill)
  // The hole's axial interval is `[axialLo, axialHi]`, clipped to the stock by `rowDrillOf`. The
  // box is either wholly below it or wholly above it, never both, so the larger of the two
  // one-sided gaps is the interval-to-interval distance.
  const axialGap = Math.max(
    0,
    drill.axialLo - box.max[drill.depth],
    box.min[drill.depth] - drill.axialHi,
  )
  const gapU = intervalGap(holeCentreAt(drill, k, u), box.min[u], box.max[u])
  const gapV = intervalGap(holeCentreAt(drill, k, v), box.min[v], box.max[v])
  const planeGap = Math.max(0, Math.hypot(gapU, gapV) - drill.radius)
  return Math.hypot(axialGap, planeGap)
}

// The two holes flanking a box along the row's run axis, clamped into the row. Web thickness is
// monotone in the distance from the box — the axial and across terms do not move with the hole
// index — so the nearest hole on each side is the thinnest web that side can leave, and two
// evaluations answer the pair whatever the row's count. A row of a billion holes costs the same
// as a row of five.
function flankingHoles(drill: RowDrill, box: BoxVolume): number[] {
  if (drill.count === 1) return [0]
  const last = drill.count - 1
  const clamp = (k: number) => Math.min(last, Math.max(0, k))
  const lo = box.min[drill.run]
  const hi = box.max[drill.run]
  const left = clamp(Math.ceil((lo - drill.origin) / drill.pitch) - 1)
  const right = clamp(Math.floor((hi - drill.origin) / drill.pitch) + 1)
  return left === right ? [left] : [left, right]
}

// The thinnest web the row leaves with the box, over the holes that do not touch it, or null when
// every candidate touches. A pair that touches is a meeting the drilling pass has already named.
function rowBoxWeb(drill: RowDrill, box: BoxVolume): number | null {
  let best: number | null = null
  for (const k of flankingHoles(drill, box)) {
    const web = holeBoxWeb(drill, k, box)
    if (!(web > tolerance)) continue
    best = best === null ? web : Math.min(best, web)
  }
  return best
}

// Two holes: the shortest distance between their centreline segments, less both radii. A cylinder
// is not a capsule — its ends are flat discs — so the capsule distance is the smaller of the two.
// The report may therefore be a fraction thicker than reality and never misses a web, which is the
// right direction for an advisory verdict.
function holeHoleWeb(a: RowDrill, ka: number, b: RowDrill, kb: number): number {
  const [a0, a1] = holeSegment(a, ka)
  const [b0, b1] = holeSegment(b, kb)
  return Math.max(0, segmentDistance(a0, a1, b0, b1) - (a.radius + b.radius))
}

// The thinnest web two rows leave. The candidate windows are bounded by geometry on both sides —
// never by `count` — and expanded by MIN_REMAINING_WEB_MM so a pair that is close but not touching
// enters them. Past the cap the window's first pair is reported instead: conservative, and
// unreachable by real cabinet drilling, where a window is hundreds of holes at millimetre spacing.
//
// Every candidate pair is measured, touching ones included. A pair that touches drives the minimum
// to 0 and yields the whole row pair to the drilling pass, which has already named the meeting —
// the webs beside a crossing are a pitch artefact, not a design decision. The 0 is returned as-is;
// `cutWebs`'s single tolerance gate is what silences it, so there is no second gate here to drift
// out of step with that one.
function rowRowWeb(a: RowDrill, b: RowDrill): number | null {
  const windowA = candidateRange(a, b, MIN_REMAINING_WEB_MM)
  const windowB = candidateRange(b, a, MIN_REMAINING_WEB_MM)
  if (windowA === null || windowB === null) return null
  const [firstA, lastA] = windowA
  const [firstB, lastB] = windowB
  if (lastA - firstA + 1 > maxExactCandidates || lastB - firstB + 1 > maxExactCandidates)
    return holeHoleWeb(a, firstA, b, firstB)
  let best = Number.POSITIVE_INFINITY
  for (let ka = firstA; ka <= lastA; ka++)
    for (let kb = firstB; kb <= lastB; kb++) best = Math.min(best, holeHoleWeb(a, ka, b, kb))
  return best
}

// The web a pair leaves, or null when the pair is not this module's to report: a bevelled edge is
// unassessed, a cut whose volume cannot be built is the geometry review's, and a box at or below
// the exporter's minimum is absent from the solid.
function pairWeb(part: ManufacturingBoard, first: CutDef, second: CutDef): number | null {
  if (first.kind === 'mitre' || second.kind === 'mitre') return null
  if (first.kind === 'box' && second.kind === 'box') {
    const a = boxVolumeOf(first)
    const b = boxVolumeOf(second)
    return a === null || b === null ? null : boxBoxWeb(a, b)
  }
  if (first.kind === 'hole-array' && second.kind === 'hole-array') {
    const a = rowDrillOf(part, first)
    const b = rowDrillOf(part, second)
    return a === null || b === null ? null : rowRowWeb(a, b)
  }
  const boxCut = first.kind === 'box' ? first : second.kind === 'box' ? second : null
  const row = first.kind === 'hole-array' ? first : second.kind === 'hole-array' ? second : null
  if (boxCut === null || row === null) return null
  const volume = boxVolumeOf(boxCut)
  const drill = rowDrillOf(part, row)
  return volume === null || drill === null ? null : rowBoxWeb(drill, volume)
}

// Pairs are walked in (i, j) order and appended as they come, so the output is already ordered by
// the earlier cut — the order `manufacturingChecks` turns into positional M<n> references.
export function cutWebs(part: ManufacturingPart): CutWebIssue[] {
  if (part.kind !== 'board') return []
  const issues: CutWebIssue[] = []
  const cuts = part.cuts
  for (let i = 0; i < cuts.length; i++) {
    for (let j = i + 1; j < cuts.length; j++) {
      const first = cuts[i]
      const second = cuts[j]
      const web = pairWeb(part, first, second)
      // The lower gate is the tolerance, not zero: a pair closer than that is a meeting, and the
      // overlap passes have already reported it with a better message.
      if (web === null || !(web > tolerance && web < MIN_REMAINING_WEB_MM)) continue
      issues.push({
        code: 'cut-web-review',
        message: `${first.kind === 'hole-array' ? 'Drilling' : 'Cut'} "${first.label}" [${first.id}]: leaves a web of ${webText(web)} mm with ${
          second.kind === 'hole-array' ? 'drilling' : 'cut'
        } "${second.label}" [${second.id}], thinner than the ${MIN_REMAINING_WEB_MM.toFixed(2)} mm minimum; verify this is intended.`,
        operation: operationOf(first),
      })
    }
  }
  return issues
}
