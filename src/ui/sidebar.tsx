import { useState, useEffect, useRef, useMemo } from 'react'
import type { CutDef, CutId, Part, PartId, Scene } from '../scene/types'
import { useDebouncedCallback } from './useDebouncedCallback'
import { faceAxes } from '../scene/snapMath'

interface SidebarProps {
  scene: Scene
  occtReady: boolean
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  nextLabel: string
  onAdd: () => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  lastPlacedCutId: CutId | null
  selectedId: PartId | null
  onSelect: (id: PartId | null) => void
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  onSnapToggle: () => void
  cutActive: boolean
  onCutToggle: () => void
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
  const [localValue, setLocalValue] = useState(String(value))
  const isFocused = useRef(false)
  const debounced = useDebouncedCallback(onCommit, 150)

  useEffect(() => {
    if (!isFocused.current) setLocalValue(String(value))
  }, [value])

  return (
    <div style={s.inputRow}>
      <input
        type="number"
        step="any"
        style={s.input}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
          const v = parseFloat(e.target.value)
          if (isFinite(v) && v >= min) debounced(v)
        }}
        onFocus={() => {
          isFocused.current = true
        }}
        onBlur={(e) => {
          isFocused.current = false
          const v = parseFloat(e.target.value)
          if (!isFinite(v) || v < min) {
            setLocalValue(String(min))
            onCommit(min)
          } else {
            setLocalValue(String(v))
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
  const [localValue, setLocalValue] = useState(String(value))
  const isFocused = useRef(false)

  useEffect(() => {
    if (!isFocused.current) setLocalValue(String(value))
  }, [value])

  return (
    <div style={s.inputRow}>
      <input
        type="number"
        step="any"
        style={s.input}
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value)
          onChange(parseFloat(e.target.value) || 0)
        }}
        onFocus={() => {
          isFocused.current = true
        }}
        onBlur={() => {
          isFocused.current = false
        }}
      />
      <span style={s.suffix}>{suffix}</span>
    </div>
  )
}

