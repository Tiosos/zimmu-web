import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import { frontsSignature, type DrawerAction } from '../scene/frontsDrawers'
import { nearestCarcase } from '../scene/nearestCarcase'
import { RUNNER_NOMINALS, hardwareDefinition } from '../scene/hardwareCatalogue'
import { finishingMaterials } from '../scene/finishingPanels'
import { defaultHingeLayout, type HingeLayout } from '../scene/hingeLayout'
import {
  emptyMotionDraft,
  motionDoors,
  motionDoorIssues,
  motionDrawers,
  motionDrawer,
  previewMotion,
  stageHinges,
  stageMotionDrawer,
  type MotionPreview,
} from '../scene/motionHardware'
import { CabinetProjection } from './CabinetProjection'
export function CabinetMotionEditor({
  cabinet,
  scene,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (p: MotionPreview) => boolean
}) {
  const signature = frontsSignature(scene)
  const [base, setBase] = useState(signature),
    [draft, setDraft] = useState(emptyMotionDraft)
  const [doorsSelected, setDoorsSelected] = useState<string[]>([]),
    [drawersSelected, setDrawersSelected] = useState<string[]>([])
  const [layout, setLayout] = useState(defaultHingeLayout)
  const [height, setHeight] = useState('150'),
    [offset, setOffset] = useState('32')
  const [preview, setPreview] = useState<MotionPreview | null>(null),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [applied, setApplied] = useState(false)
  const stale = base !== signature
  if (preview && preview.signature !== signature) setPreview(null)
  if (applied && stale) {
    setBase(signature)
    setApplied(false)
  }
  let doors: ReturnType<typeof motionDoors> = [],
    drawers: ReturnType<typeof motionDrawers> = [],
    targetError = ''
  try {
    doors = motionDoors(scene, cabinet.id)
    drawers = motionDrawers(scene, cabinet.id)
  } catch (cause) {
    targetError = cause instanceof Error ? cause.message : 'Hardware targets unavailable.'
  }
  const reset = () => {
    setDraft(emptyMotionDraft())
    setBase(signature)
    setPreview(null)
    setMessage('')
    setError('')
    setApplied(false)
    setDoorsSelected([])
    setDrawersSelected([])
    setLayout(defaultHingeLayout())
    setHeight('150')
    setOffset('32')
  }
  const edit = () => {
    setPreview(null)
    setMessage('')
    setError('')
    setApplied(false)
  }
  const stage = (action: () => ReturnType<typeof emptyMotionDraft>) => {
    try {
      setDraft(action())
      edit()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settings could not be staged.')
    }
  }
  const drawerAction = (action: DrawerAction) =>
    stage(() => stageMotionDrawer(scene, cabinet.id, draft, drawersSelected, action))
  const patch = <K extends keyof HingeLayout>(key: K, value: HingeLayout[K]) => {
    setLayout((p) => ({ ...p, [key]: value }))
    edit()
  }
  const proposed = preview?.scene,
    byId = new Map((proposed ?? scene).components.map((c) => [c.id, c]))
  const parts = (proposed ?? scene).parts.filter((p) => nearestCarcase(p, byId)?.id === cabinet.id)
  return (
    <section aria-label="Hinges and runners editor" className="text-xs space-y-4">
      <p>
        Stage frameless hinge positions and drawer-runner choices, then preview before applying. Cup
        dimensions and lateral placement remain the existing modeled hardware values. These controls
        do not assign opening angles, load ratings or supplier compatibility.
      </p>
      <p>
        Door board X runs its height; listed cup positions use that axis. Plate positions follow the
        same cups through cabinet space. Automatic runner length chooses the longest supported
        nominal that fits; explicit choices shorten the box and change the hardware quote together.
      </p>
      {targetError && <p role="alert">{targetError}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {stale && !applied && (
        <p role="alert">The project changed. Reset the hardware draft before continuing.</p>
      )}
      <fieldset
        disabled={(stale && !applied) || !!targetError}
        className="border rounded p-3 space-y-4"
      >
        <legend>Staged hardware settings</legend>
        <section aria-label="Door hinge targets">
          <h3>Door leaves ({doorsSelected.length} selected)</h3>
          {cabinet.params.frame !== undefined && (
            <p>
              Face-frame hinges retain their modeled application; custom positioning is read-only.
            </p>
          )}
          {doors.map((t) => (
            <div key={t.id} className="border rounded p-2">
              <label>
                <input
                  type="checkbox"
                  aria-label={`Hinge ${t.label}`}
                  disabled={t.locked || cabinet.params.frame !== undefined}
                  checked={doorsSelected.includes(t.id)}
                  onChange={(e) =>
                    setDoorsSelected((ids) =>
                      e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id),
                    )
                  }
                />{' '}
                {t.label} — {t.hinge} hinge{t.locked ? ' (detached/locked)' : ''}
              </label>
              <p>
                {Object.hasOwn(draft.hinges, t.id)
                  ? 'Staged hinge settings.'
                  : 'Saved hinge settings.'}
              </p>
              {motionDoorIssues(scene, cabinet.id, t).map((issue) => (
                <p key={issue}>{issue}</p>
              ))}
              {t.part.cuts
                .filter((c) => c.kind === 'hole-array' && c.id.startsWith('cups_'))
                .map(
                  (c) =>
                    c.kind === 'hole-array' && (
                      <p key={c.id}>
                        {c.count} cups, diameter {c.diameter} mm, depth {c.depth} mm; first{' '}
                        {c.start.x.toFixed(2)} mm, pitch {c.pitch.toFixed(2)} mm.
                      </p>
                    ),
                )}
              <Button
                size="sm"
                variant="outline"
                disabled={t.locked || cabinet.params.frame !== undefined}
                onClick={() => {
                  setDoorsSelected([t.id])
                  setLayout({ ...(t.part.hingeLayout ?? defaultHingeLayout()) })
                  edit()
                }}
              >
                Load hinge settings for {t.label}
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={cabinet.params.frame !== undefined}
            onClick={() => setDoorsSelected(doors.filter((t) => !t.locked).map((t) => t.id))}
          >
            Select all door leaves
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDoorsSelected([])}>
            Clear door selection
          </Button>
        </section>
        <div className="grid grid-cols-2 gap-3">
          <label>
            Hinge count mode
            <select
              aria-label="Hinge count mode"
              value={layout.countMode}
              onChange={(e) => patch('countMode', e.target.value as HingeLayout['countMode'])}
            >
              <option value="auto">Automatic count</option>
              <option value="manual">Manual count</option>
            </select>
          </label>
          <label>
            Manual hinge count
            <input
              aria-label="Manual hinge count"
              type="number"
              min="2"
              max="8"
              step="1"
              disabled={layout.countMode === 'auto'}
              value={Number.isNaN(layout.count) ? '' : layout.count}
              onChange={(e) => patch('count', e.target.value === '' ? NaN : Number(e.target.value))}
            />
          </label>
          <label>
            Hinge inset mode
            <select
              aria-label="Hinge inset mode"
              value={layout.insetMode}
              onChange={(e) => patch('insetMode', e.target.value as HingeLayout['insetMode'])}
            >
              <option value="auto">Automatic inset</option>
              <option value="manual">Manual inset</option>
            </select>
          </label>
          <label>
            Hinge end inset (mm)
            <input
              aria-label="Hinge end inset"
              type="number"
              step="any"
              disabled={layout.insetMode === 'auto'}
              value={Number.isNaN(layout.endInset) ? '' : layout.endInset}
              onChange={(e) =>
                patch('endInset', e.target.value === '' ? NaN : Number(e.target.value))
              }
            />
          </label>
          <Button
            size="sm"
            onClick={() =>
              stage(() => stageHinges(scene, cabinet.id, draft, doorsSelected, layout))
            }
          >
            Stage hinge layout
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => stage(() => stageHinges(scene, cabinet.id, draft, doorsSelected, null))}
          >
            Restore default hinges
          </Button>
        </div>
        <section aria-label="Drawer runner targets">
          <h3>Drawer openings ({drawersSelected.length} selected)</h3>
          {drawers.map((t) => {
            const drawer = motionDrawer(scene, cabinet.id, t)
            return (
              <label key={t.id} className="block border rounded p-2">
                <input
                  type="checkbox"
                  aria-label={`Runner ${t.sectionId} ${t.openingId}`}
                  disabled={t.locked}
                  checked={drawersSelected.includes(t.id)}
                  onChange={(e) =>
                    setDrawersSelected((ids) =>
                      e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id),
                    )
                  }
                />{' '}
                {drawer?.label ?? t.sectionId}: {drawer?.params.family ?? 'unavailable'}; nominal{' '}
                {drawer?.params.nominal ?? 'automatic'}; box height{' '}
                {drawer?.params.boxHeight ?? 'automatic'}; offset{' '}
                {drawer?.params.runnerOffset ?? '—'} mm{t.locked ? ' (locked)' : ''}
              </label>
            )
          })}
          {!drawers.length && <p>Add drawer fronts in Fronts & Drawers to configure runners.</p>}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrawersSelected(drawers.filter((t) => !t.locked).map((t) => t.id))}
          >
            Select all drawer openings
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDrawersSelected([])}>
            Clear drawer selection
          </Button>
        </section>
        <div className="grid grid-cols-2 gap-3">
          <label>
            Runner family
            <select
              aria-label="Motion runner family"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value)
                  drawerAction({
                    kind: 'family',
                    value: e.target.value as 'side-mount' | 'undermount',
                  })
                e.target.value = ''
              }}
            >
              <option value="">Stage runner family</option>
              <option value="side-mount">Side-mount</option>
              <option value="undermount">Undermount</option>
            </select>
          </label>
          <label>
            Runner nominal
            <select
              aria-label="Motion runner nominal"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value)
                  drawerAction({
                    kind: 'nominal',
                    value: e.target.value === 'auto' ? null : e.target.value,
                  })
                e.target.value = ''
              }}
            >
              <option value="">Stage runner length</option>
              <option value="auto">Automatic longest fit</option>
              {RUNNER_NOMINALS.map((n) => (
                <option key={n} value={n}>
                  {n} mm
                </option>
              ))}
            </select>
          </label>
          <label>
            Box height (mm)
            <input
              aria-label="Motion box height"
              type="number"
              value={height}
              onChange={(e) => {
                setHeight(e.target.value)
                edit()
              }}
            />
          </label>
          <Button size="sm" onClick={() => drawerAction({ kind: 'height', value: height })}>
            Stage box height
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => drawerAction({ kind: 'height', value: null })}
          >
            Use automatic box height
          </Button>
          <label>
            Side-mount offset (mm)
            <input
              aria-label="Motion runner offset"
              type="number"
              value={offset}
              onChange={(e) => {
                setOffset(e.target.value)
                edit()
              }}
            />
          </label>
          <Button size="sm" onClick={() => drawerAction({ kind: 'offset', value: offset })}>
            Stage side-mount offset
          </Button>
          <label>
            Box material
            <select
              aria-label="Motion box material"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value)
                  drawerAction({
                    kind: 'material',
                    value: e.target.value === 'inherit' ? '' : e.target.value,
                  })
                e.target.value = ''
              }}
            >
              <option value="">Stage box material</option>
              <option value="inherit">Cabinet drawer material</option>
              {finishingMaterials(scene).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      <p>
        {Object.keys(draft.hinges).length} door leaves and {Object.keys(draft.drawers).length}{' '}
        drawer openings staged.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={stale || !!targetError}
          onClick={() => {
            setError('')
            setApplied(false)
            setPreview(previewMotion(scene, cabinet.id, draft))
          }}
        >
          Preview hinges and runners
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
            setPreview(null)
            setApplied(true)
            setDraft(emptyMotionDraft())
            setMessage('Hinge and runner settings applied.')
          }}
        >
          Apply hinges and runners
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset hardware draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel hardware changes
        </Button>
      </div>
      {preview && (
        <section aria-label="Hinges and runners preview" className="space-y-3">
          {preview.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          {!preview.changed && !preview.errors.length && <p>No hardware changes staged.</p>}
          {proposed && (
            <>
              <ul>
                {motionDoors(proposed, cabinet.id).map((t) => (
                  <li key={t.id}>
                    {t.label}:{' '}
                    {t.part.cuts
                      .filter((c) => c.kind === 'hole-array' && c.id.startsWith('cups_'))
                      .map((c) =>
                        c.kind === 'hole-array'
                          ? `${c.count} cups (${c.diameter} × ${c.depth} mm), first ${c.start.x.toFixed(2)} mm, pitch ${c.pitch.toFixed(2)} mm`
                          : '',
                      )
                      .join('; ')}
                  </li>
                ))}
              </ul>
              <ul>
                {proposed.components
                  .filter((c) => c.kind === 'drawer' && c.parentId === cabinet.id)
                  .map((d) => (
                    <li key={d.id}>
                      {d.label}:{' '}
                      {proposed.parts
                        .filter((p) => p.parentId === d.id && p.role === 'box-left')
                        .map(
                          (p) =>
                            `${p.length.toFixed(2)} × ${p.kind === 'board' ? p.width.toFixed(2) : '—'} mm side board`,
                        )
                        .join('; ')}
                    </li>
                  ))}
              </ul>
              <h3>Hardware quantity changes</h3>
              <ul>
                {preview.hardware.map((r) => (
                  <li key={r.key}>
                    {hardwareDefinition(r.key)?.name ?? r.key}: {r.before} → {r.after}
                  </li>
                ))}
              </ul>
              <div className="grid lg:grid-cols-3 gap-3">
                {(['Front', 'Top', 'End'] as const).map((view) => (
                  <section key={view} aria-label={`Motion ${view} preview`}>
                    <h3>{view}</h3>
                    <div className="h-72 pointer-events-none">
                      <CabinetProjection
                        view={view}
                        cabinet={
                          proposed.components.find(
                            (c): c is CarcaseComponent =>
                              c.id === cabinet.id && c.kind === 'carcase',
                          ) ?? cabinet
                        }
                        materials={proposed.materials}
                        parts={parts}
                        byId={byId}
                        selectedId={null}
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
