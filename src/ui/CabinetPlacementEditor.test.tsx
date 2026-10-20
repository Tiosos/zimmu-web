import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CabinetPlacementEditor } from './CabinetPlacementEditor'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { acceptPlacement, type PlacementPreview } from '../scene/placementTools'
import type { CarcaseComponent, Scene } from '../scene/types'
afterEach(cleanup)
const own: CarcaseComponent = { ...cabinet, id: 'a', label: 'A', position: { x: 0, y: 0, z: 0 } }
const other: CarcaseComponent = {
  ...cabinet,
  id: 'b',
  label: 'B',
  position: { x: 900, y: 0, z: 0 },
}
const sceneOf = (c = own): Scene => ({
  components: [c, other],
  materials: PRESET_MATERIALS,
  parts: [],
  joints: [],
  hardware: [],
})
const button = (name: string) => screen.getByRole('button', { name })
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
it('stages positions and turns without writing, previews overlaps and applies through the guarded callback', () => {
  const scene = sceneOf(),
    apply = vi.fn((_: PlacementPreview) => true)
  render(<CabinetPlacementEditor cabinet={own} scene={scene} onApply={apply} />)
  expect(button('Preview cabinet placement').hasAttribute('disabled')).toBe(true)
  field('Placement X', '400')
  fireEvent.click(button('Rotate right 90°'))
  expect(screen.getByLabelText('Placement Rotation Z')).toHaveProperty('value', '90')
  fireEvent.click(button('Rotate left 90°'))
  expect(screen.getByLabelText('Placement Rotation Z')).toHaveProperty('value', '0')
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(button('Preview cabinet placement'))
  expect(screen.getByRole('region', { name: 'Placement overlap warnings' }).textContent).toContain(
    'A ↔ B',
  )
  fireEvent.click(button('Apply cabinet placement'))
  const preview = apply.mock.lastCall![0]
  expect(acceptPlacement(scene, preview)?.components.find((c) => c.id === 'a')?.position.x).toBe(
    400,
  )
})
it('aligns against a selected independent cabinet and clears a preview when draft values change', () => {
  render(<CabinetPlacementEditor cabinet={own} scene={sceneOf()} onApply={() => true} />)
  expect(button('Align right').hasAttribute('disabled')).toBe(true)
  field('Placement reference cabinet', 'b')
  fireEvent.click(button('Align right'))
  expect(screen.getByLabelText('Placement X')).toHaveProperty('value', '900')
  fireEvent.click(button('Preview cabinet placement'))
  field('Placement Y', '100')
  expect(screen.queryByRole('region', { name: 'Cabinet placement preview' })).toBeNull()
  fireEvent.click(button('Reset placement rotation'))
  expect(screen.getByLabelText('Placement Rotation Z')).toHaveProperty('value', '0')
  fireEvent.click(button('Cancel placement changes'))
  expect(screen.getByLabelText('Placement X')).toHaveProperty('value', '0')
})
it('requires explicit detach for anchored cabinets and rejects incomplete positions', () => {
  const anchored = {
    ...own,
    anchor: { to: 'b', face: 'left' as const, gap: 0, offset: { u: 0, v: 0 } },
  }
  render(
    <CabinetPlacementEditor cabinet={anchored} scene={sceneOf(anchored)} onApply={() => true} />,
  )
  expect(screen.getByLabelText('Placement X').hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByLabelText('Detach existing anchor when applying'))
  field('Placement X', '')
  fireEvent.click(button('Preview cabinet placement'))
  expect(screen.getByRole('alert').textContent).toContain('finite')
  expect(button('Apply cabinet placement').hasAttribute('disabled')).toBe(true)
})
it('invalidates previews for scene geometry changes and requires reset without discarding the draft', () => {
  const scene = sceneOf()
  const props = { cabinet: own, scene, onApply: () => true }
  const view = render(<CabinetPlacementEditor {...props} />)
  field('Placement X', '100')
  fireEvent.click(button('Preview cabinet placement'))
  view.rerender(<CabinetPlacementEditor {...props} scene={{ ...scene, parts: [...scene.parts] }} />)
  expect(screen.getByRole('region', { name: 'Cabinet placement preview' })).toBeTruthy()
  const changed = {
    ...scene,
    components: [own, { ...other, params: { ...other.params, width: 700 } }],
  }
  view.rerender(<CabinetPlacementEditor {...props} scene={changed} />)
  expect(screen.queryByRole('region', { name: 'Cabinet placement preview' })).toBeNull()
  expect(screen.getByLabelText('Placement X')).toHaveProperty('value', '100')
  expect(button('Preview cabinet placement').hasAttribute('disabled')).toBe(true)
  fireEvent.click(button('Reset placement draft'))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByLabelText('Placement X')).toHaveProperty('value', '0')
})
it('reports a rejected apply without claiming success', () => {
  const apply = vi.fn(() => false)
  render(<CabinetPlacementEditor cabinet={own} scene={sceneOf()} onApply={apply} />)
  field('Placement X', '100')
  fireEvent.click(button('Preview cabinet placement'))
  fireEvent.click(button('Apply cabinet placement'))
  expect(screen.getByRole('alert').textContent).toContain('changed after preview')
})
