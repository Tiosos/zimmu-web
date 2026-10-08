import { expect, it } from 'vitest'
import {
  comparisonFixture,
  perPartComparisonFixture,
} from './__fixtures__/packetRevisionComparison'
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
    expect(link.getAttribute('href')).toMatch(
      /^#(?:[a-z]+|finding-\d+|part-summary-\d+|(?:outputs|limitations)-finding-\d+)$/,
    )
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
      expect(href).toMatch(
        /^#(?:[a-z]+|finding-\d+|part-summary-\d+|(?:outputs|limitations)-finding-\d+)$/,
      )
      expect(doc.querySelectorAll(href).length).toBe(1)
    }
    expect(doc.querySelectorAll('#metadata').length).toBe(metadata.length ? 1 : 0)
    expect(doc.querySelector('style')!.textContent).toContain(
      '@media print{.navigation{display:none}',
    )
  }
})

it('prints manufacturing and metadata finding progress with zero rows and unchanged partial scope', () => {
  const report = comparisonFixture()
  report.changes.push({
    ...report.changes[0],
    reference: 'PC:metadata',
    classification: 'metadata',
  })
  const review = createRevisionReview(report)
  review.changes[1].acknowledged = true
  const rows = (record: typeof review) => {
    const doc = parse(buildRevisionReviewHtml(record))
    const table = [...doc.querySelectorAll('table')].find(
      (item) =>
        item.querySelector('caption')?.textContent === 'Detected change progress by classification',
    )!
    return [...table.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    )
  }
  expect(rows(review)).toEqual([
    ['Manufacturing', '0', '1', '1'],
    ['Metadata', '1', '0', '1'],
  ])
  const empty = createRevisionReview({ ...report, status: 'partial', changes: [] })
  expect(rows(empty)).toEqual([
    ['Manufacturing', '0', '0', '0'],
    ['Metadata', '0', '0', '0'],
  ])
  expect(parse(buildRevisionReviewHtml(empty)).body.textContent).toContain(
    'Partial — missing fields were not assumed unchanged',
  )
})

it('prints complete per-part progress and escapes labels and IDs without assigning operation labels to parts', () => {
  const report = perPartComparisonFixture(),
    review = createRevisionReview(report)
  review.changes[0].acknowledged = true
  const doc = parse(buildRevisionReviewHtml(review))
  const table = [...doc.querySelectorAll('table')].find(
    (item) => item.querySelector('caption')?.textContent === 'Detected change progress by part',
  )!
  expect(
    [...table.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    ),
  ).toEqual([
    ['Boardpart', '1', '1', '1', '1', '2'],
    ['Boardother-part', '1', '0', '0', '1', '1'],
    ['operation-only', '0', '1', '0', '1', '1'],
  ])
  const payload = '<img src=x onerror=alert(1)>'
  report.changes[0].partId = payload
  report.changes[1].partId = payload
  report.changes[1].label = payload
  const hostile = parse(buildRevisionReviewHtml(createRevisionReview(report)))
  expect(hostile.querySelectorAll('img,script').length).toBe(0)
  expect(hostile.body.textContent).toContain(payload)
  const empty = parse(
    buildRevisionReviewHtml(createRevisionReview({ ...report, status: 'partial', changes: [] })),
  )
  expect(empty.body.textContent).toContain('No detected part or operation findings to summarize.')
  expect(empty.body.textContent).toContain('Partial — missing fields were not assumed unchanged')
})

it('links each part to its first recorded finding with fixed safe anchors despite pending-first rendering', () => {
  const report = perPartComparisonFixture()
  report.changes[0].partId = '<unsafe>#part'
  report.changes[1].partId = '<unsafe>#part'
  const review = createRevisionReview(report)
  review.changes[0].acknowledged = true
  const doc = parse(buildRevisionReviewHtml(review))
  const table = [...doc.querySelectorAll('table')].find(
    (item) => item.querySelector('caption')?.textContent === 'Detected change progress by part',
  )!
  const links = [...table.querySelectorAll('th a')]
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '#finding-0',
    '#finding-2',
    '#finding-3',
  ])
  expect(links[0].textContent).toContain('<unsafe>#part')
  expect(doc.querySelector('#finding-0')!.textContent).toContain('PC:manual')
  expect(doc.querySelector('#finding-2')!.textContent).toContain('PC:other-part')
  expect(doc.querySelector('#finding-3')!.textContent).toContain('PC:operation-only')
  expect(doc.querySelector('section:first-of-type article')!.id).toBe('finding-1')
  for (const link of links) expect(doc.querySelectorAll(link.getAttribute('href')!).length).toBe(1)
})

