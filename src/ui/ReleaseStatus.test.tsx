import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { RELEASE_CHECK_DELAY_MS, ReleaseStatus } from './ReleaseStatus'
import { captureProductionSource, type ProductionPacketInput } from './buildProductionPacket'
import * as packetModule from './captureProductionSource'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { makeRelease } from '../scene/__fixtures__/release'
import * as releasesModule from '../scene/releases'

const inputOf = (): ProductionPacketInput => ({
  scene: machiningProject(),
  projectName: 'Kitchen',
  hardwareLibrary: {},
  materialLibrary: {},
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('shows no recorded release without hashing the project', () => {
  const hash = vi.spyOn(releasesModule, 'sha256Hex')
  render(<ReleaseStatus input={inputOf()} releases={[]} integrity={[]} />)
  expect(screen.getByRole('status').textContent).toBe('No recorded release')
  expect(hash).not.toHaveBeenCalled()
})

it('detects a board dimension edit and returns to a match when it is undone', async () => {
  const input = inputOf()
  const release = await makeRelease({ revision: 3, source: captureProductionSource(input) })
  const props = { releases: [release], integrity: ['ok'] as const }
  const { rerender } = render(<ReleaseStatus input={input} {...props} />)
  await screen.findByText('Matches revision 3')
  const edited = structuredClone(input)
  const board = edited.scene.parts.find((p) => p.kind === 'board')!
  if (board.kind === 'board') board.length += 50
  rerender(<ReleaseStatus input={edited} {...props} />)
  expect(screen.queryByText('Matches revision 3')).toBeNull()
  await screen.findByText('Unreleased changes since revision 3')
  rerender(<ReleaseStatus input={structuredClone(input)} {...props} />)
  await screen.findByText('Matches revision 3')
})

it.each(['projectName', 'hardwareLibrary', 'materialLibrary'] as const)(
  'includes %s in the production-source comparison',
  async (field) => {
    const input = inputOf()
    const release = await makeRelease({ source: captureProductionSource(input) })
    const edited = structuredClone(input)
    if (field === 'projectName') edited.projectName = 'New kitchen'
    if (field === 'hardwareLibrary')
      edited.hardwareLibrary = { hinge: { supplier: 'Shop', partNumber: 'H', unitCost: 5 } }
    if (field === 'materialLibrary')
      edited.materialLibrary = { Birch: { thickness: 18, costPerM2: 42 } }
    render(<ReleaseStatus input={edited} releases={[release]} integrity={['ok']} />)
    await screen.findByText('Unreleased changes since revision 1')
  },
)

it('uses the highest revision even when entries are out of order, without falling back on corruption', async () => {
  const input = inputOf()
  const old = await makeRelease({ id: 'old', source: captureProductionSource(input) })
  const latest = await makeRelease({ id: 'latest', revision: 3, source: 'different' })
  const entries = [latest, old]
  const { rerender } = render(<ReleaseStatus input={input} releases={entries} integrity={null} />)
  expect(screen.getByText('Checking release integrity…')).toBeTruthy()
  rerender(<ReleaseStatus input={input} releases={entries} integrity={['ok', 'ok']} />)
  await screen.findByText('Unreleased changes since revision 3')
  rerender(<ReleaseStatus input={input} releases={entries} integrity={['corrupted', 'ok']} />)
  expect(screen.getByText(/latest release integrity failed/)).toBeTruthy()
  rerender(
    <ReleaseStatus
      input={input}
      releases={[old, { unreadable: true, raw: {} }]}
      integrity={['ok', 'unreadable']}
    />,
  )
  expect(screen.getByText(/unreadable release record/)).toBeTruthy()
})

it('ignores an obsolete hash result after the design changes', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  let finish!: (hash: string) => void
  vi.spyOn(releasesModule, 'sha256Hex').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const hash = vi.mocked(releasesModule.sha256Hex)
  const props = { releases: [release], integrity: ['ok'] as const }
  const { rerender } = render(<ReleaseStatus input={input} {...props} />)
  await vi.waitFor(() => expect(hash).toHaveBeenCalledTimes(1))
  rerender(<ReleaseStatus input={{ ...input, projectName: 'Changed' }} {...props} />)
  await screen.findByText('Unreleased changes since revision 1')
  finish(release.sourceSha256)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(screen.getByText('Unreleased changes since revision 1')).toBeTruthy()
})

it('reports a failed digest without claiming a match', async () => {
  const input = inputOf()
  const release = await makeRelease({ source: captureProductionSource(input) })
  vi.spyOn(releasesModule, 'sha256Hex').mockRejectedValue(new Error('Unavailable'))
  render(<ReleaseStatus input={input} releases={[release]} integrity={['ok']} />)
  await screen.findByText('Release comparison unavailable: source could not be checked')
})

describe('a check that waits for edits to settle', () => {
  const setup = async () => {
    const input = inputOf()
    const release = await makeRelease({ source: captureProductionSource(input) })
    const matching = captureProductionSource(input)
    vi.useFakeTimers()
    const capture = vi.spyOn(packetModule, 'captureProductionSource')
    const hash = vi
      .spyOn(releasesModule, 'sha256Hex')
      .mockImplementation(async (text) => (text === matching ? release.sourceSha256 : 'other'))
    const props = { releases: [release], integrity: ['ok'] as const }
    const status = () => screen.getByRole('status').textContent
    const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
    return { input, props, capture, hash, status, wait }
  }

  it('captures and hashes once for a burst of edits inside the delay', async () => {
    const { input, props, capture, hash, status, wait } = await setup()
    const { rerender } = render(<ReleaseStatus input={input} {...props} />)
    for (let i = 1; i <= 5; i++) {
      await wait(RELEASE_CHECK_DELAY_MS - 1)
      rerender(<ReleaseStatus input={{ ...input, projectName: `Edit ${i}` }} {...props} />)
    }
    expect(capture).not.toHaveBeenCalled()
    expect(hash).not.toHaveBeenCalled()
    await wait(RELEASE_CHECK_DELAY_MS)
    expect(capture).toHaveBeenCalledTimes(1)
    expect(hash).toHaveBeenCalledTimes(1)
    expect(capture.mock.calls[0][0].projectName).toBe('Edit 5')
    expect(status()).toBe('Unreleased changes since revision 1')
  })

  it('keeps showing unreleased changes while a newer check is pending', async () => {
    const { input, props, hash, status, wait } = await setup()
    const { rerender } = render(
      <ReleaseStatus input={{ ...input, projectName: 'Edit' }} {...props} />,
    )
    await wait(RELEASE_CHECK_DELAY_MS)
    expect(status()).toBe('Unreleased changes since revision 1')
    rerender(<ReleaseStatus input={{ ...input, projectName: 'Edit again' }} {...props} />)
    expect(status()).toBe('Unreleased changes since revision 1')
    await wait(RELEASE_CHECK_DELAY_MS - 1)
    expect(status()).toBe('Unreleased changes since revision 1')
    expect(hash).toHaveBeenCalledTimes(1)
  })

  it('stops claiming a match while a newer check is pending', async () => {
    const { input, props, status, wait } = await setup()
    const { rerender } = render(<ReleaseStatus input={input} {...props} />)
    await wait(RELEASE_CHECK_DELAY_MS)
    expect(status()).toBe('Matches revision 1')
    rerender(<ReleaseStatus input={{ ...input, projectName: 'Edit' }} {...props} />)
    expect(status()).toBe('Checking changes since release…')
    await wait(RELEASE_CHECK_DELAY_MS)
    expect(status()).toBe('Unreleased changes since revision 1')
  })

  it('cancels a pending check on unmount', async () => {
    const { input, props, capture, hash, wait } = await setup()
    const { unmount } = render(<ReleaseStatus input={input} {...props} />)
    await wait(RELEASE_CHECK_DELAY_MS - 1)
    unmount()
    await wait(RELEASE_CHECK_DELAY_MS)
    expect(capture).not.toHaveBeenCalled()
    expect(hash).not.toHaveBeenCalled()
  })
})
