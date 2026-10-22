import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SlopedTopWorkspace } from './SlopedTopWorkspace'
import { slopeFixture } from '../scene/__fixtures__/slope'
import { previewSlope, acceptSlope, type SlopePreview } from '../scene/slopedTop'
import { downloadBlob } from './download'
vi.mock('./download', () => ({ downloadBlob: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
function mount(saved = false) {
  const f = slopeFixture()
  if (saved) f.scene = acceptSlope(f.scene, f.project, previewSlope(f.scene, f.project, f.draft))!
  const apply = vi.fn((_p: SlopePreview) => true),
    close = vi.fn(),
    undo = vi.fn(),
    redo = vi.fn(),
    props = {
      scene: f.scene,
      project: f.project,
      onApply: apply,
      onClose: close,
      onUndo: undo,
      onRedo: redo,
      canUndo: true,
      canRedo: false,
    }
  return { ...f, ...render(<SlopedTopWorkspace {...props} />), props, apply, close, undo, redo }
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
it('stages heights and all previews before applying, and exports the panel schedule', () => {
  const f = mount(),
    before = JSON.stringify(f.scene)
  fireEvent.click(screen.getByLabelText('Enable sloped top'))
  field('First roof height (mm)', '800')
  field('Opposite roof height (mm)', '600')
  click('Preview sloped cabinet')
  expect(screen.queryByRole('img', { name: 'Sloped cabinet elevation' })).not.toBeNull()
  expect(screen.queryByRole('img', { name: 'Sloped cabinet plan' })).not.toBeNull()
  expect(
    screen.queryByRole('img', { name: 'Sloped cabinet generated panel projection' }),
  ).not.toBeNull()
  expect(screen.getByRole('region', { name: 'Sloped cabinet preview' }).textContent).toContain(
    'conservative',
  )
  expect(f.apply).not.toHaveBeenCalled()
  expect(JSON.stringify(f.scene)).toBe(before)
  click('Export sloped panel schedule')
  expect(downloadBlob).toHaveBeenCalledWith(
    expect.stringContaining('Through-thickness bevel'),
    'sloped-panel-schedule.csv',
    'text/csv',
  )
  click('Apply sloped cabinet')
  expect(f.apply).toHaveBeenCalledOnce()
  expect(f.apply.mock.calls[0][0].draft.second).toBe(600)
})
it('uses signed angles and either fixed endpoint without changing the cabinet before apply', () => {
  const f = mount()
  fireEvent.click(screen.getByLabelText('Enable sloped top'))
  field('Slope angle (degrees)', '0')
  expect((screen.getByLabelText('Opposite roof height (mm)') as HTMLInputElement).value).toBe('800')
  field('Fixed slope end', 'end')
  field('Slope angle (degrees)', '10')
  expect(
    Number((screen.getByLabelText('First roof height (mm)') as HTMLInputElement).value),
  ).toBeCloseTo(800 - Math.tan(Math.PI / 18) * 600)
  field('Slope axis', 'depth')
  field('front top overhang (mm)', '20')
  click('Preview sloped cabinet')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(f.apply).not.toHaveBeenCalled()
})
it('rejects blank heights and incompatible construction, then cancels staged changes', () => {
  const f = mount()
  fireEvent.click(screen.getByLabelText('Enable sloped top'))
  field('First roof height (mm)', '')
  click('Preview sloped cabinet')
  expect(screen.getByRole('alert').textContent).toContain('finite')
  expect(
    (screen.getByRole('button', { name: 'Apply sloped cabinet' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  click('Cancel slope changes')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(f.apply).not.toHaveBeenCalled()
})
it('hides stale geometry and exports, disables controls and reloads current settings', () => {
  const f = mount(true)
  field('Opposite roof height (mm)', '650')
  click('Preview sloped cabinet')
  const project = structuredClone(f.project)
  project.areas[0].name = 'Changed'
  f.rerender(<SlopedTopWorkspace {...f.props} project={project} />)
  expect(screen.queryByRole('region', { name: 'Sloped cabinet preview' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('Source changed')
  expect(
    (
      screen
        .getByRole('button', { name: 'Preview sloped cabinet' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(true)
  click('Reload slope settings')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('rejects no-op apply and stages disabling a saved slope', () => {
  const f = mount(true)
  click('Preview sloped cabinet')
  expect(
    (screen.getByRole('button', { name: 'Apply sloped cabinet' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByLabelText('Enable sloped top'))
  click('Preview sloped cabinet')
  click('Apply sloped cabinet')
  expect(f.apply.mock.calls[0][0].draft.enabled).toBe(false)
})
it('clears obsolete previews on edits and exposes history, close and rejected acceptance', () => {
  const f = mount(true)
  field('Opposite roof height (mm)', '650')
  click('Preview sloped cabinet')
  field('left top overhang (mm)', '20')
  expect(screen.queryByRole('region', { name: 'Sloped cabinet preview' })).toBeNull()
  click('Undo slope change')
  expect(f.undo).toHaveBeenCalledOnce()
  expect(
    (screen.getByRole('button', { name: 'Redo slope change' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  click('Close sloped top')
  expect(f.close).toHaveBeenCalledOnce()
  f.apply.mockReturnValue(false)
  click('Preview sloped cabinet')
  click('Apply sloped cabinet')
  expect(screen.getAllByRole('status').some((x) => x.textContent?.includes('Source changed'))).toBe(
    true,
  )
})
