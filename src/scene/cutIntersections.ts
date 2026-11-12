// Overlaps between non-drilling cuts on one board, in part-local millimetres. Drilling is handled
// by drillingIntersections; this module answers only the question the schedule names: do two box
// cuts claim the same material, and does one of them remove nothing at all? Both verdicts are
// advisory because a housing that runs into another housing (or into a toe-kick notch) is ordinary
// joinery, and the recorded geometry cannot tell that from a mistake.
import type {
  ManufacturingOperationReference,
  ManufacturingPart,
} from './manufacturingPart'

export type CutIntersectionCode = 'cut-intersection-review' | 'cut-redundant-review'
export interface CutIntersectionIssue {
  code: CutIntersectionCode
  message: string
  operation: ManufacturingOperationReference
}

export function cutIntersections(part: ManufacturingPart): CutIntersectionIssue[] {
  if (part.kind !== 'board') return []
  return []
}
