import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  comparisonFixture,
  perPartComparisonFixture,
} from './__fixtures__/packetRevisionComparison'
import { ProductionPacketRevisionReview } from './ProductionPacketRevisionReview'
import { createRevisionReview } from './packetRevisionReview'
import * as downloads from './download'
import * as reviewRecords from './packetRevisionReview'

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('downloads progress and resumes the exact comparison; rejects stale records without losing progress', async () => {
  const report = comparisonFixture(),
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Length verified' } })
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(download.mock.calls[0][1]).toBe(
    'production-packet-revision-review-project-aaaaaaaaaaaa-to-bbbbbbbbbbbb.json',
  )
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
  expect(download.mock.calls[0][1]).toBe(
    'production-packet-revision-review-project-aaaaaaaaaaaa-to-bbbbbbbbbbbb.html',
  )
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

it('finds changes by identity and Unicode label while retaining complete exports and notes', () => {
  const report = comparisonFixture()
  report.changes.push({
    ...report.changes[0],
    reference: 'PC:["operation","panel","bore[2]"]',
    entity: 'operation',
    partId: 'Panel-B',
    operationId: 'bore[2]',
    label: 'Cafe\u0301 drilling',
  })
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} />)
  const search = (text: string) =>
    fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: text } })
  for (const text of ['  CAFÉ ', 'panel-b', 'bore[2]', 'PC:["operation"']) {
    search(text)
    expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe(
      report.changes[1].reference,
    )
    expect(screen.getByText('1 of 2 changes match the current filters.')).toBeTruthy()
  }
  search('')
  expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe(
    report.changes[1].reference,
  )
  search('Panel-B')
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Bore checked' } })
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  expect(screen.getByText(/No changes match this search and pending filter/)).toBeTruthy()
  expect(screen.queryByLabelText('Change to review')).toBeNull()
  expect(screen.getByText('1 of 2 detected changes acknowledged.')).toBeTruthy()
  expect(screen.getByLabelText('Acknowledge output: drawings/shop-drawings.pdf')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes).toHaveLength(2)
  expect(saved.changes[1].note).toBe('Bore checked')
  expect('search' in saved).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
  expect(download.mock.calls[1][0]).toContain('Bore checked')
  expect(download.mock.calls[1][0]).toContain('Board')
  search('   ')
  expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe('PC:part')
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  search('Panel-B')
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('Bore checked')
  search('does-not-exist')
  expect(screen.getByText(/No changes match this search\./)).toBeTruthy()
  expect(screen.getByLabelText('Output note: drawings/shop-drawings.pdf')).toBeTruthy()
})

it('steps through filtered changes with boundaries while retaining notes and complete progress', () => {
  const report = comparisonFixture()
  report.changes = ['Match first', 'Excluded', 'Match middle', 'Match last'].map(
    (label, index) => ({
      ...report.changes[0],
      reference: `PC:${index}`,
      label,
    }),
  )
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} />)
  const previous = () =>
    screen.getByRole('button', { name: 'Previous change' }) as HTMLButtonElement
  const next = () => screen.getByRole('button', { name: 'Next change' }) as HTMLButtonElement
  const selected = () => (screen.getByLabelText('Change to review') as HTMLSelectElement).value
  const search = (value: string) =>
    fireEvent.change(screen.getByLabelText('Find a change'), { target: { value } })
  search('Match')
  expect(previous().disabled).toBe(true)
  expect(next().disabled).toBe(false)
  expect(screen.getByText('Change 1 of 3 matching changes')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'First note' } })
  fireEvent.click(next())
  expect(selected()).toBe('PC:2')
  expect(screen.getByText('Change 2 of 3 matching changes')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Middle note' } })
  fireEvent.click(next())
  expect(selected()).toBe('PC:3')
  expect(next().disabled).toBe(true)
  fireEvent.click(previous())
  expect(selected()).toBe('PC:2')
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('Middle note')
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  expect(selected()).toBe('PC:0')
  expect(screen.getByText('Change 1 of 2 matching changes')).toBeTruthy()
  fireEvent.click(next())
  expect(selected()).toBe('PC:3')
  expect(next().disabled).toBe(true)
  fireEvent.click(previous())
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('First note')
  search('last')
  expect(previous().disabled).toBe(true)
  expect(next().disabled).toBe(true)
  search('missing')
  expect(screen.queryByRole('button', { name: 'Next change' })).toBeNull()
  search('')
  fireEvent.change(screen.getByLabelText('Change to review'), { target: { value: 'PC:1' } })
  fireEvent.click(next())
  expect(selected()).toBe('PC:3')
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes).toHaveLength(4)
  expect(saved.changes.map((item: { acknowledged: boolean }) => item.acknowledged)).toEqual([
    false,
    false,
    true,
    false,
  ])
  expect(saved.changes[0].note).toBe('First note')
  expect(saved.changes[2].note).toBe('Middle note')
})

