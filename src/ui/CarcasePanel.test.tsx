import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CarcasePanel } from './CarcasePanel'
import { CARCASE_PRESETS } from '../scene/carcasePresets'
import type { CarcaseComponent, CarcaseParams, Component } from '../scene/types'

function carcase(params: Partial<CarcaseParams> = {}): CarcaseComponent {
  return {
    kind: 'carcase',
    id: 'cmp_1',
    label: 'Base 600',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: { ...CARCASE_PRESETS[0].params, ...params },
  }
}

function renderPanel(component = carcase(), onUpdate = vi.fn()) {
  render(
    <TooltipProvider>
      <CarcasePanel component={component} onUpdate={onUpdate} />
    </TooltipProvider>,
  )
  return onUpdate
}

// The panel reports edits as an updater, matching how onUpdate works everywhere else in useScene.
function appliedParams(onUpdate: ReturnType<typeof vi.fn>, base: CarcaseComponent): CarcaseParams {
  const updater = onUpdate.mock.calls.at(-1)![0] as (c: Component) => Component
  const next = updater(base)
  if (next.kind !== 'carcase') throw new Error('updater must return a carcase')
  return next.params
}

describe('CarcasePanel', () => {
  afterEach(cleanup)

  it('shows the current width', () => {
    renderPanel()
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('600')
  })

  it('reports a width edit through onUpdate', async () => {
    const c = carcase()
    const onUpdate = renderPanel(c)
    const field = screen.getByLabelText('Width')
    await userEvent.clear(field)
    await userEvent.type(field, '900')
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(appliedParams(onUpdate, c).width).toBe(900)
  })

  it('renders the four sections', () => {
    renderPanel()
    for (const s of ['Size', 'Structure', 'Shelving', 'Joinery']) {
      expect(screen.getByRole('button', { name: new RegExp(s, 'i') })).toBeTruthy()
    }
  })

  it('shows a validation error and still renders the offending field', () => {
    renderPanel(carcase({ width: 10 }))
    expect(screen.getByRole('alert').textContent).toContain('width must exceed 2 × thickness')
    // A panel that hides the field you need to fix is unusable.
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('10')
  })

  it('shows no alert for a valid carcase', () => {
    renderPanel()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a back-mode change through onUpdate', async () => {
    const c = carcase()
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Back'))
    await userEvent.click(screen.getByRole('option', { name: 'None' }))
    expect(appliedParams(onUpdate, c).backMode).toBe('none')
  })

  it('reports a has-top toggle through onUpdate', async () => {
    const c = carcase()
    const onUpdate = renderPanel(c)
    await userEvent.click(screen.getByLabelText('Has top'))
    expect(appliedParams(onUpdate, c).hasTop).toBe(false)
  })

  // Typed one character at a time, the way a user types it. A field that reparses its own text on
  // every keystroke cannot survive an intermediate "0." — the point of the local draft state.
  it('keeps what was typed while a divider list is entered character by character', async () => {
    const c = carcase({ dividers: [] })
    const onUpdate = renderPanel(c)
    const field = screen.getByLabelText('Dividers') as HTMLInputElement
    await userEvent.type(field, '0.33, 0.66')
    expect(field.value).toBe('0.33, 0.66')
    expect(appliedParams(onUpdate, c).dividers).toEqual([0.33, 0.66])
  })

  it('re-syncs the divider field when the params change from elsewhere', () => {
    const { rerender } = render(
      <TooltipProvider>
        <CarcasePanel component={carcase({ dividers: [0.5] })} onUpdate={vi.fn()} />
      </TooltipProvider>,
    )
    rerender(
      <TooltipProvider>
        <CarcasePanel component={carcase({ dividers: [0.25, 0.75] })} onUpdate={vi.fn()} />
      </TooltipProvider>,
    )
    expect((screen.getByLabelText('Dividers') as HTMLInputElement).value).toBe('0.25, 0.75')
  })

  // 'legs' is still in the CarcaseParams union so saved files load, but no generator branch
  // implements it — it produced a cabinet identical to 'none' under a label promising otherwise.
  it('does not offer Legs as a base mode', async () => {
    renderPanel()
    await userEvent.click(screen.getByLabelText('Base'))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Toe kick', 'Ladder', 'None'])
  })

  it('renders a cabinet saved with the withdrawn legs base', () => {
    renderPanel(carcase({ baseMode: 'legs' }))
    expect(screen.getByLabelText('Base')).toBeTruthy()
  })

  // Every CarcaseParams field must be reachable. A parameter with no control is invisible to the
  // user and silently un-editable forever, and no other test in the suite would notice.
  it('exposes a control for every CarcaseParams field', () => {
    renderPanel()
    const labels = [
      'Width',
      'Height',
      'Depth',
      'Thickness',
      'Material',
      'Has top',
      'Back',
      'Back thickness',
      'Base',
      'Toe-kick height',
      'Toe-kick setback',
      'Dividers',
      'Fixed shelves',
      'Adjustable rows',
      'Pin setback',
      'Pin back setback',
      'Pin start height',
      'Pin count',
      'Joint method',
    ]
    for (const label of labels) {
      expect(screen.getByLabelText(label), `no control for "${label}"`).toBeTruthy()
    }
  })
})
