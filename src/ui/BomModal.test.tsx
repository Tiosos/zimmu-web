import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BomModal } from './BomModal'
import type { HardwareItem, HardwareLibraryEntry, MaterialDef, Part } from '../scene/types'
import type { HardwareLine } from '../scene/carcaseHardware'

afterEach(cleanup)

const parts: Part[] = [
  {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 600,
    width: 300,
    thickness: 18,
    grain: 'free' as const,
    material: 'Plywood',
    color: '#aabbcc',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
  },
]

const materials: Record<string, MaterialDef> = { Plywood: { costPerM2: 100 } }

const hardware: HardwareItem[] = [
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
]

const baseProps = {
  parts,
  components: [],
  materials,
  hardware,
  projectName: 'Test',
  onClose: vi.fn(),
  onMaterialCostChange: vi.fn(),
  onUpdateHardware: vi.fn(),
  library: {} as Record<string, MaterialDef>,
  onSaveRate: vi.fn(),
  onDeleteLibraryEntry: vi.fn(),
  clearance: 14,
  onSetClearance: vi.fn(),
  nestReports: [],
  nestPending: false,
  onSheetsTabChange: vi.fn(),
  hardwareLines: [] as HardwareLine[],
  hardwareLibrary: {} as Record<string, HardwareLibraryEntry>,
  onSaveHardwareEntry: vi.fn(),
  onDeleteHardwareEntry: vi.fn(),
}

