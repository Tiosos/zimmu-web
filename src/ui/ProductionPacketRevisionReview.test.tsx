import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { comparisonFixture } from './__fixtures__/packetRevisionComparison'
import { ProductionPacketRevisionReview } from './ProductionPacketRevisionReview'
import { createRevisionReview } from './packetRevisionReview'
import * as downloads from './download'
import * as reviewRecords from './packetRevisionReview'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('downloads progress and resumes the exact comparison; rejects stale records without losing progress', async () => {
  const report = comparisonFixture(),
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Length verified' } })
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes[0]).toEqual({
    reference: 'PC:part',
    acknowledged: true,
    note: 'Length verified',
  })
  expect(saved.comparison.before.sha256).toBe(report.before.sha256)
  const resume = (record: unknown) => {
    const file = new File(['review'], 'review.json')
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(record) })
    fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  }
  const previous = createRevisionReview(report)
  previous.notes = 'Resumed notes'
  resume(previous)
  await waitFor(() =>
    expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe(
      'Resumed notes',
    ),
  )
  expect((screen.getByLabelText('Acknowledge selected change') as HTMLInputElement).checked).toBe(
    false,
  )
  saved.comparison.after.sha256 = 'wrong'
  resume(saved)
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('different packet hashes')
  expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe('Resumed notes')
})
it('retains the partial coverage warning even with no detected changes', () => {
  render(
    <ProductionPacketRevisionReview
      report={{ ...comparisonFixture(), status: 'partial', changes: [] }}
    />,
  )
  expect(screen.getByText('0 of 0 detected changes acknowledged.')).toBeTruthy()
  expect(screen.getByText(/Coverage is partial/)).toBeTruthy()
  expect(screen.queryByLabelText('Acknowledge selected change')).toBeNull()
})

it('reviews changes beyond the preview independently and rejects oversized records before reading', async () => {
  const report = comparisonFixture()
  report.changes = Array.from({ length: 201 }, (_, index) => ({
    ...report.changes[0],
    reference: `PC:${index}`,
    label: `Board ${index}`,
  }))
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.change(screen.getByLabelText(/Change to review/), { target: { value: 'PC:200' } })
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.change(screen.getByLabelText('Change note'), {
    target: { value: 'Last change checked' },
  })
  expect(screen.getByText('1 of 201 detected changes acknowledged.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/Change to review/), { target: { value: 'PC:0' } })
  expect((screen.getByLabelText('Acknowledge selected change') as HTMLInputElement).checked).toBe(
    false,
  )
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('')
  const file = new File(['review'], 'large.json'),
    read = vi.fn()
  Object.defineProperty(file, 'size', { value: 16 * 1024 * 1024 + 1 })
  Object.defineProperty(file, 'text', { value: read })
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  await screen.findByRole('alert')
  expect(read).not.toHaveBeenCalled()
  expect(screen.getByText('1 of 201 detected changes acknowledged.')).toBeTruthy()
})

it('saves and resumes independent output and limitation progress without changing partial coverage', async () => {
  const report = { ...comparisonFixture(), status: 'partial' as const },
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.click(screen.getByLabelText('Acknowledge output: drawings/shop-drawings.pdf'))
  fireEvent.change(screen.getByLabelText('Output note: drawings/shop-drawings.pdf'), {
    target: { value: 'Sheets inspected' },
  })
  fireEvent.click(screen.getByLabelText('Acknowledge limitation: Unsigned packets'))
  fireEvent.change(screen.getByLabelText('Limitation note: Unsigned packets'), {
    target: { value: 'External identity check needed' },
  })
  expect(screen.getByText('Other changed outputs: 1 of 1 acknowledged')).toBeTruthy()
  expect(screen.getByText('Comparison limitations: 1 of 1 acknowledged')).toBeTruthy()
  expect(screen.getByText('0 of 1 detected changes acknowledged.')).toBeTruthy()
  expect(screen.getByText(/Coverage is partial/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.outputs[0].note).toBe('Sheets inspected')
  expect(saved.limitations[0].acknowledged).toBe(true)
  cleanup()
  render(<ProductionPacketRevisionReview report={report} />)
  const file = new File(['review'], 'review.json')
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(saved) })
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  await waitFor(() =>
    expect(screen.getByText('Other changed outputs: 1 of 1 acknowledged')).toBeTruthy(),
  )
  expect(
    (screen.getByLabelText('Output note: drawings/shop-drawings.pdf') as HTMLTextAreaElement).value,
  ).toBe('Sheets inspected')
  expect(screen.getByText(/Coverage is partial/)).toBeTruthy()
})

it('downloads a printable snapshot with current notes and pending coverage', () => {
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={comparisonFixture()} />)
  fireEvent.change(screen.getByLabelText('Review notes'), {
    target: { value: 'Print this review' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
  expect(download.mock.calls[0][1]).toBe('production-packet-revision-review.html')
  expect(download.mock.calls[0][2]).toBe('text/html;charset=utf-8')
  expect(download.mock.calls[0][0]).toContain('Print this review')
  expect(download.mock.calls[0][0]).toContain('Pending — modified part: Board')
})

it('keeps the newer import when an earlier slow read finishes last', async () => {
  const report = comparisonFixture(),
    old = createRevisionReview(report),
    newer = createRevisionReview(report)
  old.notes = 'Old import'
  newer.notes = 'New import'
  let finish!: (text: string) => void
  const slow = new File(['slow'], 'slow.json')
  Object.defineProperty(slow, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  })
  const fast = new File(['fast'], 'fast.json')
  Object.defineProperty(fast, 'text', { value: async () => JSON.stringify(newer) })
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [slow] } })
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [fast] } })
  await waitFor(() =>
    expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe('New import'),
  )
  await act(async () => finish(JSON.stringify(old)))
  expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe('New import')
})

