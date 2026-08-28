import { useEffect, useRef, useState } from 'react'
import type { CarcaseParams, CarcaseComponent, Component, MaterialDef } from '../scene/types'
import { openingRect, validateCarcaseParams } from '../scene/carcaseRoles'
import { roleThicknessFor, type RoleThickness } from '../scene/resolveThickness'
import { legacyToSection } from '../scene/migrateSections'
import { firstInterior, seedInteriors } from '../scene/sectionInterior'
import { resolveSections } from '../scene/sectionTree'
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

// 'legs' stays in the CarcaseParams union so saved files keep loading, but it is not offered:
// no generator branch implements it, so choosing it produced a cabinet identical to 'none'.
const BASE_MODES: { value: CarcaseParams['baseMode']; label: string }[] = [
  { value: 'toe-kick', label: 'Toe kick' },
  { value: 'ladder', label: 'Ladder' },
  { value: 'none', label: 'None' },
]

// A divider is only committed once its text is a complete number: parseFloat('0.') is 0, so
// reparsing the field on every keystroke ate the decimal point before it could be typed.
const DIVIDER = /^(\d+(\.\d+)?|\.\d+)$/

function parseDividers(text: string): number[] | null {
  if (text.trim() === '') return []
  const parts = text.split(',').map((s) => s.trim())
  return parts.every((s) => DIVIDER.test(s)) ? parts.map(Number) : null
}

// The panel renders in states the validator rejects — a slot naming a material with no thickness
// among them — so the resolver it lays sections out with must not throw. An unknown thickness reads
// as 0 here and the error list beside the fields is what reports it.
function panelThickness(p: CarcaseParams, materials: Record<string, MaterialDef>): RoleThickness {
  const resolve = roleThicknessFor(p, materials, new Map())
  return (role) => {
    try {
      return resolve(role)
    } catch {
      return 0
    }
  }
}

// The v12 numbers the two legacy fields display, read back out of the tree. Divider fractions come
// from where the partitions actually resolved, so a tree written by anything else still shows
// something truthful rather than a guess at its shape.
function legacyViewOf(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
): { dividers: number[]; fixedShelves: number } {
  const root = p.section
  const divisions = resolveSections(root, openingRect(p, thicknessOf), (parentId, index) =>
    thicknessOf(`division-${parentId}-${index}`),
  ).divisions
  const dividers = divisions
    .filter((d) => d.parentId === root.id && d.axis === 'vertical')
    .map((d) => (d.rect.x0 + d.rect.x1) / 2 / p.width)
  const firstBay =
    root.content.kind === 'split' && root.content.axis === 'vertical'
      ? root.content.children[0]
      : root
  return {
    dividers,
    fixedShelves: divisions.filter((d) => d.parentId === firstBay.id).length,
  }
}

const JOINT_METHODS: { value: CarcaseParams['jointMethod']; label: string }[] = [
  { value: 'dado-rabbet', label: 'Dado + rabbet' },
  { value: 'finger', label: 'Box / finger' },
  { value: 'dowel', label: 'Dowel' },
  { value: 'butt-screw', label: 'Butt + screws' },
  { value: 'confirmat', label: 'Confirmat' },
]

