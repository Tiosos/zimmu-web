import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OpeningMotionWorkspace } from './OpeningMotionWorkspace'
import type { OpeningPreview } from '../scene/openingMotion'
import { motionScene } from '../scene/__fixtures__/motion'
import { defaultProject } from '../scene/projectStructure'
import { openingTargets, defaultOpeningSetting } from '../scene/openingMotion'
import { defaultOpeningMotion } from '../scene/openingMotionRecipe'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const mount = (kind: 'door' | 'drawer' | 'pair' = 'door') => {
  const scene = motionScene(kind),
    project = defaultProject(scene, 'Motion'),
    apply = vi.fn((_: OpeningPreview) => true),
    transient = vi.fn(),
    close = vi.fn(),
    undo = vi.fn(),
    redo = vi.fn()
  const props = {
    scene,
    project,
    onApply: apply,
    onTransient: transient,
    onClose: close,
    onUndo: undo,
    onRedo: redo,
    canUndo: true,
    canRedo: true,
  }
  return {
    ...render(<OpeningMotionWorkspace {...props} />),
    ...props,
    props,
    apply,
    transient,
    close,
    undo,
    redo,
  }
}
it('stages selected settings, previews opening, and applies only settings explicitly', () => {
  const f = mount(),
    before = JSON.stringify(f.scene)
  expect(
    (screen.getByRole('button', { name: 'Apply motion settings' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  click('Select supported fronts')
  field('Maximum opening', '110')
  field('Hinge axis offset', '5')
  click('Stage selected opening settings')
  expect(f.apply).not.toHaveBeenCalled()
  expect(screen.getByText('Maximum 110°; offset 5 mm')).toBeTruthy()
  click('Open selected')
  expect(screen.getByText('Current 110.0°')).toBeTruthy()
  expect(f.transient.mock.lastCall![0].matrices.size).toBe(1)
  expect(screen.getByRole('img', { name: 'Plan opening motion' })).toBeTruthy()
  expect(screen.getByRole('img', { name: 'Elevation opening motion' })).toBeTruthy()
  click('Apply motion settings')
  expect(f.apply).toHaveBeenCalledOnce()
  expect(f.apply.mock.calls[0][0].settings.entries[0].limit).toBe(110)
  expect(JSON.stringify(f.scene)).toBe(before)
})
it('rejects blank/invalid fields and cancels staged changes without applying', () => {
  const f = mount()
  click('Select supported fronts')
  field('Maximum opening', '')
  click('Stage selected opening settings')
  expect(screen.getByRole('status').textContent).toContain('angle')
  field('Maximum opening', '100')
  click('Stage selected opening settings')
  field('Operating clearance', '')
  expect(
    (screen.getByRole('button', { name: 'Apply motion settings' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(
    screen
      .getAllByRole('alert')
      .map((e) => e.textContent)
      .join(' '),
  ).toContain('finite')
  click('Cancel motion changes')
  expect(
    (screen.getByRole('button', { name: 'Apply motion settings' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(f.apply).not.toHaveBeenCalled()
})
it('clears transient poses and disables editing when the project changes', () => {
  const f = mount()
  click('Select supported fronts')
  click('Open selected')
  const project = structuredClone(f.project)
  project.areas[0].name = 'Changed'
  f.rerender(<OpeningMotionWorkspace {...f.props} project={project} />)
  expect(screen.getByRole('alert').textContent).toContain('changed')
  expect(
    (
      screen
        .getByRole('button', { name: 'Stage selected opening settings' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(true)
  expect(f.transient.mock.lastCall![0].matrices.size).toBe(0)
  click('Reset motion draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('animates, pauses, resumes and releases transient matrices on unmount', () => {
  vi.useFakeTimers()
  const f = mount()
  click('Select supported fronts')
  click('Animate opening')
  act(() => vi.advanceTimersByTime(50))
  expect(screen.queryByText('Current 2.3°')).toBeTruthy()
  click('Pause motion')
  act(() => vi.advanceTimersByTime(500))
  expect(screen.queryByText('Current 2.3°')).toBeTruthy()
  click('Resume motion')
  act(() => vi.advanceTimersByTime(50))
  expect(screen.getByText('Current 4.5°')).toBeTruthy()
  click('Reset all closed')
  expect(screen.getByText('Current 0.0°')).toBeTruthy()
  f.unmount()
  expect(f.transient.mock.lastCall![0]).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})
it('shows drawer nominal context, moves all six parts and rejects excessive travel', () => {
  const f = mount('drawer'),
    t = openingTargets(f.scene)[0]
  click('Select supported fronts')
  field('Maximum opening', String(t.maximumTravel + 1))
  click('Stage selected opening settings')
  expect(screen.getByRole('status').textContent).toContain('exceeds')
  field('Maximum opening', '100')
  click('Stage selected opening settings')
  click('Open selected')
  expect(screen.getByText('Current 100.0 mm')).toBeTruthy()
  expect(screen.getByText(/runner\/box nominal/)).toBeTruthy()
  expect(f.transient.mock.lastCall![0].matrices.size).toBe(6)
})
it('supports independent leaves, per-front progress, filtering and history controls', () => {
  const f = mount('pair'),
    targets = openingTargets(f.scene)
  click(`Load motion ${targets[0].label}`)
  field(`Opening fraction ${targets[0].label}`, '.5')
  expect(screen.getByText('Current 45.0°')).toBeTruthy()
  expect(screen.getByText('Current 0.0°')).toBeTruthy()
  click('Undo motion change')
  click('Redo motion change')
  expect(f.undo).toHaveBeenCalledOnce()
  expect(f.redo).toHaveBeenCalledOnce()
  field('Motion cabinet', 'cab')
  expect(f.transient.mock.lastCall![0].matrices.size).toBe(0)
  click('Close motion')
  expect(f.close).toHaveBeenCalledOnce()
})
it('links findings to affected fronts and highlights actual board IDs', () => {
  const f = mount(),
    t = openingTargets(f.scene)[0]
  field('Operating clearance', '50')
  click('Select supported fronts')
  click('Check opening paths')
  expect(screen.getByRole('status').textContent).toContain('potential conflicts')
  const finding = screen
    .getAllByRole('button')
    .find((b) => b.textContent?.includes('may interfere'))!
  expect(finding).toBeDefined()
  fireEvent.click(finding)
  expect(f.transient.mock.lastCall![0].highlightedIds).toContain(t.id)
})
it('retains and explicitly removes missing saved references', () => {
  const scene = motionScene(),
    project = defaultProject(scene, 'Saved')
  scene.openingMotion = {
    ...defaultOpeningMotion(),
    entries: [{ ...defaultOpeningSetting(openingTargets(scene)[0]), frontId: 'gone' }],
  }
  const apply = vi.fn()
  render(
    <OpeningMotionWorkspace
      scene={scene}
      project={project}
      onApply={apply}
      onTransient={() => {}}
      onClose={() => {}}
      onUndo={() => {}}
      onRedo={() => {}}
      canUndo={false}
      canRedo={false}
    />,
  )
  expect(screen.getByText(/Some saved fronts/)).toBeTruthy()
  click('Remove setting gone')
  expect(screen.queryByText(/Some saved fronts/)).toBeNull()
  click('Apply motion settings')
  expect(apply.mock.calls[0][0].settings.entries).toEqual([])
})
