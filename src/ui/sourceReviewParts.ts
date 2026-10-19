import type { SourceChange } from './compareReleaseSource'
export interface SourceReviewPart {
  id: string
  label: string
  removed: boolean
  references: string[]
}
export function sourceReviewParts(
  changes: readonly SourceChange[],
  current: ReadonlyMap<string, { label: string }>,
): SourceReviewPart[] {
  const groups = new Map<string, SourceReviewPart>()
  for (const change of changes) {
    const ids = new Set(change.entity === 'part' ? [change.id, ...change.partIds] : change.partIds)
    for (const id of ids) {
      let group = groups.get(id)
      if (!group) {
        group = {
          id,
          label:
            current.get(id)?.label ??
            (change.entity === 'part' && change.id === id ? change.label : id),
          removed: !current.has(id),
          references: [],
        }
        groups.set(id, group)
      }
      const reference = `item:${change.key}`
      if (!group.references.includes(reference)) group.references.push(reference)
    }
  }
  return [...groups.values()]
}
