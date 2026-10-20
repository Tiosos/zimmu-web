import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CabinetLayoutLibrary } from './CabinetLayoutLibrary'
import { cabinet, partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { openingLayout } from '../scene/openingLayouts'
import {
  LAYOUT_LIBRARY_KEY,
  parseLayoutLibrary,
  savedLayout,
  serializeLayoutLibrary,
} from '../scene/cabinetLayoutLibrary'
import type { CarcaseComponent, CarcaseParams } from '../scene/types'
import * as download from './download'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
function open(params = cabinet.params, initialSelection: string | null = params.section.id) {
  let latest: CarcaseComponent = { ...cabinet, params }
  let replace!: (p: CarcaseParams) => void
  let select!: (id: string | null) => void
  const updates = vi.fn()
  function Harness() {
    const [component, setComponent] = useState(latest)
    const [selection, setSelection] = useState(initialSelection)
    latest = component
    replace = (p) => setComponent((previous) => ({ ...previous, params: p }))
    select = setSelection
    return (
      <CabinetLayoutLibrary
        cabinet={component}
        materials={PRESET_MATERIALS}
        parts={[]}
        components={[]}
        selected={selection}
        onSelect={setSelection}
        onUpdate={(updater, label) => {
          updates(updater, label)
          setComponent((previous) => {
            const next = updater(previous)
            if (next.kind !== 'carcase') throw Error('carcase')
            return next
          })
        }}
      />
    )
  }
  const view = render(<Harness />)
  view.container.querySelector('details')!.open = true
  return {
    ...view,
    updates,
    current: () => latest,
    replace: (p: CarcaseParams) => act(() => replace(p)),
    select: (id: string | null) => act(() => select(id)),
  }
}
const button = (name: string) => screen.getByRole('button', { name })
const name = (value: string) =>
  fireEvent.change(screen.getByLabelText('Layout name'), { target: { value } })
const save = (value = 'Kitchen') => {
  name(value)
  fireEvent.click(button('Save cabinet layout'))
}
const list = () => within(screen.getByRole('list'))
const stored = () => parseLayoutLibrary(localStorage.getItem(LAYOUT_LIBRARY_KEY)!)

it('saves a named whole-cabinet snapshot, restores it after remount and reports its contents', () => {
  const p = openingLayout(cabinet.params, cabinet.params.section.id, 'drawers')
  const view = open(p, null)
  expect(button('Save selected opening').hasAttribute('disabled')).toBe(true)
  save()
  expect(stored()).toHaveLength(1)
  expect(stored()[0].section).toEqual(p.section)
  expect(screen.getByText('3 openings · 0 doors · 3 drawer fronts · 0 shelves')).toBeTruthy()
  expect(view.updates).not.toHaveBeenCalled()
  view.unmount()
  open()
  expect(list().getByRole('button', { name: /Kitchen/ })).toBeTruthy()
})
it('saves only the chosen opening rather than the containing cabinet', () => {
  const p = openingLayout(cabinet.params, cabinet.params.section.id, 'drawer-door')
  if (p.section.content.kind !== 'split') throw Error('split')
  const selected = p.section.content.children[0]
  open(p, selected.id)
  name('Lower door')
  fireEvent.click(button('Save selected opening'))
  expect(stored()[0].section).toEqual(selected)
})
it('renames, duplicates, searches, sorts and deletes entries only after inline confirmation', () => {
  open()
  save('Zulu')
  name('Alpha')
  fireEvent.click(button('Rename saved layout'))
  expect(stored()[0].name).toBe('Alpha')
  fireEvent.click(button('Duplicate saved layout'))
  expect(stored().map((e) => e.name)).toEqual(['Alpha', 'Alpha copy'])
  fireEvent.change(screen.getByLabelText('Search layouts'), { target: { value: 'COPY' } })
  expect(list().getAllByRole('button')).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('Sort layouts'), { target: { value: 'oldest' } })
  expect(screen.getByText('1 of 2 saved layouts')).toBeTruthy()
  fireEvent.click(button('Delete saved layout'))
  expect(stored()).toHaveLength(2)
  fireEvent.click(button('Cancel delete layout'))
  expect(stored()).toHaveLength(2)
  fireEvent.click(button('Delete saved layout'))
  fireEvent.click(button('Confirm delete layout'))
  expect(stored()).toHaveLength(1)
})
it('previews without modifying the design, applies to a selected opening with separate history and rejects a stale updater', () => {
  const p = openingLayout(cabinet.params, cabinet.params.section.id, 'drawer-door')
  const entry = savedLayout(
    'Double doors',
    openingLayout(cabinet.params, cabinet.params.section.id, 'double-door').section,
    cabinet.params,
  )
  localStorage.setItem(LAYOUT_LIBRARY_KEY, serializeLayoutLibrary([entry]))
  if (p.section.content.kind !== 'split') throw Error('split')
  const selected = p.section.content.children[0].id
  const view = open(p, selected)
  fireEvent.click(list().getByRole('button', { name: /Double doors/ }))
  fireEvent.click(button('Preview saved layout'))
  expect(screen.getByRole('region', { name: 'Saved layout preview' })).toBeTruthy()
  expect(view.updates).not.toHaveBeenCalled()
  fireEvent.click(button('Cancel saved layout preview'))
  expect(view.current().params).toBe(p)
  fireEvent.click(button('Preview saved layout'))
  fireEvent.click(button('Apply saved layout'))
  const next = view.current().params.section
  if (next.content.kind !== 'split') throw Error('split')
  expect(next.content.children[0].id).toBe(selected)
  expect(next.content.children[0].front).toMatchObject({ leaves: 2 })
  expect(next.content.children[1]).toBe(p.section.content.children[1])
  expect(view.updates.mock.lastCall?.[1]).toBe('Apply saved cabinet layout')
  const updater = view.updates.mock.lastCall![0]
  const changed = { ...cabinet, params: { ...p, width: 750 } }
  expect(updater(changed)).toBe(changed)
  const other = { ...cabinet, id: 'other', params: p }
  expect(updater(other)).toBe(other)
})
it('applies a saved layout to the whole cabinet without a selected opening and expires previews after edits or selection changes', () => {
  const entry = savedLayout(
    'Doors',
    openingLayout(cabinet.params, cabinet.params.section.id, 'double-door').section,
    cabinet.params,
  )
  localStorage.setItem(LAYOUT_LIBRARY_KEY, serializeLayoutLibrary([entry]))
  const view = open(cabinet.params, null)
  fireEvent.click(list().getByRole('button', { name: /Doors/ }))
  fireEvent.change(screen.getByLabelText('Apply layout to'), { target: { value: 'cabinet' } })
  fireEvent.click(button('Preview saved layout'))
  view.replace({ ...cabinet.params, width: 700 })
  expect(screen.queryByRole('region', { name: 'Saved layout preview' })).toBeNull()
  fireEvent.click(button('Preview saved layout'))
  view.select(cabinet.params.section.id)
  expect(screen.queryByRole('region', { name: 'Saved layout preview' })).toBeNull()
  fireEvent.click(button('Preview saved layout'))
  fireEvent.click(button('Apply saved layout'))
  expect(view.current().params.width).toBe(700)
  expect(view.current().params.section.front).toMatchObject({ leaves: 2 })
})
it('blocks layouts with drawer boxes that cannot fit and leaves the current design unchanged', () => {
  const p = openingLayout(cabinet.params, cabinet.params.section.id, 'drawers')
  localStorage.setItem(
    LAYOUT_LIBRARY_KEY,
    serializeLayoutLibrary([savedLayout('Drawers', p.section, p)]),
  )
  const view = open({ ...cabinet.params, height: 200 })
  fireEvent.click(list().getByRole('button', { name: /Drawers/ }))
  fireEvent.click(button('Preview saved layout'))
  expect(screen.getByRole('alert').textContent).toContain('drawer boxes do not fit')
  expect(button('Apply saved layout').hasAttribute('disabled')).toBe(true)
  expect(view.updates).not.toHaveBeenCalled()
})
it('exports selected or all layouts as versioned portable JSON', () => {
  const exported = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})
  open()
  save()
  fireEvent.click(button('Duplicate saved layout'))
  fireEvent.click(button('Export selected layout'))
  expect(parseLayoutLibrary(exported.mock.lastCall![0] as string)).toHaveLength(1)
  fireEvent.click(button('Export layout library'))
  expect(parseLayoutLibrary(exported.mock.lastCall![0] as string)).toHaveLength(2)
})
it('imports append-only with fresh IDs and unique names, rejects invalid files and leaves the original library intact', async () => {
  open()
  save()
  const before = stored()[0]
  const input = screen.getByLabelText('Import layout JSON')
  const file = { size: 100, text: async () => serializeLayoutLibrary([before]) }
  fireEvent.change(input, { target: { files: [file] } })
  await waitFor(() => expect(stored()).toHaveLength(2))
  expect(stored()[0]).toEqual(before)
  expect(stored()[1].id).not.toBe(before.id)
  expect(stored()[1].name).toBe('Kitchen (2)')
  fireEvent.change(input, { target: { files: [{ size: 1, text: async () => '{}' }] } })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Unsupported'))
  expect(stored()).toHaveLength(2)
})
it('does not claim a failed storage write succeeded and never replaces unreadable stored data', () => {
  const view = open()
  const denied = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw Error('Quota exceeded')
  })
  save()
  expect(list().queryByRole('button')).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('not saved')
  denied.mockRestore()
  view.unmount()
  localStorage.setItem(LAYOUT_LIBRARY_KEY, 'broken')
  open()
  name('New')
  expect(button('Save cabinet layout').hasAttribute('disabled')).toBe(true)
  expect(localStorage.getItem(LAYOUT_LIBRARY_KEY)).toBe('broken')
  expect(screen.getByRole('alert').textContent).toContain('has not been replaced')
})
it('refreshes external library changes and detects conflicts before overwriting storage', () => {
  open()
  save()
  const other = savedLayout('Other tab', cabinet.params.section, cabinet.params)
  const raw = serializeLayoutLibrary([other])
  localStorage.setItem(LAYOUT_LIBRARY_KEY, raw)
  name('Unsaved')
  fireEvent.click(button('Rename saved layout'))
  expect(localStorage.getItem(LAYOUT_LIBRARY_KEY)).toBe(raw)
  expect(screen.getByRole('alert').textContent).toContain('another tab')
  const changed = serializeLayoutLibrary([{ ...other, name: 'External' }])
  localStorage.setItem(LAYOUT_LIBRARY_KEY, changed)
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: LAYOUT_LIBRARY_KEY, newValue: changed }),
    ),
  )
  expect(list().getByRole('button', { name: /External/ })).toBeTruthy()
})
it('ignores late imports after unmount and rejects library changes while a file is being read', async () => {
  const view = open()
  save()
  let resolve!: (s: string) => void
  const text = new Promise<string>((done) => {
    resolve = done
  })
  const incoming = serializeLayoutLibrary([
    savedLayout('Imported', cabinet.params.section, cabinet.params),
  ])
  fireEvent.change(screen.getByLabelText('Import layout JSON'), {
    target: { files: [{ size: 10, text: () => text }] },
  })
  const external = serializeLayoutLibrary([
    savedLayout('External', cabinet.params.section, cabinet.params),
  ])
  localStorage.setItem(LAYOUT_LIBRARY_KEY, external)
  await act(async () => resolve(incoming))
  expect(localStorage.getItem(LAYOUT_LIBRARY_KEY)).toBe(external)
  expect(screen.getByRole('alert').textContent).toContain('another tab')
  let late!: (s: string) => void
  const pending = new Promise<string>((done) => {
    late = done
  })
  fireEvent.change(screen.getByLabelText('Import layout JSON'), {
    target: { files: [{ size: 10, text: () => pending }] },
  })
  view.unmount()
  await act(async () => late(incoming))
  expect(localStorage.getItem(LAYOUT_LIBRARY_KEY)).toBe(external)
})

