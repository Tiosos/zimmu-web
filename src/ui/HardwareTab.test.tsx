import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HardwareTab } from './HardwareTab'
import type { BoardPart, HardwareItem } from '../scene/types'
import type { HardwareRow } from './groupHardware'

afterEach(cleanup)

// Existing tests predate the derived-hardware props (Task 13). None of them exercise the
// generated-rows block, so an empty `derived` and a no-op `onSaveHardwareEntry` reproduce
// their old behavior exactly — spread this and override only what a test cares about.
const defaultProps = {
  derived: [] as HardwareRow[],
  onSaveHardwareEntry: vi.fn(),
}

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
    linkedComponentIds: [],
  },
]

function makePart(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'part_1',
    label: 'Side Panel',
    length: 400,
    width: 200,
    thickness: 18,
    grain: 'free' as const,
    material: '',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...overrides,
  }
}

describe('HardwareTab', () => {
  it('shows empty state when no items', () => {
    render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
      />,
    )
    expect(screen.getByText(/no hardware items yet/i)).toBeTruthy()
  })

  it('renders item rows in the table', () => {
    render(
      <HardwareTab
        {...defaultProps}
        hardware={items}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
      />,
    )
    expect(screen.getByText('Hinge')).toBeTruthy()
  })

  it('Add item button creates a blank item and opens the edit panel', () => {
    render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy()
  })

  it('clicking a row opens the edit panel with that item', () => {
    render(
      <HardwareTab
        {...defaultProps}
        hardware={items}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Hinge'))
    expect(screen.getByDisplayValue('Hinge')).toBeTruthy()
    expect(screen.getByRole('button', { name: /save/i })).toBeTruthy()
  })

  it('saving a new blank item calls onUpdateHardware with one item', () => {
    const onUpdateHardware = vi.fn()
    render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={onUpdateHardware}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onUpdateHardware).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ unit: 'pcs' })]),
    )
  })

  it('deleting an item calls onUpdateHardware with empty list', () => {
    const onUpdateHardware = vi.fn()
    render(
      <HardwareTab
        {...defaultProps}
        hardware={items}
        parts={[]}
        components={[]}
        onUpdateHardware={onUpdateHardware}
      />,
    )
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
        linkedComponentIds: [],
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
        linkedComponentIds: [],
      },
    ]
    render(
      <HardwareTab
        {...defaultProps}
        hardware={items2}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Hinge'))
    expect(screen.getByDisplayValue('Hinge')).toBeTruthy()
    fireEvent.click(screen.getByText('Screw'))
    expect(screen.getByDisplayValue('Screw')).toBeTruthy()
  })

  it('renders part labels as checkboxes in the edit panel when a part is in the list', () => {
    const parts = [makePart({ id: 'p1', label: 'Side Panel' })]
    render(
      <HardwareTab
        {...defaultProps}
        hardware={items}
        parts={parts}
        components={[]}
        onUpdateHardware={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Hinge'))
    expect(screen.getByLabelText('Side Panel')).toBeTruthy()
  })
})

const derived: HardwareRow[] = [
  {
    key: 'hinge-overlay',
    cabinetLabel: 'Base A',
    name: '110° hinge c/w plate',
    qty: 2,
    unit: 'pcs',
    supplier: '',
    partNumber: '',
    unitCost: null,
    totalCost: null,
  },
]

describe('HardwareTab — generated rows', () => {
  it('shows a generated row with its cabinet and quantity', () => {
    render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
        derived={derived}
      />,
    )
    expect(screen.getByText('110° hinge c/w plate')).toBeTruthy()
    expect(screen.getByText('Base A')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('does not tell the user the job is free when nothing is priced', () => {
    render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
        derived={derived}
      />,
    )
    expect(screen.queryByText('$0.00')).toBeNull()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('writes a typed unit cost into the library, keyed by the catalogue key', async () => {
    const onSaveHardwareEntry = vi.fn()
    render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
        derived={derived}
        onSaveHardwareEntry={onSaveHardwareEntry}
      />,
    )
    const input = screen.getByLabelText('Unit cost for 110° hinge c/w plate')
    // `type` fires a change per keystroke, so the settled value is the last call, not the only one.
    await userEvent.type(input, '3.4')
    expect(onSaveHardwareEntry).toHaveBeenLastCalledWith('hinge-overlay', {
      supplier: '',
      partNumber: '',
      unitCost: 3.4,
    })
  })

  it('still offers the hand-typed list beneath', () => {
    render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
        derived={derived}
      />,
    )
    expect(screen.getByText('Add item')).toBeTruthy()
  })
})
