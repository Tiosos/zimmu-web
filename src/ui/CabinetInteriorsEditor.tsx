import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CabinetProjection } from './CabinetProjection'
import { componentsById } from '../scene/componentTree'
import { frontsSignature } from '../scene/frontsDrawers'
import { defaultInterior } from '../scene/sectionInterior'
import {
  emptyShelfSpec,
  interiorTargets,
  parseShelfForm,
  previewInteriors,
  shelfForm,
  stageInteriors,
  type InteriorTarget,
  type InteriorsDraft,
  type InteriorsPreview,
  type ShelfForm,
} from '../scene/shelvesInteriors'
import type { CarcaseComponent, Scene } from '../scene/types'
export function CabinetInteriorsEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: InteriorsPreview) => boolean
}) {
  const signature = frontsSignature(scene),
    context = JSON.stringify([cabinet.id, signature])
  const [base, setBase] = useState(context),
    [draft, setDraft] = useState<InteriorsDraft>({}),
    [selected, setSelected] = useState<string[]>([]),
    [form, setForm] = useState(shelfForm),
    [copy, setCopy] = useState(''),
    [preview, setPreview] = useState<InteriorsPreview | null>(null),
    [error, setError] = useState(''),
    [applied, setApplied] = useState(false)
  const stale = base !== context
  if (preview && (preview.signature !== signature || stale)) setPreview(null)
  if (applied && stale) {
    setBase(context)
    setApplied(false)
    setDraft({})
    setSelected([])
  }
  let targets: InteriorTarget[] = [],
    sourceError = ''
  try {
    targets = interiorTargets(scene, cabinet.id)
  } catch (cause) {
    sourceError = cause instanceof Error ? cause.message : 'Openings are unavailable.'
  }
  const disabled = stale || !!sourceError
  const clear = () => {
    setPreview(null)
    setError('')
  }
  const stage = (standard?: 'standard' | 'empty') => {
    try {
      setDraft(
        stageInteriors(
          scene,
          cabinet.id,
          draft,
          selected,
          standard === 'standard'
            ? defaultInterior(1)
            : standard === 'empty'
              ? emptyShelfSpec()
              : parseShelfForm(form),
        ),
      )
      clear()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Interior staging failed.')
      setPreview(null)
    }
  }
  const reset = () => {
    setBase(context)
    setDraft({})
    setSelected([])
    setForm(shelfForm())
    setCopy('')
    setApplied(false)
    clear()
  }
  const names: Record<keyof ShelfForm, string> = {
    fixed: 'Fixed shelf count',
    shelves: 'Adjustable shelf count',
    count: 'Pin positions per row',
    rows: 'Pin rows',
    front: 'Front pin setback',
    back: 'Rear pin setback',
  }
  const summary = (target: InteriorTarget) => {
    const s = draft[target.id] ?? target.spec
    return `${s.fixedShelves} fixed · ${s.adjustable.shelves} adjustable · ${s.adjustable.count} pin positions × ${s.adjustable.rows} rows · ${s.adjustable.setback}/${s.adjustable.backSetback} mm setbacks`
  }
  const proposed = preview?.scene?.components.find(
    (c): c is CarcaseComponent => c.kind === 'carcase' && c.id === cabinet.id,
  )
  return (
    <section
      aria-label="Shelves and interiors editor"
      className="text-xs max-w-5xl mx-auto space-y-3"
    >
      <p>
        Stage shelving for physical cabinet openings, preview generated boards and pin drilling,
        then apply in one undo step. Pin pitch is fixed at 32 mm. Detached shelf boards lock their
        opening. Drafts are discarded when leaving this tab.
      </p>
      {stale && (
        <p role="alert">
          The scene changed. Your interior draft is retained; reset before staging or previewing.
        </p>
      )}
      {(error || sourceError) && <p role="alert">{error || sourceError}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setSelected(targets.filter((t) => !t.locked).map((t) => t.id))
            clear()
          }}
        >
          Select all editable openings
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSelected([])
            clear()
          }}
        >
          Clear interior selection
        </Button>
      </div>
      <ul>
        {targets.map((t) => (
          <li key={t.id} className="border rounded p-2">
            <label>
              <input
                type="checkbox"
                aria-label={`Shelve opening ${t.number}`}
                disabled={disabled || t.locked}
                checked={selected.includes(t.id)}
                onChange={(e) => {
                  setSelected(
                    e.target.checked ? [...selected, t.id] : selected.filter((id) => id !== t.id),
                  )
                  clear()
                }}
              />{' '}
              Opening {t.number}
              {t.locked ? ' (detached shelves)' : ''}
            </label>
            <p>
              {summary(t)}
              {draft[t.id] ? ' · staged' : ''}
            </p>
            {draft[t.id] && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = { ...draft }
                  delete next[t.id]
                  setDraft(next)
                  clear()
                }}
              >
                Discard opening {t.number} changes
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p>
        {selected.length} selected · {Object.keys(draft).length} staged openings
      </p>
      <fieldset className="border rounded p-3 grid grid-cols-2 gap-3">
        <legend>Shelf settings</legend>
        {(Object.keys(names) as (keyof ShelfForm)[]).map((key) => (
          <label key={key}>
            {names[key]}
            {key === 'front' || key === 'back' ? ' (mm)' : ''}
            {key === 'rows' ? (
              <select
                aria-label={names[key]}
                value={form[key]}
                onChange={(e) => {
                  setForm({ ...form, [key]: e.target.value })
                  clear()
                }}
              >
                <option value="1">One row per side</option>
                <option value="2">Two rows per side</option>
              </select>
            ) : (
              <input
                aria-label={names[key]}
                className="border rounded px-2 w-28 ml-2"
                type="number"
                step={key === 'front' || key === 'back' ? 'any' : '1'}
                value={form[key]}
                onChange={(e) => {
                  setForm({ ...form, [key]: e.target.value })
                  clear()
                }}
              />
            )}
          </label>
        ))}
        <p>Pin pitch: 32 mm</p>
      </fieldset>
      <label>
        Copy settings from
        <select
          aria-label="Copy interior settings from"
          value={copy}
          onChange={(e) => {
            setCopy(e.target.value)
            clear()
          }}
        >
          <option value="">Choose an opening</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              Opening {t.number}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={!copy || disabled}
        onClick={() => {
          const target = targets.find((t) => t.id === copy)
          if (target) {
            setForm(shelfForm(draft[copy] ?? target.spec))
            clear()
          }
        }}
      >
        Copy interior settings
      </Button>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" disabled={disabled || !selected.length} onClick={() => stage()}>
          Stage shelf settings
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !selected.length}
          onClick={() => stage('standard')}
        >
          Stage standard shelves
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !selected.length}
          onClick={() => stage('empty')}
        >
          Remove shelves and drilling
        </Button>
        <Button
          size="sm"
          disabled={disabled || !Object.keys(draft).length}
          onClick={() => {
            setPreview(previewInteriors(scene, cabinet.id, draft))
            setError('')
          }}
        >
          Preview interiors
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset interiors draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel interior changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Interiors preview" className="border rounded p-3 space-y-3">
          {preview.errors.length > 0 ? (
            <div role="alert">{preview.errors.join('; ')}</div>
          ) : (
            <>
              <p>
                Affected shelf boards: {preview.beforeBoards} → {preview.boards.length}. Proposed
                pin bores: {preview.pinBores}.
              </p>
              <div className="h-80 pointer-events-none" aria-label="Proposed interior elevation">
                {proposed && (
                  <CabinetProjection
                    view="Front"
                    cabinet={proposed}
                    parts={preview.scene!.parts}
                    byId={componentsById(preview.scene!.components)}
                    materials={preview.scene!.materials}
                    selectedId={null}
                    onSelect={() => {}}
                    sectionViews={false}
                  />
                )}
              </div>
              <table className="w-full text-left">
                <caption>Proposed shelf boards</caption>
                <thead>
                  <tr>
                    <th>Board</th>
                    <th>Length × width × thickness</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.boards.map((b) => (
                    <tr key={b.role}>
                      <th scope="row">{b.label}</th>
                      <td>{b.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full text-left">
                <caption>Hardware quantity changes</caption>
                <thead>
                  <tr>
                    <th>Hardware</th>
                    <th>Current</th>
                    <th>Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.hardware.map((r) => (
                    <tr key={r.key}>
                      <th scope="row">{r.key}</th>
                      <td>{r.before}</td>
                      <td>{r.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!preview.changed && <p>No interior changes proposed.</p>}
            </>
          )}
          {preview.diagnostics.length > 0 && (
            <div aria-label="Shelf insertion diagnostics">
              {preview.diagnostics.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
            </div>
          )}
          <p>
            Insertion diagnostics and generated drilling describe the current model. Review
            production and installation readiness before manufacturing.
          </p>
          <Button
            size="sm"
            disabled={stale || preview.errors.length > 0 || !preview.changed}
            onClick={() => {
              if (onApply(preview)) {
                setApplied(true)
                setPreview(null)
                setDraft({})
                setSelected([])
              } else {
                setError('Interiors could not be applied. Reset and preview again.')
                setPreview(null)
              }
            }}
          >
            Apply interiors
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            Close interiors preview
          </Button>
        </section>
      )}
    </section>
  )
}
