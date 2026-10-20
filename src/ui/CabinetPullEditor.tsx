import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import { defaultPull, pullHardwareKey, type PullSpec } from '../scene/pullPattern'
import { frontsSignature } from '../scene/frontsDrawers'
import { hardwareDefinition } from '../scene/hardwareCatalogue'
import { nearestCarcase } from '../scene/nearestCarcase'
import {
  pullIssues,
  pullTargets,
  previewPulls,
  stagePull,
  type PullDraft,
  type PullPreview,
  type PullTarget,
} from '../scene/pullLayout'
import { CabinetProjection } from './CabinetProjection'

type Form = Omit<PullSpec, 'pitch' | 'diameter' | 'horizontalOffset' | 'verticalOffset'> & {
  pitch: string
  diameter: string
  horizontalOffset: string
  verticalOffset: string
}
const formOf = (s = defaultPull()): Form => ({
  ...s,
  pitch: String(s.pitch),
  diameter: String(s.diameter),
  horizontalOffset: String(s.horizontalOffset),
  verticalOffset: String(s.verticalOffset),
})
const settingOf = (s: Form): PullSpec => ({
  ...s,
  pitch: s.pitch.trim() ? Number(s.pitch) : NaN,
  diameter: s.diameter.trim() ? Number(s.diameter) : NaN,
  horizontalOffset: s.horizontalOffset.trim() ? Number(s.horizontalOffset) : NaN,
  verticalOffset: s.verticalOffset.trim() ? Number(s.verticalOffset) : NaN,
})
export function CabinetPullEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: PullPreview) => boolean
}) {
  const signature = frontsSignature(scene)
  const [base, setBase] = useState(signature)
  const [draft, setDraft] = useState<PullDraft>({})
  const [selected, setSelected] = useState<string[]>([])
  const [form, setForm] = useState(formOf)
  const [preview, setPreview] = useState<PullPreview | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [applied, setApplied] = useState(false)
  const stale = base !== signature
  if (preview && preview.signature !== signature) setPreview(null)
  if (applied && stale) {
    setBase(signature)
    setApplied(false)
  }
  let targets: PullTarget[] = [],
    sourceError = ''
  try {
    targets = pullTargets(scene, cabinet.id)
  } catch (cause) {
    sourceError = cause instanceof Error ? cause.message : 'Fronts are unavailable.'
  }
  const disabled = (stale && !applied) || !!sourceError
  const clearPreview = () => {
    setPreview(null)
    setError('')
    setMessage('')
    setApplied(false)
  }
  const select = (ids: string[]) => {
    setSelected(ids)
    clearPreview()
  }
  const patch = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    clearPreview()
  }
  const stage = (value: PullSpec | null) => {
    try {
      setDraft(stagePull(scene, cabinet.id, draft, selected, value))
      clearPreview()
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : 'Cannot stage pull settings.')
    }
  }
  const reset = () => {
    setBase(signature)
    setDraft({})
    setSelected([])
    setForm(formOf())
    clearPreview()
  }
  const one = selected.length === 1 ? targets.find((t) => t.id === selected[0]) : undefined
  const field = (
    key: 'pitch' | 'diameter' | 'horizontalOffset' | 'verticalOffset',
    label: string,
  ) => (
    <label>
      {label} (mm)
      <input
        aria-label={label}
        type="number"
        step="any"
        value={form[key]}
        disabled={key === 'pitch' && form.kind === 'knob'}
        onChange={(e) => patch(key, e.target.value)}
        className="block border rounded p-1 w-full"
      />
    </label>
  )
  const proposed = preview?.scene
  const byId = new Map(proposed?.components.map((c) => [c.id, c]) ?? [])
  const proposedCabinet = proposed?.components.find(
    (c): c is CarcaseComponent => c.id === cabinet.id && c.kind === 'carcase',
  )
  const parts = proposed?.parts.filter((p) => nearestCarcase(p, byId)?.id === cabinet.id) ?? []
  return (
    <section aria-label="Cabinet hardware editor" className="text-xs max-w-5xl mx-auto space-y-4">
      <p>
        Place knob or bar-pull fixing holes on generated doors and drawer fronts. Dimensions
        describe generic through-drilling, not a vendor product or a solid handle model. Confirm
        fixing dimensions and screw length against your hardware.
      </p>
      <p>
        Stage settings before previewing. Selection changes keep staged edits; Reset and Cancel
        discard them. Auto horizontal placement uses the free edge on doors and the centre on drawer
        fronts. Centre offsets are signed; edge offsets point inward. Checks cover front edges and
        modeled hinge cups; review other machining and hardware-body clearances.
      </p>
      {stale && !applied && (
        <p role="alert">
          Cabinet geometry, parts or settings changed. Reset the hardware draft before continuing.
        </p>
      )}
      {sourceError && <p role="alert">{sourceError}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={disabled} className="border rounded p-3 space-y-2">
        <legend>Front selection</legend>
        <div className="flex flex-wrap gap-2">
          {(['All', 'Doors', 'Drawer fronts', 'Configured pulls'] as const).map((label) => (
            <Button
              key={label}
              size="sm"
              variant="outline"
              onClick={() =>
                select(
                  targets
                    .filter(
                      (t) =>
                        !t.locked &&
                        (label === 'All' ||
                          (label === 'Doors' && t.kind === 'door') ||
                          (label === 'Drawer fronts' && t.kind === 'drawer-front') ||
                          (label === 'Configured pulls' && !!t.part.frontPull)),
                    )
                    .map((t) => t.id),
                )
              }
            >
              Select {label.toLowerCase()}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => select([])}>
            Clear front selection
          </Button>
        </div>
        {!targets.length && (
          <p>No eligible fronts. Add doors or drawer fronts in Fronts &amp; Drawers first.</p>
        )}
        {targets.map((t) => (
          <div key={t.id} className="border rounded p-2">
            <label>
              <input
                type="checkbox"
                disabled={t.locked}
                checked={selected.includes(t.id)}
                onChange={(e) =>
                  select(
                    e.target.checked ? [...selected, t.id] : selected.filter((id) => id !== t.id),
                  )
                }
              />{' '}
              {t.label} —{' '}
              {t.kind === 'door' ? `${t.hinge}-hinged leaf ${t.leaf + 1}` : 'drawer front'}
              {t.locked && ' (locked: detached parts)'}
            </label>
            <p>
              {t.part.frontPull
                ? hardwareDefinition(pullHardwareKey(t.part.frontPull))?.name
                : 'No pull configured'}
              {Object.hasOwn(draft, t.id) &&
                (draft[t.id] ? ' — settings staged' : ' — removal staged')}
            </p>
            {pullIssues(t).map((issue) => (
              <p key={issue} role="alert">
                {issue} Invalid pull drilling is omitted until corrected.
              </p>
            ))}
          </div>
        ))}
        <p>
          {selected.length} selected; {Object.keys(draft).length} staged.
        </p>
      </fieldset>
      <fieldset disabled={disabled} className="border rounded p-3 grid grid-cols-2 gap-3">
        <legend>Pull settings</legend>
        <label>
          Fixing type
          <select
            aria-label="Pull type"
            value={form.kind}
            onChange={(e) => patch('kind', e.target.value as PullSpec['kind'])}
            className="block border rounded p-1 w-full"
          >
            <option value="knob">Single-hole knob</option>
            <option value="bar">Two-hole bar pull</option>
          </select>
        </label>
        <label>
          Bar orientation
          <select
            aria-label="Pull orientation"
            value={form.orientation}
            disabled={form.kind === 'knob'}
            onChange={(e) => patch('orientation', e.target.value as PullSpec['orientation'])}
            className="block border rounded p-1 w-full"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </label>
        {field('pitch', 'Fixing pitch')}
        {field('diameter', 'Fixing diameter')}
        <label>
          Horizontal reference
          <select
            aria-label="Pull horizontal reference"
            value={form.horizontal}
            onChange={(e) => patch('horizontal', e.target.value as PullSpec['horizontal'])}
            className="block border rounded p-1 w-full"
          >
            <option value="auto">Auto: free edge / drawer centre</option>
            <option value="left">Left edge</option>
            <option value="right">Right edge</option>
            <option value="center">Centre</option>
          </select>
        </label>
        <label>
          Vertical reference
          <select
            aria-label="Pull vertical reference"
            value={form.vertical}
            onChange={(e) => patch('vertical', e.target.value as PullSpec['vertical'])}
            className="block border rounded p-1 w-full"
          >
            <option value="top">Top edge</option>
            <option value="bottom">Bottom edge</option>
            <option value="center">Centre</option>
          </select>
        </label>
        {field('horizontalOffset', 'Horizontal offset')}
        {field('verticalOffset', 'Vertical offset')}
        <div className="col-span-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={!selected.length} onClick={() => stage(settingOf(form))}>
            Stage pull settings
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length}
            onClick={() => stage(null)}
          >
            Stage pull removal
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!one?.part.frontPull}
            onClick={() => {
              setForm(formOf(one!.part.frontPull!))
              clearPreview()
            }}
          >
            Load selected pull
          </Button>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={disabled || !Object.keys(draft).length}
          onClick={() => {
            clearPreview()
            setPreview(previewPulls(scene, cabinet.id, draft))
          }}
        >
          Preview hardware changes
        </Button>
        <Button
          size="sm"
          disabled={stale || !preview?.scene || !preview.changed || !!preview.errors.length}
          onClick={() => {
            if (!preview || !onApply(preview)) {
              setError('The project changed after preview. Reset and preview again.')
              setPreview(null)
              return
            }
            setDraft({})
            setPreview(null)
            setApplied(true)
            setError('')
            setMessage('Hardware changes applied.')
          }}
        >
          Apply hardware changes
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset hardware draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel hardware changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Hardware layout preview" className="space-y-3">
          {preview.errors.map((issue) => (
            <p key={issue} role="alert">
              {issue}
            </p>
          ))}
          {!preview.errors.length && !preview.changed && <p>No changes to apply.</p>}
          {proposed && proposedCabinet && (
            <>
              <section aria-label="Pull fixing summary">
                <h3 className="font-medium">
                  Fixing centres from the front's left and bottom edges (mm)
                </h3>
                {pullTargets(proposed, cabinet.id)
                  .filter((t) => Object.hasOwn(draft, t.id))
                  .map((t) => {
                    const cut = t.part.cuts.find(
                      (c) => c.kind === 'hole-array' && c.id === `pull_${t.part.role}`,
                    )
                    return (
                      <p key={t.id}>
                        {t.label}:{' '}
                        {cut?.kind === 'hole-array'
                          ? Array.from(
                              { length: cut.count },
                              (_, i) =>
                                `(${(cut.start.y + (cut.axis === 'V' ? cut.pitch * i : 0)).toFixed(2)}, ${(cut.start.x + (cut.axis === 'U' ? cut.pitch * i : 0)).toFixed(2)})`,
                            ).join(', ') + `; diameter ${cut.diameter} mm; through ${cut.depth} mm`
                          : 'pull removed'}
                      </p>
                    )
                  })}
              </section>
              <section aria-label="Pull hardware quantities">
                <h3 className="font-medium">Hardware quantity changes</h3>
                {preview.hardware.length ? (
                  preview.hardware.map((h) => (
                    <p key={h.key}>
                      {hardwareDefinition(h.key)?.name ?? h.key}: {h.before} → {h.after}
                    </p>
                  ))
                ) : (
                  <p>Quantities unchanged.</p>
                )}
              </section>
              <div className="grid gap-3 lg:grid-cols-3">
                {(['Front', 'Top', 'End'] as const).map((view) => (
                  <section key={view} aria-label={`Hardware ${view} preview`}>
                    <h3>{view}</h3>
                    <div className="h-72 pointer-events-none">
                      <CabinetProjection
                        view={view}
                        cabinet={proposedCabinet}
                        materials={proposed.materials}
                        parts={parts}
                        byId={byId}
                        selectedId={selected[0] ?? null}
                        onSelect={() => {}}
                      />
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </section>
  )
}
