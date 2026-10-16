import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

it('offers comparison only for verified releases and passes the chosen snapshot', async () => {
  const release = await makeRelease()
  const onCompare = vi.fn()
  const { rerender } = render(
    <ReleaseList releases={[release]} integrity={null} onCompare={onCompare} />,
  )
  expect(screen.queryByRole('button', { name: /Compare current design/ })).toBeNull()
  rerender(<ReleaseList releases={[release]} integrity={['corrupted']} onCompare={onCompare} />)
  expect(screen.queryByRole('button', { name: /Compare current design/ })).toBeNull()
  rerender(<ReleaseList releases={[release]} integrity={['ok']} onCompare={onCompare} />)
  fireEvent.click(screen.getByRole('button', { name: 'Compare current design with revision 1' }))
  expect(onCompare).toHaveBeenCalledWith(release)
})
