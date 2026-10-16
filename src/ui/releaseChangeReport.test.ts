import { afterEach, expect, it, vi } from 'vitest'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { makeRelease } from '../scene/__fixtures__/release'
import { captureProductionSource } from './buildProductionPacket'
import {
  buildReleaseChangeReport,
  createChangeReview,
  releaseChangeReportFilename,
  releaseChangeReportHtml,
  releaseChangeReportJson,
} from './releaseChangeReport'
import * as hashes from '../scene/releases'
import { compareReleaseSource } from './compareReleaseSource'

const inputOf = () => ({
  scene: machiningProject(),
  projectName: 'Kitchen',
  hardwareLibrary: {},
  materialLibrary: {},
})
afterEach(() => vi.restoreAllMocks())

it('exports complete changes and exact source hashes without following later edits', async () => {
  const input = inputOf(),
    beforeSource = captureProductionSource(input)
  const release = await makeRelease({ revision: 3, source: beforeSource })
  const board = input.scene.parts.find((p) => p.kind === 'board')!
  if (board.kind !== 'board') throw new Error('Missing board')
  const oldLength = board.length
  board.length += 50
  input.scene.parts.pop()
  input.scene.parts.push({ ...structuredClone(board), id: 'new-board', label: 'New board' })
  const afterSource = captureProductionSource(input)
  const report = await buildReleaseChangeReport(
    release,
    afterSource,
    new Date('2026-10-15T04:00:00Z'),
  )
  expect(report.before).toMatchObject({
    revision: 3,
    sourceSha256: await hashes.sha256Hex(beforeSource),
    packetSha256: release.packetSha256,
  })
  expect(report.after.sourceSha256).toBe(await hashes.sha256Hex(afterSource))
  expect(report.counts).toMatchObject({ added: 1, removed: 1, modified: 1, manufacturing: 3 })
  const dimensions = report.changes
    .find((c) => c.id === board.id)!
    .fields.find((f) => f.name === 'dimensions')!
  expect(dimensions.before).toMatchObject({ length: oldLength })
  expect(dimensions.after).toMatchObject({ length: oldLength + 50 })
  expect(report.otherSourceChanges).toContain('Part source records')
  expect(report.limitations.length).toBeGreaterThan(0)
  const json = releaseChangeReportJson(report),
    html = releaseChangeReportHtml(report)
  board.length += 100
  release.revision = 99
  expect(releaseChangeReportJson(report)).toBe(json)
  expect(releaseChangeReportHtml(report)).toBe(html)
  expect(JSON.parse(json).generatedAt).toBe('2026-10-15T04:00:00.000Z')
})

it('captures baseline metadata before asynchronous hashing finishes', async () => {
  const source = captureProductionSource(inputOf())
  const release = await makeRelease({ source })
  let finish!: (value: string) => void
  vi.spyOn(hashes, 'sha256Hex').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = buildReleaseChangeReport(release, source)
  const hash = release.sourceSha256
  release.revision = 42
  release.sourceSha256 = '0'.repeat(64)
  finish(hash)
  expect((await pending).before.revision).toBe(1)
})

it('refuses corrupted baseline sources', async () => {
  const source = captureProductionSource(inputOf())
  const release = await makeRelease({ source, sourceSha256: '0'.repeat(64) })
  await expect(buildReleaseChangeReport(release, source)).rejects.toThrow(
    /no longer matches its hash/,
  )
})

it('prints all fields safely, retaining metadata, hardware and limitations', async () => {
  const input = inputOf()
  const release = await makeRelease({
    source: captureProductionSource(input),
    releasedBy: '<script>alert(1)</script>',
  })
  input.projectName = '../../<img src=x onerror=alert(1)> Café'
  input.scene.parts[0].label = '<svg onload=alert(1)>'
  input.scene.hardware = [
    {
      id: 'hardware',
      name: 'Hinge <unsafe>',
      qty: 2,
      unit: 'pcs',
      supplier: 'Shop',
      partNumber: 'H',
      unitCost: 3,
      notes: '<iframe src=x>',
      linkedPartIds: [],
      linkedComponentIds: [],
    },
  ]
  const report = await buildReleaseChangeReport(release, captureProductionSource(input))
  expect(report.changes.some((c) => c.classification === 'metadata')).toBe(true)
  expect(report.changes.some((c) => c.entity === 'hardware')).toBe(true)
  const html = releaseChangeReportHtml(report)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(doc.querySelectorAll('script,img,svg,iframe,a,link')).toHaveLength(0)
  expect(doc.querySelectorAll('tbody tr')).toHaveLength(
    report.changes.reduce((n, c) => n + c.fields.length, 0),
  )
  expect(doc.body.textContent).toContain('<svg onload=alert(1)>')
  expect(doc.body.textContent).toContain(report.before.sourceSha256)
  expect(doc.body.textContent).toContain(report.after.sourceSha256)
  for (const limit of report.limitations) expect(doc.body.textContent).toContain(limit)
  expect(html).toContain('@media print')
  expect(html).toContain('Content-Security-Policy')
  expect(releaseChangeReportFilename(report, 'html')).toMatch(
    /^change-report-[\p{L}\p{N}-]+-r1-[a-f0-9]{12}-to-[a-f0-9]{12}\.html$/u,
  )
})

