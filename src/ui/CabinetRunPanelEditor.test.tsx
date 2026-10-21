import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { runPanelScene } from '../scene/__fixtures__/runPanels'
import { CabinetRunPanelEditor } from './CabinetRunPanelEditor'
import { CabinetFinishingWorkspace } from './CabinetFinishingWorkspace'
import {
  acceptRunWorktop,
  previewRunWorktop,
  runPanelDraft,
  type RunWorktopPreview,
} from '../scene/runWorktops'
import type { CarcaseComponent } from '../scene/types'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
function open() {
  const scene = runPanelScene(),
    cabinet = scene.components[0] as CarcaseComponent,
    onApply = vi.fn<(p: RunWorktopPreview) => boolean>(() => true),
    props = { scene, cabinet, onApply }
  return { ...render(<CabinetRunPanelEditor {...props} />), props, onApply }
}
const select = () => fireEvent.click(screen.getByLabelText('Panel member Right cabinet (b)'))
it('previews a real plinth and applies only after explicit confirmation', () => {
  const view = open()
  select()
  field('Left run extension', '10')
  field('Right run extension', '20')
  field('Plinth bottom clearance', '5')
  click('Preview run panel')
  expect(screen.getByRole('region', { name: 'Run panel preview' }).textContent).toContain(
    '95 × 1230 × 18 mm',
  )
  expect(view.onApply).not.toHaveBeenCalled()
  click('Add run panel')
  expect(view.onApply).toHaveBeenCalledTimes(1)
  expect(view.onApply.mock.calls[0][0].part!.runWorktop!.version).toBe(2)
})
it('switches to splashback with explicit height, gap, material/thickness and grain', () => {
  open()
  field('Run panel type', 'splashback')
  select()
  field('Run panel height', '150')
  field('Splashback top clearance', '10')
  field('Splashback rear clearance', '8')
  field('Run panel thickness mode', 'custom')
  field('Run panel custom thickness', '24')
  field('Run panel grain', 'length')
  field('Run panel name', 'Kitchen splash')
  click('Preview run panel')
  expect(screen.getByRole('region', { name: 'Run panel preview' }).textContent).toContain(
    '150 × 1200 × 24 mm',
  )
  expect(screen.getByRole('region', { name: 'Run panel preview' }).textContent).toContain(
    'Kitchen splash',
  )
})
it('supports custom plinth height, validates impossible settings and cancels without writes', () => {
  const view = open()
  select()
  field('Run panel height mode', 'custom')
  field('Run panel height', '101')
  click('Preview run panel')
  expect(screen.getByRole('alert').textContent).toContain('toe kick')
  expect(screen.getByRole('button', { name: 'Add run panel' })).toHaveProperty('disabled', true)
  click('Cancel run panel changes')
  expect(view.onApply).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Run panel height mode')).toHaveProperty('value', 'toe-kick')
})
it('clears edited previews and requires reset after cabinet or material changes, not mesh updates', () => {
  const view = open()
  select()
  click('Preview run panel')
  field('Run panel name', 'Changed')
  expect(screen.queryByRole('region', { name: 'Run panel preview' })).toBeNull()
  click('Preview run panel')
  view.rerender(
    <CabinetRunPanelEditor
      {...view.props}
      scene={{ ...view.props.scene, parts: [...view.props.scene.parts] }}
    />,
  )
  expect(screen.getByRole('region', { name: 'Run panel preview' })).toBeTruthy()
  view.rerender(
    <CabinetRunPanelEditor
      {...view.props}
      cabinet={view.props.scene.components[1] as CarcaseComponent}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Run panel preview' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Preview run panel' })).toHaveProperty('disabled', true)
})
it('loads stable linked recipes for edit and sends profile-specific detach/delete requests', () => {
  const scene = runPanelScene(),
    d = { ...runPanelDraft(scene, 'a'), memberIds: ['a', 'b'] },
    added = acceptRunWorktop(scene, previewRunWorktop(scene, d), 'panel')!,
    onApply = vi.fn<(p: RunWorktopPreview) => boolean>(() => true)
  render(
    <CabinetRunPanelEditor
      scene={added}
      cabinet={added.components[0] as CarcaseComponent}
      onApply={onApply}
    />,
  )
  click('Edit linked run panel')
  field('Run panel name', 'Renamed')
  click('Preview run panel')
  click('Save run panel')
  expect(onApply.mock.calls[0][0].targetId).toBe('panel')
  click('Detach linked run panel')
  expect(onApply.mock.calls.at(-1)![0].action).toBe('detach')
  click('Delete linked run panel')
  expect(onApply.mock.calls.at(-1)![0].action).toBe('delete')
})
it('offers the new finishing workspace and preserves the single-cabinet default', () => {
  const scene = runPanelScene(),
    onApply = vi.fn(() => true)
  render(
    <CabinetFinishingWorkspace
      scene={scene}
      cabinet={scene.components[0] as CarcaseComponent}
      onApply={onApply}
      onApplyRun={onApply}
    />,
  )
  expect(
    screen.getByRole('button', { name: 'Single-cabinet panels' }).getAttribute('aria-pressed'),
  ).toBe('true')
  click('Run plinths & splashbacks')
  expect(screen.getByRole('region', { name: 'Run finishing panels editor' })).toBeTruthy()
})
