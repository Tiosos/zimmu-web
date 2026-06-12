import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { buildCsv, groupParts } from './buildCsv'
import { CuttingList } from './CuttingList'
import type { BoardPart, Part } from '../scene/types'

function makePart(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Left Side',
    length: 600,
    width: 300,
    thickness: 18,
    material: '',
    color: '#8b6914',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

describe('buildCsv', () => {
  it('returns only the header when parts array is empty', () => {
    expect(buildCsv([])).toBe(
      'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts,Cost/unit,Total',
    )
  })

  it('groups two identical parts into one data row', () => {
    const csv = buildCsv([
      makePart({ id: 'p1', label: 'Left Side' }),
      makePart({ id: 'p2', label: 'Right Side' }),
    ])
    expect(csv.split('\n')).toHaveLength(2)
  })

  it('formats a data row with correct field values', () => {
    const csv = buildCsv([makePart({ length: 600, width: 300, thickness: 18 })])
    expect(csv.split('\n')[1]).toBe('1,Left Side,,#8b6914,600,300,18,0,,')
  })

  it('includes the cut count', () => {
    const cuts = [
      {
        id: 'c1',
        label: 'C1',
        face: '+X' as const,
        position: { x: 0, y: 0, z: 0 },
        size: { x: 10, y: 20, z: 20 },
      },
      {
        id: 'c2',
        label: 'C2',
        face: '-Y' as const,
        position: { x: 0, y: 0, z: 0 },
        size: { x: 20, y: 10, z: 20 },
      },
    ]
    const csv = buildCsv([makePart({ cuts })])
    expect(csv.split('\n')[1]).toBe('1,Left Side,,#8b6914,600,300,18,2,,')
  })

  it('wraps labels in double quotes when they contain a comma', () => {
    const csv = buildCsv([makePart({ label: 'Left, Side' })])
    expect(csv.split('\n')[1]).toMatch(/^1,"Left, Side",,/)
  })

  it('escapes embedded double-quotes in labels as "" per RFC 4180', () => {
    const csv = buildCsv([makePart({ label: '5" shelf' })])
    expect(csv.split('\n')[1]).toMatch(/^1,"5"" shelf",,/)
  })

  it('wraps material in double quotes when it contains a comma', () => {
    const csv = buildCsv([makePart({ material: 'Pine, Ply' })])
    expect(csv.split('\n')[1]).toMatch(/^1,Left Side,"Pine, Ply",/)
  })

  it('quotes grouped labels field when labels contain a comma after grouping', () => {
    const parts = [makePart({ id: 'p1', label: 'A' }), makePart({ id: 'p2', label: 'B' })]
    const csv = buildCsv(parts)
    // Grouped labels = "A, B" which contains a comma — must be quoted
    expect(csv.split('\n')[1]).toMatch(/^2,"A, B",,/)
  })

  it('puts different colors on separate rows', () => {
    const csv = buildCsv([
      makePart({ id: 'p1', color: '#8b6914' }),
      makePart({ id: 'p2', color: '#ff0000' }),
    ])
    expect(csv.split('\n')).toHaveLength(3)
  })
})

describe('groupParts', () => {
  it('returns empty array for empty input', () => {
    expect(groupParts([])).toEqual([])
  })

  it('returns one row for a single part', () => {
    const rows = groupParts([makePart()])
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(1)
    expect(rows[0].labels).toBe('Left Side')
    expect(rows[0].material).toBe('')
    expect(rows[0].length).toBe(600)
    expect(rows[0].width).toBe(300)
    expect(rows[0].thickness).toBe(18)
    expect(rows[0].cuts).toBe(0)
  })

  it('merges two parts with identical L×W×T and material into one row', () => {
    const parts = [makePart({ id: 'p1', label: 'A' }), makePart({ id: 'p2', label: 'B' })]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(2)
    expect(rows[0].labels).toBe('A, B')
    expect(rows[0].cuts).toBe(0)
  })

  it('keeps two rows when same L×W×T but different material', () => {
    const parts = [
      makePart({ id: 'p1', label: 'A', material: 'Plywood' }),
      makePart({ id: 'p2', label: 'B', material: 'MDF' }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(2)
    expect(rows[0].qty).toBe(1)
    expect(rows[1].qty).toBe(1)
  })

  it('keeps two rows when same material but different dimensions', () => {
    const parts = [
      makePart({ id: 'p1', label: 'A', length: 600 }),
      makePart({ id: 'p2', label: 'B', length: 800 }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(2)
  })

  it('sums cuts across grouped parts', () => {
    const cut = {
      id: 'c1',
      label: 'C1',
      face: '+X' as const,
      position: { x: 0, y: 0, z: 0 },
      size: { x: 10, y: 20, z: 20 },
    }
    const parts = [
      makePart({ id: 'p1', label: 'A', cuts: [cut] }),
      makePart({ id: 'p2', label: 'B', cuts: [cut] }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(1)
    expect(rows[0].cuts).toBe(2)
  })

  it('preserves insertion order (first-seen group key wins)', () => {
    const parts = [
      makePart({ id: 'p1', label: 'A', length: 800 }),
      makePart({ id: 'p2', label: 'B', length: 600 }),
      makePart({ id: 'p3', label: 'C', length: 800 }),
    ]
    const rows = groupParts(parts)
    expect(rows).toHaveLength(2)
    expect(rows[0].length).toBe(800)
    expect(rows[0].labels).toBe('A, C')
    expect(rows[1].length).toBe(600)
  })

  it('carries color onto the grouped row', () => {
    expect(groupParts([makePart()])[0].color).toBe('#8b6914')
  })

  it('splits parts that differ only by color into separate rows', () => {
    const rows = groupParts([
      makePart({ id: 'p1', color: '#8b6914' }),
      makePart({ id: 'p2', color: '#ff0000' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].color).toBe('#8b6914')
    expect(rows[1].color).toBe('#ff0000')
  })
})

describe('CuttingList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a row for each distinct dimension group', () => {
    const parts = [
      makePart({ id: 'p1', label: 'Left Side', length: 600 }),
      makePart({ id: 'p2', label: 'Right Side', length: 800 }),
    ]
    render(<CuttingList parts={parts} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Left Side')).toBeTruthy()
    expect(screen.getByText('Right Side')).toBeTruthy()
  })

  it('renders table column headers', () => {
    render(<CuttingList parts={[]} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Qty')).toBeTruthy()
    expect(screen.getByText('Labels')).toBeTruthy()
    expect(screen.getByText('Material')).toBeTruthy()
    expect(screen.getByText('Color')).toBeTruthy()
    expect(screen.getByText('Length (mm)')).toBeTruthy()
    expect(screen.getByText('Width (mm)')).toBeTruthy()
    expect(screen.getByText('Thickness (mm)')).toBeTruthy()
    expect(screen.getByText('Cuts')).toBeTruthy()
    expect(screen.queryByText('Label')).toBeNull()
  })

  it('renders correct field values in data row', () => {
    const cuts = [
      {
        id: 'c1',
        label: 'C1',
        face: '+X' as const,
        position: { x: 0, y: 0, z: 0 },
        size: { x: 10, y: 20, z: 20 },
      },
    ]
    render(
      <CuttingList
        parts={[makePart({ length: 600, width: 300, thickness: 18, cuts })]}
        projectName="Test"
        onClose={vi.fn()}
      />,
    )
    const rows = screen.getAllByRole('row')
    // rows[0] = header, rows[1] = first data row
    expect(rows[1].textContent).toContain('1') // qty
    expect(rows[1].textContent).toContain('Left Side') // labels
    expect(rows[1].textContent).toContain('—') // material blank → dash
    expect(rows[1].textContent).toContain('600')
    expect(rows[1].textContent).toContain('300')
    expect(rows[1].textContent).toContain('18')
    expect(rows[1].textContent).toContain('1') // cuts
  })

  it('shows "No parts" when parts array is empty', () => {
    render(<CuttingList parts={[]} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('No parts')).toBeTruthy()
  })

  it('calls onClose when the overlay is clicked', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('cl-overlay'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose when the panel itself is clicked', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} />)
    fireEvent.click(screen.getByTestId('cl-panel'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Download .csv button triggers file download with projectName as filename', () => {
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    render(<CuttingList parts={[makePart()]} projectName="My Project" onClose={vi.fn()} />)

    // Mock AFTER render so React's own createElement calls during render don't consume it
    const clickSpy = vi.fn()
    const mockAnchor = { href: '', download: '', click: clickSpy }
    vi.spyOn(document, 'createElement').mockReturnValueOnce(
      mockAnchor as unknown as HTMLAnchorElement,
    )

    fireEvent.click(screen.getByRole('button', { name: /Download \.csv/ }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(mockAnchor.download).toBe('My Project.csv')
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('Copy CSV button writes CSV content to clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    render(<CuttingList parts={[makePart()]} projectName="Test" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Copy CSV/ }))

    expect(writeText).toHaveBeenCalledOnce()
    const csvArg = writeText.mock.calls[0][0] as string
    expect(csvArg.split('\n')[0]).toBe(
      'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts,Cost/unit,Total',
    )
    expect(csvArg).toContain('1,Left Side,,#8b6914,600,300,18,0,,')
  })

  it('renders the Color column header and the hex value for a part', () => {
    render(<CuttingList parts={[makePart()]} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Color')).toBeTruthy()
    expect(screen.getByText('#8b6914')).toBeTruthy()
  })

  it('renders only cl-panel (no cl-overlay) when hideExportButtons is true', () => {
    render(<CuttingList parts={[]} projectName="Test" onClose={vi.fn()} hideExportButtons />)
    expect(screen.queryByTestId('cl-overlay')).toBeNull()
    expect(screen.getByTestId('cl-panel')).toBeTruthy()
  })

  it('does not handle Escape when hideExportButtons is true', () => {
    const onClose = vi.fn()
    render(<CuttingList parts={[]} projectName="Test" onClose={onClose} hideExportButtons />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows cost columns with values when material rate is set', () => {
    const part: Part = {
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
    }
    render(
      <CuttingList
        parts={[part]}
        projectName="Test"
        onClose={vi.fn()}
        materials={{ Plywood: { costPerM2: 100 } }}
      />,
    )
    // 600×300mm = 0.18 m² × $100 = $18.00 (appears in both cost/unit and total columns)
    expect(screen.getAllByText('$18.00').length).toBeGreaterThanOrEqual(1)
  })

  it('shows — in cost columns when no material rate is set', () => {
    const part: Part = {
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
    }
    render(<CuttingList parts={[part]} projectName="Test" onClose={vi.fn()} />)
    // should show — for both cost columns
    const dashes = screen.getAllByText('—')
    // at least 2 dashes for the two cost columns
    expect(dashes.length).toBeGreaterThanOrEqual(2)
  })

  it('does not call onMaterialCostChange when popover closes without changing value', () => {
    const onMaterialCostChange = vi.fn()
    const part: Part = {
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
    }
    render(
      <CuttingList
        parts={[part]}
        projectName="Test"
        onClose={vi.fn()}
        materials={{ Plywood: { costPerM2: 45 } }}
        onMaterialCostChange={onMaterialCostChange}
        hideExportButtons
      />,
    )
    // Click material name to open popover (current = 45)
    fireEvent.click(screen.getByText('Plywood'))
    // Blur without changing value — input shows "45", same as current
    fireEvent.blur(screen.getByRole('spinbutton'))
    expect(onMaterialCostChange).not.toHaveBeenCalled()
  })

  it('preserves existing costPerM when saving a new costPerM2 via the popover', () => {
    const onMaterialCostChange = vi.fn()
    const part = makePart({ id: 'p1', material: 'Oak' })
    render(
      <CuttingList
        parts={[part]}
        projectName="Test"
        onClose={vi.fn()}
        materials={{ Oak: { costPerM2: 10, costPerM: 3 } }}
        onMaterialCostChange={onMaterialCostChange}
        hideExportButtons
      />,
    )
    // Open the material rate popover
    fireEvent.click(screen.getByText('Oak'))
    // Change the costPerM2 value
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '25' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // costPerM2 updated; costPerM preserved from existing def
    expect(onMaterialCostChange).toHaveBeenCalledWith('Oak', { costPerM2: 25, costPerM: 3 })
  })

  it('shows board subtotal row when any material rate is set', () => {
    const part: Part = {
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
    }
    render(
      <CuttingList
        parts={[part]}
        projectName="Test"
        onClose={vi.fn()}
        materials={{ Plywood: { costPerM2: 100 } }}
      />,
    )
    expect(screen.getByText('Board total')).toBeTruthy()
  })
})
