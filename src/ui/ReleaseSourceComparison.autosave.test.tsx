import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as reports from './releaseChangeReport'
import { ReleaseSourceComparison } from './ReleaseSourceComparison'
import { makeRelease } from '../scene/__fixtures__/release'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { captureProductionSource } from './buildProductionPacket'
import { localChangeReviewContext, restoreLocalChangeReview } from './localChangeReview'
import { LOCAL_CHANGE_REVIEW_DB, readLocalChangeReview } from './localChangeReviewStore'
import * as storage from './localChangeReviewStore'

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(() => {})
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(LOCAL_CHANGE_REVIEW_DB)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
})

async function opened() {
  const input = {
    scene: machiningProject(),
    projectName: 'Kitchen',
    hardwareLibrary: {},
    materialLibrary: {},
  }
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Unmounted panel'
  const context = await localChangeReviewContext(release, captureProductionSource(input))
  const close = vi.fn()
  const view = render(
    <ReleaseSourceComparison release={release} input={input} onClose={close} onInspect={vi.fn()} />,
  )
  await screen.findByText('Local autosave ready.')
  const saved = async () => {
    const record = await readLocalChangeReview(context.key)
    expect(record, 'no local draft was saved').not.toBeNull()
    return restoreLocalChangeReview(record, context).draft
  }
  const reviewJson = async () => {
    const source = captureProductionSource(input)
    const draft = structuredClone(context.blank)
    draft.reviewer = 'Uploaded reviewer'
    const report = await reports.buildReleaseChangeReport(release, source, new Date(), draft)
    const json = reports.releaseChangeReportJson(report)
    return new File([json], 'review.json', { type: 'application/json' })
  }
  return { view, close, saved, reviewJson }
}

it('keeps an edit made just before the dialog is unmounted', async () => {
  const { view, saved } = await opened()
  fireEvent.change(screen.getByLabelText('Overall review notes'), {
    target: { value: 'Typed before unmount' },
  })
  view.unmount()
  expect((await saved()).notes).toBe('Typed before unmount')
})

it('saves an edit on unmount when the last autosave failed', async () => {
  const { view, saved } = await opened()
  const failure = vi
    .spyOn(storage, 'writeLocalChangeReview')
    .mockRejectedValueOnce(new Error('Quota exceeded'))
  fireEvent.change(screen.getByLabelText('Overall review notes'), {
    target: { value: 'Typed while storage failed' },
  })
  await screen.findByText('Quota exceeded', { exact: false })
  failure.mockRestore()
  view.unmount()
  expect((await saved()).notes).toBe('Typed while storage failed')
})

it('leaves the review and its local draft untouched when a resume is cancelled', async () => {
  const { saved, reviewJson } = await opened()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Local reviewer' } })
  await screen.findByText('Review draft saved locally.')
  const write = vi.spyOn(storage, 'writeLocalChangeReview')
  const file = await reviewJson()
  fireEvent.change(screen.getByLabelText('Resume change review JSON'), {
    target: { files: [file] },
  })
  await screen.findByText('Resume cancelled. Your current review was kept.')
  expect(confirm).toHaveBeenCalledOnce()
  expect(write).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe('Local reviewer')
  expect((await saved()).reviewer).toBe('Local reviewer')
  confirm.mockReturnValue(true)
  fireEvent.change(screen.getByLabelText('Resume change review JSON'), {
    target: { files: [file] },
  })
  await screen.findByText(/Review resumed from review.json/)
  await screen.findByText('Review draft saved locally.')
  expect((await saved()).reviewer).toBe('Uploaded reviewer')
})

async function closingAfterFailedSave(discard: boolean) {
  const opening = await opened()
  const notes = (value: string) =>
    fireEvent.change(screen.getByLabelText('Overall review notes'), { target: { value } })
  notes('Kept earlier')
  await screen.findByText('Review draft saved locally.')
  const failure = vi
    .spyOn(storage, 'writeLocalChangeReview')
    .mockRejectedValueOnce(new Error('Quota exceeded'))
  notes('Discarded later')
  await screen.findByText('Quota exceeded', { exact: false })
  failure.mockRestore()
  const confirm = vi.mocked(window.confirm).mockReturnValue(discard)
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  expect(confirm).toHaveBeenCalledOnce()
  expect(confirm.mock.calls[0][0]).toMatch(/^Discard review edits/)
  return { ...opening, notes }
}

it('does not save a review the user confirmed discarding when the dialog unmounts', async () => {
  const { view, close, saved } = await closingAfterFailedSave(true)
  expect(close).toHaveBeenCalledOnce()
  const write = vi.spyOn(storage, 'writeLocalChangeReview')
  view.unmount()
  expect(write).not.toHaveBeenCalled()
  expect((await saved()).notes).toBe('Kept earlier')
})

it('keeps the dialog and saves the draft when the discard is cancelled', async () => {
  const { view, close, saved } = await closingAfterFailedSave(false)
  expect(close).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Overall review notes') as HTMLTextAreaElement).value).toBe(
    'Discarded later',
  )
  view.unmount()
  expect((await saved()).notes).toBe('Discarded later')
})

it('saves an edit made after a confirmed discard', async () => {
  const { view, saved, notes } = await closingAfterFailedSave(true)
  const failure = vi
    .spyOn(storage, 'writeLocalChangeReview')
    .mockRejectedValueOnce(new Error('Still full'))
  notes('Typed after discarding')
  await screen.findByText('Still full', { exact: false })
  failure.mockRestore()
  view.unmount()
  expect((await saved()).notes).toBe('Typed after discarding')
})
