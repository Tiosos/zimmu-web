import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BoardPart, CarcaseComponent, Scene } from '../scene/types'
import { finishingSignature } from '../scene/finishingPanels'
import { defaultWorktopFeature } from '../scene/worktopMachiningRecipe'
import {
  previewWorktopMachining,
  worktopMachiningEligible,
  type WorktopFeature,
  type WorktopMachiningPreview,
  type WorktopMachining,
} from '../scene/worktopMachining'
import { CabinetProjection } from './CabinetProjection'
export function WorktopMachiningEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (p: WorktopMachiningPreview) => boolean
}) {
  const targets = scene.parts.filter(
    (p): p is BoardPart =>
      p.kind === 'board' &&
      worktopMachiningEligible(p) &&
      (p.parentId === cabinet.id || p.parentId === cabinet.parentId),
  )
  const signature = finishingSignature(scene)
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '')
  const target = scene.parts.find((p): p is BoardPart => p.kind === 'board' && p.id === targetId)
  const [base, setBase] = useState(signature)
  const [recipe, setRecipe] = useState<WorktopMachining>(() =>
    structuredClone(target?.worktopMachining ?? { version: 1, features: [] }),
  )
  const [selected, setSelected] = useState<string>('')
  const [preview, setPreview] = useState<WorktopMachiningPreview | null>(null)
  const [message, setMessage] = useState('')
  const [applied, setApplied] = useState(false)
  const stale = signature !== base
  if (preview && preview.signature !== signature) setPreview(null)
  if (applied && stale) {
    setBase(signature)
    setApplied(false)
  }
  const load = (id = targetId) => {
    const part = scene.parts.find((p): p is BoardPart => p.kind === 'board' && p.id === id)
    setTargetId(id)
    setRecipe(structuredClone(part?.worktopMachining ?? { version: 1, features: [] }))
    setSelected('')
    setBase(signature)
    setPreview(null)
    setMessage('')
    setApplied(false)
  }
  const change = (next: WorktopMachining) => {
    setRecipe(next)
    setPreview(null)
    setMessage('')
    setApplied(false)
  }
  const feature = recipe.features.find((f) => f.id === selected)
  const patch = <K extends keyof WorktopFeature>(key: K, value: WorktopFeature[K]) =>
    change({
      ...recipe,
      features: recipe.features.map((f) => (f.id === selected ? { ...f, [key]: value } : f)),
    })
  const add = (starter: Parameters<typeof defaultWorktopFeature>[1]) => {
    const next = defaultWorktopFeature(crypto.randomUUID(), starter)
    change({ ...recipe, features: [...recipe.features, next] })
    setSelected(next.id)
  }
  const byId = new Map(scene.components.map((c) => [c.id, c]))
  const parts = scene.parts.filter(
    (p) =>
      p.id !== targetId &&
      (p.parentId === cabinet.id || target?.runWorktop?.draft.memberIds.includes(p.parentId ?? '')),
  )
  const saved = target?.worktopMachining
    ? previewWorktopMachining(scene, target.id, target.worktopMachining)
    : null
  return (
    <section aria-label="Worktop machining editor" className="space-y-4 text-xs">
      <p>
        Stage openings and bores in a manual board's own axes: X is length, Y is width, front is Y0
        and machining enters from +Z. Edge offsets locate the feature centre; centre offsets are
        signed. Choose the intended worktop explicitly.
      </p>
      <p>
        Sink and hob starters are editable examples. Check appliance specifications for final
        dimensions and corner radii. Clearance and overlap checks cover these features only; other
        machining and cabinet supports need separate review.
      </p>
      <label className="block">
        Worktop board
        <select
          aria-label="Machining worktop board"
          value={targetId}
          onChange={(e) => load(e.target.value)}
        >
          <option value="">Choose a worktop</option>
          {targets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.length} × {p.width} mm)
            </option>
          ))}
        </select>
      </label>
      {!targets.length && (
        <p>
          Create a worktop in Finishing first, or select a cabinet sharing the manual board's
          container.
        </p>
      )}
      {saved?.errors.map((e) => (
        <p role="alert" key={e}>
          {e} Invalid features do not emit cuts; edit or remove them below.
        </p>
      ))}
      {stale && !applied && (
        <p role="alert">The project changed. Reset or reload the worktop machining draft.</p>
      )}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={!target || (stale && !applied)} className="border rounded p-3 space-y-3">
        <legend>Staged worktop features</legend>
        <ul>
          {recipe.features.map((f) => (
            <li key={f.id}>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={selected === f.id}
                onClick={() => setSelected(f.id)}
              >
                {f.label}
              </Button>{' '}
              {f.shape}, {f.mode}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          {(['rectangle', 'circle', 'sink', 'hob'] as const).map((starter) => (
            <Button
              key={starter}
              size="sm"
              variant="outline"
              disabled={recipe.features.length >= 100}
              onClick={() => add(starter)}
            >
              Add{' '}
              {starter === 'rectangle'
                ? 'rectangular feature'
                : starter === 'circle'
                  ? 'circular feature'
                  : `${starter} starter`}
            </Button>
          ))}
        </div>
        {feature && (
          <div className="grid grid-cols-2 gap-3">
            <label>
              Feature name
              <input
                aria-label="Worktop feature name"
                value={feature.label}
                onChange={(e) => patch('label', e.target.value)}
                className="block w-full border rounded p-1"
              />
            </label>
            <label>
              Shape
              <select
                aria-label="Worktop feature shape"
                value={feature.shape}
                onChange={(e) => patch('shape', e.target.value as WorktopFeature['shape'])}
                className="block"
              >
                <option value="rectangle">Rectangle</option>
                <option value="circle">Circle</option>
              </select>
            </label>
            <label>
              Depth mode
              <select
                aria-label="Worktop feature depth mode"
                value={feature.mode}
                onChange={(e) => patch('mode', e.target.value as WorktopFeature['mode'])}
                className="block"
              >
                <option value="through">Through</option>
                <option value="blind">Blind</option>
              </select>
            </label>
            {(
              [
                ...(feature.shape === 'rectangle'
                  ? [
                      ['length', 'Feature length'],
                      ['width', 'Feature width'],
                    ]
                  : [['diameter', 'Feature diameter']]),
                ...(feature.mode === 'blind' ? [['depth', 'Feature depth']] : []),
                ['x', 'Feature X offset'],
                ['y', 'Feature Y offset'],
                ['clearance', 'Feature edge clearance'],
              ] as [
                keyof Pick<
                  WorktopFeature,
                  'length' | 'width' | 'diameter' | 'depth' | 'x' | 'y' | 'clearance'
                >,
                string,
              ][]
            ).map(([key, label]) => (
              <label key={key}>
                {label} (mm)
                <input
                  aria-label={label}
                  type="number"
                  step="any"
                  value={Number.isNaN(feature[key]) ? '' : feature[key]}
                  onChange={(e) => patch(key, e.target.value === '' ? NaN : Number(e.target.value))}
                  className="block w-full border rounded p-1"
                />
              </label>
            ))}
            <label>
              X reference
              <select
                aria-label="Worktop feature X reference"
                value={feature.xRef}
                onChange={(e) => patch('xRef', e.target.value as WorktopFeature['xRef'])}
              >
                {['left', 'centre', 'right'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Y reference
              <select
                aria-label="Worktop feature Y reference"
                value={feature.yRef}
                onChange={(e) => patch('yRef', e.target.value as WorktopFeature['yRef'])}
              >
                {['front', 'centre', 'rear'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={recipe.features.length >= 100}
              onClick={() => {
                const copy = { ...feature, id: crypto.randomUUID(), label: `${feature.label} copy` }
                change({ ...recipe, features: [...recipe.features, copy] })
                setSelected(copy.id)
              }}
            >
              Duplicate feature
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                change({ ...recipe, features: recipe.features.filter((f) => f.id !== selected) })
                setSelected('')
              }}
            >
              Remove feature
            </Button>
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!target || (stale && !applied)}
          onClick={() => {
            setPreview(previewWorktopMachining(scene, targetId, recipe))
            setMessage('')
            setApplied(false)
          }}
        >
          Preview worktop machining
        </Button>
        <Button
          size="sm"
          disabled={stale || !preview?.part || !preview.changed || !!preview.errors.length}
          onClick={() => {
            if (!preview || !onApply(preview)) {
              setPreview(null)
              setMessage('The project changed after preview. Reload and preview again.')
              return
            }
            setPreview(null)
            setApplied(true)
            setMessage('Worktop machining applied.')
          }}
        >
          Apply worktop machining
        </Button>
        <Button size="sm" variant="outline" onClick={() => load()}>
          Reset machining draft
        </Button>
        <Button size="sm" variant="outline" onClick={() => load()}>
          Cancel machining changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Worktop machining preview" className="space-y-3">
          {preview.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          {!preview.changed && !preview.errors.length && <p>No machining changes staged.</p>}
          <ul>
            {preview.rows.map((r) => (
              <li key={r.feature.id}>
                {r.feature.label}: centre X {r.x.toFixed(2)}, Y {r.y.toFixed(2)} mm;{' '}
                {r.length.toFixed(2)} × {r.width.toFixed(2)} mm; depth {r.depth.toFixed(2)} mm (
                {r.feature.mode}).
              </li>
            ))}
          </ul>
          {preview.part && (
            <div className="grid lg:grid-cols-3 gap-3">
              {(['Front', 'Top', 'End'] as const).map((view) => (
                <section key={view} aria-label={`Machining ${view} preview`}>
                  <h3>{view}</h3>
                  <div className="h-72 pointer-events-none">
                    <CabinetProjection
                      view={view}
                      cabinet={cabinet}
                      materials={scene.materials}
                      parts={[...parts, { ...preview.part!, visible: true }]}
                      byId={byId}
                      selectedId={targetId}
                      onSelect={() => {}}
                      sectionViews={false}
                    />
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  )
}