it('recovers from denied storage reads only after reload and keeps saved entries intact', () => {
  const entry = savedLayout('Kept', cabinet.params.section, cabinet.params)
  localStorage.setItem(LAYOUT_LIBRARY_KEY, serializeLayoutLibrary([entry]))
  const denied = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw Error('Access denied')
  })
  open()
  expect(screen.getByRole('alert').textContent).toContain('Access denied')
  expect(button('Save cabinet layout').hasAttribute('disabled')).toBe(true)
  denied.mockRestore()
  fireEvent.click(button('Reload local layouts'))
  expect(list().getByRole('button', { name: /Kept/ })).toBeTruthy()
  expect(stored()).toEqual([entry])
})
it('rejects oversized and empty imports without changing the library', async () => {
  open()
  save()
  const original = localStorage.getItem(LAYOUT_LIBRARY_KEY)
  const text = vi.fn(async () => serializeLayoutLibrary([]))
  fireEvent.change(screen.getByLabelText('Import layout JSON'), {
    target: { files: [{ size: 1024 * 1024, text }] },
  })
  expect(text).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('512 KiB')
  fireEvent.change(screen.getByLabelText('Import layout JSON'), {
    target: { files: [{ size: 100, text }] },
  })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no saved layouts'))
  expect(localStorage.getItem(LAYOUT_LIBRARY_KEY)).toBe(original)
})
it('ignores superseded file reads and expires previews when the saved entry is renamed', async () => {
  open()
  save()
  fireEvent.click(button('Preview saved layout'))
  name('Renamed')
  fireEvent.click(button('Rename saved layout'))
  expect(screen.queryByRole('region', { name: 'Saved layout preview' })).toBeNull()
  let finish!: (raw: string) => void
  const pending = new Promise<string>((done) => {
    finish = done
  })
  const first = serializeLayoutLibrary([
    savedLayout('First', cabinet.params.section, cabinet.params),
  ])
  const second = serializeLayoutLibrary([
    savedLayout('Second', cabinet.params.section, cabinet.params),
  ])
  fireEvent.change(screen.getByLabelText('Import layout JSON'), {
    target: { files: [{ size: 100, text: () => pending }] },
  })
  fireEvent.change(screen.getByLabelText('Import layout JSON'), {
    target: { files: [{ size: 100, text: async () => second }] },
  })
  await waitFor(() => expect(stored()).toHaveLength(2))
  await act(async () => finish(first))
  expect(stored().map((entry) => entry.name)).toEqual(['Renamed', 'Second'])
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByLabelText('Layout name')).toHaveProperty('value', 'Second')
})

