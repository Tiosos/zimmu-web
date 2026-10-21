import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WorktopMachiningEditor } from './WorktopMachiningEditor'
import { CabinetFinishingWorkspace } from './CabinetFinishingWorkspace'
import { worktopScene } from '../scene/__fixtures__/worktop'
import { defaultWorktopFeature } from '../scene/worktopMachiningRecipe'
import {
  acceptWorktopMachining,
  previewWorktopMachining,
  type WorktopMachiningPreview,
} from '../scene/worktopMachining'
import type { BoardPart, CarcaseComponent, Scene } from '../scene/types'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const mount = (s = worktopScene(), apply = vi.fn((_: WorktopMachiningPreview) => true)) =>
  render(
    <WorktopMachiningEditor
      cabinet={s.components[0] as CarcaseComponent}
      scene={s}
      onApply={apply}
    />,
  )
it('exposes machining under Finishing without changing the default mode', () => {
  const s = worktopScene()
  render(
    <CabinetFinishingWorkspace
      cabinet={s.components[0] as CarcaseComponent}
      scene={s}
      onApply={() => true}
      onApplyMachining={() => true}
    />,
  )
  expect(screen.getByRole('region', { name: 'Cabinet finishing editor' })).toBeTruthy()
  click('Worktop machining')
  expect(screen.getByRole('region', { name: 'Worktop machining editor' })).toBeTruthy()
})
it('stages a real sink opening, previews three views and only applies explicitly', () => {
  const apply = vi.fn((_: WorktopMachiningPreview) => true)
  mount(worktopScene(), apply)
  click('Add sink starter')
  field('Worktop feature name', 'Island sink')
  click('Preview worktop machining')
  expect(screen.getByRole('region', { name: 'Worktop machining preview' }).textContent).toContain(
    '500.00 × 400.00',
  )
  for (const view of ['Front', 'Top', 'End'])
    expect(
      screen.getByRole('region', { name: `Machining ${view} preview` }).querySelector('svg'),
    ).not.toBeNull()
  expect(apply).not.toHaveBeenCalled()
  click('Apply worktop machining')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(apply.mock.lastCall![0].recipe.features[0].label).toBe('Island sink')
})
it('supports circle and blind controls, references, offsets and dimensions', () => {
  mount()
  click('Add circular feature')
  field('Worktop feature depth mode', 'blind')
  field('Feature depth', '12')
  field('Feature diameter', '50')
  field('Worktop feature X reference', 'right')
  field('Feature X offset', '100')
  field('Worktop feature Y reference', 'rear')
  field('Feature Y offset', '100')
  click('Preview worktop machining')
  expect(screen.getByRole('region', { name: 'Worktop machining preview' }).textContent).toContain(
    'centre X 1100.00, Y 500.00',
  )
  expect(screen.getByRole('region', { name: 'Worktop machining preview' }).textContent).toContain(
    'depth 12.00',
  )
})
it('duplicates, detects overlap, removes and cancels without committing', () => {
  const apply = vi.fn((_: WorktopMachiningPreview) => true)
  mount(worktopScene(), apply)
  click('Add rectangular feature')
  click('Duplicate feature')
  click('Preview worktop machining')
  expect(screen.getAllByRole('alert').some((e) => e.textContent?.includes('Overlaps'))).toBe(true)
  expect(
    screen.getByRole('button', { name: 'Apply worktop machining' }).hasAttribute('disabled'),
  ).toBe(true)
  click('Remove feature')
  click('Preview worktop machining')
  expect(screen.queryByRole('alert')).toBeNull()
  click('Cancel machining changes')
  expect(screen.queryByRole('region', { name: 'Worktop machining preview' })).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})
it('reloads saved IDs and removes invalid resized features', () => {
  const s = worktopScene(),
    f = defaultWorktopFeature('saved'),
    next = acceptWorktopMachining(
      s,
      previewWorktopMachining(s, 'top', { version: 1, features: [f] }),
    )!
  const resized = next.parts[0] as BoardPart
  resized.width = 50
  const apply = vi.fn((_: WorktopMachiningPreview) => true)
  mount(next, apply)
  expect(screen.getByRole('alert').textContent).toContain('clearance')
  click('Rectangular opening')
  click('Remove feature')
  click('Preview worktop machining')
  click('Apply worktop machining')
  expect(apply.mock.lastCall![0].recipe.features).toEqual([])
})
it('invalidates stale previews and recovers by reset', () => {
  const s = worktopScene(),
    apply = vi.fn(),
    c = s.components[0] as CarcaseComponent,
    view = mount(s, apply)
  click('Add hob starter')
  click('Preview worktop machining')
  const changed: Scene = { ...s, materials: { ...s.materials, Other: { thickness: 20 } } }
  view.rerender(<WorktopMachiningEditor cabinet={c} scene={changed} onApply={apply} />)
  expect(screen.queryByRole('region', { name: 'Worktop machining preview' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('project changed')
  click('Reset machining draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('reports rejected application and allows a new preview', () => {
  mount(
    worktopScene(),
    vi.fn(() => false),
  )
  click('Add rectangular feature')
  click('Preview worktop machining')
  click('Apply worktop machining')
  expect(screen.getByRole('status').textContent).toContain('changed after preview')
  expect(screen.queryByRole('region', { name: 'Worktop machining preview' })).toBeNull()
})
