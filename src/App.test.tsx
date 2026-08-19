import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup, screen, fireEvent, within } from '@testing-library/react'
import App from './App'
import type { Part } from './scene/types'

const mockUndo = vi.fn()
const mockRedo = vi.fn()
const mockOnDuplicate = vi.fn()
const mockOnToggleVisible = vi.fn()
const mockOnRemove = vi.fn()

let mockSnapActive = false
let mockCutActive = false

vi.mock('./scene/useSnap', () => ({
  useSnap: () => ({
    snapActive: mockSnapActive,
    snapPhase: 'idle' as const,
    sourceFace: null,
    hoveredFace: null,
    activateSnap: vi.fn(),
    cancelSnap: vi.fn(),
    onFaceClick: vi.fn(),
    onFaceHover: vi.fn(),
  }),
}))

vi.mock('./scene/useAddCut', () => ({
  useAddCut: () => ({
    cutActive: mockCutActive,
    lastPlacedCutId: null,
    activateCut: vi.fn(),
    cancelCut: vi.fn(),
    onFaceClick: vi.fn(),
    onFaceHover: vi.fn(),
  }),
}))

const mockUseScene = vi.fn()

vi.mock('./scene/useScene', () => ({
  useScene: (...args: unknown[]) => mockUseScene(...args),
}))

function makeDefaultSceneReturn() {
  return {
    scene: { parts: [], materials: {}, hardware: [], joints: [], components: [] },
    geometries: new Map(),
    errors: new Map(),
    pendingIds: new Set(),
    selectedId: 'board_test',
    occtReady: true,
    nextLabel: 'Board 1',
    onAdd: vi.fn(),
    onRemove: mockOnRemove,
    onDuplicate: mockOnDuplicate,
    onToggleVisible: mockOnToggleVisible,
    onUpdate: vi.fn(),
    onUpdateCut: vi.fn(),
    onRemoveCut: vi.fn(),
    onLinkCuts: vi.fn(),
    onUnlinkCuts: vi.fn(),
    onSelect: vi.fn(),
    replaceScene: vi.fn(),
    exportStep: vi.fn(),
    onUpdateMaterial: vi.fn(),
    onUpdateHardware: vi.fn(),
    canUndo: true,
    canRedo: false,
    undoLabel: 'Add Board 1',
    redoLabel: null,
    undo: mockUndo,
    redo: mockRedo,
  }
}

const viewportSpy = vi.hoisted(() => ({ fitRequest: 0 }))

vi.mock('./render/viewport', () => ({
  Viewport: (props: { fitRequest: number }) => {
    viewportSpy.fitRequest = props.fitRequest
    return null
  },
}))

vi.mock('./scene/useFile', () => ({
  useFile: () => ({
    fileReady: true,
    fileName: null,
    projectName: 'Test',
    isDirty: false,
    fileError: null,
    newFile: vi.fn(),
    openFile: vi.fn(),
    saveFile: vi.fn(),
    saveAsFile: vi.fn(),
    setProjectName: vi.fn(),
  }),
}))