it('tracks edits separately from view actions and HTML, and protects resume until JSON is downloaded', async () => {
  const report = comparisonFixture(),
    changed = vi.fn()
  vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  const confirm = vi.mocked(window.confirm).mockReturnValue(false)
  render(<ProductionPacketRevisionReview report={report} onEditedChange={changed} />)
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'Board' } })
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  expect(changed).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Review notes'), { target: { value: 'Keep this' } })
  expect(changed).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
  expect(changed).toHaveBeenLastCalledWith(true)
  const record = createRevisionReview(report)
  record.notes = 'Imported'
  const file = new File(['review'], 'resume.json'),
    read = vi.fn().mockResolvedValue(JSON.stringify(record))
  Object.defineProperty(file, 'text', { value: read })
  const resume = () =>
    fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  resume()
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(read).not.toHaveBeenCalled()
  expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe('Keep this')
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  expect(changed).toHaveBeenLastCalledWith(false)
  resume()
  await waitFor(() =>
    expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe('Imported'),
  )
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(changed).toHaveBeenLastCalledWith(false)
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  expect(changed).toHaveBeenLastCalledWith(true)
})

it('retains edited status after an accepted but invalid resume', async () => {
  const changed = vi.fn()
  render(<ProductionPacketRevisionReview report={comparisonFixture()} onEditedChange={changed} />)
  fireEvent.change(screen.getByLabelText('Reviewer (self-reported)'), {
    target: { value: 'Keep reviewer' },
  })
  const file = new File(['invalid'], 'invalid.json')
  Object.defineProperty(file, 'text', { value: async () => '{}' })
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  await screen.findByRole('alert')
  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(changed).toHaveBeenLastCalledWith(true)
  expect((screen.getByLabelText('Reviewer (self-reported)') as HTMLInputElement).value).toBe(
    'Keep reviewer',
  )
})