it('links pending counts to each exact part first unfinished finding in comparison order', () => {
  const report = perPartComparisonFixture()
  report.changes[0].partId = '<unsafe>"#part'
  report.changes[1].partId = '<unsafe>"#part'
  report.changes[2].partId = 'other<unsafe>"#part'
  report.changes.push({ ...report.changes[1], reference: 'PC:part-more' })
  const review = createRevisionReview(report)
  review.changes[0].acknowledged = true
  review.changes[3].acknowledged = true
  review.changes.reverse()
  const doc = parse(buildRevisionReviewHtml(review))
  const table = [...doc.querySelectorAll('table')].find(
    (item) => item.querySelector('caption')?.textContent === 'Detected change progress by part',
  )!
  const rows = [...table.querySelectorAll('tbody tr')]
  const links = [...table.querySelectorAll('td a')]
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['#finding-1', '#finding-2'])
  expect(links.map((link) => link.textContent)).toEqual(['2', '1'])
  expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
    'Review pending changes for part <unsafe>"#part',
    'Review pending changes for part other<unsafe>"#part',
  ])
  expect(rows[0].querySelector('th a')!.getAttribute('href')).toBe('#finding-0')
  expect(rows[2].children[4].textContent).toBe('0')
  expect(rows[2].children[4].querySelector('a')).toBeNull()
  for (const link of links) {
    const targets = doc.querySelectorAll(link.getAttribute('href')!)
    expect(targets.length).toBe(1)
    expect(targets[0].querySelector('h3')!.textContent).toContain('Pending')
  }
  expect(doc.querySelector('#finding-1')!.textContent).toContain('PC:part')
  expect(doc.querySelector('#finding-2')!.textContent).toContain('PC:other-part')
  expect(doc.querySelectorAll('img,script,[onerror]').length).toBe(0)
  expect(doc.querySelectorAll('section:first-of-type article').length).toBe(5)
  for (const item of review.changes) item.acknowledged = true
  const completed = parse(buildRevisionReviewHtml(review))
  const completedTable = [...completed.querySelectorAll('table')].find(
    (item) => item.querySelector('caption')?.textContent === 'Detected change progress by part',
  )!
  expect(completedTable.querySelectorAll('td a').length).toBe(0)
  expect(completedTable.querySelectorAll('th a').length).toBe(3)
})

it('returns every finding to its exact unique summary row with print-hidden navigation', () => {
  const report = perPartComparisonFixture()
  report.changes[0].partId = '<unsafe>"#part'
  report.changes[1].partId = '<unsafe>"#part'
  report.changes[2].partId = 'other<unsafe>"#part'
  report.changes.push({ ...report.changes[1], reference: 'PC:part-more' })
  const review = createRevisionReview(report)
  review.changes[0].acknowledged = true
  review.changes.reverse()
  const doc = parse(buildRevisionReviewHtml(review))
  const expected = [
    'part-summary-0',
    'part-summary-0',
    'part-summary-1',
    'part-summary-2',
    'part-summary-0',
  ]
  expect(doc.querySelectorAll('a[href^="#part-summary-"]').length).toBe(5)
  report.changes.forEach((change, index) => {
    const article = doc.querySelector(`#finding-${index}`)!
    const link = article.querySelector('a')!
    expect(link.textContent).toBe('Back to part summary')
    expect(link.getAttribute('href')).toBe(`#${expected[index]}`)
    expect(link.parentElement!.classList.contains('navigation')).toBe(true)
    const rows = doc.querySelectorAll(link.getAttribute('href')!)
    expect(rows.length).toBe(1)
    expect(rows[0].tagName).toBe('TR')
    expect(rows[0].querySelector('th')!.textContent).toContain(change.partId)
    const forward = rows[0].querySelector('th a')!
    expect(doc.querySelector(forward.getAttribute('href')!)!.textContent).toContain(change.partId)
  })
  expect(doc.querySelectorAll('img,script,[onerror]').length).toBe(0)
  const empty = parse(buildRevisionReviewHtml(createRevisionReview({ ...report, changes: [] })))
  expect(empty.querySelectorAll('a[href^="#part-summary-"]').length).toBe(0)
})

