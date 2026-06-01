import { useState, useEffect, useRef, useCallback } from 'react'

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
    <button
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
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        padding: '6px 12px',
        background: 'none',
        border: 'none',
        color: disabled ? '#555' : '#ccc',
        cursor: disabled ? 'default' : 'pointer',
        fontSize: 13,
        gap: 32,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label}</span>
      <span style={{ opacity: 0.55, fontSize: 11 }}>{shortcut}</span>
    </button>
  )

  return (
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        background: '#18181b',
        borderBottom: '1px solid #2a2a2d',
        fontSize: 13,
        color: '#ccc',
        userSelect: 'none',
        gap: 4,
        padding: '0 8px',
      }}
    >
      {/* Left: wordmark + File menu */}
      <span style={{ fontWeight: 600, letterSpacing: 1, marginRight: 4, opacity: 0.9 }}>Zimmu</span>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setIsOpen((o) => !o)}
          style={{
            background: isOpen ? '#2a2a2d' : 'none',
            border: 'none',
            color: '#ccc',
            padding: '4px 8px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          File ▾
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 2,
              background: '#1e1e21',
              border: '1px solid #2a2a2d',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 100,
              minWidth: 180,
              padding: '4px 0',
            }}
          >
            {menuItem(undoLabel ? `Undo "${undoLabel}"` : 'Undo', '⌘Z', onUndo, !canUndo)}
            {menuItem(redoLabel ? `Redo "${redoLabel}"` : 'Redo', '⌘⇧Z', onRedo, !canRedo)}
            <div style={{ height: 1, background: '#2a2a2d', margin: '4px 0' }} />
            {menuItem('New', '⌘N', onNew, !supported)}
            {menuItem('Open…', '⌘O', onOpen, !supported)}
            <div style={{ height: 1, background: '#2a2a2d', margin: '4px 0' }} />
            {menuItem('Save', '⌘S', onSave, isSaveDisabled)}
            {menuItem('Save As…', '⌘⇧S', onSaveAs, !supported)}
            <div style={{ height: 1, background: '#2a2a2d', margin: '4px 0' }} />
            {menuItem('Cutting List…', '⌘⇧E', onCuttingList, false)}
          </div>
        )}
      </div>

      {/* Center: dirty indicator + project name + filename */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        {isDirty && <span style={{ color: '#888', fontSize: 10 }}>●</span>}
        {isEditing ? (
          <input
            ref={inputRef}
            defaultValue={projectName}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            style={{
              background: '#2a2a2d',
              border: '1px solid #444',
              borderRadius: 4,
              color: '#fff',
              fontSize: 13,
              padding: '2px 6px',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            title="Click to rename"
            style={{
              cursor: 'text',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {projectName}
          </span>
        )}
        {fileError ? (
          <span style={{ color: '#f87171', fontSize: 12 }}>{fileError}</span>
        ) : fileName ? (
          <span style={{ color: '#555', fontSize: 12 }}>· {fileName}</span>
        ) : !supported ? (
          <span style={{ color: '#555', fontSize: 12 }}>· Save/Load requires Chrome or Edge</span>
        ) : null}
      </div>

      {/* Right: parts count */}
      <span style={{ opacity: 0.5, fontSize: 12, flexShrink: 0 }}>
        {partsCount} {partsCount === 1 ? 'part' : 'parts'}
      </span>
    </div>
  )
}
