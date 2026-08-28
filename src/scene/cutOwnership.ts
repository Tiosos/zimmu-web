import type { BoxCut, CutDef, HoleArrayCut } from './types'

// A joint owns a cut whichever kind it is. Asked in seven places — reconciliation, duplication,
// editing, removal, pairing, and the panel — and a copy that forgot a kind is how a stale bore
// survives its joint.
//
// A type predicate rather than a bare boolean, so a caller that has established ownership can then
// read the id without a second kind check or a non-null assertion. Without it the orphan strip
// could not use a Set and had to scan every joint per cut.
export function isJointOwned(
  cut: CutDef,
): cut is (BoxCut | HoleArrayCut) & { sourceJointId: string } {
  return (cut.kind === 'box' || cut.kind === 'hole-array') && cut.sourceJointId !== undefined
}

export function isOwnedBy(cut: CutDef, jointId: string): boolean {
  return (cut.kind === 'box' || cut.kind === 'hole-array') && cut.sourceJointId === jointId
}
