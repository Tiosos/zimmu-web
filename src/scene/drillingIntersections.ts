// Intersections between drilling and other material removals, in part-local millimetres — the same
// frame the per-cut drilling checks use. Visibility, world placement, grain and rates cannot reach
// this answer: only the recorded cut definitions and the recorded stock do. Boards carry hole
// arrays against box cuts, other rows and themselves; round stock carries axial and transverse
// bores against each other and against notches, with square end cuts moving the datum rather than
// acting as obstacles.
//
// Findings are appended after the per-cut findings, so a row that is both out of bounds and
// crossing a cut reports `drilling-bounds` first, then `drilling-intersection`. A drill whose
// volume cannot be built is suppressed through `undefinedVolume`; a drill that is merely out of
// bounds keeps its nominal volume and is still intersected — suppressing it would hide a collision
// that survives the bounds fix.
//
// A hole a cut removes entirely is voided, not clipped: the wholly-inside holes take their
// `drilling-redundant` verdict first, and the collision ranges are computed only over the indices
// that verdict did not claim, so a hole is never reported twice for one pair.
import type { ManufacturingBoard, ManufacturingPart, ManufacturingRoundStock } from './manufacturingPart'
import { boxVolumeOf } from './cutVolumes'
import {
  affectedRange,
  candidateRange,
  holeCentreAt,
  intervalGap,
  maxExactCandidates,
  planeAxesOf,
  rowDrillOf,
  segmentDistance,
  spanOf,
  thirdAxis,
  tolerance,
  type RowDrill,
} from './drillGeometry'
import type { DowelBoreAxial, DowelBoreTransverse, DowelNotch, HoleArrayCut, Vec3 } from './types'

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

// Cylinder × cylinder with perpendicular axes (a `+X` bore meeting a `+Z` bore at a corner), exact:
// the spec's two-circle feasibility on the two along-axis coordinates. A shared point exists when
// the common cross-coordinate falls within both discs' reach, which is maximised at the clamped
// along-axis coordinate of the other cylinder; the overlap must beat the tolerance.
function perpendicularOverlap(a: RowDrill, ka: number, b: RowDrill, kb: number): boolean {
  const common = thirdAxis(a.depth, b.depth)
  const v1 = holeCentreAt(a, ka, b.depth)
  const w1 = holeCentreAt(a, ka, common)
  const u2 = holeCentreAt(b, kb, a.depth)
  const w2 = holeCentreAt(b, kb, common)
  const vLo = Math.max(b.axialLo, v1 - a.radius)
  const vHi = Math.min(b.axialHi, v1 + a.radius)
  if (vHi < vLo) return false
  const uLo = Math.max(a.axialLo, u2 - b.radius)
  const uHi = Math.min(a.axialHi, u2 + b.radius)
  if (uHi < uLo) return false
  const vAt = Math.min(Math.max(v1, vLo), vHi)
  const uAt = Math.min(Math.max(u2, uLo), uHi)
  const reachSqA = a.radius * a.radius - (vAt - v1) * (vAt - v1)
  const reachSqB = b.radius * b.radius - (uAt - u2) * (uAt - u2)
  const reach = Math.sqrt(Math.max(reachSqA, 0)) + Math.sqrt(Math.max(reachSqB, 0))
  return Math.abs(w1 - w2) < reach - tolerance
}

// One pair of holes, one from each row, classified once by the design's precedence list: coaxial
// with the same diameter and depth is a repeat (reviewed) when both enter from the same face or
// from opposite faces whose volumes meet; coaxial and stepped from the same face is an ordinary
// counterbore (allowed); coaxial and stepped from opposite faces whose volumes overlap breaks the
// stock; non-coaxial volumes that overlap always do. Tangency and overlaps no thicker than the
// tolerance are allowed.
function holePairVerdict(
  a: RowDrill,
  ka: number,
  b: RowDrill,
  kb: number,
): 'review' | 'block' | 'allow' {
  if (a.depth === b.depth) {
    let planarSq = 0
    let coaxial = true
    for (const g of planeAxesOf(a)) {
      const d = holeCentreAt(a, ka, g) - holeCentreAt(b, kb, g)
      planarSq += d * d
      if (Math.abs(d) > tolerance) coaxial = false
    }
    if (coaxial) {
      const identical =
        Math.abs(a.nominalDiameter - b.nominalDiameter) <= tolerance &&
        Math.abs(a.nominalDepth - b.nominalDepth) <= tolerance
      if (a.face === b.face) return identical ? 'review' : 'allow'
      const axial = Math.min(a.axialHi, b.axialHi) - Math.max(a.axialLo, b.axialLo)
      // Opposite faces: the same diameter and depth is a repeat only when the two bores actually
      // meet, i.e. together they make one hole. Two identical blind bores at opposite ends of a
      // long rail are separate features with solid stock between them, not a duplicate definition.
      if (identical) return axial >= -tolerance ? 'review' : 'allow'
      return axial > tolerance ? 'block' : 'allow'
    }
    const axial = Math.min(a.axialHi, b.axialHi) - Math.max(a.axialLo, b.axialLo)
    if (!(axial > tolerance)) return 'allow'
    return planarSq < (a.radius + b.radius - tolerance) ** 2 ? 'block' : 'allow'
  }
  return perpendicularOverlap(a, ka, b, kb) ? 'block' : 'allow'
}