it('preserves previews through mesh updates but expires them for material, thickness and cabinet changes', () => {
  localStorage.setItem(
    LAYOUT_LIBRARY_KEY,
    serializeLayoutLibrary([savedLayout('Stored', cabinet.params.section, cabinet.params)]),
  )
  const props = {
    cabinet,
    materials: PRESET_MATERIALS,
    parts: partsOfBase600(),
    components: [],
    selected: cabinet.params.section.id,
    onUpdate: vi.fn(),
    onSelect: vi.fn(),
  }
  const view = render(<CabinetLayoutLibrary {...props} />)
  view.container.querySelector('details')!.open = true
  fireEvent.click(list().getByRole('button', { name: /Stored/ }))
  fireEvent.click(button('Preview saved layout'))
  view.rerender(<CabinetLayoutLibrary {...props} parts={structuredClone(props.parts)} />)
  expect(screen.getByRole('region', { name: 'Saved layout preview' })).toBeTruthy()
  const parts = props.parts.map((part) =>
    part.kind === 'board' && part.role === 'left-side'
      ? { ...part, overrides: { thickness: 25 } }
      : part,
  )
  view.rerender(<CabinetLayoutLibrary {...props} parts={parts} />)
  expect(screen.queryByRole('region', { name: 'Saved layout preview' })).toBeNull()
  fireEvent.click(button('Preview saved layout'))
  view.rerender(
    <CabinetLayoutLibrary
      {...props}
      parts={parts}
      materials={{ ...PRESET_MATERIALS, Extra: { thickness: 20 } }}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Saved layout preview' })).toBeNull()
  view.rerender(<CabinetLayoutLibrary {...props} />)
  fireEvent.click(button('Preview saved layout'))
  view.rerender(<CabinetLayoutLibrary {...props} cabinet={{ ...cabinet, id: 'other' }} />)
  expect(screen.queryByRole('region', { name: 'Saved layout preview' })).toBeNull()
})
it('does not show an old malformed-file error after a newer import has succeeded', async () => {
  open()
  save()
  let finish!: (raw: string) => void
  const pending = new Promise<string>((done) => {
    finish = done
  })
  fireEvent.change(screen.getByLabelText('Import layout JSON'), {
    target: { files: [{ size: 10, text: () => pending }] },
  })
  const incoming = serializeLayoutLibrary([
    savedLayout('Newest', cabinet.params.section, cabinet.params),
  ])
  fireEvent.change(screen.getByLabelText('Import layout JSON'), {
    target: { files: [{ size: 10, text: async () => incoming }] },
  })
  await waitFor(() => expect(stored()).toHaveLength(2))
  await act(async () => finish('{}'))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(stored()).toHaveLength(2)
})
