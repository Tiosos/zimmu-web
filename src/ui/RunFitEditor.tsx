import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import { frontsSignature } from '../scene/frontsDrawers'
import { layoutCabinets } from '../scene/layoutTools'
import { previewRunFit, runFitDraft, type RunFitDraft, type RunFitPreview } from '../scene/runFit'
import { PlanView } from './PlanView'

export function RunFitEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: RunFitPreview) => boolean
}) {
  const signature = frontsSignature(scene)
  const context = JSON.stringify([cabinet.id, signature])
  const [base, setBase] = useState(context)
  const [draft, setDraft] = useState(() => runFitDraft([cabinet.id]))
  const [preview, setPreview] = useState<RunFitPreview | null>(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)
  const stale = base !== context
  if (preview && (preview.signature !== signature || stale)) setPreview(null)
  if (applied && stale) {
    setBase(context)
    setApplied(false)
    setDraft(runFitDraft([cabinet.id]))
  }
  const siblings = layoutCabinets(scene, cabinet.parentId)
  const names = new Map(siblings.map((c) => [c.id, c.label]))
  const patch = (next: RunFitDraft) => {
    setDraft(next)
    setPreview(null)
    setError('')
  }
  const reset = () => {
    setBase(context)
    patch(runFitDraft([cabinet.id]))
    setApplied(false)
  }
  const field = (key: 'target' | 'start' | 'end' | 'gap', label: string) => (
    <label className="block">
      {label} (mm)
      <input
        aria-label={label}
        type="number"
        step="any"
        className="border rounded px-2 ml-2 w-28"
        value={draft[key]}
        onChange={(e) => patch({ ...draft, [key]: e.target.value })}
      />
    </label>
  )
  const reorder = (index: number, delta: number) => {
    const entries = [...draft.entries]
    ;[entries[index], entries[index + delta]] = [entries[index + delta], entries[index]]
    patch({ ...draft, entries })
  }
  const display = (n: number) => Number(n.toFixed(3))
  return (
    <section aria-label="Fit cabinet run" className="text-xs max-w-5xl mx-auto space-y-3">
      <p>
        Fit co-oriented cabinets to a target span in their shared parent frame. Width limits are
        design constraints. Start/end reserves are empty space; filler boards are not generated. The
        target starts at the first cabinet's current occupied boundary. Near edges align; heights
        and rotations stay in place.
      </p>
      <p>
        X runs require 0° or 180° rotation; Y runs require 90° or 270°. Room walls and door swing
        need the existing room assessment.
      </p>
      {stale && (
        <p role="alert">The scene changed. Your fit draft is retained; reset before previewing.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <fieldset className="border rounded p-2">
        <legend>Cabinets to fit</legend>
        {siblings.map((c) => (
          <label key={c.id} className="block">
            <input
              type="checkbox"
              aria-label={`Fit ${c.label} (${c.id})`}
              checked={draft.entries.some((e) => e.id === c.id)}
              onChange={(event) =>
                patch({
                  ...draft,
                  entries: event.target.checked
                    ? [...draft.entries, { id: c.id, fixed: false, min: '100', max: '2400' }]
                    : draft.entries.filter((e) => e.id !== c.id),
                })
              }
            />{' '}
            {c.label}
          </label>
        ))}
      </fieldset>
      <p>{draft.entries.length} selected cabinets; the first cabinet defines the target origin.</p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => patch({ ...draft, entries: [...draft.entries].reverse() })}
      >
        Reverse fit order
      </Button>
      <ol>
        {draft.entries.map((entry, index) => (
          <li key={entry.id} className="border rounded p-2 space-y-2">
            <div>
              {index + 1}. {names.get(entry.id) ?? 'Missing cabinet'}
              <Button
                size="sm"
                variant="outline"
                aria-label={`Earlier fit cabinet ${index + 1}`}
                disabled={index === 0}
                onClick={() => reorder(index, -1)}
              >
                Earlier
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Later fit cabinet ${index + 1}`}
                disabled={index === draft.entries.length - 1}
                onClick={() => reorder(index, 1)}
              >
                Later
              </Button>
            </div>
            <label>
              <input
                type="checkbox"
                aria-label={`Keep width ${index + 1}`}
                checked={entry.fixed}
                onChange={(e) =>
                  patch({
                    ...draft,
                    entries: draft.entries.map((v) =>
                      v.id === entry.id ? { ...v, fixed: e.target.checked } : v,
                    ),
                  })
                }
              />{' '}
              Keep current width
            </label>
            {(['min', 'max'] as const).map((key) => (
              <label key={key} className="inline-block ml-2">
                {key === 'min' ? 'Minimum' : 'Maximum'} width (mm)
                <input
                  type="number"
                  step="any"
                  disabled={entry.fixed}
                  aria-label={`${key === 'min' ? 'Minimum' : 'Maximum'} width ${index + 1}`}
                  value={entry[key]}
                  className="border rounded px-1 ml-1 w-24"
                  onChange={(e) =>
                    patch({
                      ...draft,
                      entries: draft.entries.map((v) =>
                        v.id === entry.id ? { ...v, [key]: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </li>
        ))}
      </ol>
      <fieldset className="border rounded p-2 space-y-2">
        <legend>Target and allocation</legend>
        {field('target', 'Target span')}
        {field('start', 'Start reserve')}
        {field('end', 'End reserve')}
        {field('gap', 'Cabinet gap')}
        <label className="block">
          Run axis
          <select
            aria-label="Fit run axis"
            value={draft.axis}
            onChange={(e) => patch({ ...draft, axis: e.target.value as 'x' | 'y' })}
          >
            <option value="x">X</option>
            <option value="y">Y</option>
          </select>
        </label>
        <label className="block">
          Direction
          <select
            aria-label="Fit run direction"
            value={draft.direction}
            onChange={(e) => patch({ ...draft, direction: Number(e.target.value) as 1 | -1 })}
          >
            <option value={1}>Positive</option>
            <option value={-1}>Negative</option>
          </select>
        </label>
        <label className="block">
          Allocation
          <select
            aria-label="Fit width allocation"
            value={draft.allocation}
            onChange={(e) =>
              patch({ ...draft, allocation: e.target.value as RunFitDraft['allocation'] })
            }
          >
            <option value="equal">Equal widths</option>
            <option value="proportional">Proportional to current widths</option>
          </select>
        </label>
        <label className="block">
          <input
            type="checkbox"
            checked={draft.detach}
            onChange={(e) => patch({ ...draft, detach: e.target.checked })}
          />{' '}
          Detach selected anchors when fitting
        </label>
      </fieldset>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={stale || draft.entries.length < 2}
          onClick={() => {
            setPreview(previewRunFit(scene, draft))
            setError('')
          }}
        >
          Preview run fit
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset run fit
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel run fit
        </Button>
      </div>
      {preview && (
        <section aria-label="Run fit preview" className="border rounded p-3 space-y-3">
          {preview.errors.length > 0 ? (
            <div role="alert">{preview.errors.join('; ')}</div>
          ) : (
            <>
              <p>
                {display(preview.cabinetSpan)} mm cabinets + {display(preview.gaps)} mm gaps +{' '}
                {display(preview.reserve)} mm reserved = {display(preview.target)} mm target.
              </p>
              <div className="h-80 pointer-events-none" aria-label="Proposed run fit plan">
                <PlanView
                  scene={preview.scene!}
                  selectedId={null}
                  onSelect={() => {}}
                  onDrop={() => {}}
                  onTurn={() => {}}
                  warnings={[]}
                  cabinetIds={new Set(siblings.map((c) => c.id))}
                />
              </div>
              <table className="w-full text-left">
                <caption>Run fit comparison (mm)</caption>
                <thead>
                  <tr>
                    <th>Cabinet</th>
                    <th>Current width</th>
                    <th>Fitted width</th>
                    <th>Current X/Y/Z</th>
                    <th>Fitted X/Y/Z</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        {row.label}
                        {row.fixed ? ' (fixed)' : ''}
                      </th>
                      <td>{display(row.beforeWidth)}</td>
                      <td>{display(row.afterWidth)}</td>
                      <td>{Object.values(row.before).map(display).join(' / ')}</td>
                      <td>{Object.values(row.after).map(display).join(' / ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.overlaps.length > 0 && (
                <div role="alert">
                  <p>
                    Occupied envelopes overlap. Rotated bounds are conservative; review before
                    applying.
                  </p>
                  {preview.overlaps.map((o, i) => (
                    <p key={i}>
                      {o.a} / {o.b}: {display(o.x)} × {display(o.y)} × {display(o.z)} mm
                    </p>
                  ))}
                </div>
              )}
              {!preview.changed && <p>No run changes proposed.</p>}
            </>
          )}
          <Button
            size="sm"
            disabled={stale || preview.errors.length > 0 || !preview.changed}
            onClick={() => {
              if (onApply(preview)) {
                setApplied(true)
                setPreview(null)
              } else {
                setError('The run fit could not be applied. Reset and preview again.')
                setPreview(null)
              }
            }}
          >
            Apply run fit
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            Close run fit preview
          </Button>
        </section>
      )}
    </section>
  )
}
