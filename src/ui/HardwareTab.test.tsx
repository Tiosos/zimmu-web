import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
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
    componentId: 'cmp_1',
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
    // The cabinet label is now part of the accessible name — the catalogue key alone collides
    // whenever two cabinets share a part.
    const input = screen.getByLabelText('Unit cost for 110° hinge c/w plate (Base A)')
    // `type` fires a change per keystroke; the commit is debounced, so wait for the settled write.
    await userEvent.type(input, '3.4')
    await waitFor(() => expect(onSaveHardwareEntry).toHaveBeenCalled())
    expect(onSaveHardwareEntry).toHaveBeenLastCalledWith('hinge-overlay', {
      supplier: '',
      partNumber: '',
      unitCost: 3.4,
    })
  })

  // The library has carried supplier and part number since it was introduced, but nothing could
  // write them: every commit passed `row.supplier`/`row.partNumber` straight back, so both were
  // permanently '' and the Library tab's two columns permanently '—'.
  it('writes a typed supplier into the library, keeping the price beside it', async () => {
    const onSaveHardwareEntry = vi.fn()
    render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
        derived={[{ ...derived[0], unitCost: 3.4, totalCost: 6.8 }]}
        onSaveHardwareEntry={onSaveHardwareEntry}
      />,
    )
    const input = screen.getByLabelText('Supplier for 110° hinge c/w plate (Base A)')
    await userEvent.type(input, 'Blum')
    await waitFor(() => expect(onSaveHardwareEntry).toHaveBeenCalled())
    expect(onSaveHardwareEntry).toHaveBeenLastCalledWith('hinge-overlay', {
      supplier: 'Blum',
      partNumber: '',
      unitCost: 3.4,
    })
  })

  // An unpriced row must stay unpriced: naming a supplier is not agreeing to a price of zero.
  it('keeps an unpriced row unpriced when only a part number is typed', async () => {
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
    await userEvent.type(
      screen.getByLabelText('Part number for 110° hinge c/w plate (Base A)'),
      '71B3550',
    )
    await waitFor(() => expect(onSaveHardwareEntry).toHaveBeenCalled())
    expect(onSaveHardwareEntry).toHaveBeenLastCalledWith('hinge-overlay', {
      supplier: '',
      partNumber: '71B3550',
      unitCost: null,
    })
  })

  it('never commits a non-finite unit cost when the field passes through empty mid-edit', async () => {
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
    // By role, not label text — this test's failure is about the committed value, not the
    // cabinet-qualified aria-label the sync fix also changes.
    const input = screen.getByRole('spinbutton')
    // A real edit: type a digit, then clear the field (e.g. select-all-delete before retyping).
    // parseFloat('') is NaN, exactly the case the guard comment names.
    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.change(input, { target: { value: '' } })
    await waitFor(() => expect(onSaveHardwareEntry).toHaveBeenCalled())
    for (const [, entry] of onSaveHardwareEntry.mock.calls) {
      expect(Number.isFinite(entry.unitCost)).toBe(true)
    }
  })

  it('keeps every row for a shared catalogue key in sync after one is edited', async () => {
    const sharedRows: HardwareRow[] = [
      {
        componentId: 'cmp_1',
        key: 'screw-4x30',
        cabinetLabel: 'Base A',
        name: 'Screw 4x30',
        qty: 8,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        unitCost: null,
        totalCost: null,
      },
      {
        componentId: 'cmp_2',
        key: 'screw-4x30',
        cabinetLabel: 'Base B',
        name: 'Screw 4x30',
        qty: 6,
        unit: 'pcs',
        supplier: '',
        partNumber: '',
        unitCost: null,
        totalCost: null,
      },
    ]
    const onSaveHardwareEntry = vi.fn()
    const { rerender } = render(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
        derived={sharedRows}
        onSaveHardwareEntry={onSaveHardwareEntry}
      />,
    )
    // By role and row order, not label text — this test's failure is about the second row's
    // displayed value, not the aria-label change.
    const [inputA, inputB] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    // Touch row B once first: an uncontrolled input only stops mirroring a `defaultValue` prop
    // change once its own DOM value has actually been set once (the "dirty value flag"), which is
    // exactly what happens the moment a real user has so much as glanced at a field before.
    // Without this step, a never-touched row happens to keep tracking `defaultValue` across a
    // rerender regardless of the bug, which would pass this assertion for the wrong reason on
    // both the fixed and the unfixed input — verified directly against happy-dom's own behavior.
    fireEvent.change(inputB, { target: { value: inputB.value } })
    fireEvent.change(inputA, { target: { value: '5' } })
    await waitFor(() => expect(onSaveHardwareEntry).toHaveBeenCalled())

    // Both rows key off the same catalogue entry, so a real library write prices both — simulate
    // that round trip landing back as new `derived` props, the way BomModal recomputes them.
    const pricedRows = sharedRows.map((r) => ({ ...r, unitCost: 5, totalCost: 5 * r.qty }))
    rerender(
      <HardwareTab
        {...defaultProps}
        hardware={[]}
        parts={[]}
        components={[]}
        onUpdateHardware={vi.fn()}
        derived={pricedRows}
        onSaveHardwareEntry={onSaveHardwareEntry}
      />,
    )
    const [, inputBAfter] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(inputBAfter.value).toBe('5')
  })

  it('commits a settled value once, not once per keystroke', async () => {
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
    // By role, not label text — this test's failure is about the call count.
    const input = screen.getByRole('spinbutton')
    await userEvent.type(input, '3.4')
    await waitFor(() => expect(onSaveHardwareEntry).toHaveBeenCalled())
    // Every keystroke resets the debounce timer, so typing "3", "3.", "3.4" settles into one write.
    expect(onSaveHardwareEntry).toHaveBeenCalledTimes(1)
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
