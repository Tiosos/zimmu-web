import { useState, useEffect, useRef, useMemo } from 'react'
import type { BoardPart, CutDef, CutId, Part, PartId, Scene } from '../scene/types'
import { useDebouncedCallback } from './useDebouncedCallback'
import { faceAxes } from '../scene/snapMath'
import { PART_COLORS } from '../scene/palette'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MATERIAL_DATALIST_ID = 'zimmu-material-suggestions'

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
  onToggleVisible: (id: PartId) => void
}

function DimInput({
  label,
  value,
  onCommit,
  suffix,
  min = 1,
}: {
  label: string
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
    <div className="flex items-center gap-1.5 mb-1">
      <Label className="w-4 shrink-0 text-right">{label}</Label>
      <Input
        type="number"
        step="any"
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
        className="flex-1 min-w-0"
      />
      <span className="text-[11px] text-muted-foreground shrink-0 w-10">{suffix}</span>
    </div>
  )
}

function NumInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
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
    <div className="flex items-center gap-1.5 mb-1">
      <Label className="w-4 shrink-0 text-right">{label}</Label>
      <Input
        type="number"
        step="any"
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
        className="flex-1 min-w-0"
      />
      <span className="text-[11px] text-muted-foreground shrink-0 w-10">{suffix}</span>
    </div>
  )
}

