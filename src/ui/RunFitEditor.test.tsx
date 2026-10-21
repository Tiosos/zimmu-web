import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { RunFitEditor } from './RunFitEditor'
import { CabinetLayoutWorkspace } from './CabinetLayoutWorkspace'
import type { RunFitPreview } from '../scene/runFit'
import type { CarcaseComponent, Scene } from '../scene/types'
afterEach(cleanup)
const sceneOf = (): Scene => ({
  components: ['a', 'b'].map((id, i) => ({
    ...structuredClone(cabinet),
    id,
    label: id.toUpperCase(),
    position: { x: i * 900, y: 0, z: 0 },
  })),
  parts: [],
  materials: PRESET_MATERIALS,
  joints: [],
  hardware: [],
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function open() {
  const scene = sceneOf(),
    onApply = vi.fn<(preview: RunFitPreview) => boolean>(() => true)
  const props = { cabinet: scene.components[0] as CarcaseComponent, scene, onApply }
  return { ...render(<RunFitEditor {...props} />), props, onApply }
}
const select = () => fireEvent.click(screen.getByLabelText('Fit B (b)'))
it('stages fit without writes and applies only after an explicit valid preview', () => {
  const view = open()
  expect(screen.getByRole('button', { name: 'Preview run fit' })).toHaveProperty('disabled', true)
  select()
  field('Target span', '1800')
  click('Preview run fit')
  expect(screen.getByRole('table').textContent).toContain('900')
  expect(view.onApply).not.toHaveBeenCalled()
  click('Apply run fit')
  expect(view.onApply).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('region', { name: 'Run fit preview' })).toBeNull()
})
it('supports fixed/min/max, allocation, direction, axis and reserves, clearing previous previews', () => {
  open()
  select()
  field('Target span', '1885')
  field('Start reserve', '50')
  field('End reserve', '25')
  field('Cabinet gap', '10')
  field('Maximum width 1', '700')
  click('Preview run fit')
  expect(screen.getByRole('table').textContent).toContain('1100')
  fireEvent.click(screen.getByLabelText('Keep width 1'))
  expect(screen.getByLabelText('Minimum width 1')).toHaveProperty('disabled', true)
  expect(screen.queryByRole('region', { name: 'Run fit preview' })).toBeNull()
  field('Fit width allocation', 'proportional')
  field('Fit run direction', '-1')
  click('Preview run fit')
  expect(screen.getByRole('table').textContent).toContain('1200')
  field('Fit run axis', 'y')
  click('Preview run fit')
  expect(screen.getByRole('alert').textContent).toContain('run axis')
  expect(screen.getByRole('button', { name: 'Apply run fit' })).toHaveProperty('disabled', true)
})
it('orders cabinets earlier/later/reverse and updates the reference', () => {
  const view = open()
  select()
  field('Target span', '1800')
  click('Later fit cabinet 1')
  click('Preview run fit')
  expect(view.onApply).not.toHaveBeenCalled()
  const rows = screen.getByRole('table').querySelectorAll('tbody tr')
  expect(rows[0].textContent).toContain('B')
  click('Earlier fit cabinet 2')
  click('Reverse fit order')
  click('Preview run fit')
  click('Apply run fit')
  expect(view.onApply.mock.calls[0][0].draft.entries.map((e: { id: string }) => e.id)).toEqual([
    'b',
    'a',
  ])
})
it('shows invalid targets/constraints and supports reset and cancel without model writes', () => {
  const view = open()
  select()
  field('Target span', '')
  click('Preview run fit')
  expect(screen.getByRole('alert').textContent).toContain('finite')
  click('Reset run fit')
  expect(screen.getByLabelText('Target span')).toHaveProperty('value', '2400')
  expect(screen.getByRole('button', { name: 'Preview run fit' })).toHaveProperty('disabled', true)
  select()
  field('Minimum width 1', '2000')
  field('Minimum width 2', '2000')
  click('Preview run fit')
  expect(screen.getByRole('alert').textContent).toContain('cannot fit')
  click('Cancel run fit')
  expect(view.onApply).not.toHaveBeenCalled()
})
it('invalidates external geometry changes and cabinet switches but preserves a mesh-only refresh', () => {
  const view = open()
  select()
  field('Target span', '1800')
  click('Preview run fit')
  view.rerender(
    <RunFitEditor
      {...view.props}
      scene={{ ...view.props.scene, parts: [...view.props.scene.parts] }}
    />,
  )
  expect(screen.getByRole('region', { name: 'Run fit preview' })).toBeTruthy()
  view.rerender(
    <RunFitEditor {...view.props} cabinet={view.props.scene.components[1] as CarcaseComponent} />,
  )
  expect(screen.queryByRole('region', { name: 'Run fit preview' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Preview run fit' })).toHaveProperty('disabled', true)
  click('Reset run fit')
  select()
  view.rerender(
    <RunFitEditor
      {...view.props}
      scene={{
        ...view.props.scene,
        materials: { ...view.props.scene.materials, New: { thickness: 12 } },
      }}
    />,
  )
  expect(screen.getByRole('alert').textContent).toContain('scene changed')
})
it('reports callback rejection and unchanged fitting', () => {
  const view = open()
  view.onApply.mockReturnValue(false)
  select()
  field('Target span', '1800')
  click('Preview run fit')
  click('Apply run fit')
  expect(screen.getByRole('alert').textContent).toContain('could not be applied')
  const arranged = {
    ...view.props.scene,
    components: view.props.scene.components.map((c, i) => ({
      ...c,
      position: { x: i * 600, y: 0, z: 0 },
    })),
  }
  view.rerender(<RunFitEditor {...view.props} scene={arranged} />)
  click('Reset run fit')
  select()
  field('Target span', '1200')
  click('Preview run fit')
  expect(screen.getByRole('button', { name: 'Apply run fit' })).toHaveProperty('disabled', true)
  expect(screen.getByText('No run changes proposed.')).toBeTruthy()
})
it('keeps existing Layout default and exposes fit only with its callback', () => {
  const scene = sceneOf()
  const props = {
    cabinet: scene.components[0] as CarcaseComponent,
    scene,
    onApply: vi.fn(() => true),
  }
  const view = render(<CabinetLayoutWorkspace {...props} />)
  expect(screen.getByRole('region', { name: 'Multi-cabinet layout editor' })).toBeTruthy()
  view.rerender(<CabinetLayoutWorkspace {...props} onFit={vi.fn(() => true)} />)
  field('Layout workspace', 'fit')
  expect(screen.getByRole('region', { name: 'Fit cabinet run' })).toBeTruthy()
})
