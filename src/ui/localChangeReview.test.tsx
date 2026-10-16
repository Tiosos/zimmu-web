import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { makeRelease } from '../scene/__fixtures__/release'
import { captureProductionSource } from './buildProductionPacket'
import {
  localChangeReviewContext,
  packLocalChangeReview,
  restoreLocalChangeReview,
} from './localChangeReview'
import {
  readLocalChangeReview,
  writeLocalChangeReview,
  LOCAL_CHANGE_REVIEW_DB,
} from './localChangeReviewStore'
import * as storage from './localChangeReviewStore'
import { useLocalChangeReview } from './useLocalChangeReview'
import { buildReleaseChangeReport, type ChangeReviewDraft } from './releaseChangeReport'
import * as comparisons from './compareReleaseSource'
import { sha256Hex } from '../scene/releases'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(LOCAL_CHANGE_REVIEW_DB)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
})
async function fixture() {
  const input = {
    scene: machiningProject(),
    projectName: 'Kitchen',
    hardwareLibrary: {},
    materialLibrary: {},
  }
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Changed'
  const source = captureProductionSource(input)
  const context = await localChangeReviewContext(release, source)
  const draft = structuredClone(context.blank)
  draft.reviewer = 'Pat'
  draft.notes = 'Check shelf'
  draft.entries[0].reviewed = true
  draft.entries[0].note = 'Checked'
  return { release, source, context, draft }
}
it('stores compact notes and restores exact coverage; rejects other sources, rules and malformed drafts', async () => {
  const { context, draft } = await fixture()
  const record = packLocalChangeReview(draft, context)
  expect(JSON.stringify(record)).not.toContain('beforeSource')
  expect(JSON.stringify(record)).not.toContain('afterSource')
  await writeLocalChangeReview(record)
  expect(restoreLocalChangeReview(await readLocalChangeReview(context.key), context).draft).toEqual(
    draft,
  )
  for (const patch of [
    { key: 'other' },
    { fingerprint: 'old' },
    { schemaVersion: 2 },
    { updatedAt: 'bad' },
    { review: { ...record.review, entries: [] } },
  ]) {
    expect(() => restoreLocalChangeReview({ ...record, ...patch }, context)).toThrow()
  }
  expect(() => packLocalChangeReview({ ...draft, afterSource: 'different' }, context)).toThrow()
})
it('captures queued writes, preserves their order and retains ten recent comparisons', async () => {
  const { context, draft } = await fixture()
  const record = packLocalChangeReview(draft, context)
  const first = writeLocalChangeReview(record)
  record.review.notes = 'newest'
  const last = writeLocalChangeReview(record)
  await Promise.all([first, last])
  expect(
    restoreLocalChangeReview(await readLocalChangeReview(context.key), context).draft.notes,
  ).toBe('newest')
  for (let i = 0; i < 11; i++)
    await writeLocalChangeReview({
      ...record,
      key: `key-${i}`,
      updatedAt: new Date(2000000000000 + i).toISOString(),
    })
  expect(await readLocalChangeReview(context.key)).toBeNull()
  expect(await readLocalChangeReview('key-0')).toBeNull()
  expect(await readLocalChangeReview('key-1')).toBeTruthy()
  expect(await readLocalChangeReview('key-10')).toBeTruthy()
})
it('restores on reopen and saves cleared notes without overwriting an untouched draft', async () => {
  const { release, source, context, draft } = await fixture()
  await writeLocalChangeReview(packLocalChangeReview(draft, context))
  const restore = vi.fn()
  const hook = renderHook(
    ({ draft: current }: { draft: ChangeReviewDraft | null }) =>
      useLocalChangeReview(release, source, current, restore),
    { initialProps: { draft: null as ChangeReviewDraft | null } },
  )
  await waitFor(() => expect(restore).toHaveBeenCalledOnce())
  expect(restore.mock.calls[0][0]).toEqual(draft)
  const cleared = structuredClone(context.blank)
  hook.rerender({ draft: cleared })
  await waitFor(() => expect(hook.result.current.saved).toBe(true))
  expect(
    restoreLocalChangeReview(await readLocalChangeReview(context.key), context).draft.notes,
  ).toBe('')
  hook.unmount()
  const reopened = vi.fn()
  renderHook(() => useLocalChangeReview(release, source, null, reopened))
  await waitFor(() => expect(reopened).toHaveBeenCalledOnce())
  expect(reopened.mock.calls[0][0]).toEqual(cleared)
})
it('keeps newer edits during a slow restore and reports a failed write, then retries', async () => {
  const { release, source, context, draft } = await fixture()
  let resolve!: (value: unknown) => void
  vi.spyOn(storage, 'readLocalChangeReview').mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  const restore = vi.fn()
  const hook = renderHook(
    ({ draft: current }: { draft: ChangeReviewDraft | null }) =>
      useLocalChangeReview(release, source, current, restore),
    { initialProps: { draft: null as ChangeReviewDraft | null } },
  )
  await waitFor(() => expect(resolve).toBeTypeOf('function'))
  const failure = vi
    .spyOn(storage, 'writeLocalChangeReview')
    .mockRejectedValueOnce(new Error('Quota exceeded'))
  hook.rerender({ draft })
  await act(async () => resolve(packLocalChangeReview(context.blank, context)))
  await waitFor(() => expect(hook.result.current.error).toBe('Quota exceeded'))
  expect(restore).not.toHaveBeenCalled()
  failure.mockRestore()
  act(() => hook.result.current.retry())
  await waitFor(() => expect(hook.result.current.saved).toBe(true))
  expect(restoreLocalChangeReview(await readLocalChangeReview(context.key), context).draft).toEqual(
    draft,
  )
})