export function CarcasePanel({
  component,
  materials,
  onUpdate,
}: {
  component: CarcaseComponent
  materials: Record<string, MaterialDef>
  onUpdate: (updater: (c: Component) => Component) => void
}) {
  const [sizeOpen, setSizeOpen] = useState(true)
  const [structureOpen, setStructureOpen] = useState(false)
  const [shelvingOpen, setShelvingOpen] = useState(false)
  const [joineryOpen, setJoineryOpen] = useState(false)

  const p = component.params
  const thicknessOf = panelThickness(p, materials)
  const errors = validateCarcaseParams(p, thicknessOf)
  // A slot can only name a material that states a thickness; anything else collapses every panel
  // derived from it. The one already on the carcase is offered too, so a file naming a material
  // this scene does not have still shows what it is set to.
  const materialOptions = (current: string): string[] => {
    const usable = Object.keys(materials).filter((name) => materials[name].thickness !== undefined)
    return current !== '' && !usable.includes(current) ? [current, ...usable] : usable
  }
  // legacyToSection lays out a tree whose divisions have no role keys yet. Every one of them draws
  // on the carcase slot, which is the same slot the bottom panel draws on.
  const divisionThickness = thicknessOf('bottom')

  // Stage A shim. These two fields still speak the v12 parameters — a list of divider fractions and
  // a count of shelves per bay — so they read those numbers back out of the section tree and write
  // a whole new tree on every edit, discarding any structure the numbers cannot express. Real
  // section editing replaces them; until then this is what keeps the fields working.
  const legacy = legacyViewOf(p, thicknessOf)

  // Same shape as DimInput: the field shows what was typed, and only a text that parses cleanly
  // reaches the params. Resync is skipped while focused so an in-progress '0.50' is not
  // reformatted to '0.5' under the cursor.
  const committedDividers = legacy.dividers.join(', ')
  const [dividersText, setDividersText] = useState(committedDividers)
  const dividersFocused = useRef(false)
  useEffect(() => {
    if (!dividersFocused.current) setDividersText(committedDividers)
  }, [committedDividers])

  // Every control funnels through here so a carcase update is always a whole-params replacement —
  // partial merges at each call site would drift as fields are added.
  const setParams = (patch: Partial<CarcaseParams>) =>
    onUpdate((c) => (c.kind === 'carcase' ? { ...c, params: { ...c.params, ...patch } } : c))

  // The shim writes a whole new tree, whose sections are new sections with new ids, so a shelving
  // spec attached to the old ones would be thrown away on every keystroke in the Dividers field.
  // The cabinet-wide shelving these two fields describe has exactly one spec, so carrying it onto
  // every new leaf loses nothing. Per-section editing is what makes this insufficient.
  const relaid = (dividers: number[], fixedShelves: number) => {
    const tree = legacyToSection(dividers, fixedShelves, p.width, divisionThickness)
    const interior = firstInterior(p.section)
    return interior === undefined ? tree : seedInteriors(tree, interior)
  }

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
            labelWidth="w-20"
            label="Width"
            value={p.width}
            suffix="mm"
            onCommit={(v) => setParams({ width: v })}
          />
          <DimInput
            labelWidth="w-20"
            label="Height"
            value={p.height}
            suffix="mm"
            onCommit={(v) => setParams({ height: v })}
          />
          <DimInput
            labelWidth="w-20"
            label="Depth"
            value={p.depth}
            suffix="mm"
            onCommit={(v) => setParams({ depth: v })}
          />
          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-material" className="w-20 shrink-0 text-right">
              Material
            </Label>
            <Select
              value={p.carcaseMaterial}
              onValueChange={(v) => setParams({ carcaseMaterial: v })}
            >
              <SelectTrigger id="carcase-material" className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {materialOptions(p.carcaseMaterial).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-back-material" className="w-20 shrink-0 text-right">
              Back material
            </Label>
            <Select value={p.backMaterial} onValueChange={(v) => setParams({ backMaterial: v })}>
              <SelectTrigger id="carcase-back-material" className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {materialOptions(p.backMaterial).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            labelWidth="w-20"
            label="Toe-kick height"
            value={p.toeKickHeight}
            suffix="mm"
            onCommit={(v) => setParams({ toeKickHeight: v })}
          />
          <DimInput
            labelWidth="w-20"
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
              value={dividersText}
              placeholder="0.5, 0.75"
              // Fractions of the width. A half-typed list parses to null and leaves the existing
              // dividers alone — validateCarcaseParams rejects anything out of range.
              onChange={(e) => {
                setDividersText(e.target.value)
                const dividers = parseDividers(e.target.value)
                if (dividers !== null) {
                  setParams({ section: relaid(dividers, legacy.fixedShelves) })
                }
              }}
              onFocus={() => {
                dividersFocused.current = true
              }}
              onBlur={() => {
                dividersFocused.current = false
                setDividersText(committedDividers)
              }}
              className="flex-1 min-w-0"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={shelvingOpen} onOpenChange={setShelvingOpen}>
        <SectionHeader open={shelvingOpen} label="Shelving" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <DimInput
            labelWidth="w-20"
            label="Fixed shelves"
            value={legacy.fixedShelves}
            suffix=""
            min={0}
            onCommit={(v) => setParams({ section: relaid(legacy.dividers, Math.round(v)) })}
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
