// Overlaps between non-drilling cuts on one board, in part-local millimetres. Drilling is handled
// by drillingIntersections; this module answers only the question the schedule names: do two box
// cuts claim the same material, and does one of them remove nothing at all? Both verdicts are
// advisory because a housing that runs into another housing (or into a toe-kick notch) is ordinary
// joinery, and the recorded geometry cannot tell that from a mistake.
import type {
  ManufacturingOperationReference,
  ManufacturingPart,
} from './manufacturingPart'
import { boxVolumeOf, type BoxVolume } from './cutVolumes'
import type { BoxCut } from './types'

export type CutIntersectionCode = 'cut-intersection-review' | 'cut-redundant-review'
export interface CutIntersectionIssue {
  code: CutIntersectionCode
  message: string
  operation: ManufacturingOperationReference
}

const tolerance = 1e-6 // mm; the same boundary tolerance the drilling checks apply.
const axes = ['x', 'y', 'z'] as const
type Axis = (typeof axes)[number]

// The material two boxes both claim on one axis. A non-positive value means they do not share
// material there; touching at a face, edge or corner is how joinery meets, not an overlap.
function sharedExtent(a: BoxVolume, b: BoxVolume, axis: Axis): number {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis])
}

// A box lies inside another when every face is on or within the other's at the tolerance. The
// boundary is inclusive: a box ending exactly on the container's face is contained.
function containedBy(outer: BoxVolume, inner: BoxVolume): boolean {
  return axes.every(
    (axis) =>
      inner.min[axis] >= outer.min[axis] - tolerance &&
      inner.max[axis] <= outer.max[axis] + tolerance,
  )
}

function operationOf(cut: BoxCut): ManufacturingOperationReference {
  return {
    id: cut.id,
    label: cut.label,
    kind: 'box',
    sourceComponentId: cut.sourceComponentId ?? null,
    sourceJointId: cut.sourceJointId ?? null,
  }
}

function intersectionIssue(first: BoxCut, second: BoxCut): CutIntersectionIssue {
  return {
    code: 'cut-intersection-review',
    message: `Cut "${first.label}" [${first.id}]: shares removed material with cut "${second.label}" [${second.id}]; verify this is intended.`,
    operation: operationOf(first),
  }
}

function redundantIssue(
  inner: BoxCut,
  outer: BoxCut,
  kind: 'inside' | 'repeat',
): CutIntersectionIssue {
  return {
    code: 'cut-redundant-review',
    message:
      kind === 'inside'
        ? `Cut "${inner.label}" [${inner.id}]: lies entirely inside cut "${outer.label}" [${outer.id}]; it removes no additional material.`
        : `Cut "${inner.label}" [${inner.id}]: repeats cut "${outer.label}" [${outer.id}] at the same volume; one of the two can be removed.`,
    operation: operationOf(inner),
  }
}

export function cutIntersections(part: ManufacturingPart): CutIntersectionIssue[] {
  if (part.kind !== 'board') return []
  const boxes: { cut: BoxCut; volume: BoxVolume }[] = []
  for (const cut of part.cuts) {
    if (cut.kind !== 'box') continue
    const volume = boxVolumeOf(cut)
    if (volume !== null) boxes.push({ cut, volume })
  }
  const issues: CutIntersectionIssue[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const first = boxes[i]
      const second = boxes[j]
      if (axes.some((axis) => sharedExtent(first.volume, second.volume, axis) <= tolerance))
        continue
      const firstInSecond = containedBy(second.volume, first.volume)
      const secondInFirst = containedBy(first.volume, second.volume)
      if (firstInSecond && secondInFirst)
        issues.push(redundantIssue(second.cut, first.cut, 'repeat'))
      else if (firstInSecond) issues.push(redundantIssue(first.cut, second.cut, 'inside'))
      else if (secondInFirst) issues.push(redundantIssue(second.cut, first.cut, 'inside'))
      else issues.push(intersectionIssue(first.cut, second.cut))
    }
  }
  return issues
}
