import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { buildCsv } from './buildCsv'
import { CuttingList } from './CuttingList'
import type { Part } from '../scene/types'

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Left Side',
    length: 600,
    width: 300,
    thickness: 18,
    color: '#8b6914',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    ...overrides,
  }
}

describe('buildCsv', () => {
  it('returns only the header when parts array is empty', () => {
    expect(buildCsv([])).toBe('Label,Length (mm),Width (mm),Thickness (mm),Cuts')
  })

  it('returns header + one data row per part', () => {
    const csv = buildCsv([makePart(), makePart({ id: 'p2', label: 'Right Side' })])
    expect(csv.split('\n')).toHaveLength(3)
  })

  it('formats a data row with correct field values', () => {
    const csv = buildCsv([makePart({ length: 600, width: 300, thickness: 18 })])
    expect(csv.split('\n')[1]).toBe('Left Side,600,300,18,0')
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
    expect(csv.split('\n')[1]).toBe('Left Side,600,300,18,2')
  })

  it('wraps label in double quotes when it contains a comma', () => {
    const csv = buildCsv([makePart({ label: 'Left, Side' })])
    expect(csv.split('\n')[1]).toMatch(/^"Left, Side",/)
  })

  it('escapes embedded double-quotes as "" per RFC 4180', () => {
    const csv = buildCsv([makePart({ label: '5" shelf' })])
    expect(csv.split('\n')[1]).toMatch(/^"5"" shelf",/)
  })
})

describe('CuttingList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders a row for each part', () => {
    const parts = [makePart(), makePart({ id: 'p2', label: 'Right Side' })]
    render(<CuttingList parts={parts} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Left Side')).toBeTruthy()
    expect(screen.getByText('Right Side')).toBeTruthy()
  })

  it('renders table column headers', () => {
    render(<CuttingList parts={[]} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Label')).toBeTruthy()
    expect(screen.getByText('Length (mm)')).toBeTruthy()
    expect(screen.getByText('Width (mm)')).toBeTruthy()
    expect(screen.getByText('Thickness (mm)')).toBeTruthy()
    expect(screen.getByText('Cuts')).toBeTruthy()
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
    expect(rows[1].textContent).toContain('Left Side')
    expect(rows[1].textContent).toContain('600')
    expect(rows[1].textContent).toContain('300')
    expect(rows[1].textContent).toContain('18')
    expect(rows[1].textContent).toContain('1')
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
    expect(csvArg.split('\n')[0]).toBe('Label,Length (mm),Width (mm),Thickness (mm),Cuts')
    expect(csvArg).toContain('Left Side,600,300,18,0')
  })
})
