import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { BomModal } from './BomModal'
import type { HardwareItem, MaterialDef, Part } from '../scene/types'

afterEach(cleanup)

const parts: Part[] = [
  {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 600,
    width: 300,
    thickness: 18,
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
