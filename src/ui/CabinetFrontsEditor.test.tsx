import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CabinetFrontsEditor } from './CabinetFrontsEditor'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { defaultInterior } from '../scene/sectionInterior'
import { applyPipeline } from '../scene/pipeline'
import { acceptFronts, type FrontsPreview } from '../scene/frontsDrawers'
import type { CarcaseComponent, Scene } from '../scene/types'
afterEach(cleanup)
const own: CarcaseComponent = {
  ...cabinet,
  id: 'cab',
  params: {
    ...cabinet.params,
    section: { ...cabinet.params.section, interior: defaultInterior(0) },
  },
}
const sceneOf = (): Scene =>
  applyPipeline({
    components: [own],
    parts: [],
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
  })
const button = (name: string) => screen.getByRole('button', { name })
const click = (name: string) => fireEvent.click(button(name))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const region = (name: string) => screen.getByRole('region', { name })
it('filters staged choices, retains staged edits when selection clears, and applies only after preview', () => {
  const s = sceneOf(),
    apply = vi.fn((_: FrontsPreview) => true)
  render(<CabinetFrontsEditor cabinet={own} scene={s} onApply={apply} />)
  expect(button('Preview fronts and drawers').hasAttribute('disabled')).toBe(true)
  click('Select door openings')
  expect((screen.getByLabelText('Select opening 1') as HTMLInputElement).checked).toBe(true)
  click('Drawer front')
  click('Select drawer openings')
  click('Stage undermount runners')
  field('Front draft box height', '100')
  click('Stage custom box height')
  field('Front draft drawer material', '18mm Ply')
  click('Stage drawer material')
  expect(region('Staged front and drawer edits').textContent).toContain('undermount')
  click('Clear opening selection')
  expect(region('Staged front and drawer edits').textContent).toContain('drawer-front')
  expect(apply).not.toHaveBeenCalled()
  click('Preview fronts and drawers')
  expect(region('Proposed front elevation').querySelector('svg')).not.toBeNull()
  expect(region('Front board changes').textContent).toContain('changed board rows')
  expect(region('Front hardware changes').textContent).toContain('runner')
  click('Apply fronts and drawers')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(
    acceptFronts(s, apply.mock.lastCall![0])?.components.some(
      (c) => c.kind === 'drawer' && c.params.boxHeight === 100,
    ),
  ).toBe(true)
})
it('exposes all front actions, filters uncovered fronts and reports noop previews', () => {
  render(<CabinetFrontsEditor cabinet={own} scene={sceneOf()} onApply={() => true} />)
  click('Select all openings')
  click('Left-hinged door')
  click('Preview fronts and drawers')
  expect(screen.getByText('No design changes to apply.')).toBeTruthy()
  expect(button('Apply fronts and drawers').hasAttribute('disabled')).toBe(true)
  for (const name of [
    'Right-hinged door',
    'Double doors',
    'False front',
    'Cover panel',
    'Remove front',
  ]) {
    click(name)
    expect(screen.queryByRole('region', { name: 'Fronts and drawers preview' })).toBeNull()
  }
  click('Select uncovered openings')
  expect((screen.getByLabelText('Select opening 1') as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByLabelText('Select opening 1'))
  expect((screen.getByLabelText('Select opening 1') as HTMLInputElement).checked).toBe(false)
  click('Cancel front changes')
  expect(region('Staged front and drawer edits').textContent).toContain('No staged edits.')
})
it('stages side-mount offsets, automatic heights and rejects invalid fields or non-drawer selections', () => {
  render(<CabinetFrontsEditor cabinet={own} scene={sceneOf()} onApply={() => true} />)
  click('Select all openings')
  click('Stage side-mount runners')
  expect(screen.getByRole('alert').textContent).toContain('only drawer-front')
  click('Drawer front')
  click('Stage side-mount runners')
  field('Front draft runner offset', '40')
  click('Stage runner offset')
  click('Stage automatic box height')
  expect(region('Staged front and drawer edits').textContent).toContain('automatic')
  click('Preview fronts and drawers')
  field('Front draft box height', '')
  expect(screen.queryByRole('region', { name: 'Fronts and drawers preview' })).toBeNull()
  click('Stage custom box height')
  expect(screen.getByRole('alert').textContent).toContain('finite number')
  field('Front draft box height', '9999')
  click('Stage custom box height')
  click('Preview fronts and drawers')
  expect(screen.getByRole('alert').textContent).toContain('exceeds')
  expect(button('Apply fronts and drawers').hasAttribute('disabled')).toBe(true)
  click('Reset front draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('locks detached openings and disables selection of their manual geometry', () => {
  const s = sceneOf(),
    locked = {
      ...s,
      parts: s.parts.map((p) => (p.role?.startsWith('front-') ? { ...p, driven: false } : p)),
    }
  render(<CabinetFrontsEditor cabinet={own} scene={locked} onApply={() => true} />)
  expect((screen.getByLabelText('Select opening 1') as HTMLInputElement).disabled).toBe(true)
  click('Select all openings')
  expect((screen.getByLabelText('Select opening 1') as HTMLInputElement).checked).toBe(false)
  expect(screen.getByText(/detached parts: locked/)).toBeTruthy()
})
it('retains previews for mesh changes, stales them for source settings and resets without applying', () => {
  const s = sceneOf(),
    props = { cabinet: own, scene: s, onApply: () => true },
    view = render(<CabinetFrontsEditor {...props} />)
  click('Select all openings')
  click('Right-hinged door')
  click('Preview fronts and drawers')
  view.rerender(
    <CabinetFrontsEditor
      {...props}
      scene={{ ...s, parts: s.parts.map((p) => ({ ...p, mesh: undefined })) }}
    />,
  )
  expect(region('Fronts and drawers preview')).toBeTruthy()
  view.rerender(
    <CabinetFrontsEditor
      {...props}
      scene={{ ...s, materials: { ...s.materials, New: { thickness: 22 } } }}
    />,
  )
  expect(screen.queryByRole('region', { name: 'Fronts and drawers preview' })).toBeNull()
  expect(button('Preview fronts and drawers').hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('group', { name: 'Stage fronts' }).hasAttribute('disabled')).toBe(true)
  expect(region('Staged front and drawer edits').textContent).toContain('right-door')
  click('Reset front draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('reports rejected Apply and adopts the reconciled scene after successful application', () => {
  const s = sceneOf(),
    apply = vi.fn(() => false),
    view = render(<CabinetFrontsEditor cabinet={own} scene={s} onApply={apply} />)
  click('Select all openings')
  click('Right-hinged door')
  click('Preview fronts and drawers')
  click('Apply fronts and drawers')
  expect(screen.queryByRole('alert')?.textContent).toContain('changed after preview')
  view.unmount()
  let next: Scene | null = null
  const success = (p: FrontsPreview) => {
    next = acceptFronts(s, p)
    return !!next
  }
  const second = render(<CabinetFrontsEditor cabinet={own} scene={s} onApply={success} />)
  click('Select all openings')
  click('Right-hinged door')
  click('Preview fronts and drawers')
  click('Apply fronts and drawers')
  second.rerender(<CabinetFrontsEditor cabinet={own} scene={next!} onApply={success} />)
  expect(screen.queryByRole('alert')).toBeNull()
  click('Left-hinged door')
  click('Preview fronts and drawers')
  expect(button('Apply fronts and drawers').hasAttribute('disabled')).toBe(false)
})
