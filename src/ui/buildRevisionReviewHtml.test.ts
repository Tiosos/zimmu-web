import { expect, it } from 'vitest'
import { comparisonFixture } from './__fixtures__/packetRevisionComparison'
import { createRevisionReview } from './packetRevisionReview'
import { buildRevisionReviewHtml } from './buildRevisionReviewHtml'
import type { PacketRevisionReport } from './compareProductionPackets'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
it('prints independent pending counts, notes, hashes, provenance, fields and both output locations', () => {
  const report = comparisonFixture()
  report.changes.push({ ...report.changes[0], reference: 'PC:pending', label: 'Pending board' })
  report.packetMetadataChanges = ['projectName']
  const review = createRevisionReview(report)
  review.changes[0].acknowledged = true
  review.changes[0].note = 'Length checked'
  review.outputs[0].note = 'Inspect stock output next'
  review.notes = 'Overall\nnotes'
  review.reviewer = 'Workshop'
  const doc = parse(buildRevisionReviewHtml(review)),
    text = doc.body.textContent!
  expect(
    [...doc.querySelectorAll('section:first-of-type article h3')].map((node) => node.textContent),
  ).toEqual(['Pending — modified part: Pending board', 'Acknowledged — modified part: Board'])
  expect(
    [...doc.querySelectorAll('table:nth-of-type(2) tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    ),
  ).toEqual([
    ['Detected changes', '1', '1', '2'],
    ['Other changed outputs', '0', '1', '1'],
    ['Comparison limitations', '0', '1', '1'],
  ])
  for (const expected of [
    'Length checked',
    'Overall\nnotes',
    'Workshop',
    'earlier.pdf#page=1',
    'later.pdf#page=2',
    'cabinet',
    'dimensions',
    '600',
    '720',
    'projectName',
    report.before.sha256!,
    report.after.sha256!,
    'PO:"drawings/shop-drawings.pdf"',
    'PL:"Unsigned packets"',
  ])
    expect(text).toContain(expected)
  expect(text).toContain('not production approval')
  expect(doc.querySelector('style')!.textContent).toContain('@media print')
})
it('escapes adversarial text in every content group and never adds active content or external links', () => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>&\'"',
    report = comparisonFixture()
  report.changes[0].label = payload
  report.changes[0].partId = payload
  report.changes[0].before!.locations = [payload]
  report.changes[0].before!.provenance = { owner: payload }
  report.changes[0].fields[0].after = payload
  report.otherChangedFiles = [payload]
  report.limitations = [payload]
  report.before.projectName = payload
  const review = createRevisionReview(report)
  review.reviewer = payload
  review.notes = payload
  review.changes[0].note = payload
  review.outputs[0].note = payload
  review.limitations[0].note = payload
  const doc = parse(buildRevisionReviewHtml(review))
  expect(doc.querySelectorAll('script,img,svg,iframe,link,form').length).toBe(0)
  expect(doc.body.textContent).toContain(payload)
  for (const link of doc.querySelectorAll('a')) {
    expect(link.getAttribute('href')).toMatch(/^#[a-z]+$/)
    expect(doc.querySelectorAll(link.getAttribute('href')!).length).toBe(1)
  }
  expect(
    doc.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content'),
  ).toContain("default-src 'none'")
})
it('retains partial and zero-change limits and includes all items beyond the UI preview', () => {
  const report: PacketRevisionReport = { ...comparisonFixture(), status: 'partial', changes: [] }
  expect(parse(buildRevisionReviewHtml(createRevisionReview(report))).body.textContent).toContain(
    'Partial — missing fields were not assumed unchanged',
  )
  expect(parse(buildRevisionReviewHtml(createRevisionReview(report))).body.textContent).toContain(
    'No detected changes. This does not establish production readiness.',
  )
  report.changes = Array.from({ length: 201 }, (_, index) => ({
    ...comparisonFixture().changes[0],
    reference: `PC:${index}`,
  }))
  const doc = parse(buildRevisionReviewHtml(createRevisionReview(report)))
  expect(doc.querySelectorAll('section:first-of-type article').length).toBe(201)
  expect(doc.body.textContent).toContain('PC:200')
})
it('retains manual operation identity, definitions on additions and rejects incomplete progress', () => {
  const report = comparisonFixture()
  report.changes[0] = {
    ...report.changes[0],
    entity: 'operation',
    operationId: 'manual-id',
    label: 'Manual instruction',
    change: 'added',
    fields: [],
    before: null,
    after: {
      locations: ['schedule.json#/entries/0', 'drawings.pdf#page=2'],
      provenance: { jointId: 'joint' },
      definition: { kind: 'manual', instruction: 'Drill on site' },
    },
  }
  const review = createRevisionReview(report),
    text = parse(buildRevisionReviewHtml(review)).body.textContent
  for (const expected of [
    'Manual instruction',
    'manual-id',
    'Drill on site',
    'joint',
    'Absent in this revision.',
  ])
    expect(text).toContain(expected)
  review.outputs = []
  expect(() => buildRevisionReviewHtml(review)).toThrow(/output references/)
})

it('resolves all internal links once, including empty groups and conditional metadata', () => {
  for (const metadata of [[], ['projectName']]) {
    const report = comparisonFixture()
    report.packetMetadataChanges = metadata
    report.changes = []
    report.otherChangedFiles = []
    report.limitations = []
    const doc = parse(buildRevisionReviewHtml(createRevisionReview(report)))
    expect(doc.querySelector('nav')!.getAttribute('aria-label')).toBe('Review contents')
    expect(doc.querySelectorAll('nav a').length).toBe(metadata.length ? 6 : 5)
    expect(doc.querySelectorAll('a[href="#contents"]').length).toBe(3)
    for (const link of doc.querySelectorAll('a')) {
      const href = link.getAttribute('href')!
      expect(href).toMatch(/^#[a-z]+$/)
      expect(doc.querySelectorAll(href).length).toBe(1)
    }
    expect(doc.querySelectorAll('#metadata').length).toBe(metadata.length ? 1 : 0)
    expect(doc.querySelector('style')!.textContent).toContain(
      '@media print{.navigation{display:none}',
    )
  }
})