describe('App keyboard shortcuts', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockSnapActive = false
    mockCutActive = false
    mockUseScene.mockImplementation(makeDefaultSceneReturn)
  })

  it('Delete calls onRemove with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })
    expect(mockOnRemove).toHaveBeenCalledWith('board_test')
  })

  it('Backspace calls onRemove with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    })
    expect(mockOnRemove).toHaveBeenCalledWith('board_test')
  })

  it('Delete does not call onRemove when snap mode is active', async () => {
    mockSnapActive = true
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })
    expect(mockOnRemove).not.toHaveBeenCalled()
  })

  it('Delete does not call onRemove when cut mode is active', async () => {
    mockCutActive = true
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    })
    expect(mockOnRemove).not.toHaveBeenCalled()
  })

  it('Ctrl+Z calls undo()', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    })
    expect(mockUndo).toHaveBeenCalledOnce()
  })

  it('Ctrl+Y calls redo() (Safari alias)', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }))
    })
    expect(mockRedo).toHaveBeenCalledOnce()
  })

  it('Ctrl+D calls onDuplicate with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }))
    })
    expect(mockOnDuplicate).toHaveBeenCalledWith('board_test')
  })

  it('H calls onToggleVisible with the selected part id', async () => {
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    })
    expect(mockOnToggleVisible).toHaveBeenCalledWith('board_test')
  })

  it('H does not call onToggleVisible when snap mode is active', async () => {
    mockSnapActive = true
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    })
    expect(mockOnToggleVisible).not.toHaveBeenCalled()
  })

  it('H does not call onToggleVisible when cut mode is active', async () => {
    mockCutActive = true
    render(<App />)
    await act(async () => {})
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
    })
    expect(mockOnToggleVisible).not.toHaveBeenCalled()
  })

  it('Home requests a camera fit', async () => {
    render(<App />)
    await act(async () => {})
    const before = viewportSpy.fitRequest
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(viewportSpy.fitRequest).toBe(before + 1)
  })

  it('Home inside a text input does not request a fit', async () => {
    render(<App />)
    await act(async () => {})
    const before = viewportSpy.fitRequest
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(viewportSpy.fitRequest).toBe(before)
    input.remove()
  })
})

describe('App BOM integration', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockSnapActive = false
    mockCutActive = false
  })

  it('adds a dowel and lists it in the Dowels BOM tab', async () => {
    // Stateful mock: onAdd('cylinder') pushes a dowel into scene.parts so the
    // BomModal sees it when it opens.
    mockUseScene.mockImplementation(() => {
      const [parts, setParts] = useState<Part[]>([])
      return {
        scene: { parts, materials: {}, hardware: [], joints: [] },
        geometries: new Map(),
        errors: new Map(),
        pendingIds: new Set(),
        selectedId: null,
        occtReady: true,
        nextLabel: 'Board 1',
        onAdd: (kind: 'board' | 'cylinder') => {
          if (kind === 'cylinder') {
            setParts((prev) => [
              ...prev,
              {
                kind: 'cylinder' as const,
                id: 'dowel_test_1',
                label: 'Dowel 1',
                diameter: 8,
                length: 100,
                material: '',
                color: '#888888',
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0 },
                rotationOrder: 'XYZ' as const,
                cuts: [],
                visible: true,
                parentId: null,
                driven: false,
              },
            ])
          }
        },
        onRemove: vi.fn(),
        onDuplicate: vi.fn(),
        onToggleVisible: vi.fn(),
        onUpdate: vi.fn(),
        onUpdateCut: vi.fn(),
        onRemoveCut: vi.fn(),
        onLinkCuts: vi.fn(),
        onUnlinkCuts: vi.fn(),
        onSelect: vi.fn(),
        replaceScene: vi.fn(),
        exportStep: vi.fn(),
        onUpdateMaterial: vi.fn(),
        onUpdateHardware: vi.fn(),
        canUndo: false,
        canRedo: false,
        undoLabel: null,
        redoLabel: null,
        undo: vi.fn(),
        redo: vi.fn(),
      }
    })

    render(<App />)
    await act(async () => {})

    // Add a dowel via the sidebar button
    fireEvent.click(screen.getByText('+ Dowel'))

    // Open the BOM modal via Ctrl+Shift+E
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'E', shiftKey: true, ctrlKey: true, bubbles: true }),
      )
    })

    // Switch to the Dowels tab
    fireEvent.click(await screen.findByRole('tab', { name: 'Dowels' }))

    // Scope assertions to the BOM panel to prove the Dowels tab actually rendered DowelList
    const bomPanel = screen.getByTestId('bom-panel')
    // "Diameter (mm)" is rendered only by DowelList, proving the Dowels tab is active
    expect(within(bomPanel).getByText('Diameter (mm)')).toBeTruthy()
    // The dowel itself appears inside the BOM panel (not just the sidebar)
    expect(within(bomPanel).getByText('Dowel 1')).toBeTruthy()
  })
})