// Two drilling rows against each other. Candidate windows are bounded by geometry on both sides
// (never by `count`), every candidate pair is classified exactly, and each hole of the reported row
// keeps its strongest verdict — a repeat may not mask a real collision sharing that hole.
function rowPairIssues(
  part: ManufacturingBoard,
  first: HoleArrayCut, // the earlier cut in `part.cuts`; findings attach to it
  second: HoleArrayCut,
): DrillingIntersectionIssue[] {
  const a = rowDrillOf(part, first)
  const b = rowDrillOf(part, second)
  if (a === null || b === null) return []
  const windowA = candidateRange(a, b)
  const windowB = candidateRange(b, a)
  if (windowA === null || windowB === null) return []
  const [firstHole, lastHole] = windowA
  const target = ` drilling "${second.label}" [${second.id}]`
  const issues: DrillingIntersectionIssue[] = []
  // One verdict covers a run of holes, so the verb agrees with the run it spans.
  const blocked = (from: number, to: number) =>
    `${spanOf(a.count, from, to)} ${a.count === 1 || from === to ? 'breaks' : 'break'} into${target}; the opening is broken.`
  if (
    lastHole - firstHole + 1 > maxExactCandidates ||
    windowB[1] - windowB[0] + 1 > maxExactCandidates
  ) {
    issues.push({ code: 'drilling-intersection', cut: first, detail: blocked(firstHole, lastHole) })
    return issues
  }
  const verdicts: Array<'review' | 'block' | 'allow'> = new Array(lastHole - firstHole + 1).fill(
    'allow',
  )
  for (let k = firstHole; k <= lastHole; k++) {
    let verdict: 'review' | 'block' | 'allow' = 'allow'
    for (let l = windowB[0]; l <= windowB[1]; l++) {
      const pair = holePairVerdict(a, k, b, l)
      if (pair === 'block') {
        verdict = 'block' // strongest verdict wins; a repeat never downgrades a collision
        break
      }
      if (pair === 'review' && verdict === 'allow') verdict = 'review'
    }
    verdicts[k - firstHole] = verdict
  }
  let k = firstHole
  while (k <= lastHole) {
    const verdict = verdicts[k - firstHole]
    if (verdict === 'allow') {
      k++
      continue
    }
    let last = k
    while (last < lastHole && verdicts[last + 1 - firstHole] === verdict) last++
    issues.push({
      code: verdict === 'review' ? 'drilling-overlap-review' : 'drilling-intersection',
      cut: first,
      detail:
        verdict === 'review'
          ? `${spanOf(a.count, k, last)} ${
              a.count === 1 || k === last ? 'repeats' : 'repeat'
            }${target} at the same position and diameter; verify this is intended.`
          : blocked(k, last),
    })
    k = last + 1
  }
  return issues
}

// --- Round stock -------------------------------------------------------------------------------
//
// A cylinder part's material is r <= D/2 over the finished extent [offsetMinus, L - offsetPlus].
// A square end cut moves that datum; it is not an obstacle. A bore is a cylinder; a notch is the
// conjunction of a radial half-space and a width slab. Axial x transverse reuses the board's exact
// two-circle feasibility after a rotation that puts the transverse bore on x. Transverse x
// transverse uses the minimum distance between the two finite axis segments, which is conservative:
// it cannot miss an intersection but may report a near miss at the capped ends, as the design
// records.

