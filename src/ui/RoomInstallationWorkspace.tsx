import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BoardPart, CarcaseComponent, Scene } from '../scene/types'
import type { ProjectStructure } from '../scene/projectStructure'
import { roomComponentIds } from '../scene/projectStructure'
import { installationSignature } from '../scene/installationSources'
import type { InstallationDraft, WallFillerDraft } from '../scene/installationRecipe'
import {
  installationDraft,
  wallFillerDraft,
  installationIssues,
  wallFillerIssues,
  previewInstallation,
  previewWallFiller,
  type InstallationPreview,
  type WallFillerPreview,
} from '../scene/roomInstallation'
import { anchoredRunMembers } from '../scene/runWorktops'
import { finishingMaterials } from '../scene/finishingPanels'
import { RoomInstallationViews } from './RoomInstallationViews'
interface Props {
  scene: Scene
  project: ProjectStructure
  onApplyRun: (p: InstallationPreview) => boolean
  onApplyFiller: (p: WallFillerPreview) => boolean
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}
export function RoomInstallationWorkspace({
  scene,
  project,
  onApplyRun,
  onApplyFiller,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const [mode, setMode] = useState<'run' | 'filler'>('run'),
    [run, setRun] = useState(() => installationDraft(project, scene)),
    [filler, setFiller] = useState(() => wallFillerDraft(project, scene)),
    [targetRun, setTargetRun] = useState<string>(),
    [targetFiller, setTargetFiller] = useState<string>(),
    [runPreview, setRunPreview] = useState<InstallationPreview | null>(null),
    [fillerPreview, setFillerPreview] = useState<WallFillerPreview | null>(null),
    [base, setBase] = useState(() => installationSignature(scene, project)),
    [message, setMessage] = useState('')
  const signature = installationSignature(scene, project),
    stale = base !== signature,
    rooms = project.areas.flatMap((a) => a.rooms),
    draft = mode === 'run' ? run : filler,
    room = rooms.find((r) => r.id === draft.roomId)
  const ids = room
    ? roomComponentIds(
        room.items.flatMap((i) => i.rootComponentIds),
        scene,
      )
    : new Set<string>()
  const cabinets = scene.components.filter(
    (c): c is CarcaseComponent => c.kind === 'carcase' && ids.has(c.id),
  )
  const patchRun = (change: Partial<InstallationDraft>) => {
    setRun((d) => ({ ...d, ...change }))
    setRunPreview(null)
    setMessage('')
  }
  const patchFiller = (change: Partial<WallFillerDraft>) => {
    setFiller((d) => ({ ...d, ...change }))
    setFillerPreview(null)
    setMessage('')
  }
  const reset = () => {
    setRun(installationDraft(project, scene, draft.roomId))
    setFiller(wallFillerDraft(project, scene, draft.roomId))
    setTargetRun(undefined)
    setTargetFiller(undefined)
    setRunPreview(null)
    setFillerPreview(null)
    setBase(signature)
    setMessage('')
  }
  const loadRoom = (id: string) => {
    setRun(installationDraft(project, scene, id))
    setFiller(wallFillerDraft(project, scene, id))
    setTargetRun(undefined)
    setTargetFiller(undefined)
    setRunPreview(null)
    setFillerPreview(null)
    setBase(signature)
    setMessage('')
  }
  const applyRun = (p: InstallationPreview) => {
    if (!onApplyRun(p)) {
      setRunPreview(null)
      setMessage('The project changed. Reload and preview again.')
      return
    }
    setRunPreview(null)
    setMessage(
      p.action === 'detach'
        ? 'Installation detached; cabinet poses are now free.'
        : 'Room installation applied. Reset or reload to continue.',
    )
  }
  const applyFiller = (p: WallFillerPreview) => {
    if (!onApplyFiller(p)) {
      setFillerPreview(null)
      setMessage('The project changed. Reload and preview again.')
      return
    }
    setFillerPreview(null)
    setMessage(
      p.action === 'delete'
        ? 'Wall filler deleted.'
        : p.action === 'detach'
          ? 'Wall filler detached; its dimensions are now fixed.'
          : 'Wall filler applied. Reset or reload to continue.',
    )
  }
  const field = (key: keyof InstallationDraft, label: string) => (
    <label key={key} className="block">
      {label} (mm)
      <input
        aria-label={label}
        type="number"
        step="any"
        value={run[key] as string}
        onChange={(e) => patchRun({ [key]: e.target.value })}
      />
    </label>
  )
  const fillerField = (key: keyof WallFillerDraft, label: string) => (
    <label key={key} className="block">
      {label} (mm)
      <input
        aria-label={label}
        type="number"
        step="any"
        value={filler[key] as string}
        disabled={
          (key === 'thickness' && filler.thicknessMode === 'stock') ||
          (key === 'height' && filler.heightMode === 'cabinet')
        }
        onChange={(e) => patchFiller({ [key]: e.target.value })}
      />
    </label>
  )
  const select = <T extends string>(
    label: string,
    value: T,
    values: readonly T[],
    change: (v: T) => void,
  ) => (
    <label className="block">
      {label}
      <select aria-label={label} value={value} onChange={(e) => change(e.target.value as T)}>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  )
  const savedFillers = scene.parts.filter(
    (p): p is BoardPart => p.kind === 'board' && !!p.wallFiller,
  )
  const preview = mode === 'run' ? runPreview : fillerPreview
  return (
    <section aria-label="Room installation workspace" className="space-y-4 text-xs">
      <p>
        Install cabinets against a straight room wall, or size a rectangular filler from a side-wall
        gap. Create walls and assign cabinets to rooms in Project structure first. Linked poses and
        filler dimensions are edited here; detach before normal placement or board edits. Room
        geometry remains unchanged.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" aria-pressed={mode === 'run'} onClick={() => setMode('run')}>
          Install cabinet runs
        </Button>
        <Button size="sm" aria-pressed={mode === 'filler'} onClick={() => setMode('filler')}>
          Wall-fitted fillers
        </Button>
        <Button size="sm" variant="outline" disabled={!canUndo || !onUndo} onClick={onUndo}>
          Undo scene change
        </Button>
        <Button size="sm" variant="outline" disabled={!canRedo || !onRedo} onClick={onRedo}>
          Redo scene change
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      {stale && (
        <p role="alert">The scene or project changed. Reset or reload before previewing.</p>
      )}
      <section aria-label="Saved room installations">
        {(scene.installations ?? []).map((r) => (
          <div key={r.id} className="border rounded p-2">
            <p>{r.draft.label}</p>
            {installationIssues(scene, r).map((i) => (
              <p key={i}>{i}</p>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMode('run')
                setRun(structuredClone(r.draft))
                setTargetRun(r.id)
                setBase(signature)
                setRunPreview(null)
                setMessage('')
              }}
            >
              Edit {r.draft.label}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                applyRun({
                  ...previewInstallation(scene, project, r.draft, r.id),
                  action: 'detach',
                })
              }
            >
              Detach {r.draft.label}
            </Button>
          </div>
        ))}
      </section>
      <section aria-label="Saved wall fillers">
        {savedFillers.map((p) => (
          <div key={p.id} className="border rounded p-2">
            <p>
              {p.label} · {p.length.toFixed(2)} × {p.width.toFixed(2)} × {p.thickness.toFixed(2)} mm
            </p>
            {wallFillerIssues(scene, p).map((i) => (
              <p key={i}>{i}</p>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMode('filler')
                setFiller(structuredClone(p.wallFiller!.draft))
                setTargetFiller(p.id)
                setBase(signature)
                setFillerPreview(null)
                setMessage('')
              }}
            >
              Edit {p.label}
            </Button>
            {(['detach', 'delete'] as const).map((action) => (
              <Button
                key={action}
                size="sm"
                variant="outline"
                onClick={() =>
                  applyFiller({
                    ...previewWallFiller(scene, project, p.wallFiller!.draft, p.id),
                    action,
                  })
                }
              >
                {action === 'detach' ? 'Detach' : 'Delete'} {p.label}
              </Button>
            ))}
          </div>
        ))}
      </section>
      <label className="block">
        Room
        <select
          aria-label="Installation room"
          value={draft.roomId}
          onChange={(e) => loadRoom(e.target.value)}
        >
          {!rooms.some((r) => r.id === draft.roomId) && (
            <option value={draft.roomId}>Missing room</option>
          )}
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset disabled={stale} className="space-y-3">
        <legend>{mode === 'run' ? 'Run installation settings' : 'Wall filler settings'}</legend>
        <label className="block">
          Reference wall
          <select
            aria-label="Installation wall"
            value={draft.wallId}
            onChange={(e) =>
              mode === 'run'
                ? patchRun({ wallId: e.target.value })
                : patchFiller({ wallId: e.target.value })
            }
          >
            {!room?.geometry?.walls.some((w) => w.id === draft.wallId) && (
              <option value={draft.wallId}>Select a live wall</option>
            )}
            {room?.geometry?.walls.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y).toFixed(1)} mm
              </option>
            ))}
          </select>
        </label>
        {mode === 'run' ? (
          <>
            <label className="block">
              Installation name
              <input
                aria-label="Installation name"
                value={run.label}
                onChange={(e) => patchRun({ label: e.target.value })}
              />
            </label>
            <fieldset>
              <legend>Cabinet members in placement order</legend>
              {cabinets.map((c) => (
                <label className="block" key={c.id}>
                  <input
                    type="checkbox"
                    aria-label={`Install ${c.label} (${c.id})`}
                    checked={run.memberIds.includes(c.id)}
                    onChange={(e) =>
                      patchRun({
                        memberIds: e.target.checked
                          ? [...run.memberIds, c.id]
                          : run.memberIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  {c.label}
                </label>
              ))}
              {run.memberIds
                .filter((id) => !cabinets.some((c) => c.id === id))
                .map((id) => (
                  <label className="block" key={id}>
                    <input
                      type="checkbox"
                      checked
                      onChange={() =>
                        patchRun({ memberIds: run.memberIds.filter((v) => v !== id) })
                      }
                    />
                    Missing / outside room: {id}
                  </label>
                ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const first =
                    run.memberIds.find((id) => cabinets.some((c) => c.id === id)) ?? cabinets[0]?.id
                  if (first) patchRun({ memberIds: anchoredRunMembers(scene, first) })
                }}
              >
                Select anchored installation run
              </Button>
              <Button size="sm" variant="outline" onClick={() => patchRun({ memberIds: [] })}>
                Clear installation selection
              </Button>
              <ol>
                {run.memberIds.map((id, i) => (
                  <li key={id}>
                    {i + 1}. {scene.components.find((c) => c.id === id)?.label ?? id}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={i === 0}
                      onClick={() => {
                        const ids = [...run.memberIds]
                        ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
                        patchRun({ memberIds: ids })
                      }}
                    >
                      Move member {i + 1} earlier
                    </Button>
                  </li>
                ))}
              </ol>
            </fieldset>
            {select('Wall interior side', run.side, ['left', 'right'], (side) =>
              patchRun({ side }),
            )}
            {select('Member direction', run.direction, ['forward', 'reverse'], (direction) =>
              patchRun({ direction }),
            )}
            {select('Position from', run.from, ['start', 'end', 'centre'], (from) =>
              patchRun({ from }),
            )}
            {field('offset', 'Wall starting offset')}
            {field('gap', 'Cabinet spacing')}
            {field('startReserve', 'Wall start reserve')}
            {field('endReserve', 'Wall end reserve')}
            {field('rear', 'Rear installation clearance')}
            {select('Elevation alignment', run.elevationMode, ['base', 'top'], (elevationMode) =>
              patchRun({ elevationMode }),
            )}
            <label className="block">
              Site datum
              <select
                aria-label="Installation site datum"
                value={run.datumLevelId}
                onChange={(e) => patchRun({ datumLevelId: e.target.value })}
              >
                <option value="">Project zero</option>
                {room?.geometry?.siteLevels?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {l.elevation.value} mm
                  </option>
                ))}
              </select>
            </label>
            {field('elevation', 'Cabinet elevation above datum')}
            {field('floor', 'Floor elevation')}
            {field('ceiling', 'Ceiling elevation (optional)')}
            <label className="block">
              <input
                type="checkbox"
                checked={run.detach}
                onChange={(e) => patchRun({ detach: e.target.checked })}
              />
              Detach existing cabinet anchors when applying
            </label>
            <Button
              size="sm"
              onClick={() => {
                setRunPreview(previewInstallation(scene, project, run, targetRun))
                setMessage('')
              }}
            >
              Preview room installation
            </Button>
            <Button
              size="sm"
              disabled={stale || !runPreview || !!runPreview.errors.length || !runPreview.changed}
              onClick={() => runPreview && applyRun(runPreview)}
            >
              Apply room installation
            </Button>
          </>
        ) : (
          <>
            <label className="block">
              Cabinet
              <select
                aria-label="Filler cabinet"
                value={filler.cabinetId}
                onChange={(e) => patchFiller({ cabinetId: e.target.value })}
              >
                {!cabinets.some((c) => c.id === filler.cabinetId) && (
                  <option value={filler.cabinetId}>Select a live cabinet</option>
                )}
                {cabinets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Filler name
              <input
                aria-label="Wall filler name"
                value={filler.label}
                onChange={(e) => patchFiller({ label: e.target.value })}
              />
            </label>
            {select('Filler side', filler.side, ['left', 'right'], (side) => patchFiller({ side }))}
            {fillerField('minimum', 'Minimum filler width')}
            {fillerField('maximum', 'Maximum filler width')}
            {fillerField('wallGap', 'Wall installation clearance')}
            {fillerField('setback', 'Filler front setback')}
            <label className="block">
              Material
              <select
                aria-label="Wall filler material"
                value={filler.material}
                onChange={(e) => patchFiller({ material: e.target.value })}
              >
                {finishingMaterials(scene).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {select(
              'Filler thickness source',
              filler.thicknessMode,
              ['stock', 'custom'],
              (thicknessMode) => patchFiller({ thicknessMode }),
            )}
            {fillerField('thickness', 'Custom filler thickness')}
            {select('Filler grain', filler.grain, ['length', 'width', 'free'], (grain) =>
              patchFiller({ grain }),
            )}
            {select(
              'Filler height source',
              filler.heightMode,
              ['cabinet', 'custom'],
              (heightMode) => patchFiller({ heightMode }),
            )}
            {fillerField('height', 'Custom filler height')}
            {fillerField('bottom', 'Filler bottom clearance')}
            {fillerField('top', 'Filler top clearance')}
            {(['x0', 'x1', 'y0', 'y1'] as const).map((key) => (
              <label className="block" key={key}>
                Local edge {key}
                <select
                  aria-label={`Filler edge ${key}`}
                  value={
                    filler.edges[key] === undefined
                      ? 'inherit'
                      : filler.edges[key] === null
                        ? 'bare'
                        : `stock:${filler.edges[key]}`
                  }
                  onChange={(e) => {
                    const edges = { ...filler.edges }
                    if (e.target.value === 'inherit') delete edges[key]
                    else edges[key] = e.target.value === 'bare' ? null : e.target.value.slice(6)
                    patchFiller({ edges })
                  }}
                >
                  <option value="inherit">Inherit</option>
                  <option value="bare">Bare</option>
                  {Object.entries(scene.materials)
                    .filter(([, m]) => Number.isFinite(m.thickness) && m.thickness! > 0)
                    .map(([name]) => (
                      <option key={name} value={`stock:${name}`}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <Button
              size="sm"
              onClick={() => {
                setFillerPreview(previewWallFiller(scene, project, filler, targetFiller))
                setMessage('')
              }}
            >
              Preview wall filler
            </Button>
            <Button
              size="sm"
              disabled={
                stale || !fillerPreview || !!fillerPreview.errors.length || !fillerPreview.changed
              }
              onClick={() => fillerPreview && applyFiller(fillerPreview)}
            >
              Apply wall filler
            </Button>
          </>
        )}
      </fieldset>
      <Button size="sm" variant="outline" onClick={reset}>
        Reset installation draft
      </Button>
      <Button size="sm" variant="outline" onClick={reset}>
        Cancel installation changes
      </Button>
      {preview && (
        <section aria-label="Installation preview">
          {preview.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          {!preview.errors.length && preview.scene && preview.binding && (
            <>
              {mode === 'run' && runPreview && (
                <table aria-label="Installed cabinet dimensions">
                  <thead>
                    <tr>
                      <th>Cabinet</th>
                      <th>Along wall</th>
                      <th>Base</th>
                      <th>Top</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runPreview.rows.map((r) => (
                      <tr key={r.id}>
                        <th>{r.label}</th>
                        <td>
                          {r.x0.toFixed(2)}–{r.x1.toFixed(2)}
                        </td>
                        <td>{r.z0.toFixed(2)}</td>
                        <td>{r.z1.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {mode === 'filler' && fillerPreview?.part && (
                <p>
                  {fillerPreview.part.label}: {fillerPreview.part.length.toFixed(2)} ×{' '}
                  {fillerPreview.part.width.toFixed(2)} × {fillerPreview.part.thickness.toFixed(2)}{' '}
                  mm (height × gap width × thickness). Material: {fillerPreview.part.material};
                  grain: {fillerPreview.part.grain}.
                </p>
              )}
              <RoomInstallationViews
                scene={preview.scene}
                project={project}
                roomId={draft.roomId}
                binding={preview.binding}
                wallId={draft.wallId}
                selectedIds={mode === 'run' ? run.memberIds : [filler.cabinetId]}
                filler={mode === 'filler' ? fillerPreview?.part : undefined}
              />
              <ul aria-label="Installation review issues">
                {preview.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              {!preview.changed && <p>No changes to save.</p>}
            </>
          )}
        </section>
      )}
    </section>
  )
}
