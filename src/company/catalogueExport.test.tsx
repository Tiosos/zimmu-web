import * as packageModule from '../scene/cataloguePackage'
/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompanyCatalogue } from './CompanyCatalogue'
import { CompanyApi } from './api'
import { packageFixture, companyId, staffId } from '../scene/__fixtures__/companyCatalogue'
import { downloadBlob } from '../ui/download'
import type { Published } from './types'
vi.mock('../ui/download', () => ({ downloadBlob: vi.fn() }))
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '')
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
function setup(versions: Published[] = packageFixture().versions) {
  const actor = { tenantId: companyId, objectId: staffId, roles: [] }
  const session = {
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    token: vi.fn().mockResolvedValue('secret-access-token'),
  }
  const transport = vi.fn(
    async (url: string | URL | Request) =>
      new Response(JSON.stringify(String(url).endsWith('/me') ? actor : versions)),
  )
  const api = new CompanyApi(session, transport)
  render(
    <CompanyCatalogue
      session={session}
      api={api}
      initialData={{ actor, drafts: [], versions: packageFixture().versions }}
      onClose={vi.fn()}
    />,
  )
  return { api, transport, session, user: userEvent.setup() }
}
it('exports fresh authenticated published snapshots and dependencies, without drafts/tokens', async () => {
  const { user, transport, session } = setup()
  await user.click(screen.getByRole('button', { name: 'Export published catalogue for CAD' }))
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce())
  const text = vi.mocked(downloadBlob).mock.calls[0][0] as string
  expect(JSON.parse(text)).toEqual(packageFixture())
  expect(text).not.toContain('secret-access-token')
  expect(transport.mock.calls.map(([url]) => String(url))).toEqual([
    '/api/catalogue/me',
    '/api/catalogue/versions',
  ])
  expect(session.token).toHaveBeenCalledTimes(2)
})
it('rejects bad hashes and missing dependencies without producing a partial download', async () => {
  const versions = packageFixture().versions
  versions[0].hash = '0'.repeat(64)
  const { user } = setup(versions)
  await user.click(screen.getByRole('button', { name: 'Export published catalogue for CAD' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/digest mismatch/))
  expect(downloadBlob).not.toHaveBeenCalled()
})
it('does not export a late response after sign-out', async () => {
  vi.spyOn(packageModule, 'parseCataloguePackage').mockResolvedValue(packageFixture())
  const { api, user } = setup()
  let finish!: (versions: Published[]) => void
  vi.spyOn(api, 'versions').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await user.click(screen.getByRole('button', { name: 'Export published catalogue for CAD' }))
  await waitFor(() => expect(api.versions).toHaveBeenCalled())
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  await act(async () => {
    finish(packageFixture().versions)
  })
  await screen.findByRole('button', { name: 'Sign in with Keycloak' })
  expect(downloadBlob).not.toHaveBeenCalled()
})
it('rejects a changed company identity before download', async () => {
  const { api, user } = setup()
  vi.spyOn(api, 'me').mockResolvedValue({
    tenantId: '55555555-5555-5555-5555-555555555555',
    objectId: staffId,
    roles: [],
  })
  await user.click(screen.getByRole('button', { name: 'Export published catalogue for CAD' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/identity changed/))
  expect(downloadBlob).not.toHaveBeenCalled()
})

it('does not download if sign-out occurs during digest verification', async () => {
  let finish!: (pkg: ReturnType<typeof packageFixture>) => void
  vi.spyOn(packageModule, 'parseCataloguePackage').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { user } = setup()
  await user.click(screen.getByRole('button', { name: 'Export published catalogue for CAD' }))
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  await act(async () => {
    finish(packageFixture())
  })
  expect(downloadBlob).not.toHaveBeenCalled()
})
