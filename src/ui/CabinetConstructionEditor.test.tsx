import { openingLayout } from '../scene/openingLayouts'
import { regenerateDrawers } from '../scene/regenerateDrawers'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CabinetConstructionEditor } from './CabinetConstructionEditor'
import { cabinet, partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import type { CarcaseComponent, CarcaseParams } from '../scene/types'
afterEach(cleanup)
const button = (name: string) => screen.getByRole('button', { name })
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(`Draft ${name}`), { target: { value } })
function open() {
  let latest: CarcaseComponent = cabinet
  let change!: (params: CarcaseParams) => void
  const updates = vi.fn()
  function Harness() {
    const [c, setC] = useState(cabinet)
    latest = c
    change = (p) => setC({ ...c, params: p })
    return (
      <CabinetConstructionEditor
        cabinet={c}
        materials={PRESET_MATERIALS}
        parts={[]}
        components={[]}
        onUpdate={(updater, label) => {
          updates(updater, label)
          setC((previous) => {
            const next = updater(previous)
            if (next.kind !== 'carcase') throw Error('cabinet')
            return next
          })
        }}
      />
    )
  }
  const view = render(<Harness />)
  return {
    ...view,
    current: () => latest,
    updates,
    change: (p: CarcaseParams) => act(() => change(p)),
  }
}
it('stages coordinated edits without touching the model and applies them with a discrete history label', () => {
  const view = open()
  expect(button('Preview construction').hasAttribute('disabled')).toBe(true)
  field('Width', '750')
  field('Height', '800')
  field('Depth', '600')
  field('Back construction', 'applied')
  field('Base construction', 'ladder')
  field('Toe-kick height', '120')
  field('Toe-kick setback', '70')
  field('Front mounting', 'inset')
  field('Front reveal', '2')
  field('Joint method', 'dado-rabbet')
  expect(view.current()).toBe(cabinet)
  expect(view.updates).not.toHaveBeenCalled()
  fireEvent.click(button('Preview construction'))
  expect(screen.getByRole('table').textContent).toContain('750 × 800 × 600 mm')
  field('Width', '760')
  expect(screen.queryByRole('region', { name: 'Construction preview' })).toBeNull()
  field('Width', '750')
  fireEvent.click(button('Preview construction'))
  fireEvent.click(button('Apply construction'))
  expect(view.current().params).toMatchObject({
    width: 750,
    height: 800,
    depth: 600,
    backMode: 'applied',
    baseMode: 'ladder',
    toeKickHeight: 120,
    toeKickSetback: 70,
    frontMount: 'inset',
    frontReveal: 2,
    jointMethod: 'dado-rabbet',
  })
  expect(view.current().params.section).toBe(cabinet.params.section)
  expect(view.updates.mock.lastCall?.[1]).toBe('Apply cabinet construction')
  expect(button('Preview construction').hasAttribute('disabled')).toBe(true)
  const updater = view.updates.mock.lastCall![0]
  const changed = { ...cabinet, params: { ...cabinet.params, width: 900 } }
  expect(updater(changed)).toBe(changed)
  const other = { ...cabinet, id: 'other' }
  expect(updater(other)).toBe(other)
})
it('supports material, top and frame edits while rejecting half overlay without a frame', () => {
  const view = open()
  field('Carcase material', '12mm MDF')
  field('Back material', '18mm Ply')
  field('Front material', '12mm MDF')
  fireEvent.click(screen.getByLabelText('Include top panel'))
  field('Front mounting', 'half-overlay')
  fireEvent.click(button('Preview construction'))
  expect(screen.getByRole('alert').textContent).toContain('face frame')
  expect(button('Apply construction').hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByLabelText('Draft Face frame'))
  field('Edge stile width', '40')
  field('Edge rail width', '40')
  field('Middle stile width', '50')
  field('Middle rail width', '40')
  field('Frame material', '18mm Ply')
  fireEvent.click(screen.getByLabelText('Centre stile between paired doors'))
  fireEvent.click(button('Preview construction'))
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(button('Apply construction'))
  expect(view.current().params).toMatchObject({
    hasTop: false,
    carcaseMaterial: '12mm MDF',
    backMaterial: '18mm Ply',
    frontMaterial: '12mm MDF',
    frameMaterial: '18mm Ply',
    frame: { stileWidth: 40, railWidth: 40, midStileWidth: 50, midRailWidth: 40, pairStile: true },
  })
})
it('blocks unfinished and impossible dimensions, and reset/cancel leave scene data alone', () => {
  const view = open()
  field('Width', '')
  fireEvent.click(button('Preview construction'))
  expect(screen.getByRole('alert').textContent).toContain('finite positive')
  expect(button('Apply construction').hasAttribute('disabled')).toBe(true)
  fireEvent.click(button('Reset construction draft'))
  expect(screen.getByLabelText('Draft Width')).toHaveProperty('value', '600')
  field('Width', '1')
  fireEvent.click(button('Preview construction'))
  expect(screen.getByRole('alert').textContent).toContain('width must exceed')
  fireEvent.click(button('Cancel construction changes'))
  expect(view.updates).not.toHaveBeenCalled()
  expect(view.current()).toBe(cabinet)
})
it('retains a stale draft for inspection but requires reset after an external model edit', () => {
  const view = open()
  field('Width', '750')
  fireEvent.click(button('Preview construction'))
  view.change({ ...cabinet.params, width: 700 })
  expect(screen.queryByRole('region', { name: 'Construction preview' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('draft is retained')
  expect(screen.getByLabelText('Draft Width')).toHaveProperty('value', '750')
  expect(button('Preview construction').hasAttribute('disabled')).toBe(true)
  fireEvent.click(button('Reset construction draft'))
  expect(screen.getByLabelText('Draft Width')).toHaveProperty('value', '700')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(button('Preview construction').hasAttribute('disabled')).toBe(true)
})
it('expires previews for materials, role overrides and drawer parameters, but preserves mesh-only changes', () => {
  const props = {
    cabinet,
    materials: PRESET_MATERIALS,
    parts: partsOfBase600(),
    components: [],
    onUpdate: vi.fn(),
  }
  const view = render(<CabinetConstructionEditor {...props} />)
  field('Width', '700')
  fireEvent.click(button('Preview construction'))
  view.rerender(<CabinetConstructionEditor {...props} parts={structuredClone(props.parts)} />)
  expect(screen.getByRole('region', { name: 'Construction preview' })).toBeTruthy()
  const parts = props.parts.map((p) =>
    p.kind === 'board' && p.role === 'left-side' ? { ...p, overrides: { thickness: 25 } } : p,
  )
  view.rerender(<CabinetConstructionEditor {...props} parts={parts} />)
  expect(screen.queryByRole('region', { name: 'Construction preview' })).toBeNull()
  fireEvent.click(button('Preview construction'))
  view.rerender(
    <CabinetConstructionEditor
      {...props}
      parts={parts}
      materials={{ ...PRESET_MATERIALS, Extra: { thickness: 20 } }}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Construction preview' })).toBeNull()
})

it('expires previews when a retained drawer parameter changes and when cabinet identity changes', () => {
  const params = openingLayout(cabinet.params, cabinet.params.section.id, 'drawers')
  const scene = regenerateDrawers({
    parts: [],
    components: [{ ...cabinet, params }],
    materials: PRESET_MATERIALS,
    joints: [],
    hardware: [],
  })
  const props = {
    cabinet: { ...cabinet, params },
    materials: PRESET_MATERIALS,
    parts: scene.parts,
    components: scene.components,
    onUpdate: vi.fn(),
  }
  const view = render(<CabinetConstructionEditor {...props} />)
  field('Width', '700')
  fireEvent.click(button('Preview construction'))
  const components = scene.components.map((c) =>
    c.kind === 'drawer' ? { ...c, params: { ...c.params, boxHeight: 1 } } : c,
  )
  view.rerender(<CabinetConstructionEditor {...props} components={components} />)
  expect(screen.queryByRole('region', { name: 'Construction preview' })).toBeNull()
  fireEvent.click(button('Preview construction'))
  expect(screen.getByRole('alert').textContent).toContain('drawer boxes do not fit')
  view.rerender(
    <CabinetConstructionEditor {...props} cabinet={{ ...props.cabinet, id: 'other' }} />,
  )
  expect(button('Preview construction').hasAttribute('disabled')).toBe(true)
})
it('offers panel materials, preserves missing names and omits edge stock', () => {
  const props = {
    cabinet: { ...cabinet, params: { ...cabinet.params, frontMaterial: 'Missing front stock' } },
    materials: {
      ...PRESET_MATERIALS,
      Tape: { thickness: 1, use: 'edge' as const },
      NoThickness: {},
      Negative: { thickness: -1 },
      NonFinite: { thickness: Infinity },
    },
    parts: [],
    components: [],
    onUpdate: vi.fn(),
  }
  render(<CabinetConstructionEditor {...props} />)
  const select = screen.getByLabelText('Draft Front material') as HTMLSelectElement
  expect([...select.options].map((o) => o.value)).toContain('Missing front stock')
  expect([...select.options].map((o) => o.value)).not.toContain('Tape')
  expect([...select.options].map((o) => o.value)).not.toContain('NoThickness')
  expect([...select.options].map((o) => o.value)).not.toContain('Negative')
  expect([...select.options].map((o) => o.value)).not.toContain('NonFinite')
  field('Width', '700')
  fireEvent.click(button('Preview construction'))
  expect(button('Apply construction').hasAttribute('disabled')).toBe(true)
})
