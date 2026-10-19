import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionToolbar } from './SectionToolbar'
import { cabinet, partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { setSectionSize, splitSection } from '../scene/editSection'
import type { CarcaseComponent, CarcaseParams, Component, Part, Section } from '../scene/types'

afterEach(cleanup)
const children = (section: Section) => {
  if (section.content.kind !== 'split') throw new Error('expected split')
  return section.content.children
}
function opened(params = cabinet.params, selected = params.section.id, parts: Part[] = []) {
  let latest: CarcaseComponent = { ...cabinet, params }
  let change!: (params: CarcaseParams) => void
  const updates = vi.fn()
  function Harness() {
    const [component, setComponent] = useState(latest)
    const [selection, setSelection] = useState<string | null>(selected)
    latest = component
    change = (next) => setComponent((previous) => ({ ...previous, params: next }))
    return (
      <SectionToolbar
        params={component.params}
        componentId={component.id}
        materials={PRESET_MATERIALS}
        parts={parts}
        selected={selection}
        onSelect={setSelection}
        onUpdate={(updater, label) => {
          updates(updater, label)
          setComponent((previous) => {
            const next = updater(previous)
            if (next.kind !== 'carcase') throw new Error('expected carcase')
            return next
          })
        }}
      />
    )
  }
  const view = render(<Harness />)
  return {
    ...view,
    updates,
    current: () => latest,
    change: (next: CarcaseParams) => act(() => change(next)),
  }
}

it('splits into the requested count, offers front-only construction and refuses vertical rails', () => {
  const view = opened()
  fireEvent.change(screen.getByRole('combobox', { name: 'Split openings' }), {
    target: { value: '3' },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Division construction' }), {
    target: { value: 'none' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Split down' }))
  expect(children(view.current().params.section)).toHaveLength(3)
  expect(view.current().params.section.content).toMatchObject({
    axis: 'vertical',
    division: 'none',
  })
  expect(view.updates.mock.calls[0][1]).toBe('Edit opening layout')
  fireEvent.change(screen.getByRole('combobox', { name: 'Division construction' }), {
    target: { value: 'rail' },
  })
  expect((screen.getByRole('button', { name: 'Split down' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Split across' }))
  expect(view.current().params.section.content).toMatchObject({
    axis: 'horizontal',
    division: 'rail',
  })
})

it('reads material overrides for clear dimensions and starts fixed sizing at the resolved dimension', async () => {
  const section = splitSection(
    cabinet.params.section,
    cabinet.params.section.id,
    'vertical',
    'panel',
    2,
  )
  const parts = partsOfBase600().map((part) =>
    part.kind === 'board' && part.role === 'left-side'
      ? { ...part, overrides: { thickness: 25 } }
      : part,
  )
  const view = opened({ ...cabinet.params, section }, children(section)[0].id, parts)
  expect(screen.getByText('Clear opening: 269.5 × 584 mm (width × height).')).toBeTruthy()
  await userEvent.click(screen.getByLabelText('Size'))
  await userEvent.click(screen.getByRole('option', { name: 'Fixed' }))
  expect(children(view.current().params.section)[0].size).toEqual({ kind: 'fixed', mm: 269.5 })
})

it('edits percentages, rejects an impossible percentage, and equalizes sibling sizes in one action', async () => {
  const section = splitSection(
    cabinet.params.section,
    cabinet.params.section.id,
    'vertical',
    'panel',
    2,
  )
  const view = opened({ ...cabinet.params, section }, children(section)[0].id)
  await userEvent.click(screen.getByLabelText('Size'))
  await userEvent.click(screen.getByRole('option', { name: 'Percent' }))
  expect(children(view.current().params.section)[0].size).toEqual({ kind: 'percent', pct: 50 })
  fireEvent.change(screen.getByLabelText('Share'), { target: { value: '30' } })
  await waitFor(() =>
    expect(children(view.current().params.section)[0].size).toEqual({ kind: 'percent', pct: 30 }),
  )
  fireEvent.change(screen.getByLabelText('Share'), { target: { value: '150' } })
  await screen.findByRole('alert')
  expect((screen.getByLabelText('Share') as HTMLInputElement).value).toBe('30')
  expect(children(view.current().params.section)[0].size).toEqual({ kind: 'percent', pct: 30 })
  fireEvent.click(screen.getByRole('button', { name: 'Edit parent opening' }))
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Equalize openings' }))
  expect(
    children(view.current().params.section).every((child) => child.size.kind === 'equal'),
  ).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('moves an opening both ways, reverses sibling order and selects the parent for editing', () => {
  const section = splitSection(
    cabinet.params.section,
    cabinet.params.section.id,
    'vertical',
    'panel',
    3,
  )
  const ids = children(section).map((child) => child.id)
  const view = opened({ ...cabinet.params, section }, ids[1])
  fireEvent.click(screen.getByRole('button', { name: 'Move opening left' }))
  expect(children(view.current().params.section).map((child) => child.id)).toEqual([
    ids[1],
    ids[0],
    ids[2],
  ])
  expect(
    (screen.getByRole('button', { name: 'Move opening left' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Move opening right' }))
  expect(children(view.current().params.section).map((child) => child.id)).toEqual(ids)
  fireEvent.click(screen.getByRole('button', { name: 'Reverse opening order' }))
  expect(children(view.current().params.section).map((child) => child.id)).toEqual(
    [...ids].reverse(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit parent opening' }))
  expect(screen.getByRole('button', { name: 'Merge' })).toBeTruthy()
  expect(screen.queryByLabelText('Size')).toBeNull()
})

it('labels moves by physical direction for horizontally stacked openings', () => {
  const section = splitSection(
    cabinet.params.section,
    cabinet.params.section.id,
    'horizontal',
    'none',
    3,
  )
  const view = opened({ ...cabinet.params, section }, children(section)[1].id)
  const id = children(section)[1].id
  fireEvent.click(screen.getByRole('button', { name: 'Move opening down' }))
  expect(children(view.current().params.section)[0].id).toBe(id)
  fireEvent.click(screen.getByRole('button', { name: 'Move opening up' }))
  expect(children(view.current().params.section)[1].id).toBe(id)
})

it('previews without editing, cancels safely, and applies a validated drawer layout once with a discrete undo label', () => {
  const view = opened()
  fireEvent.change(screen.getByRole('combobox', { name: 'Opening layout' }), {
    target: { value: 'drawers' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  const preview = screen.getByRole('region', { name: 'Opening layout preview' })
  expect(within(preview).getByRole('img', { name: 'Cabinet elevation' })).toBeTruthy()
  expect(view.updates).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel layout preview' }))
  expect(view.current().params).toBe(cabinet.params)
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  fireEvent.click(screen.getByRole('button', { name: 'Apply opening layout' }))
  expect(view.updates).toHaveBeenCalledOnce()
  expect(view.updates.mock.calls[0][1]).toBe('Apply opening layout')
  expect(
    children(view.current().params.section).every((child) => child.front?.kind === 'drawer-front'),
  ).toBe(true)
  expect(view.current().params.width).toBe(600)
  expect(screen.queryByRole('region', { name: 'Opening layout preview' })).toBeNull()
  const updater = view.updates.mock.calls[0][0] as (c: Component) => Component
  const changed = { ...cabinet, params: { ...cabinet.params, width: 700 } }
  expect(updater(changed)).toBe(changed)
  const other = { ...cabinet, id: 'other' }
  expect(updater(other)).toBe(other)
})

it('invalidates a preview when the cabinet changes and blocks layouts that do not fit', () => {
  const view = opened()
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  view.change({ ...cabinet.params, width: 700 })
  expect(screen.queryByRole('region', { name: 'Opening layout preview' })).toBeNull()
  view.change({ ...cabinet.params, height: 190 })
  fireEvent.change(screen.getByRole('combobox', { name: 'Opening layout' }), {
    target: { value: 'drawer-door' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  expect(screen.getByRole('region', { name: 'Opening layout preview' })).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: 'Apply opening layout' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
  expect(view.updates).not.toHaveBeenCalled()
})

it('keeps a preview through mesh-only changes, expires it for material overrides or material changes, and expires it on parent selection', () => {
  const params = cabinet.params
  const props = {
    params,
    componentId: cabinet.id,
    materials: PRESET_MATERIALS,
    parts: partsOfBase600(),
    selected: params.section.id,
    onSelect: vi.fn(),
    onUpdate: vi.fn(),
  }
  const view = render(<SectionToolbar {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  view.rerender(<SectionToolbar {...props} parts={structuredClone(props.parts)} />)
  expect(screen.getByRole('region', { name: 'Opening layout preview' })).toBeTruthy()
  const overridden = props.parts.map((part) =>
    part.kind === 'board' && part.role === 'left-side'
      ? { ...part, overrides: { thickness: 25 } }
      : part,
  )
  view.rerender(<SectionToolbar {...props} parts={overridden} />)
  expect(screen.queryByRole('region', { name: 'Opening layout preview' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  view.rerender(
    <SectionToolbar
      {...props}
      parts={overridden}
      materials={{ ...PRESET_MATERIALS, Extra: { thickness: 20 } }}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Opening layout preview' })).toBeNull()
  view.unmount()
  const split = splitSection(params.section, params.section.id, 'vertical', 'panel', 2)
  const selection = opened({ ...params, section: split }, children(split)[0].id)
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit parent opening' }))
  expect(screen.queryByRole('region', { name: 'Opening layout preview' })).toBeNull()
  expect(selection.updates).not.toHaveBeenCalled()
})

it('flushes a pending fixed dimension to its original opening when selection changes', async () => {
  const split = splitSection(
    cabinet.params.section,
    cabinet.params.section.id,
    'vertical',
    'panel',
    2,
  )
  const [a, b] = children(split)
  const section = setSectionSize(setSectionSize(split, a.id, { kind: 'fixed', mm: 200 }), b.id, {
    kind: 'fixed',
    mm: 200,
  })
  const params = { ...cabinet.params, section }
  const update = vi.fn()
  const props = {
    params,
    componentId: cabinet.id,
    materials: PRESET_MATERIALS,
    parts: [],
    onSelect: vi.fn(),
    onUpdate: update,
  }
  const view = render(<SectionToolbar {...props} selected={a.id} />)
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '220' } })
  view.rerender(<SectionToolbar {...props} selected={b.id} />)
  await waitFor(() => expect(update).toHaveBeenCalledOnce())
  const next = update.mock.calls[0][0]({ ...cabinet, params }) as CarcaseComponent
  expect(children(next.params.section)[0].size).toEqual({ kind: 'fixed', mm: 220 })
  expect(children(next.params.section)[1].size).toEqual({ kind: 'fixed', mm: 200 })
})

it('keeps equalizing available to repair fixed openings after a cabinet is narrowed', () => {
  const split = splitSection(
    cabinet.params.section,
    cabinet.params.section.id,
    'vertical',
    'panel',
    2,
  )
  const [a, b] = children(split)
  const section = setSectionSize(setSectionSize(split, a.id, { kind: 'fixed', mm: 200 }), b.id, {
    kind: 'fixed',
    mm: 200,
  })
  const params = { ...cabinet.params, section }
  const view = opened(params, a.id)
  view.change({ ...params, width: 380 })
  expect(screen.getByRole('alert')).toBeTruthy()
  const equalize = screen.getByRole('button', { name: 'Equalize openings' }) as HTMLButtonElement
  expect(equalize.disabled).toBe(false)
  fireEvent.click(equalize)
  expect(
    children(view.current().params.section).every((child) => child.size.kind === 'equal'),
  ).toBe(true)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('Clear opening: 163 × 584 mm (width × height).')).toBeTruthy()
})

it('blocks a drawer-stack preview whose fronts fit but whose drawer boxes are too short', () => {
  opened({ ...cabinet.params, height: 200 })
  fireEvent.change(screen.getByRole('combobox', { name: 'Opening layout' }), {
    target: { value: 'drawers' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  expect(
    (screen.getByRole('button', { name: 'Apply opening layout' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})

it('copies an opening snapshot, navigates siblings and pastes only the requested content with separate history', () => {
  const section = splitSection(
    cabinet.params.section,
    cabinet.params.section.id,
    'vertical',
    'panel',
    2,
  )
  const [a, b] = children(section)
  a.front = { kind: 'door', leaves: 1, hinge: 'right' }
  const view = opened({ ...cabinet.params, section }, a.id)
  expect(screen.getByRole('button', { name: 'Previous opening' }).hasAttribute('disabled')).toBe(
    true,
  )
  expect(
    screen.getByRole('button', { name: 'Paste opening layout' }).hasAttribute('disabled'),
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Copy opening design' }))
  expect(view.updates).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Next opening' }))
  expect(screen.getByRole('button', { name: 'Next opening' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Paste opening front' }))
  expect(children(view.current().params.section)[1].front).toEqual(a.front)
  expect(children(view.current().params.section)[1].id).toBe(b.id)
  expect(view.updates.mock.lastCall?.[1]).toBe('Paste opening front')
  fireEvent.click(screen.getByRole('button', { name: 'Previous opening' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mirror opening left/right' }))
  expect(children(view.current().params.section)[0].front).toMatchObject({ hinge: 'left' })
  fireEvent.click(screen.getByRole('button', { name: 'Next opening' }))
  fireEvent.click(screen.getByRole('button', { name: 'Paste opening front' }))
  expect(children(view.current().params.section)[1].front).toMatchObject({ hinge: 'right' })
})

it('repeats fronts, clears contents and locks the actual sibling sizes through the opening tools', () => {
  const section = splitSection(
    cabinet.params.section,
    cabinet.params.section.id,
    'vertical',
    'panel',
    2,
  )
  const [a] = children(section)
  a.front = { kind: 'door', leaves: 2, hinge: 'left' }
  const view = opened({ ...cabinet.params, section }, a.id)
  fireEvent.click(screen.getByRole('button', { name: 'Repeat front to siblings' }))
  expect(
    children(view.current().params.section).every((child) => child.front?.kind === 'door'),
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Lock current opening sizes' }))
  expect(children(view.current().params.section).map((child) => child.size)).toEqual([
    { kind: 'fixed', mm: 273 },
    { kind: 'fixed', mm: 273 },
  ])
  fireEvent.click(screen.getByRole('button', { name: 'Edit parent opening' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear opening contents' }))
  expect(
    children(view.current().params.section).every(
      (child) => child.front === undefined && child.interior === undefined,
    ),
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Equalize nested openings' }))
  expect(
    children(view.current().params.section).every((child) => child.size.kind === 'equal'),
  ).toBe(true)
})

it('keeps a copied layout across cabinet parameter edits and rejects it when drawer boxes cannot fit', () => {
  const view = opened()
  fireEvent.change(screen.getByRole('combobox', { name: 'Opening layout' }), {
    target: { value: 'drawers' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Preview opening layout' }))
  fireEvent.click(screen.getByRole('button', { name: 'Apply opening layout' }))
  fireEvent.click(screen.getByRole('button', { name: 'Copy opening design' }))
  view.change({ ...view.current().params, height: 200, section: { ...cabinet.params.section } })
  fireEvent.click(screen.getByRole('button', { name: 'Paste opening layout' }))
  expect(screen.getByRole('alert').textContent).toContain('drawer boxes do not fit')
  expect(view.current().params.section.content.kind).toBe('leaf')
})
