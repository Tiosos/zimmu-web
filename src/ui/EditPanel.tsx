import { useState, useEffect, useRef, useMemo } from 'react'
import type {
  BoxCut,
  CutDef,
  CutId,
  CylinderPart,
  Joint,
  MitreCut,
  Part,
  PartId,
  Scene,
  CarcaseParams,
  Component,
  ComponentId,
} from '../scene/types'
import type { DowelCutTool } from '../scene/useAddCut'
import type { JointSuggestion } from '../scene/suggestJoints'
import { DowelCutsPanel } from './DowelCutsPanel'
import { JointsPanel } from './JointsPanel'
import { SuggestionsPanel } from './SuggestionsPanel'
import { DimInput } from './DimInput'
import { faceAxes } from '../scene/snapMath'
import { PART_COLORS } from '../scene/palette'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MATERIAL_DATALIST_ID = 'zimmu-material-suggestions'

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
  cut: BoxCut
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
      if (p.kind !== 'board') continue
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
      if (p.id === partId || p.kind !== 'board') continue
      for (const c of p.cuts) {
        if (c.kind !== 'box') continue
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
              onUpdateCut(partId, cut.id, (c) =>
                c.kind !== 'box' ? c : { ...c, size: { ...c.size, [faceAxes(c.face).depth]: v } },
              )
            }
          />
          <DimInput
            label="W"
            value={cut.size[faceAxes(cut.face).u]}
            suffix="mm width"
            min={0.1}
            onCommit={(v) =>
              onUpdateCut(partId, cut.id, (c) =>
                c.kind !== 'box' ? c : { ...c, size: { ...c.size, [faceAxes(c.face).u]: v } },
              )
            }
          />
          <DimInput
            label="H"
            value={cut.size[faceAxes(cut.face).v]}
            suffix="mm height"
            min={0.1}
            onCommit={(v) =>
              onUpdateCut(partId, cut.id, (c) =>
                c.kind !== 'box' ? c : { ...c, size: { ...c.size, [faceAxes(c.face).v]: v } },
              )
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
              onUpdateCut(partId, cut.id, (c) =>
                c.kind !== 'box'
                  ? c
                  : { ...c, position: { ...c.position, [faceAxes(c.face).u]: v } },
              )
            }
          />
          <NumInput
            label="V"
            value={cut.position[faceAxes(cut.face).v]}
            suffix="mm V"
            onChange={(v) =>
              onUpdateCut(partId, cut.id, (c) =>
                c.kind !== 'box'
                  ? c
                  : { ...c, position: { ...c.position, [faceAxes(c.face).v]: v } },
              )
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

function MitreRow({
  cut,
  partId,
  onUpdateCut,
  onRemoveCut,
  defaultOpen,
}: {
  cut: MitreCut
  partId: PartId
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-t border-border/30 pt-0.5">
      <div
        className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1 cursor-pointer select-none hover:text-foreground transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="flex-1">{cut.label}</span>
        <span className="font-mono text-[10px] text-border">{cut.end}</span>
        <Button
          variant="ghost"
          size="icon"
          title="Delete mitre"
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
        <div className="pl-2 pb-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Label className="w-8 shrink-0 text-right">End</Label>
            <Select
              value={cut.end}
              onValueChange={(v) =>
                onUpdateCut(partId, cut.id, (c) => ({ ...c, end: v as MitreCut['end'] }))
              }
            >
              <SelectTrigger className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="+X">+X end</SelectItem>
                <SelectItem value="-X">−X end</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <Label className="w-8 shrink-0 text-right">Type</Label>
            <Select
              value={cut.axis}
              onValueChange={(v) =>
                onUpdateCut(partId, cut.id, (c) =>
                  c.kind !== 'mitre' ? c : { ...c, axis: v as MitreCut['axis'] },
                )
              }
            >
              <SelectTrigger className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Z">Flat (across width)</SelectItem>
                <SelectItem value="Y">Bevel (through thickness)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <NumInput
            label="A"
            value={cut.angle}
            suffix="°"
            onChange={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                angle: Math.max(0, Math.min(89, v)),
              }))
            }
          />
        </div>
      )}
    </div>
  )
}