describe('BomModal', () => {
  it('renders with Boards tab active by default', () => {
    render(<BomModal {...baseProps} />)
    const boardsTab = screen.getByRole('tab', { name: /boards/i })
    expect(boardsTab.getAttribute('aria-selected')).toBe('true')
  })

  it('shows board table (cl-panel) in Boards tab', () => {
    render(<BomModal {...baseProps} />)
    expect(screen.getByTestId('cl-panel')).toBeTruthy()
  })

  it('switches to Hardware tab on click', () => {
    render(<BomModal {...baseProps} />)
    fireEvent.click(screen.getByRole('tab', { name: /hardware/i }))
    const hardwareTab = screen.getByRole('tab', { name: /hardware/i })
    expect(hardwareTab.getAttribute('aria-selected')).toBe('true')
    // hardware tab content visible
    expect(screen.getByRole('button', { name: /add item/i })).toBeTruthy()
  })

  it('grand total footer is always visible', () => {
    render(<BomModal {...baseProps} />)
    expect(screen.getByTestId('bom-grand-total')).toBeTruthy()
  })

  it('grand total includes board and hardware costs', () => {
    render(<BomModal {...baseProps} />)
    // Board: 600×300mm × $100/m² = $18.00
    // Hardware: 4 × $2.50 = $10.00
    // Grand total: $28.00
    expect(screen.getByTestId('bom-grand-total').textContent).toContain('28.00')
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<BomModal {...baseProps} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('library-seeded rate appears in cost column when project has no rate', () => {
    // Plywood: 600×300mm = 0.18m² × $50/m² = $9.00
    render(<BomModal {...baseProps} materials={{}} library={{ Plywood: { costPerM2: 50 } }} />)
    expect(screen.getByTestId('cl-panel').textContent).toContain('$9.00')
  })

  it('project rate overrides library rate', () => {
    // project rate $100 wins over library rate $50: 0.18m² × $100 = $18.00
    render(
      <BomModal
        {...baseProps}
        materials={{ Plywood: { costPerM2: 100 } }}
        library={{ Plywood: { costPerM2: 50 } }}
      />,
    )
    expect(screen.getByTestId('cl-panel').textContent).toContain('$18.00')
    expect(screen.getByTestId('cl-panel').textContent).not.toContain('$9.00')
  })

  it('committing a changed rate calls both onMaterialCostChange and onSaveRate', () => {
    const onMaterialCostChange = vi.fn()
    const onSaveRate = vi.fn()
    render(
      <BomModal
        {...baseProps}
        materials={{}}
        library={{}}
        onMaterialCostChange={onMaterialCostChange}
        onSaveRate={onSaveRate}
      />,
    )
    fireEvent.click(screen.getByText('Plywood'))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '60' } })
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Enter' })
    expect(onMaterialCostChange).toHaveBeenCalledWith('Plywood', { costPerM2: 60 })
    expect(onSaveRate).toHaveBeenCalledWith('Plywood', { costPerM2: 60 })
  })

  it('does not call onMaterialCostChange when popover dismissed without changing value', () => {
    const onMaterialCostChange = vi.fn()
    const onSaveRate = vi.fn()
    // materials has a project rate (100) — popover opens with current=100
    render(
      <BomModal
        {...baseProps}
        materials={{ Plywood: { costPerM2: 100 } }}
        library={{}}
        onMaterialCostChange={onMaterialCostChange}
        onSaveRate={onSaveRate}
      />,
    )
    fireEvent.click(screen.getByText('Plywood'))
    // Blur without changing — "100" is the same as current (100)
    fireEvent.blur(screen.getByRole('spinbutton'))
    expect(onMaterialCostChange).not.toHaveBeenCalled()
    expect(onSaveRate).not.toHaveBeenCalled()
  })

  it('Library tab renders entries from library prop sorted alphabetically', () => {
    render(
      <BomModal
        {...baseProps}
        library={{ Plywood: { costPerM2: 100 }, Oak: { costPerM2: 80 }, Birch: { costPerM2: 45 } }}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /library/i }))
    const rows = screen.getByRole('table').querySelector('tbody')!.querySelectorAll('tr')
    expect(rows[0].cells[0].textContent).toBe('Birch')
    expect(rows[1].cells[0].textContent).toBe('Oak')
    expect(rows[2].cells[0].textContent).toBe('Plywood')
  })

  it('delete button in Library tab calls onDeleteLibraryEntry with correct name', () => {
    const onDeleteLibraryEntry = vi.fn()
    render(
      <BomModal
        {...baseProps}
        library={{ Plywood: { costPerM2: 100 } }}
        onDeleteLibraryEntry={onDeleteLibraryEntry}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /library/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDeleteLibraryEntry).toHaveBeenCalledWith('Plywood')
  })

  it('switches to Dowels tab and shows the dowel material', () => {
    const dowelPart: Part = {
      kind: 'cylinder',
      id: 'c1',
      label: 'Dowel',
      diameter: 8,
      length: 100,
      material: 'Beech',
      color: '#888888',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
      parentId: null,
      driven: false,
    }
    render(<BomModal {...baseProps} parts={[...parts, dowelPart]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Dowels' }))
    expect(screen.getByText('Beech')).toBeTruthy()
  })

  it('merges rates field-level so a library costPerM is not shadowed by a scene costPerM2', () => {
    const dowelPart: Part = {
      kind: 'cylinder',
      id: 'c1',
      label: 'Dowel',
      diameter: 8,
      length: 100,
      material: 'Beech',
      color: '#888888',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
      parentId: null,
      driven: false,
    }
    render(
      <BomModal
        {...baseProps}
        parts={[...parts, dowelPart]}
        materials={{ Beech: { costPerM2: 10 } }}
        library={{ Beech: { costPerM: 5 } }}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Dowels' }))
    // 100 mm × $5/m = $0.50 — only visible if the library costPerM survived the merge
    expect(screen.getAllByText('$0.50').length).toBeGreaterThan(0)
  })

  it('CSV buttons are disabled when Library tab is active', () => {
    render(<BomModal {...baseProps} />)
    fireEvent.click(screen.getByRole('tab', { name: /library/i }))
    expect(
      (screen.getByRole('button', { name: /copy csv/i }) as HTMLButtonElement).disabled,
    ).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: /download/i }) as HTMLButtonElement).disabled,
    ).toBeTruthy()
  })
})

