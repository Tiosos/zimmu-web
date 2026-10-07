import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { comparisonFixture } from './__fixtures__/packetRevisionComparison'
import { ProductionPacketRevisionReview } from './ProductionPacketRevisionReview'
import { createRevisionReview } from './packetRevisionReview'
import * as downloads from './download'

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
