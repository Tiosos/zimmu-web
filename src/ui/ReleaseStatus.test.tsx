import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ReleaseStatus } from './ReleaseStatus'
import { captureProductionSource, type ProductionPacketInput } from './buildProductionPacket'
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
  const props = { releases: [release], integrity: ['ok'] as const }
  const { rerender } = render(<ReleaseStatus input={input} {...props} />)
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
