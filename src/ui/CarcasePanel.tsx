import { useEffect, useRef, useState } from 'react'
import type {
  CarcaseParams,
  CarcaseComponent,
  Component,
  ComponentId,
  DrawerComponent,
  MaterialDef,
  Part,
  RunnerFamily,
  SectionId,
} from '../scene/types'
import { openingRect, sectionThickness, validateCarcaseParams } from '../scene/carcaseRoles'
import { overridesOf, roleThicknessFor, type RoleThickness } from '../scene/resolveThickness'
import { legacyToSection } from '../scene/migrateSections'
import {
  defaultInterior,
  firstInterior,
  seedInteriors,
  sectionOpenings,
  setFrontOn,
  setInterior,
} from '../scene/sectionInterior'
import type { AdjustableSpec, FrontSpec } from '../scene/sectionTree'
import { resolveSections } from '../scene/sectionTree'
import { DimInput } from './DimInput'
import { PlacementPanel } from './PlacementPanel'
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
function panelThickness(
  p: CarcaseParams,
  materials: Record<string, MaterialDef>,
  parts: Part[],
  componentId: ComponentId,
): RoleThickness {
  const resolve = roleThicknessFor(p, materials, overridesOf(parts, componentId))
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
  const divisions = resolveSections(
    root,
    openingRect(p, thicknessOf),
    sectionThickness(thicknessOf),
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

// What a front can be. 'none' is the absence of a spec, not a member of FrontSpec — the select
// needs a value for it, the model does not.
const FRONT_KINDS: { value: 'none' | FrontSpec['kind']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'door', label: 'Door' },
  { value: 'drawer-front', label: 'Drawer front' },
  { value: 'false-front', label: 'False front' },
  { value: 'panel', label: 'Panel' },
]

const FRONT_MOUNTS: { value: CarcaseParams['frontMount']; label: string }[] = [
  { value: 'overlay', label: 'Overlay' },
  { value: 'inset', label: 'Inset' },
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
  materials,
  parts,
  components,
  onUpdate,
  onUpdateComponent,
  selectedSectionId,
}: {
  component: CarcaseComponent
  materials: Record<string, MaterialDef>
  // The scene's boards, filtered to this cabinet's by `overridesOf`: the fields describe the
  // cabinet the user's overrides actually build, not the one its materials alone imply.
  parts: Part[]
  // The scene's components, so the panel can find the drawer regenerateDrawers built for a
  // drawer-front opening. A drawer is a different component from this carcase, so its edits go
  // through onUpdateComponent by id, not through onUpdate (which is bound to this carcase).
  components: Component[]
  onUpdate: (updater: (c: Component) => Component) => void
  onUpdateComponent: (id: ComponentId, updater: (c: Component) => Component) => void
  selectedSectionId: SectionId | null
}) {
  const [placementOpen, setPlacementOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(true)
  const [structureOpen, setStructureOpen] = useState(false)
  const [shelvingOpen, setShelvingOpen] = useState(false)
  const [frontOpen, setFrontOpen] = useState(false)
  const [joineryOpen, setJoineryOpen] = useState(false)

  const p = component.params
  const thicknessOf = panelThickness(p, materials, parts, component.id)
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

  // Shelving belongs to an opening, so an opening has to be chosen before it can be edited. The
  // pick is held by id rather than by index: the shim rebuilds the tree with new ids whenever the
  // divider or fixed-shelf field is touched, and an index would then silently point at a different
  // opening instead of falling back to the first.
  const openings = sectionOpenings(
    p.section,
    resolveSections(p.section, openingRect(p, thicknessOf), sectionThickness(thicknessOf)),
  )
  // The elevation is the picker now. Two ways to choose an opening is one way to choose the wrong
  // one, so this reads the selection rather than holding a second — and when there is none it says
  // so rather than falling back to the first, which is what the dropdown did and what made it a
  // second selection that could disagree.
  const opening = openings.find((o) => o.sectionId === selectedSectionId)

  // A bare opening is given the same shelving a preset ships, less its shelves — otherwise the
  // first keystroke in any field would have to invent values for all the others.
  const setShelving = (patch: Partial<AdjustableSpec>) => {
    if (opening === undefined) return
    const current = opening.spec ?? defaultInterior(0)
    setParams({
      section: setInterior(p.section, opening.sectionId, {
        ...current,
        adjustable: { ...current.adjustable, ...patch },
      }),
    })
  }
  const adjustable = opening?.spec?.adjustable ?? defaultInterior(0).adjustable

  const front = opening?.section.front
  const setFront = (next: FrontSpec | undefined) => {
    if (opening === undefined) return
    setParams({ section: setFrontOn(p.section, opening.sectionId, next) })
  }
  // A door needs two more fields than the other kinds, and switching to it has to supply them: a
  // single leaf hinged left is what a cabinet door is unless someone says otherwise.
  const setFrontKind = (v: string) =>
    setFront(
      v === 'none'
        ? undefined
        : v === 'door'
          ? { kind: 'door', leaves: 1, hinge: 'left' }
          : { kind: v as 'drawer-front' | 'false-front' | 'panel' },
    )

  // The drawer regenerateDrawers built for this opening, found the same way reconciliation binds it:
  // by (parentId, sectionId), never by index. A drawer-front opening always has one, so its absence
  // means the drawer is mid-regeneration and the params are not editable yet.
  const selectedDrawer =
    components.find(
      (c): c is DrawerComponent =>
        c.kind === 'drawer' && c.parentId === component.id && c.sectionId === opening?.sectionId,
    ) ?? null

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

      <Collapsible open={placementOpen} onOpenChange={setPlacementOpen}>
        <SectionHeader open={placementOpen} label="Placement" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          <PlacementPanel
            component={component}
            components={components}
            onUpdate={(patch) => onUpdate((c) => (c.kind === 'carcase' ? { ...c, ...patch } : c))}
          />
        </CollapsibleContent>
      </Collapsible>

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

          {opening === undefined ? (
            <p className="text-[11px] text-muted-foreground py-1">
              Pick an opening in the elevation to shelve it.
            </p>
          ) : (
            <>
              <DimInput
                labelWidth="w-20"
                label="Shelves"
                value={adjustable.shelves}
                suffix=""
                min={0}
                onCommit={(v) => setShelving({ shelves: Math.round(v) })}
              />
              <DimInput
                labelWidth="w-20"
                label="Pin count"
                value={adjustable.count}
                suffix=""
                min={0}
                onCommit={(v) => setShelving({ count: Math.round(v) })}
              />
              <DimInput
                labelWidth="w-20"
                label="Adjustable rows"
                value={adjustable.rows}
                suffix=""
                min={1}
                onCommit={(v) => setShelving({ rows: Math.round(v) === 1 ? 1 : 2 })}
              />
              <DimInput
                labelWidth="w-20"
                label="Pin setback"
                value={adjustable.setback}
                suffix="mm"
                onCommit={(v) => setShelving({ setback: v })}
              />
              <DimInput
                labelWidth="w-20"
                label="Pin back setback"
                value={adjustable.backSetback}
                suffix="mm"
                onCommit={(v) => setShelving({ backSetback: v })}
              />
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={frontOpen} onOpenChange={setFrontOpen}>
        <SectionHeader open={frontOpen} label="Front" />
        <CollapsibleContent forceMount className="data-[state=closed]:hidden">
          {opening === undefined ? (
            <p className="text-[11px] text-muted-foreground py-1">
              Pick an opening in the elevation to cover it.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <Label htmlFor="carcase-front" className="w-20 shrink-0 text-right">
                  Front
                </Label>
                <Select value={front?.kind ?? 'none'} onValueChange={setFrontKind}>
                  <SelectTrigger id="carcase-front" className="h-7 flex-1 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRONT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {front?.kind === 'door' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Label htmlFor="carcase-leaves" className="w-20 shrink-0 text-right">
                    Leaves
                  </Label>
                  <Select
                    value={String(front.leaves)}
                    onValueChange={(v) => setFront({ ...front, leaves: v === '2' ? 2 : 1 })}
                  >
                    <SelectTrigger id="carcase-leaves" className="h-7 flex-1 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Single</SelectItem>
                      <SelectItem value="2">Pair</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* A pair is hinged at both outer edges, so the field would be wrong half the time. */}
              {front?.kind === 'door' && front.leaves === 1 && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Label htmlFor="carcase-hinge" className="w-20 shrink-0 text-right">
                    Hinge
                  </Label>
                  <Select
                    value={front.hinge}
                    onValueChange={(v) =>
                      setFront({ ...front, hinge: v === 'right' ? 'right' : 'left' })
                    }
                  >
                    <SelectTrigger id="carcase-hinge" className="h-7 flex-1 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* A drawer's parameters live on its own component, not on the opening, so they write
                  through onUpdateComponent. A native select rather than the shadcn one: the family
                  is a two-way toggle the DXF/geometry follows, and a bare <select> keeps it
                  keyboard- and test-reachable by its label. */}
              {front?.kind === 'drawer-front' && selectedDrawer !== null && (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Label htmlFor="drawer-family" className="w-20 shrink-0 text-right">
                      Runner family
                    </Label>
                    <select
                      id="drawer-family"
                      aria-label="Runner family"
                      value={selectedDrawer.params.family}
                      onChange={(e) => {
                        // Read eagerly: `e.target` is the live select, and a controlled re-render
                        // resets its value before a deferred updater closure would read it.
                        const family = e.target.value as RunnerFamily
                        onUpdateComponent(selectedDrawer.id, (c) =>
                          c.kind === 'drawer' ? { ...c, params: { ...c.params, family } } : c,
                        )
                      }}
                      className="h-7 flex-1 min-w-0 rounded-md border border-input bg-input px-2 text-[11px] text-foreground"
                    >
                      <option value="side-mount">Side mount</option>
                      <option value="undermount">Undermount</option>
                    </select>
                  </div>
                  {/* 0 means "derive the height from the front cell", which the model stores as
                      null. Any other value is the explicit override a shallow box behind a tall
                      front needs. */}
                  <DimInput
                    labelWidth="w-20"
                    label="Box height"
                    value={selectedDrawer.params.boxHeight ?? 0}
                    suffix="mm"
                    min={0}
                    onCommit={(v) =>
                      onUpdateComponent(selectedDrawer.id, (c) =>
                        c.kind === 'drawer'
                          ? { ...c, params: { ...c.params, boxHeight: v === 0 ? null : v } }
                          : c,
                      )
                    }
                  />
                  {/* The offset is where a side-mount runner's screw line sits above the box floor;
                      undermount has no such line, so the field would mean nothing there. */}
                  {selectedDrawer.params.family === 'side-mount' && (
                    <DimInput
                      labelWidth="w-20"
                      label="Runner height above box bottom"
                      value={selectedDrawer.params.runnerOffset}
                      suffix="mm"
                      min={0}
                      onCommit={(v) =>
                        onUpdateComponent(selectedDrawer.id, (c) =>
                          c.kind === 'drawer'
                            ? { ...c, params: { ...c.params, runnerOffset: v } }
                            : c,
                        )
                      }
                    />
                  )}
                </>
              )}
            </>
          )}
          {/* Below the divider: the cabinet's, not the opening's. A reveal is one number for the
              whole carcase — a per-opening reveal is a cabinet with uneven gaps. */}
          <div className="flex items-center gap-1.5 mb-1">
            <Label htmlFor="carcase-mount" className="w-20 shrink-0 text-right">
              Mount
            </Label>
            <Select
              value={p.frontMount}
              onValueChange={(v) => setParams({ frontMount: v as CarcaseParams['frontMount'] })}
            >
              <SelectTrigger id="carcase-mount" className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRONT_MOUNTS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DimInput
            labelWidth="w-20"
            label="Reveal"
            value={p.frontReveal}
            suffix="mm"
            min={0}
            onCommit={(v) => setParams({ frontReveal: v })}
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