it('shows selected identities and ordered field values as safe readable content', () => {
  const report = comparisonFixture()
  report.changes[0].fields = [
    { field: 'length', classification: 'manufacturing', before: 600, after: 720 },
    {
      field: 'label',
      classification: 'metadata',
      before: '',
      after: '<img src=x onerror=alert(1)>',
    },
    { field: 'optional', classification: 'metadata', before: undefined, after: null },
    { field: 'enabled', classification: 'metadata', before: false, after: true },
    {
      field: 'dimensions',
      classification: 'manufacturing',
      before: { length: 600 },
      after: [720, 0],
    },
  ]
  report.changes.push({
    ...report.changes[0],
    reference: 'PC:manual',
    entity: 'operation',
    operationId: 'manual-id',
    label: 'Manual drilling',
    change: 'added',
    fields: [],
    before: null,
    after: {
      locations: ['later.pdf#page=4'],
      provenance: { jointId: 'joint' },
      definition: { kind: 'manual', instruction: 'Drill on site' },
    },
  })
  const { container } = render(<ProductionPacketRevisionReview report={report} />)
  const table = screen.getByRole('table', { name: 'Selected change fields' })
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((node) => node.textContent),
  ).toEqual(['Field / classification', 'Earlier', 'Later'])
  expect(
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ),
  ).toEqual([
    ['600', '720'],
    ['', '<img src=x onerror=alert(1)>'],
    ['Not recorded', 'null'],
    ['false', 'true'],
    ['{\n  "length": 600\n}', '[\n  720,\n  0\n]'],
  ])
  expect(container.querySelectorAll('img,script').length).toBe(0)
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Retain note' } })
  fireEvent.change(screen.getByLabelText('Change to review'), { target: { value: 'PC:manual' } })
  expect(screen.queryByRole('table', { name: 'Selected change fields' })).toBeNull()
  expect(screen.getByText(/Part: part · Operation: manual-id/)).toBeTruthy()
  expect(
    within(screen.getByRole('group', { name: 'Earlier definition' })).queryByText(
      'Absent in this revision.',
    ),
  ).toBeTruthy()
  expect(
    within(screen.getByRole('group', { name: 'Later definition' })).queryByText(/Drill on site/),
  ).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Change to review'), { target: { value: 'PC:part' } })
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('Retain note')
})

it('shows removed definitions on the earlier side and marks the later revision absent', () => {
  const report = comparisonFixture()
  report.changes[0] = { ...report.changes[0], change: 'removed', fields: [], after: null }
  render(<ProductionPacketRevisionReview report={report} />)
  expect(
    within(screen.getByRole('group', { name: 'Earlier definition' })).queryByText(/600/),
  ).toBeTruthy()
  expect(
    within(screen.getByRole('group', { name: 'Later definition' })).getByText(
      'Absent in this revision.',
    ),
  ).toBeTruthy()
})

it('keeps classification progress global while searching and hiding acknowledged changes', () => {
  const report = comparisonFixture()
  report.changes.push({
    ...report.changes[0],
    reference: 'PC:metadata',
    label: 'Renamed board',
    classification: 'metadata',
  })
  render(<ProductionPacketRevisionReview report={report} />)
  const rows = () =>
    [
      ...within(
        screen.getByRole('table', { name: 'Detected change progress by classification' }),
      ).getAllByRole('row'),
    ]
      .slice(1)
      .map((row) => [...row.children].map((cell) => cell.textContent))
  expect(rows()).toEqual([
    ['Manufacturing', '0', '1', '1'],
    ['Metadata', '0', '1', '1'],
  ])
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.change(screen.getByLabelText('Change classification'), {
    target: { value: 'metadata' },
  })
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'missing' } })
  expect(rows()).toEqual([
    ['Manufacturing', '1', '0', '1'],
    ['Metadata', '0', '1', '1'],
  ])
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
  const doc = new DOMParser().parseFromString(download.mock.calls[0][0] as string, 'text/html')
  const table = [...doc.querySelectorAll('table')].find(
    (item) =>
      item.querySelector('caption')?.textContent === 'Detected change progress by classification',
  )!
  expect(
    [...table.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    ),
  ).toEqual(rows())
})

