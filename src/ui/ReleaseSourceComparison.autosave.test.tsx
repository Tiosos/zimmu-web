import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReleaseSourceComparison } from './ReleaseSourceComparison'
import { makeRelease } from '../scene/__fixtures__/release'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { captureProductionSource } from './buildProductionPacket'
import { localChangeReviewContext, restoreLocalChangeReview } from './localChangeReview'
import { LOCAL_CHANGE_REVIEW_DB, readLocalChangeReview } from './localChangeReviewStore'
import * as storage from './localChangeReviewStore'

beforeEach(() => {
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
  const view = render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('Local autosave ready.')
  const saved = async () => {
    const record = await readLocalChangeReview(context.key)
    expect(record, 'no local draft was saved').not.toBeNull()
    return restoreLocalChangeReview(record, context).draft
  }
  return { view, saved }
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
