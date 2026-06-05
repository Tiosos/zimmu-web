import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export interface FileMenuProps {
  fileName: string | null
  projectName: string
  isDirty: boolean
  fileError: string | null
  onNew: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onProjectNameChange: (name: string) => void
  onCuttingList: () => void
  onExportStl: () => void
  onExportStep: () => void
  canExport: boolean
  partsCount: number
  supported: boolean
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  onUndo: () => void
  onRedo: () => void
}

export function FileMenu({
  fileName,
  projectName,
  isDirty,
  fileError,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onProjectNameChange,
  onCuttingList,
  onExportStl,
  onExportStep,
  canExport,
  partsCount,
  supported,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
}: FileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    document.title = `${isDirty ? '● ' : ''}${projectName} — Zimmu`
  }, [isDirty, projectName])

  useEffect(() => {
    if (isEditing) inputRef.current?.select()
  }, [isEditing])

  const commitName = useCallback(() => {
    const value = inputRef.current?.value.trim() || 'Untitled'
    onProjectNameChange(value)
    setIsEditing(false)
  }, [onProjectNameChange])

  const isSaveDisabled = !supported || (!isDirty && fileName !== null)

  const menuItem = (label: string, shortcut: string, onClick: () => void, disabled: boolean) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={
        disabled
          ? undefined
          : () => {
              onClick()
              setIsOpen(false)
            }
      }
      disabled={disabled}
      aria-disabled={disabled}
      className="w-full justify-between rounded-none px-3 text-xs font-normal h-8 gap-8"
    >
      <span>{label}</span>
      <span className="opacity-50 text-[11px]">{shortcut}</span>
    </Button>
  )

  return (
    <div className="h-10 flex items-center flex-shrink-0 bg-[#18181b] border-b border-border text-sm text-foreground select-none gap-1 px-2">
      {/* Wordmark */}
      <span className="font-semibold tracking-widest mr-1 opacity-90 text-xs">Zimmu</span>

      {/* File dropdown */}
      <div ref={menuRef} className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen((o) => !o)}
          className={`text-xs h-7 px-2 rounded ${isOpen ? 'bg-accent' : ''}`}
        >
          File ▾
        </Button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-0.5 bg-card border border-border rounded-md shadow-xl z-50 min-w-[180px] py-1">
            {menuItem(undoLabel ? `Undo "${undoLabel}"` : 'Undo', '⌘Z', onUndo, !canUndo)}
            {menuItem(redoLabel ? `Redo "${redoLabel}"` : 'Redo', '⌘⇧Z', onRedo, !canRedo)}
            <Separator className="my-1" />
            {menuItem('New', '⌘N', onNew, !supported)}
            {menuItem('Open…', '⌘O', onOpen, !supported)}
            <Separator className="my-1" />
            {menuItem('Save', '⌘S', onSave, isSaveDisabled)}
            {menuItem('Save As…', '⌘⇧S', onSaveAs, !supported)}
            <Separator className="my-1" />
            {menuItem('Cutting List…', '⌘⇧E', onCuttingList, false)}
            <Separator className="my-1" />
            {menuItem('Export STL…', '', onExportStl, !canExport)}
            {menuItem('Export STEP…', '', onExportStep, !canExport)}
          </div>
        )}
      </div>

      {/* Center: dirty indicator + project name + filename */}
      <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
        {isDirty && <span className="text-muted-foreground text-[10px]">●</span>}
        {isEditing ? (
          <input
            ref={inputRef}
            defaultValue={projectName}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            className="bg-secondary border border-border rounded text-foreground text-xs px-1.5 py-0.5 outline-none"
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            title="Click to rename"
            className="cursor-text max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-xs"
          >
            {projectName}
          </span>
        )}
        {fileError ? (
          <span className="text-destructive-foreground text-xs">{fileError}</span>
        ) : fileName ? (
          <span className="text-muted-foreground text-xs">· {fileName}</span>
        ) : !supported ? (
          <span className="text-muted-foreground text-xs">· Save/Load requires Chrome or Edge</span>
        ) : null}
      </div>

      {/* Right: parts count */}
      <span className="opacity-50 text-xs flex-shrink-0">
        {partsCount} {partsCount === 1 ? 'part' : 'parts'}
      </span>
    </div>
  )
}
