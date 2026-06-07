import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HardwareTab } from './HardwareTab'
import type { HardwareItem } from '../scene/types'

afterEach(cleanup)

const items: HardwareItem[] = [
  {
    id: 'h1',
    name: 'Hinge',
    qty: 4,
    unit: 'pcs',
    supplier: 'Ace',
    partNumber: 'H-100',
    unitCost: 2.5,
    notes: '',
    linkedPartIds: [],
  },
]

describe('HardwareTab', () => {
  it('shows empty state when no items', () => {
    render(<HardwareTab hardware={[]} onUpdateHardware={vi.fn()} />)
    expect(screen.getByText(/no hardware items yet/i)).toBeTruthy()
  })

  it('renders item rows in the table', () => {
    render(<HardwareTab hardware={items} onUpdateHardware={vi.fn()} />)
    expect(screen.getByText('Hinge')).toBeTruthy()
  })

  it('Add item button creates a blank item and opens the edit panel', () => {
    render(<HardwareTab hardware={[]} onUpdateHardware={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy()
  })

  it('clicking a row opens the edit panel with that item', () => {
    render(<HardwareTab hardware={items} onUpdateHardware={vi.fn()} />)
    fireEvent.click(screen.getByText('Hinge'))
    expect(screen.getByDisplayValue('Hinge')).toBeTruthy()
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy()
  })

  it('saving a new blank item calls onUpdateHardware with one item', () => {
    const onUpdateHardware = vi.fn()
    render(<HardwareTab hardware={[]} onUpdateHardware={onUpdateHardware} />)
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onUpdateHardware).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ unit: 'pcs' })]),
    )
  })

  it('deleting an item calls onUpdateHardware with empty list', () => {
    const onUpdateHardware = vi.fn()
    render(<HardwareTab hardware={items} onUpdateHardware={onUpdateHardware} />)
    fireEvent.click(screen.getByText('Hinge'))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onUpdateHardware).toHaveBeenCalledWith([])
  })

  it('switching between items shows the correct item data in the panel', () => {
    const items2: HardwareItem[] = [
      {
        id: 'h1',
        name: 'Hinge',
        qty: 4,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        unitCost: 2.5,
        notes: '',
        linkedPartIds: [],
      },
      {
        id: 'h2',
        name: 'Screw',
        qty: 10,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        unitCost: 0.1,
        notes: '',
        linkedPartIds: [],
      },
    ]
    render(<HardwareTab hardware={items2} onUpdateHardware={vi.fn()} />)
    fireEvent.click(screen.getByText('Hinge'))
    // Panel shows Hinge
    expect(screen.getByDisplayValue('Hinge')).toBeTruthy()
    // Click Screw
    fireEvent.click(screen.getByText('Screw'))
    // Panel now shows Screw (not Hinge)
    expect(screen.getByDisplayValue('Screw')).toBeTruthy()
  })
})