it('composes classification, search and pending views without losing notes or export coverage', () => {
  const report = comparisonFixture()
  report.changes = ['manufacturing', 'metadata', 'manufacturing'].map((classification, index) => ({
    ...report.changes[0],
    reference: `PC:${index}`,
    label: `Match ${index}`,
    classification: classification as 'manufacturing' | 'metadata',
  }))
  report.changes[1].fields = [
    { field: 'label', classification: 'metadata', before: 'Old label', after: 'Match 1' },
  ]
  report.changes[2].fields = [
    ...report.changes[2].fields,
    { field: 'label', classification: 'metadata', before: 'Old shop label', after: 'Match 2' },
  ]
  report.counts = { added: 0, removed: 0, modified: 3, manufacturing: 2, metadata: 1 }
  const changed = vi.fn(),
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} onEditedChange={changed} />)
  const filter = (value: string) =>
    fireEvent.change(screen.getByLabelText('Change classification'), { target: { value } })
  const selected = () => (screen.getByLabelText('Change to review') as HTMLSelectElement).value
  filter('manufacturing')
  expect(screen.queryByText('2 of 3 changes match the current filters.')).toBeTruthy()
  expect(selected()).toBe('PC:0')
  fireEvent.click(screen.getByRole('button', { name: 'Next change' }))
  expect(selected()).toBe('PC:2')
  expect(screen.getByRole('rowheader', { name: 'label (metadata)' })).toBeTruthy()
  expect(changed).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Shop note' } })
  filter('metadata')
  expect(selected()).toBe('PC:1')
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Label note' } })
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  expect(screen.queryByText(/No changes match the current classification and filters/)).toBeTruthy()
  expect(screen.queryByText(/No pending changes/)).toBeNull()
  expect(screen.getByText('1 of 3 detected changes acknowledged.')).toBeTruthy()
  filter('manufacturing')
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'Match 2' } })
  expect(selected()).toBe('PC:2')
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('Shop note')
  filter('metadata')
  expect(screen.queryByLabelText('Change to review')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes).toHaveLength(3)
  expect(saved.changes[1]).toMatchObject({ acknowledged: true, note: 'Label note' })
  expect(saved.changes[2].note).toBe('Shop note')
  expect('classification' in saved).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
  expect(download.mock.calls[1][0]).toContain('Shop note')
  expect(download.mock.calls[1][0]).toContain('Label note')
  filter('all')
  expect(selected()).toBe('PC:2')
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: '' } })
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  filter('metadata')
  expect(selected()).toBe('PC:1')
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('Label note')
})

it('retains an in-flight resume when classification is changed', async () => {
  const report = comparisonFixture(),
    record = createRevisionReview(report)
  record.notes = 'Resumed after filtering'
  record.changes[0].note = 'Imported change note'
  let finish!: (text: string) => void
  const file = new File(['record'], 'record.json')
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  })
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  fireEvent.change(screen.getByLabelText('Change classification'), {
    target: { value: 'metadata' },
  })
  await act(async () => {
    finish(JSON.stringify(record))
  })
  expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe(
    'Resumed after filtering',
  )
  fireEvent.change(screen.getByLabelText('Change classification'), {
    target: { value: 'manufacturing' },
  })
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe(
    'Imported change note',
  )
})

it('clears combined empty filters without changing progress, notes, exports or edited status', () => {
  const report = comparisonFixture()
  report.changes.push({
    ...report.changes[0],
    reference: 'PC:metadata',
    classification: 'metadata',
    label: 'Renamed',
  })
  const edited = vi.fn(),
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} onEditedChange={edited} />)
  const clear = screen.getByRole('button', { name: 'Clear navigation filters' })
  expect((clear as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Keep this note' } })
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  edited.mockClear()
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  fireEvent.change(screen.getByLabelText('Change classification'), {
    target: { value: 'metadata' },
  })
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'missing' } })
  expect(screen.queryByLabelText('Change to review')).toBeNull()
  fireEvent.click(clear)
  expect((screen.getByLabelText('Find a change') as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText('Change classification') as HTMLSelectElement).value).toBe('all')
  expect((screen.getByLabelText('Show pending items only') as HTMLInputElement).checked).toBe(false)
  expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe('PC:part')
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('Keep this note')
  expect((screen.getByLabelText('Acknowledge selected change') as HTMLInputElement).checked).toBe(
    true,
  )
  expect((clear as HTMLButtonElement).disabled).toBe(true)
  expect(edited).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes).toHaveLength(2)
  expect(saved.changes[0]).toEqual({
    reference: 'PC:part',
    note: 'Keep this note',
    acknowledged: true,
  })
})