describe('BomModal — Library tab sheet stock and clearance', () => {
  afterEach(cleanup)

  function openLibrary(library: Record<string, MaterialDef> = { '18mm Ply': { costPerM2: 40 } }) {
    const onSaveRate = vi.fn()
    const onSetClearance = vi.fn()
    render(
      <BomModal
        {...baseProps}
        library={library}
        onSaveRate={onSaveRate}
        clearance={14}
        onSetClearance={onSetClearance}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Library' }))
    return { onSaveRate, onSetClearance }
  }

  it('writes a sheet length back through onSaveRate, keeping the rate', () => {
    const { onSaveRate } = openLibrary()
    fireEvent.change(screen.getByLabelText('Sheet length for 18mm Ply'), {
      target: { value: '2440' },
    })
    expect(onSaveRate).toHaveBeenCalledWith('18mm Ply', {
      costPerM2: 40,
      sheet: { length: 2440, width: 0 },
    })
  })

  it('keeps the other sheet dimension when one is edited', () => {
    const { onSaveRate } = openLibrary({ '18mm Ply': { sheet: { length: 2440, width: 1220 } } })
    fireEvent.change(screen.getByLabelText('Sheet width for 18mm Ply'), {
      target: { value: '600' },
    })
    expect(onSaveRate).toHaveBeenCalledWith('18mm Ply', { sheet: { length: 2440, width: 600 } })
  })

  it('treats an absent hasGrain as having grain', () => {
    openLibrary()
    expect((screen.getByLabelText('18mm Ply has grain') as HTMLInputElement).checked).toBe(true)
  })

  it('reports a hasGrain change through onSaveRate', () => {
    const { onSaveRate } = openLibrary()
    fireEvent.click(screen.getByLabelText('18mm Ply has grain'))
    expect(onSaveRate).toHaveBeenCalledWith('18mm Ply', { costPerM2: 40, hasGrain: false })
  })

  it('reports a clearance change through onSetClearance', () => {
    const { onSetClearance } = openLibrary()
    fireEvent.change(screen.getByLabelText('Tool clearance'), { target: { value: '20' } })
    expect(onSetClearance).toHaveBeenCalledWith(20)
  })
})

describe('BomModal — the Sheets tab drives the nest', () => {
  afterEach(cleanup)

  // The gating contract: a 5-second nest must start only when someone opens the report, and stop
  // being wanted the moment they leave it.
  it('reports the tab open and closed again', () => {
    const onSheetsTabChange = vi.fn()
    render(<BomModal {...baseProps} onSheetsTabChange={onSheetsTabChange} />)
    expect(onSheetsTabChange).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByRole('tab', { name: 'Sheets' }))
    expect(onSheetsTabChange).toHaveBeenLastCalledWith(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Boards' }))
    expect(onSheetsTabChange).toHaveBeenLastCalledWith(false)
  })

  it('stops wanting a nest when the modal closes on the Sheets tab', () => {
    const onSheetsTabChange = vi.fn()
    const { unmount } = render(<BomModal {...baseProps} onSheetsTabChange={onSheetsTabChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Sheets' }))
    expect(onSheetsTabChange).toHaveBeenLastCalledWith(true)

    unmount()
    expect(onSheetsTabChange).toHaveBeenLastCalledWith(false)
  })

  it('offers no CSV of a nest', () => {
    render(<BomModal {...baseProps} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Sheets' }))
    expect(screen.getByRole('button', { name: /copy/i }).hasAttribute('disabled')).toBe(true)
  })
})

describe('BomModal — pricing the generated hardware rows', () => {
  afterEach(cleanup)

  it('prices the generated rows against the hardware library', () => {
    render(
      <BomModal
        {...baseProps}
        hardwareLines={[
          { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'hinge-overlay', qty: 2 },
        ]}
        hardwareLibrary={{
          'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
        }}
        onSaveHardwareEntry={vi.fn()}
        onDeleteHardwareEntry={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Hardware'))
    expect(screen.getByText('110° hinge c/w plate')).toBeDefined()
    expect(screen.getByText('$6.80')).toBeDefined()
  })

  it('adds the generated rows into the footer, not just the hand-entered items', () => {
    render(
      <BomModal
        {...baseProps}
        hardwareLines={[
          { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'hinge-overlay', qty: 2 },
        ]}
        hardwareLibrary={{
          'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
        }}
      />,
    )
    // Hand-entered 4 x $2.50 = $10.00; generated 2 x $3.40 = $6.80. The footer owes both, and
    // the boards' $18.00 carries the grand total to $34.80.
    const footer = screen.getByTestId('bom-grand-total').textContent
    expect(footer).toContain('$16.80')
    expect(footer).toContain('$34.80')
  })

  // Boards and Dowels both say "—" for a job nobody has priced; Hardware said "$0.00", which is a
  // different claim — that the hardware is free. Before the generated rows a hand-typed item always
  // carried a number, so $0.00 was honest; nullable rows are what made it a lie.
  it('says — rather than $0.00 when nothing in the job is priced', () => {
    render(
      <BomModal
        {...baseProps}
        hardware={[]}
        hardwareLines={[
          { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'hinge-overlay', qty: 2 },
        ]}
      />,
    )
    const footer = screen.getByTestId('bom-grand-total').textContent
    expect(footer).toContain('Hardware: —')
    expect(footer).not.toContain('$0.00')
  })

  it('leaves an unpriced generated row out of the footer rather than counting it as free', () => {
    render(
      <BomModal
        {...baseProps}
        hardwareLines={[
          { componentId: 'cmp_1', cabinetLabel: 'Base A', key: 'hinge-overlay', qty: 2 },
        ]}
      />,
    )
    const footer = screen.getByTestId('bom-grand-total').textContent
    expect(footer).toContain('$10.00')
    expect(footer).toContain('$28.00')
  })
})

describe('BomModal — the Library tab lists hardware too', () => {
  afterEach(cleanup)

  it('lists a priced hardware item in the library, and can forget it', async () => {
    const onDeleteHardwareEntry = vi.fn()
    render(
      <BomModal
        {...baseProps}
        hardwareLines={[]}
        hardwareLibrary={{
          'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
        }}
        onSaveHardwareEntry={vi.fn()}
        onDeleteHardwareEntry={onDeleteHardwareEntry}
      />,
    )
    fireEvent.click(screen.getByText('Library'))
    expect(screen.getByText('110° hinge c/w plate')).toBeDefined()
    expect(screen.getByText('Blum')).toBeDefined()
    await userEvent.click(screen.getByLabelText('Forget 110° hinge c/w plate'))
    // The forget control is destructive and irreversible (no undo/redo — it writes straight to
    // IndexedDB), so it asks for confirmation before calling through.
    expect(onDeleteHardwareEntry).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onDeleteHardwareEntry).toHaveBeenCalledWith('hinge-overlay')
    expect(onDeleteHardwareEntry).toHaveBeenCalledTimes(1)
  })

  it('backs out of forgetting a hardware entry without deleting it', async () => {
    const onDeleteHardwareEntry = vi.fn()
    render(
      <BomModal
        {...baseProps}
        hardwareLines={[]}
        hardwareLibrary={{
          'hinge-overlay': { supplier: 'Blum', partNumber: '71B3550', unitCost: 3.4 },
        }}
        onSaveHardwareEntry={vi.fn()}
        onDeleteHardwareEntry={onDeleteHardwareEntry}
      />,
    )
    fireEvent.click(screen.getByText('Library'))
    await userEvent.click(screen.getByLabelText('Forget 110° hinge c/w plate'))
    await userEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(onDeleteHardwareEntry).not.toHaveBeenCalled()
    // Backing out returns to the plain Forget control rather than leaving Confirm/No stuck open.
    expect(screen.getByLabelText('Forget 110° hinge c/w plate')).toBeDefined()
  })

  it('orders hardware rows by catalogue order, not by key, and puts a stale key last', () => {
    render(
      <BomModal
        {...baseProps}
        hardwareLines={[]}
        hardwareLibrary={{
          // Catalogue order lists 'hinge-overlay' before 'hinge-inset', the reverse of what
          // sorting by key would give.
          'hinge-inset': { supplier: '', partNumber: '', unitCost: 4 },
          'hinge-overlay': { supplier: '', partNumber: '', unitCost: 3.4 },
          // Not in HARDWARE_CATALOGUE — a stale entry from a renamed/removed catalogue item.
          'discontinued-hinge': { supplier: '', partNumber: '', unitCost: 1 },
        }}
        onSaveHardwareEntry={vi.fn()}
        onDeleteHardwareEntry={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Library'))
    const names = screen
      .getAllByRole('row')
      .slice(1) // drop the header row
      .map((row) => row.querySelector('td')?.textContent)
    expect(names).toEqual([
      '110° hinge c/w plate',
      '110° inset hinge c/w plate',
      'discontinued-hinge',
    ])
  })

  it('shows the raw key for a library entry whose catalogue key no longer exists', async () => {
    const onDeleteHardwareEntry = vi.fn()
    render(
      <BomModal
        {...baseProps}
        hardwareLines={[]}
        hardwareLibrary={{
          'discontinued-hinge': { supplier: 'Blum', partNumber: 'X1', unitCost: 1 },
        }}
        onSaveHardwareEntry={vi.fn()}
        onDeleteHardwareEntry={onDeleteHardwareEntry}
      />,
    )
    fireEvent.click(screen.getByText('Library'))
    expect(screen.getByText('discontinued-hinge')).toBeDefined()
    await userEvent.click(screen.getByLabelText('Forget discontinued-hinge'))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onDeleteHardwareEntry).toHaveBeenCalledWith('discontinued-hinge')
  })

  it('shows the empty-library message when nothing is priced', () => {
    render(<BomModal {...baseProps} hardwareLibrary={{}} />)
    fireEvent.click(screen.getByText('Library'))
    expect(
      screen.getByText(
        'No hardware priced yet. Set a unit cost in the Hardware tab to build your library.',
      ),
    ).toBeDefined()
  })
})
