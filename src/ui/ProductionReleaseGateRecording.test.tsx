import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProductionReleaseGate, type ReleaseRecording } from './ProductionReleaseGate'
import * as release from './productionReleaseGate'
import { sha256Hex, type RecordRefusal } from '../scene/releases'
import {
  readyAssessment,
  reviewAssessment,
  reviewFinding,
  SOURCE_A,
} from '../scene/__fixtures__/release'

let hash: string
beforeAll(async () => {
  hash = await sha256Hex(SOURCE_A)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const assessed = (
  status: release.ProductionReleaseRecord['status'] = 'technically-ready',
): release.ProductionReleaseRecord =>
  status === 'review-required'
    ? reviewAssessment('b'.repeat(64), 2)
    : status === 'blocked'
      ? {
          ...readyAssessment('b'.repeat(64)),
          status,
          findings: [reviewFinding('x'), { ...reviewFinding('y'), category: 'blocker' }],
        }
      : readyAssessment('b'.repeat(64))
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

it('offers no recording for a blocked assessment', async () => {
  setup({ status: 'blocked' })
  await screen.findByText('Release blocked')
  expect(screen.queryByRole('button', { name: 'Record release' })).toBeNull()
  expect(screen.queryByLabelText('Released by')).toBeNull()
  expect(screen.queryByRole('checkbox')).toBeNull()
})

const ACK = 'I have reviewed the 2 open review items in this assessment'

it('records a review-required assessment only once a name is typed and the review is acknowledged', async () => {
  const onRecord = setup({ status: 'review-required' })
  const button = (await screen.findByRole('button', {
    name: 'Record release',
  })) as HTMLButtonElement
  const box = screen.getByRole('checkbox', { name: ACK }) as HTMLInputElement
  expect(box.checked).toBe(false)
  expect(button.disabled).toBe(true)
  fireEvent.click(box)
  expect(button.disabled).toBe(true)
  fireEvent.click(box)
  fireEvent.change(screen.getByLabelText('Released by'), { target: { value: 'Sam' } })
  expect(button.disabled).toBe(true)
  fireEvent.click(box)
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  await screen.findByText('Recorded as revision 1.')
  expect(onRecord).toHaveBeenCalledWith({
    assessment: assessed('review-required'),
    packetSourceSha256: hash,
    liveSource: SOURCE_A,
    releasedBy: 'Sam',
    acknowledgeReview: true,
  })
})

it('clears the acknowledgment when the packet is assessed again', async () => {
  setup({ status: 'review-required', outcome: { ok: false, reason: 'stale' } })
  fireEvent.click(await screen.findByRole('checkbox', { name: ACK }))
  fireEvent.change(screen.getByLabelText('Released by'), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByRole('button', { name: 'Record release' }))
  await screen.findByText('The release list changed. Try again.')
  expect((screen.getByRole('checkbox', { name: ACK }) as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
  await waitFor(() =>
    expect((screen.getByRole('checkbox', { name: ACK }) as HTMLInputElement).checked).toBe(false),
  )
})

function setupOpen(open: number) {
  vi.spyOn(release, 'assessProductionRelease').mockResolvedValue(
    reviewAssessment('b'.repeat(64), open),
  )
  vi.spyOn(release, 'packetSourceSha256').mockResolvedValue(hash)
  render(
    <ProductionReleaseGate
      packet={new Uint8Array([1])}
      recording={{ captureSource: () => SOURCE_A, onRecord: vi.fn() }}
    />,
  )
  fireEvent.change(screen.getByLabelText('Release context'), { target: { value: 'initial' } })
  fireEvent.click(screen.getByRole('button', { name: 'Assess production release' }))
}

it('names a single open review item in the singular', async () => {
  setupOpen(1)
  expect(
    await screen.findByRole('checkbox', {
      name: 'I have reviewed the 1 open review item in this assessment',
    }),
  ).toBeTruthy()
})

it('says the release record lists every item when the findings shown are truncated', async () => {
  setupOpen(201)
  await screen.findByRole('checkbox', {
    name: 'I have reviewed the 201 open review items in this assessment',
  })
  expect(
    screen.getByText(
      'Recording stores a frozen copy of this project and this assessment, including the open review items (the release record lists all of them), in the file. The name is typed, not verified, and this is not formal approval.',
    ),
  ).toBeTruthy()
})

it('says the recorded copy includes the open review items and is not approval', async () => {
  setup({ status: 'review-required' })
  await screen.findByRole('button', { name: 'Record release' })
  expect(
    screen.getByText(
      'Recording stores a frozen copy of this project and this assessment, including the open review items, in the file. The name is typed, not verified, and this is not formal approval.',
    ),
  ).toBeTruthy()
})

it('offers recording for a ready assessment whose live source matches, and needs a name', async () => {
  const onRecord = setup({})
  const button = await screen.findByRole('button', { name: 'Record release' })
  expect(screen.queryByRole('checkbox')).toBeNull()
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
    acknowledgeReview: false,
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