const DEG2RAD = Math.PI / 180

interface AxialBore {
  kind: 'bore-axial'
  cut: DowelBoreAxial
  radius: number
  axialLo: number
  axialHi: number
  end: '+Z' | '-Z'
  diameter: number // recorded, unclipped: the identity a same-end repeat is judged on
  depth: number // recorded, unclipped
}

interface TransverseBore {
  kind: 'bore-transverse'
  cut: DowelBoreTransverse
  radius: number
  position: number // z along the stock
  azimuth: number // radians
  surface: number // stock radius the bore enters from
  height: number // radial depth actually removed, clipped at the stock diameter
}

type Bore = AxialBore | TransverseBore

// A square end cut shortens the stock; several on one end get the innermost offset. An extent that
// is empty or reversed is a stock problem the per-cut checks cannot express, so the part is skipped.
function finishedExtentOf(part: ManufacturingRoundStock): { lo: number; hi: number } | null {
  let plus = 0
  let minus = 0
  for (const cut of part.cuts) {
    if (cut.kind !== 'end' || cut.angle !== 0 || !(cut.offset > 0)) continue
    if (cut.end === '+Z') plus = Math.max(plus, cut.offset)
    // `DowelEndCut.end` is exactly '+Z' | '-Z'; anything else would be a malformed record.
    else minus = Math.max(minus, cut.offset)
  }
  const hi = part.length - plus
  return hi > minus ? { lo: minus, hi } : null
}

function axialBoreOf(cut: DowelBoreAxial, extent: { lo: number; hi: number }): AxialBore {
  const height = Math.min(cut.depth, extent.hi - extent.lo)
  return {
    kind: 'bore-axial',
    cut,
    radius: cut.diameter / 2,
    axialLo: cut.end === '+Z' ? extent.hi - height : extent.lo,
    axialHi: cut.end === '+Z' ? extent.hi : extent.lo + height,
    end: cut.end,
    diameter: cut.diameter,
    depth: cut.depth,
  }
}

function transverseBoreOf(cut: DowelBoreTransverse, stockRadius: number): TransverseBore {
  return {
    kind: 'bore-transverse',
    cut,
    radius: cut.diameter / 2,
    position: cut.position,
    azimuth: cut.azimuth * DEG2RAD,
    surface: stockRadius,
    height: Math.min(cut.depth, 2 * stockRadius),
  }
}

interface CylinderVolume {
  base: Vec3
  axis: Vec3 // unit vector along the finite segment
  height: number
  radius: number
}

// The nominal removed volume of a bore as a finite cylinder. Axial bores run along z from the
// finished cap; transverse bores run radially inward from the stock surface.
function cylinderOfBore(bore: Bore): CylinderVolume {
  if (bore.kind === 'bore-axial')
    return {
      base: { x: 0, y: 0, z: bore.axialLo },
      axis: { x: 0, y: 0, z: 1 },
      height: bore.axialHi - bore.axialLo,
      radius: bore.radius,
    }
  const cos = Math.cos(bore.azimuth)
  const sin = Math.sin(bore.azimuth)
  return {
    base: { x: bore.surface * cos, y: bore.surface * sin, z: bore.position },
    axis: { x: -cos, y: -sin, z: 0 },
    height: bore.height,
    radius: bore.radius,
  }
}

// Same-end bores start from one cap: an identical pair is a repeat, a stepped pair is an ordinary
// counterbore. Opposite-end bores that meet or overlap inside the stock leave no web, so they are
// reviewed rather than blocked — the design treats the duplication as the defect worth naming.
function axialPairVerdict(a: AxialBore, b: AxialBore): 'repeat' | 'meet' | 'allow' {
  if (a.end === b.end)
    return Math.abs(a.diameter - b.diameter) <= tolerance &&
      Math.abs(a.depth - b.depth) <= tolerance
      ? 'repeat'
      : 'allow'
  const overlap = Math.min(a.axialHi, b.axialHi) - Math.max(a.axialLo, b.axialLo)
  return overlap >= -tolerance ? 'meet' : 'allow'
}

