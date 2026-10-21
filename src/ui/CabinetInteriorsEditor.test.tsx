import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { interiorsScene } from '../scene/__fixtures__/interiors'
import { CabinetInteriorsEditor } from './CabinetInteriorsEditor'
import type { CarcaseComponent } from '../scene/types'
import type { InteriorsPreview } from '../scene/shelvesInteriors'
afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
function open(split = false) {
  const scene = interiorsScene(split),
    cabinet = scene.components.find((c): c is CarcaseComponent => c.kind === 'carcase')!,
    onApply = vi.fn<(p: InteriorsPreview) => boolean>(() => true),
    props = { scene, cabinet, onApply }
  return { ...render(<CabinetInteriorsEditor {...props} />), props, onApply }
}
it('stages multiple openings, previews actual results and applies in one explicit action', () => {
  const view = open(true)
  click('Select all editable openings')
  field('Adjustable shelf count', '2')
  click('Stage shelf settings')
  expect(screen.getByText('2 selected · 2 staged openings')).toBeTruthy()
  expect(view.onApply).not.toHaveBeenCalled()
  click('Preview interiors')
  expect(
    screen.getByRole('table', { name: 'Proposed shelf boards' }).querySelectorAll('tbody tr'),
  ).toHaveLength(4)
  click('Apply interiors')
  expect(view.onApply).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('region', { name: 'Interiors preview' })).toBeNull()
})
it('copies settings, defaults, removes drilling and discards individual staged changes', () => {
  open(true)
  fireEvent.click(screen.getByLabelText('Shelve opening 1'))
  field('Fixed shelf count', '1')
  field('Adjustable shelf count', '0')
  click('Stage shelf settings')
  field('Copy interior settings from', 'left')
  click('Copy interior settings')
  expect(screen.getByLabelText('Fixed shelf count')).toHaveProperty('value', '1')
  click('Select all editable openings')
  click('Stage standard shelves')
  expect(screen.getByText('2 selected · 2 staged openings')).toBeTruthy()
  click('Discard opening 1 changes')
  expect(screen.getByText('2 selected · 1 staged openings')).toBeTruthy()
  click('Remove shelves and drilling')
  click('Preview interiors')
  expect(screen.getByText('Affected shelf boards: 0 → 0. Proposed pin bores: 0.')).toBeTruthy()
  click('Clear interior selection')
  expect(screen.getByRole('button', { name: 'Stage shelf settings' })).toHaveProperty(
    'disabled',
    true,
  )
})
it('clears previews on edits and reset/cancel never writes to the scene', () => {
  const view = open()
  click('Select all editable openings')
  click('Stage standard shelves')
  click('Preview interiors')
  field('Front pin setback', '40')
  expect(screen.queryByRole('region', { name: 'Interiors preview' })).toBeNull()
  click('Reset interiors draft')
  expect(screen.getByText('0 selected · 0 staged openings')).toBeTruthy()
  click('Select all editable openings')
  click('Stage shelf settings')
  click('Cancel interior changes')
  expect(view.onApply).not.toHaveBeenCalled()
})
it('shows form validation and blocks invalid drilling application', () => {
  open()
  click('Select all editable openings')
  field('Adjustable shelf count', '1.5')
  click('Stage shelf settings')
  expect(screen.getByRole('alert').textContent).toContain('whole')
  field('Adjustable shelf count', '1')
  field('Front pin setback', '9999')
  click('Stage shelf settings')
  click('Preview interiors')
  expect(screen.getByRole('alert').textContent).toContain('outside')
  expect(screen.getByRole('button', { name: 'Apply interiors' })).toHaveProperty('disabled', true)
})
it('expires after geometry or cabinet changes, but not mesh-only refresh', () => {
  const view = open()
  click('Select all editable openings')
  click('Stage standard shelves')
  click('Preview interiors')
  view.rerender(
    <CabinetInteriorsEditor
      {...view.props}
      scene={{
        ...view.props.scene,
        parts: view.props.scene.parts.map((p) => ({
          ...p,
          mesh: { positions: new Float32Array(), normals: new Float32Array() },
        })),
      }}
    />,
  )
  expect(screen.getByRole('region', { name: 'Interiors preview' })).toBeTruthy()
  view.rerender(
    <CabinetInteriorsEditor {...view.props} cabinet={{ ...view.props.cabinet, id: 'other' }} />,
  )
  expect(screen.queryByRole('region', { name: 'Interiors preview' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Preview interiors' })).toHaveProperty('disabled', true)
})
it('disables detached targets and handles callback rejection', () => {
  const view = open()
  view.onApply.mockReturnValue(false)
  click('Select all editable openings')
  click('Stage standard shelves')
  click('Preview interiors')
  click('Apply interiors')
  expect(screen.getByRole('alert').textContent).toContain('could not be applied')
  const proposed = view.onApply.mock.calls[0][0].scene!
  const detached = {
    ...proposed,
    parts: proposed.parts.map((p) =>
      p.kind === 'board' && p.role?.startsWith('adj-shelf-') ? { ...p, driven: false } : p,
    ),
  }
  view.rerender(
    <CabinetInteriorsEditor
      {...view.props}
      scene={detached}
      cabinet={detached.components.find((c): c is CarcaseComponent => c.kind === 'carcase')!}
    />,
  )
  click('Reset interiors draft')
  expect(screen.getByLabelText('Shelve opening 1')).toHaveProperty('disabled', true)
})
