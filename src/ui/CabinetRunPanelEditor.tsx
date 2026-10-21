import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BoardPart, CarcaseComponent, Scene } from '../scene/types'
import { finishingMaterials, finishingSignature } from '../scene/finishingPanels'
import { runWorktopLinkError } from '../scene/runWorktopRecipe'
import {
  anchoredRunMembers,
  previewRunWorktop,
  runPanelDraft,
  runWorktopIssues,
  type RunWorktopDraft,
  type RunWorktopPreview,
} from '../scene/runWorktops'
import { CabinetProjection } from './CabinetProjection'
export function CabinetRunPanelEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (p: RunWorktopPreview) => boolean
}) {
  const signature = finishingSignature(scene),
    context = JSON.stringify([cabinet.id, signature])
  const [base, setBase] = useState(context),
    [draft, setDraft] = useState(() => runPanelDraft(scene, cabinet.id)),
    [target, setTarget] = useState<string>(),
    [preview, setPreview] = useState<RunWorktopPreview | null>(null),
    [message, setMessage] = useState(''),
    [applied, setApplied] = useState(false)
  const stale = base !== context
  if (preview && (preview.signature !== signature || stale)) setPreview(null)
  if (applied && stale) {
    setBase(context)
    setApplied(false)
  }
  const patch = <K extends keyof RunWorktopDraft>(key: K, value: RunWorktopDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setPreview(null)
    setMessage('')
  }
  const reset = () => {
    setBase(context)
    setDraft(runPanelDraft(scene, cabinet.id, draft.profile))
    setTarget(undefined)
    setPreview(null)
    setMessage('')
    setApplied(false)
  }
  const action = (f: () => void) => {
    try {
      f()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Run panel action failed.')
    }
  }
  const linked = scene.parts.filter(
    (p): p is BoardPart =>
      p.kind === 'board' &&
      !!p.runWorktop?.draft?.profile &&
      (p.parentId === cabinet.parentId || p.runWorktop.draft.memberIds.includes(cabinet.id)),
  )
  const manage = (p: BoardPart, kind: 'detach' | 'delete') => {
    const request = { ...previewRunWorktop(scene, p.runWorktop!.draft, p.id), action: kind }
    if (onApply(request)) {
      reset()
      setApplied(true)
      setMessage(
        kind === 'detach' ? 'Run panel detached; its geometry is now fixed.' : 'Run panel deleted.',
      )
    } else setMessage('The scene changed. Reset and try again.')
  }
  const field = (
    key: 'left' | 'right' | 'height' | 'bottom' | 'setback' | 'maxGap' | 'thickness',
    label: string,
  ) => (
    <label className="block">
      {label} (mm)
      <input
        aria-label={label}
        type="number"
        step="any"
        disabled={
          (key === 'height' && draft.heightMode === 'toe-kick') ||
          (key === 'thickness' && draft.thicknessMode === 'stock')
        }
        className="border rounded ml-2 px-2 w-28"
        value={draft[key] ?? ''}
        onChange={(e) => patch(key, e.target.value)}
      />
    </label>
  )
  const byId = new Map(scene.components.map((c) => [c.id, c])),
    reference =
      scene.components.find(
        (c): c is CarcaseComponent => c.kind === 'carcase' && c.id === draft.memberIds[0],
      ) ?? cabinet
  const proposed = preview?.part
    ? { ...scene, parts: [...scene.parts.filter((p) => p.id !== target), preview.part] }
    : null
  const stock = finishingMaterials(scene)
  return (
    <section
      aria-label="Run finishing panels editor"
      className="text-xs max-w-5xl mx-auto space-y-3"
    >
      <p>
        Create one rectangular plinth or splashback across a straight cabinet run. Linked panels
        follow valid source changes; invalid links retain their last valid geometry with
        diagnostics. Review fit, support and installation before manufacturing.
      </p>
      {stale && (
        <p role="alert">
          The scene changed. Your run panel draft is retained; reset or reload a linked panel before
          previewing.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <label className="block">
        Panel type
        <select
          aria-label="Run panel type"
          value={draft.profile}
          onChange={(e) => {
            setDraft(runPanelDraft(scene, cabinet.id, e.target.value as 'plinth' | 'splashback'))
            setTarget(undefined)
            setPreview(null)
            setMessage('')
          }}
        >
          <option value="plinth">Front plinth</option>
          <option value="splashback">Rear splashback</option>
        </select>
      </label>
      <fieldset className="border rounded p-2">
        <legend>Run panel cabinets</legend>
        {scene.components
          .filter(
            (c): c is CarcaseComponent => c.kind === 'carcase' && c.parentId === cabinet.parentId,
          )
          .map((c) => (
            <label key={c.id} className="block">
              <input
                type="checkbox"
                aria-label={`Panel member ${c.label} (${c.id})`}
                checked={draft.memberIds.includes(c.id)}
                onChange={(e) =>
                  patch(
                    'memberIds',
                    e.target.checked
                      ? [...draft.memberIds, c.id]
                      : draft.memberIds.filter((id) => id !== c.id),
                  )
                }
              />{' '}
              {c.label}
            </label>
          ))}
      </fieldset>
      <Button
        size="sm"
        variant="outline"
        onClick={() => action(() => patch('memberIds', anchoredRunMembers(scene, cabinet.id)))}
      >
        Select anchored panel run
      </Button>
      <label className="block">
        Board name
        <input
          aria-label="Run panel name"
          className="border rounded ml-2 px-2"
          value={draft.label}
          onChange={(e) => patch('label', e.target.value)}
        />
      </label>
      <label className="block">
        Panel material
        <select
          aria-label="Run panel material"
          value={draft.material}
          onChange={(e) => patch('material', e.target.value)}
        >
          {!stock.includes(draft.material) && (
            <option value={draft.material}>{draft.material} (unavailable)</option>
          )}
          {stock.map((name) => (
            <option key={name} value={name}>
              {name} · {scene.materials[name].thickness} mm
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Thickness
        <select
          aria-label="Run panel thickness mode"
          value={draft.thicknessMode}
          onChange={(e) => patch('thicknessMode', e.target.value as 'stock' | 'custom')}
        >
          <option value="stock">Material stock thickness</option>
          <option value="custom">Custom thickness</option>
        </select>
      </label>
      {field('thickness', 'Run panel custom thickness')}
      <label className="block">
        Grain
        <select
          aria-label="Run panel grain"
          value={draft.grain}
          onChange={(e) => patch('grain', e.target.value as RunWorktopDraft['grain'])}
        >
          <option value="width">Along run (board width)</option>
          <option value="length">Vertical (board length)</option>
          <option value="free">Free</option>
        </select>
      </label>
      <fieldset className="border rounded p-2 space-y-2">
        <legend>Run panel dimensions</legend>
        {field('left', 'Left run extension')}
        {field('right', 'Right run extension')}
        {field('maxGap', 'Allowed panel cabinet gap')}
        {draft.profile === 'plinth' && (
          <label className="block">
            Height mode
            <select
              aria-label="Run panel height mode"
              value={draft.heightMode}
              onChange={(e) => patch('heightMode', e.target.value as 'custom' | 'toe-kick')}
            >
              <option value="toe-kick">Follow smallest toe-kick height</option>
              <option value="custom">Custom height</option>
            </select>
          </label>
        )}
        {field('height', 'Run panel height')}
        {field(
          'bottom',
          draft.profile === 'plinth' ? 'Plinth bottom clearance' : 'Splashback top clearance',
        )}
        {field(
          'setback',
          draft.profile === 'plinth' ? 'Run plinth setback' : 'Splashback rear clearance',
        )}
      </fieldset>
      <label className="block">
        <input
          type="checkbox"
          checked={draft.follow}
          onChange={(e) => patch('follow', e.target.checked)}
        />{' '}
        Follow cabinet run dimensions
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={stale}
          onClick={() => {
            setPreview(previewRunWorktop(scene, draft, target))
            setMessage('')
          }}
        >
          Preview run panel
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset run panel draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel run panel changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Run panel preview" className="border rounded p-3 space-y-3">
          {preview.errors.length > 0 ? (
            <div role="alert">{preview.errors.join('; ')}</div>
          ) : (
            <>
              <p>
                {preview.part!.label}: {Number(preview.part!.length.toFixed(3))} ×{' '}
                {Number(preview.part!.width.toFixed(3))} × {preview.part!.thickness} mm ·{' '}
                {((preview.part!.length * preview.part!.width) / 1e6).toFixed(3)} m². Board length
                is vertical; width runs along the cabinets.
              </p>
              <p>
                Material: {draft.material}. Thickness:{' '}
                {draft.thicknessMode === 'stock' ? 'stock' : 'custom'}. Grain: {draft.grain}.
              </p>
              <table className="w-full text-left">
                <caption>Run panel cabinet spans (mm)</caption>
                <thead>
                  <tr>
                    <th>Cabinet</th>
                    <th>Width</th>
                    <th>Gap before</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.members.map((m) => (
                    <tr key={m.id}>
                      <th scope="row">{m.label}</th>
                      <td>{Number((m.bounds.x1 - m.bounds.x0).toFixed(3))}</td>
                      <td>{Number(m.gapBefore.toFixed(3))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {proposed &&
                (['Front', 'Top', 'End'] as const).map((view) => (
                  <div
                    key={view}
                    className="h-64 pointer-events-none"
                    aria-label={`Run panel ${view.toLowerCase()} preview`}
                  >
                    <CabinetProjection
                      view={view}
                      parts={proposed.parts}
                      byId={byId}
                      cabinet={reference}
                      materials={scene.materials}
                      selectedId={preview.part!.id}
                      onSelect={() => {}}
                      sectionViews={false}
                    />
                  </div>
                ))}
              {!preview.changed && <p>No run panel changes proposed.</p>}
            </>
          )}
          <Button
            size="sm"
            disabled={stale || preview.errors.length > 0 || !preview.changed}
            onClick={() => {
              if (onApply(preview)) {
                reset()
                setApplied(true)
                setMessage(target ? 'Run panel updated.' : 'Run panel added.')
              } else {
                setPreview(null)
                setMessage('The scene changed. Reset and preview again.')
              }
            }}
          >
            {target ? 'Save run panel' : 'Add run panel'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            Close run panel preview
          </Button>
        </section>
      )}
      <section aria-label="Linked run finishing panels" className="border-t pt-2 space-y-2">
        <h3>Linked run finishing panels</h3>
        {!linked.length && <p>No linked run finishing panels.</p>}
        {linked.map((p) => (
          <div key={p.id} className="border rounded p-2">
            <p>
              {p.label} · {p.length} × {p.width} × {p.thickness} mm
            </p>
            {runWorktopIssues(scene, p).map((issue, i) => (
              <p role="alert" key={i}>
                {issue}
              </p>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                action(() => {
                  const issue = runWorktopLinkError(p.runWorktop)
                  if (issue) throw Error(issue)
                  setDraft(structuredClone(p.runWorktop!.draft))
                  setTarget(p.id)
                  setBase(context)
                  setPreview(null)
                  setMessage('')
                })
              }
            >
              Edit linked run panel
            </Button>
            <Button size="sm" variant="outline" onClick={() => manage(p, 'detach')}>
              Detach linked run panel
            </Button>
            <Button size="sm" variant="outline" onClick={() => manage(p, 'delete')}>
              Delete linked run panel
            </Button>
          </div>
        ))}
      </section>
    </section>
  )
}
