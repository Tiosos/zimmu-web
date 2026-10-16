import { afterEach, expect, it, vi } from 'vitest'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { makeRelease } from '../scene/__fixtures__/release'
import { captureProductionSource } from './buildProductionPacket'
import { compareReleaseSource } from './compareReleaseSource'
import {
  buildReleaseChangeReport,
  createChangeReview,
  releaseChangeReportJson,
  type ReleaseChangeReport,
} from './releaseChangeReport'
import { resumeChangeReview, MAX_CHANGE_REVIEW_BYTES } from './resumeChangeReview'
import * as hashes from '../scene/releases'

afterEach(() => vi.restoreAllMocks())
async function fixture() {
  const input = {
    scene: machiningProject(),
    projectName: 'Kitchen',
    hardwareLibrary: {},
    materialLibrary: {},
  }
  const beforeSource = captureProductionSource(input)
  const release = await makeRelease({ source: beforeSource })
  input.scene.parts[0].label = 'Revised panel'
  const source = captureProductionSource(input)
  const draft = createChangeReview(release, source, compareReleaseSource(beforeSource, source))
  draft.reviewer = 'Pat'
  draft.notes = 'Overall review\nKeep this note.'
  draft.entries.forEach((entry, i) => {
    entry.reviewed = i % 2 === 0
    entry.note = `Note ${i}`
  })
  const report = await buildReleaseChangeReport(
    release,
    source,
    new Date('2026-10-15T04:00:00Z'),
    draft,
  )
  return { input, release, source, draft, report, json: releaseChangeReportJson(report) }
}

it('restores every review field and can export it again with the same hashes and coverage', async () => {
  const { release, source, draft, json, report } = await fixture()
  const restored = await resumeChangeReview(json, release, source)
  expect(restored).toEqual(draft)
  const next = await buildReleaseChangeReport(release, source, new Date(), restored)
  expect(next.review).toEqual(report.review)
  expect(next.before.sourceSha256).toBe(report.before.sourceSha256)
  expect(next.after.sourceSha256).toBe(report.after.sourceSha256)
  restored.entries[0].note = 'New edit'
  expect(JSON.parse(json).review.entries[0].note).toBe('Note 0')
})

it('accepts reordered JSON keys and review entries, and historical app metadata', async () => {
  const { release, source, json, draft } = await fixture()
  const saved = JSON.parse(json) as ReleaseChangeReport
  saved.review.entries.reverse()
  saved.appVersion = 'older-compatible-build'
  saved.before = Object.fromEntries(Object.entries(saved.before).reverse()) as typeof saved.before
  expect(await resumeChangeReview(JSON.stringify(saved), release, source)).toEqual(draft)
})

