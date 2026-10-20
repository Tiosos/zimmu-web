import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import { nearestCarcase } from '../scene/nearestCarcase'
import { CabinetProjection } from './CabinetProjection'
import {
  FINISHING_KINDS,
  finishingDraft,
  finishingMaterials,
  finishingSignature,
  previewFinishing,
  type FinishingDraft,
  type FinishingKind,
  type FinishingPreview,
} from '../scene/finishingPanels'

export function CabinetFinishingEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: FinishingPreview) => boolean
}) {
  const signature = finishingSignature(scene)
  const [base, setBase] = useState(signature)
  const [draft, setDraft] = useState(() => finishingDraft(scene, cabinet.id))
  const [preview, setPreview] = useState<FinishingPreview | null>(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)
  const [message, setMessage] = useState('')
  const stale = base !== signature
  if (preview && preview.signature !== signature) setPreview(null)
  // Apply adds an ordinary board. Capture the parent's reconciled scene, including its new ID.
  if (applied && stale) {
    setBase(signature)
    setApplied(false)
  }
  const patch = <K extends keyof FinishingDraft>(key: K, value: FinishingDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setPreview(null)
    setError('')
    setApplied(false)
    setMessage('')
  }
  const reset = (kind = draft.kind) => {
    setDraft(finishingDraft(scene, cabinet.id, kind))
    setBase(signature)
    setPreview(null)
    setError('')
    setApplied(false)
    setMessage('')
  }
  const numericField = (
    key: 'left' | 'right' | 'front' | 'rear' | 'height' | 'fillerWidth' | 'bottom' | 'setback',
    label: string,
  ) => (
    <label key={key}>
      {label} (mm)
      <input
        aria-label={label}
        type="number"
        step="any"
        min="0"
        className="block w-full border rounded p-1"
        value={draft[key]}
        onChange={(e) => patch(key, e.target.value)}
      />
    </label>
  )
  const byId = new Map(scene.components.map((c) => [c.id, c]))
  const parts = scene.parts.filter((p) => nearestCarcase(p, byId)?.id === cabinet.id)
  const p = preview?.part
  return (
    <section aria-label="Cabinet finishing editor" className="text-xs max-w-5xl mx-auto space-y-4">
      <p>
        Create a worktop or finishing panel in this cabinet's local frame. Boards move and rotate
        with the cabinet; their sizes remain fixed after creation. Edit or delete them with the
        normal part tools.
      </p>
      <p>
        Defaults use the occupied envelope from material slots, including fronts, frames and applied
        backs. Individual board overrides do not change that envelope. No joints, machining or
        clearance checks are added. Drafts are discarded when leaving this tab.
      </p>
      {stale && !applied && (
        <p role="alert">
          Cabinet geometry, parts or materials changed. Reset the finishing draft before continuing.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={stale && !applied} className="border rounded p-3 grid grid-cols-2 gap-3">
        <legend>Finishing board</legend>
        <label>
          Panel type
          <select
            aria-label="Finishing panel type"
            value={draft.kind}
            onChange={(e) => reset(e.target.value as FinishingKind)}
            className="block border rounded p-1 w-full"
          >
            {FINISHING_KINDS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Board name
          <input
            aria-label="Finishing board name"
            value={draft.label}
            onChange={(e) => patch('label', e.target.value)}
            className="block border rounded p-1 w-full"
          />
        </label>
        <label>
          Panel material
          <select
            aria-label="Finishing material"
            value={draft.material}
            onChange={(e) => {
              setDraft((current) => ({
                ...current,
                material: e.target.value,
                thickness:
                  current.thicknessMode === 'stock'
                    ? String(scene.materials[e.target.value]?.thickness ?? '')
                    : current.thickness,
              }))
              setPreview(null)
              setError('')
              setApplied(false)
            }}
            className="block border rounded p-1 w-full"
          >
            <option value="">Choose a material</option>
            {finishingMaterials(scene).map((name) => (
              <option key={name} value={name}>
                {name} ({scene.materials[name].thickness} mm)
              </option>
            ))}
          </select>
        </label>
        <label>
          Grain
          <select
            aria-label="Finishing grain"
            value={draft.grain}
            onChange={(e) => patch('grain', e.target.value as FinishingDraft['grain'])}
            className="block border rounded p-1 w-full"
          >
            {['length', 'width', 'free'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Thickness source
          <select
            aria-label="Finishing thickness source"
            value={draft.thicknessMode}
            onChange={(e) =>
              patch('thicknessMode', e.target.value as FinishingDraft['thicknessMode'])
            }
            className="block border rounded p-1 w-full"
          >
            <option value="stock">Stock thickness</option>
            <option value="custom">Custom thickness</option>
          </select>
        </label>
        <label>
          Custom thickness (mm)
          <input
            aria-label="Finishing custom thickness"
            type="number"
            step="any"
            min="0"
            disabled={draft.thicknessMode === 'stock'}
            value={draft.thickness}
            onChange={(e) => patch('thickness', e.target.value)}
            className="block border rounded p-1 w-full"
          />
        </label>
        {draft.kind === 'worktop' ? (
          <>
            {numericField('left', 'Left overhang')}
            {numericField('right', 'Right overhang')}
            {numericField('front', 'Front overhang')}
            {numericField('rear', 'Rear overhang')}
          </>
        ) : (
          numericField('height', 'Panel height')
        )}
        {draft.kind.includes('filler') && numericField('fillerWidth', 'Filler width')}
        {numericField(
          'bottom',
          draft.kind === 'worktop'
            ? 'Worktop vertical gap'
            : draft.kind === 'splashback'
              ? 'Splashback clearance'
              : 'Bottom clearance',
        )}
        {draft.kind === 'plinth' && numericField('setback', 'Plinth setback')}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => reset()}>
          Fit to cabinet defaults
        </Button>
        <Button
          size="sm"
          disabled={stale && !applied}
          onClick={() => {
            setError('')
            setApplied(false)
            setPreview(previewFinishing(scene, cabinet.id, draft))
          }}
        >
          Preview finishing board
        </Button>
        <Button
          size="sm"
          disabled={stale || !p || !!preview?.errors.length}
          onClick={() => {
            if (!preview || !onApply(preview)) {
              setError('The project changed after preview. Reset and preview again.')
              setPreview(null)
              return
            }
            setPreview(null)
            setError('')
            setApplied(true)
            setMessage('Finishing board added.')
          }}
        >
          Add finishing board
        </Button>
        <Button size="sm" variant="outline" onClick={() => reset()}>
          Reset finishing draft
        </Button>
        <Button size="sm" variant="outline" onClick={() => reset()}>
          Cancel finishing changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Finishing board preview" className="space-y-4">
          {preview.errors.map((e) => (
            <p key={e} role="alert">
              {e}
            </p>
          ))}
          {p && (
            <>
              <section aria-label="Finishing board size summary">
                <h3 className="font-medium">{p.label}</h3>
                <p>
                  {p.length.toFixed(2)} × {p.width.toFixed(2)} × {p.thickness.toFixed(2)} mm —
                  length × width × thickness
                </p>
                <p>
                  Material: {p.material}. Grain: {p.grain}. Area:{' '}
                  {((p.length * p.width) / 1e6).toFixed(4)} m². Quantity: 1.
                </p>
                {p.thickness !== scene.materials[p.material].thickness && (
                  <p>
                    Custom board thickness {p.thickness} mm differs from stock thickness{' '}
                    {scene.materials[p.material].thickness} mm.
                  </p>
                )}
                <p>
                  Local extents: X {preview.bounds!.x0.toFixed(2)} to{' '}
                  {preview.bounds!.x1.toFixed(2)}, Y {preview.bounds!.y0.toFixed(2)} to{' '}
                  {preview.bounds!.y1.toFixed(2)}, Z {preview.bounds!.z0.toFixed(2)} to{' '}
                  {preview.bounds!.z1.toFixed(2)} mm.
                </p>
              </section>
              <div className="grid gap-3 lg:grid-cols-3">
                {(['Front', 'Top', 'End'] as const).map((view) => (
                  <section key={view} aria-label={`Finishing ${view} preview`}>
                    <h3>{view}</h3>
                    <div className="h-72 pointer-events-none">
                      <CabinetProjection
                        view={view}
                        cabinet={cabinet}
                        materials={scene.materials}
                        parts={[...parts, p]}
                        byId={byId}
                        selectedId={p.id}
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
