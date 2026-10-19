import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { ReleaseSourceComparison } from './ReleaseSourceComparison'
import { makeRelease } from '../scene/__fixtures__/release'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import * as downloads from './download'
import * as reports from './releaseChangeReport'
import * as resumes from './resumeChangeReview'
import { compareReleaseSource } from './compareReleaseSource'
import * as comparisons from './compareReleaseSource'
import { useLocalChangeReview } from './useLocalChangeReview'
import { captureProductionSource, type ProductionPacketInput } from './buildProductionPacket'

vi.mock('./useLocalChangeReview', () => ({
  useLocalChangeReview: vi.fn(() => ({
    comparisonKey: null,
    loading: false,
    saved: false,
    error: 'Storage unavailable in this isolated test.',
    restored: false,
    retry: () => {},
    discard: () => {},
    flush: async () => false,
  })),
}))

const defaultHook = vi.mocked(useLocalChangeReview).getMockImplementation()!
const inputOf = (): ProductionPacketInput => ({
  scene: machiningProject(),
  projectName: 'Kitchen',
  hardwareLibrary: {},
  materialLibrary: {},
})
beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(useLocalChangeReview).mockImplementation(defaultHook)
})

it('shows grouped changes and selects an affected part', async () => {
  const input = inputOf()
  const release = await makeRelease({ revision: 3, source: captureProductionSource(input) })
  const edited = structuredClone(input)
  const part = edited.scene.parts[0]
  if (part.kind === 'board') part.length += 10
  const inspect = vi.fn(),
    close = vi.fn()
  const { rerender } = render(
    <ReleaseSourceComparison
      release={release}
      input={edited}
      onInspect={inspect}
      onClose={close}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Changes since revision 3' })).toBeTruthy()
  expect(
    within(screen.getByRole('region', { name: 'manufacturing changes' })).getByText(
      /part · modified/,
    ),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: `Show ${part.label} (hidden)` }))
  expect(inspect).toHaveBeenCalledWith(part.id)
  rerender(
    <ReleaseSourceComparison release={release} input={input} onInspect={inspect} onClose={close} />,
  )
  expect(screen.getByText('No differences in compared source fields.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  expect(close).toHaveBeenCalledOnce()
})

it('shows removed parts without a selection button and reports unusable snapshots', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  const edited = structuredClone(input)
  const removed = edited.scene.parts.shift()!
  const props = { input: edited, onInspect: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<ReleaseSourceComparison release={release} {...props} />)
  expect(
    screen.getByText('Removed from the current design; no current part to select.'),
  ).toBeTruthy()
  expect(screen.queryByRole('button', { name: new RegExp(`Show ${removed.label}`) })).toBeNull()
  rerender(<ReleaseSourceComparison release={{ ...release, source: '{}' }} {...props} />)
  expect(screen.getByRole('alert').textContent).toContain('Comparison unavailable')
  expect(screen.queryByRole('button', { name: 'Download change report JSON' })).toBeNull()
  expect(screen.queryByText('No differences in compared source fields.')).toBeNull()
})

it('downloads both formats from the displayed source and retries a failed export', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.projectName = 'Captured kitchen'
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  const builder = vi
    .spyOn(reports, 'buildReleaseChangeReport')
    .mockRejectedValueOnce(new Error('Digest unavailable'))
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const json = screen.getByRole('button', { name: 'Download change report JSON' })
  fireEvent.click(json)
  await screen.findByText('Report export failed: Digest unavailable')
  expect(download).not.toHaveBeenCalled()
  fireEvent.click(json)
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.after.projectName).toBe('Captured kitchen')
  expect(saved.before.sourceSha256).toBe(release.sourceSha256)
  expect(download.mock.calls[0][1]).toMatch(/\.json$/)
  expect(download.mock.calls[0][2]).toBe('application/json')
  fireEvent.click(screen.getByRole('button', { name: 'Download printable change report' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2))
  expect(download.mock.calls[1][0]).toContain('<!doctype html>')
  expect(download.mock.calls[1][1]).toMatch(/\.html$/)
  expect(builder).toHaveBeenCalledTimes(3)
})

it('prevents duplicate exports and cancels delivery after closing', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  const report = await reports.buildReleaseChangeReport(release, captureProductionSource(input))
  let finish!: (value: typeof report) => void
  vi.spyOn(reports, 'buildReleaseChangeReport').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  const { unmount } = render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const json = screen.getByRole('button', { name: 'Download change report JSON' })
  fireEvent.click(json)
  expect((json as HTMLButtonElement).disabled).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Download printable change report' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.click(json)
  expect(reports.buildReleaseChangeReport).toHaveBeenCalledOnce()
  unmount()
  finish(report)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(download).not.toHaveBeenCalled()
})

it('exports from the displayed comparison without comparing the sources again', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Exported panel'
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const compare = vi.spyOn(comparisons, 'compareReleaseSource')
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  expect(compare).not.toHaveBeenCalled()
  expect(JSON.parse(download.mock.calls[0][0] as string).changes).toEqual(
    compareReleaseSource(release.source, captureProductionSource(input)).changes,
  )
})

it('hands local autosave the displayed comparison', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Autosaved panel'
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const [, source, , , comparison] = vi.mocked(useLocalChangeReview).mock.lastCall!
  expect(source).toBe(captureProductionSource(input))
  expect(comparison).toEqual(compareReleaseSource(release.source, source!))
})

it('keeps notes for identical sources and never applies them to a changed comparison', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  const edited = structuredClone(input)
  edited.scene.parts[0].label = 'Reviewed panel'
  const props = { onClose: vi.fn(), onInspect: vi.fn() }
  const { rerender } = render(
    <ReleaseSourceComparison release={release} input={edited} {...props} />,
  )
  fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Pat' } })
  fireEvent.change(screen.getByLabelText('Overall review notes'), {
    target: { value: 'Check site' },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: /^Reviewed: Reviewed panel/ }))
  expect(screen.getByText(/Review progress: 1 of/)).toBeTruthy()
  rerender(
    <ReleaseSourceComparison release={{ ...release }} input={structuredClone(edited)} {...props} />,
  )
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe('Pat')
  expect(
    (screen.getByRole('checkbox', { name: /^Reviewed: Reviewed panel/ }) as HTMLInputElement)
      .checked,
  ).toBe(true)
  const changed = { ...edited, projectName: 'Changed project' }
  rerender(<ReleaseSourceComparison release={release} input={changed} {...props} />)
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe('')
  expect(
    (screen.getByRole('checkbox', { name: /^Reviewed: Reviewed panel/ }) as HTMLInputElement)
      .checked,
  ).toBe(false)
  expect(screen.getByText(/This comparison differs from your review/)).toBeTruthy()
})

it('exports the review and protects notes until a download or confirmed discard', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Reviewed panel'
  const close = vi.fn(),
    inspect = vi.fn()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison release={release} input={input} onClose={close} onInspect={inspect} />,
  )
  fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Pat' } })
  fireEvent.change(screen.getByLabelText('Review note: Reviewed panel (part:manual-board)'), {
    target: { value: 'Confirm edge treatment' },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: /^Reviewed: Reviewed panel/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  expect(confirm).toHaveBeenCalledOnce()
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Show Reviewed panel (hidden)' }))
  expect(inspect).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  const report = JSON.parse(download.mock.calls[0][0] as string)
  expect(report.review.reviewer).toBe('Pat')
  expect(
    report.review.entries.find((entry: { category: string }) => entry.category === 'item'),
  ).toMatchObject({ reviewed: true, note: 'Confirm edge treatment' })
  confirm.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  expect(close).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
})