function SectionHeader({ open, label }: { open: boolean; label: string }) {
  return (
    <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1.5 cursor-pointer select-none hover:text-foreground transition-colors">
      {open ? '▾' : '▸'} {label}
    </CollapsibleTrigger>
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
    <div className="border-t border-border/30 pt-0.5">
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1 cursor-pointer select-none hover:text-foreground transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="flex-1">{cut.label}</span>
        <span className="font-mono text-[10px] text-border">{cut.face}</span>
        <Button
          variant="ghost"
          size="icon"
          title="Delete cut"
          className="h-5 w-5 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onRemoveCut(partId, cut.id)
          }}
        >
          ✕
        </Button>
      </div>
      {open && (
        <div className="pl-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground pb-0.5 pt-1">
            Size
          </p>
          <DimInput
            label="D"
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
            label="W"
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
            label="H"
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
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground pb-0.5 pt-1">
            Offset
          </p>
          <NumInput
            label="U"
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
            label="V"
            value={cut.position[faceAxes(cut.face).v]}
            suffix="mm V"
            onChange={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                position: { ...c.position, [faceAxes(c.face).v]: v },
              }))
            }
          />
          <div className="mt-1 text-[11px] text-muted-foreground">
            {pairLost ? (
              <span className="text-destructive-foreground">
                Pair lost{' '}
                <button className="underline ml-1" onClick={() => onUnlinkCuts(partId, cut.id)}>
                  Unlink
                </button>
              </span>
            ) : pairedEntry ? (
              <span>
                ↔ {pairedEntry.partLabel} › {pairedEntry.cut.label}{' '}
                <button className="underline ml-1" onClick={() => onUnlinkCuts(partId, cut.id)}>
                  Unlink
                </button>
              </span>
            ) : linkOptions.length > 0 ? (
              <Select
                value=""
                onValueChange={(val) => {
                  const [pId, cId] = val.split(':') as [PartId, CutId]
                  onLinkCuts(partId, cut.id, pId, cId)
                }}
              >
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Link to cut…" />
                </SelectTrigger>
                <SelectContent>
                  {linkOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function ColorControl({
  part,
  onUpdate,
}: {
  part: BoardPart
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {PART_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={`Color ${c}`}
          onClick={() => onUpdate(part.id, (p) => ({ ...p, color: c }))}
          className={`h-5 w-5 rounded-sm border border-border ${
            part.color === c ? 'ring-2 ring-foreground' : ''
          }`}
          style={{ background: c }}
        />
      ))}
      <input
        type="color"
        aria-label="Custom color"
        title="Custom color"
        value={part.color}
        onChange={(e) => {
          const color = e.target.value
          onUpdate(part.id, (p) => ({ ...p, color }))
        }}
        className="h-5 w-8 rounded-sm border border-border bg-transparent p-0"
      />
    </div>
  )
}

function EditPanel({
  part,
  onUpdate,
  onRemove,
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
  onRemove: (id: PartId) => void
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

  return (
    <div className="p-2 border-t border-border">
      {/* Label input + delete */}
      <div className="mb-2 flex gap-1">
        <Input
          autoFocus
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title="Delete part"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive-foreground"
              onClick={() => onRemove(part.id)}
            >
              ✕
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>

      {/* Material input */}
      <div className="mb-2">
        <Input
          list={MATERIAL_DATALIST_ID}
          placeholder="Material (optional)"
          value={part.material}
          onChange={(e) => {
            const material = e.target.value
            onUpdate(part.id, (p) => ({ ...p, material }))
          }}
        />
        <datalist id={MATERIAL_DATALIST_ID}>
          <option value="Solid timber" />
          <option value="Plywood" />
          <option value="MDF" />
          <option value="OSB" />
          <option value="LVL" />
          <option value="Hardboard" />
        </datalist>
      </div>

      {/* Color picker */}
      <ColorControl part={part} onUpdate={onUpdate} />

      {/* Shape section */}
      <Collapsible open={shapeOpen} onOpenChange={setShapeOpen}>
        <SectionHeader open={shapeOpen} label="Shape" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <DimInput
            label="L"
            value={part.length}
            suffix="mm"
            onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, length: v }))}
          />
          <DimInput
            label="W"
            value={part.width}
            suffix="mm"
            onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, width: v }))}
          />
          <DimInput
            label="T"
            value={part.thickness}
            suffix="mm"
            onCommit={(v) => onUpdate(part.id, (p) => ({ ...p, thickness: v }))}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Position section */}
      <Collapsible open={posOpen} onOpenChange={setPosOpen}>
        <SectionHeader open={posOpen} label="Position" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <NumInput
            label="X"
            value={part.position.x}
            suffix="mm"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, position: { ...p.position, x: v } }))
            }
          />
          <NumInput
            label="Y"
            value={part.position.y}
            suffix="mm"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, position: { ...p.position, y: v } }))
            }
          />
          <NumInput
            label="Z"
            value={part.position.z}
            suffix="mm"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, position: { ...p.position, z: v } }))
            }
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Rotation section */}
      <Collapsible open={rotOpen} onOpenChange={setRotOpen}>
        <SectionHeader open={rotOpen} label="Rotation" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <NumInput
            label="X"
            value={part.rotation.x}
            suffix="°"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, rotation: { ...p.rotation, x: v } }))
            }
          />
          <NumInput
            label="Y"
            value={part.rotation.y}
            suffix="°"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, rotation: { ...p.rotation, y: v } }))
            }
          />
          <NumInput
            label="Z"
            value={part.rotation.z}
            suffix="°"
            onChange={(v) =>
              onUpdate(part.id, (p) => ({ ...p, rotation: { ...p.rotation, z: v } }))
            }
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Cuts section — not collapsible; always shown */}
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">▾ Cuts</p>
      {part.cuts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-0.5">No cuts</p>
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

      {/* Hardware section — read-only, only shown when items are linked */}
      {(() => {
        const linked = (scene.hardware ?? []).filter((h) => h.linkedPartIds.includes(part.id))
        if (linked.length === 0) return null
        return (
          <>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">
              ▾ Hardware
            </p>
            {linked.map((hw) => (
              <p key={hw.id} className="text-[11px] text-muted-foreground py-0.5">
                {hw.name} × {hw.qty} {hw.unit}
              </p>
            ))}
          </>
        )
      })()}
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
  onToggleVisible,
}: SidebarProps) {
  const selectedPart = scene.parts.find((p) => p.id === selectedId) ?? null

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-60 h-full bg-card border-l border-border flex flex-col flex-shrink-0">
        {/* Mode buttons */}
        <div className="p-2 pb-0 flex flex-col gap-1">
          <Button
            variant={cutActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onCutToggle}
            className={`w-full text-xs h-8 ${cutActive ? 'border-blue-700/50 text-blue-300' : 'text-muted-foreground'}`}
          >
            {cutActive ? 'Adding Cut' : 'Add Cut'}
          </Button>
          <Button
            variant={snapActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onSnapToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${snapActive ? 'border-green-700/50 text-green-300' : 'text-muted-foreground'}`}
          >
            <span>{snapActive ? 'Snapping' : 'Snap faces'}</span>
            {snapActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {snapPhase === 'idle'
                  ? 'Click a face · Esc to cancel'
                  : 'Click target face · Esc to cancel'}
              </span>
            )}
          </Button>
        </div>

        {/* Parts list */}
        <ScrollArea className="flex-1">
          {scene.parts.length === 0 ? (
            <p className="p-4 text-muted-foreground text-xs text-center">
              No parts — add a board to start
            </p>
          ) : (
            scene.parts.map((part) => {
              const isPending = pendingIds.has(part.id)
              const error = errors.get(part.id)
              return (
                <div
                  key={part.id}
                  className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer select-none ${
                    part.id === selectedId ? 'bg-secondary' : 'hover:bg-secondary/50'
                  }`}
                  onClick={() => onSelect(part.id)}
                >
                  {error ? (
                    <span title={error} className="text-xs text-destructive-foreground">
                      ⚠
                    </span>
                  ) : isPending ? (
                    <span className="text-xs text-muted-foreground animate-spin inline-block">
                      ⟳
                    </span>
                  ) : (
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ background: part.color }}
                    />
                  )}
                  <span
                    className={`flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs ${
                      part.visible ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {part.label}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={part.visible ? 'Hide' : 'Show'}
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleVisible(part.id)
                        }}
                      >
                        {part.visible ? '●' : '○'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{part.visible ? 'Hide' : 'Show'}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Duplicate"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDuplicate(part.id)
                        }}
                      >
                        ⧉
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Duplicate</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemove(part.id)
                        }}
                      >
                        ✕
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </div>
              )
            })
          )}
        </ScrollArea>

        {/* Edit panel for selected part */}
        {selectedPart && (
          <EditPanel
            key={selectedPart.id}
            part={selectedPart}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onUpdateCut={onUpdateCut}
            onRemoveCut={onRemoveCut}
            onLinkCuts={onLinkCuts}
            onUnlinkCuts={onUnlinkCuts}
            lastPlacedCutId={lastPlacedCutId}
            scene={scene}
            nextLabel={nextLabel}
          />
        )}

        {/* Add board footer */}
        <div className="p-2 border-t border-border">
          <Button
            onClick={onAdd}
            disabled={!occtReady}
            title={!occtReady ? 'Loading geometry engine…' : undefined}
            variant="outline"
            size="sm"
            className="w-full text-xs"
          >
            + Add board
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}
