// Findings for two cuts on one board that leave too little solid material between them, in
// part-local millimetres, ordered by cut. A web thinner than MIN_REMAINING_WEB_MM tears out under a
// router or drill and collapses in edge-banding or transport, but ordinary joinery puts features
// close together on purpose — a hinge cup beside a door groove, a runner pilot hole beside a bottom
// rebate — so the verdict is advisory and never blocks an export. A pair that touches or shares
// material belongs to cutIntersections or drillingIntersections, which name the meeting itself;
// this module reports only what is left between two volumes that do not meet.
import { MIN_REMAINING_WEB_MM } from '../geom/cutLimits'
import type {
  ManufacturingOperationReference,
  ManufacturingPart,
} from './manufacturingPart'
import { boxVolumeOf, type BoxVolume } from './cutVolumes'
import { tolerance } from './drillGeometry'
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

// The web a pair leaves, or null when the pair is not this module's to report: a bevelled edge is
// unassessed, a cut whose volume cannot be built is the geometry review's, and a box at or below
// the exporter's minimum is absent from the solid.
function pairWeb(first: CutDef, second: CutDef): number | null {
  if (first.kind === 'mitre' || second.kind === 'mitre') return null
  if (first.kind !== 'box' || second.kind !== 'box') return null
  const a = boxVolumeOf(first)
  const b = boxVolumeOf(second)
  return a === null || b === null ? null : boxBoxWeb(a, b)
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
      const web = pairWeb(first, second)
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
