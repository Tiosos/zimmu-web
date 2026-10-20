import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import { nearestCarcase } from '../scene/nearestCarcase'
import { finishingMaterials } from '../scene/finishingPanels'
import { CabinetProjection } from './CabinetProjection'
import {
  FRONT_CHOICES,
  emptyFrontsDraft,
  frontChoice,
  frontTargets,
  frontsSignature,
  previewFronts,
  stageDrawer,
  stageFront,
  type DrawerAction,
  type FrontsDraft,
  type FrontsPreview,
  type FrontTarget,
} from '../scene/frontsDrawers'

export function CabinetFrontsEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: FrontsPreview) => boolean
}) {
  const signature = frontsSignature(scene)
  const [base, setBase] = useState(signature)
  const [draft, setDraft] = useState(emptyFrontsDraft)
  const [selected, setSelected] = useState<string[]>([])
  const [height, setHeight] = useState('120')
  const [offset, setOffset] = useState('32')
  const [material, setMaterial] = useState('')
  const [preview, setPreview] = useState<FrontsPreview | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [applied, setApplied] = useState(false)
  const stale = signature !== base
  if (preview && preview.signature !== signature) setPreview(null)
  if (applied && stale) {
    setBase(signature)
    setApplied(false)
  }
  let targets: FrontTarget[] = [],
    sourceError = ''
  try {
    targets = frontTargets(scene, cabinet.id)
  } catch (cause) {
    sourceError = cause instanceof Error ? cause.message : 'Openings are unavailable.'
  }
  const disabled = (stale && !applied) || !!sourceError
  const choice = (t: FrontTarget) => draft.fronts[t.id] ?? frontChoice(t.front)
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
  const perform = (f: () => FrontsDraft) => {
    try {
      setDraft(f())
      clearPreview()
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : 'The settings could not be staged.')
    }
  }
  const drawer = (action: DrawerAction) =>
    perform(() => stageDrawer(scene, cabinet.id, draft, selected, action))
  const reset = () => {
    setBase(signature)
    setDraft(emptyFrontsDraft())
    setSelected([])
    setHeight('120')
    setOffset('32')
    setMaterial('')
    clearPreview()
  }
  const staged = targets.filter(
    (t) => draft.fronts[t.id] !== undefined || draft.drawers[t.id] !== undefined,
  )
  const byId = new Map(preview?.scene?.components.map((c) => [c.id, c]) ?? [])
  const proposed = preview?.scene?.components.find(
    (c): c is CarcaseComponent => c.id === cabinet.id && c.kind === 'carcase',
  )
  return (
    <section
      aria-label="Cabinet fronts and drawers editor"
      className="text-xs max-w-5xl mx-auto space-y-4"
    >
      <p>
        Select openings and stage coordinated front and drawer changes. Selection filters use staged
        front choices. Changing or clearing the selection retains staged edits; Reset and Cancel
        discard them. Drafts are discarded when leaving this tab.
      </p>
      <p>
        Independent face-frame openings are listed separately. Openings with detached fronts, drawer
        components or drawer-box parts are locked. Existing runner and hinge models retain their
        documented installation limitations.
      </p>
      {stale && !applied && (
        <p role="alert">
          Cabinet geometry, parts, drawer settings or materials changed. Reset the front draft
          before continuing.
        </p>
      )}
      {sourceError && <p role="alert">{sourceError}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={disabled} className="border rounded p-3 space-y-2">
        <legend>Opening selection</legend>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => select(targets.filter((t) => !t.locked).map((t) => t.id))}
          >
            Select all openings
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              select(
                targets
                  .filter(
                    (t) =>
                      !t.locked && ['left-door', 'right-door', 'double-door'].includes(choice(t)),
                  )
                  .map((t) => t.id),
              )
            }
          >
            Select door openings
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              select(
                targets.filter((t) => !t.locked && choice(t) === 'drawer-front').map((t) => t.id),
              )
            }
          >
            Select drawer openings
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              select(targets.filter((t) => !t.locked && choice(t) === 'none').map((t) => t.id))
            }
          >
            Select uncovered openings
          </Button>
          <Button size="sm" variant="outline" onClick={() => select([])}>
            Clear opening selection
          </Button>
        </div>
        <p>
          {selected.length} selected. {staged.length} openings have staged edits.
        </p>
        {targets.map((t, index) => (
          <label key={t.id} className="block">
            <input
              type="checkbox"
              aria-label={`Select opening ${index + 1}`}
              checked={selected.includes(t.id)}
              disabled={t.locked}
              onChange={(e) =>
                select(
                  e.target.checked ? [...selected, t.id] : selected.filter((id) => id !== t.id),
                )
              }
            />{' '}
            Opening {index + 1}
            {t.frame ? ' (frame opening)' : ''}: {choice(t)} — {(t.rect.x1 - t.rect.x0).toFixed(1)}{' '}
            × {(t.rect.z1 - t.rect.z0).toFixed(1)} mm{t.locked ? ' — detached parts: locked' : ''}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={disabled || !selected.length} className="border rounded p-3 space-y-2">
        <legend>Stage fronts</legend>
        <div className="flex flex-wrap gap-2">
          {FRONT_CHOICES.map(([value, label]) => (
            <Button
              key={value}
              size="sm"
              variant="outline"
              onClick={() => perform(() => stageFront(scene, cabinet.id, draft, selected, value))}
            >
              {label}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled || !selected.length} className="border rounded p-3 space-y-3">
        <legend>Stage drawer settings</legend>
        <p>
          Every selected opening must carry a current or staged drawer front. Settings apply only
          when you press a Stage button.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => drawer({ kind: 'family', value: 'side-mount' })}
          >
            Stage side-mount runners
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => drawer({ kind: 'family', value: 'undermount' })}
          >
            Stage undermount runners
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => drawer({ kind: 'height', value: null })}
          >
            Stage automatic box height
          </Button>
          <label>
            Custom box height (mm)
            <input
              aria-label="Front draft box height"
              type="number"
              step="any"
              min="0"
              value={height}
              onChange={(e) => {
                setHeight(e.target.value)
                clearPreview()
              }}
              className="block border rounded p-1"
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => drawer({ kind: 'height', value: height })}
          >
            Stage custom box height
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label>
            Side-mount runner offset (mm)
            <input
              aria-label="Front draft runner offset"
              type="number"
              step="any"
              min="0"
              value={offset}
              onChange={(e) => {
                setOffset(e.target.value)
                clearPreview()
              }}
              className="block border rounded p-1"
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => drawer({ kind: 'offset', value: offset })}
          >
            Stage runner offset
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label>
            Drawer-box material
            <select
              aria-label="Front draft drawer material"
              value={material}
              onChange={(e) => {
                setMaterial(e.target.value)
                clearPreview()
              }}
              className="block border rounded p-1"
            >
              <option value="">Conventional drawer default (15 mm sides)</option>
              {finishingMaterials(scene).map((name) => (
                <option key={name} value={name}>
                  {name} ({scene.materials[name].thickness} mm)
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => drawer({ kind: 'material', value: material })}
          >
            Stage drawer material
          </Button>
        </div>
      </fieldset>
      <section aria-label="Staged front and drawer edits">
        <h3 className="font-medium">Staged edits</h3>
        {staged.length ? (
          <ul>
            {staged.map((t) => (
              <li key={t.id}>
                Opening {targets.indexOf(t) + 1}: {choice(t)}
                {draft.drawers[t.id]
                  ? ` — ${Object.entries(draft.drawers[t.id])
                      .map(
                        ([key, value]) =>
                          `${key}: ${value === null ? 'automatic' : value === '' ? 'conventional default' : value}`,
                      )
                      .join(', ')}`
                  : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No staged edits.</p>
        )}
      </section>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={disabled || !staged.length}
          onClick={() => {
            setError('')
            setMessage('')
            setPreview(previewFronts(scene, cabinet.id, draft))
          }}
        >
          Preview fronts and drawers
        </Button>
        <Button
          size="sm"
          disabled={stale || !preview?.scene || !preview.changed || !!preview.errors.length}
          onClick={() => {
            if (!preview || !onApply(preview)) {
              setPreview(null)
              setError('The project changed after preview. Reset and preview again.')
              return
            }
            setDraft(emptyFrontsDraft())
            setPreview(null)
            setError('')
            setApplied(true)
            setMessage('Front and drawer changes applied.')
          }}
        >
          Apply fronts and drawers
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset front draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel front changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Fronts and drawers preview" className="space-y-4">
          {preview.errors.map((e) => (
            <p key={e} role="alert">
              {e}
            </p>
          ))}
          {!preview.errors.length && !preview.changed && <p>No design changes to apply.</p>}
          {preview.scene && proposed && (
            <>
              <section aria-label="Proposed front elevation" className="h-96 pointer-events-none">
                <CabinetProjection
                  view="Front"
                  cabinet={proposed}
                  materials={preview.scene.materials}
                  parts={preview.scene.parts.filter(
                    (p) => nearestCarcase(p, byId)?.id === cabinet.id,
                  )}
                  byId={byId}
                  selectedId={null}
                  onSelect={() => {}}
                />
              </section>
              <section aria-label="Front hardware changes">
                <h3 className="font-medium">Hardware quantity changes</h3>
                {preview.hardware.length ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th>Hardware key</th>
                        <th>Before</th>
                        <th>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.hardware.map((h) => (
                        <tr key={h.key}>
                          <th>{h.key}</th>
                          <td>{h.before}</td>
                          <td>{h.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No hardware quantity changes.</p>
                )}
              </section>
              <section aria-label="Front board changes">
                <h3 className="font-medium">Board quantity and size changes</h3>
                <p>
                  {preview.boards.length} changed board rows. Only quantity, dimensions, material
                  and labels are compared here.
                </p>
                {preview.boards.length ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th>Before</th>
                        <th>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.boards.map((b) => (
                        <tr key={b.key}>
                          <td>{b.before}</td>
                          <td>{b.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No board quantity or size changes.</p>
                )}
              </section>
            </>
          )}
        </section>
      )}
    </section>
  )
}