function CutRow({
  cut,
  partId,
  scene,
  onUpdateCut,
  onRemoveCut,
  onLinkCuts,
  onUnlinkCuts,
  defaultOpen,
}: {
  cut: CutDef
  partId: PartId
  scene: Scene
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  // Build cut lookup once for pairing display
  const cutLookup = useMemo(() => {
    const map = new Map<string, { partId: PartId; cut: CutDef; partLabel: string }>()
    for (const p of scene.parts) {
      for (const c of p.cuts) {
        map.set(`${p.id}:${c.id}`, { partId: p.id, cut: c, partLabel: p.label })
      }
    }
    return map
  }, [scene.parts])

  const pairedEntry = cut.pairedCutId ? (cutLookup.get(cut.pairedCutId) ?? null) : null
  const pairLost = !!cut.pairedCutId && !pairedEntry

  // All cuts on other boards for the link dropdown
  const linkOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = []
    for (const p of scene.parts) {
      if (p.id === partId) continue
      for (const c of p.cuts) {
        opts.push({ value: `${p.id}:${c.id}`, label: `${p.label} › ${c.label}` })
      }
    }
    return opts
  }, [scene.parts, partId])

  return (
    <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 2 }}>
      <div
        style={{ ...s.groupHdr, display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1 }}>{cut.label}</span>
        <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{cut.face}</span>
        <button
          title="Delete cut"
          style={{ ...s.iconBtn, color: '#c0392b' }}
          onClick={(e) => {
            e.stopPropagation()
            onRemoveCut(partId, cut.id)
          }}
        >
          ✕
        </button>
      </div>
      {open && (
        <div style={{ paddingLeft: 8 }}>
          <div style={{ ...s.groupHdr, cursor: 'default' }}>Size</div>
          <DimInput
            value={cut.size[faceAxes(cut.face).depth]}
            suffix="mm depth"
            min={0.1}
            onCommit={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                size: { ...c.size, [faceAxes(c.face).depth]: v },
              }))
            }
          />
          <DimInput
            value={cut.size[faceAxes(cut.face).u]}
            suffix="mm width"
            min={0.1}
            onCommit={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                size: { ...c.size, [faceAxes(c.face).u]: v },
              }))
            }
          />
          <DimInput
            value={cut.size[faceAxes(cut.face).v]}
            suffix="mm height"
            min={0.1}
            onCommit={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                size: { ...c.size, [faceAxes(c.face).v]: v },
              }))
            }
          />
          <div style={{ ...s.groupHdr, cursor: 'default' }}>Offset</div>
          <NumInput
            value={cut.position[faceAxes(cut.face).u]}
            suffix="mm U"
            onChange={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                position: { ...c.position, [faceAxes(c.face).u]: v },
              }))
            }
          />
          <NumInput
            value={cut.position[faceAxes(cut.face).v]}
            suffix="mm V"
            onChange={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                position: { ...c.position, [faceAxes(c.face).v]: v },
              }))
            }
          />
          <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
            {pairLost ? (
              <span style={{ color: '#c0392b' }}>
                Pair lost{' '}
                <button style={s.iconBtn} onClick={() => onUnlinkCuts(partId, cut.id)}>
                  Unlink
                </button>
              </span>
            ) : pairedEntry ? (
              <span>
                ↔ {pairedEntry.partLabel} › {pairedEntry.cut.label}{' '}
                <button style={s.iconBtn} onClick={() => onUnlinkCuts(partId, cut.id)}>
                  Unlink
                </button>
              </span>
            ) : linkOptions.length > 0 ? (
              <select
                style={{ ...s.input, fontSize: 11 }}
                value=""
                onChange={(e) => {
                  const [pId, cId] = e.target.value.split(':') as [PartId, CutId]
                  onLinkCuts(partId, cut.id, pId, cId)
                }}
              >
                <option value="">Link to cut…</option>
                {linkOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function EditPanel({
  part,
  onUpdate,
  onUpdateCut,
  onRemoveCut,
  onLinkCuts,
  onUnlinkCuts,
  lastPlacedCutId,
  scene,
  nextLabel,
}: {
  part: Part
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  lastPlacedCutId: CutId | null
  scene: Scene
  nextLabel: string
}) {
  const [shapeOpen, setShapeOpen] = useState(true)
  const [posOpen, setPosOpen] = useState(true)
  const [rotOpen, setRotOpen] = useState(true)
  const [labelValue, setLabelValue] = useState(part.label)
  const labelFocused = useRef(false)

  useEffect(() => {
    if (!labelFocused.current) setLabelValue(part.label)
  }, [part.label])

  if (part.kind !== 'board') return null
  // `autoFocus` fires on mount. EditPanel is keyed by part.id in Sidebar,
  // so it remounts on every selection change — focusing the label each time.
  return (
    <div style={{ padding: 8, borderTop: '1px solid #333' }}>
      <div style={s.inputRow}>
        <input
          autoFocus
          style={{ ...s.input, flex: 1 }}
          value={labelValue}
          onChange={(e) => {
            setLabelValue(e.target.value)
            onUpdate(part.id, (p) => ({ ...p, label: e.target.value }))
          }}
          onFocus={() => {
            labelFocused.current = true
          }}
          onBlur={(e) => {
            labelFocused.current = false
            if (!e.target.value.trim()) {
              setLabelValue(nextLabel)
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
      <div style={s.groupHdr}>▾ Cuts</div>
      {part.cuts.length === 0 ? (
        <div style={{ fontSize: 11, color: '#555', padding: '2px 0 4px' }}>No cuts</div>
      ) : (
        part.cuts.map((cut) => (
          <CutRow
            key={cut.id}
            cut={cut}
            partId={part.id}
            scene={scene}
            onUpdateCut={onUpdateCut}
            onRemoveCut={onRemoveCut}
            onLinkCuts={onLinkCuts}
            onUnlinkCuts={onUnlinkCuts}
            defaultOpen={cut.id === lastPlacedCutId}
          />
        ))
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
  onUpdateCut,
  onRemoveCut,
  onLinkCuts,
  onUnlinkCuts,
  lastPlacedCutId,
  selectedId,
  onSelect,
  snapActive,
  snapPhase,
  onSnapToggle,
  cutActive,
  onCutToggle,
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
      <div style={{ padding: '8px 8px 0' }}>
        <button
          onClick={onCutToggle}
          style={{
            width: '100%',
            padding: '7px 0',
            background: cutActive ? '#2a3a4a' : '#222',
            color: cutActive ? '#6bb3cb' : '#888',
            border: `1px solid ${cutActive ? '#3a5a6a' : '#333'}`,
            borderRadius: 3,
            cursor: 'pointer',
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          {cutActive ? 'Adding Cut' : 'Add Cut'}
        </button>
        <button
          onClick={onSnapToggle}
          style={{
            width: '100%',
            padding: '7px 0',
            background: snapActive ? '#2a4a2a' : '#222',
            color: snapActive ? '#6bcb6b' : '#888',
            border: `1px solid ${snapActive ? '#3a6a3a' : '#333'}`,
            borderRadius: 3,
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            lineHeight: 1.3,
          }}
        >
          <span>{snapActive ? 'Snapping' : 'Snap faces'}</span>
          {snapActive && (
            <span style={{ fontSize: 10, color: '#aaa' }}>
              {snapPhase === 'idle'
                ? 'Click a face · Esc to cancel'
                : 'Click target face · Esc to cancel'}
            </span>
          )}
        </button>
      </div>
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
          onUpdateCut={onUpdateCut}
          onRemoveCut={onRemoveCut}
          onLinkCuts={onLinkCuts}
          onUnlinkCuts={onUnlinkCuts}
          lastPlacedCutId={lastPlacedCutId}
          scene={scene}
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