type Mutation = { name: string; change: (report: ReleaseChangeReport) => void }
const mutations: Mutation[] = [
  {
    name: 'baseline hash',
    change: (r) => {
      r.before.sourceSha256 = '0'.repeat(64)
    },
  },
  {
    name: 'current hash',
    change: (r) => {
      r.after.sourceSha256 = '0'.repeat(64)
    },
  },
  {
    name: 'release id',
    change: (r) => {
      r.before.releaseId += '-other'
    },
  },
  {
    name: 'revision',
    change: (r) => {
      r.before.revision++
    },
  },
  {
    name: 'packet reference',
    change: (r) => {
      r.before.packetSha256 = '0'.repeat(64)
    },
  },
  {
    name: 'baseline project metadata',
    change: (r) => {
      r.before.projectName += '-other'
    },
  },
  {
    name: 'current project metadata',
    change: (r) => {
      r.after.projectName += '-other'
    },
  },
  {
    name: 'changed item definition',
    change: (r) => {
      r.changes[0].fields[0].after = 'fabricated'
    },
  },
  {
    name: 'counts',
    change: (r) => {
      r.counts.modified++
    },
  },
  {
    name: 'source coverage',
    change: (r) => {
      r.otherSourceChanges.pop()
    },
  },
  {
    name: 'limitations',
    change: (r) => {
      r.limitations.pop()
    },
  },
  {
    name: 'missing entry',
    change: (r) => {
      r.review.entries.pop()
    },
  },
  {
    name: 'duplicate entry',
    change: (r) => {
      r.review.entries[1] = { ...r.review.entries[0] }
    },
  },
  {
    name: 'unknown reference',
    change: (r) => {
      r.review.entries[0].reference = 'unknown'
    },
  },
  {
    name: 'entry label',
    change: (r) => {
      r.review.entries[0].label += '-other'
    },
  },
  {
    name: 'entry category',
    change: (r) => {
      r.review.entries[0].category = 'limitation'
    },
  },
  {
    name: 'nonboolean check-off',
    change: (r) => {
      Object.assign(r.review.entries[0], { reviewed: 'true' })
    },
  },
  {
    name: 'invalid note',
    change: (r) => {
      Object.assign(r.review.entries[0], { note: null })
    },
  },
  {
    name: 'oversized note',
    change: (r) => {
      r.review.entries[0].note = 'x'.repeat(5001)
    },
  },
  {
    name: 'oversized overall notes',
    change: (r) => {
      r.review.notes = 'x'.repeat(5001)
    },
  },
  {
    name: 'oversized reviewer',
    change: (r) => {
      r.review.reviewer = 'x'.repeat(101)
    },
  },
  {
    name: 'authenticated identity claim',
    change: (r) => {
      Object.assign(r.review, { identity: 'authenticated' })
    },
  },
  {
    name: 'approval claim',
    change: (r) => {
      Object.assign(r.review, { formalApproval: 'approved' })
    },
  },
  {
    name: 'forged progress',
    change: (r) => {
      r.review.progress.reviewed++
    },
  },
  {
    name: 'unknown review field',
    change: (r) => {
      Object.assign(r.review, { approved: true })
    },
  },
  {
    name: 'unknown root field',
    change: (r) => {
      Object.assign(r, { approved: true })
    },
  },
  {
    name: 'invalid timestamp',
    change: (r) => {
      r.generatedAt = 'invalid'
    },
  },
  {
    name: 'version 1',
    change: (r) => {
      Object.assign(r, { schemaVersion: 1 })
    },
  },
  {
    name: 'future version',
    change: (r) => {
      Object.assign(r, { schemaVersion: 3 })
    },
  },
  {
    name: 'other report kind',
    change: (r) => {
      Object.assign(r, { kind: 'local-revision-review' })
    },
  },
  {
    name: 'missing baseline',
    change: (r) => {
      Reflect.deleteProperty(r, 'before')
    },
  },
]
it.each(mutations)('rejects altered or malformed report data: $name', async ({ change }) => {
  const { release, source, json } = await fixture()
  const saved = JSON.parse(json) as ReleaseChangeReport
  change(saved)
  await expect(resumeChangeReview(JSON.stringify(saved), release, source)).rejects.toThrow()
})

it('rejects a stale live design and a corrupted baseline even when file hashes look valid', async () => {
  const { release, source, json, input } = await fixture()
  input.projectName = 'Later edit'
  await expect(resumeChangeReview(json, release, captureProductionSource(input))).rejects.toThrow(
    /different release or source/,
  )
  await expect(
    resumeChangeReview(json, { ...release, sourceSha256: '0'.repeat(64) }, source),
  ).rejects.toThrow(/no longer matches its hash/)
})

it('rejects invalid JSON, non-record roots and oversized input', async () => {
  const { release, source } = await fixture()
  for (const text of ['{', 'null', '[]'])
    await expect(resumeChangeReview(text, release, source)).rejects.toThrow()
  await expect(
    resumeChangeReview(' '.repeat(MAX_CHANGE_REVIEW_BYTES + 1), release, source),
  ).rejects.toThrow(/64 MiB limit/)
})

it('captures the baseline before waiting for hashes', async () => {
  const { release, source, json, draft } = await fixture()
  let finish!: (hash: string) => void
  vi.spyOn(hashes, 'sha256Hex').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = resumeChangeReview(json, release, source)
  const hash = release.sourceSha256
  release.id = 'later-file'
  finish(hash)
  expect((await pending).releaseId).toBe(draft.releaseId)
})

it('rejects overflowing JSON numbers rather than treating them as null comparison values', async () => {
  const { release, input } = await fixture()
  input.scene.parts[0].material = ''
  const source = captureProductionSource(input)
  const report = await buildReleaseChangeReport(release, source)
  const json = releaseChangeReportJson(report)
  const overflow = json.replace('"sheet": null', '"sheet": 1e999')
  expect(overflow).not.toBe(json)
  await expect(resumeChangeReview(overflow, release, source)).rejects.toThrow()
})
