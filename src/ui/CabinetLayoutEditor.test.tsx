import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CabinetLayoutEditor } from './CabinetLayoutEditor'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { acceptLayout, type LayoutPreview } from '../scene/layoutTools'
import type { CarcaseComponent, Scene } from '../scene/types'
afterEach(cleanup)
const own: CarcaseComponent = { ...cabinet, id: 'a', label: 'A' }
const other: CarcaseComponent = {
  ...cabinet,
  id: 'b',
  label: 'B',
  position: { x: 1800, y: 900, z: 800 },
}
const third: CarcaseComponent = {
  ...cabinet,
  id: 'c',
  label: 'C',
  position: { x: 3000, y: 3000, z: 3000 },
}
const sceneOf = (): Scene => ({
  components: [own, other, third],
  parts: [],
  joints: [],
  hardware: [],
  materials: PRESET_MATERIALS,
})
const button = (name: string) => screen.getByRole('button', { name })
const click = (name: string) => fireEvent.click(button(name))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const cell = (id: string, axis: string) => screen.getByTestId(`layout-${id}-${axis}`).textContent
it('selects siblings, changes order, sorts and clears without writing to the scene', () => {
  const apply = vi.fn()
  const s = sceneOf()
  s.components.push({ ...third, id: 'nested', parentId: 'group' })
  render(<CabinetLayoutEditor cabinet={own} scene={s} onApply={apply} />)
  expect(screen.queryByLabelText('Include C (nested)')).toBeNull()
  click('Select all sibling cabinets')
  expect(screen.getByRole('region', { name: 'Selected cabinet order' }).textContent).toContain(
    '3 selected',
  )
  click('Move b earlier')
  expect(screen.getAllByRole('listitem')[0].textContent).toContain('B — reference')
  click('Move b later')
  click('Reverse layout order')
  expect(screen.getAllByRole('listitem')[0].textContent).toContain('C — reference')
  field('Layout sort axis', 'y')
  click('Sort layout order')
  expect(screen.getAllByRole('listitem')[0].textContent).toContain('A — reference')
  fireEvent.click(screen.getByLabelText('Include B (b)'))
  expect(screen.queryByTestId('layout-b-x')).toBeNull()
  click('Clear layout selection')
  expect(button('Preview cabinet layout').hasAttribute('disabled')).toBe(true)
  expect(apply).not.toHaveBeenCalled()
})
it('accumulates run and move operations and applies only after preview, preserving an independent snapshot', () => {
  const s = sceneOf(),
    apply = vi.fn((_: LayoutPreview) => true)
  render(<CabinetLayoutEditor cabinet={own} scene={s} onApply={apply} />)
  click('Select all sibling cabinets')
  field('Layout run gap', '25')
  click('Arrange along X')
  expect(cell('b', 'x')).toBe('625.00')
  expect(cell('c', 'x')).toBe('1250.00')
  field('Layout offset X', '100')
  field('Layout offset Y', '20')
  click('Stage selection move')
  expect(cell('b', 'x')).toBe('725.00')
  expect(cell('b', 'y')).toBe('920.00')
  expect(apply).not.toHaveBeenCalled()
  expect(button('Apply cabinet layout').hasAttribute('disabled')).toBe(true)
  click('Preview cabinet layout')
  expect(screen.getByRole('region', { name: 'Cabinet layout preview' })).toBeTruthy()
  click('Apply cabinet layout')
  expect(apply).toHaveBeenCalledTimes(1)
  const next = acceptLayout(s, apply.mock.lastCall![0])!
  expect(next.components.find((c) => c.id === 'b')?.position.x).toBe(725)
})
it('aligns, distributes, warns about overlap and permits deliberate apply', () => {
  render(<CabinetLayoutEditor cabinet={own} scene={sceneOf()} onApply={() => true} />)
  click('Select all sibling cabinets')
  click('Distribute gaps along X')
  expect(cell('b', 'x')).toBe('1500.00')
  click('Align left')
  click('Align front')
  click('Align bottom')
  click('Preview cabinet layout')
  expect(screen.getByRole('region', { name: 'Layout overlap warnings' }).textContent).toContain(
    'A ↔ B',
  )
  expect(button('Apply cabinet layout').hasAttribute('disabled')).toBe(false)
  field('Layout run gap', '-1')
  expect(screen.queryByRole('region', { name: 'Cabinet layout preview' })).toBeNull()
  click('Arrange along X')
  expect(screen.getByRole('alert').textContent).toContain('zero')
  click('Cancel layout changes')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(cell('a', 'x')).toBe('0.00')
})
it('requires explicit detach, validates unfinished offsets and resets when selection changes', () => {
  const s = sceneOf()
  const anchored = {
    ...own,
    anchor: { to: 'b', face: 'left' as const, gap: 0, offset: { u: 0, v: 0 } },
  }
  s.components[0] = anchored
  render(<CabinetLayoutEditor cabinet={anchored} scene={s} onApply={() => true} />)
  expect(screen.getByRole('group', { name: 'Move selection' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByLabelText('Detach selected anchors when applying'))
  field('Layout offset X', '')
  click('Stage selection move')
  expect(screen.getByRole('alert').textContent).toContain('finite')
  field('Layout offset X', '100')
  click('Stage selection move')
  expect(cell('a', 'x')).toBe('1300.00')
  fireEvent.click(screen.getByLabelText('Include B (b)'))
  expect(cell('a', 'x')).toBe('1200.00')
  expect(
    (screen.getByLabelText('Detach selected anchors when applying') as HTMLInputElement).checked,
  ).toBe(false)
})
it('invalidates previews for inputs and ordering, keeps mesh updates and requires reset on geometry changes', () => {
  const s = sceneOf(),
    props = { cabinet: own, scene: s, onApply: () => true }
  const view = render(<CabinetLayoutEditor {...props} />)
  click('Select all sibling cabinets')
  field('Layout offset X', '50')
  click('Stage selection move')
  click('Preview cabinet layout')
  view.rerender(<CabinetLayoutEditor {...props} scene={{ ...s, parts: [...s.parts] }} />)
  expect(screen.getByRole('region', { name: 'Cabinet layout preview' })).toBeTruthy()
  click('Reverse layout order')
  expect(screen.queryByRole('region', { name: 'Cabinet layout preview' })).toBeNull()
  click('Preview cabinet layout')
  field('Layout offset Y', '1')
  expect(screen.queryByRole('region', { name: 'Cabinet layout preview' })).toBeNull()
  click('Preview cabinet layout')
  view.rerender(
    <CabinetLayoutEditor
      {...props}
      scene={{
        ...s,
        components: [own, { ...other, params: { ...other.params, width: 700 } }, third],
      }}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Cabinet layout preview' })).toBeNull()
  expect(button('Preview cabinet layout').hasAttribute('disabled')).toBe(true)
  expect(cell('a', 'x')).toBe('50.00')
  click('Reset layout draft')
  expect(cell('a', 'x')).toBe('0.00')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('shows noop and rejected acceptance without claiming success', () => {
  const apply = vi.fn(() => false)
  render(<CabinetLayoutEditor cabinet={own} scene={sceneOf()} onApply={apply} />)
  click('Preview cabinet layout')
  expect(screen.getByText('No staged layout changes.')).toBeTruthy()
  expect(button('Apply cabinet layout').hasAttribute('disabled')).toBe(true)
  field('Layout offset Z', '100')
  click('Stage selection move')
  click('Preview cabinet layout')
  click('Apply cabinet layout')
  expect(screen.getByRole('alert').textContent).toContain('changed after preview')
  expect(apply).toHaveBeenCalledTimes(1)
})
