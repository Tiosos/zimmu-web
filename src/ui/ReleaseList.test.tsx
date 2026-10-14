import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { ReleaseList } from './ReleaseList'
import { makeRelease } from '../scene/__fixtures__/release'

afterEach(cleanup)

it('renders nothing when no release is recorded', () => {
  const { container } = render(<ReleaseList releases={[]} integrity={[]} />)
  expect(container.textContent).toBe('')
})

it('lists newest first, labels the name self-declared and marks older releases superseded', async () => {
  const one = await makeRelease({ id: 'r1', revision: 1 })
  const two = await makeRelease({ id: 'r2', revision: 2, packetSha256: 'b'.repeat(64) })
  render(<ReleaseList releases={[one, two]} integrity={['ok', 'ok']} />)
  const rows = within(screen.getByRole('region', { name: 'Recorded releases' })).getAllByRole(
    'listitem',
  )
  expect(rows[0].textContent).toContain('Revision 2')
  expect(rows[0].textContent).toContain('Latest recorded')
  expect(rows[1].textContent).toContain('Revision 1')
  expect(rows[1].textContent).toContain('Superseded')
  expect(rows[0].textContent).toContain('Sam Designer (self-declared, unverified)')
  expect(rows[0].textContent).toContain('bbbbbbbbbbbb')
  expect(screen.getByText(/accidental corruption only/)).toBeTruthy()
})

it('shows each integrity state, including still checking', async () => {
  const one = await makeRelease({ id: 'r1', revision: 1 })
  const two = await makeRelease({ id: 'r2', revision: 2, packetSha256: 'b'.repeat(64) })
  const { rerender } = render(
    <ReleaseList releases={[one, { unreadable: true, raw: {} }, two]} integrity={null} />,
  )
  // An unreadable row is known to be unreadable without waiting for any hash.
  expect(screen.getAllByText('Checking integrity…')).toHaveLength(2)
  expect(screen.getByText(/Unreadable entry, preserved/)).toBeTruthy()
  rerender(
    <ReleaseList
      releases={[one, { unreadable: true, raw: {} }, two]}
      integrity={['ok', 'unreadable', 'corrupted']}
    />,
  )
  expect(screen.getByText('Integrity check passed')).toBeTruthy()
  expect(screen.getByText(/Integrity check failed/)).toBeTruthy()
  expect(screen.getByText(/Unreadable entry, preserved/)).toBeTruthy()
})
