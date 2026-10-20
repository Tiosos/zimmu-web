import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlanView } from './PlanView'
import {
  alignPlacement,
  placementDraft,
  placementSignature,
  placementTargets,
  PLACEMENT_ALIGNMENTS,
  previewPlacement,
  turnPlacement,
  type PlacementPreview,
  type PlacementDraft,
} from '../scene/placementTools'
import type { CarcaseComponent, Scene } from '../scene/types'

export function CabinetPlacementEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: PlacementPreview) => boolean
}) {
  const signature = placementSignature(scene)
  const [base, setBase] = useState(signature)
  const [draft, setDraft] = useState(() => placementDraft(cabinet))
  const [target, setTarget] = useState('')
  const [preview, setPreview] = useState<PlacementPreview | null>(null)
  const [error, setError] = useState('')
  const stale = base !== signature
  if (preview && preview.signature !== signature) setPreview(null)
  const locked = cabinet.anchor !== undefined && !draft.detach
  const dirty = JSON.stringify(draft) !== JSON.stringify(placementDraft(cabinet))
  let targets: CarcaseComponent[] = []
  try {
    targets = placementTargets(scene, cabinet.id)
  } catch {
    targets = []
  }
  const reset = () => {
    setBase(signature)
    setDraft(placementDraft(cabinet))
    setPreview(null)
    setError('')
  }
  const patch = <K extends keyof PlacementDraft>(key: K, value: PlacementDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setPreview(null)
    setError('')
  }
  const action = (f: () => PlacementDraft) => {
    try {
      setDraft(f())
      setPreview(null)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Placement action failed.')
    }
  }
  const siblings = new Set(
    scene.components
      .filter((c) => c.kind === 'carcase' && c.parentId === cabinet.parentId)
      .map((c) => c.id),
  )
  return (
    <section aria-label="Cabinet placement editor" className="text-xs max-w-5xl mx-auto space-y-4">
      <p>
        Stage positions in this cabinet's parent coordinate frame. Alignments use occupied
        envelopes, including front/frame and applied-back thickness from material slots. Individual
        board overrides do not move the placement envelope.
      </p>
      <p>
        Drafts are discarded when you leave this tab. Reference cabinets must share the parent and
        cannot be anchored followers of this cabinet.
      </p>
      {stale && (
        <p role="alert">
          Cabinet geometry, placement or materials changed. Your draft is retained; reset to the
          current scene before previewing.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {cabinet.anchor && (
        <label>
          <input
            type="checkbox"
            checked={draft.detach}
            onChange={(e) => patch('detach', e.target.checked)}
          />{' '}
          Detach existing anchor when applying
        </label>
      )}
      <fieldset className="grid grid-cols-3 gap-3 border rounded p-3">
        <legend>Position and rotation</legend>
        {(['x', 'y', 'z'] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()} (mm)
            <input
              aria-label={`Placement ${key.toUpperCase()}`}
              type="number"
              step="any"
              value={draft[key]}
              disabled={locked}
              onChange={(e) => patch(key, e.target.value)}
              className="block w-full border rounded p-1"
            />
          </label>
        ))}
        <label>
          Rotation Z (degrees)
          <input
            aria-label="Placement Rotation Z"
            type="number"
            step="any"
            disabled={locked}
            value={draft.rz}
            onChange={(e) => patch('rz', e.target.value)}
            className="block w-full border rounded p-1"
          />
        </label>
        <p>
          Existing tilt: X {draft.rx}°, Y {draft.ry}°. Reset rotation clears all three axes.
        </p>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={locked || stale}
          onClick={() => action(() => turnPlacement(draft, -1))}
        >
          Rotate left 90°
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={locked || stale}
          onClick={() => action(() => turnPlacement(draft, 1))}
        >
          Rotate right 90°
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={locked || stale}
          onClick={() => {
            setDraft((current) => ({ ...current, rx: '0', ry: '0', rz: '0' }))
            setPreview(null)
            setError('')
          }}
        >
          Reset placement rotation
        </Button>
      </div>
      <label>
        Reference cabinet
        <select
          aria-label="Placement reference cabinet"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value)
            setError('')
          }}
          className="block border rounded p-1"
        >
          <option value="">Choose cabinet</option>
          {targets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {PLACEMENT_ALIGNMENTS.map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant="outline"
            disabled={locked || stale || !targets.some((c) => c.id === target)}
            onClick={() => action(() => alignPlacement(scene, cabinet.id, draft, target, key))}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          disabled={locked || stale || !dirty}
          onClick={() => {
            setPreview(previewPlacement(scene, cabinet.id, draft))
            setError('')
          }}
        >
          Preview cabinet placement
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset placement draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel placement changes
        </Button>
      </div>
      {!dirty && !stale && <p role="status">No placement changes staged.</p>}
      {preview && (
        <section aria-label="Cabinet placement preview" className="border rounded p-3 space-y-3">
          {preview.errors.length > 0 ? (
            <div role="alert">
              {preview.errors.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          ) : (
            <>
              <p>
                Proposed position: X {draft.x}, Y {draft.y}, Z {draft.z} mm; rotation Z {draft.rz}°.
                Anchored followers are resolved with the proposed placement.
              </p>
              <div className="h-80 pointer-events-none" aria-label="Proposed placement plan">
                {preview.scene && (
                  <PlanView
                    scene={preview.scene}
                    cabinetIds={siblings}
                    selectedId={cabinet.id}
                    onSelect={() => {}}
                    onDrop={() => {}}
                    onTurn={() => {}}
                    warnings={[]}
                  />
                )}
              </div>
              {preview.overlaps.length ? (
                <section aria-label="Placement overlap warnings">
                  <strong>Occupied envelopes overlap</strong>
                  <ul>
                    {preview.overlaps.map((overlap, index) => (
                      <li key={index}>
                        {overlap.a} ↔ {overlap.b}: {Number(overlap.x.toFixed(2))} ×{' '}
                        {Number(overlap.y.toFixed(2))} × {Number(overlap.z.toFixed(2))} mm
                      </li>
                    ))}
                  </ul>
                  <p>
                    These bounding-box warnings allow Apply. Rotated envelopes can overlap without a
                    physical collision. Review room and production assessments for other clearance
                    requirements.
                  </p>
                </section>
              ) : (
                <p role="status">No occupied-envelope overlaps among sibling cabinets.</p>
              )}
            </>
          )}
          <Button
            size="sm"
            disabled={stale || preview.errors.length > 0 || !preview.changed}
            onClick={() => {
              if (!onApply(preview)) {
                setError(
                  'The scene changed after preview. Reset and preview again before applying.',
                )
                setPreview(null)
                return
              }
              const proposed = preview.scene?.components.find((c) => c.id === cabinet.id)
              if (proposed?.kind === 'carcase' && preview.scene) {
                setBase(placementSignature(preview.scene))
                setDraft(placementDraft(proposed))
              }
              setPreview(null)
              setError('')
            }}
          >
            Apply cabinet placement
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            Close placement preview
          </Button>
        </section>
      )}
    </section>
  )
}
