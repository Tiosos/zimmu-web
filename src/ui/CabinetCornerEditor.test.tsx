import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { cornerScene } from '../scene/__fixtures__/corners'
import { acceptCorner, cornerDraft, previewCorner, type CornerPreview } from '../scene/cornerPanels'
import type { CarcaseComponent } from '../scene/types'
import { CabinetCornerEditor } from './CabinetCornerEditor'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
function open(scene = cornerScene()) {
  const onApply = vi.fn<(p: CornerPreview) => boolean>(() => true),
    cabinet = scene.components[0] as CarcaseComponent
  const props = { scene, cabinet, onApply }
  return { ...render(<CabinetCornerEditor {...props} />), props, onApply }
}
it('stages a corner, shows real board sizes and joint plan, and applies once', () => {
  const view = open()
  click('Reset corner draft')
  fireEvent.click(screen.getByLabelText('Leg 2: Return'))
  field('Assembly name', 'Kitchen corner')
  field('Joint clearance', '2')
  click('Preview corner assembly')
  expect(screen.getByRole('table', { name: 'Corner board dimensions' }).textContent).toContain(
    '1238.00',
  )
  expect(screen.getByRole('img', { name: 'Corner joint plan preview' })).toBeTruthy()
  expect(view.onApply).not.toHaveBeenCalled()
  click('Apply corner assembly')
  expect(view.onApply).toHaveBeenCalledTimes(1)
  expect(view.onApply.mock.calls[0][0].draft.label).toBe('Kitchen corner')
})
it('rejects blank clearance, invalidates preview on draft edits, and resets without writes', () => {
  const view = open()
  fireEvent.click(screen.getByLabelText('Leg 2: Return'))
  field('Joint clearance', '')
  click('Preview corner assembly')
  expect(screen.getByRole('alert').textContent).toContain('clearance')
  expect(screen.getByRole('button', { name: 'Apply corner assembly' })).toHaveProperty(
    'disabled',
    true,
  )
  field('Joint clearance', '0')
  click('Preview corner assembly')
  field('Leg 1 grain', 'free')
  expect(screen.queryByRole('region', { name: 'Corner assembly preview' })).toBeNull()
  click('Cancel corner changes')
  expect(view.onApply).not.toHaveBeenCalled()
})
it('blocks stale previews and recovers after reset', () => {
  const view = open()
  fireEvent.click(screen.getByLabelText('Leg 2: Return'))
  click('Preview corner assembly')
  const scene = structuredClone(view.props.scene)
  scene.parts[0].label = 'Changed elsewhere'
  view.rerender(<CabinetCornerEditor {...view.props} scene={scene} />)
  expect(screen.getByRole('alert').textContent).toContain('project changed')
  expect(screen.getByRole('button', { name: 'Apply corner assembly' })).toHaveProperty(
    'disabled',
    true,
  )
  click('Reset corner draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('edits saved assemblies and requests entire-group detach/delete', () => {
  const scene = cornerScene(),
    d = cornerDraft(scene, 'a')
  d.legs[1].run.memberIds = ['b']
  d.label = 'Saved corner'
  const saved = acceptCorner(scene, previewCorner(scene, d), 'saved')!
  const view = open(saved)
  click('Edit Saved corner')
  expect(screen.getByLabelText('Assembly name')).toHaveProperty('value', 'Saved corner')
  click('Preview corner assembly')
  expect(screen.getByText('No changes to save.')).toBeTruthy()
  click('Detach Saved corner')
  expect(view.onApply.mock.calls[0][0]).toMatchObject({ targetId: 'saved', action: 'detach' })
  click('Delete Saved corner')
  expect(view.onApply.mock.calls[1][0]).toMatchObject({ targetId: 'saved', action: 'delete' })
})
it('stages plinth and splashback end returns without writing until apply', () => {
  const view = open()
  field('Corner profile', 'plinth')
  fireEvent.click(screen.getByLabelText('Leg 2: Return'))
  fireEvent.click(screen.getByText('Add exposed end return for leg 1').querySelector('input')!)
  click('Preview corner assembly')
  expect(
    screen.getByRole('table', { name: 'Corner board dimensions' }).querySelectorAll('tbody tr'),
  ).toHaveLength(3)
  field('Corner profile', 'splashback')
  click('Preview corner assembly')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(view.onApply).not.toHaveBeenCalled()
})

it('finds and selects a compatible corner run pair', () => {
  open()
  click('Find corner runs')
  click('Use corner with Return')
  expect(screen.getByLabelText('Leg 2: Return')).toHaveProperty('checked', true)
  click('Preview corner assembly')
  expect(screen.queryByRole('alert')).toBeNull()
})
