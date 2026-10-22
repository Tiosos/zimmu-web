import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GrainMatchWorkspace } from './GrainMatchWorkspace'
import { grainFixture } from '../scene/__fixtures__/grainMatch'
import { previewGrainMatch, acceptGrainMatch, type GrainMatchPreview } from '../scene/grainMatching'
const download = vi.hoisted(() => vi.fn())
vi.mock('./download', () => ({ downloadBlob: download }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const mount = (saved = false) => {
  const f = grainFixture(),
    scene = saved
      ? acceptGrainMatch(
          f.scene,
          f.project,
          previewGrainMatch(f.scene, f.project, f.draft),
          'saved',
        )!
      : f.scene,
    apply = vi.fn((_: GrainMatchPreview) => true),
    undo = vi.fn(),
    redo = vi.fn(),
    close = vi.fn()
  const props = {
    scene,
    project: f.project,
    materials: scene.materials,
    clearance: 14,
    onApply: apply,
    onUndo: undo,
    onRedo: redo,
    onClose: close,
    canUndo: true,
    canRedo: true,
  }
  return { ...render(<GrainMatchWorkspace {...props} />), props, apply, undo, redo, close, f }
}
it('stages a named group, previews exact coordinates and applies only explicitly', () => {
  const f = mount(),
    before = JSON.stringify(f.props.scene)
  click('Add visible fronts')
  field('Grain group name', 'Kitchen fronts')
  click('Preview grain matching')
  expect(screen.queryByRole('img', { name: 'Installed grain matching preview' })).not.toBeNull()
  expect(screen.queryByRole('img', { name: 'Cutting blank grain matching preview' })).not.toBeNull()
  expect(screen.getByRole('region', { name: 'Grain matching preview' }).textContent).toContain(
    '632.00 × 738.00',
  )
  expect(screen.getByRole('table', { name: 'Grain sequence coordinates' }).textContent).toContain(
    '324.00, 10.00',
  )
  expect(f.apply).not.toHaveBeenCalled()
  click('Apply grain matching')
  expect(f.apply.mock.calls[0][0].draft.label).toBe('Kitchen fronts')
  expect(JSON.stringify(f.props.scene)).toBe(before)
})
it('rejects blank numbers and too few fronts and cancels without saving', () => {
  const f = mount()
  click('Add visible fronts')
  field('Blank margin', '')
  click('Preview grain matching')
  expect(screen.getByRole('alert').textContent).toContain('finite')
  click('Cancel grain changes')
  expect(screen.getByText(/Selected 0 fronts/)).toBeTruthy()
  click('Preview grain matching')
  expect(screen.getByRole('alert').textContent).toContain('reference')
  expect(f.apply).not.toHaveBeenCalled()
})
it('clears stale diagrams and disables draft controls on project changes', () => {
  const f = mount()
  click('Add visible fronts')
  click('Preview grain matching')
  const project = structuredClone(f.props.project)
  project.areas[0].name = 'Changed'
  f.rerender(<GrainMatchWorkspace {...f.props} project={project} />)
  expect(screen.queryByRole('img', { name: 'Cutting blank grain matching preview' })).toBeNull()
  expect(
    (
      screen
        .getByRole('button', { name: 'Preview grain matching' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(true)
  expect(screen.getByRole('alert').textContent).toContain('changed')
  click('Reset grain draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('loads saved groups, rejects no-op apply, edits direction and detaches without overwriting staged settings', () => {
  const f = mount(true)
  click('Edit grain group Matched fronts')
  click('Preview grain matching')
  expect(
    (screen.getByRole('button', { name: 'Apply grain matching' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  field('Group grain direction', 'horizontal')
  field('Pattern origin', 'reference')
  field('Pattern horizontal offset', '-25')
  click('Preview grain matching')
  click('Apply grain matching')
  expect(f.apply.mock.calls[0][0].draft.direction).toBe('horizontal')
  click('Detach grain group Matched fronts')
  expect(f.apply.mock.calls[1][0].action).toBe('detach')
  expect(f.apply.mock.calls[1][0].draft.direction).toBe('vertical')
})
it('keeps filtered members selected and supports individual removal/reference repair', () => {
  const f = mount()
  click('Add visible fronts')
  field('Grain room', f.props.project.areas[0].rooms[0].id)
  field('Grain cabinet', 'cab')
  expect(screen.getByText(/Selected 2 fronts/)).toBeTruthy()
  click(`Remove grain member ${f.f.draft.memberIds[0]}`)
  expect(screen.getByText(/Selected 1 fronts/)).toBeTruthy()
  expect((screen.getByLabelText('Reference front') as HTMLSelectElement).value).toBe(
    f.f.draft.memberIds[1],
  )
  click('Add visible fronts')
  expect(screen.getByText(/Selected 2 fronts/)).toBeTruthy()
})
it('reports stock/tool constraints without scattering groups or silently blocking valid design settings', () => {
  mount()
  click('Add visible fronts')
  field('Additional cutting gap', '0')
  click('Preview grain matching')
  expect(screen.getByRole('status').textContent).toContain('cutting gaps')
  expect(
    (screen.getByRole('button', { name: 'Apply grain matching' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  field('Additional cutting gap', '14')
  field('Blank margin', '1000')
  click('Preview grain matching')
  expect(screen.getByRole('status').textContent).toContain('does not fit')
})
it('provides history controls and exports only saved sequence data', () => {
  const f = mount(true)
  click('Undo grain change')
  click('Redo grain change')
  expect(f.undo).toHaveBeenCalledOnce()
  expect(f.redo).toHaveBeenCalledOnce()
  click('Edit grain group Matched fronts')
  field('Grain group name', 'Unsaved label')
  click('Export saved grain sequence CSV')
  expect(download.mock.calls[0][0]).toContain('"Matched fronts"')
  expect(download.mock.calls[0][0]).not.toContain('Unsaved label')
  click('Close grain matching')
  expect(f.close).toHaveBeenCalledOnce()
})
it('exposes missing selected members for repair', () => {
  const f = grainFixture(),
    scene = acceptGrainMatch(
      f.scene,
      f.project,
      previewGrainMatch(f.scene, f.project, f.draft),
      'saved',
    )!
  scene.parts = scene.parts.filter((p) => p.id !== f.draft.memberIds[0])
  render(
    <GrainMatchWorkspace
      scene={scene}
      project={f.project}
      materials={scene.materials}
      clearance={14}
      onApply={() => true}
      onClose={() => {}}
      onUndo={() => {}}
      onRedo={() => {}}
      canUndo={false}
      canRedo={false}
    />,
  )
  click('Edit grain group Matched fronts')
  expect(screen.getByRole('region', { name: 'Selected grain members' }).textContent).toContain(
    'Missing front',
  )
  click(`Remove grain member ${f.draft.memberIds[0]}`)
  expect(screen.getByRole('region', { name: 'Selected grain members' }).textContent).not.toContain(
    'Missing front',
  )
})