async function savedReviewFixture() {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Saved panel'
  const source = captureProductionSource(input)
  const draft = reports.createChangeReview(
    release,
    source,
    compareReleaseSource(release.source, source),
  )
  draft.reviewer = 'Saved reviewer'
  draft.notes = 'Saved overall notes'
  draft.entries[0].reviewed = true
  draft.entries[0].note = 'Saved part note'
  const report = await reports.buildReleaseChangeReport(release, source, new Date(), draft)
  return { input, release, json: reports.releaseChangeReportJson(report), report }
}
function reviewFile(text: string, read: () => Promise<string> = async () => text) {
  const file = new File([text], 'review.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: read })
  return file
}
function chooseReview(file: File) {
  fireEvent.change(screen.getByLabelText('Resume change review JSON'), {
    target: { files: [file] },
  })
}

it('resumes a saved review, re-exports it and treats it as an existing saved checkpoint', async () => {
  const { input, release, json, report } = await savedReviewFixture()
  const close = vi.fn(),
    confirm = vi.spyOn(window, 'confirm')
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison release={release} input={input} onClose={close} onInspect={vi.fn()} />,
  )
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe('Saved reviewer')
  expect((screen.getByLabelText('Overall review notes') as HTMLTextAreaElement).value).toBe(
    'Saved overall notes',
  )
  expect(
    (screen.getByRole('checkbox', { name: /^Reviewed: Saved panel/ }) as HTMLInputElement).checked,
  ).toBe(true)
  expect(
    (screen.getByLabelText('Review note: Saved panel (part:manual-board)') as HTMLTextAreaElement)
      .value,
  ).toBe('Saved part note')
  expect((screen.getByLabelText('Resume change review JSON') as HTMLInputElement).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  expect(close).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
  close.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  expect(JSON.parse(download.mock.calls[0][0] as string).review).toEqual(report.review)
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  expect(close).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
})

it('keeps current notes on invalid input or cancelled replacement, and can retry the same filename', async () => {
  const { input, release, json } = await savedReviewFixture()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByLabelText('Reviewer name'), {
    target: { value: 'Current reviewer' },
  })
  chooseReview(reviewFile('{'))
  await screen.findByText(/not valid change report JSON/)
  expect(confirm).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe(
    'Current reviewer',
  )
  chooseReview(reviewFile(json))
  await screen.findByText('Resume cancelled. Your current review was kept.')
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe(
    'Current reviewer',
  )
  confirm.mockReturnValue(true)
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe('Saved reviewer')
})

it('asks before a resume replaces edits, naming the local draft, and never for an untouched review', async () => {
  const { input, release, json } = await savedReviewFixture()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Current' } })
  chooseReview(reviewFile(json))
  await screen.findByText('Resume cancelled. Your current review was kept.')
  expect(confirm).toHaveBeenCalledOnce()
  expect(confirm.mock.calls[0][0]).toMatch(
    /^Replace your current review with the uploaded report\?/,
  )
  expect(confirm.mock.calls[0][0]).toMatch(/saved in this browser will be replaced too/)
  expect(confirm.mock.calls[0][0]).not.toMatch(/Discard review edits since your last report/)
  fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: '' } })
  confirm.mockClear()
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
  expect(confirm).not.toHaveBeenCalled()
})

it('rejects an oversized file before reading it and recovers from file-read errors', async () => {
  const { input, release, json } = await savedReviewFixture()
  const read = vi.fn(async () => json)
  const file = reviewFile(json, read)
  Object.defineProperty(file, 'size', { value: resumes.MAX_CHANGE_REVIEW_BYTES + 1 })
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  chooseReview(file)
  await screen.findByText(/64 MiB limit/)
  expect(read).not.toHaveBeenCalled()
  chooseReview(
    reviewFile(json, async () => {
      throw new Error('Disk read failed')
    }),
  )
  await screen.findByText(/Disk read failed/)
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
})