it('rejects an aborted save and preserves the previous committed draft', async () => {
  const { context, draft } = await fixture()
  await writeLocalChangeReview(packLocalChangeReview(draft, context))
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (
    this: IDBObjectStore,
  ) {
    this.transaction.abort()
    throw new Error('Write rejected')
  })
  await expect(
    writeLocalChangeReview(packLocalChangeReview({ ...draft, notes: 'lost' }, context)),
  ).rejects.toThrow()
  put.mockRestore()
  expect(restoreLocalChangeReview(await readLocalChangeReview(context.key), context).draft).toEqual(
    draft,
  )
})

it('derives the same key and fingerprint from a supplied comparison without comparing again', async () => {
  const { release, source, context } = await fixture()
  // The derivation localChangeReviewContext used before it accepted a comparison.
  const report = await buildReleaseChangeReport({ ...release }, source)
  const key = JSON.stringify([
    release.id,
    release.revision,
    release.packetSha256,
    report.before.sourceSha256,
    report.after.sourceSha256,
  ])
  const fingerprint = await sha256Hex(
    JSON.stringify({
      before: report.before,
      after: report.after,
      counts: report.counts,
      changes: report.changes,
      otherSourceChanges: report.otherSourceChanges,
      limitations: report.limitations,
    }),
  )
  const comparison = comparisons.compareReleaseSource(release.source, source)
  const compare = vi.spyOn(comparisons, 'compareReleaseSource')
  const supplied = await localChangeReviewContext(release, source, comparison)
  expect(compare).not.toHaveBeenCalled()
  expect(supplied.key).toBe(key)
  expect(supplied.fingerprint).toBe(fingerprint)
  expect(supplied).toEqual(context)
})
it('builds its context from the comparison it is given', async () => {
  const { release, source, context, draft } = await fixture()
  await writeLocalChangeReview(packLocalChangeReview(draft, context))
  const comparison = comparisons.compareReleaseSource(release.source, source)
  const compare = vi.spyOn(comparisons, 'compareReleaseSource')
  const restore = vi.fn()
  renderHook(() => useLocalChangeReview(release, source, null, restore, comparison))
  await waitFor(() => expect(restore).toHaveBeenCalledOnce())
  expect(restore.mock.calls[0][0]).toEqual(draft)
  expect(compare).not.toHaveBeenCalled()
})
it('flushes the latest draft even through a flush taken from an earlier render', async () => {
  const { release, source, context, draft } = await fixture()
  const hook = renderHook(
    ({ draft: current }: { draft: ChangeReviewDraft | null }) =>
      useLocalChangeReview(release, source, current, vi.fn()),
    { initialProps: { draft } },
  )
  await waitFor(() => expect(hook.result.current.saved).toBe(true))
  const earlier = hook.result.current.flush
  const later = { ...draft, notes: 'Typed while closing' }
  hook.rerender({ draft: later })
  await waitFor(() => expect(hook.result.current.saved).toBe(true))
  const write = vi.spyOn(storage, 'writeLocalChangeReview')
  expect(await act(earlier)).toBe(true)
  expect(write).toHaveBeenCalledOnce()
  expect(write.mock.calls[0][0].review).toEqual(packLocalChangeReview(later, context).review)
})