it('prints pending part summaries first and keeps forward and return links consistent', () => {
  const review = createRevisionReview(perPartComparisonFixture())
  review.changes[0].acknowledged = true
  review.changes[1].acknowledged = true
  const doc = parse(buildRevisionReviewHtml(review))
  const table = [...doc.querySelectorAll('table')].find(
    (item) => item.querySelector('caption')?.textContent === 'Detected change progress by part',
  )!
  const rows = [...table.querySelectorAll('tbody tr')]
  expect(rows.map((row) => row.children[0].textContent)).toEqual([
    'Boardother-part',
    'operation-only',
    'Boardpart',
  ])
  for (const row of rows) {
    for (const forward of row.querySelectorAll('a')) {
      const article = doc.querySelector(forward.getAttribute('href')!)!
      const back = article.querySelector('a')!
      expect(doc.querySelectorAll(back.getAttribute('href')!).length).toBe(1)
      expect(doc.querySelector(back.getAttribute('href')!)).toBe(row)
    }
  }
  expect(doc.querySelectorAll('#changes article').length).toBe(4)
})

it('links independent coverage pending counts to the first unfinished recorded item with safe anchors', () => {
  const report = comparisonFixture()
  report.otherChangedFiles = ['first.pdf', '<img src=x onerror=alert(1)>.pdf', 'third.pdf']
  report.limitations = ['Read first', '<unsafe>"#statement', 'Read last']
  const review = createRevisionReview(report)
  review.outputs[0].acknowledged = true
  review.limitations[0].acknowledged = true
  review.outputs.reverse()
  review.limitations.reverse()
  const doc = parse(buildRevisionReviewHtml(review))
  const links = [...doc.querySelectorAll('a[aria-label^="Review pending "]')].filter(
    (link) => !link.getAttribute('aria-label')!.includes('for part'),
  )
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '#outputs-finding-1',
    '#limitations-finding-1',
  ])
  expect(links.map((link) => link.textContent)).toEqual(['2', '2'])
  expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
    'Review pending other changed outputs',
    'Review pending comparison limitations',
  ])
  for (const link of links) {
    const targets = doc.querySelectorAll(link.getAttribute('href')!)
    expect(targets.length).toBe(1)
    expect(targets[0].querySelector('h3')!.textContent).toContain('Pending')
  }
  expect(doc.querySelector('#outputs-finding-1')!.textContent).toContain(
    report.otherChangedFiles[1],
  )
  expect(doc.querySelector('#limitations-finding-1')!.textContent).toContain(report.limitations[1])
  expect(doc.querySelectorAll('#outputs article').length).toBe(3)
  expect(doc.querySelectorAll('#limitations article').length).toBe(3)
  expect(doc.querySelectorAll('img,script,[onerror]').length).toBe(0)
  expect(doc.body.textContent).toContain('This is not production approval.')
})

it('keeps complete and empty coverage counts plain while detected-change counts stay separate', () => {
  const report = comparisonFixture(),
    review = createRevisionReview(report)
  review.outputs.forEach((item) => {
    item.acknowledged = true
  })
  review.limitations.forEach((item) => {
    item.acknowledged = true
  })
  const complete = parse(buildRevisionReviewHtml(review))
  expect(
    complete.querySelectorAll('a[href^="#outputs-finding-"],a[href^="#limitations-finding-"]')
      .length,
  ).toBe(0)
  const empty = parse(
    buildRevisionReviewHtml(
      createRevisionReview({ ...report, otherChangedFiles: [], limitations: [] }),
    ),
  )
  expect(
    empty.querySelectorAll('a[href^="#outputs-finding-"],a[href^="#limitations-finding-"]').length,
  ).toBe(0)
})
