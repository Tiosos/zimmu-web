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
  localStorage.clear()
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
  return { view, close, saved, reviewJson, release, input, context }
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

it('restores exact-comparison view settings and persists reset without altering saved notes', async () => {
  const { view, release, input, saved } = await opened()
  fireEvent.change(screen.getByRole('textbox', { name: 'Overall review notes' }), {
    target: { value: 'Keep my note' },
  })
  await screen.findByText('Review draft saved locally.')
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'source' },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending findings first' }))
  view.unmount()
  const reopened = render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('Local review draft restored.')
  expect(
    (screen.getByRole('searchbox', { name: 'Search review findings' }) as HTMLInputElement).value,
  ).toBe('source')
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending only' }) as HTMLInputElement).checked,
  ).toBe(true)
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending findings first' }) as HTMLInputElement)
      .checked,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  reopened.unmount()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('Local review draft restored.')
  expect(
    (screen.getByRole('searchbox', { name: 'Search review findings' }) as HTMLInputElement).value,
  ).toBe('')
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending only' }) as HTMLInputElement).checked,
  ).toBe(false)
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending findings first' }) as HTMLInputElement)
      .checked,
  ).toBe(false)
  expect((await saved()).notes).toBe('Keep my note')
})

it('reports preference write failures separately and retries without changing the working draft', async () => {
  await opened()
  const failure = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Preferences blocked')
  })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'source' },
  })
  await screen.findByText(/Review view settings could not be remembered/)
  fireEvent.change(screen.getByRole('textbox', { name: 'Overall review notes' }), {
    target: { value: 'Draft still works' },
  })
  await screen.findByText('Review draft saved locally.')
  failure.mockRestore()
  fireEvent.click(screen.getByRole('button', { name: 'Retry saving source review view' }))
  await vi.waitFor(() =>
    expect(screen.queryByText(/Review view settings could not be remembered/)).toBeNull(),
  )
  expect(
    (screen.getByRole('searchbox', { name: 'Search review findings' }) as HTMLInputElement).value,
  ).toBe('source')
  expect(
    (screen.getByRole('textbox', { name: 'Overall review notes' }) as HTMLTextAreaElement).value,
  ).toBe('Draft still works')
})

it('forgets preferences and pauses saving while keeping the live filters and saved review draft', async () => {
  const { view, release, input, saved } = await opened()
  fireEvent.change(screen.getByRole('textbox', { name: 'Overall review notes' }), {
    target: { value: 'Keep this draft' },
  })
  await screen.findByText('Review draft saved locally.')
  const search = screen.getByRole('searchbox', { name: 'Search review findings' })
  fireEvent.change(search, { target: { value: 'source' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  fireEvent.click(screen.getByRole('button', { name: 'Forget remembered source review views' }))
  expect((search as HTMLInputElement).value).toBe('source')
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending only' }) as HTMLInputElement).checked,
  ).toBe(true)
  expect(localStorage.getItem('zimmu:source-review-views:v1')).toBeNull()
  fireEvent.change(search, { target: { value: 'limitation' } })
  expect(localStorage.getItem('zimmu:source-review-views:v1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Resume saving source review views' }))
  expect(localStorage.getItem('zimmu:source-review-views:v1')).toContain('limitation')
  fireEvent.click(screen.getByRole('button', { name: 'Forget remembered source review views' }))
  view.unmount()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('Local review draft restored.')
  expect(
    (screen.getByRole('searchbox', { name: 'Search review findings' }) as HTMLInputElement).value,
  ).toBe('')
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending only' }) as HTMLInputElement).checked,
  ).toBe(false)
  expect((await saved()).notes).toBe('Keep this draft')
})

