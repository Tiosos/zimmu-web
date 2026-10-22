import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { motionScene } from '../scene/__fixtures__/motion'
import { interiorsScene } from '../scene/__fixtures__/interiors'
import { applianceOpenings } from '../scene/applianceBays'
import { defaultApplianceBay } from '../scene/applianceRecipe'
import type { AppliancePreview } from '../scene/applianceBays'
import type { CarcaseComponent } from '../scene/types'
import { CabinetApplianceEditor } from './CabinetApplianceEditor'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
function open(scene = motionScene()) {
  const cabinet = scene.components.find(
      (c): c is CarcaseComponent => c.id === 'cab' && c.kind === 'carcase',
    )!,
    onApply = vi.fn<(p: AppliancePreview) => boolean>(() => true),
    props = { scene, cabinet, onApply }
  return { ...render(<CabinetApplianceEditor {...props} />), props, onApply }
}
it('previews dimensions and three fit views, then saves explicitly', () => {
  const view = open()
  field('Bay name', 'Compact oven')
  field('Appliance category', 'Oven')
  field('Appliance width', '400')
  field('Left clearance', '10')
  field('Right clearance', '15')
  field('Mounting elevation', '20')
  click('Preview appliance bay')
  expect(screen.getByRole('table', { name: 'Appliance opening fit' }).textContent).toContain(
    '425.0',
  )
  for (const view of ['Front', 'Top', 'End'])
    expect(screen.getByRole('img', { name: `${view} appliance fit` })).toBeTruthy()
  expect(view.onApply).not.toHaveBeenCalled()
  click('Save appliance bay')
  expect(view.onApply.mock.calls[0][0].bay).toMatchObject({
    label: 'Compact oven',
    category: 'Oven',
    width: 400,
    left: 10,
    right: 15,
    elevation: 20,
  })
})
it('reports fit issues without automatically modifying or rejecting a planning bay', () => {
  const view = open()
  field('Appliance width', '1000')
  click('Preview appliance bay')
  expect(screen.getByText('Needs fit review')).toBeTruthy()
  expect(screen.getByRole('list', { name: 'Appliance fit issues' }).textContent).toContain('width')
  expect(screen.getByRole('button', { name: 'Save appliance bay' })).toHaveProperty(
    'disabled',
    false,
  )
  expect(view.onApply).not.toHaveBeenCalled()
})
it('rejects blank dimensions and invalidates previews on edits or source changes', () => {
  const view = open()
  field('Appliance width', '')
  click('Preview appliance bay')
  expect(screen.getByRole('alert').textContent).toContain('finite')
  expect(screen.getByRole('button', { name: 'Save appliance bay' })).toHaveProperty(
    'disabled',
    true,
  )
  field('Appliance width', '300')
  expect(screen.queryByRole('region', { name: 'Appliance bay preview' })).toBeNull()
  click('Preview appliance bay')
  const scene = structuredClone(view.props.scene)
  const cabinet = scene.components.find((c) => c.kind === 'carcase')!
  if (cabinet.kind === 'carcase') cabinet.params.width += 10
  view.rerender(<CabinetApplianceEditor {...view.props} scene={scene} />)
  expect(screen.getByRole('alert').textContent).toContain('scene changed')
  expect(screen.getByRole('button', { name: 'Save appliance bay' })).toHaveProperty(
    'disabled',
    true,
  )
  click('Reset appliance draft')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(view.onApply).not.toHaveBeenCalled()
})
it('copies specifications into a different opening, edits saved bays and stages removal', () => {
  const scene = interiorsScene(true),
    openings = applianceOpenings(scene, 'cab')
  scene.applianceBays = [
    { ...defaultApplianceBay('saved', 'cab', openings[0].id), label: 'Microwave', width: 200 },
  ]
  const view = open(scene)
  field('Appliance opening', openings[1].id)
  field('Copy appliance specifications from', 'saved')
  click('Copy appliance specifications')
  expect(screen.getByLabelText('Appliance width')).toHaveProperty('value', '200')
  click('Preview appliance bay')
  expect(screen.getByRole('button', { name: 'Save appliance bay' })).toHaveProperty(
    'disabled',
    false,
  )
  click('Edit Microwave')
  expect(screen.getByLabelText('Bay name')).toHaveProperty('value', 'Microwave')
  click('Remove Microwave')
  click('Remove appliance bay')
  expect(view.onApply.mock.calls[0][0].action).toBe('delete')
})
it('shows missing opening references and cancels without writing', () => {
  const scene = motionScene()
  scene.applianceBays = [defaultApplianceBay('saved', 'cab', 'missing')]
  const view = open(scene)
  expect(screen.getByRole('list', { name: 'Saved appliance bays' }).textContent).toContain(
    'no longer available',
  )
  click('Edit Appliance bay')
  expect(screen.getByRole('option', { name: 'Unavailable saved opening' })).toBeTruthy()
  click('Cancel appliance changes')
  expect(view.onApply).not.toHaveBeenCalled()
})
it('handles declined acceptance without losing the current source', () => {
  const view = open()
  view.onApply.mockReturnValue(false)
  click('Preview appliance bay')
  click('Save appliance bay')
  expect(screen.getByRole('alert').textContent).toContain('could not apply')
})
