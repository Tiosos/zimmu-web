import { describe, expect, it } from 'vitest'
import {
  comparisonFixture,
  perPartComparisonFixture,
} from './__fixtures__/packetRevisionComparison'
import {
  createRevisionReview,
  importRevisionReview,
  revisionReviewClassificationProgress,
  revisionReviewPartProgress,
} from './packetRevisionReview'

describe('local revision review binding', () => {
  it('round-trips acknowledgments, notes, hashes, provenance, locations and limitations', () => {
    const report = comparisonFixture(),
      review = createRevisionReview(report)
    review.changes[0].acknowledged = true
    review.changes[0].note = 'Checked revised length'
    review.reviewer = 'Shop reviewer'
    review.notes = 'Check remaining output separately'
    expect(importRevisionReview(JSON.parse(JSON.stringify(review)), report)).toEqual(review)
    expect(review.comparison.changes[0].after?.locations).toEqual(['later.pdf#page=2'])
  })
  it('rejects changed archives, reversed revisions and altered comparison details', () => {
    const report = comparisonFixture(),
      review = createRevisionReview(report)
    expect(() =>
      importRevisionReview(review, {
        ...report,
        after: { ...report.after, sha256: 'c'.repeat(64) },
      }),
    ).toThrow(/hashes/)
    expect(() =>
      importRevisionReview(review, { ...report, before: report.after, after: report.before }),
    ).toThrow(/hashes/)
    const altered = structuredClone(review)
    altered.comparison.changes[0].after!.locations = ['wrong.pdf#page=9']
    expect(() => importRevisionReview(altered, report)).toThrow(/does not match/)
  })
  it('rejects duplicate, unknown, missing and malformed acknowledgments', () => {
    const report = comparisonFixture(),
      review = createRevisionReview(report)
    for (const changes of [
      [],
      [...review.changes, ...review.changes],
      [{ ...review.changes[0], reference: 'unknown' }],
      [{ ...review.changes[0], acknowledged: 'yes' }],
    ])
      expect(() => importRevisionReview({ ...review, changes }, report)).toThrow()
    expect(() => importRevisionReview({ ...review, schemaVersion: 3 }, report)).toThrow()
    expect(() => importRevisionReview({ ...review, savedAt: 'invalid' }, report)).toThrow()
  })
  it('keeps partial coverage and handles zero detected changes without implying approval', () => {
    const report = { ...comparisonFixture(), status: 'partial' as const, changes: [] }
    const review = createRevisionReview(report)
    expect(importRevisionReview(review, report).comparison.status).toBe('partial')
    expect(review.changes).toEqual([])
    expect('approved' in review).toBe(false)
    expect(() => createRevisionReview({ ...report, status: 'blocked' })).toThrow()
    expect(() =>
      createRevisionReview({ ...report, before: { ...report.before, sha256: null } }),
    ).toThrow()
  })
})

it('round-trips output and limitation notes with stable references independent of list order', () => {
  const report = comparisonFixture()
  report.otherChangedFiles.push('lists/boards.csv')
  report.limitations.push('Partial stock coverage')
  const review = createRevisionReview(report)
  expect(review.outputs[0].reference).toBe('PO:"drawings/shop-drawings.pdf"')
  expect(review.limitations[0].reference).toBe('PL:"Unsigned packets"')
  review.outputs[0].acknowledged = true
  review.outputs[0].note = 'Earlier and later sheets inspected'
  review.limitations[0].acknowledged = true
  review.limitations[0].note = 'Identity requires external confirmation'
  const input = JSON.parse(JSON.stringify(review))
  input.outputs.reverse()
  input.limitations.reverse()
  expect(importRevisionReview(input, report)).toEqual(review)
})

