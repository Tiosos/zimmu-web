import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SectionElevation } from './SectionElevation'
import { ConstructionPresetLibrary } from './ConstructionPresetLibrary'
import {
  constructionCandidate,
  constructionDraft,
  constructionErrors,
  constructionSummary,
  type ConstructionDraft,
  type ConstructionSummary,
  type ConstructionNumber,
  type FrameNumber,
} from '../scene/constructionDraft'
import { overridesOf } from '../scene/resolveThickness'
import type {
  DrawerComponent,
  CarcaseComponent,
  CarcaseParams,
  Component,
  MaterialDef,
  Part,
} from '../scene/types'

const NUMBERS: [ConstructionNumber, string][] = [
  ['width', 'Width'],
  ['height', 'Height'],
  ['depth', 'Depth'],
  ['toeKickHeight', 'Toe-kick height'],
  ['toeKickSetback', 'Toe-kick setback'],
  ['frontReveal', 'Front reveal'],
]
const FRAMES: [FrameNumber, string][] = [
  ['stileWidth', 'Edge stile width'],
  ['railWidth', 'Edge rail width'],
  ['midStileWidth', 'Middle stile width'],
  ['midRailWidth', 'Middle rail width'],
]
interface Preview {
  base: CarcaseParams
  next: CarcaseParams
  materials: Record<string, MaterialDef>
  signature: string
  errors: string[]
}
export function CabinetConstructionEditor({
  cabinet,
  materials,
  parts,
  components,
  onUpdate,
}: {
  cabinet: CarcaseComponent
  materials: Record<string, MaterialDef>
  parts: Part[]
  components: Component[]
  onUpdate: (updater: (c: Component) => Component, historyLabel?: string) => void
}) {
  const [baseId, setBaseId] = useState(cabinet.id)
  const [base, setBase] = useState(cabinet.params)
  const [draft, setDraft] = useState(() => constructionDraft(cabinet.params))
  const [preview, setPreview] = useState<Preview | null>(null)
  const drawers = components.filter(
    (c): c is DrawerComponent => c.kind === 'drawer' && c.parentId === cabinet.id,
  )
  const signature = JSON.stringify({
    id: cabinet.id,
    overrides: [...overridesOf(parts, cabinet.id)].sort(([a], [b]) => a.localeCompare(b)),
    drawers: drawers.map(({ id, params, driven, sectionId, frameOpeningId }) => ({
      id,
      params,
      driven,
      sectionId,
      frameOpeningId,
    })),
  })
  const stale = baseId !== cabinet.id || base !== cabinet.params
  if (preview && (stale || preview.materials !== materials || preview.signature !== signature))
    setPreview(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(constructionDraft(base))
  const patch = <K extends keyof ConstructionDraft>(key: K, value: ConstructionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setPreview(null)
  }
  const reset = () => {
    setBaseId(cabinet.id)
    setBase(cabinet.params)
    setDraft(constructionDraft(cabinet.params))
    setPreview(null)
  }
  const numberField = ([key, label]: [ConstructionNumber | FrameNumber, string]) => (
    <label key={key} className="flex flex-col gap-1">
      {label} (mm)
      <input
        aria-label={`Draft ${label}`}
        type="number"
        step="any"
        value={draft[key]}
        onChange={(e) => patch(key, e.target.value)}
        className="border rounded px-2 py-1"
      />
    </label>
  )
  const stock = Object.keys(materials)
    .filter(
      (name) =>
        materials[name].use !== 'edge' &&
        Number.isFinite(materials[name].thickness) &&
        (materials[name].thickness ?? 0) > 0,
    )
    .sort()
  const materialField = (
    key: 'carcaseMaterial' | 'backMaterial' | 'frontMaterial' | 'frameMaterial',
    label: string,
  ) => (
    <label className="flex flex-col gap-1" key={key}>
      {label}
      <select
        aria-label={`Draft ${label}`}
        value={draft[key]}
        onChange={(e) => patch(key, e.target.value)}
        className="border rounded px-2 py-1"
      >
        {!stock.includes(draft[key]) && (
          <option value={draft[key]}>{draft[key]} (unavailable panel material)</option>
        )}
        {stock.map((name) => (
          <option key={name} value={name}>
            {name} · {materials[name].thickness} mm
          </option>
        ))}
      </select>
    </label>
  )
  const selectField = <K extends 'backMode' | 'baseMode' | 'frontMount' | 'jointMethod'>(
    key: K,
    label: string,
    options: [ConstructionDraft[K], string][],
  ) => (
    <label className="flex flex-col gap-1">
      {label}
      <select
        aria-label={`Draft ${label}`}
        className="border rounded px-2 py-1"
        value={draft[key]}
        onChange={(e) => patch(key, e.target.value as ConstructionDraft[K])}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
  const before = preview ? constructionSummary(base, materials, parts, cabinet.id) : null
  const after =
    preview && !preview.errors.length
      ? constructionSummary(preview.next, materials, parts, cabinet.id)
      : null
  return (
    <section
      aria-label="Cabinet construction editor"
      className="text-xs space-y-4 max-w-5xl mx-auto"
    >
      <p>
        Stage construction changes together, preview them, then apply in one undo step. Drafts are
        discarded when you leave this tab. Existing opening contents and board overrides stay in
        place.
      </p>
      {stale && (
        <p role="alert">
          The cabinet changed while this draft was open. Your draft is retained; reset to the
          current cabinet before previewing.
        </p>
      )}
      <ConstructionPresetLibrary draft={draft} stale={stale} materials={materials} onStage={(next) => { setDraft(next); setPreview(null) }} />
      <fieldset className="grid grid-cols-2 gap-3 border rounded p-3">
        <legend>Size and shell</legend>
        {NUMBERS.slice(0, 3).map(numberField)}
        {materialField('carcaseMaterial', 'Carcase material')}
        <label>
          <input
            type="checkbox"
            checked={draft.hasTop}
            onChange={(e) => patch('hasTop', e.target.checked)}
          />{' '}
          Include top panel
        </label>
        {selectField('backMode', 'Back construction', [
          ['captured', 'Captured back'],
          ['applied', 'Applied back'],
          ['none', 'No back'],
        ])}
        {materialField('backMaterial', 'Back material')}
        {selectField('baseMode', 'Base construction', [
          ['toe-kick', 'Toe kick'],
          ['ladder', 'Ladder base'],
          ['legs', 'Legs'],
          ['none', 'No base'],
        ])}
        {NUMBERS.slice(3, 5).map(numberField)}
        {selectField('jointMethod', 'Joint method', [
          ['butt-screw', 'Butt + screws'],
          ['dado-rabbet', 'Dado + rabbet'],
          ['finger', 'Box / finger'],
          ['dowel', 'Dowel'],
          ['confirmat', 'Confirmat'],
        ])}
      </fieldset>
      <fieldset className="grid grid-cols-2 gap-3 border rounded p-3">
        <legend>Fronts and face frame</legend>
        {materialField('frontMaterial', 'Front material')}
        {selectField('frontMount', 'Front mounting', [
          ['overlay', 'Overlay'],
          ['inset', 'Inset'],
          ['half-overlay', 'Half overlay (requires frame)'],
        ])}
        {numberField(NUMBERS[5])}
        <label>
          <input
            aria-label="Draft Face frame"
            type="checkbox"
            checked={draft.frameEnabled}
            onChange={(e) => patch('frameEnabled', e.target.checked)}
          />{' '}
          Face frame
        </label>
        <p className="col-span-2">
          Removing the face frame also removes its independent front layouts. Frame member edits
          retain them. Half overlay requires a frame.
        </p>
        {draft.frameEnabled && (
          <>
            {materialField('frameMaterial', 'Frame material')}
            {FRAMES.map(numberField)}
            <label>
              <input
                type="checkbox"
                checked={draft.pairStile}
                onChange={(e) => patch('pairStile', e.target.checked)}
              />{' '}
              Centre stile between paired doors
            </label>
          </>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={stale || !dirty}
          onClick={() => {
            const candidate = constructionCandidate(base, draft)
            setPreview({
              base,
              next: candidate.params,
              materials,
              signature,
              errors: constructionErrors(base, draft, materials, parts, cabinet.id, drawers),
            })
          }}
        >
          Preview construction
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset construction draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel construction changes
        </Button>
      </div>
      {!dirty && !stale && <p role="status">No construction changes staged.</p>}
      {preview && (
        <section aria-label="Construction preview" className="border rounded p-3 space-y-3">
          {preview.errors.length > 0 ? (
            <div role="alert">
              {preview.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : (
            <>
              <div
                className="h-80 pointer-events-none"
                aria-label="Proposed construction elevation"
              >
                <SectionElevation
                  params={preview.next}
                  materials={materials}
                  parts={parts}
                  componentId={cabinet.id}
                  selected={null}
                  onSelect={() => {}}
                />
              </div>
              <table className="w-full text-left">
                <caption>Construction comparison</caption>
                <thead>
                  <tr>
                    <th scope="col">Measure</th>
                    <th scope="col">Current</th>
                    <th scope="col">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Width × height × depth</th>
                    <td>{before?.dimensions ?? 'Unavailable'}</td>
                    <td>{after?.dimensions ?? 'Unavailable'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Clear root opening (width × height)</th>
                    <td>{before?.opening ?? 'Unavailable'}</td>
                    <td>{after?.opening ?? 'Unavailable'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Generated carcase panels</th>
                    <td>{before?.panels ?? 'Unavailable'}</td>
                    <td>{after?.panels ?? 'Unavailable'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Panels by effective material</th>
                    <td>{materialCounts(before)}</td>
                    <td>{materialCounts(after)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}
          <p>
            Panel counts include the carcase, shelves, fronts and frame, and exclude drawer boxes.
            Existing production assessment covers manufacturing readiness and unsupported
            operations.
          </p>
          <Button
            size="sm"
            disabled={stale || preview.errors.length > 0}
            onClick={() => {
              const next = preview.next
              onUpdate(
                (c) =>
                  c.kind === 'carcase' && c.id === cabinet.id && c.params === preview.base
                    ? { ...c, params: next }
                    : c,
                'Apply cabinet construction',
              )
              setBaseId(cabinet.id)
              setBase(next)
              setDraft(constructionDraft(next))
              setPreview(null)
            }}
          >
            Apply construction
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            Close construction preview
          </Button>
        </section>
      )}
    </section>
  )
}
function materialCounts(summary: ConstructionSummary | null): string {
  return summary
    ? Object.entries(summary.materials)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => `${name}: ${count}`)
        .join('; ')
    : 'Unavailable'
}