function ColorControl({
  part,
  onUpdate,
}: {
  part: Part
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

export function EditPanel({
  part,
  onUpdate,
  onRemove,
  onUpdateCut,
  onAddMitre,
  onRemoveCut,
  onLinkCuts,
  onUnlinkCuts,
  lastPlacedCutId,
  scene,
  nextLabel,
  dowelTool,
  armDowelTool,
  onUpdateJoint,
  onRemoveJoint,
  suggestions,
  onApplySuggestion,
  onHoverSuggestion,
  parameterFor,
  onDetachPart,
  onUpdateComponent,
}: {
  part: Part
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  parameterFor: (
    id: PartId,
    dimension: 'length' | 'width' | 'thickness',
  ) => keyof CarcaseParams | null
  onDetachPart: (id: PartId, updater?: (p: Part) => Part) => void
  onUpdateComponent: (id: ComponentId, updater: (c: Component) => Component) => void
  onRemove: (id: PartId) => void
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onAddMitre: (partId: PartId) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  lastPlacedCutId: CutId | null
  scene: Scene
  nextLabel: string
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
  onUpdateJoint: (jointId: string, updater: (j: Joint) => Joint) => void
  onRemoveJoint: (jointId: string) => void
  suggestions: JointSuggestion[]
  onApplySuggestion: (s: JointSuggestion) => void
  onHoverSuggestion: (s: JointSuggestion | null) => void
}) {
  const [shapeOpen, setShapeOpen] = useState(true)
  const [posOpen, setPosOpen] = useState(true)
  const [rotOpen, setRotOpen] = useState(true)
  const [labelValue, setLabelValue] = useState(part.label)
  const labelFocused = useRef(false)
  const linkedHardware = scene.hardware.filter((h) => h.linkedPartIds.includes(part.id))
  const blankFallbackLabel = part.kind === 'board' ? nextLabel : 'Dowel'

  useEffect(() => {
    if (!labelFocused.current) setLabelValue(part.label)
  }, [part.label])

  // A driven part's dimensions belong to its cabinet, so an edit here is a question, not a
  // command: push it up to the parameter, or take ownership of the part. Holding the value
  // instead of applying it is what keeps the cabinet from silently reverting the user.
  const [pending, setPending] = useState<{
    dimension: 'length' | 'width' | 'thickness'
    value: number
    param: keyof CarcaseParams | null
  } | null>(null)

  const commitDimension = (dimension: 'length' | 'width' | 'thickness', value: number) => {
    if (!part.driven) {
      onUpdate(part.id, (p) => ({ ...p, [dimension]: value }) as Part)
      return
    }
    setPending({ dimension, value, param: parameterFor(part.id, dimension) })
  }

  const applyToCabinet = () => {
    if (!pending || pending.param === null || part.parentId === null) return
    const { param, value } = pending
    onUpdateComponent(part.parentId, (c) =>
      c.kind === 'carcase' ? { ...c, params: { ...c.params, [param]: value } } : c,
    )
    setPending(null)
  }

  const detachAndApply = () => {
    if (!pending) return
    const { dimension, value } = pending
    onDetachPart(part.id, (p) => ({ ...p, [dimension]: value }) as Part)
    setPending(null)
  }

  const ownerLabel =
    part.parentId === null
      ? ''
      : (scene.components.find((c) => c.id === part.parentId)?.label ?? '')

  // Bounded and scrollable for the same reason CarcasePanel is: with a cabinet in the tree the
  // panel's content is tall enough to overflow the sidebar and cover the rows above it.
  return (
    <div className="p-2 border-t border-border max-h-[55%] overflow-y-auto">
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
              setLabelValue(blankFallbackLabel)
              onUpdate(part.id, (p) => ({ ...p, label: blankFallbackLabel }))
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
          {part.kind === 'board' ? (
            <>
              <DimInput
                label="L"
                value={part.length}
                suffix="mm"
                onCommit={(v) => commitDimension('length', v)}
              />
              <DimInput
                label="W"
                value={part.width}
                suffix="mm"
                onCommit={(v) => commitDimension('width', v)}
              />
              <DimInput
                label="T"
                value={part.thickness}
                suffix="mm"
                onCommit={(v) => commitDimension('thickness', v)}
              />
              {pending && (
                <div className="mt-1 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1.5">
                  <div className="mb-1.5 text-[11px] text-amber-200">
                    {part.label} is driven by {ownerLabel}.
                  </div>
                  <div className="flex gap-1.5">
                    {pending.param !== null && (
                      <Button size="sm" variant="secondary" onClick={applyToCabinet}>
                        Change the cabinet
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={detachAndApply}>
                      Detach this part
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <DimInput
                label="Ø"
                value={part.diameter}
                suffix="mm"
                onCommit={(v) =>
                  onUpdate(part.id, (p) => (p.kind === 'cylinder' ? { ...p, diameter: v } : p))
                }
              />
              <DimInput
                label="L"
                value={part.length}
                suffix="mm"
                onCommit={(v) =>
                  onUpdate(part.id, (p) => (p.kind === 'cylinder' ? { ...p, length: v } : p))
                }
              />
            </>
          )}
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

      {/* Cuts section — cylinder */}
      {part.kind === 'cylinder' && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">
            ▾ Cuts
          </p>
          <DowelCutsPanel
            part={part as CylinderPart}
            dowelTool={dowelTool}
            armDowelTool={armDowelTool}
            onUpdate={onUpdate}
          />
        </>
      )}

      {/* Cuts section — board only */}
      {part.kind === 'board' && (
        <>
          <div className="flex items-center justify-between py-1.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">▾ Cuts</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => onAddMitre(part.id)}
            >
              + Mitre
            </Button>
          </div>
          {/* Hole arrays get no row: they are component-owned and carry nothing editable yet. */}
          {part.cuts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-0.5">No cuts</p>
          ) : (
            part.cuts.map((cut) =>
              cut.kind === 'mitre' ? (
                <MitreRow
                  key={cut.id}
                  cut={cut}
                  partId={part.id}
                  onUpdateCut={onUpdateCut}
                  onRemoveCut={onRemoveCut}
                  defaultOpen={cut.id === lastPlacedCutId}
                />
              ) : cut.kind === 'hole-array' ? null : cut.sourceJointId ? (
                <div
                  key={cut.id}
                  className="border-t border-border/30 py-1 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground/70"
                >
                  <span className="flex-1">{cut.label} (joint)</span>
                  <span className="font-mono text-[10px] text-border">{cut.face}</span>
                </div>
              ) : (
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
              ),
            )
          )}
        </>
      )}

      <SuggestionsPanel
        suggestions={suggestions}
        scene={scene}
        onApply={onApplySuggestion}
        onHoverSuggestion={onHoverSuggestion}
      />

      <JointsPanel
        part={part}
        scene={scene}
        onUpdateJoint={onUpdateJoint}
        onRemoveJoint={onRemoveJoint}
      />

      {linkedHardware.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">
            ▾ Hardware
          </p>
          {linkedHardware.map((hw) => (
            <p key={hw.id} className="text-[11px] text-foreground py-0.5">
              {hw.name} × {hw.qty} {hw.unit}
            </p>
          ))}
        </>
      )}
    </div>
  )
}
