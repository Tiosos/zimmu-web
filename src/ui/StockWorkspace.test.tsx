import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StockWorkspace } from './StockWorkspace'
import { stockFixture } from '../nest/__fixtures__/stock'
import { grainFixture } from '../scene/__fixtures__/grainMatch'
import { defaultStockPlan, type StockPreview } from '../scene/stockPlanning'
import { downloadBlob } from './download'
vi.mock('./download', () => ({ downloadBlob: vi.fn() }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
function mount() {
  const f = stockFixture(1)
  f.scene.stockPlan = f.plan
  const apply = vi.fn((_p: StockPreview, _action: 'save' | 'consume', _ids: string[]) => true),
    close = vi.fn(),
    undo = vi.fn(),
    redo = vi.fn(),
    props = {
      scene: f.scene,
      project: f.project,
      materials: f.scene.materials,
      clearance: 0,
      onApply: apply,
      onClose: close,
      onUndo: undo,
      onRedo: redo,
      canUndo: true,
      canRedo: false,
    }
  return { ...f, ...render(<StockWorkspace {...props} />), props, apply, close, undo, redo }
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const field = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } })
it('previews comparisons and exports without inventory changes, then consumes selected remnants explicitly', () => {
  const f = mount(),
    before = JSON.stringify(f.scene)
  click('Preview stock optimisation')
  expect(screen.getByRole('region', { name: 'Stock optimisation preview' }).textContent).toContain(
    'Single-size baseline',
  )
  expect(screen.getByRole('button', { name: 'Save stock settings' }).hasAttribute('disabled')).toBe(
    true,
  )
  click('Export stock allocation and purchase list')
  expect(downloadBlob).toHaveBeenCalledWith(
    expect.stringContaining('Purchase'),
    'stock-allocation.csv',
    'text/csv',
  )
  click('Export stock sheet 1')
  expect(downloadBlob).toHaveBeenCalledWith(
    expect.stringContaining('data-usable-stock'),
    'stock-sheet-1.svg',
    'image/svg+xml',
  )
  expect(f.apply).not.toHaveBeenCalled()
  expect(JSON.stringify(f.scene)).toBe(before)
  fireEvent.click(screen.getByLabelText('Keep remnant 0:0'))
  click('Consume stock and save selected remnants')
  expect(f.apply.mock.calls[0][1]).toBe('consume')
  expect(f.apply.mock.calls[0][2]).toEqual(['0:0'])
})
it('adds and edits finite offcuts, validates blank quantities, saves only after preview', () => {
  const f = mount()
  click('Add reusable offcut')
  const stock = screen.getAllByText(/ID: stock_/)[0].textContent!.replace('ID: ', '')
  field(`Stock name ${stock}`, 'Rack remnant')
  field(`Stock quantity ${stock}`, '')
  expect(screen.getByRole('alert').textContent).toContain('finite quantity')
  field(`Stock quantity ${stock}`, '2')
  field(`Stock location ${stock}`, 'Shelf B')
  click('Preview stock optimisation')
  click('Save stock settings')
  const draft = f.apply.mock.calls[0][0].draft
  expect(draft.stocks.find((s) => s.id === stock)).toMatchObject({
    kind: 'offcut',
    quantity: 2,
    location: 'Shelf B',
    name: 'Rack remnant',
  })
})
it('rejects invalid dimensions and clears old previews when editing inventory', () => {
  const f = mount()
  click('Preview stock optimisation')
  const id = f.plan.stocks[0].id
  field(`Stock length ${id}`, '')
  expect(screen.queryByRole('region', { name: 'Stock optimisation preview' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('dimensions')
  expect(
    screen.getByRole('button', { name: 'Preview stock optimisation' }).hasAttribute('disabled'),
  ).toBe(true)
  field(`Stock length ${id}`, '220')
  fireEvent.click(screen.getByLabelText(`Stock enabled ${id}`))
  click('Preview stock optimisation')
  expect(screen.getAllByRole('alert')[0].textContent).toContain('No enabled stock')
  expect(
    screen
      .getByRole('button', { name: 'Consume stock and save selected remnants' })
      .hasAttribute('disabled'),
  ).toBe(true)
})
it('hides stale layouts, disables edits and exports, and reloads current inventory', () => {
  const f = mount()
  click('Preview stock optimisation')
  const materials = structuredClone(f.props.materials)
  materials.Panel.sheet!.length = 500
  f.rerender(<StockWorkspace {...f.props} materials={materials} />)
  expect(screen.queryByRole('region', { name: 'Stock optimisation preview' })).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('changed')
  expect(
    (
      screen
        .getByRole('button', { name: 'Preview stock optimisation' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(true)
  click('Reload stock settings')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(
    (
      screen
        .getByRole('button', { name: 'Preview stock optimisation' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(false)
})
it('removes stock options, changes strategies and offcut policy, and keeps preview commands explicit', () => {
  const f = mount()
  click(`Remove stock ${f.plan.stocks[0].id}`)
  click('Preview stock optimisation')
  expect(screen.getAllByRole('alert')[0].textContent).toContain('No enabled stock')
  click('Add sheet stock')
  field('Stock strategy', 'lower-cost')
  fireEvent.click(screen.getByLabelText('Use available offcuts'))
  field('Stock tool clearance', '2')
  field('Minimum remnant length', '80')
  field('Minimum remnant width', '20')
  click('Preview stock optimisation')
  click('Save stock settings')
  expect(f.apply.mock.calls[0][0].draft).toMatchObject({
    strategy: 'lower-cost',
    useOffcuts: false,
    clearance: 2,
    minLength: 80,
    minWidth: 20,
  })
})
it('filters cabinets by room without changing selection and reports panel demand', () => {
  const f = grainFixture(),
    plan = defaultStockPlan(f.scene.materials, 14)
  f.scene.stockPlan = plan
  const props = {
    scene: f.scene,
    project: f.project,
    materials: f.scene.materials,
    clearance: 14,
    onApply: vi.fn(() => true),
    onClose: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: false,
    canRedo: false,
  }
  render(<StockWorkspace {...props} />)
  click('Add visible cabinets')
  expect(screen.getByRole('region', { name: 'Panel demand' }).textContent).toContain('total panels')
  fireEvent.change(screen.getByLabelText('Stock room filter'), {
    target: { value: f.project.areas[0].rooms[0].id },
  })
  expect(
    (screen.getByLabelText(`Include cabinet ${f.scene.components[0].label}`) as HTMLInputElement)
      .checked,
  ).toBe(true)
  click('Use all boards')
  expect(
    (screen.getByLabelText(`Include cabinet ${f.scene.components[0].label}`) as HTMLInputElement)
      .checked,
  ).toBe(false)
})
it('exposes history, close and rejected-acceptance feedback', () => {
  const f = mount()
  click('Undo stock change')
  expect(f.undo).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Redo stock change' }).hasAttribute('disabled')).toBe(
    true,
  )
  click('Close stock optimisation')
  expect(f.close).toHaveBeenCalledOnce()
  f.apply.mockReturnValue(false)
  click('Preview stock optimisation')
  click('Consume stock and save selected remnants')
  expect(screen.getByRole('status').textContent).toContain('source changed')
})
