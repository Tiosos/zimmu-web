import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HardwareEditPanel } from './HardwareEditPanel'
import type { HardwareItem } from '../scene/types'

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

describe('HardwareEditPanel', () => {
  afterEach(cleanup)

  it('renders all field values from the item', () => {
    render(<HardwareEditPanel item={item} onSave={vi.fn()} onCancel={vi.fn()} onDelete={vi.fn()} />)
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
    render(<HardwareEditPanel item={item} onSave={onSave} onCancel={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('Hinge'), { target: { value: 'Butt Hinge' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Butt Hinge' }))
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(
      <HardwareEditPanel item={item} onSave={vi.fn()} onCancel={onCancel} onDelete={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows Delete confirmation after clicking Delete', () => {
    render(<HardwareEditPanel item={item} onSave={vi.fn()} onCancel={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByRole('button', { name: /confirm/i })).toBeTruthy()
  })

  it('calls onDelete after confirming deletion', () => {
    const onDelete = vi.fn()
    render(
      <HardwareEditPanel item={item} onSave={vi.fn()} onCancel={vi.fn()} onDelete={onDelete} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onDelete).toHaveBeenCalledWith('h1')
  })
})
