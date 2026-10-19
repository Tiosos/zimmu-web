import { useMemo, useState } from 'react'
import { setSectionSize, splitSection, unsplitSection } from '../scene/editSection'
import {
  equalizeOpenings,
  findOpening,
  openingGeometry,
  openingLayoutErrors,
  openingLayout,
  openingParent,
  OPENING_LAYOUTS,
  reorderOpening,
  reverseOpenings,
  type OpeningLayoutId,
} from '../scene/openingLayouts'
import { overridesOf } from '../scene/resolveThickness'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DimInput } from './DimInput'
import { SectionElevation } from './SectionElevation'
import { OpeningReuseTools } from './OpeningReuseTools'
import type {
  CarcaseParams,
  Component,
  ComponentId,
  DivisionKind,
  MaterialDef,
  Part,
  Section,
  SectionId,
} from '../scene/types'

export function SectionToolbar({
  params,
  selected,
  onUpdate,
  componentId,
  materials,
  parts,
  onSelect,
  components = [],
}: {
  components?: Component[]
  params: CarcaseParams
  selected: SectionId | null
  onUpdate: (updater: (c: Component) => Component, historyLabel?: string) => void
  componentId: ComponentId
  materials: Record<string, MaterialDef>
  parts: Part[]
  onSelect: (id: SectionId | null) => void
}) {
  const [copied, setCopied] = useState<Section | null>(null)
  const [count, setCount] = useState(2)
  const [division, setDivision] = useState<DivisionKind>('panel')
  const [layout, setLayout] = useState<OpeningLayoutId>('shelves')
  const [editorVersion, setEditorVersion] = useState(0)
  const [editFailure, setEditFailure] = useState<{
    base: CarcaseParams
    selected: SectionId | null
    errors: string[]
  } | null>(null)
  const [preview, setPreview] = useState<{
    base: CarcaseParams
    selected: SectionId
    next: CarcaseParams
    materials: typeof materials
    overrides: string
    errors: string[]
    label: string
  } | null>(null)
  const overrides = JSON.stringify(
    [...overridesOf(parts, componentId)].sort(([a], [b]) => a.localeCompare(b)),
  )
  // Only design changes expire a preview; asynchronous mesh updates can replace the parts array.
  if (
    preview &&
    (preview.base !== params ||
      preview.selected !== selected ||
      preview.materials !== materials ||
      preview.overrides !== overrides)
  )
    setPreview(null)
  const geometry = useMemo(
    () => openingGeometry(params, materials, parts, componentId),
    [params, materials, parts, componentId],
  )
  const section = selected === null ? null : findOpening(params.section, selected)
  if (selected === null || section === null)
    return (
      <div className="w-52 shrink-0 text-[11px] text-muted-foreground">
        Pick an opening in the elevation to divide, size or cover it.
      </div>
    )
  const parent = openingParent(params.section, selected)
  const group = section.content.kind === 'split' ? section : parent
  const siblings = parent?.content.kind === 'split' ? parent.content.children : []
  const index = siblings.findIndex((child) => child.id === selected)
  const vertical = parent?.content.kind === 'split' && parent.content.axis === 'vertical'
  const sizeLabel = vertical ? 'Width' : 'Height'
  const rect = geometry.tree?.rects.get(selected)
  const actualSize = rect ? (vertical ? rect.x1 - rect.x0 : rect.z1 - rect.z0) : 0
  const parentRect = parent ? geometry.tree?.rects.get(parent.id) : undefined
  const gaps = parent
    ? (geometry.tree?.divisions
        .filter((item) => item.parentId === parent.id)
        .reduce(
          (sum, item) =>
            sum + (vertical ? item.rect.x1 - item.rect.x0 : item.rect.z1 - item.rect.z0),
          0,
        ) ?? 0)
    : 0
  const clearSpan = parentRect
    ? (vertical ? parentRect.x1 - parentRect.x0 : parentRect.z1 - parentRect.z0) - gaps
    : 0
  const canEdit = geometry.errors.length === 0
  const editErrors =
    editFailure?.base === params && editFailure.selected === selected ? editFailure.errors : []
  const commit = (next: CarcaseParams, label?: string, drawerTarget?: SectionId) => {
    const errors = drawerTarget
      ? openingLayoutErrors(
          next,
          drawerTarget,
          materials,
          parts,
          componentId,
          components.filter((c) => c.kind === 'drawer'),
        )
      : openingGeometry(next, materials, parts, componentId).errors
    setEditFailure(errors.length ? { base: params, selected, errors } : null)
    if (errors.length) {
      setEditorVersion((version) => version + 1)
      return
    }
    if (next === params) return
    onUpdate(
      (c) =>
        c.kind === 'carcase' && c.id === componentId && c.params === params
          ? { ...c, params: next }
          : c,
      label,
    )
  }
  const commitSection = (next: Section, discrete = true) => {
    if (next === params.section) return
    commit({ ...params, section: next }, discrete ? 'Edit opening layout' : undefined)
  }

  return (
    <div
      className="w-52 shrink-0 flex flex-col gap-2 overflow-y-auto text-[11px]"
      role="region"
      aria-label="Opening design tools"
    >
      {rect && (
        <p role="status">
          Clear opening: {Number((rect.x1 - rect.x0).toFixed(2))} ×{' '}
          {Number((rect.z1 - rect.z0).toFixed(2))} mm (width × height).
        </p>
      )}
      {[...geometry.errors, ...editErrors].length > 0 && (
        <div role="alert">
          {[...new Set([...geometry.errors, ...editErrors])].map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
      {parent && (
        <Button variant="outline" size="sm" onClick={() => onSelect(parent.id)}>
          Edit parent opening
        </Button>
      )}
      <label>
        Split openings
        <select
          aria-label="Split openings"
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        >
          {[2, 3, 4, 5, 6, 7, 8].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Division construction
        <select
          aria-label="Division construction"
          value={division}
          onChange={(event) => setDivision(event.target.value as DivisionKind)}
        >
          <option value="panel">Panel</option>
          <option value="rail">Rail (horizontal only)</option>
          <option value="none">Front-only (no panel)</option>
        </select>
      </label>
      <p>Split across stacks openings bottom to top. Split down places openings left to right.</p>
      <Button
        variant="outline"
        className="h-7 text-[11px]"
        disabled={!canEdit}
        onClick={() =>
          commitSection(splitSection(params.section, selected, 'horizontal', division, count))
        }
      >
        Split across
      </Button>
      <Button
        variant="outline"
        className="h-7 text-[11px]"
        disabled={!canEdit || division === 'rail'}
        onClick={() =>
          commitSection(splitSection(params.section, selected, 'vertical', division, count))
        }
      >
        Split down
      </Button>
      {section.content.kind === 'split' && (
        <Button
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => commitSection(unsplitSection(params.section, selected))}
        >
          Merge
        </Button>
      )}
      {parent && (
        <>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="section-size" className="w-12 shrink-0 text-right">
              Size
            </Label>
            <Select
              value={section.size.kind}
              onValueChange={(value) => {
                if (!canEdit || actualSize <= 0) return
                commitSection(
                  setSectionSize(
                    params.section,
                    selected,
                    value === 'fixed'
                      ? { kind: 'fixed', mm: actualSize }
                      : value === 'percent'
                        ? { kind: 'percent', pct: (actualSize / clearSpan) * 100 }
                        : { kind: 'equal' },
                  ),
                  false,
                )
              }}
            >
              <SelectTrigger
                id="section-size"
                className="h-7 flex-1 text-[11px]"
                disabled={!canEdit}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equal">Equal</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="percent">Percent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {section.size.kind === 'fixed' && (
            <DimInput
              key={`${selected}-fixed-${editorVersion}`}
              labelWidth="w-12"
              label={sizeLabel}
              value={section.size.mm}
              min={0.01}
              suffix="mm"
              onCommit={(value) =>
                commitSection(
                  setSectionSize(params.section, selected, { kind: 'fixed', mm: value }),
                  false,
                )
              }
            />
          )}
          {section.size.kind === 'percent' && (
            <DimInput
              key={`${selected}-percent-${editorVersion}`}
              labelWidth="w-12"
              label="Share"
              value={section.size.pct}
              min={0.01}
              suffix="%"
              onCommit={(value) =>
                commitSection(
                  setSectionSize(params.section, selected, { kind: 'percent', pct: value }),
                  false,
                )
              }
            />
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || index <= 0}
            onClick={() => commitSection(reorderOpening(params.section, selected, -1))}
          >
            {vertical ? 'Move opening left' : 'Move opening down'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || index >= siblings.length - 1}
            onClick={() => commitSection(reorderOpening(params.section, selected, 1))}
          >
            {vertical ? 'Move opening right' : 'Move opening up'}
          </Button>
        </>
      )}
      {group?.content.kind === 'split' && (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={group.content.children.every((child) => child.size.kind === 'equal')}
            onClick={() => commitSection(equalizeOpenings(params.section, group.id))}
          >
            Equalize openings
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit}
            onClick={() => commitSection(reverseOpenings(params.section, group.id))}
          >
            Reverse opening order
          </Button>
          <p>Moving and reversing keep each opening’s size, contents and hinge side.</p>
        </>
      )}
      <label>
        Opening layout
        <select
          aria-label="Opening layout"
          value={layout}
          onChange={(event) => {
            setLayout(event.target.value as OpeningLayoutId)
            setPreview(null)
          }}
        >
          {OPENING_LAYOUTS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p>{OPENING_LAYOUTS.find((item) => item.id === layout)?.description}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const next = openingLayout(params, selected, layout)
          setEditFailure(null)
          setPreview({
            base: params,
            selected,
            next,
            materials,
            overrides,
            errors: openingLayoutErrors(
              next,
              selected,
              materials,
              parts,
              componentId,
              components.filter((c) => c.kind === 'drawer'),
            ),
            label: OPENING_LAYOUTS.find((item) => item.id === layout)!.label,
          })
        }}
      >
        Preview opening layout
      </Button>
      {preview && (
        <section aria-label="Opening layout preview" className="space-y-2 border rounded p-2">
          <h4>Layout preview: {preview.label}</h4>
          <p>
            Replaces the selected opening’s divisions, fronts, shelves and independent face-frame
            layouts. Cabinet size, placement, materials and other openings are preserved.
          </p>
          {preview.errors.length > 0 ? (
            <div role="alert">
              {preview.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : (
            <div className="h-44 pointer-events-none">
              <SectionElevation
                params={preview.next}
                materials={materials}
                parts={parts}
                componentId={componentId}
                selected={null}
                onSelect={() => {}}
              />
            </div>
          )}
          <Button
            size="sm"
            disabled={preview.errors.length > 0}
            onClick={() => {
              commit(preview.next, 'Apply opening layout', preview.selected)
              setPreview(null)
            }}
          >
            Apply opening layout
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreview(null)}>
            Cancel layout preview
          </Button>
        </section>
      )}
      <OpeningReuseTools
        params={params}
        selected={selected}
        tree={geometry.tree}
        copied={copied}
        onCopy={setCopied}
        onSelect={onSelect}
        onCommit={(next, label, target) => commit(next, label, target)}
      />
    </div>
  )
}
