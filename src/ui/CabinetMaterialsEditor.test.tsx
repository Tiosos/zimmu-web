import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CabinetMaterialsEditor } from './CabinetMaterialsEditor'
import { motionScene } from '../scene/__fixtures__/motion'
import type { CarcaseComponent } from '../scene/types'
import type { MaterialsPreview } from '../scene/cabinetMaterials'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
function open(mode: 'materials' | 'edges' = 'materials', kind: 'door' | 'drawer' = 'door') {
  const scene = motionScene(kind)
  scene.materials.Oak = { thickness: 18 }
  scene.materials.ABS = { thickness: 1, use: 'edge' }
  const cabinet = scene.components.find((c): c is CarcaseComponent => c.kind === 'carcase')!
  const onApply = vi.fn<(p: MaterialsPreview) => boolean>(() => true)
  const props = { scene, cabinet, mode, onApply }
  return { ...render(<CabinetMaterialsEditor {...props} />), props, onApply }
}
it('filters roles and stages multiple board materials without writing before Apply', () => {
  const { onApply } = open()
  field('Filter role', 'Cabinet sides')
  click('Select matching boards')
  field('Panel material', 'Oak')
  click('Stage material')
  expect(screen.getByText('2 selected · 2 staged boards')).toBeTruthy()
  expect(onApply).not.toHaveBeenCalled()
  expect(screen.getAllByText('Staged: Material: Oak')).toHaveLength(2)
  click('Preview materials')
  expect(screen.getByRole('table', { name: 'Board treatment comparison' }).textContent).toContain(
    'Oak',
  )
  click('Apply materials')
  expect(onApply).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('region', { name: 'Materials preview' })).toBeNull()
})
it('searches and filters material, copies staged grain, and discards individual drafts', () => {
  open()
  field('Filter material', '18mm Ply')
  field('Find boards', 'side')
  click('Select matching boards')
  field('Board grain', 'width')
  click('Stage grain')
  expect(screen.getByText('2 selected · 2 staged boards')).toBeTruthy()
  click('Discard Left Side changes')
  expect(screen.getByText('2 selected · 1 staged boards')).toBeTruthy()
  click('Clear board selection')
  expect(screen.getByRole('button', { name: 'Stage material' })).toHaveProperty('disabled', true)
})
it('invalidates previews on field edits and reset/cancel discard changes without writes', () => {
  const { onApply } = open()
  field('Find boards', 'side')
  click('Select matching boards')
  field('Board grain', 'width')
  click('Stage grain')
  click('Preview materials')
  field('Board grain', 'free')
  expect(screen.queryByRole('region', { name: 'Materials preview' })).toBeNull()
  click('Cancel materials changes')
  expect(screen.getByText('0 selected · 0 staged boards')).toBeTruthy()
  expect(onApply).not.toHaveBeenCalled()
})
it('shows stale source changes and blocks Apply until reset', () => {
  const view = open()
  field('Find boards', 'side')
  click('Select matching boards')
  field('Board grain', 'width')
  click('Stage grain')
  click('Preview materials')
  const scene = structuredClone(view.props.scene)
  scene.materials.Oak.thickness = 19
  view.rerender(<CabinetMaterialsEditor {...view.props} scene={scene} />)
  expect(screen.getByRole('alert').textContent).toContain('scene changed')
  expect(screen.getByRole('button', { name: 'Apply materials' })).toHaveProperty('disabled', true)
  click('Reset materials draft')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('shows locked detached boards and handles a declined acceptance', () => {
  const view = open()
  const scene = structuredClone(view.props.scene)
  const left = scene.parts.find((p) => p.role === 'left-side')!
  left.driven = false
  view.rerender(<CabinetMaterialsEditor {...view.props} scene={scene} />)
  click('Reset materials draft')
  expect(screen.getByLabelText('Select Left Side')).toHaveProperty('disabled', true)
  field('Find boards', 'Right Side')
  click('Select matching boards')
  field('Board grain', 'width')
  click('Stage grain')
  click('Preview materials')
  view.onApply.mockReturnValueOnce(false)
  click('Apply materials')
  expect(screen.getByRole('alert').textContent).toContain('could not apply')
})
it('highlights selected edges, previews tape totals and applies an edge proposal', () => {
  const { onApply } = open('edges')
  field('Filter role', 'Cabinet sides')
  click('Select matching boards')
  expect(screen.getByRole('img', { name: 'Selected board edge preview' })).toBeTruthy()
  expect(screen.getAllByText(/Length start.*cabinet front/).length).toBeGreaterThan(0)
  field('Edgebanding stock', 'ABS')
  click('Stage cabinet-front edges')
  click('Preview edgebanding')
  expect(screen.getByRole('table', { name: 'Edgebanding length totals' }).textContent).toContain(
    'ABS',
  )
  click('Apply edgebanding')
  expect(onApply).toHaveBeenCalledTimes(1)
})
it('protects explicit decisions by default and supports deliberate bare/inherit choices', () => {
  const view = open('edges')
  const scene = structuredClone(view.props.scene),
    left = scene.parts.find((p) => p.kind === 'board' && p.role === 'left-side')!
  if (left.kind !== 'board') throw Error('board')
  left.edgeBanding = { y0: 'ABS' }
  view.rerender(<CabinetMaterialsEditor {...view.props} scene={scene} />)
  click('Reset edgebanding draft')
  fireEvent.click(screen.getByLabelText('Select Left Side'))
  click('Stage bare edges')
  click('Preview edgebanding')
  expect(screen.getByText('No changes to apply.')).toBeTruthy()
  fireEvent.click(screen.getByLabelText('Preserve explicit edge decisions'))
  click('Stage bare edges')
  click('Preview edgebanding')
  expect(screen.getByRole('button', { name: 'Apply edgebanding' })).toHaveProperty(
    'disabled',
    false,
  )
  click('Restore inherited edges')
  expect(screen.getByText('Staged: y0: inherited')).toBeTruthy()
  click('Preview edgebanding')
  click('Apply edgebanding')
  expect(view.onApply.mock.calls[0][0].draft[left.id].edges).toEqual({ y0: { inherit: true } })
})
it('rejects an incompatible copy with a visible error', () => {
  const view = open('edges')
  field('Find boards', 'bottom')
  click('Select matching boards')
  field('Copy treatments from', view.props.scene.parts.find((p) => p.role === 'left-side')!.id)
  click('Copy edgebanding to selection')
  expect(screen.getByRole('alert').textContent).toContain('matching dimensions')
})

it('renders newly generated boards and accurate proposed quantities', () => {
  const view = open('materials', 'drawer'),
    scene = structuredClone(view.props.scene)
  scene.parts = scene.parts.filter((p) => !p.role?.startsWith('box-'))
  view.rerender(<CabinetMaterialsEditor {...view.props} scene={scene} />)
  click('Reset materials draft')
  field('Find boards', 'side')
  click('Select matching boards')
  field('Board grain', 'width')
  click('Stage grain')
  click('Preview materials')
  expect(screen.getAllByText('Not generated')).toHaveLength(5)
  expect(
    screen.getByText('Board quantity: 7 → 12. Review all generated changes before applying.'),
  ).toBeTruthy()
})
