import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HardwareEditPanel } from './HardwareEditPanel'
import type { BoardPart, HardwareItem, Part } from '../scene/types'

const item: HardwareItem = {
  id: 'h1',
  name: 'Hinge',
  qty: 4,
  unit: 'pcs',
  supplier: 'Ace',
  partNumber: 'H-100',
  unitCost: 2.5,
  notes: 'soft-close',
  linkedPartIds: [],
}

function baseItem(overrides: Partial<HardwareItem> = {}) {
  return {
    item: {
      id: 'hw_1',
      name: 'Screw M4',
      qty: 10,
      unit: 'pcs',
      supplier: '',
      partNumber: '',
      unitCost: 0.05,
      notes: '',
      linkedPartIds: [],
      ...overrides,
    } as HardwareItem,
    parts: [] as Part[],
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
  }
}

function makePart(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'part_1',
    label: 'Side Panel',
    length: 400,
    width: 200,
    thickness: 18,
    material: '',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

describe('HardwareEditPanel', () => {
  afterEach(cleanup)

  it('renders all field values from the item', () => {
    render(
      <HardwareEditPanel
        item={item}
        parts={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Hinge')).toBeTruthy()
    expect(screen.getByDisplayValue('4')).toBeTruthy()
    expect(screen.getByDisplayValue('pcs')).toBeTruthy()
    expect(screen.getByDisplayValue('Ace')).toBeTruthy()
    expect(screen.getByDisplayValue('H-100')).toBeTruthy()
    expect(screen.getByDisplayValue('2.5')).toBeTruthy()
    expect(screen.getByDisplayValue('soft-close')).toBeTruthy()
  })

  it('calls onSave with updated item when Save is clicked', () => {
    const onSave = vi.fn()
    render(
      <HardwareEditPanel
        item={item}
        parts={[]}
        onSave={onSave}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByDisplayValue('Hinge'), { target: { value: 'Butt Hinge' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Butt Hinge' }))
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <HardwareEditPanel
        item={item}
        parts={[]}
        onSave={vi.fn()}
        onCancel={onCancel}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows Delete confirmation after clicking Delete', () => {
    render(
      <HardwareEditPanel
        item={item}
        parts={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByRole('button', { name: /confirm/i })).toBeTruthy()
  })

  it('calls onDelete after confirming deletion', () => {
    const onDelete = vi.fn()
    render(
      <HardwareEditPanel
        item={item}
        parts={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onDelete).toHaveBeenCalledWith('h1')
  })

  describe('Linked parts section', () => {
    it('renders a checkbox for each part', () => {
      const parts = [makePart({ id: 'p1', label: 'Side' }), makePart({ id: 'p2', label: 'Top' })]
      render(<HardwareEditPanel {...baseItem()} parts={parts} />)
      expect(screen.getByLabelText('Side')).toBeTruthy()
      expect(screen.getByLabelText('Top')).toBeTruthy()
    })

    it('checkbox is checked when part id is in linkedPartIds', () => {
      const parts = [makePart({ id: 'p1', label: 'Side' })]
      render(<HardwareEditPanel {...baseItem({ linkedPartIds: ['p1'] })} parts={parts} />)
      expect((screen.getByLabelText('Side') as HTMLInputElement).checked).toBe(true)
    })

    it('checkbox is unchecked when part id is not in linkedPartIds', () => {
      const parts = [makePart({ id: 'p1', label: 'Side' })]
      render(<HardwareEditPanel {...baseItem({ linkedPartIds: [] })} parts={parts} />)
      expect((screen.getByLabelText('Side') as HTMLInputElement).checked).toBe(false)
    })

    it('checking a checkbox adds part id to draft and Save submits it', () => {
      const onSave = vi.fn()
      const parts = [makePart({ id: 'p1', label: 'Side' })]
      render(
        <HardwareEditPanel {...baseItem({ linkedPartIds: [] })} parts={parts} onSave={onSave} />,
      )
      fireEvent.click(screen.getByLabelText('Side'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      const saved = onSave.mock.calls[0][0] as HardwareItem
      expect(saved.linkedPartIds).toContain('p1')
    })

    it('unchecking a checkbox removes part id from draft and Save submits it', () => {
      const onSave = vi.fn()
      const parts = [makePart({ id: 'p1', label: 'Side' })]
      render(
        <HardwareEditPanel
          {...baseItem({ linkedPartIds: ['p1'] })}
          parts={parts}
          onSave={onSave}
        />,
      )
      fireEvent.click(screen.getByLabelText('Side'))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      const saved = onSave.mock.calls[0][0] as HardwareItem
      expect(saved.linkedPartIds).not.toContain('p1')
    })

    it('renders "No parts in project" when parts is empty', () => {
      render(<HardwareEditPanel {...baseItem()} parts={[]} />)
      expect(screen.getByText('No parts in project')).toBeTruthy()
    })
  })
})