it('enables clearing each individual filter, including whitespace, and preserves the visible selection', () => {
  const report = comparisonFixture()
  report.changes.push({ ...report.changes[0], reference: 'PC:second', label: 'Second' })
  render(<ProductionPacketRevisionReview report={report} />)
  const clear = screen.getByRole('button', {
    name: 'Clear navigation filters',
  }) as HTMLButtonElement
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'Second' } })
  fireEvent.click(clear)
  expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe('PC:second')
  for (const apply of [
    () => fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: '  ' } }),
    () =>
      fireEvent.change(screen.getByLabelText('Change classification'), {
        target: { value: 'manufacturing' },
      }),
    () => fireEvent.click(screen.getByLabelText('Show pending items only')),
  ]) {
    apply()
    expect(clear.disabled).toBe(false)
    fireEvent.click(clear)
    expect(clear.disabled).toBe(true)
    expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe('PC:second')
  }
})

it('allows a pending resume to complete after clearing navigation', async () => {
  const report = comparisonFixture(),
    saved = createRevisionReview(report)
  saved.changes[0].acknowledged = true
  saved.notes = 'Resumed review'
  let finish!: (text: string) => void
  const file = new File(['slow'], 'review.json')
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  })
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'missing' } })
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Clear navigation filters' }))
  await act(async () => finish(JSON.stringify(saved)))
  expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe(
    'Resumed review',
  )
  expect((screen.getByLabelText('Acknowledge selected change') as HTMLInputElement).checked).toBe(
    true,
  )
})

it('navigates to global pending classifications while preserving review contents and exports', () => {
  const report = comparisonFixture()
  report.changes.push({ ...report.changes[0], reference: 'PC:second', label: 'Second board' })
  report.changes.push({
    ...report.changes[0],
    reference: 'PC:metadata',
    label: 'Renamed',
    classification: 'metadata',
  })
  const edited = vi.fn(),
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} onEditedChange={edited} />)
  const manufacturing = screen.getByRole('button', {
    name: 'Review pending manufacturing changes',
  }) as HTMLButtonElement
  const metadata = screen.getByRole('button', {
    name: 'Review pending metadata changes',
  }) as HTMLButtonElement
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Preserved' } })
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'missing' } })
  edited.mockClear()
  fireEvent.click(manufacturing)
  expect((screen.getByLabelText('Find a change') as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText('Change classification') as HTMLSelectElement).value).toBe(
    'manufacturing',
  )
  expect((screen.getByLabelText('Show pending items only') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe('PC:second')
  expect(manufacturing.disabled).toBe(false)
  expect(edited).not.toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toBe('Review edits awaiting a JSON checkpoint.')
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  expect(manufacturing.disabled).toBe(true)
  expect(metadata.disabled).toBe(false)
  fireEvent.click(metadata)
  expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe('PC:metadata')
  expect((screen.getByLabelText('Change classification') as HTMLSelectElement).value).toBe(
    'metadata',
  )
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  expect(metadata.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Clear navigation filters' }))
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe('Preserved')
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes).toHaveLength(3)
  expect(saved.changes.every((item: { acknowledged: boolean }) => item.acknowledged)).toBe(true)
  expect(saved.changes[0].note).toBe('Preserved')
})

