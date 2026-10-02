import * as packageModule from '../scene/cataloguePackage'
/// <reference types="node" />
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogueImport } from './CatalogueImport'
import { packageFixture } from '../scene/__fixtures__/companyCatalogue'
import { MAX_CATALOGUE_BYTES } from '../scene/cataloguePackage'
import type { Scene } from '../scene/types'
const scene: Scene = { parts: [], components: [], materials: {}, hardware: [], joints: [] }
const file = (text = JSON.stringify(packageFixture())) => {
  const f = new File([text], 'catalogue.json', { type: 'application/json' })
  Object.defineProperty(f, 'text', { configurable: true, value: vi.fn().mockResolvedValue(text) })
  return f
}
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
})
it('reviews versions and requires source acknowledgement before installing into the captured project', async () => {
  const onInstall = vi.fn().mockReturnValue(true)
  const onClose = vi.fn()
  const user = userEvent.setup()
  render(<CatalogueImport scene={scene} onInstall={onInstall} onClose={onClose} />)
  await user.upload(screen.getByLabelText('Company catalogue package'), file())
  const button = await screen.findByRole('button', { name: 'Install catalogue in project' })
  expect((button as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/Offline files cannot authenticate/)).toBeTruthy()
  expect(screen.getByText(/Company base · product/)).toBeTruthy()
  await user.click(screen.getByRole('checkbox'))
  await user.click(button)
  expect(onInstall).toHaveBeenCalledWith(packageFixture(), scene)
  expect(onClose).toHaveBeenCalledOnce()
})
it('rejects oversized files before reading and digest mismatches without install controls', async () => {
  const user = userEvent.setup()
  const onInstall = vi.fn()
  render(<CatalogueImport scene={scene} onInstall={onInstall} onClose={vi.fn()} />)
  const large = file()
  Object.defineProperty(large, 'size', { value: MAX_CATALOGUE_BYTES + 1 })
  await user.upload(screen.getByLabelText('Company catalogue package'), large)
  await waitFor(() =>
    expect(screen.queryByRole('alert')?.textContent).toBe('Catalogue package exceeds 2 MiB.'),
  )
  expect(large.text).not.toHaveBeenCalled()
  const bad = packageFixture()
  bad.versions[0].hash = '0'.repeat(64)
  await user.upload(screen.getByLabelText('Company catalogue package'), file(JSON.stringify(bad)))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/digest mismatch/))
  expect(screen.queryByRole('button', { name: 'Install catalogue in project' })).toBeNull()
  expect(onInstall).not.toHaveBeenCalled()
})
it('invalidates a late file read on project change and a later selection supersedes the earlier one', async () => {
  const user = userEvent.setup()
  const onInstall = vi.fn()
  const view = render(<CatalogueImport scene={scene} onInstall={onInstall} onClose={vi.fn()} />)
  let finish!: (pkg: ReturnType<typeof packageFixture>) => void
  vi.spyOn(packageModule, 'parseCataloguePackage').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await user.upload(screen.getByLabelText('Company catalogue package'), file())
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  view.rerender(<CatalogueImport scene={{ ...scene }} onInstall={onInstall} onClose={vi.fn()} />)
  expect(screen.queryByRole('status')).toBeNull()
  await user.upload(screen.getByLabelText('Company catalogue package'), file())
  expect(await screen.findByRole('button', { name: 'Install catalogue in project' })).toBeTruthy()
  await act(async () => {
    finish(packageFixture(2))
  })
  expect(screen.queryByText(/company.base v1/)).not.toBeNull()
  expect(screen.queryByText(/company.base v2/)).toBeNull()
  expect(onInstall).not.toHaveBeenCalled()
})
it('keeps conflicts visible and refuses a stale install or cancel without mutating', async () => {
  const user = userEvent.setup()
  const onInstall = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error('Immutable conflict')
    })
    .mockReturnValue(false)
  const onClose = vi.fn()
  render(<CatalogueImport scene={scene} onInstall={onInstall} onClose={onClose} />)
  await user.upload(screen.getByLabelText('Company catalogue package'), file())
  const button = await screen.findByRole('button', { name: 'Install catalogue in project' })
  await user.click(screen.getByRole('checkbox'))
  await user.click(button)
  expect(screen.getByRole('alert').textContent).toBe('Immutable conflict')
  expect(onClose).not.toHaveBeenCalled()
  await user.click(button)
  expect(screen.getByRole('alert').textContent).toMatch(/project changed/)
  expect(screen.queryByRole('button', { name: 'Install catalogue in project' })).toBeNull()
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(onClose).toHaveBeenCalledOnce()
})
