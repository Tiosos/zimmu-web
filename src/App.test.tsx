import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import App from './App'

const mockUndo = vi.fn()
const mockRedo = vi.fn()

vi.mock('./scene/useScene', () => ({
  useScene: () => ({
    scene: { parts: [] },
    geometries: new Map(),
    errors: new Map(),
    pendingIds: new Set(),
    selectedId: null,
    occtReady: true,
    nextLabel: 'Board 1',
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
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
})