it('disables empty classification shortcuts and keeps an eligible pending selection', () => {
  const report = comparisonFixture()
  report.changes.push({ ...report.changes[0], reference: 'PC:second', label: 'Second' })
  render(<ProductionPacketRevisionReview report={report} />)
  expect(
    (screen.getByRole('button', { name: 'Review pending metadata changes' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'Second' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review pending manufacturing changes' }))
  expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe('PC:second')
})

it('shows pending checkpoint edits for every review group, retaining them through HTML and navigation', () => {
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={comparisonFixture()} />)
  const status = () => screen.getByRole('status').textContent
  expect(status()).toBe('No new review edits.')
  for (const edit of [
    () =>
      fireEvent.change(screen.getByLabelText('Reviewer (self-reported)'), {
        target: { value: 'Workshop' },
      }),
    () => fireEvent.change(screen.getByLabelText('Review notes'), { target: { value: 'Overall' } }),
    () => fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Geometry' } }),
    () => fireEvent.click(screen.getByLabelText('Acknowledge selected change')),
    () =>
      fireEvent.change(screen.getByLabelText('Output note: drawings/shop-drawings.pdf'), {
        target: { value: 'Output' },
      }),
    () => fireEvent.click(screen.getByLabelText('Acknowledge output: drawings/shop-drawings.pdf')),
    () =>
      fireEvent.change(screen.getByLabelText('Limitation note: Unsigned packets'), {
        target: { value: 'Limit' },
      }),
    () => fireEvent.click(screen.getByLabelText('Acknowledge limitation: Unsigned packets')),
  ]) {
    edit()
    expect(status()).toBe('Review edits awaiting a JSON checkpoint.')
    fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
    fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'missing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear navigation filters' }))
    expect(status()).toBe('Review edits awaiting a JSON checkpoint.')
    fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
    expect(status()).toBe('No new review edits.')
  }
  expect(download).toHaveBeenCalledTimes(16)
})

it('retains checkpoint edits on rejected resume and clears them on validated resume', async () => {
  const report = comparisonFixture()
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.change(screen.getByLabelText('Review notes'), { target: { value: 'Keep edits' } })
  const resume = (record: unknown) => {
    const file = new File(['record'], 'review.json')
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(record) })
    fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  }
  resume({ invalid: true })
  await screen.findByRole('alert')
  expect(screen.getByRole('status').textContent).toBe('Review edits awaiting a JSON checkpoint.')
  const record = createRevisionReview(report)
  record.notes = 'Resumed checkpoint'
  resume(record)
  await waitFor(() =>
    expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe(
      'Resumed checkpoint',
    ),
  )
  expect(screen.getByRole('status').textContent).toBe('No new review edits.')
})

it('keeps per-part summary totals complete through classification/search/pending filters and exports', () => {
  const report = perPartComparisonFixture(),
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.change(screen.getByLabelText('Change classification'), {
    target: { value: 'metadata' },
  })
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'missing' } })
  const rows = () =>
    within(screen.getByRole('table', { name: 'Detected change progress by part' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => [...row.children].map((cell) => cell.textContent))
  expect(rows()).toEqual([
    ['Boardpart', '1', '1', '1', '1', '2'],
    ['Boardother-part', '1', '0', '0', '1', '1'],
    ['operation-only', '0', '1', '0', '1', '1'],
  ])
  fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
  const doc = new DOMParser().parseFromString(download.mock.calls[0][0] as string, 'text/html')
  const table = [...doc.querySelectorAll('table')].find(
    (item) => item.querySelector('caption')?.textContent === 'Detected change progress by part',
  )!
  expect(
    [...table.querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    ),
  ).toEqual(rows())
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  expect(JSON.parse(download.mock.calls[1][0] as string).changes).toHaveLength(4)
})

it('shows a scoped empty per-part summary without removing partial coverage warnings', () => {
  render(
    <ProductionPacketRevisionReview
      report={{ ...comparisonFixture(), status: 'partial', changes: [] }}
    />,
  )
  expect(screen.queryByText('No detected part or operation findings to summarize.')).toBeTruthy()
  expect(screen.getByText(/Only parts with recorded findings are listed/)).toBeTruthy()
  expect(screen.getByText(/Coverage is partial/)).toBeTruthy()
})