// The transverse bore's axis passes through the stock axis, so in a frame rotated to put it on x
// both axes meet at (0, 0) and the spec's two-circle feasibility reduces to the two reaches at the
// clamped coordinates. The radial window [surface - height, surface] and the axial z interval are
// the feasible windows; a bore too shallow to reach the axial bore's wall is separated by stock.
function axialTransverseOverlap(axial: AxialBore, transverse: TransverseBore): boolean {
  const ra = axial.radius
  const rb = transverse.radius
  const xLo = Math.max(transverse.surface - transverse.height, -ra)
  const xHi = Math.min(transverse.surface, ra)
  if (xHi < xLo) return false
  const zLo = Math.max(axial.axialLo, transverse.position - rb)
  const zHi = Math.min(axial.axialHi, transverse.position + rb)
  if (zHi < zLo) return false
  const x = Math.min(Math.max(0, xLo), xHi) // axial axis is at x = 0
  const z = Math.min(Math.max(transverse.position, zLo), zHi) // transverse axis is at z = position
  const reachA = Math.sqrt(Math.max(ra * ra - x * x, 0))
  const reachB = Math.sqrt(Math.max(rb * rb - (z - transverse.position) ** 2, 0))
  return reachA + reachB > tolerance
}

// The radial segment each transverse bore removes, from the surface to its capped inner end.
function transverseSegment(bore: TransverseBore): [Vec3, Vec3] {
  const cos = Math.cos(bore.azimuth)
  const sin = Math.sin(bore.azimuth)
  return [
    { x: bore.surface * cos, y: bore.surface * sin, z: bore.position },
    {
      x: (bore.surface - bore.height) * cos,
      y: (bore.surface - bore.height) * sin,
      z: bore.position,
    },
  ]
}

function transversePairOverlap(a: TransverseBore, b: TransverseBore): boolean {
  const [p1, q1] = transverseSegment(a)
  const [p2, q2] = transverseSegment(b)
  return segmentDistance(p1, q1, p2, q2) < a.radius + b.radius - tolerance
}

// The range of a linear function n·P over a finite cylinder: the segment's end values, widened by
// the disc's reach perpendicular to n. Exact, and the spec's slab predicate.
function linearRange(cylinder: CylinderVolume, n: Vec3): [number, number] {
  const atBase = n.x * cylinder.base.x + n.y * cylinder.base.y + n.z * cylinder.base.z
  const tip = {
    x: cylinder.base.x + cylinder.axis.x * cylinder.height,
    y: cylinder.base.y + cylinder.axis.y * cylinder.height,
    z: cylinder.base.z + cylinder.axis.z * cylinder.height,
  }
  const atTip = n.x * tip.x + n.y * tip.y + n.z * tip.z
  const along = Math.abs(n.x * cylinder.axis.x + n.y * cylinder.axis.y + n.z * cylinder.axis.z)
  const spread = cylinder.radius * Math.sqrt(Math.max(1 - along * along, 0))
  return [Math.min(atBase, atTip) - spread, Math.max(atBase, atTip) + spread]
}

// A notch is the conjunction of the radial half-space n·P >= R - depth and the width slab
// z in [position ± width/2]. Both must overlap the bore's range; testing each separately is
// conservative only at the corner where the two meet, as the design records.
function boreNotchOverlap(bore: Bore, notch: DowelNotch, stockRadius: number): boolean {
  const cylinder = cylinderOfBore(bore)
  const azimuth = notch.azimuth * DEG2RAD
  const radial = { x: Math.cos(azimuth), y: Math.sin(azimuth), z: 0 }
  const [radialLo, radialHi] = linearRange(cylinder, radial)
  if (radialHi - Math.max(radialLo, stockRadius - notch.depth) <= tolerance) return false
  const [zLo, zHi] = linearRange(cylinder, { x: 0, y: 0, z: 1 })
  return (
    Math.min(zHi, notch.position + notch.width / 2) -
      Math.max(zLo, notch.position - notch.width / 2) >
    tolerance
  )
}

const isBoreCut = (cut: { kind: string }): boolean =>
  cut.kind === 'bore-axial' || cut.kind === 'bore-transverse'

type BorePairVerdict = 'block' | 'repeat' | 'meet' | 'allow'

function borePairVerdict(a: Bore, b: Bore): BorePairVerdict {
  if (a.kind === 'bore-axial' && b.kind === 'bore-axial') return axialPairVerdict(a, b)
  if (a.kind === 'bore-axial' && b.kind === 'bore-transverse')
    return axialTransverseOverlap(a, b) ? 'block' : 'allow'
  if (a.kind === 'bore-transverse' && b.kind === 'bore-axial')
    return axialTransverseOverlap(b, a) ? 'block' : 'allow'
  return a.kind === 'bore-transverse' && b.kind === 'bore-transverse' && transversePairOverlap(a, b)
    ? 'block'
    : 'allow'
}

