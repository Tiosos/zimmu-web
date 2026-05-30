import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FileMenuProps } from './FileMenu'
import { FileMenu } from './FileMenu'

// FutureFileMenuProps extends the current interface with the undo/redo props that
// don't exist yet. We cast render calls to `unknown as FileMenuProps` so TypeScript
// is satisfied while we're in the TDD red phase. Remove the cast once Task 5 adds
// these props to FileMenuProps.
type FutureFileMenuProps = FileMenuProps & {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  onUndo: () => void
  onRedo: () => void
}

const baseProps: FutureFileMenuProps = {
  fileName: null,
  projectName: 'Test Project',
  isDirty: false,
  fileError: null,
  partsCount: 2,
  supported: true,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onNew: vi.fn(),
  onOpen: vi.fn(),
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onProjectNameChange: vi.fn(),
}

function renderMenu(props: FutureFileMenuProps) {
  render(<FileMenu {...(props as unknown as FileMenuProps)} />)
}

function openMenu() {
  fireEvent.click(screen.getByText('File ▾'))
}

describe('FileMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an Undo button in the dropdown', () => {
    renderMenu(baseProps)
    openMenu()
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeTruthy()
  })

  it('Undo button is disabled when canUndo=false', () => {
    renderMenu({ ...baseProps, canUndo: false })
    openMenu()
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Undo button shows label in quotes: Undo "Add Board 2"', () => {
    renderMenu({ ...baseProps, canUndo: true, undoLabel: 'Add Board 2' })
    openMenu()
    expect(screen.getByRole('button', { name: /Undo "Add Board 2"/ })).toBeTruthy()
  })

  it('clicking Undo when enabled calls onUndo', () => {
    const onUndo = vi.fn()
    renderMenu({ ...baseProps, canUndo: true, undoLabel: 'Add Board 2', onUndo })
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('clicking Undo when disabled does NOT call onUndo', () => {
    const onUndo = vi.fn()
    renderMenu({ ...baseProps, canUndo: false, onUndo })
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }))
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('Redo button is disabled when canRedo=false', () => {
    renderMenu({ ...baseProps, canRedo: false })
    openMenu()
    expect((screen.getByRole('button', { name: /^Redo/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Redo button shows label in quotes: Redo "Add Board 2"', () => {
    renderMenu({ ...baseProps, canRedo: true, redoLabel: 'Add Board 2' })
    openMenu()
    expect(screen.getByRole('button', { name: /Redo "Add Board 2"/ })).toBeTruthy()
  })

  it('clicking Redo when enabled calls onRedo', () => {
    const onRedo = vi.fn()
    renderMenu({ ...baseProps, canRedo: true, redoLabel: 'Add Board 2', onRedo })
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Redo/ }))
    expect(onRedo).toHaveBeenCalledOnce()
  })

  it('Undo button appears above New button in the dropdown', () => {
    renderMenu(baseProps)
    openMenu()
    const buttons = screen.getAllByRole('button')
    const undoIdx = buttons.findIndex((b) => /^Undo/.test(b.textContent ?? ''))
    const newIdx = buttons.findIndex((b) => b.textContent?.trim() === 'New')
    expect(undoIdx).toBeGreaterThanOrEqual(0)
    expect(newIdx).toBeGreaterThanOrEqual(0)
    expect(undoIdx).toBeLessThan(newIdx)
  })
})
