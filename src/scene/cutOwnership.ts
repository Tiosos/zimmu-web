import type { CutDef } from './types'

// A joint owns a cut whichever kind it is. Asked in seven places — reconciliation, duplication,
// editing, removal, pairing, and the panel — and a copy that forgot a kind is how a stale bore
// survives its joint.
export function isJointOwned(cut: CutDef): boolean {
  return (cut.kind === 'box' || cut.kind === 'hole-array') && cut.sourceJointId !== undefined
}

export function isOwnedBy(cut: CutDef, jointId: string): boolean {
  return (cut.kind === 'box' || cut.kind === 'hole-array') && cut.sourceJointId === jointId
}