it('retains an unchanged comparison with zero counts', async () => {
  const source = captureProductionSource(inputOf())
  const release = await makeRelease({ source })
  const report = await buildReleaseChangeReport(release, source)
  expect(report.changes).toEqual([])
  expect(report.before.sourceSha256).toBe(report.after.sourceSha256)
  expect(Object.values(report.counts).every((n) => n === 0)).toBe(true)
  expect(releaseChangeReportHtml(report)).toContain('No reported item changes in this category.')
})

it('exports every item beyond a 200-row review window', async () => {
  const input = inputOf()
  const template = input.scene.parts.find((p) => p.kind === 'board')!
  input.scene.parts = []
  input.scene.components = []
  input.scene.joints = []
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts = Array.from({ length: 205 }, (_, i) => ({
    ...structuredClone(template),
    id: `panel-${i}`,
    label: `Panel ${i}`,
    parentId: null,
  }))
  const report = await buildReleaseChangeReport(release, captureProductionSource(input))
  expect(report.counts.added).toBe(205)
  expect(JSON.parse(releaseChangeReportJson(report)).changes).toHaveLength(205)
  const doc = new DOMParser().parseFromString(releaseChangeReportHtml(report), 'text/html')
  expect(doc.querySelectorAll('article')).toHaveLength(205)
  expect(doc.body.textContent).toContain('Panel 204')
})

async function reviewFixture() {
  const input = inputOf()
  const beforeSource = captureProductionSource(input)
  const release = await makeRelease({ source: beforeSource })
  input.projectName = 'Reviewed kitchen'
  const source = captureProductionSource(input)
  const draft = createChangeReview(release, source, compareReleaseSource(beforeSource, source))
  return { release, source, draft }
}

it('exports review coverage, notes and progress without granting approval', async () => {
  const { release, source, draft } = await reviewFixture()
  draft.reviewer = '  Pat <script>bad()</script>  '
  draft.notes = 'Confirm all dimensions.\nSite check required.'
  draft.entries[0].reviewed = true
  draft.entries[0].note = '<img src=x onerror=bad()> Follow up'
  const report = await buildReleaseChangeReport(release, source, new Date(), draft)
  expect(report.schemaVersion).toBe(2)
  expect(report.review.reviewer).toBe('Pat <script>bad()</script>')
  expect(report.review.formalApproval).toBe('not-recorded')
  expect(report.review.progress).toEqual({
    reviewed: 1,
    pending: draft.entries.length - 1,
    total: draft.entries.length,
  })
  expect(report.review.entries.some((entry) => entry.category === 'source')).toBe(true)
  expect(report.review.entries.some((entry) => entry.category === 'limitation')).toBe(true)
  const doc = new DOMParser().parseFromString(releaseChangeReportHtml(report), 'text/html')
  expect(doc.querySelectorAll('script,img')).toHaveLength(0)
  expect(doc.body.textContent).toContain(draft.notes)
  expect(doc.body.textContent).toContain(draft.entries[0].note)
  expect(doc.body.textContent).toContain('Formal production approval: not recorded.')
  expect(JSON.parse(releaseChangeReportJson(report)).review.entries[0].reviewed).toBe(true)
})

it.each(['releaseId', 'revision', 'packetSha256', 'beforeSource', 'afterSource'] as const)(
  'rejects stale review context: %s',
  async (field) => {
    const { release, source, draft } = await reviewFixture()
    if (field === 'revision') draft.revision += 1
    else draft[field] += 'changed'
    await expect(buildReleaseChangeReport(release, source, new Date(), draft)).rejects.toThrow(
      /different source comparison/,
    )
  },
)

it.each(['missing', 'duplicate', 'unknown', 'long-note', 'long-name'] as const)(
  'rejects invalid review data: %s',
  async (kind) => {
    const { release, source, draft } = await reviewFixture()
    if (kind === 'missing') draft.entries.pop()
    if (kind === 'duplicate') draft.entries[1] = { ...draft.entries[0] }
    if (kind === 'unknown') draft.entries[0].reference = 'unknown'
    if (kind === 'long-note') draft.entries[0].note = 'x'.repeat(5001)
    if (kind === 'long-name') draft.reviewer = 'x'.repeat(101)
    await expect(buildReleaseChangeReport(release, source, new Date(), draft)).rejects.toThrow(
      /Invalid/,
    )
  },
)

it('captures review notes and check-offs before awaiting hashes', async () => {
  const { release, source, draft } = await reviewFixture()
  draft.notes = 'Captured note'
  draft.entries[0].reviewed = true
  let finish!: (value: string) => void
  vi.spyOn(hashes, 'sha256Hex').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = buildReleaseChangeReport(release, source, new Date(), draft)
  draft.notes = 'Later note'
  draft.entries[0].reviewed = false
  finish(release.sourceSha256)
  const report = await pending
  expect(report.review.notes).toBe('Captured note')
  expect(report.review.entries[0].reviewed).toBe(true)
})
