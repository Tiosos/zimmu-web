import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BoardPart, CarcaseComponent, Scene } from '../scene/types'
import { nearestCarcase } from '../scene/nearestCarcase'
import { CabinetProjection } from './CabinetProjection'
import {
  FINISHING_KINDS,
  finishingDraft,
  finishingIssues,
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
  const [targetId, setTargetId] = useState<string | undefined>()
  const [base, setBase] = useState(signature)
  const [draft, setDraft] = useState(() => finishingDraft(scene, cabinet.id))
  const [preview, setPreview] = useState<FinishingPreview | null>(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)
  const [message, setMessage] = useState('')
  const stale = base !== signature
  if (preview && preview.signature !== signature) setPreview(null)
  // Capture the parent's reconciled scene, including its new ID.
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
  const reset = (kind = draft.kind, keepTarget = false) => {
    if (!keepTarget) setTargetId(undefined)
    setDraft({
      ...finishingDraft(scene, cabinet.id, kind),
      follow: keepTarget ? !!draft.follow : false,
    })
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
        disabled={
          !!draft.follow &&
          ((key === 'height' && draft.heightMode !== undefined && draft.heightMode !== 'custom') ||
            (key === 'setback' && draft.setbackMode === 'toe-kick'))
        }
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
  const linked = parts.filter(
    (p): p is BoardPart => p.kind === 'board' && !!p.finishing && p.parentId === cabinet.id,
  )
  const edit = (part: BoardPart) => {
    setTargetId(part.id)
    setDraft({ ...part.finishing!.draft })
    setBase(signature)
    setPreview(null)
    setError('')
    setMessage('')
    setApplied(false)
  }
  const manage = (part: BoardPart, action: 'detach' | 'delete') => {
    const request = {
      ...previewFinishing(scene, cabinet.id, part.finishing!.draft, part.id),
      action,
    }
    if (!onApply(request)) {
      setError('The project changed. Reload the linked panel before continuing.')
      return
    }
    reset()
    setApplied(true)
    setMessage(
      action === 'detach'
        ? 'Finishing board detached; its size is now fixed.'
        : 'Finishing board deleted.',
    )
  }
  const p = preview?.part
  return (
    <section aria-label="Cabinet finishing editor" className="text-xs max-w-5xl mx-auto space-y-4">
      <p>
        Create a worktop or finishing panel in this cabinet's local frame. Boards move and rotate
        with the cabinet. Enable Follow cabinet dimensions to keep a panel linked; unchecked boards
        keep fixed sizes. Editing a linked board's dimensions, position, name, material or grain
        with normal part tools detaches it. Color, visibility and machining edits keep the link.
      </p>
      <p>
        Defaults use the occupied envelope from material slots, including fronts, frames and applied
        backs. Individual board overrides do not change that envelope. No joints, machining or
        clearance checks are added. Drafts are discarded when leaving this tab.
      </p>
      <section aria-label="Linked finishing panels" className="border rounded p-3 space-y-2">
        <h3 className="font-medium">Linked finishing panels ({linked.length})</h3>
        {!linked.length && <p>No linked panels in this cabinet.</p>}
        {linked.map((part) => (
          <section
            key={part.id}
            aria-label={`Linked panel ${part.label}`}
            className="border rounded p-2"
          >
            <p>
              {part.label} — {part.length.toFixed(2)} × {part.width.toFixed(2)} ×{' '}
              {part.thickness.toFixed(2)} mm
            </p>
            {finishingIssues(scene, part).map((issue) => (
              <p key={issue} role="alert">
                {issue} Last valid geometry is retained.
              </p>
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => edit(part)}>
                Edit linked panel
              </Button>
              <Button size="sm" variant="outline" onClick={() => manage(part, 'detach')}>
                Detach linked panel
              </Button>
              <Button size="sm" variant="outline" onClick={() => manage(part, 'delete')}>
                Delete linked panel
              </Button>
            </div>
          </section>
        ))}
      </section>
      {targetId && (
        <p role="status">
          Editing an existing linked panel. Preview before saving; its board ID stays the same.
        </p>
      )}
      {stale && !applied && (
        <p role="alert">
          Cabinet geometry, parts or materials changed. Reset the finishing draft before continuing.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={stale && !applied} className="border rounded p-3 grid grid-cols-2 gap-3">
        <legend>Finishing board</legend>
        <label className="col-span-2">
          <input
            type="checkbox"
            checked={!!draft.follow}
            onChange={(e) => patch('follow', e.target.checked)}
          />{' '}
          Follow cabinet dimensions
        </label>
        <label>
          Panel type
          <select
            aria-label="Finishing panel type"
            value={draft.kind}
            onChange={(e) => {
              if (targetId) {
                setDraft({
                  ...finishingDraft(scene, cabinet.id, e.target.value as FinishingKind),
                  follow: !!draft.follow,
                })
                setPreview(null)
                setError('')
              } else reset(e.target.value as FinishingKind)
            }}
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
              setMessage('')
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
        {draft.follow &&
          (draft.kind.includes('end') ||
            draft.kind.includes('filler') ||
            draft.kind === 'plinth') && (
            <label>
              Height source
              <select
                aria-label="Finishing height source"
                value={draft.heightMode ?? 'custom'}
                onChange={(e) =>
                  patch('heightMode', e.target.value as FinishingDraft['heightMode'])
                }
                className="block border rounded p-1 w-full"
              >
                <option value="custom">Custom height</option>
                {draft.kind === 'plinth' ? (
                  <option value="toe-kick">Toe-kick height less bottom clearance</option>
                ) : (
                  <option value="cabinet">Cabinet height less bottom clearance</option>
                )}
              </select>
            </label>
          )}
        {draft.follow && draft.kind === 'plinth' && (
          <label>
            Setback source
            <select
              aria-label="Finishing setback source"
              value={draft.setbackMode ?? 'custom'}
              onChange={(e) =>
                patch('setbackMode', e.target.value as FinishingDraft['setbackMode'])
              }
              className="block border rounded p-1 w-full"
            >
              <option value="custom">Custom setback</option>
              <option value="toe-kick">Cabinet toe-kick setback</option>
            </select>
          </label>
        )}
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
        <Button size="sm" variant="outline" onClick={() => reset(draft.kind, !!targetId)}>
          Fit to cabinet defaults
        </Button>
        <Button
          size="sm"
          disabled={stale && !applied}
          onClick={() => {
            setError('')
            setApplied(false)
            setPreview(previewFinishing(scene, cabinet.id, draft, targetId))
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
            setMessage(targetId ? 'Finishing board updated.' : 'Finishing board added.')
            if (!draft.follow) setTargetId(undefined)
          }}
        >
          {targetId ? 'Save finishing board' : 'Add finishing board'}
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
                        parts={[...parts.filter((part) => part.id !== targetId), p]}
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
