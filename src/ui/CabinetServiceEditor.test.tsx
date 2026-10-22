import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { motionScene } from '../scene/__fixtures__/motion'
import { defaultServiceFeature } from '../scene/serviceRecipe'
import type { ServicePreview } from '../scene/serviceMachining'
import type { BoardPart, CarcaseComponent } from '../scene/types'
import { CabinetServiceEditor } from './CabinetServiceEditor'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
function open() {
  const scene = motionScene(),
    cabinet = scene.components.find(
      (c): c is CarcaseComponent => c.id === 'cab' && c.kind === 'carcase',
    )!,
    onApply = vi.fn<(p: ServicePreview) => boolean>(() => true),
    props = { scene, cabinet, onApply }
  const view = render(<CabinetServiceEditor {...props} />)
  const back = scene.parts.find((p): p is BoardPart => p.kind === 'board' && p.role === 'back')!
  field('Service panel', back.id)
  return { ...view, props, onApply, back }
}
it('stages a circular hole, previews actual panel cuts and applies explicitly', () => {
  const view = open()
  field('Service feature name', 'Cable access')
  click('Stage service feature')
  expect(view.onApply).not.toHaveBeenCalled()
  click('Preview service openings')
  expect(screen.getByRole('table', { name: 'Resolved service openings' }).textContent).toContain(
    'Cable access',
  )
  expect(screen.getByRole('img', { name: 'Service panel machining preview' })).toBeTruthy()
  click('Apply service openings')
  expect(view.onApply).toHaveBeenCalledTimes(1)
  expect(
    view.onApply.mock.calls[0][0]
      .scene!.parts.find((p) => p.id === view.back.id)
      ?.cuts.some((c) => c.id.startsWith('sm_')),
  ).toBe(true)
})
it('stages repeated slots and face/depth choices with exact resolved counts', () => {
  open()
  click('New service cut-out / slot')
  field('Opening width', '10')
  field('Repeat count', '3')
  field('Repeat pitch', '15')
  field('Machining face', '-Z')
  field('Service depth mode', 'blind')
  field('Blind recess depth', '3')
  click('Stage service feature')
  click('Preview service openings')
  expect(
    screen.getByRole('table', { name: 'Resolved service openings' }).querySelectorAll('tbody tr'),
  ).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Apply service openings' })).toHaveProperty(
    'disabled',
    false,
  )
})
it('rejects invalid repeats and cut clearances, and field edits invalidate previews', () => {
  open()
  field('Repeat count', '100')
  click('Stage service feature')
  expect(screen.getByRole('alert').textContent).toContain('1–32')
  field('Repeat count', '1')
  field('X position reference', 'left')
  field('X centre offset', '1')
  click('Stage service feature')
  click('Preview service openings')
  expect(screen.getByRole('alert').textContent).toContain('clearance')
  expect(screen.getByRole('button', { name: 'Apply service openings' })).toHaveProperty(
    'disabled',
    true,
  )
  field('X centre offset', '50')
  expect(screen.queryByRole('region', { name: 'Service openings preview' })).toBeNull()
})
it('duplicates and edits feature drafts, removes them and cancels without writes', () => {
  const view = open()
  field('Service feature name', 'Access')
  click('Stage service feature')
  click('Duplicate Access')
  field('X centre offset', '100')
  click('Stage service feature')
  expect(
    screen.getByRole('list', { name: 'Staged service features' }).querySelectorAll('li'),
  ).toHaveLength(2)
  click('Edit Access copy')
  field('Hole diameter', '20')
  click('Stage service feature')
  click('Remove Access')
  expect(
    screen.getByRole('list', { name: 'Staged service features' }).querySelectorAll('li'),
  ).toHaveLength(1)
  click('Clear service features')
  click('Cancel service changes')
  expect(view.onApply).not.toHaveBeenCalled()
})
it('blocks stale previews and reloads the current panel on reset', () => {
  const view = open()
  click('Stage service feature')
  click('Preview service openings')
  const scene = structuredClone(view.props.scene)
  scene.parts.find((p) => p.id === view.back.id)!.label = 'Edited back'
  view.rerender(<CabinetServiceEditor {...view.props} scene={scene} />)
  expect(screen.getByRole('alert').textContent).toContain('scene changed')
  expect(screen.getByRole('button', { name: 'Apply service openings' })).toHaveProperty(
    'disabled',
    true,
  )
  click('Reset service draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('reports broken bay associations and allows clearing the saved service recipe', () => {
  const view = open(),
    scene = structuredClone(view.props.scene)
  const back = scene.parts.find((p) => p.id === view.back.id) as BoardPart
  back.serviceMachining = {
    version: 1,
    features: [{ ...defaultServiceFeature('lost'), bayId: 'missing' }],
  }
  view.rerender(<CabinetServiceEditor {...view.props} scene={scene} />)
  click('Reset service draft')
  expect(screen.getByRole('alert').textContent).toContain('no longer exists')
  click('Edit Cable / pipe hole')
  expect(screen.getByRole('option', { name: 'Unavailable saved bay' })).toBeTruthy()
  click('Clear service features')
  click('Preview service openings')
  click('Apply service openings')
  expect(view.onApply).toHaveBeenCalledTimes(1)
  expect(view.onApply.mock.calls[0][0].recipe.features).toEqual([])
})