it('restores part-view settings and resets them without losing notes', async () => {
  const { view, release, input, saved } = await opened()
  fireEvent.change(screen.getByRole('textbox', { name: 'Overall review notes' }), {
    target: { value: 'Part review note' },
  })
  await screen.findByText('Review draft saved locally.')
  fireEvent.click(
    screen.getByRole('button', { name: 'Filter findings for Unmounted panel (manual-board)' }),
  )
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a part in review' }), {
    target: { value: 'panel' },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending parts first' }))
  view.unmount()
  const reopened = render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('Local review draft restored.')
  expect(
    screen
      .getByRole('button', { name: 'Filter findings for Unmounted panel (manual-board)' })
      .getAttribute('aria-pressed'),
  ).toBe('true')
  expect(
    (screen.getByRole('searchbox', { name: 'Find a part in review' }) as HTMLInputElement).value,
  ).toBe('panel')
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending parts first' }) as HTMLInputElement)
      .checked,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  reopened.unmount()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('Local review draft restored.')
  expect(
    (screen.getByRole('button', { name: 'Clear part filter' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(
    (screen.getByRole('searchbox', { name: 'Find a part in review' }) as HTMLInputElement).value,
  ).toBe('')
  expect((await saved()).notes).toBe('Part review note')
})

it('ignores an unavailable saved part filter and allows clearing it', async () => {
  const { view, release, input, context } = await opened()
  view.unmount()
  const { saveSourceReviewView, defaultSourceReviewView } =
    await import('./sourceReviewViewPreferences')
  saveSourceReviewView(context.key, { ...defaultSourceReviewView(), partFilter: 'missing-part' })
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('The saved part filter is unavailable. All item findings are shown.')
  expect(screen.getByRole('checkbox', { name: /^Reviewed: Unmounted panel/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear part filter' }))
  expect(
    screen.queryByText('The saved part filter is unavailable. All item findings are shown.'),
  ).toBeNull()
})

it('autosaves bulk review changes and undo, restores triage preferences and expires undo on JSON resume', async () => {
  const { view, input, release, saved, reviewJson } = await opened()
  fireEvent.change(screen.getByRole('combobox', { name: 'Finding group' }), {
    target: { value: 'item' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Item kind' }), {
    target: { value: 'part' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Finding notes' }), {
    target: { value: 'without' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Part summary order' }), {
    target: { value: 'name' },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Mark visible pending findings reviewed (1)' }),
  )
  await screen.findByText('Review draft saved locally.')
  expect((await saved()).entries.filter((entry) => entry.reviewed)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Undo last bulk review change' }))
  await screen.findByText('Review draft saved locally.')
  expect((await saved()).entries.every((entry) => !entry.reviewed)).toBe(true)
  fireEvent.click(
    screen.getByRole('button', { name: 'Mark visible pending findings reviewed (1)' }),
  )
  const file = await reviewJson()
  fireEvent.change(screen.getByLabelText('Resume change review JSON'), {
    target: { files: [file] },
  })
  await screen.findByText(/Review resumed from review.json/)
  expect(
    (screen.getByRole('button', { name: 'Undo last bulk review change' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  view.unmount()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('Local review draft restored.')
  for (const [name, value] of [
    ['Finding group', 'item'],
    ['Item kind', 'part'],
    ['Finding notes', 'without'],
    ['Part summary order', 'name'],
  ])
    expect((screen.getByRole('combobox', { name }) as HTMLSelectElement).value).toBe(value)
  expect(
    (screen.getByRole('button', { name: 'Undo last bulk review change' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect((screen.getByRole('combobox', { name: 'Finding notes' }) as HTMLSelectElement).value).toBe(
    'all',
  )
})

it('keeps selection temporary while autosaving selected actions and undo and remembering notes-only search', async () => {
  const { view, input, release, saved } = await opened()
  const write = vi.spyOn(storage, 'writeLocalChangeReview')
  fireEvent.click(screen.getByRole('button', { name: /^Select finding: Unmounted panel/ }))
  expect(write).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox', { name: /^Review note: Unmounted panel/ }), {
    target: { value: 'Saved selection note' },
  })
  await screen.findByText('Review draft saved locally.')
  fireEvent.click(
    screen.getByRole('button', { name: 'Mark selected pending findings reviewed (1)' }),
  )
  await screen.findByText('Review draft saved locally.')
  expect((await saved()).entries.filter((entry) => entry.reviewed)).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Undo last bulk review change' }))
  await screen.findByText('Review draft saved locally.')
  expect((await saved()).entries.every((entry) => !entry.reviewed)).toBe(true)
  fireEvent.change(screen.getByRole('combobox', { name: 'Search in' }), {
    target: { value: 'notes' },
  })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'Saved selection note' },
  })
  view.unmount()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  await screen.findByText('Local review draft restored.')
  expect((screen.getByRole('combobox', { name: 'Search in' }) as HTMLSelectElement).value).toBe(
    'notes',
  )
  expect(screen.getByText('Selected: 0 findings · 0 visible · 0 hidden.')).toBeTruthy()
  expect(
    (screen.getByRole('checkbox', { name: /^Reviewed: Unmounted panel/ }) as HTMLInputElement)
      .checked,
  ).toBe(false)
  expect(
    (screen.getByRole('textbox', { name: /^Review note: Unmounted panel/ }) as HTMLTextAreaElement)
      .value,
  ).toBe('Saved selection note')
})