function roundStockIssues(
  part: ManufacturingRoundStock,
  undefinedVolume: ReadonlySet<string>,
): DrillingIntersectionIssue[] {
  const extent = finishedExtentOf(part)
  if (extent === null) return []
  const stockRadius = part.diameter / 2
  // One volume per cut, aligned with `cuts`. A null entry is not a drill: it is an end cut, a
  // notch, an undefined volume, or an unsupported bore end. Pair roles come from the cut kinds, so
  // the same pair is formed whatever order the records are stored in.
  const volumes = part.cuts.map((cut): Bore | null => {
    if (undefinedVolume.has(cut.id)) return null
    if (cut.kind === 'bore-axial')
      return cut.end === '+Z' || cut.end === '-Z' ? axialBoreOf(cut, extent) : null
    if (cut.kind === 'bore-transverse') return transverseBoreOf(cut, stockRadius)
    return null
  })
  const issues: DrillingIntersectionIssue[] = []
  const subject = 'the bore'
  for (let i = 0; i < part.cuts.length; i++) {
    for (let j = i + 1; j < part.cuts.length; j++) {
      const first = part.cuts[i]
      const second = part.cuts[j]
      const firstBore = volumes[i]
      const secondBore = volumes[j]
      // Drill x drill: reported once, on the earlier cut, with the later cut's identity in the
      // message. A repeat never masks a collision; the verdict is one per pair.
      if (isBoreCut(first) && isBoreCut(second)) {
        if (firstBore === null || secondBore === null) continue
        const verdict = borePairVerdict(firstBore, secondBore)
        if (verdict === 'allow') continue
        const other = secondBore.cut
        issues.push({
          code: verdict === 'block' ? 'drilling-intersection' : 'drilling-overlap-review',
          cut: firstBore.cut,
          detail:
            verdict === 'repeat'
              ? `${subject} repeats drilling "${other.label}" [${other.id}] at the same position and diameter; verify this is intended.`
              : verdict === 'meet'
                ? `${subject} meets drilling "${other.label}" [${other.id}] inside the stock; verify this is intended.`
                : `${subject} breaks into drilling "${other.label}" [${other.id}]; the opening is broken.`,
        })
        continue
      }
      // Bore x notch: the finding attaches to the drill, whichever comes first.
      const bore = isBoreCut(first) ? firstBore : isBoreCut(second) ? secondBore : null
      const notch = first.kind === 'notch' ? first : second.kind === 'notch' ? second : null
      if (bore === null || notch === null) continue
      if (boreNotchOverlap(bore, notch, stockRadius))
        issues.push({
          code: 'drilling-intersection',
          cut: bore.cut,
          detail: `${subject} intersects cut "${notch.label}" [${notch.id}]; the opening is broken.`,
        })
    }
  }
  return issues
}

