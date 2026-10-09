import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductionPacketComparison } from './ProductionPacketComparison'
import * as comparisons from './compareProductionPackets'
import * as downloads from './download'
import { MAX_PACKET_BYTES } from './verifyProductionPacket'

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
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const integrity = {
  schemaVersion: 1 as const,
  status: 'passed' as const,
  checkedFiles: 14,
  checkedOperations: 8,
  findings: [],
  scope: 'scope',
  limitations: [],
}
const report: comparisons.PacketRevisionReport = {
  schemaVersion: 1,
  status: 'compared',
  before: { sha256: 'before', projectName: 'P', capturedAt: 'date', integrity },
  after: { sha256: 'after', projectName: 'P', capturedAt: 'date', integrity },
  counts: { added: 0, removed: 0, modified: 1, manufacturing: 1, metadata: 0 },
  packetMetadataChanges: [],
  otherChangedFiles: [],
  limitations: [],
  changes: [
    {
      reference: 'PC:stable',
      entity: 'operation',
      partId: 'part',
      operationId: 'hole',
      label: 'Drilling',
      change: 'modified',
      classification: 'manufacturing',
      fields: [{ field: 'diameter', classification: 'manufacturing', before: 4, after: 5 }],
      before: { locations: ['before.pdf#page=3'], provenance: {}, definition: {} },
      after: { locations: ['after.pdf#page=4'], provenance: {}, definition: {} },
    },
  ],
}
function choose(label: string, bytes: Uint8Array, size?: number) {
  const file = new File([bytes as BlobPart], `${label}.zip`)
  Object.defineProperty(file, 'arrayBuffer', { value: vi.fn().mockResolvedValue(bytes.buffer) })
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })
  return file
}
describe('packet comparison UI', () => {
  it('requires two files, compares, shows both locations and downloads the full report', async () => {
    const compare = vi.spyOn(comparisons, 'compareProductionPackets').mockResolvedValue(report),
      download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    render(<ProductionPacketComparison onClose={vi.fn()} />)
    expect(
      (screen.getByRole('button', { name: 'Compare revisions' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    choose('Earlier packet', new Uint8Array([1]))
    choose('Later packet', new Uint8Array([2]))
    fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
    await screen.findByText('Revision comparison complete')
    expect(compare).toHaveBeenCalledWith(new Uint8Array([1]), new Uint8Array([2]))
    expect(screen.getByText('Earlier: before.pdf#page=3')).toBeTruthy()
    expect(screen.getByText('Later: after.pdf#page=4')).toBeTruthy()
    expect(screen.getByText('PC:stable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Download comparison report' }))
    expect(JSON.parse(download.mock.calls[0][0] as string)).toEqual(report)
    expect(download.mock.calls[0][1]).toBe(
      'production-packet-comparison-p-unavailable-to-unavailable.json',
    )
    choose('Later packet', new Uint8Array([3]))
    expect(screen.queryByText('Revision comparison complete')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download revision review' })).toBeNull()
  })
  it('shows blocked verification findings without claiming no changes', async () => {
    vi.spyOn(comparisons, 'compareProductionPackets').mockResolvedValue({
      ...report,
      status: 'blocked',
      changes: [],
      after: {
        ...report.after,
        integrity: {
          ...integrity,
          status: 'failed',
          findings: [
            {
              reference: 'PI:bad',
              code: 'hash',
              severity: 'error',
              message: 'Changed hash.',
              partId: null,
              operationId: null,
              locations: ['lists/machining.csv'],
            },
          ],
        },
      },
    })
    render(<ProductionPacketComparison onClose={vi.fn()} />)
    choose('Earlier packet', new Uint8Array([1]))
    choose('Later packet', new Uint8Array([2]))
    fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
    await screen.findByText('Comparison blocked')
    expect(screen.getByText(/No revision changes were assessed/)).toBeTruthy()
    expect(screen.getByText(/Changed hash/)).toBeTruthy()
    expect(screen.queryByText(/manufacturing changes ·/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download revision review' })).toBeNull()
  })
  it('marks legacy coverage partial and rejects oversized inputs before reading them', async () => {
    const compare = vi
      .spyOn(comparisons, 'compareProductionPackets')
      .mockResolvedValue({ ...report, status: 'partial' })
    render(<ProductionPacketComparison onClose={vi.fn()} />)
    const file = choose('Earlier packet', new Uint8Array([1]), MAX_PACKET_BYTES + 1)
    choose('Later packet', new Uint8Array([2]))
    fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('64 MiB'))
    expect(file.arrayBuffer).not.toHaveBeenCalled()
    expect(compare).not.toHaveBeenCalled()
    choose('Earlier packet', new Uint8Array([3]))
    fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
    await screen.findByText('Partial revision comparison')
    expect(screen.getByText(/Missing part fields were not assumed unchanged/)).toBeTruthy()
  })
})

it('preserves edited reviews when Close, Escape, packet replacement or re-comparison is canceled', async () => {
  const compare = vi.spyOn(comparisons, 'compareProductionPackets').mockResolvedValue(report)
  vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  const confirm = vi.mocked(window.confirm).mockReturnValue(false),
    close = vi.fn()
  render(<ProductionPacketComparison onClose={close} />)
  choose('Earlier packet', new Uint8Array([1]))
  choose('Later packet', new Uint8Array([2]))
  fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
  await screen.findByText('Revision comparison complete')
  expect(confirm).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Review notes'), { target: { value: 'Keep review' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  const cancel = new Event('cancel', { bubbles: true, cancelable: true })
  fireEvent(screen.getByRole('dialog'), cancel)
  expect(cancel.defaultPrevented).toBe(true)
  expect(close).not.toHaveBeenCalled()
  choose('Later packet', new Uint8Array([9]))
  fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
  expect(compare).toHaveBeenCalledTimes(1)
  expect(confirm).toHaveBeenCalledTimes(4)
  expect((screen.getByLabelText('Review notes') as HTMLTextAreaElement).value).toBe('Keep review')
  fireEvent.click(screen.getByRole('button', { name: 'Download printable review' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Download revision review' }))
  fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
  await screen.findByText('Revision comparison complete')
  expect(compare).toHaveBeenLastCalledWith(new Uint8Array([1]), new Uint8Array([2]))
  expect(confirm).toHaveBeenCalledTimes(5)
  fireEvent.change(screen.getByLabelText('Review notes'), { target: { value: 'New edit' } })
  confirm.mockReturnValue(true)
  choose('Earlier packet', new Uint8Array([3]))
  expect(screen.queryByLabelText('Review notes')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
  await screen.findByText('Revision comparison complete')
  expect(compare).toHaveBeenLastCalledWith(new Uint8Array([3]), new Uint8Array([2]))
  fireEvent.change(screen.getByLabelText('Reviewer (self-reported)'), {
    target: { value: 'Reviewer' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Compare revisions' }))
  await screen.findByText('Revision comparison complete')
  expect((screen.getByLabelText('Reviewer (self-reported)') as HTMLInputElement).value).toBe('')
  fireEvent.change(screen.getByLabelText('Review notes'), {
    target: { value: 'Close edited review' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(close).toHaveBeenCalledTimes(1)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }))
  expect(close).toHaveBeenCalledTimes(2)
})
