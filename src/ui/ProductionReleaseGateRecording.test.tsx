import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductionReleaseGate, type ReleaseRecording } from './ProductionReleaseGate'
import * as release from './productionReleaseGate'
import { sha256Hex, type RecordRefusal } from '../scene/releases'
import { readyAssessment, SOURCE_A } from '../scene/__fixtures__/release'

let hash: string
beforeAll(async () => {
  hash = await sha256Hex(SOURCE_A)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const assessed = (status: release.ProductionReleaseRecord['status'] = 'technically-ready') => ({
  ...readyAssessment('b'.repeat(64)),
  status,
})
function setup(options: {
  status?: release.ProductionReleaseRecord['status']
  live?: string
  manifest?: string | null
  outcome?: Awaited<ReturnType<ReleaseRecording['onRecord']>>
}) {
  vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(assessed(options.status))
  vi.spyOn(release, 'packetSourceSha256').mockResolvedValue(
    options.manifest === undefined ? hash : options.manifest,
  )
  const onRecord = vi
    .fn<ReleaseRecording['onRecord']>()
    .mockResolvedValue(
      options.outcome ?? { ok: true, releases: [], release: { revision: 1 } as never },
    )
  const recording: ReleaseRecording = {
    captureSource: () => options.live ?? SOURCE_A,
    onRecord,
  }
  render(<ProductionReleaseGate packet={new Uint8Array([1])} recording={recording} />)
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'initial' } })
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  return onRecord
}

it.each(['blocked', 'review-required'] as const)(
  'offers no recording for a %s assessment',
  async (status) => {
    setup({ status })
    await screen.findByText(/Release blocked|Release review required/)
    expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
    expect(screen.queryByLabelText('Released by')).toBeNull()
  },
)

it('offers recording for a ready assessment whose live source matches, and needs a name', async () => {
  const onRecord = setup({})
  const button = await screen.findByRole('button', { name: 'Record release' })
  expect((button as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Released by'), { target: { value: 'Sam' } })
  expect((button as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button)
  await screen.findByText('Recorded as revision 1.')
  expect(onRecord).toHaveBeenCalledWith({
    assessment: assessed(),
    packetSourceSha256: hash,
    liveSource: SOURCE_A,
    releasedBy: 'Sam',
  })
  expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
})

it('says the model changed, and offers no button, when the live source differs from the packet', async () => {
  setup({ live: SOURCE_A.replace('Kitchen', 'Laundry') })
  await screen.findByText(/The model changed since this packet was exported/)
  expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
})

it('explains a packet without a usable source digest', async () => {
  setup({ manifest: null })
  await screen.findByText(/does not carry a valid source digest/)
  expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
})

it('shows the refusal text when recording is refused', async () => {
  setup({ outcome: { ok: false, reason: 'unchanged' } })
  fireEvent.change(await screen.findByLabelText('Released by'), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record release' }))
  await screen.findByText('Nothing has changed since the latest recorded release.')
  expect(screen.queryByRole('button', { name: 'Record release' })).not.toBeNull()
})

it('drops the recording controls when the release context changes', async () => {
  setup({})
  await screen.findByRole('button', { name: 'Record release' })
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'revision' } })
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull())
})

it('offers recording again when the packet is re-assessed after a successful record', async () => {
  setup({})
  fireEvent.change(await screen.findByLabelText('Released by'), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record release' }))
  await screen.findByText('Recorded as revision 1.')
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  expect(await screen.findByRole('button', { name: 'Record release' })).toBeTruthy()
  expect(screen.getByLabelText('Released by')).toBeTruthy()
})

// A Record keyed by the union makes the compiler reject a list that misses a refusal.
const REFUSALS = Object.keys({
  'not-ready': true,
  'review-not-acknowledged': true,
  'invalid-manifest-hash': true,
  'invalid-packet-hash': true,
  'source-mismatch': true,
  'invalid-name': true,
  'duplicate-packet': true,
  unchanged: true,
  'source-too-large': true,
  'release-limit': true,
  stale: true,
} satisfies Record<RecordRefusal, true>) as RecordRefusal[]

it.each(REFUSALS)('announces the %s refusal as an alert', async (reason) => {
  setup({ outcome: { ok: false, reason } })
  fireEvent.change(await screen.findByLabelText('Released by'), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record release' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent?.trim()).toBeTruthy()
  expect(alert.textContent).not.toContain('undefined')
  expect(screen.queryByRole('status')).toBeNull()
})

it('announces a successful record as a status, not an alert', async () => {
  setup({})
  fireEvent.change(await screen.findByLabelText('Released by'), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record release' }))
  expect((await screen.findByRole('status')).textContent).toBe('Recorded as revision 1.')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('records the source as it is when Record is clicked, not as it was at assessment', async () => {
  const later = SOURCE_A.replace('Kitchen', 'Laundry')
  vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(assessed())
  vi.spyOn(release, 'packetSourceSha256').mockResolvedValue(hash)
  const onRecord = vi
    .fn<ReleaseRecording['onRecord']>()
    .mockResolvedValue({ ok: false, reason: 'source-mismatch' })
  const captureSource = vi.fn<() => string>().mockReturnValueOnce(SOURCE_A).mockReturnValue(later)
  render(
    <ProductionReleaseGate packet={new Uint8Array([1])} recording={{ captureSource, onRecord }} />,
  )
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'initial' } })
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  fireEvent.change(await screen.findByLabelText('Released by'), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record release' }))
  await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1))
  expect(onRecord.mock.calls[0][0].liveSource).toBe(later)
})

it('locks the assessment inputs while a record is in flight', async () => {
  vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(assessed())
  vi.spyOn(release, 'packetSourceSha256').mockResolvedValue(hash)
  let settle!: (result: Awaited<ReturnType<ReleaseRecording['onRecord']>>) => void
  const onRecord = vi.fn<ReleaseRecording['onRecord']>().mockReturnValue(
    new Promise((resolve) => {
      settle = resolve
    }),
  )
  render(
    <ProductionReleaseGate
      packet={new Uint8Array([1])}
      recording={{ captureSource: () => SOURCE_A, onRecord }}
    />,
  )
  const controls = () =>
    [
      screen.getByLabelText('Release context'),
      screen.getByLabelText('Earlier release packet ZIP'),
      screen.getByLabelText('Saved revision review JSON'),
      screen.getByRole('button', { name: 'Assess production release' }),
    ] as (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[]
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  fireEvent.change(await screen.findByLabelText('Released by'), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record release' }))
  await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1))
  expect(controls().map((control) => control.disabled)).toEqual([true, true, true, true])
  settle({ ok: false, reason: 'stale' })
  await screen.findByText('The release list changed. Try again.')
  expect(controls().map((control) => control.disabled)).toEqual([false, false, false, false])
})

it('does not read the packet source digest when the gate has no recording', async () => {
  vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(assessed())
  const digest = vi.spyOn(release, 'packetSourceSha256').mockResolvedValue(hash)
  render(<ProductionReleaseGate packet={new Uint8Array([1])} />)
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'initial' } })
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  await screen.findByText('Technically ready for release')
  expect(digest).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Released by')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})
