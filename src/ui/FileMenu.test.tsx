import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { FileMenuProps } from './FileMenu'
import { FileMenu } from './FileMenu'

const baseProps: FileMenuProps = {
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
  onCuttingList: vi.fn(),
  onExportStl: vi.fn(),
  onExportStep: vi.fn(),
  canExport: true,
}

function openMenu() {
  fireEvent.click(screen.getByText('File ▾'))
}

describe('FileMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders an Undo button in the dropdown', () => {
    render(<FileMenu {...baseProps} />)
    openMenu()
    expect(screen.getByRole('button', { name: /^Undo/ })).toBeTruthy()
  })

  it('Undo button is disabled when canUndo=false', () => {
    render(<FileMenu {...baseProps} canUndo={false} />)
    openMenu()
    expect((screen.getByRole('button', { name: /^Undo/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Undo button shows label in quotes: Undo "Add Board 2"', () => {
    render(<FileMenu {...baseProps} canUndo={true} undoLabel="Add Board 2" />)
    openMenu()
    expect(screen.getByRole('button', { name: /Undo "Add Board 2"/ })).toBeTruthy()
  })

  it('clicking Undo when enabled calls onUndo', () => {
    const onUndo = vi.fn()
    render(<FileMenu {...baseProps} canUndo={true} undoLabel="Add Board 2" onUndo={onUndo} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('clicking Undo when disabled does NOT call onUndo', () => {
    const onUndo = vi.fn()
    render(<FileMenu {...baseProps} canUndo={false} onUndo={onUndo} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /^Undo/ }))
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('Redo button is disabled when canRedo=false', () => {
    render(<FileMenu {...baseProps} canRedo={false} />)
    openMenu()
    expect((screen.getByRole('button', { name: /^Redo/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Redo button shows label in quotes: Redo "Add Board 2"', () => {
    render(<FileMenu {...baseProps} canRedo={true} redoLabel="Add Board 2" />)
    openMenu()
    expect(screen.getByRole('button', { name: /Redo "Add Board 2"/ })).toBeTruthy()
  })

  it('clicking Redo when enabled calls onRedo', () => {
    const onRedo = vi.fn()
    render(<FileMenu {...baseProps} canRedo={true} redoLabel="Add Board 2" onRedo={onRedo} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Redo/ }))
    expect(onRedo).toHaveBeenCalledOnce()
  })

  it('Undo button appears above New button in the dropdown', () => {
    render(<FileMenu {...baseProps} />)
    openMenu()
    const buttons = screen.getAllByRole('button')
    const undoIdx = buttons.findIndex((b) => /^Undo/.test(b.textContent ?? ''))
    const newIdx = buttons.findIndex((b) => /^New/.test(b.textContent ?? ''))
    expect(undoIdx).toBeGreaterThanOrEqual(0)
    expect(newIdx).toBeGreaterThanOrEqual(0)
    expect(undoIdx).toBeLessThan(newIdx)
  })

  it('renders Cutting List menu item in the dropdown', () => {
    render(<FileMenu {...baseProps} />)
    openMenu()
    expect(screen.getByRole('button', { name: /Cutting List/ })).toBeTruthy()
  })

  it('clicking Cutting List calls onCuttingList and closes the menu', () => {
    const onCuttingList = vi.fn()
    render(<FileMenu {...baseProps} onCuttingList={onCuttingList} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Cutting List/ }))
    expect(onCuttingList).toHaveBeenCalledOnce()
    // menu closes — New button is no longer visible
    expect(screen.queryByRole('button', { name: /^New/ })).toBeNull()
  })

  it('renders Export STL and Export STEP items', () => {
    render(<FileMenu {...baseProps} />)
    openMenu()
    expect(screen.getByRole('button', { name: /Export STL/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Export STEP/ })).toBeTruthy()
  })

  it('export items are disabled when canExport=false', () => {
    render(<FileMenu {...baseProps} canExport={false} />)
    openMenu()
    expect((screen.getByRole('button', { name: /Export STL/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      (screen.getByRole('button', { name: /Export STEP/ }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('clicking Export STL calls onExportStl', () => {
    const onExportStl = vi.fn()
    render(<FileMenu {...baseProps} onExportStl={onExportStl} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Export STL/ }))
    expect(onExportStl).toHaveBeenCalledOnce()
  })

  it('clicking Export STEP calls onExportStep', () => {
    const onExportStep = vi.fn()
    render(<FileMenu {...baseProps} onExportStep={onExportStep} />)
    openMenu()
    fireEvent.click(screen.getByRole('button', { name: /Export STEP/ }))
    expect(onExportStep).toHaveBeenCalledOnce()
  })
})