it('preserves edits made during file loading and ignores late errors from superseded imports', async () => {
  const report = comparisonFixture(),
    imported = createRevisionReview(report)
  imported.notes = 'Imported notes'
  let finish!: (text: string) => void
  const slow = new File(['slow'], 'slow.json')
  Object.defineProperty(slow, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  })
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [slow] } })
  fireEvent.change(screen.getByLabelText('Review notes'), { target: { value: 'New local edit' } })
  await act(async () => finish(JSON.stringify(imported)))
  expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe(
    'New local edit',
  )
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [slow] } })
  fireEvent.click(screen.getByLabelText('Acknowledge output: drawings/shop-drawings.pdf'))
  await act(async () => finish('invalid JSON'))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(
    (screen.getByLabelText('Acknowledge output: drawings/shop-drawings.pdf') as HTMLInputElement)
      .checked,
  ).toBe(true)
})

it('does not validate a file that finishes after the review unmounts', async () => {
  let finish!: (text: string) => void
  const file = new File(['slow'], 'slow.json')
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  })
  const validate = vi.spyOn(reviewRecords, 'importRevisionReview')
  const view = render(<ProductionPacketRevisionReview report={comparisonFixture()} />)
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  view.unmount()
  await act(async () => finish(JSON.stringify(createRevisionReview(comparisonFixture()))))
  expect(validate).not.toHaveBeenCalled()
})

it('ignores late file-read failures after a newer local action', async () => {
  let fail!: (error: Error) => void
  const file = new File(['slow'], 'slow.json')
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((_, reject) => {
        fail = reject
      }),
  })
  render(<ProductionPacketRevisionReview report={comparisonFixture()} />)
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  fireEvent.change(screen.getByLabelText('Reviewer (self-reported)'), {
    target: { value: 'New reviewer' },
  })
  await act(async () => fail(new Error('Old read failure')))
  expect(screen.queryByRole('alert')).toBeNull()
  expect((screen.getByLabelText('Reviewer (self-reported)') as HTMLInputElement).value).toBe(
    'New reviewer',
  )
})

it('filters pending work, moves to another change, and restores acknowledged notes without truncating exports', () => {
  const report = comparisonFixture()
  report.changes.push({ ...report.changes[0], reference: 'PC:second', label: 'Second board' })
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'First checked' } })
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  expect((screen.getByLabelText(/Change to review/) as HTMLSelectElement).value).toBe('PC:second')
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('')
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  expect(screen.getByText(/No pending changes/)).toBeTruthy()
  fireEvent.click(screen.getByLabelText('Acknowledge output: drawings/shop-drawings.pdf'))
  expect(screen.queryByLabelText('Output note: drawings/shop-drawings.pdf')).toBeNull()
  fireEvent.click(screen.getByLabelText('Acknowledge limitation: Unsigned packets'))
  expect(screen.queryByLabelText('Limitation note: Unsigned packets')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes).toHaveLength(2)
  expect(saved.changes[0].note).toBe('First checked')
  expect(saved.outputs[0].acknowledged).toBe(true)
  expect(saved.limitations[0].acknowledged).toBe(true)
  expect('pendingOnly' in saved).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
  expect(download.mock.calls[1][0]).toContain('First checked')
  expect(download.mock.calls[1][0]).toContain('Second board')
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  fireEvent.change(screen.getByLabelText(/Change to review/), { target: { value: 'PC:part' } })
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('First checked')
  expect(screen.getByLabelText('Output note: drawings/shop-drawings.pdf')).toBeTruthy()
})