it('focuses exact part IDs, clears conflicting filters and retains edits and complete exports', () => {
  const report = perPartComparisonFixture()
  report.changes[2].partId = 'all'
  report.changes.push({ ...report.changes[2], reference: 'PC:overlap', partId: 'other-part' })
  const edited = vi.fn(),
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} onEditedChange={edited} />)
  fireEvent.change(screen.getByLabelText('Change note'), {
    target: { value: 'Retain manual note' },
  })
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.change(screen.getByLabelText('Change classification'), {
    target: { value: 'metadata' },
  })
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'missing' } })
  edited.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Review part part' }))
  expect((screen.getByLabelText('Change classification') as HTMLSelectElement).value).toBe('all')
  expect((screen.getByLabelText('Find a change') as HTMLInputElement).value).toBe('')
  const selection = screen.getByLabelText('Change to review') as HTMLSelectElement
  expect([...selection.options].map((option) => option.value)).toEqual(['PC:manual', 'PC:part'])
  expect(selection.value).toBe('PC:manual')
  expect((screen.getByLabelText('Change classification') as HTMLSelectElement).value).toBe('all')
  expect((screen.getByLabelText('Show pending items only') as HTMLInputElement).checked).toBe(false)
  expect((screen.getByLabelText('Find a change') as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe(
    'Retain manual note',
  )
  expect(screen.getByRole('status').textContent).toBe('Review edits awaiting a JSON checkpoint.')
  expect(edited).not.toHaveBeenCalled()
  expect(
    (screen.getByRole('button', { name: 'Clear navigation filters' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
  fireEvent.change(selection, { target: { value: 'PC:part' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review part part' }))
  expect(selection.value).toBe('PC:manual')
  fireEvent.click(screen.getByRole('button', { name: 'Show all parts' }))
  expect(selection.options.length).toBe(5)
  expect(selection.value).toBe('PC:manual')
  fireEvent.click(screen.getByRole('button', { name: 'Review part all' }))
  expect([...selection.options].map((option) => option.value)).toEqual(['PC:other-part'])
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes).toHaveLength(5)
  expect(saved.changes[0].note).toBe('Retain manual note')
  expect('partFilter' in saved).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Clear navigation filters' }))
  expect(selection.options.length).toBe(5)
  expect(screen.queryByRole('button', { name: 'Show all parts' })).toBeNull()
})

it('uses scoped empty feedback and resets part focus for global pending shortcuts', () => {
  const report = perPartComparisonFixture()
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.click(screen.getByRole('button', { name: 'Review part operation-only' }))
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  expect(screen.queryByText(/No changes match this part and the current filters/)).not.toBeNull()
  expect(screen.queryByText(/No pending changes\./)).toBeNull()
  fireEvent.change(screen.getByLabelText('Change classification'), {
    target: { value: 'metadata' },
  })
  expect(screen.queryByText(/No changes match the current classification and filters/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Review pending manufacturing changes' }))
  expect(screen.queryByRole('button', { name: 'Show all parts' })).toBeNull()
  expect(
    [...(screen.getByLabelText('Change to review') as HTMLSelectElement).options].map(
      (option) => option.value,
    ),
  ).toEqual(['PC:manual', 'PC:part'])
})

it('preserves a pending import while focusing a part and leaves the focus active after resume', async () => {
  const report = perPartComparisonFixture(),
    record = createRevisionReview(report)
  record.notes = 'Resumed part review'
  let finish!: (text: string) => void
  const file = new File(['slow'], 'review.json')
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  })
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Review part part' }))
  await act(async () => finish(JSON.stringify(record)))
  expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe(
    'Resumed part review',
  )
  expect(
    [...(screen.getByLabelText('Change to review') as HTMLSelectElement).options].map(
      (option) => option.value,
    ),
  ).toEqual(['PC:manual', 'PC:part'])
  expect(screen.getByRole('status').textContent).toBe('No new review edits.')
})

it('opens the first pending finding for an exact part and keeps other work and exports complete', () => {
  const report = perPartComparisonFixture()
  report.changes.push({ ...report.changes[1], reference: 'PC:part-more' })
  const edited = vi.fn(),
    download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionPacketRevisionReview report={report} onEditedChange={edited} />)
  fireEvent.change(screen.getByLabelText('Change note'), { target: { value: 'Keep manual note' } })
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  fireEvent.change(screen.getByLabelText('Change to review'), { target: { value: 'PC:part-more' } })
  fireEvent.change(screen.getByLabelText('Change classification'), {
    target: { value: 'metadata' },
  })
  fireEvent.change(screen.getByLabelText('Find a change'), { target: { value: 'missing' } })
  edited.mockClear()
  const shortcut = screen.getByRole('button', {
    name: 'Review pending changes for part part',
  }) as HTMLButtonElement
  expect(shortcut.textContent).toBe('2')
  expect(shortcut.disabled).toBe(false)
  fireEvent.click(shortcut)
  expect((screen.getByLabelText('Find a change') as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText('Change classification') as HTMLSelectElement).value).toBe('all')
  expect((screen.getByLabelText('Show pending items only') as HTMLInputElement).checked).toBe(true)
  let selection = screen.getByLabelText('Change to review') as HTMLSelectElement
  expect([...selection.options].map((option) => option.value)).toEqual(['PC:part', 'PC:part-more'])
  expect(selection.value).toBe('PC:part')
  expect(screen.getByRole('status').textContent).toBe('Review edits awaiting a JSON checkpoint.')
  expect(edited).not.toHaveBeenCalled()
  fireEvent.change(selection, { target: { value: 'PC:part-more' } })
  fireEvent.click(shortcut)
  expect(selection.value).toBe('PC:part')
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  expect(selection.value).toBe('PC:part-more')
  expect(shortcut.textContent).toBe('1')
  fireEvent.click(screen.getByLabelText('Acknowledge selected change'))
  expect(shortcut.textContent).toBe('0')
  expect(shortcut.disabled).toBe(true)
  expect(screen.queryByText(/No changes match this part and the current filters/)).not.toBeNull()
  expect(screen.queryByText(/No pending changes\./)).toBeNull()
  expect(
    (
      screen.getByRole('button', {
        name: 'Review pending changes for part other-part',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  const saved = JSON.parse(download.mock.calls[0][0] as string)
  expect(saved.changes).toHaveLength(5)
  expect(saved.changes[0]).toMatchObject({ acknowledged: true, note: 'Keep manual note' })
  expect(
    saved.changes.filter((item: { acknowledged: boolean }) => !item.acknowledged),
  ).toHaveLength(2)
  expect('partFilter' in saved).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Show all parts' }))
  selection = screen.getByLabelText('Change to review') as HTMLSelectElement
  expect([...selection.options].map((option) => option.value)).toEqual([
    'PC:other-part',
    'PC:operation-only',
  ])
  fireEvent.click(screen.getByRole('button', { name: 'Clear navigation filters' }))
  expect(selection.options.length).toBe(5)
  fireEvent.change(selection, { target: { value: 'PC:manual' } })
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe(
    'Keep manual note',
  )
})

it('keeps a pending resume alive during a per-part pending shortcut and updates its disabled count', async () => {
  const report = perPartComparisonFixture(),
    record = createRevisionReview(report)
  record.changes[3].acknowledged = true
  record.changes[3].note = 'Resumed operation note'
  let finish!: (text: string) => void
  const file = new File(['slow'], 'review.json')
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve
      }),
  })
  render(<ProductionPacketRevisionReview report={report} />)
  fireEvent.change(screen.getByLabelText('Resume revision review'), { target: { files: [file] } })
  const shortcut = screen.getByRole('button', {
    name: 'Review pending changes for part operation-only',
  }) as HTMLButtonElement
  fireEvent.click(shortcut)
  expect((screen.getByLabelText('Change to review') as HTMLSelectElement).value).toBe(
    'PC:operation-only',
  )
  await act(async () => finish(JSON.stringify(record)))
  expect(shortcut.disabled).toBe(true)
  expect(shortcut.textContent).toBe('0')
  expect(screen.getByRole('status').textContent).toBe('No new review edits.')
  expect(screen.queryByText(/No changes match this part and the current filters/)).not.toBeNull()
  expect(screen.queryByLabelText('Change to review')).toBeNull()
  fireEvent.click(screen.getByLabelText('Show pending items only'))
  expect((screen.getByLabelText('Change note') as HTMLTextAreaElement).value).toBe(
    'Resumed operation note',
  )
})
