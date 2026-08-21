import { useState } from 'react'
import type { CarcaseParams, CarcaseComponent, Component } from '../scene/types'
import { validateCarcaseParams } from '../scene/carcaseRoles'
import { DimInput } from './DimInput'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function SectionHeader({ open, label }: { open: boolean; label: string }) {
  return (
    <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1.5 cursor-pointer select-none hover:text-foreground transition-colors">
      {open ? '▾' : '▸'} {label}
    </CollapsibleTrigger>
  )
}

const BACK_MODES: { value: CarcaseParams['backMode']; label: string }[] = [
  { value: 'captured', label: 'Captured' },
  { value: 'applied', label: 'Applied' },
  { value: 'none', label: 'None' },
]

const BASE_MODES: { value: CarcaseParams['baseMode']; label: string }[] = [
  { value: 'toe-kick', label: 'Toe kick' },
  { value: 'ladder', label: 'Ladder' },
  { value: 'legs', label: 'Legs' },
  { value: 'none', label: 'None' },
]

const JOINT_METHODS: { value: CarcaseParams['jointMethod']; label: string }[] = [
  { value: 'dado-rabbet', label: 'Dado + rabbet' },
  { value: 'finger', label: 'Box / finger' },
  { value: 'dowel', label: 'Dowel' },
  { value: 'butt-screw', label: 'Butt + screws' },
  { value: 'confirmat', label: 'Confirmat' },
]

export function CarcasePanel({
  component,
  onUpdate,
}: {
  component: CarcaseComponent
  onUpdate: (updater: (c: Component) => Component) => void
}) {
  const [sizeOpen, setSizeOpen] = useState(true)
  const [structureOpen, setStructureOpen] = useState(false)
  const [shelvingOpen, setShelvingOpen] = useState(false)
  const [joineryOpen, setJoineryOpen] = useState(false)

  const p = component.params
  const errors = validateCarcaseParams(p)

  // Every control funnels through here so a carcase update is always a whole-params replacement —
  // partial merges at each call site would drift as fields are added.
  const setParams = (patch: Partial<CarcaseParams>) =>
    onUpdate((c) => (c.kind === 'carcase' ? { ...c, params: { ...c.params, ...patch } } : c))

  const setShelves = (patch: Partial<CarcaseParams['adjustableShelves']>) =>
    setParams({ adjustableShelves: { ...p.adjustableShelves, ...patch } })

  return (
    // Matches EditPanel's container, and bounds its own height: with 17 fields an unbounded panel
    // overflows the sidebar column and covers the scene tree, making boards unclickable while a
    // cabinet is selected.
    <div className="p-2 border-t border-border text-xs shrink-0 max-h-[45%] overflow-y-auto">
      {errors.length > 0 && (
        <div role="alert" className="mb-2 rounded bg-red-950/40 px-2 py-1 text-[11px] text-red-300">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      <Collapsible open={sizeOpen} onOpenChange={setSizeOpen}>
        <SectionHeader open={sizeOpen} label="Size" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <DimInput
            label="Width"
            value={p.width}
            suffix="mm"
            onCommit={(v) => setParams({ width: v })}
          />
          <DimInput
            label="Height"
            value={p.height}
            suffix="mm"
            onCommit={(v) => setParams({ height: v })}
          />
          <DimInput
            label="Depth"
            value={p.depth}
            suffix="mm"
            onCommit={(v) => setParams({ depth: v })}
          />
          <DimInput
            label="Thickness"
            value={p.thickness}
            suffix="mm"
            onCommit={(v) => setParams({ thickness: v })}
          />
          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-material" className="w-20 shrink-0 text-right">
              Material
            </Label>
            <Input
              id="carcase-material"
              value={p.material}
              onChange={(e) => setParams({ material: e.target.value })}
              className="flex-1 min-w-0"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={structureOpen} onOpenChange={setStructureOpen}>
        <SectionHeader open={structureOpen} label="Structure" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-hastop" className="w-20 shrink-0 text-right">
              Has top
            </Label>
            <input
              id="carcase-hastop"
              type="checkbox"
              checked={p.hasTop}
              onChange={(e) => setParams({ hasTop: e.target.checked })}
            />
          </div>

          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-back" className="w-20 shrink-0 text-right">
              Back
            </Label>
            <Select
              value={p.backMode}
              onValueChange={(v) => setParams({ backMode: v as CarcaseParams['backMode'] })}
            >
              <SelectTrigger id="carcase-back" className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BACK_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DimInput
            label="Back thickness"
            value={p.backThickness}
            suffix="mm"
            onCommit={(v) => setParams({ backThickness: v })}
          />

          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-base" className="w-20 shrink-0 text-right">
              Base
            </Label>
            <Select
              value={p.baseMode}
              onValueChange={(v) => setParams({ baseMode: v as CarcaseParams['baseMode'] })}
            >
              <SelectTrigger id="carcase-base" className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASE_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DimInput
            label="Toe-kick height"
            value={p.toeKickHeight}
            suffix="mm"
            onCommit={(v) => setParams({ toeKickHeight: v })}
          />
          <DimInput
            label="Toe-kick setback"
            value={p.toeKickSetback}
            suffix="mm"
            onCommit={(v) => setParams({ toeKickSetback: v })}
          />

          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-dividers" className="w-20 shrink-0 text-right">
              Dividers
            </Label>
            <Input
              id="carcase-dividers"
              value={p.dividers.join(', ')}
              placeholder="0.5, 0.75"
              // Fractions of the width. Parsed leniently so a half-typed list does not wipe the
              // existing dividers — validateCarcaseParams rejects anything out of range.
              onChange={(e) =>
                setParams({
                  dividers: e.target.value
                    .split(',')
                    .map((s) => parseFloat(s.trim()))
                    .filter((n) => isFinite(n)),
                })
              }
              className="flex-1 min-w-0"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={shelvingOpen} onOpenChange={setShelvingOpen}>
        <SectionHeader open={shelvingOpen} label="Shelving" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <DimInput
            label="Fixed shelves"
            value={p.fixedShelves}
            suffix=""
            min={0}
            onCommit={(v) => setParams({ fixedShelves: Math.round(v) })}
          />
          <DimInput
            label="Adjustable rows"
            value={p.adjustableShelves.rows}
            suffix=""
            min={1}
            onCommit={(v) => setShelves({ rows: Math.round(v) === 1 ? 1 : 2 })}
          />
          <DimInput
            label="Pin setback"
            value={p.adjustableShelves.setback}
            suffix="mm"
            onCommit={(v) => setShelves({ setback: v })}
          />
          <DimInput
            label="Pin start height"
            value={p.adjustableShelves.startHeight}
            suffix="mm"
            onCommit={(v) => setShelves({ startHeight: v })}
          />
          <DimInput
            label="Pin count"
            value={p.adjustableShelves.count}
            suffix=""
            min={0}
            onCommit={(v) => setShelves({ count: Math.round(v) })}
          />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={joineryOpen} onOpenChange={setJoineryOpen}>
        <SectionHeader open={joineryOpen} label="Joinery" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-joint" className="w-20 shrink-0 text-right">
              Joint method
            </Label>
            <Select
              value={p.jointMethod}
              onValueChange={(v) => setParams({ jointMethod: v as CarcaseParams['jointMethod'] })}
            >
              <SelectTrigger id="carcase-joint" className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JOINT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
