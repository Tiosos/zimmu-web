import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductionReleaseGate } from './ProductionReleaseGate'
import * as release from './productionReleaseGate'
import * as downloads from './download'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const record: release.ProductionReleaseRecord = {
  schemaVersion: 1,
  kind: 'production-release-assessment',
  assessedAt: '2026-10-10T00:00:00Z',
  packetSha256: 'a'.repeat(64),
  status: 'review-required',
  formalApproval: 'not-recorded',
  revision: { mode: 'initial', beforeSha256: null, reviewSha256: null },
  findings: [
    {
      reference: 'PR:stable',
      category: 'review-required',
      source: 'readiness',
      message: 'Review manual instruction',
      partIds: ['panel'],
      operationId: 'manual',
      locations: ['machining/schedule.json', 'drawings/shop-drawings.pdf'],
    },
  ],
  limitations: ['Not approval'],
}
it('shows traceable release findings, exports the bound record and clears it on context change', async () => {
  const assess = vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(record)
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionReleaseGate packet={new Uint8Array([1])} />)
  expect((screen.getByLabelText('Release context') as HTMLSelectElement).value).toBe('revision')
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'initial' } })
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  await screen.findByText('Release review required')
  expect(assess).toHaveBeenCalledWith(expect.objectContaining({ mode: 'initial' }))
  expect(screen.queryByText('PR:stable')).not.toBeNull()
  expect(screen.queryByText(/machining\/schedule.json ↔ drawings/)).not.toBeNull()
  expect(screen.queryByText('Formal production approval: not recorded.')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Download release record' }))
  expect(JSON.parse(download.mock.calls[0][0] as string)).toEqual(record)
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'revision' } })
  expect(screen.queryByRole('button', { name: 'Download release record' })).toBeNull()
})
it('does not publish a late result after unmount and reports failures without exporting', async () => {
  let finish!: (record: release.ProductionReleaseRecord) => void
  const assess = vi.spyOn(release, 'assessProductionRelease').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const view = render(<ProductionReleaseGate packet={new Uint8Array([1])} />)
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  expect((screen.getByLabelText('Release context') as HTMLSelectElement).disabled).toBe(true)
  view.unmount()
  finish(record)
  assess.mockRejectedValue(new Error('Unreadable'))
  render(<ProductionReleaseGate packet={new Uint8Array([2])} />)
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Unreadable'))
  expect(screen.queryByRole('button', { name: 'Download release record' })).toBeNull()
})
it('downloads only outputs exposed by successful source verification', async () => {
  const integrity = await import('./verifyProductionPacket')
  vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(record)
  const inspect = vi.spyOn(integrity, 'inspectProductionPacket').mockResolvedValue({
    integrity: {
      schemaVersion: 1,
      status: 'passed',
      checkedFiles: 1,
      checkedOperations: 0,
      findings: [],
      scope: '',
      limitations: [],
    },
    files: { 'machining/schedule.json': new Uint8Array([1]) },
  })
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  render(<ProductionReleaseGate packet={new Uint8Array([2])} />)
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  await screen.findByText('Release review required')
  fireEvent.click(screen.getByRole('button', { name: 'Download output machining/schedule.json' }))
  await waitFor(() =>
    expect(download).toHaveBeenCalledWith(
      new Uint8Array([1]),
      'current-schedule.json',
      'application/json',
    ),
  )
  inspect.mockResolvedValue({
    integrity: {
      schemaVersion: 1,
      status: 'failed',
      checkedFiles: 0,
      checkedOperations: 0,
      findings: [],
      scope: '',
      limitations: [],
    },
    files: null,
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Download output drawings/shop-drawings.pdf' }),
  )
  await screen.findByRole('alert')
  expect(download).toHaveBeenCalledTimes(1)
})

it('does not download a source output after the gate is closed', async () => {
  const integrity = await import('./verifyProductionPacket')
  vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(record)
  let finish!: (value: Awaited<ReturnType<typeof integrity.inspectProductionPacket>>) => void
  vi.spyOn(integrity, 'inspectProductionPacket').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const download = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {})
  const view = render(<ProductionReleaseGate packet={new Uint8Array([2])} />)
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  await screen.findByText('Release review required')
  fireEvent.click(screen.getByRole('button', { name: 'Download output machining/schedule.json' }))
  view.unmount()
  await act(async () =>
    finish({
      integrity: {
        schemaVersion: 1,
        status: 'passed',
        checkedFiles: 1,
        checkedOperations: 0,
        findings: [],
        scope: '',
        limitations: [],
      },
      files: { 'machining/schedule.json': new Uint8Array([1]) },
    }),
  )
  expect(download).not.toHaveBeenCalled()
})
