import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ReleaseSourceComparison } from './ReleaseSourceComparison'
import { makeRelease } from '../scene/__fixtures__/release'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import * as downloads from './download'
import * as reports from './releaseChangeReport'
import * as resumes from './resumeChangeReview'
import { compareReleaseSource } from './compareReleaseSource'
import * as comparisons from './compareReleaseSource'
import { captureProductionSource, type ProductionPacketInput } from './buildProductionPacket'

vi.mock('./useLocalChangeReview', () => ({
  useLocalChangeReview: () => ({
    loading: false,
    saved: false,
    error: 'Storage unavailable in this isolated test.',
    restored: false,
    retry: () => {},
    flush: async () => false,
  }),
}))

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
