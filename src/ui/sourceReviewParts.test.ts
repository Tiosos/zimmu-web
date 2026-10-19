import { expect, it } from 'vitest'
import { sourceReviewParts } from './sourceReviewParts'
import type { SourceChange } from './compareReleaseSource'
const change = (patch: Partial<SourceChange>): SourceChange => ({
  key: 'part-a',
  entity: 'part',
  id: 'a',
  label: 'Before A',
  partIds: ['a'],
  change: 'modified',
  fields: [],
  classification: 'manufacturing',
  ...patch,
})
it('deduplicates shared references, uses current labels and retains removed parts', () => {
  const changes = [
    change({}),
    change({ key: 'hardware', entity: 'hardware', id: 'hinge', partIds: ['a', 'a', 'b'] }),
    change({
      key: 'removed',
      id: 'removed',
      label: 'Removed shelf',
      partIds: [],
      change: 'removed',
    }),
  ]
  expect(
    sourceReviewParts(
      changes,
      new Map([
        ['a', { label: 'Current A' }],
        ['b', { label: 'Current B' }],
      ]),
    ),
  ).toEqual([
    { id: 'a', label: 'Current A', removed: false, references: ['item:part-a', 'item:hardware'] },
    { id: 'b', label: 'Current B', removed: false, references: ['item:hardware'] },
    { id: 'removed', label: 'Removed shelf', removed: true, references: ['item:removed'] },
  ])
  expect(changes[1].partIds).toEqual(['a', 'a', 'b'])
})
it('keeps unlinked hardware out of the part list and safely represents linked unknown IDs', () => {
  expect(sourceReviewParts([change({ entity: 'hardware', partIds: [] })], new Map())).toEqual([])
  expect(
    sourceReviewParts([change({ entity: 'hardware', partIds: ['unknown'] })], new Map())[0],
  ).toMatchObject({ id: 'unknown', label: 'unknown', removed: true })
})
