import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductionPacketVerifier } from './ProductionPacketVerifier'
import * as verification from './verifyProductionPacket'
import * as downloads from './download'

beforeEach(() => {
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
})
const upload = (bytes: Uint8Array) => {
  const file = new File([bytes as BlobPart], 'packet.zip', { type: 'application/zip' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer })
  fireEvent.change(screen.getByLabelText('Production packet ZIP'), { target: { files: [file] } })
}
const report: verification.PacketIntegrityReport = {
  schemaVersion: 1,
  status: 'passed',
  checkedFiles: 14,
  checkedOperations: 8,
  findings: [],
  scope: 'Test scope',
  limitations: ['Not a signature'],
}
describe('packet verification UI', () => {
  it('uploads locally, shows a passed result and downloads a report', async () => {
    const verify = vi.spyOn(verification, 'verifyProductionPacket').mockResolvedValue(report)
    const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
    const close = vi.fn()
    render(<ProductionPacketVerifier onClose={close} />)
    upload(new Uint8Array([1, 2]))
    await screen.findByText('Integrity checks passed')
    expect(verify).toHaveBeenCalledWith(new Uint8Array([1, 2]))
    expect(screen.getByText(/14 files and 8 operation references/)).toBeTruthy()
    expect(screen.getByText(/does not establish fabrication readiness/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Download verification report' }))
    expect(JSON.parse(download.mock.calls[0][0] as string)).toEqual(report)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledOnce()
  })
  it('shows stable finding IDs and both locations, then recovers on another upload', async () => {
    const verify = vi
      .spyOn(verification, 'verifyProductionPacket')
      .mockResolvedValueOnce({
        ...report,
        status: 'failed',
        findings: [
          {
            reference: 'PI:stable',
            code: 'mismatch',
            severity: 'error',
            message: 'Outputs differ.',
            partId: 'part',
            operationId: 'op',
            locations: ['machining/schedule.json', 'drawings/shop-drawings.pdf#page=3'],
          },
        ],
      })
      .mockResolvedValueOnce({ ...report, status: 'unassessed' })
    render(<ProductionPacketVerifier onClose={vi.fn()} />)
    upload(new Uint8Array([1]))
    await screen.findByText('Integrity checks failed')
    expect(screen.getByText('PI:stable')).toBeTruthy()
    expect(
      screen.getByText('machining/schedule.json ↔ drawings/shop-drawings.pdf#page=3'),
    ).toBeTruthy()
    upload(new Uint8Array([2]))
    await screen.findByText('Integrity checks incomplete')
    expect(screen.queryByText('PI:stable')).toBeNull()
    expect(verify).toHaveBeenCalledTimes(2)
  })
  it('reports read errors and prevents oversized files from being read', async () => {
    const verify = vi.spyOn(verification, 'verifyProductionPacket')
    render(<ProductionPacketVerifier onClose={vi.fn()} />)
    const file = new File([], 'large.zip'),
      read = vi.fn()
    Object.defineProperty(file, 'size', { value: verification.MAX_PACKET_BYTES + 1 })
    Object.defineProperty(file, 'arrayBuffer', { value: read })
    fireEvent.change(screen.getByLabelText('Production packet ZIP'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('64 MiB'))
    expect(read).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  })
  it('disables the input while verification is pending and ignores results after close', async () => {
    let resolve!: (result: verification.PacketIntegrityReport) => void
    vi.spyOn(verification, 'verifyProductionPacket').mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    const view = render(<ProductionPacketVerifier onClose={vi.fn()} />)
    upload(new Uint8Array([1]))
    await waitFor(() =>
      expect((screen.getByLabelText('Production packet ZIP') as HTMLInputElement).disabled).toBe(
        true,
      ),
    )
    view.unmount()
    resolve(report)
    await Promise.resolve()
    expect(screen.queryByText('Integrity checks passed')).toBeNull()
  })
})
