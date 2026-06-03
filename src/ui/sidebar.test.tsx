import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Sidebar } from './sidebar'
import type { CutDef, CutId, Part, PartId, Scene } from '../scene/types'

function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'board_t1',
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
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

function props(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return {
    scene: { parts: [makeBoard()] } as Scene,
    occtReady: true,
    errors: new Map<PartId, string>(),
    pendingIds: new Set<PartId>(),
    nextLabel: 'Board 2',
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
    onUpdate: vi.fn(),
    onUpdateCut: vi.fn(),
    onRemoveCut: vi.fn(),
    onLinkCuts: vi.fn(),
    onUnlinkCuts: vi.fn(),
    lastPlacedCutId: null as CutId | null,
    selectedId: null,
    onSelect: vi.fn(),
    snapActive: false,
    snapPhase: 'idle' as const,
    onSnapToggle: vi.fn(),
    cutActive: false,
    onCutToggle: vi.fn(),
    ...overrides,
  }
}

describe('Sidebar', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders part label', () => {
    render(<Sidebar {...props()} />)
    expect(screen.getByText('Board 1')).toBeTruthy()
  })

  it('shows empty state when no parts', () => {
    render(<Sidebar {...props({ scene: { parts: [] } })} />)
    expect(screen.getByText(/No parts/)).toBeTruthy()
  })

  it('calls onSelect when row clicked', () => {
    const onSelect = vi.fn()
    render(<Sidebar {...props({ onSelect })} />)
    fireEvent.click(screen.getByText('Board 1'))
    expect(onSelect).toHaveBeenCalledWith('board_t1')
  })

  it('calls onAdd when Add board clicked', () => {
    const onAdd = vi.fn()
    render(<Sidebar {...props({ onAdd })} />)
    fireEvent.click(screen.getByText('+ Add board'))
    expect(onAdd).toHaveBeenCalled()
  })

  it('Add board button is disabled when occtReady is false', () => {
    render(<Sidebar {...props({ occtReady: false })} />)
    expect((screen.getByText('+ Add board').closest('button') as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('calls onRemove when delete clicked', () => {
    const onRemove = vi.fn()
    render(<Sidebar {...props({ onRemove })} />)
    fireEvent.click(screen.getByTitle('Delete'))
    expect(onRemove).toHaveBeenCalledWith('board_t1')
  })

  it('calls onDuplicate when duplicate clicked', () => {
    const onDuplicate = vi.fn()
    render(<Sidebar {...props({ onDuplicate })} />)
    fireEvent.click(screen.getByTitle('Duplicate'))
    expect(onDuplicate).toHaveBeenCalledWith('board_t1')
  })

  it('shows edit panel when a part is selected', () => {
    render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
    expect(screen.getByText(/Shape/i)).toBeTruthy()
    expect(screen.getByText(/Position/i)).toBeTruthy()
    expect(screen.getByText(/Rotation/i)).toBeTruthy()
  })

  it('hides edit panel when nothing is selected', () => {
    render(<Sidebar {...props({ selectedId: null })} />)
    expect(screen.queryByText('▾ Shape')).toBeNull()
  })

  it('shows pending spinner for in-flight parts', () => {
    render(<Sidebar {...props({ pendingIds: new Set(['board_t1']) })} />)
    expect(screen.getByText('⟳')).toBeTruthy()
  })

  it('shows error indicator for failed parts', () => {
    render(<Sidebar {...props({ errors: new Map([['board_t1', 'OCCT failed']]) })} />)
    expect(screen.getByText('⚠')).toBeTruthy()
  })

  it('shows Cuts section header when a part is selected', () => {
    render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
    expect(screen.getByText(/▾ Cuts/)).toBeTruthy()
  })

  it('shows "No cuts" placeholder when part has zero cuts', () => {
    render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
    expect(screen.getByText(/No cuts/i)).toBeTruthy()
  })

  it('renders a cut row when part has one cut', () => {
    const cut: CutDef = {
      id: 'cut_1',
      label: 'Dado',
      face: '+Z',
      position: { x: 90, y: 40, z: 15 },
      size: { x: 20, y: 20, z: 10 },
    }
    const scene = { parts: [makeBoard({ cuts: [cut] })] }
    render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
    expect(screen.getByText('Dado')).toBeTruthy()
  })

  it('delete button on cut row calls onRemoveCut', () => {
    const onRemoveCut = vi.fn()
    const cut: CutDef = {
      id: 'cut_1',
      label: 'Dado',
      face: '+Z',
      position: { x: 90, y: 40, z: 15 },
      size: { x: 20, y: 20, z: 10 },
    }
    const scene = { parts: [makeBoard({ cuts: [cut] })] }
    render(<Sidebar {...props({ scene, selectedId: 'board_t1', onRemoveCut })} />)
    fireEvent.click(screen.getByTitle('Delete cut'))
    expect(onRemoveCut).toHaveBeenCalledWith('board_t1', 'cut_1')
  })
})
