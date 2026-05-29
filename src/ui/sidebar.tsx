import { useState, useEffect } from 'react'
import type { Part, PartId, Scene } from '../scene/types'
import { useDebouncedCallback } from './useDebouncedCallback'

interface SidebarProps {
  scene: Scene
  occtReady: boolean
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  nextLabel: string
  onAdd: () => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part) => void
  selectedId: PartId | null
  onSelect: (id: PartId | null) => void
}

const s = {
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 8px',
    cursor: 'pointer',
    userSelect: 'none',
  } as React.CSSProperties,
  iconBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 2px',
    lineHeight: 1,
  } as React.CSSProperties,
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  } as React.CSSProperties,
  input: {
    flex: 1,
    background: '#111',
    border: '1px solid #444',
    color: '#ccc',
    padding: '3px 6px',
    fontSize: 12,
    borderRadius: 2,
    minWidth: 0,
  } as React.CSSProperties,
  suffix: { fontSize: 11, color: '#666', flexShrink: 0 } as React.CSSProperties,
  groupHdr: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#888',
    cursor: 'pointer',
    padding: '6px 0 2px',
    userSelect: 'none',
  } as React.CSSProperties,
}

function DimInput({
  value,
  onCommit,
  suffix,
  min = 1,
}: {
  value: number
  onCommit: (v: number) => void
  suffix: string
  min?: number
}) {
  const debounced = useDebouncedCallback(onCommit, 150)
  return (
    <div style={s.inputRow}>
      <input
        type="number"
        step="any"
        style={s.input}
        defaultValue={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (isFinite(v) && v >= min) debounced(v)
        }}
        onBlur={(e) => {
          const v = parseFloat(e.target.value)
          if (!isFinite(v) || v < min) {
            e.target.value = String(min)
            onCommit(min)
          }
        }}
      />
      <span style={s.suffix}>{suffix}</span>
    </div>
  )
}

function NumInput({
  value,
  onChange,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  suffix: string
}) {
  return (
    <div style={s.inputRow}>
      <input
        type="number"
        step="any"
        style={s.input}
        defaultValue={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      <span style={s.suffix}>{suffix}</span>
    </div>
  )
}

function EditPanel({
  part,
  onUpdate,
  nextLabel,
}: {
  part: Part
  onUpdate: (id: PartId, updater: (p: Part) => Part) => void
  nextLabel: string
}) {
  const [shapeOpen, setShapeOpen] = useState(true)
  const [posOpen, setPosOpen] = useState(true)
  const [rotOpen, setRotOpen] = useState(true)
  if (part.kind !== 'board') return null
  // `autoFocus` fires on mount. EditPanel is keyed by part.id in Sidebar,
  // so it remounts on every selection change — focusing the label each time.
  return (
    <div style={{ padding: 8, borderTop: '1px solid #333' }}>
      <div style={s.inputRow}>
        <input
          autoFocus
          style={{ ...s.input, flex: 1 }}
          defaultValue={part.label}
          onChange={(e) => {
            const label = e.target.value
            onUpdate(part.id, (p) => ({ ...p, label }))
          }}
          onBlur={(e) => {
            if (!e.target.value.trim()) {
              e.target.value = nextLabel
              onUpdate(part.id, (p) => ({ ...p, label: nextLabel }))
            }
          }}
        />
      </div>
      <div style={s.groupHdr} onClick={() => setShapeOpen((v) => !v)}>
        {shapeOpen ? '▾' : '▸'} Shape
      </div>
      {shapeOpen && (
        <>
          <DimInput
            value={part.length}
            suffix="mm"
            onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, length: v }))}
          />
          <DimInput
            value={part.width}
            suffix="mm"
            onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, width: v }))}
          />
          <DimInput
            value={part.thickness}
            suffix="mm"
            onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, thickness: v }))}
          />
        </>
      )}
      <div style={s.groupHdr} onClick={() => setPosOpen((v) => !v)}>
        {posOpen ? '▾' : '▸'} Position
      </div>
      {posOpen && (
        <>
          <NumInput
            value={part.position.x}
            suffix="mm"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, position: { ...p.position, x: v } }))
            }
          />
          <NumInput
            value={part.position.y}
            suffix="mm"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, position: { ...p.position, y: v } }))
            }
          />
          <NumInput
            value={part.position.z}
            suffix="mm"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, position: { ...p.position, z: v } }))
            }
          />
        </>
      )}
      <div style={s.groupHdr} onClick={() => setRotOpen((v) => !v)}>
        {rotOpen ? '▾' : '▸'} Rotation
      </div>
      {rotOpen && (
        <>
          <NumInput
            value={part.rotation.x}
            suffix="°"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, rotation: { ...p.rotation, x: v } }))
            }
          />
          <NumInput
            value={part.rotation.y}
            suffix="°"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, rotation: { ...p.rotation, y: v } }))
            }
          />
          <NumInput
            value={part.rotation.z}
            suffix="°"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, rotation: { ...p.rotation, z: v } }))
            }
          />
        </>
      )}
    </div>
  )
}

export function Sidebar({
  scene,
  occtReady,
  errors,
  pendingIds,
  nextLabel,
  onAdd,
  onRemove,
  onDuplicate,
  onUpdate,
  selectedId,
  onSelect,
}: SidebarProps) {
  const selectedPart = scene.parts.find((p) => p.id === selectedId) ?? null

  // Inject keyframes for pending spinner animation
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent =
      '@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
    }
  }, [])

  return (
    <div
      style={{
        width: 240,
        height: '100%',
        background: '#1a1a1d',
        borderLeft: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {scene.parts.length === 0 ? (
          <div style={{ padding: 16, color: '#555', fontSize: 12, textAlign: 'center' }}>
            No parts — add a board to start
          </div>
        ) : (
          scene.parts.map((part) => {
            const isPending = pendingIds.has(part.id)
            const error = errors.get(part.id)
            return (
              <div
                key={part.id}
                style={{ ...s.row, background: part.id === selectedId ? '#2a2a2d' : 'transparent' }}
                onClick={() => onSelect(part.id)}
              >
                {error ? (
                  <span title={error} style={{ fontSize: 12, color: '#e74c3c' }}>
                    ⚠
                  </span>
                ) : isPending ? (
                  <span
                    style={{
                      fontSize: 12,
                      color: '#888',
                      display: 'inline-block',
                      animation: 'spin 1s linear infinite',
                    }}
                  >
                    ⟳
                  </span>
                ) : (
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      flexShrink: 0,
                      background: part.color,
                    }}
                  />
                )}
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    color: '#ccc',
                  }}
                >
                  {part.label}
                </span>
                <button
                  style={s.iconBtn}
                  title="Duplicate"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDuplicate(part.id)
                  }}
                >
                  ⧉
                </button>
                <button
                  style={s.iconBtn}
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(part.id)
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })
        )}
      </div>
      {selectedPart && (
        <EditPanel
          key={selectedPart.id}
          part={selectedPart}
          onUpdate={onUpdate}
          nextLabel={nextLabel}
        />
      )}
      <div style={{ padding: 8, borderTop: '1px solid #333' }}>
        <button
          onClick={onAdd}
          disabled={!occtReady}
          title={!occtReady ? 'Loading geometry engine…' : undefined}
          style={{
            width: '100%',
            padding: '7px 0',
            background: occtReady ? '#2a2a4a' : '#222',
            color: occtReady ? '#ccc' : '#555',
            border: '1px solid #444',
            borderRadius: 3,
            cursor: occtReady ? 'pointer' : 'not-allowed',
            fontSize: 12,
          }}
        >
          + Add board
        </button>
      </div>
    </div>
  )
}
