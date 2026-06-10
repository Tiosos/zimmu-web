import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import App from './App'

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

vi.mock('./scene/useScene', () => ({
  useScene: () => ({
    scene: { parts: [] },
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
    onSelect: vi.fn(),
    replaceScene: vi.fn(),
    canUndo: true,
    canRedo: false,
    undoLabel: 'Add Board 1',
    redoLabel: null,
    undo: mockUndo,
    redo: mockRedo,
  }),
}))

vi.mock('./render/viewport', () => ({
  Viewport: () => null,
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
})
