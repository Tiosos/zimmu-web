import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BoardPart, CarcaseComponent, Scene } from '../scene/types'
import { finishingMaterials, finishingSignature } from '../scene/finishingPanels'
import { nearestCarcase } from '../scene/nearestCarcase'
import { runWorktopLinkError } from '../scene/runWorktopRecipe'
import {
  anchoredRunMembers,
  previewRunWorktop,
  runWorktopDraft,
  runWorktopIssues,
  type RunWorktopDraft,
  type RunWorktopPreview,
} from '../scene/runWorktops'
import { CabinetProjection } from './CabinetProjection'

export function CabinetRunWorktopEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: RunWorktopPreview) => boolean
}) {
  const signature = finishingSignature(scene)
  const [base, setBase] = useState(signature)
  const [draft, setDraft] = useState(() => runWorktopDraft(scene, cabinet.id))
  const [targetId, setTargetId] = useState<string>()
  const [preview, setPreview] = useState<RunWorktopPreview | null>(null)
  const [message, setMessage] = useState('')
  const [applied, setApplied] = useState(false)
  const stale = signature !== base
  if (preview && preview.signature !== signature) setPreview(null)
  if (applied && stale) {
    setBase(signature)
    setApplied(false)
  }
  const patch = <K extends keyof RunWorktopDraft>(key: K, value: RunWorktopDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setPreview(null)
    setMessage('')
    setApplied(false)
  }
  const reset = () => {
    setDraft(runWorktopDraft(scene, cabinet.id))
    setTargetId(undefined)
    setBase(signature)
    setPreview(null)
    setMessage('')
    setApplied(false)
  }
  const linked = scene.parts.filter(
    (p): p is BoardPart =>
      p.kind === 'board' &&
      !!p.runWorktop &&
      (p.parentId === cabinet.parentId ||
        (!runWorktopLinkError(p.runWorktop) && p.runWorktop.draft.memberIds.includes(cabinet.id))),
  )
  const manage = (part: BoardPart, action: 'detach' | 'delete') => {
    const request = {
      ...previewRunWorktop(scene, runWorktopDraft(scene, cabinet.id), part.id),
      action,
    }
    if (!onApply(request)) {
      setMessage('The project changed. Reload the worktop before continuing.')
      return
    }
    reset()
    setApplied(true)
    setMessage(
      action === 'detach' ? 'Worktop detached; its size is now fixed.' : 'Worktop deleted.',
    )
  }
  const byId = new Map(scene.components.map((c) => [c.id, c]))
  const reference =
    scene.components.find(
      (c): c is CarcaseComponent => c.kind === 'carcase' && c.id === draft.memberIds[0],
    ) ?? cabinet
  const p = preview?.part
  const parts = scene.parts.filter(
    (part) =>
      part.id !== targetId && draft.memberIds.includes(nearestCarcase(part, byId)?.id ?? ''),
  )
  return (
    <section aria-label="Run worktop editor" className="space-y-4 text-xs">
      <p>
        Create one rectangular worktop across a straight cabinet run. Cabinets must share a
        container, orientation, front line and top plane. Different cabinet depths are covered to
        the deepest rear edge.
      </p>
      <p>
        Gap allowance describes geometry only; it does not verify structural support. Normal part
        edits to dimensions, placement, name, material or grain detach the link. Drafts are
        discarded when leaving this workspace.
      </p>
      <section aria-label="Linked run worktops" className="space-y-2">
        <h3>Linked run worktops ({linked.length})</h3>
        {linked.map((part) => (
          <section
            key={part.id}
            aria-label={`Linked worktop ${part.label}`}
            className="border rounded p-2"
          >
            <p>
              {part.label} — {part.length.toFixed(2)} × {part.width.toFixed(2)} ×{' '}
              {part.thickness.toFixed(2)} mm
            </p>
            {runWorktopIssues(scene, part).map((issue) => (
              <p role="alert" key={issue}>
                {issue} Last valid geometry is retained.
              </p>
            ))}
            <Button
              size="sm"
              variant="outline"
              disabled={!!runWorktopLinkError(part.runWorktop)}
              onClick={() => {
                setDraft({
                  ...part.runWorktop!.draft,
                  memberIds: [...part.runWorktop!.draft.memberIds],
                })
                setTargetId(part.id)
                setBase(signature)
                setPreview(null)
                setMessage('')
                setApplied(false)
              }}
            >
              Edit run worktop
            </Button>
            <Button size="sm" variant="outline" onClick={() => manage(part, 'detach')}>
              Detach run worktop
            </Button>
            <Button size="sm" variant="outline" onClick={() => manage(part, 'delete')}>
              Delete run worktop
            </Button>
          </section>
        ))}
      </section>
      {targetId && <p role="status">Editing a linked worktop; saving preserves its board ID.</p>}
      {stale && !applied && (
        <p role="alert">The project changed. Reset or reload the worktop before continuing.</p>
      )}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={stale && !applied} className="border rounded p-3 space-y-3">
        <legend>Run worktop settings</legend>
        <fieldset>
          <legend>Cabinet selection</legend>
          {scene.components
            .filter(
              (c): c is CarcaseComponent =>
                c.kind === 'carcase' &&
                (c.parentId === cabinet.parentId || draft.memberIds.includes(c.id)),
            )
            .map((c) => (
              <label key={c.id} className="block">
                <input
                  type="checkbox"
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
          {draft.memberIds
            .filter((id) => !byId.has(id))
            .map((id) => (
              <label key={id} className="block">
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    patch(
                      'memberIds',
                      draft.memberIds.filter((x) => x !== id),
                    )
                  }
                />{' '}
                Missing cabinet: {id}
              </label>
            ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => patch('memberIds', anchoredRunMembers(scene, cabinet.id))}
          >
            Select anchored run
          </Button>
          <Button size="sm" variant="outline" onClick={() => patch('memberIds', [])}>
            Clear cabinet selection
          </Button>
        </fieldset>
        <label className="block">
          Board name
          <input
            aria-label="Run worktop name"
            value={draft.label}
            onChange={(e) => patch('label', e.target.value)}
          />
        </label>
        <label className="block">
          Material
          <select
            aria-label="Run worktop material"
            value={draft.material}
            onChange={(e) => {
              const material = e.target.value
              setDraft((d) => ({
                ...d,
                material,
                thickness:
                  d.thicknessMode === 'stock'
                    ? String(scene.materials[material]?.thickness ?? '')
                    : d.thickness,
              }))
              setPreview(null)
              setMessage('')
              setApplied(false)
            }}
          >
            {finishingMaterials(scene).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Grain
          <select
            aria-label="Run worktop grain"
            value={draft.grain}
            onChange={(e) => patch('grain', e.target.value as RunWorktopDraft['grain'])}
          >
            {['length', 'width', 'free'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          Thickness source
          <select
            aria-label="Run worktop thickness source"
            value={draft.thicknessMode}
            onChange={(e) =>
              patch('thicknessMode', e.target.value as RunWorktopDraft['thicknessMode'])
            }
          >
            <option value="stock">Stock thickness</option>
            <option value="custom">Custom thickness</option>
          </select>
        </label>
        <label className="block">
          Custom thickness (mm)
          <input
            aria-label="Run worktop custom thickness"
            type="number"
            step="any"
            min="0"
            disabled={draft.thicknessMode === 'stock'}
            value={draft.thickness}
            onChange={(e) => patch('thickness', e.target.value)}
          />
        </label>
        {(
          [
            ['left', 'Left overhang'],
            ['right', 'Right overhang'],
            ['front', 'Front overhang'],
            ['rear', 'Rear overhang'],
            ['bottom', 'Worktop vertical gap'],
            ['maxGap', 'Allowed cabinet gap'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            {label} (mm)
            <input
              aria-label={label}
              type="number"
              step="any"
              min="0"
              value={draft[key]}
              onChange={(e) => patch(key, e.target.value)}
            />
          </label>
        ))}
        <label className="block">
          <input
            type="checkbox"
            checked={draft.follow}
            onChange={(e) => patch('follow', e.target.checked)}
          />{' '}
          Follow cabinet run
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={stale && !applied}
          onClick={() => {
            setMessage('')
            setApplied(false)
            setPreview(previewRunWorktop(scene, draft, targetId))
          }}
        >
          Preview run worktop
        </Button>
        <Button
          size="sm"
          disabled={stale || !p || !preview?.changed || !!preview.errors.length}
          onClick={() => {
            if (!preview || !onApply(preview)) {
              setMessage('The project changed after preview. Reset and preview again.')
              setPreview(null)
              return
            }
            setPreview(null)
            setApplied(true)
            setMessage(targetId ? 'Run worktop updated.' : 'Run worktop added.')
            if (!draft.follow) setTargetId(undefined)
          }}
        >
          {targetId ? 'Save run worktop' : 'Add run worktop'}
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset run worktop draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel run worktop changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Run worktop preview">
          {preview.errors.map((error) => (
            <p role="alert" key={error}>
              {error}
            </p>
          ))}
          {p && (
            <>
              <h3>{p.label}</h3>
              <p>
                {p.length.toFixed(2)} × {p.width.toFixed(2)} × {p.thickness.toFixed(2)} mm — length
                × width × thickness
              </p>
              <p>
                Material: {p.material}. Grain: {p.grain}. Area:{' '}
                {((p.length * p.width) / 1e6).toFixed(4)} m². Quantity: 1.
              </p>
              <p>
                Run width:{' '}
                {(preview.members.at(-1)!.bounds.x1 - preview.members[0].bounds.x0).toFixed(2)} mm.
              </p>
              <ul>
                {preview.members.map((m) => (
                  <li key={m.id}>
                    {m.label}: {(m.bounds.x1 - m.bounds.x0).toFixed(2)} mm; gap before:{' '}
                    {m.gapBefore.toFixed(2)} mm
                  </li>
                ))}
              </ul>
              {!preview.changed && <p>No changes to save.</p>}
              <div className="grid gap-3 lg:grid-cols-3">
                {(['Front', 'Top', 'End'] as const).map((view) => (
                  <section key={view} aria-label={`Run worktop ${view} preview`}>
                    <h3>{view}</h3>
                    <div className="h-72 pointer-events-none">
                      <CabinetProjection
                        view={view}
                        cabinet={reference}
                        materials={scene.materials}
                        parts={[...parts, { ...p, visible: true }]}
                        byId={byId}
                        selectedId={p.id}
                        onSelect={() => {}}
                        sectionViews={false}
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