export function drillingIntersections(
  part: ManufacturingPart,
  undefinedVolume: ReadonlySet<string>, // ids of cuts whose volume is undefined; skip them
): DrillingIntersectionIssue[] {
  if (part.kind === 'cylinder') return roundStockIssues(part, undefinedVolume)
  const issues: DrillingIntersectionIssue[] = []
  const cuts = part.cuts
  // Adjacent holes of one row are a single verdict for the whole operation: either every opening
  // stays distinct (pitch at least the diameter) or the openings merge into one slot. `count > 1`
  // keeps single-hole rows (whose recorded pitch may be 0) out of this rule; `drilling-array`
  // already rejects pitch <= 0, but a row that still reaches here must not loop either — no
  // per-hole work happens below the comparison.
  for (const cut of cuts) {
    if (
      cut.kind === 'hole-array' &&
      !undefinedVolume.has(cut.id) &&
      cut.count > 1 &&
      cut.pitch < cut.diameter
    )
      issues.push({
        code: 'drilling-intersection',
        cut,
        detail: `adjacent holes overlap (pitch ${cut.pitch} mm, diameter ${cut.diameter} mm); the openings merge into a continuous slot.`,
      })
  }
  // Pairs are walked in (i, j) order and reported as they come, so output is sorted by the pair's
  // position in `cuts`. Roles come from the cut kinds, not the loop position: a box defined before
  // a row forms the same pair as one defined after it. Two drilling rows form a pair once, on the
  // earlier cut, with the later cut's identity in the message; the mirrored finding is never made.
  for (let i = 0; i < cuts.length; i++) {
    for (let j = i + 1; j < cuts.length; j++) {
      const first = cuts[i]
      const second = cuts[j]
      if (first.kind === 'hole-array' && second.kind === 'hole-array') {
        if (undefinedVolume.has(first.id) || undefinedVolume.has(second.id)) continue
        issues.push(...rowPairIssues(part, first, second))
        continue
      }
      const row = first.kind === 'hole-array' ? first : second.kind === 'hole-array' ? second : null
      const boxCut = first.kind === 'box' ? first : second.kind === 'box' ? second : null
      if (row === null || boxCut === null) continue
      if (undefinedVolume.has(row.id) || undefinedVolume.has(boxCut.id)) continue
      const drill = rowDrillOf(part, row)
      const obstacle = boxVolumeOf(boxCut)
      if (drill === null || obstacle === null) continue
      // One verdict per hole, voided before clipped: a cylinder whose axial interval sits inside
      // the box's depth interval and whose disc sits inside the cross-section rectangle — both
      // boundary-inclusive at the same tolerance, so a hole tangent to an edge counts as inside —
      // leaves nothing to drill and reports `drilling-redundant`, never a collision.
      const axialInside =
        drill.axialLo >= obstacle.min[drill.depth] - tolerance &&
        drill.axialHi <= obstacle.max[drill.depth] + tolerance
      const discInside =
        drill.acrossAt - obstacle.min[drill.across] >= drill.radius - tolerance &&
        obstacle.max[drill.across] - drill.acrossAt >= drill.radius - tolerance
      // Both containment edges are monotone in the hole index along the run axis, so the voided
      // range still comes out of the same bisection helpers as any affected range.
      const voidedLo = obstacle.min[drill.run] + drill.radius - tolerance
      const voidedHi = obstacle.max[drill.run] - drill.radius + tolerance
      let voided: [number, number] | null = null
      if (axialInside && discInside) {
        voided = affectedRange(
          drill.count,
          (k) => drill.origin + k * drill.pitch >= voidedLo,
          (k) => drill.origin + k * drill.pitch <= voidedHi,
        )
      }
      if (voided !== null) {
        const [voidedFirst, voidedLast] = voided
        issues.push({
          code: 'drilling-redundant',
          cut: row,
          detail: `${spanOf(drill.count, voidedFirst, voidedLast)} ${
            drill.count === 1 || voidedFirst === voidedLast ? 'lies' : 'lie'
          } entirely inside cut "${boxCut.label}" [${boxCut.id}]; no hole will remain.`,
        })
      }
      // Cylinder against axis-aligned box, exact: the axial intervals must overlap by more than the
      // tolerance, and the circle-to-rectangle distance in the cross-section plane must beat the
      // radius by more than it. Tangency and overlaps no thicker than the tolerance are allowed.
      // The collision ranges cover only what the voided range left — the whole row when nothing is
      // voided, else the runs on either side of it, one finding per run — so no hole is ever part
      // of two findings for this pair. Distance to a convex obstacle is convex in the run
      // coordinate, so each window still holds one contiguous range.
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
      const reachLo = obstacle.min[drill.run] - reach
      const reachHi = obstacle.max[drill.run] + reach
      const windows: Array<[number, number]> =
        voided === null
          ? [[0, drill.count - 1]]
          : [
              [0, voided[0] - 1],
              [voided[1] + 1, drill.count - 1],
            ]
      for (const [lo, hi] of windows) {
        if (hi < lo) continue
        const range = affectedRange(
          hi - lo + 1,
          (k) => drill.origin + (lo + k) * drill.pitch > reachLo,
          (k) => drill.origin + (lo + k) * drill.pitch < reachHi,
        )
        if (range === null) continue
        const [firstHole, lastHole] = [range[0] + lo, range[1] + lo]
        issues.push({
          code: 'drilling-intersection',
          cut: row,
          detail: `${spanOf(drill.count, firstHole, lastHole)} ${
            drill.count === 1 || firstHole === lastHole ? 'intersects' : 'intersect'
          } cut "${boxCut.label}" [${boxCut.id}]; the opening is broken.`,
        })
      }
    }
  }
  return issues
}