it('migrates version-1 drafts with old change progress retained and new coverage unchecked', () => {
  const report = comparisonFixture(),
    review = createRevisionReview(report)
  review.changes[0].acknowledged = true
  review.changes[0].note = 'Geometry checked'
  review.outputs[0].acknowledged = true
  const { outputs: _outputs, limitations: _limitations, ...legacy } = review
  void _outputs
  void _limitations
  const migrated = importRevisionReview({ ...legacy, schemaVersion: 1 }, report)
  expect(migrated.schemaVersion).toBe(2)
  expect(migrated.changes).toEqual(review.changes)
  expect(migrated.outputs.every((entry) => !entry.acknowledged && entry.note === '')).toBe(true)
  expect(migrated.limitations.every((entry) => !entry.acknowledged && entry.note === '')).toBe(true)
  expect(() => importRevisionReview({ ...review, schemaVersion: 1 }, report)).toThrow(/Version-1/)
})

it('rejects invalid, duplicate, missing and unknown coverage references in both groups', () => {
  const report = comparisonFixture(),
    review = createRevisionReview(report)
  for (const group of ['outputs', 'limitations'] as const) {
    for (const entries of [
      undefined,
      [],
      [...review[group], ...review[group]],
      [{ ...review[group][0], reference: 'unknown' }],
      [{ ...review[group][0], acknowledged: 'yes' }],
      [{ ...review[group][0], note: false }],
    ])
      expect(() => importRevisionReview({ ...review, [group]: entries }, report)).toThrow()
  }
  const altered = structuredClone(review)
  altered.comparison.otherChangedFiles.push('unexpected.pdf')
  expect(() => importRevisionReview(altered, report)).toThrow(/does not match/)
})

it('counts whole classifications by stable reference, including zero groups and mixed fields', () => {
  const report = comparisonFixture()
  report.changes[0].fields.push({
    field: 'name',
    classification: 'metadata',
    before: 'A',
    after: 'B',
  })
  report.changes.push({
    ...report.changes[0],
    reference: 'PC:metadata',
    classification: 'metadata',
  })
  report.changes.push({ ...report.changes[0], reference: 'PC:pending' })
  report.counts.manufacturing = 99
  const review = createRevisionReview(report)
  review.changes[0].acknowledged = true
  review.changes.reverse()
  expect(revisionReviewClassificationProgress(review)).toEqual([
    { classification: 'manufacturing', acknowledged: 1, pending: 1, total: 2 },
    { classification: 'metadata', acknowledged: 0, pending: 1, total: 1 },
  ])
  review.changes.find((item) => item.reference === 'PC:metadata')!.acknowledged = true
  expect(revisionReviewClassificationProgress(review)[1]).toEqual({
    classification: 'metadata',
    acknowledged: 1,
    pending: 0,
    total: 1,
  })
  expect(
    revisionReviewClassificationProgress(createRevisionReview({ ...report, changes: [] })),
  ).toEqual([
    { classification: 'manufacturing', acknowledged: 0, pending: 0, total: 0 },
    { classification: 'metadata', acknowledged: 0, pending: 0, total: 0 },
  ])
})

it('groups part and manual/geometric operation findings by stable part ID and acknowledgment references', () => {
  const report = perPartComparisonFixture(),
    review = createRevisionReview(report)
  review.changes[0].acknowledged = true
  review.changes[2].acknowledged = true
  review.changes.reverse()
  expect(revisionReviewPartProgress(review)).toEqual([
    {
      partId: 'part',
      label: 'Board',
      partFindings: 1,
      operationFindings: 1,
      acknowledged: 1,
      pending: 1,
      total: 2,
    },
    {
      partId: 'other-part',
      label: 'Board',
      partFindings: 1,
      operationFindings: 0,
      acknowledged: 1,
      pending: 0,
      total: 1,
    },
    {
      partId: 'operation-only',
      label: null,
      partFindings: 0,
      operationFindings: 1,
      acknowledged: 0,
      pending: 1,
      total: 1,
    },
  ])
  expect(
    revisionReviewPartProgress(createRevisionReview({ ...report, status: 'partial', changes: [] })),
  ).toEqual([])
})