it('disables concurrent actions and refuses a late resume after the source changes', async () => {
  const { input, release, json } = await savedReviewFixture()
  let finish!: (text: string) => void
  const pending = reviewFile(
    json,
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const otherRead = vi.fn(async () => json)
  const props = { onClose: vi.fn(), onInspect: vi.fn() }
  const { rerender } = render(
    <ReleaseSourceComparison release={release} input={input} {...props} />,
  )
  chooseReview(pending)
  expect((screen.getByLabelText('Resume change review JSON') as HTMLInputElement).disabled).toBe(
    true,
  )
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).disabled).toBe(true)
  expect(
    (screen.getByRole('button', { name: 'Download change report JSON' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  chooseReview(reviewFile(json, otherRead))
  expect(otherRead).not.toHaveBeenCalled()
  rerender(
    <ReleaseSourceComparison
      release={release}
      input={{ ...input, projectName: 'Later design' }}
      {...props}
    />,
  )
  finish(json)
  await screen.findByText(/comparison or review changed while loading/)
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe('')
  expect(screen.queryByText(/Review resumed from/)).toBeNull()
})

it('allows content-identical rerenders while a file is read', async () => {
  const { input, release, json } = await savedReviewFixture()
  let finish!: (text: string) => void
  const props = { onClose: vi.fn(), onInspect: vi.fn() }
  const { rerender } = render(
    <ReleaseSourceComparison release={release} input={input} {...props} />,
  )
  chooseReview(
    reviewFile(
      json,
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
  )
  rerender(
    <ReleaseSourceComparison release={{ ...release }} input={structuredClone(input)} {...props} />,
  )
  finish(json)
  await screen.findByText(/Review resumed from review.json/)
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe('Saved reviewer')
})

it('does not overwrite a newer review edit if a queued change arrives during loading', async () => {
  const { input, release, json } = await savedReviewFixture()
  let finish!: (text: string) => void
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  chooseReview(
    reviewFile(
      json,
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
  )
  fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Newer edit' } })
  finish(json)
  await vi.waitFor(() =>
    expect((screen.getByLabelText('Resume change review JSON') as HTMLInputElement).disabled).toBe(
      false,
    ),
  )
  expect((screen.getByLabelText('Reviewer name') as HTMLInputElement).value).toBe('Newer edit')
  expect(
    screen.getByText(/Review could not be resumed:.*comparison or review changed while loading/),
  ).toBeTruthy()
})

async function closingWhileSaving() {
  const pending: ((kept: boolean) => void)[] = []
  const flush = vi.fn(() => new Promise<boolean>((resolve) => pending.push(resolve)))
  vi.mocked(useLocalChangeReview).mockImplementation(() => ({
    comparisonKey: null,
    loading: false,
    saved: false,
    error: undefined,
    restored: false,
    retry: () => {},
    discard: () => {},
    flush,
  }))
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Saving panel'
  const close = vi.fn()
  render(
    <ReleaseSourceComparison release={release} input={input} onClose={close} onInspect={vi.fn()} />,
  )
  const type = (value: string) =>
    fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value } })
  let settled = 0
  const settle = async (kept: boolean) => {
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(settled))
    await act(async () => pending[settled++](kept))
  }
  return { close, flush, type, settle }
}

it('saves again and closes when the review changes during the save before closing', async () => {
  const { close, flush, type, settle } = await closingWhileSaving()
  type('Pat')
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  type('Pat Lee')
  await settle(true)
  expect(close).not.toHaveBeenCalled()
  await settle(true)
  expect(flush).toHaveBeenCalledTimes(2)
  expect(close).toHaveBeenCalledOnce()
})

it('says so, rather than doing nothing, when the review keeps changing while it is saved', async () => {
  const { close, flush, type, settle } = await closingWhileSaving()
  type('A')
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  for (const value of ['AB', 'ABC', 'ABCD']) {
    type(value)
    await settle(true)
  }
  expect(flush).toHaveBeenCalledTimes(3)
  expect(close).not.toHaveBeenCalled()
  expect(
    screen
      .getByText('Your review changed while it was being saved. Try again.')
      .getAttribute('role'),
  ).toBe('status')
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  await settle(true)
  expect(close).toHaveBeenCalledOnce()
  expect(screen.queryByText('Your review changed while it was being saved. Try again.')).toBeNull()
})

it('caps the part buttons on a finding that links many parts, with a toggle for the rest', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  const template = input.scene.parts[0]
  const bulk = Array.from({ length: 30 }, (_, i) => ({
    ...template,
    id: `bulk-${i}`,
    label: `Bulk ${i}`,
    visible: true,
  }))
  input.scene.parts.push(...bulk)
  const real = compareReleaseSource(release.source, captureProductionSource(inputOf()))
  vi.spyOn(comparisons, 'compareReleaseSource').mockReturnValue({
    ...real,
    changes: [
      {
        key: 'hardware:generated:cabinet',
        entity: 'hardware',
        id: 'generated:cabinet',
        label: 'Cabinet: Hinge',
        change: 'modified',
        classification: 'manufacturing',
        partIds: bulk.map((part) => part.id),
        fields: [],
      },
    ],
  })
  const inspect = vi.fn()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={inspect}
    />,
  )
  const finding = screen.getByRole('region', { name: 'manufacturing changes' })
  const partButtons = () =>
    within(finding)
      .queryAllByRole('button')
      .filter((button) => /^Show Bulk \d+$/.test(button.textContent ?? ''))
  expect(partButtons().map((button) => button.textContent)).toEqual(
    ['Bulk 0', 'Bulk 1', 'Bulk 2', 'Bulk 3', 'Bulk 4'].map((label) => `Show ${label}`),
  )
  fireEvent.click(within(finding).getByRole('button', { name: 'Show Bulk 1' }))
  await vi.waitFor(() => expect(inspect).toHaveBeenCalledWith('bulk-1'))
  const more = within(finding).getByRole('button', { name: 'Show 25 more parts' })
  expect(more.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(more)
  expect(partButtons()).toHaveLength(30)
  expect(partButtons()[29].textContent).toBe('Show Bulk 29')
  const fewer = within(finding).getByRole('button', { name: 'Show fewer parts' })
  expect(fewer.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(fewer)
  expect(partButtons()).toHaveLength(5)
})

it('filters complete findings without losing notes or changing complete JSON and HTML exports', async () => {
  const { input, release, report } = await savedReviewFixture()
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const finding = screen.getAllByRole('checkbox', { name: /^Reviewed:/ })[0]
  const name = finding.closest('label')!.textContent!
  fireEvent.change(screen.getByLabelText('Review note: Saved panel (part:manual-board)'), {
    target: { value: 'Retain this note' },
  })
  fireEvent.click(finding)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  expect(screen.queryByRole('checkbox', { name: name.trim() })).toBeNull()
  expect(screen.queryByText('Saved panel · part · modified')).toBeNull()
  expect(screen.queryByRole('button', { name: /Show Saved panel/ })).toBeNull()
  expect(screen.getByText(/Pending changes: 0 of 1/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  const exported = JSON.parse(download.mock.calls[0][0] as string)
  expect(exported.review.entries).toHaveLength(report.review.entries.length)
  expect(exported.review.entries[0]).toMatchObject({ reviewed: true, note: 'Retain this note' })
  fireEvent.click(screen.getByRole('button', { name: 'Download printable change report' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2))
  expect(download.mock.calls[1][0]).toContain('Retain this note')
  expect(download.mock.calls[1][0]).toContain('Saved panel')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  expect(
    (screen.getByLabelText('Review note: Saved panel (part:manual-board)') as HTMLTextAreaElement)
      .value,
  ).toBe('Retain this note')
  expect((screen.getByRole('checkbox', { name: name.trim() }) as HTMLInputElement).checked).toBe(
    true,
  )
})

it('navigates pending findings in displayed order, skips reviewed entries and wraps', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  if (input.scene.parts[0].kind === 'board') input.scene.parts[0].length += 10
  input.scene.parts[1].label = 'Metadata change'
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const findings = screen.getAllByRole('checkbox', { name: /^Reviewed:/ })
  act(() => findings[1].focus())
  fireEvent.click(findings[1])
  act(() => screen.getByRole('button', { name: 'Next pending finding' }).focus())
  const next = screen.getByRole('button', { name: 'Next pending finding' })
  // Checking a finding makes it the navigation cursor, even in the all-findings view.
  const expected = [...findings.slice(2), findings[0]]
  for (const finding of expected) {
    fireEvent.click(next)
    expect(document.activeElement).toBe(finding)
  }
  fireEvent.click(next)
  expect(document.activeElement).toBe(findings[2])
  expect((findings[0] as HTMLInputElement).checked).toBe(false)
  const note = findings[1].closest('div')!.querySelector('textarea')!
  act(() => note.focus())
  fireEvent.click(next)
  expect(document.activeElement).toBe(findings[2])
})

it('moves focus as pending findings disappear and handles a fully reviewed comparison', async () => {
  const { input, release } = await savedReviewFixture()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const count = screen.getAllByRole('checkbox', { name: /^Reviewed:/ }).length
  const toggle = screen.getByRole('checkbox', { name: 'Show pending only' })
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Next pending finding' }))
  for (let remaining = count; remaining > 0; remaining--) {
    const first = screen.getAllByRole('checkbox', { name: /^Reviewed:/ })[0]
    expect(document.activeElement).toBe(first)
    fireEvent.click(first)
  }
  expect(screen.queryAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(0)
  expect(document.activeElement).toBe(toggle)
  expect(
    (screen.getByRole('button', { name: 'Next pending finding' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(screen.getByText(/All findings reviewed/)).toBeTruthy()
  expect(
    screen.getByText(/Pending changes: 0 of 1.*Other source changes: 0 of 1.*Limitations: 0 of 7/),
  ).toBeTruthy()
  fireEvent.click(toggle)
  expect(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(count)
  fireEvent.click(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })[0])
  expect(
    (screen.getByRole('button', { name: 'Next pending finding' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  const only = screen.getAllByRole('checkbox', { name: /^Reviewed:/ })[0]
  fireEvent.click(screen.getByRole('button', { name: 'Next pending finding' }))
  expect(document.activeElement).toBe(only)
  fireEvent.click(screen.getByRole('button', { name: 'Next pending finding' }))
  expect(document.activeElement).toBe(only)
})

it('updates pending coverage after JSON resume and resets the cursor when the source changes', async () => {
  const { input, release, json } = await savedReviewFixture()
  const props = { onClose: vi.fn(), onInspect: vi.fn() }
  const { rerender } = render(
    <ReleaseSourceComparison release={release} input={input} {...props} />,
  )
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
  expect(screen.queryByRole('checkbox', { name: /^Reviewed: Saved panel/ })).toBeNull()
  expect(screen.getByText(/Pending changes: 0 of 1/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next pending finding' }))
  expect(document.activeElement).toBe(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })[0])
  rerender(
    <ReleaseSourceComparison
      release={release}
      input={{ ...input, projectName: 'Changed context' }}
      {...props}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Next pending finding' }))
  expect(document.activeElement).toBe(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })[0])
  expect(screen.getByText(/Pending changes: 1 of 1/)).toBeTruthy()
})

it('searches literal normalized finding text, IDs, fields and notes without filtering exports', async () => {
  const { input, release, report } = await savedReviewFixture()
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const search = screen.getByRole('searchbox', { name: 'Search review findings' })
  const find = (value: string) => fireEvent.change(search, { target: { value } })
  for (const text of ['SAVED PANEL', 'manual-board', 'modified']) {
    find(text)
    expect(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: /^Reviewed: Saved panel/ })).toBeTruthy()
  }
  fireEvent.change(screen.getByLabelText('Review note: Saved panel (part:manual-board)'), {
    target: { value: 'Cafe\u0301 [.*]' },
  })
  find('  CAFÉ [.*]  ')
  expect(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(1)
  expect(screen.getByText(`Showing 1 of ${report.review.entries.length} findings.`)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  const exported = JSON.parse(download.mock.calls[0][0] as string)
  expect(exported.review.entries).toHaveLength(report.review.entries.length)
  expect(exported.review.entries[0].note).toBe('Cafe\u0301 [.*]')
  fireEvent.click(screen.getByRole('button', { name: 'Download printable change report' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2))
  expect(download.mock.calls[1][0]).toContain(reports.CHANGE_REPORT_LIMITATIONS[0])
  fireEvent.change(screen.getByLabelText('Review note: Saved panel (part:manual-board)'), {
    target: { value: 'Replaced note' },
  })
  expect(document.activeElement).toBe(search)
  expect(screen.queryAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(0)
  expect(screen.getByText(/No findings match the current filters/)).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: 'Next pending finding' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Clear finding search' }))
  expect(document.activeElement).toBe(search)
  expect(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(
    report.review.entries.length,
  )
  expect(
    (screen.getByLabelText('Review note: Saved panel (part:manual-board)') as HTMLTextAreaElement)
      .value,
  ).toBe('Replaced note')
})

it('navigates only search matches, wraps and disables navigation when matching pending findings are complete', async () => {
  const { input, release } = await savedReviewFixture()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'source' },
  })
  const matches = screen.getAllByRole('checkbox', { name: /^Reviewed:/ })
  expect(matches.length).toBeGreaterThan(1)
  const next = screen.getByRole('button', { name: 'Next pending finding' })
  for (const finding of [...matches, matches[0]]) {
    fireEvent.click(next)
    expect(document.activeElement).toBe(finding)
  }
  for (const finding of matches) fireEvent.click(finding)
  expect((next as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText(/All findings reviewed/)).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  expect(screen.queryAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Clear finding search' }))
  expect((next as HTMLButtonElement).disabled).toBe(false)
  expect(screen.queryByRole('checkbox', { name: 'Reviewed: Part source records' })).toBeNull()
})

it('applies search to resumed notes and preserves the pending filter when clearing search', async () => {
  const { input, release, json } = await savedReviewFixture()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'Saved part note' },
  })
  expect(screen.queryAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(0)
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
  expect(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(1)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  expect(screen.queryAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Clear finding search' }))
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending only' }) as HTMLInputElement).checked,
  ).toBe(true)
  expect(screen.queryByRole('checkbox', { name: /^Reviewed: Saved panel/ })).toBeNull()
  expect(screen.getByText(/Pending changes: 0 of 1/)).toBeTruthy()
})

it('jumps to each pending group despite a hiding search and supports repeated shortcuts', async () => {
  const { input, release } = await savedReviewFixture()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const search = screen.getByRole('searchbox', { name: 'Search review findings' })
  const groups = [
    ['Review pending limitations', 'Review comparison limitations'],
    ['Review pending source changes', 'Other source changes'],
    ['Review pending changes', 'metadata changes'],
  ]
  for (const [button, region] of groups) {
    fireEvent.change(search, { target: { value: 'No matching finding' } })
    expect(screen.queryAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: button }))
    expect((search as HTMLInputElement).value).toBe('')
    expect(
      (screen.getByRole('checkbox', { name: 'Show pending only' }) as HTMLInputElement).checked,
    ).toBe(true)
    const first = within(screen.getByRole('region', { name: region })).getAllByRole('checkbox', {
      name: /^Reviewed:/,
    })[0]
    expect(document.activeElement).toBe(first)
    act(() => search.focus())
    fireEvent.click(screen.getByRole('button', { name: button }))
    expect(document.activeElement).toBe(first)
  }
})

it('disables completed groups independently and keeps notes and download checkpoints intact', async () => {
  const { input, release, json, report } = await savedReviewFixture()
  const confirm = vi.spyOn(window, 'confirm')
  const close = vi.fn()
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison release={release} input={input} onClose={close} onInspect={vi.fn()} />,
  )
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
  expect(
    (
      screen.getByRole('button', {
        name: 'Review pending changes',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true)
  const source = screen.getByRole('button', { name: 'Review pending source changes' })
  fireEvent.click(source)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reviewed: Part source records' }))
  expect((source as HTMLButtonElement).disabled).toBe(true)
  expect(
    (
      screen.getByRole('button', {
        name: 'Review pending limitations',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  const exported = JSON.parse(download.mock.calls[0][0] as string)
  expect(exported.review.entries).toHaveLength(report.review.entries.length)
  expect(exported.review.entries[0]).toEqual(report.review.entries[0])
  fireEvent.click(screen.getByRole('button', { name: 'Review pending limitations' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  expect(close).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
})

it('disables absent groups and all shortcuts while review controls are busy', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  const props = { onClose: vi.fn(), onInspect: vi.fn() }
  const { rerender } = render(
    <ReleaseSourceComparison release={release} input={input} {...props} />,
  )
  for (const name of ['Review pending changes', 'Review pending source changes']) {
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
  }
  expect(
    (
      screen.getByRole('button', {
        name: 'Review pending limitations',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false)
  vi.mocked(useLocalChangeReview).mockImplementation(() => ({
    ...defaultHook(release, null, null, vi.fn()),
    loading: true,
  }))
  rerender(<ReleaseSourceComparison release={release} input={input} {...props} />)
  for (const button of within(
    screen.getByRole('group', { name: 'Jump to pending review group' }),
  ).getAllByRole('button')) {
    expect((button as HTMLButtonElement).disabled).toBe(true)
  }
})

it('resets both view filters while preserving review content, navigation cursor and checkpoint', async () => {
  const { input, release, json, report } = await savedReviewFixture()
  const close = vi.fn()
  const confirm = vi.spyOn(window, 'confirm')
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison release={release} input={input} onClose={close} onInspect={vi.fn()} />,
  )
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
  fireEvent.click(screen.getByRole('button', { name: 'Review pending source changes' }))
  expect(document.activeElement).toBe(
    screen.getByRole('checkbox', { name: 'Reviewed: Part source records' }),
  )
  const search = screen.getByRole('searchbox', { name: 'Search review findings' })
  fireEvent.change(search, { target: { value: 'Nothing matches this search' } })
  expect(screen.queryAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect((search as HTMLInputElement).value).toBe('')
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending only' }) as HTMLInputElement).checked,
  ).toBe(false)
  expect(document.activeElement).toBe(search)
  expect(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(
    report.review.entries.length,
  )
  expect(
    (screen.getByRole('textbox', { name: 'Overall review notes' }) as HTMLTextAreaElement).value,
  ).toBe('Saved overall notes')
  expect(
    (screen.getByLabelText('Review note: Saved panel (part:manual-board)') as HTMLTextAreaElement)
      .value,
  ).toBe('Saved part note')
  expect(
    (screen.getByRole('checkbox', { name: /^Reviewed: Saved panel/ }) as HTMLInputElement).checked,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Next pending finding' }))
  expect(document.activeElement).toBe(
    within(screen.getByRole('region', { name: 'Review comparison limitations' })).getAllByRole(
      'checkbox',
    )[0],
  )
  fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
  expect(close).toHaveBeenCalledOnce()
  expect(confirm).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  expect(JSON.parse(download.mock.calls[0][0] as string).review).toEqual(report.review)
})

it('enables reset for either filter and disables it at defaults or while busy', async () => {
  const { input, release } = await savedReviewFixture()
  const props = { onClose: vi.fn(), onInspect: vi.fn() }
  const { rerender } = render(
    <ReleaseSourceComparison release={release} input={input} {...props} />,
  )
  const reset = screen.getByRole('button', { name: 'Reset review view' }) as HTMLButtonElement
  expect(reset.disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  expect(reset.disabled).toBe(false)
  fireEvent.click(reset)
  expect(reset.disabled).toBe(true)
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'Saved' },
  })
  expect(reset.disabled).toBe(false)
  vi.mocked(useLocalChangeReview).mockImplementation(() => ({
    ...defaultHook(release, null, null, vi.fn()),
    loading: true,
  }))
  rerender(<ReleaseSourceComparison release={release} input={input} {...props} />)
  expect(reset.disabled).toBe(true)
})

it('orders pending findings first within each group, preserves stable order and leaves exports complete', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'First changed part'
  input.scene.parts[1].label = 'Second changed part'
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const region = screen.getByRole('region', { name: 'metadata changes' })
  const parts = within(region).getAllByRole('checkbox')
  const partNames = parts.map((node) => node.closest('label')!.textContent)
  fireEvent.click(parts[0])
  expect(
    within(region)
      .getAllByRole('checkbox')
      .map((node) => node.closest('label')!.textContent),
  ).toEqual(partNames)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending findings first' }))
  expect(
    within(region)
      .getAllByRole('checkbox')
      .map((node) => node.closest('label')!.textContent),
  ).toEqual([partNames[1], partNames[0]])
  const limits = screen.getByRole('region', { name: 'Review comparison limitations' })
  const checks = within(limits).getAllByRole('checkbox')
  const limitNames = checks.map((node) => node.closest('label')!.textContent)
  fireEvent.click(checks[0])
  expect(
    within(limits)
      .getAllByRole('checkbox')
      .map((node) => node.closest('label')!.textContent),
  ).toEqual([...limitNames.slice(1), limitNames[0]])
  act(() => screen.getByRole('searchbox', { name: 'Search review findings' }).focus())
  fireEvent.click(screen.getByRole('button', { name: 'Review pending changes' }))
  expect(document.activeElement).toBe(parts[1])
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending findings first' }) as HTMLInputElement)
      .checked,
  ).toBe(false)
  expect(
    within(region)
      .getAllByRole('checkbox')
      .map((node) => node.closest('label')!.textContent),
  ).toEqual(partNames)
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  const report = JSON.parse(download.mock.calls[0][0] as string)
  expect(report.changes.map((c: { label: string }) => c.label)).toEqual([
    'First changed part',
    'Second changed part',
  ])
  expect(report.review.entries.filter((e: { reviewed: boolean }) => e.reviewed)).toHaveLength(2)
})

it('shows full group pending counts through filtering, completion and JSON resume', async () => {
  const { input, release, json } = await savedReviewFixture()
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const changes = screen.getByRole('region', { name: 'metadata changes' })
  const sources = screen.getByRole('region', { name: 'Other source changes' })
  const limits = screen.getByRole('region', { name: 'Review comparison limitations' })
  expect(within(changes).getByRole('status').textContent).toBe('1 pending · 0 reviewed · 1 total')
  expect(within(sources).getByRole('status').textContent).toBe('1 pending · 0 reviewed · 1 total')
  expect(within(limits).getByRole('status').textContent).toBe('7 pending · 0 reviewed · 7 total')
  chooseReview(reviewFile(json))
  await screen.findByText(/Review resumed from review.json/)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'No matching finding' },
  })
  expect(within(changes).getByRole('status').textContent).toBe('0 pending · 1 reviewed · 1 total')
  expect(within(limits).getByRole('status').textContent).toBe('7 pending · 0 reviewed · 7 total')
  fireEvent.click(screen.getByRole('button', { name: 'Review pending source changes' }))
  fireEvent.click(within(sources).getByRole('checkbox'))
  expect(within(sources).getByRole('status').textContent).toBe('0 pending · 1 reviewed · 1 total')
})

async function partReviewFixture() {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Panel Alpha'
  input.scene.parts[1].label = 'Panel Beta'
  const view = render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  return { input, release, view }
}
it('summarizes parts and filters their findings while retaining global sections and complete exports', async () => {
  await partReviewFixture()
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  const summary = screen.getByRole('region', { name: 'Part review summary' })
  expect(within(summary).getByText('Showing 2 of 2 parts.')).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', { name: 'Filter findings for Panel Alpha (manual-board)' }),
  )
  expect(screen.getByRole('checkbox', { name: /^Reviewed: Panel Alpha/ })).toBeTruthy()
  expect(screen.queryByRole('checkbox', { name: /^Reviewed: Panel Beta/ })).toBeNull()
  expect(screen.getByRole('checkbox', { name: 'Reviewed: Part source records' })).toBeTruthy()
  expect(
    within(screen.getByRole('region', { name: 'Review comparison limitations' })).getAllByRole(
      'checkbox',
    ),
  ).toHaveLength(7)
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
  expect(JSON.parse(download.mock.calls[0][0] as string).changes).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Clear part filter' }))
  expect(screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ })).toBeTruthy()
})
it('cycles pending parts, skips completed parts, wraps and respects summary search', async () => {
  await partReviewFixture()
  const next = screen.getByRole('button', { name: 'Next pending part' })
  fireEvent.click(next)
  expect(document.activeElement).toBe(
    screen.getByRole('checkbox', { name: /^Reviewed: Panel Alpha/ }),
  )
  fireEvent.click(next)
  expect(document.activeElement).toBe(
    screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ }),
  )
  fireEvent.click(next)
  expect(document.activeElement).toBe(
    screen.getByRole('checkbox', { name: /^Reviewed: Panel Alpha/ }),
  )
  fireEvent.click(screen.getByRole('checkbox', { name: /^Reviewed: Panel Alpha/ }))
  fireEvent.click(next)
  expect(document.activeElement).toBe(
    screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ }),
  )
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a part in review' }), {
    target: { value: 'Alpha' },
  })
  expect((next as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear part search' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ }))
  expect((next as HTMLButtonElement).disabled).toBe(true)
})
it('orders pending parts first and searches normalized labels, IDs and finding notes without editing review content', async () => {
  await partReviewFixture()
  const note = screen.getByLabelText('Review note: Panel Alpha (part:manual-board)')
  fireEvent.change(note, { target: { value: 'Cafe\u0301 [.*]' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /^Reviewed: Panel Alpha/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending parts first' }))
  const summary = screen.getByRole('region', { name: 'Part review summary' })
  const names = () =>
    within(summary)
      .queryAllByRole('button', { name: /^Filter findings for/ })
      .map((node) => node.textContent)
  expect(names()).toEqual([
    'Filter findings for Panel Beta (manual-round)',
    'Filter findings for Panel Alpha (manual-board)',
  ])
  const search = screen.getByRole('searchbox', { name: 'Find a part in review' })
  for (const value of [' CAFÉ [.*] ', 'MANUAL-BOARD', 'ALPHA']) {
    fireEvent.change(search, { target: { value } })
    expect(names()).toEqual(['Filter findings for Panel Alpha (manual-board)'])
  }
  fireEvent.change(search, { target: { value: 'no matching part' } })
  expect(within(summary).getByText('No parts match the summary filters.')).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect((search as HTMLInputElement).value).toBe('')
  expect(
    (screen.getByRole('checkbox', { name: 'Show pending parts first' }) as HTMLInputElement)
      .checked,
  ).toBe(false)
  expect((note as HTMLTextAreaElement).value).toBe('Cafe\u0301 [.*]')
})
it('global group shortcuts clear an active part filter', async () => {
  await partReviewFixture()
  fireEvent.click(
    screen.getByRole('button', { name: 'Filter findings for Panel Alpha (manual-board)' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Review pending limitations' }))
  expect(
    (screen.getByRole('button', { name: 'Clear part filter' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ })).toBeTruthy()
})

it('updates every linked part count when shared hardware is reviewed', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  vi.spyOn(comparisons, 'compareReleaseSource').mockReturnValue({
    changes: [
      {
        key: 'shared',
        entity: 'hardware',
        id: 'hinge',
        label: 'Shared hinge',
        partIds: ['manual-board', 'manual-round'],
        change: 'modified',
        fields: [],
        classification: 'manufacturing',
      },
    ],
    otherSourceChanges: [],
  })
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const summary = screen.getByRole('region', { name: 'Part review summary' })
  expect(within(summary).getAllByText('1 pending · 0 reviewed · 1 total')).toHaveLength(2)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Reviewed: Shared hinge (hardware:hinge)' }))
  expect(within(summary).getAllByText('0 pending · 1 reviewed · 1 total')).toHaveLength(2)
  expect(
    (within(summary).getByRole('button', { name: 'Next pending part' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reopen visible reviewed findings (1)' }))
  expect(within(summary).getAllByText('1 pending · 0 reviewed · 1 total')).toHaveLength(2)
  selectReviewView('Finding group', 'item')
  fireEvent.click(
    screen.getByRole('button', { name: 'Mark visible pending findings reviewed (1)' }),
  )
  expect(vi.mocked(window.confirm).mock.calls.at(-1)?.[0]).toMatch(
    /^Mark 1 visible pending findings/,
  )
  expect(within(summary).getAllByText('0 pending · 1 reviewed · 1 total')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Undo last bulk review change' }))
  expect(within(summary).getAllByText('1 pending · 0 reviewed · 1 total')).toHaveLength(2)
})

it('combines classification, change type and reviewed filters while retaining global findings and complete exports', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Metadata panel'
  const board = input.scene.parts[1]
  input.scene.parts = input.scene.parts.filter((part) => part.id !== board.id)
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const metadata = screen.getByRole('region', { name: 'metadata changes' })
  const manufacturing = screen.getByRole('region', { name: 'manufacturing changes' })
  const checkbox = within(metadata).getByRole('checkbox')
  fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show reviewed only' }))
  expect(within(metadata).getAllByRole('checkbox')).toHaveLength(1)
  expect(screen.getByText('Visible: 0 pending · 1 reviewed.')).toBeTruthy()
  expect(within(manufacturing).queryByRole('checkbox')).toBeNull()
  expect(
    (screen.getByRole('button', { name: 'Next pending finding' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  expect(
    (screen.getByRole('checkbox', { name: 'Show reviewed only' }) as HTMLInputElement).checked,
  ).toBe(false)
  fireEvent.change(screen.getByRole('combobox', { name: 'Change classification' }), {
    target: { value: 'metadata' },
  })
  expect(within(manufacturing).queryByRole('checkbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Review pending changes' }))
  expect(document.activeElement).toBe(within(manufacturing).getByRole('checkbox'))
  fireEvent.change(screen.getByRole('combobox', { name: 'Change type' }), {
    target: { value: 'added' },
  })
  expect(within(manufacturing).queryByRole('checkbox')).toBeNull()
  expect(
    within(screen.getByRole('region', { name: 'Review comparison limitations' })).getAllByRole(
      'checkbox',
    ).length,
  ).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await act(async () => {})
  await waitFor(() => expect(download).toHaveBeenCalled())
  const report = JSON.parse(download.mock.calls[0][0] as string)
  expect(report.changes).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect((screen.getByRole('combobox', { name: 'Change type' }) as HTMLSelectElement).value).toBe(
    'all',
  )
  expect((within(metadata).getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
})

it('navigates visible pending findings backwards and to endpoints with buttons and modified keys', async () => {
  await partReviewFixture()
  const findings = screen
    .getAllByRole('checkbox')
    .filter((node) => node.closest('label')?.textContent?.startsWith('Reviewed:'))
  fireEvent.click(screen.getByRole('button', { name: 'Last pending finding' }))
  expect(document.activeElement).toBe(findings.at(-1))
  fireEvent.click(screen.getByRole('button', { name: 'Next pending finding' }))
  expect(document.activeElement).toBe(findings[0])
  fireEvent.click(screen.getByRole('button', { name: 'Previous pending finding' }))
  expect(document.activeElement).toBe(findings.at(-1))
  fireEvent.keyDown(document.activeElement!, { key: 'Home', altKey: true })
  expect(document.activeElement).toBe(findings[0])
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(findings[0])
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown', altKey: true })
  expect(document.activeElement).toBe(findings[1])
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp', altKey: true })
  expect(document.activeElement).toBe(findings[0])
  fireEvent.keyDown(document.activeElement!, { key: 'End', altKey: true })
  expect(document.activeElement).toBe(findings.at(-1))
})

it('filters the part summary to pending parts and shows complete classification and type counts', async () => {
  await partReviewFixture()
  const summary = screen.getByRole('region', { name: 'Part review summary' })
  const metadata = screen.getByRole('region', { name: 'metadata changes' })
  fireEvent.click(within(metadata).getAllByRole('checkbox')[0])
  expect(within(summary).getAllByText('0 manufacturing · 1 metadata')).toHaveLength(2)
  expect(within(summary).getAllByText('0 added · 0 removed · 1 modified')).toHaveLength(2)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending parts only' }))
  expect(within(summary).getAllByRole('button', { name: /^Filter findings for/ })).toHaveLength(1)
  expect(within(metadata).getAllByRole('checkbox')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect(within(summary).getAllByRole('button', { name: /^Filter findings for/ })).toHaveLength(2)
})

const selectReviewView = (name: string, value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } })

it('filters complete finding groups, respects navigation and clears restrictive filters for group and part shortcuts', async () => {
  await partReviewFixture()
  const items = screen.getByRole('region', { name: 'metadata changes' })
  const sources = screen.getByRole('region', { name: 'Other source changes' })
  const limits = screen.getByRole('region', { name: 'Review comparison limitations' })
  selectReviewView('Finding group', 'source')
  expect(within(items).queryByRole('checkbox')).toBeNull()
  expect(within(limits).queryByRole('checkbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next pending finding' }))
  expect(document.activeElement).toBe(within(sources).getByRole('checkbox'))
  selectReviewView('Finding group', 'limitation')
  expect(within(sources).queryByRole('checkbox')).toBeNull()
  expect(within(limits).getAllByRole('checkbox')).toHaveLength(7)
  selectReviewView('Item kind', 'hardware')
  selectReviewView('Finding notes', 'with')
  fireEvent.click(screen.getByRole('button', { name: 'Review pending changes' }))
  expect(document.activeElement).toBe(within(items).getAllByRole('checkbox')[0])
  selectReviewView('Finding group', 'source')
  selectReviewView('Item kind', 'hardware')
  selectReviewView('Finding notes', 'with')
  fireEvent.click(screen.getByRole('button', { name: 'Last pending part' }))
  expect(document.activeElement).toBe(
    screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ }),
  )
  for (const name of ['Finding group', 'Item kind', 'Finding notes'])
    expect((screen.getByRole('combobox', { name }) as HTMLSelectElement).value).toBe('all')
})

it('filters part and hardware item kinds while leaving global findings in scope', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Changed panel'
  const actual = comparisons.compareReleaseSource(release.source, captureProductionSource(input))
  vi.spyOn(comparisons, 'compareReleaseSource').mockReturnValue({
    ...actual,
    changes: [
      ...actual.changes,
      {
        key: 'hinge',
        entity: 'hardware',
        id: 'hinge',
        label: 'Changed hinge',
        partIds: ['manual-board'],
        change: 'modified',
        fields: [],
        classification: 'manufacturing',
      },
    ],
  })
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  selectReviewView('Item kind', 'hardware')
  expect(screen.queryByRole('checkbox', { name: /^Reviewed: Changed panel/ })).toBeNull()
  expect(screen.getByRole('checkbox', { name: /^Reviewed: Changed hinge/ })).toBeTruthy()
  expect(
    within(screen.getByRole('region', { name: 'Review comparison limitations' })).getAllByRole(
      'checkbox',
    ),
  ).toHaveLength(7)
  selectReviewView('Item kind', 'part')
  expect(screen.queryByRole('checkbox', { name: /^Reviewed: Changed hinge/ })).toBeNull()
  expect(screen.getByRole('checkbox', { name: /^Reviewed: Changed panel/ })).toBeTruthy()
})

it('filters note presence using trimmed text and restores focus when an edited note stops matching', async () => {
  await partReviewFixture()
  const note = screen.getByRole('textbox', { name: /^Review note: Panel Alpha/ })
  fireEvent.change(note, { target: { value: 'Keep this finding' } })
  selectReviewView('Finding notes', 'with')
  expect(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(1)
  fireEvent.change(note, { target: { value: '   ' } })
  expect(screen.queryByRole('checkbox', { name: /^Reviewed:/ })).toBeNull()
  expect(document.activeElement).toBe(
    screen.getByRole('searchbox', { name: 'Search review findings' }),
  )
  selectReviewView('Finding notes', 'without')
  expect(screen.getAllByRole('checkbox', { name: /^Reviewed:/ })).toHaveLength(10)
  fireEvent.change(screen.getByRole('textbox', { name: /^Review note: Panel Beta/ }), {
    target: { value: 'New note' },
  })
  expect(screen.queryByRole('checkbox', { name: /^Reviewed: Panel Beta/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect(
    (screen.getByRole('textbox', { name: /^Review note: Panel Beta/ }) as HTMLTextAreaElement)
      .value,
  ).toBe('New note')
})

it('sorts parts by name and navigates pending parts in both directions and to endpoints', async () => {
  const input = inputOf()
  input.scene.parts.push({ ...input.scene.parts[0], id: 'manual-extra', label: 'Original extra' })
  const release = await makeRelease({ source: captureProductionSource(input) })
  input.scene.parts[0].label = 'Zulu panel'
  input.scene.parts[1].label = 'Alpha panel'
  input.scene.parts[2].label = 'Middle panel'
  render(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  selectReviewView('Part summary order', 'name')
  const summary = screen.getByRole('region', { name: 'Part review summary' })
  expect(
    within(summary)
      .getAllByRole('button', { name: /^Filter findings for/ })
      .map((node) => node.textContent),
  ).toEqual([
    'Filter findings for Alpha panel (manual-round)',
    'Filter findings for Middle panel (manual-extra)',
    'Filter findings for Zulu panel (manual-board)',
  ])
  const jump = (position: string, label: string) => {
    fireEvent.click(screen.getByRole('button', { name: `${position} pending part` }))
    expect(document.activeElement).toBe(
      screen.getByRole('checkbox', { name: new RegExp(`^Reviewed: ${label}`) }),
    )
  }
  jump('First', 'Alpha panel')
  jump('Previous', 'Zulu panel')
  jump('Next', 'Alpha panel')
  jump('Last', 'Zulu panel')
  fireEvent.click(screen.getByRole('checkbox', { name: /^Reviewed: Zulu panel/ }))
  jump('Previous', 'Middle panel')
  jump('Previous', 'Alpha panel')
  jump('Previous', 'Middle panel')
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a part in review' }), {
    target: { value: 'Zulu' },
  })
  for (const position of ['Next', 'Previous', 'First', 'Last'])
    expect(
      (screen.getByRole('button', { name: `${position} pending part` }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect(
    (screen.getByRole('combobox', { name: 'Part summary order' }) as HTMLSelectElement).value,
  ).toBe('comparison')
})

it('confirms bulk completion of only visible pending findings, preserves full exports and undoes across filter changes', async () => {
  await partReviewFixture()
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  fireEvent.change(screen.getByLabelText('Reviewer name'), { target: { value: 'Review lead' } })
  fireEvent.change(screen.getByLabelText('Overall review notes'), {
    target: { value: 'Overall kept' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: /^Review note: Panel Alpha/ }), {
    target: { value: 'Alpha kept' },
  })
  selectReviewView('Finding group', 'item')
  selectReviewView('Finding notes', 'with')
  const mark = screen.getByRole('button', { name: 'Mark visible pending findings reviewed (1)' })
  vi.mocked(window.confirm).mockReturnValueOnce(false)
  fireEvent.click(mark)
  expect(
    (screen.getByRole('checkbox', { name: /^Reviewed: Panel Alpha/ }) as HTMLInputElement).checked,
  ).toBe(false)
  expect(
    (screen.getByRole('button', { name: 'Undo last bulk review change' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending only' }))
  fireEvent.click(mark)
  expect(vi.mocked(window.confirm).mock.calls.at(-1)?.[0]).toMatch(
    /^Mark 1 visible pending findings/,
  )
  expect(screen.queryByRole('checkbox', { name: /^Reviewed:/ })).toBeNull()
  expect(document.activeElement).toBe(
    screen.getByRole('searchbox', { name: 'Search review findings' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  await waitFor(() => expect(download).toHaveBeenCalledOnce())
  const report = JSON.parse(download.mock.calls[0][0] as string)
  expect(report.review.entries).toHaveLength(10)
  expect(
    report.review.entries.filter((entry: { reviewed: boolean }) => entry.reviewed),
  ).toHaveLength(1)
  expect(report.review.reviewer).toBe('Review lead')
  expect(report.review.notes).toBe('Overall kept')
  expect(
    report.review.entries.find((entry: { note: string }) => entry.note === 'Alpha kept'),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  fireEvent.click(screen.getByRole('button', { name: 'Undo last bulk review change' }))
  expect(
    screen
      .getAllByRole('checkbox', { name: /^Reviewed:/ })
      .every((node) => !(node as HTMLInputElement).checked),
  ).toBe(true)
  expect(
    (screen.getByRole('textbox', { name: /^Review note: Panel Alpha/ }) as HTMLTextAreaElement)
      .value,
  ).toBe('Alpha kept')
})

it('reopens only visible reviewed findings, supports undo and expires undo after a later edit or source change', async () => {
  const { input, release, view } = await partReviewFixture()
  const alpha = screen.getByRole('checkbox', { name: /^Reviewed: Panel Alpha/ })
  const beta = screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ })
  fireEvent.click(alpha)
  fireEvent.click(beta)
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'Panel Alpha' },
  })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show reviewed only' }))
  vi.mocked(window.confirm).mockReturnValueOnce(false)
  fireEvent.click(screen.getByRole('button', { name: 'Reopen visible reviewed findings (1)' }))
  expect((alpha as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reopen visible reviewed findings (1)' }))
  expect(vi.mocked(window.confirm).mock.calls.at(-1)?.[0]).toMatch(
    /^Reopen 1 visible reviewed findings/,
  )
  expect(screen.queryByRole('checkbox', { name: /^Reviewed:/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reset review view' }))
  expect(
    (screen.getByRole('checkbox', { name: /^Reviewed: Panel Beta/ }) as HTMLInputElement).checked,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Undo last bulk review change' }))
  expect(
    (screen.getByRole('checkbox', { name: /^Reviewed: Panel Alpha/ }) as HTMLInputElement).checked,
  ).toBe(true)
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search review findings' }), {
    target: { value: 'Panel Alpha' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Reopen visible reviewed findings (1)' }))
  fireEvent.change(screen.getByLabelText('Overall review notes'), {
    target: { value: 'Later edit' },
  })
  const undo = screen.getByRole('button', {
    name: 'Undo last bulk review change',
  }) as HTMLButtonElement
  expect(undo.disabled).toBe(true)
  fireEvent.click(
    screen.getByRole('button', { name: 'Mark visible pending findings reviewed (1)' }),
  )
  expect(undo.disabled).toBe(false)
  view.rerender(
    <ReleaseSourceComparison
      release={release}
      input={{ ...input, projectName: 'Different comparison' }}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  expect(undo.disabled).toBe(true)
  view.rerender(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  expect(undo.disabled).toBe(true)
})

it('disables triage and bulk review controls during local restoration and report preparation', async () => {
  const { input, release, view } = await partReviewFixture()
  const assertDisabled = () => {
    for (const button of within(
      screen.getByRole('group', { name: 'Bulk review actions' }),
    ).getAllByRole('button'))
      expect((button as HTMLButtonElement).disabled).toBe(true)
    for (const name of ['Finding group', 'Item kind', 'Finding notes', 'Part summary order'])
      expect((screen.getByRole('combobox', { name }) as HTMLSelectElement).disabled).toBe(true)
    for (const position of ['Previous', 'First', 'Last'])
      expect(
        (screen.getByRole('button', { name: `${position} pending part` }) as HTMLButtonElement)
          .disabled,
      ).toBe(true)
  }
  vi.mocked(useLocalChangeReview).mockImplementation(() => ({
    ...defaultHook(release, null, null, vi.fn()),
    loading: true,
  }))
  view.rerender(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  assertDisabled()
  vi.mocked(useLocalChangeReview).mockImplementation(defaultHook)
  view.rerender(
    <ReleaseSourceComparison
      release={release}
      input={input}
      onClose={vi.fn()}
      onInspect={vi.fn()}
    />,
  )
  const report = await reports.buildReleaseChangeReport(release, captureProductionSource(input))
  let finish!: (value: typeof report) => void
  vi.spyOn(reports, 'buildReleaseChangeReport').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  fireEvent.click(screen.getByRole('button', { name: 'Download change report JSON' }))
  assertDisabled()
  await act(async () => finish(report))
})

it.each([
  ['Panel 10', 'Panel 2', ['manual-round', 'manual-board']],
  ['Same panel', 'Same panel', ['manual-board', 'manual-round']],
])(
  'orders %s / %s naturally with ID ties independent of comparison order',
  async (first, second, ids) => {
    const input = inputOf()
    const release = await makeRelease({ source: captureProductionSource(input) })
    input.scene.parts[0].label = first
    input.scene.parts[1].label = second
    const report = comparisons.compareReleaseSource(release.source, captureProductionSource(input))
    vi.spyOn(comparisons, 'compareReleaseSource').mockReturnValue({
      ...report,
      changes: [...report.changes].reverse(),
    })
    render(
      <ReleaseSourceComparison
        release={release}
        input={input}
        onClose={vi.fn()}
        onInspect={vi.fn()}
      />,
    )
    selectReviewView('Part summary order', 'name')
    const summary = screen.getByRole('region', { name: 'Part review summary' })
    const buttons = within(summary).getAllByRole('button', { name: /^Filter findings for/ })
    expect(buttons.map((node) => node.textContent!.match(/\(([^)]+)\)$/)![1])).toEqual(ids)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show pending parts first' }))
    expect(
      within(summary)
        .getAllByRole('button', { name: /^Filter findings for/ })
        .map((node) => node.textContent!.match(/\(([^)]+)\)$/)![1]),
    ).toEqual(ids)
  },
)
