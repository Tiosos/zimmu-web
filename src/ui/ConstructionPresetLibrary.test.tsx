import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { ConstructionPresetLibrary } from './ConstructionPresetLibrary'
import { CabinetConstructionEditor } from './CabinetConstructionEditor'
import { constructionDraft } from '../scene/constructionDraft'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import {
  captureConstructionPreset,
  CONSTRUCTION_PRESETS_KEY,
  parseConstructionPresets,
  serializeConstructionPresets,
} from '../scene/constructionPresets'
import { downloadBlob } from './download'
vi.mock('./download', () => ({ downloadBlob: vi.fn() }))
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const draft = () => constructionDraft(CARCASE_PRESETS[0].params)
const button = (name: string) => screen.getByRole('button', { name })
const click = (name: string) => fireEvent.click(button(name))
const input = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
const saved = () => parseConstructionPresets(localStorage.getItem(CONSTRUCTION_PRESETS_KEY)!)
function seed(name = 'Standard') {
  const p = captureConstructionPreset(name, 'Everyday', { ...draft(), jointMethod: 'dowel' })
  localStorage.setItem(CONSTRUCTION_PRESETS_KEY, serializeConstructionPresets([p]))
  return p
}
function open(stale = false) {
  const stage = vi.fn()
  function Harness() {
    const [d, setDraft] = useState(draft)
    return (
      <ConstructionPresetLibrary
        draft={d}
        stale={stale}
        materials={PRESET_MATERIALS}
        onStage={(next) => {
          stage(next)
          setDraft(next)
        }}
      />
    )
  }
  return { ...render(<Harness />), stage }
}
function save(name = 'Standard', description = 'Everyday') {
  input('Construction preset name', name)
  input('Construction preset description', description)
  click('Save construction preset')
}
function upload(raw: string | Promise<string>, size = 10) {
  fireEvent.change(screen.getByLabelText('Import construction preset JSON'), {
    target: { files: [{ size, text: () => Promise.resolve(raw) }] },
  })
}
it('saves locally, reloads, searches descriptions and sorts names/recent edits', () => {
  const view = open()
  save('Zulu', 'Tall cabinet')
  save('Alpha', 'Kitchen')
  expect(saved().map((p) => p.name)).toEqual(['Zulu', 'Alpha'])
  const list = screen.getByRole('list')
  expect(
    within(list)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['AlphaKitchen', 'ZuluTall cabinet'])
  input('Search construction presets', 'tall')
  expect(within(list).getAllByRole('button')).toHaveLength(1)
  input('Search construction presets', '')
  input('Sort construction presets', 'recent')
  expect(within(list).getAllByRole('button')[0].textContent).toContain('Alpha')
  expect(view.stage).not.toHaveBeenCalled()
  view.unmount()
  open()
  expect(screen.getByText('2 of 2 construction presets')).toBeTruthy()
})
it('updates details, replaces settings from draft, duplicates and deletes with cancel', () => {
  const p = seed()
  open()
  click('Standard Everyday')
  input('Construction preset name', 'Workshop')
  input('Construction preset description', 'New description')
  click('Update preset details')
  expect(saved()[0]).toMatchObject({
    name: 'Workshop',
    description: 'New description',
    id: p.id,
    createdAt: p.createdAt,
  })
  click('Replace preset from draft')
  expect(saved()[0].settings.jointMethod).toBe('butt-screw')
  click('Duplicate construction preset')
  expect(saved()[1].name).toBe('Workshop copy')
  expect(saved()[1].id).not.toBe(p.id)
  click('Delete construction preset')
  click('Cancel delete preset')
  expect(saved()).toHaveLength(2)
  click('Delete construction preset')
  click('Confirm delete preset')
  expect(saved()).toHaveLength(1)
})
it('shows differences and stages only selected groups with no scene writes', () => {
  seed()
  const view = open()
  click('Standard Everyday')
  expect(
    screen.getByRole('table', { name: 'Preset differences from draft' }).textContent,
  ).toContain('Dowel')
  fireEvent.click(screen.getByLabelText('Joint method', { exact: true }))
  expect(button('Stage construction preset')).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByLabelText('Joint method', { exact: true }))
  click('Stage construction preset')
  expect(view.stage).toHaveBeenCalledWith({ ...draft(), jointMethod: 'dowel' })
  expect(button('Stage construction preset')).toHaveProperty('disabled', true)
})
it('blocks capture/replacement/staging for a stale destination draft', () => {
  seed()
  open(true)
  click('Standard Everyday')
  for (const name of [
    'Save construction preset',
    'Replace preset from draft',
    'Stage construction preset',
  ])
    expect(button(name)).toHaveProperty('disabled', true)
})
it('preserves corrupt storage and permits successful reload after external repair', () => {
  localStorage.setItem(CONSTRUCTION_PRESETS_KEY, '{broken')
  open()
  expect(screen.getByRole('alert').textContent).toContain('has not been replaced')
  expect(button('Save construction preset')).toHaveProperty('disabled', true)
  expect(localStorage.getItem(CONSTRUCTION_PRESETS_KEY)).toBe('{broken')
  localStorage.removeItem(CONSTRUCTION_PRESETS_KEY)
  click('Reload construction presets')
  save()
  expect(saved()).toHaveLength(1)
})
it('reports quota failure without claiming a saved entry or replacing current data', () => {
  seed()
  open()
  const denied = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded')
  })
  save('Second')
  expect(screen.getByRole('alert').textContent).toContain('not saved: quota exceeded')
  expect(screen.getByText('1 of 1 construction presets')).toBeTruthy()
  expect(saved()).toHaveLength(1)
  denied.mockRestore()
})
it('detects a write conflict even if no storage event arrived and requires retry', () => {
  open()
  seed('External')
  save('Mine')
  expect(saved().map((p) => p.name)).toEqual(['External'])
  expect(screen.getByRole('alert').textContent).toContain('changed in another tab')
  click('Save construction preset')
  expect(saved().map((p) => p.name)).toEqual(['External', 'Mine'])
})
it('refreshes on storage changes without overwriting external entries', () => {
  open()
  seed('Other tab')
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: CONSTRUCTION_PRESETS_KEY })))
  expect(screen.getByText('1 of 1 construction presets')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('refreshed')
})
it('imports copies with distinct IDs/names and exports selected or whole library', async () => {
  const p = seed()
  open()
  upload(serializeConstructionPresets([p]))
  await waitFor(() => expect(saved()).toHaveLength(2))
  expect(saved()[1].name).toBe('Standard (2)')
  expect(saved()[1].id).not.toBe(p.id)
  click('Export selected construction preset')
  expect(
    parseConstructionPresets(vi.mocked(downloadBlob).mock.calls.at(-1)![0] as string),
  ).toHaveLength(1)
  click('Export construction preset library')
  expect(
    parseConstructionPresets(vi.mocked(downloadBlob).mock.calls.at(-1)![0] as string),
  ).toHaveLength(2)
})
it('rejects invalid, empty and oversized imports atomically', async () => {
  seed()
  open()
  upload('{')
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  expect(saved()).toHaveLength(1)
  upload(serializeConstructionPresets([]))
  await waitFor(() =>
    expect(screen.queryByRole('alert')?.textContent).toContain('no construction presets'),
  )
  upload('{}', 256 * 1024 + 1)
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('256 KiB'))
  expect(saved()).toHaveLength(1)
})
it('ignores delayed imports after a library edit, reload or unmount', async () => {
  const p = seed(),
    raw = serializeConstructionPresets([p])
  const view = open()
  let resolve!: (value: string) => void
  upload(
    new Promise<string>((r) => {
      resolve = r
    }),
  )
  save('New')
  await act(async () => resolve(raw))
  expect(saved()).toHaveLength(2)
  upload(
    new Promise<string>((r) => {
      resolve = r
    }),
  )
  click('Reload construction presets')
  await act(async () => resolve(raw))
  expect(saved()).toHaveLength(2)
  upload(
    new Promise<string>((r) => {
      resolve = r
    }),
  )
  view.unmount()
  await act(async () => resolve(raw))
  expect(saved()).toHaveLength(2)
})
it('ignores older file reads when a newer import or storage event wins', async () => {
  const p = seed(),
    raw = serializeConstructionPresets([p])
  open()
  let resolve!: (value: string) => void
  upload(
    new Promise<string>((r) => {
      resolve = r
    }),
  )
  upload(raw)
  await waitFor(() => expect(saved()).toHaveLength(2))
  await act(async () => resolve(raw))
  expect(saved()).toHaveLength(2)
  upload(
    new Promise<string>((r) => {
      resolve = r
    }),
  )
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })))
  await act(async () => resolve(raw))
  expect(saved()).toHaveLength(2)
})
it('warns about unavailable panel stock and allows excluding material settings', () => {
  const p = seed()
  p.settings.frontMaterial = 'Missing'
  localStorage.setItem(CONSTRUCTION_PRESETS_KEY, serializeConstructionPresets([p]))
  open()
  click('Standard Everyday')
  expect(screen.getByRole('alert').textContent).toContain('Missing')
  fireEvent.click(screen.getByLabelText('Panel materials', { exact: true }))
  expect(screen.queryByRole('alert')).toBeNull()
})
it('stages into the real construction editor, clears old previews and validates before apply', () => {
  seed()
  const update = vi.fn()
  render(
    <CabinetConstructionEditor
      cabinet={cabinet}
      materials={PRESET_MATERIALS}
      parts={[]}
      components={[]}
      onUpdate={update}
    />,
  )
  input('Draft Width', '750')
  click('Preview construction')
  expect(screen.getByRole('region', { name: 'Construction preview' })).toBeTruthy()
  click('Standard Everyday')
  click('Stage construction preset')
  expect(update).not.toHaveBeenCalled()
  expect(screen.queryByRole('region', { name: 'Construction preview' })).toBeNull()
  expect(screen.getByLabelText('Draft Width')).toHaveProperty('value', '750')
  expect(screen.getByLabelText('Draft Joint method')).toHaveProperty('value', 'dowel')
  click('Preview construction')
  click('Apply construction')
  expect(update).toHaveBeenCalledTimes(1)
  expect(update.mock.calls[0][1]).toBe('Apply cabinet construction')
})
it('reports denied storage reads without silently replacing the library', () => {
  const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw Error('access denied')
  })
  open()
  expect(screen.getByRole('alert').textContent).toContain('access denied')
  expect(button('Save construction preset')).toHaveProperty('disabled', true)
  spy.mockRestore()
  click('Reload construction presets')
  save()
  expect(saved()).toHaveLength(1)
})
it('rejects incomplete numeric drafts on capture without modifying saved settings', () => {
  render(
    <ConstructionPresetLibrary
      draft={{ ...draft(), frontReveal: '' }}
      stale={false}
      materials={PRESET_MATERIALS}
      onStage={vi.fn()}
    />,
  )
  save()
  expect(screen.getByRole('alert').textContent).toContain('finite')
  expect(localStorage.getItem(CONSTRUCTION_PRESETS_KEY)).toBeNull()
})
it('stages unavailable materials but prevents applying until the draft is repaired', () => {
  const p = seed()
  p.settings.frontMaterial = 'Missing'
  localStorage.setItem(CONSTRUCTION_PRESETS_KEY, serializeConstructionPresets([p]))
  const update = vi.fn()
  render(
    <CabinetConstructionEditor
      cabinet={cabinet}
      materials={PRESET_MATERIALS}
      parts={[]}
      components={[]}
      onUpdate={update}
    />,
  )
  click('Standard Everyday')
  click('Stage construction preset')
  click('Preview construction')
  expect(button('Apply construction')).toHaveProperty('disabled', true)
  expect(update).not.toHaveBeenCalled()
  input('Draft Front material', '18mm Ply')
  click('Preview construction')
  expect(button('Apply construction')).toHaveProperty('disabled', false)
})
it('rejects incompatible selective front settings through construction validation', () => {
  const p = seed()
  p.settings.frontMount = 'half-overlay'
  p.settings.frameEnabled = true
  localStorage.setItem(CONSTRUCTION_PRESETS_KEY, serializeConstructionPresets([p]))
  render(
    <CabinetConstructionEditor
      cabinet={cabinet}
      materials={PRESET_MATERIALS}
      parts={[]}
      components={[]}
      onUpdate={vi.fn()}
    />,
  )
  click('Standard Everyday')
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Construction preset library' })).getByLabelText(
      'Face frame',
      { exact: true },
    ),
  )
  click('Stage construction preset')
  click('Preview construction')
  expect(button('Apply construction')).toHaveProperty('disabled', true)
  expect(screen.getByRole('alert').textContent).toContain('face frame')
})
