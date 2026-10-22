import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Scene, MaterialDef } from '../scene/types'
import type { ProjectStructure } from '../scene/projectStructure'
import { roomComponentIds } from '../scene/projectStructure'
import type { GrainMatchDraft, GrainMatchGroup } from '../scene/grainMatchRecipe'
import {
  defaultGrainMatchDraft,
  grainFronts,
  grainMatchIssues,
  grainMatchSignature,
  previewGrainMatch,
  type GrainMatchPreview,
} from '../scene/grainMatching'
import { manufacturingParts } from '../scene/manufacturingPart'
import { matchedGroupProblem, type NestBoard } from '../nest/nestJob'
import { buildGrainMatchCsv } from './buildGrainMatchCsv'
import { downloadBlob } from './download'
import { GrainMatchViews } from './GrainMatchViews'
const numeric = (s: string) => (s.trim() ? Number(s) : NaN)
export function GrainMatchWorkspace({
  scene,
  project,
  materials,
  clearance,
  onApply,
  onClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  scene: Scene
  project: ProjectStructure
  materials: Record<string, MaterialDef>
  clearance: number
  onApply: (p: GrainMatchPreview) => boolean
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const signature = grainMatchSignature(scene, project),
    [base, setBase] = useState(signature),
    [draft, setDraft] = useState(defaultGrainMatchDraft),
    [targetId, setTargetId] = useState<string>(),
    [roomId, setRoomId] = useState(''),
    [cabinetId, setCabinetId] = useState(''),
    [preview, setPreview] = useState<GrainMatchPreview | null>(null),
    [message, setMessage] = useState('')
  const stale = signature !== base,
    fronts = useMemo(() => grainFronts(scene), [scene]),
    rooms = project.areas.flatMap((a) => a.rooms),
    room = rooms.find((r) => r.id === roomId),
    ids = room
      ? roomComponentIds(
          room.items.flatMap((i) => i.rootComponentIds),
          scene,
        )
      : null,
    visible = fronts.filter(
      (t) => (!ids || ids.has(t.cabinetId)) && (!cabinetId || t.cabinetId === cabinetId),
    )
  const patch = (change: Partial<GrainMatchDraft>) => {
    setDraft((d) => ({ ...d, ...change }))
    setPreview(null)
    setMessage('')
  }
  const membership = (memberIds: string[]) =>
    patch({
      memberIds,
      referenceId: memberIds.includes(draft.referenceId) ? draft.referenceId : (memberIds[0] ?? ''),
    })
  const reset = () => {
    setDraft(defaultGrainMatchDraft())
    setTargetId(undefined)
    setPreview(null)
    setMessage('')
    setBase(signature)
  }
  const load = (g: GrainMatchGroup) => {
    setDraft(structuredClone(g.draft))
    setTargetId(g.id)
    setPreview(null)
    setMessage('')
    setBase(signature)
  }
  const detach = (g: GrainMatchGroup) => {
    const p = { ...previewGrainMatch(scene, project, g.draft, g.id), action: 'detach' as const }
    if (onApply(p)) setMessage('Group detached; individual grain settings remain.')
    else setMessage('The source changed. Reload and try again.')
  }
  const stockIssue = useMemo(() => {
    if (!preview?.layout || !preview.scene || stale) return ''
    const layout = preview.layout,
      def = materials[layout.material]
    if (!def?.sheet)
      return 'No sheet stock is configured for this material. Configure it in the Library before nesting.'
    const members = manufacturingParts(
      preview.scene.parts,
      materials,
      preview.scene.components,
    ).flatMap((p): NestBoard[] =>
      p.kind === 'board' && p.grainMatch?.groupId === layout.group.id
        ? [{ kind: 'board', id: p.id, grain: p.grain, ...p.nesting, grainMatch: p.grainMatch }]
        : [],
    )
    return matchedGroupProblem(members, clearance, def.sheet, def.hasGrain ?? true) ?? ''
  }, [preview, materials, clearance, stale])
  const field = (key: 'offsetX' | 'offsetY' | 'margin' | 'gap', label: string) => (
    <label className="block" key={key}>
      {label} (mm)
      <input
        aria-label={label}
        type="number"
        step="any"
        value={Number.isFinite(draft[key]) ? draft[key] : ''}
        onChange={(e) => patch({ [key]: numeric(e.target.value) })}
      />
    </label>
  )
  return (
    <aside
      aria-label="Front grain matching workspace"
      className="absolute right-3 top-14 z-40 w-[470px] max-w-[95vw] max-h-[85vh] overflow-y-auto bg-card text-foreground border rounded p-4 shadow-xl space-y-3"
    >
      <div className="flex justify-between">
        <h2 className="font-semibold">Front Grain Matching</h2>
        <Button size="sm" onClick={onClose}>
          Close grain matching
        </Button>
      </div>
      <p className="text-xs">
        Match flat generated fronts using one shared source blank. Previews are schematic; cutting
        gaps remove grain between the installed fronts.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={!canUndo} onClick={onUndo}>
          Undo grain change
        </Button>
        <Button size="sm" disabled={!canRedo} onClick={onRedo}>
          Redo grain change
        </Button>
        <Button size="sm" onClick={reset}>
          Reset grain draft
        </Button>
      </div>
      <section aria-label="Saved grain groups">
        <h3>Saved groups</h3>
        {scene.grainMatches?.map((g) => (
          <div key={g.id} className="border rounded p-2 text-xs">
            <span>
              {g.draft.label} · {g.draft.memberIds.length} fronts
            </span>
            <Button size="sm" onClick={() => load(g)}>
              Edit grain group {g.draft.label}
            </Button>
            <Button size="sm" onClick={() => detach(g)}>
              Detach grain group {g.draft.label}
            </Button>
            {grainMatchIssues(scene, g).map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        ))}
      </section>
      {stale && (
        <p role="alert">
          Scene or project changed. Reset or reload the saved group before continuing.
        </p>
      )}
      <fieldset disabled={stale} className="space-y-3">
        <label className="block">
          Room
          <select
            aria-label="Grain room"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value)
              setCabinetId('')
            }}
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Cabinet
          <select
            aria-label="Grain cabinet"
            value={cabinetId}
            onChange={(e) => setCabinetId(e.target.value)}
          >
            <option value="">All cabinets</option>
            {scene.components
              .filter((c) => c.kind === 'carcase' && (!ids || ids.has(c.id)))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              membership([
                ...new Set([
                  ...draft.memberIds,
                  ...visible
                    .filter(
                      (t) =>
                        !t.issue &&
                        !scene.grainMatches?.some(
                          (g) => g.id !== targetId && g.draft.memberIds.includes(t.id),
                        ),
                    )
                    .map((t) => t.id),
                ]),
              ])
            }
          >
            Add visible fronts
          </Button>
          <Button size="sm" onClick={() => membership([])}>
            Clear grain selection
          </Button>
        </div>
        <p className="text-xs">
          Selected {draft.memberIds.length} fronts; group requires 2–100. Filtering does not remove
          selected members.
        </p>
        <ul className="space-y-2">
          {visible.map((t) => {
            const owner = scene.grainMatches?.find(
              (g) => g.id !== targetId && g.draft.memberIds.includes(t.id),
            )
            return (
              <li key={t.id} className="border p-2 text-xs">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Match ${t.cabinetLabel}: ${t.label}`}
                    checked={draft.memberIds.includes(t.id)}
                    disabled={!!t.issue || !!owner}
                    onChange={() =>
                      membership(
                        draft.memberIds.includes(t.id)
                          ? draft.memberIds.filter((id) => id !== t.id)
                          : [...draft.memberIds, t.id],
                      )
                    }
                  />
                  {t.cabinetLabel}: {t.label}
                </label>
                <div>
                  {t.part.length.toFixed(2)} × {t.part.width.toFixed(2)} ×{' '}
                  {t.part.thickness.toFixed(2)} mm · {t.part.material} · grain {t.part.grain}
                </div>
                {(t.issue || owner) && <p>{t.issue ?? `Already in ${owner!.draft.label}`}</p>}
              </li>
            )
          })}
        </ul>
        {!visible.length && (
          <p>
            No supported door/drawer fronts in this filter. Cover panels and false fronts are not
            matched.
          </p>
        )}
        <section aria-label="Selected grain members">
          {draft.memberIds.map((id) => (
            <div key={id} className="text-xs">
              {fronts.find((t) => t.id === id)?.label ?? `Missing front ${id}`}{' '}
              <button
                className="underline"
                onClick={() => membership(draft.memberIds.filter((member) => member !== id))}
              >
                Remove grain member {id}
              </button>
            </div>
          ))}
        </section>
        <label className="block">
          Group name
          <input
            aria-label="Grain group name"
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
          />
        </label>
        <label className="block">
          Grain direction
          <select
            aria-label="Group grain direction"
            value={draft.direction}
            onChange={(e) => patch({ direction: e.target.value as GrainMatchDraft['direction'] })}
          >
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal</option>
          </select>
        </label>
        <label className="block">
          Reference front
          <select
            aria-label="Reference front"
            value={draft.referenceId}
            onChange={(e) => patch({ referenceId: e.target.value })}
          >
            <option value="">Choose reference</option>
            {draft.memberIds.map((id) => (
              <option key={id} value={id}>
                {fronts.find((t) => t.id === id)?.label ?? `Missing ${id}`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Pattern origin
          <select
            aria-label="Pattern origin"
            value={draft.origin}
            onChange={(e) => patch({ origin: e.target.value as GrainMatchDraft['origin'] })}
          >
            <option value="blank">Blank lower-left</option>
            <option value="reference">Reference front cut top-left</option>
          </select>
        </label>
        {field('offsetX', 'Pattern horizontal offset')}
        {field('offsetY', 'Pattern vertical offset')}
        {field('margin', 'Blank margin')}
        {field('gap', 'Additional cutting gap')}
        <p className="text-xs">
          Gap adds space at each distinct column/row origin. Actual panels remain unchanged. Nesting
          checks the resulting cut gaps against tool clearance ({clearance} mm); the whole blank
          must fit stock.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setPreview(previewGrainMatch(scene, project, draft, targetId))
            setMessage('')
          }}
        >
          Preview grain matching
        </Button>
        {preview?.errors.map((e) => (
          <p role="alert" key={e}>
            {e}
          </p>
        ))}
        {preview?.layout && !stale && (
          <section aria-label="Grain matching preview" className="space-y-2">
            <p>
              Shared blank {preview.layout.blankWidth.toFixed(2)} ×{' '}
              {preview.layout.blankHeight.toFixed(2)} mm · {preview.layout.material} ·{' '}
              {preview.layout.thickness.toFixed(2)} mm stock
            </p>
            <GrainMatchViews layout={preview.layout} />
            <table aria-label="Grain sequence coordinates">
              <thead>
                <tr>
                  <th>Sequence</th>
                  <th>Front</th>
                  <th>Cut X/Y mm</th>
                  <th>Cut W/H mm</th>
                </tr>
              </thead>
              <tbody>
                {preview.layout.panels.map((p) => (
                  <tr key={p.id}>
                    <td>{p.sequence}</td>
                    <td>{p.label}</td>
                    <td>
                      {p.x.toFixed(2)}, {p.y.toFixed(2)}
                    </td>
                    <td>
                      {p.width.toFixed(2)} × {p.height.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stockIssue ? (
              <p role="status">Design can be saved; nesting warning: {stockIssue}</p>
            ) : (
              <p role="status">Complete blank fits current stock and tool-clearance constraints.</p>
            )}
            {!preview.changed && <p>No group settings changed.</p>}
          </section>
        )}
        <Button
          disabled={stale || !preview || !!preview.errors.length || !preview.changed}
          onClick={() => {
            if (preview && onApply(preview)) {
              setPreview(null)
              setMessage('Grain matching group applied. Reset or reload to continue.')
            } else setMessage('The source changed. Reset and preview again.')
          }}
        >
          Apply grain matching
        </Button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={reset}>
          Cancel grain changes
        </Button>
        <Button
          size="sm"
          onClick={() =>
            downloadBlob(
              buildGrainMatchCsv(manufacturingParts(scene.parts, materials, scene.components)),
              'grain-matching.csv',
              'text/csv',
            )
          }
        >
          Export saved grain sequence CSV
        </Button>
      </div>
    </aside>
  )
}
