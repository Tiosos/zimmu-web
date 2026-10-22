import { useState } from 'react'
import type { CarcaseComponent, Scene } from '../scene/types'
import { materialTargets } from '../scene/cabinetMaterials'
import { applianceSignature } from '../scene/applianceBays'
import {
  defaultServiceFeature,
  serviceMachiningError,
  type ServiceFeature,
} from '../scene/serviceRecipe'
import { previewService, serviceIssues, type ServicePreview } from '../scene/serviceMachining'
import { CabinetProjection } from './CabinetProjection'
import { componentsById } from '../scene/componentTree'
import { Button } from '@/components/ui/button'
const NUMBERS = [
  'length',
  'width',
  'diameter',
  'depth',
  'x',
  'y',
  'clearance',
  'count',
  'pitch',
  'web',
] as const
type FeatureForm = Omit<ServiceFeature, (typeof NUMBERS)[number]> &
  Record<(typeof NUMBERS)[number], string>
const formOf = (f: ServiceFeature): FeatureForm => ({
  ...f,
  ...(Object.fromEntries(NUMBERS.map((k) => [k, String(f[k])])) as Record<
    (typeof NUMBERS)[number],
    string
  >),
})
const parse = (f: FeatureForm): ServiceFeature => ({
  ...f,
  ...(Object.fromEntries(NUMBERS.map((k) => [k, f[k].trim() ? Number(f[k]) : NaN])) as Record<
    (typeof NUMBERS)[number],
    number
  >),
  bayId: f.bayId || undefined,
})
const LABELS = {
  length: 'Opening length',
  width: 'Opening width',
  diameter: 'Hole diameter',
  depth: 'Blind recess depth',
  x: 'X centre offset',
  y: 'Y centre offset',
  clearance: 'Minimum edge clearance',
  count: 'Repeat count',
  pitch: 'Repeat pitch',
  web: 'Minimum material between cuts',
}
export function CabinetServiceEditor({
  scene,
  cabinet,
  onApply,
}: {
  scene: Scene
  cabinet: CarcaseComponent
  onApply: (p: ServicePreview) => boolean
}) {
  let targets: ReturnType<typeof materialTargets> = [],
    targetError = ''
  try {
    targets = materialTargets(scene, cabinet.id)
  } catch (e) {
    targetError = e instanceof Error ? e.message : String(e)
  }
  const context = applianceSignature(scene),
    make = (shape: 'circle' | 'rectangle' = 'circle') =>
      formOf(defaultServiceFeature(`service_${crypto.randomUUID()}`, shape))
  const [targetId, setTargetId] = useState(targets[0]?.board.id ?? ''),
    [base, setBase] = useState(context)
  const current = targets.find((t) => t.board.id === targetId)?.board
  const [features, setFeatures] = useState<ServiceFeature[]>(() =>
      structuredClone(current?.serviceMachining?.features ?? []),
    ),
    [form, setForm] = useState(make),
    [editing, setEditing] = useState<string | null>(null),
    [preview, setPreview] = useState<ServicePreview | null>(null),
    [error, setError] = useState(''),
    [applied, setApplied] = useState(false)
  const stale = context !== base
  if (applied && stale) {
    setBase(context)
    setApplied(false)
  }
  const edit = (patch: Partial<FeatureForm>) => {
    setForm({ ...form, ...patch })
    setPreview(null)
    setError('')
  }
  const load = (id = targetId) => {
    const target = targets.find((t) => t.board.id === id) ?? targets[0]
    setTargetId(target?.board.id ?? '')
    setFeatures(structuredClone(target?.board.serviceMachining?.features ?? []))
    setBase(context)
    setApplied(false)
    setForm(make())
    setEditing(null)
    setPreview(null)
    setError('')
  }
  const stage = () => {
    const f = parse(form),
      next = editing ? features.map((old) => (old.id === editing ? f : old)) : [...features, f]
    const error = serviceMachiningError({ version: 1, features: next })
    if (error) {
      setError(error)
      setPreview(null)
      return
    }
    setFeatures(next)
    setEditing(f.id)
    setPreview(null)
    setError('')
  }
  const issues = current ? serviceIssues(scene, current) : []
  return (
    <section aria-label="Service openings editor" className="space-y-3 text-sm">
      <h2 className="font-medium">Service and ventilation openings</h2>
      <p>
        Stage real holes, rectangular cut-outs and repeated ventilation slots on a panel’s broad
        faces. X follows board length and Y follows board width. Reference offsets position feature
        centres; repeats advance along positive panel axes.
      </p>
      {stale && (
        <p role="alert">The scene changed. Reset or reload the panel before staging again.</p>
      )}
      {(error || targetError) && <p role="alert">{error || targetError}</p>}
      {issues.map((e) => (
        <p role="alert" key={e}>
          Saved service machining: {e} Last valid cuts are retained.
        </p>
      ))}
      <label className="block">
        Service panel
        <select aria-label="Service panel" value={targetId} onChange={(e) => load(e.target.value)}>
          {targets.map((t) => (
            <option key={t.board.id} value={t.board.id}>
              {t.board.label} · {t.family}
              {t.shared ? ' · shared run panel' : ''}
            </option>
          ))}
        </select>
      </label>
      {current && (
        <p>
          Panel: {current.length} × {current.width} × {current.thickness} mm ·{' '}
          {current.material || 'Unspecified'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => load()}>
          Reset service draft
        </Button>
        <Button size="sm" variant="outline" onClick={() => load()}>
          Cancel service changes
        </Button>
        {(['circle', 'rectangle'] as const).map((shape) => (
          <Button
            key={shape}
            size="sm"
            variant="outline"
            disabled={stale}
            onClick={() => {
              setForm(make(shape))
              setEditing(null)
              setPreview(null)
              setError('')
            }}
          >
            {shape === 'circle' ? 'New cable / pipe hole' : 'New service cut-out / slot'}
          </Button>
        ))}
      </div>
      <label className="block">
        Service feature name
        <input
          aria-label="Service feature name"
          value={form.label}
          onChange={(e) => edit({ label: e.target.value })}
          className="border p-1 ml-2"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label>
          Service shape
          <select
            aria-label="Service shape"
            value={form.shape}
            onChange={(e) => edit({ shape: e.target.value as ServiceFeature['shape'] })}
          >
            <option value="circle">Circular hole</option>
            <option value="rectangle">Rectangular opening / slot</option>
          </select>
        </label>
        <label>
          Machining face
          <select
            aria-label="Machining face"
            value={form.face}
            onChange={(e) => edit({ face: e.target.value as ServiceFeature['face'] })}
          >
            <option value="+Z">+Z broad face</option>
            <option value="-Z">−Z broad face</option>
          </select>
        </label>
        <label>
          Service depth mode
          <select
            aria-label="Service depth mode"
            value={form.mode}
            onChange={(e) => edit({ mode: e.target.value as ServiceFeature['mode'] })}
          >
            <option value="through">Through panel</option>
            <option value="blind">Blind recess</option>
          </select>
        </label>
        <label>
          X position reference
          <select
            aria-label="X position reference"
            value={form.xRef}
            onChange={(e) => edit({ xRef: e.target.value as ServiceFeature['xRef'] })}
          >
            <option value="left">Length start</option>
            <option value="centre">Length centre</option>
            <option value="right">Length end</option>
          </select>
        </label>
        <label>
          Y position reference
          <select
            aria-label="Y position reference"
            value={form.yRef}
            onChange={(e) => edit({ yRef: e.target.value as ServiceFeature['yRef'] })}
          >
            <option value="front">Width start</option>
            <option value="centre">Width centre</option>
            <option value="rear">Width end</option>
          </select>
        </label>
        <label>
          Repeat direction
          <select
            aria-label="Repeat direction"
            value={form.axis}
            onChange={(e) => edit({ axis: e.target.value as ServiceFeature['axis'] })}
          >
            <option value="x">Along board length</option>
            <option value="y">Along board width</option>
          </select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {NUMBERS.filter((k) =>
          form.shape === 'circle' ? k !== 'length' && k !== 'width' : k !== 'diameter',
        )
          .filter((k) => k !== 'depth' || form.mode === 'blind')
          .map((k) => (
            <label key={k}>
              {LABELS[k]}
              {k === 'count' ? '' : ' (mm)'}
              <input
                aria-label={LABELS[k]}
                type="number"
                value={form[k]}
                onChange={(e) => edit({ [k]: e.target.value })}
                className="block border p-1"
              />
            </label>
          ))}
      </div>
      <label className="block">
        Associated appliance bay
        <select
          aria-label="Associated appliance bay"
          value={form.bayId ?? ''}
          onChange={(e) => edit({ bayId: e.target.value || undefined })}
        >
          <option value="">No association</option>
          {form.bayId && !(scene.applianceBays ?? []).some((b) => b.id === form.bayId) && (
            <option value={form.bayId}>Unavailable saved bay</option>
          )}
          {(scene.applianceBays ?? [])
            .filter((b) => b.cabinetId === cabinet.id)
            .map((b) => (
              <option value={b.id} key={b.id}>
                {b.label}
              </option>
            ))}
        </select>
      </label>
      <Button size="sm" disabled={stale || !current} onClick={stage}>
        Stage service feature
      </Button>
      <h3 className="font-medium">Staged service features ({features.length})</h3>
      <ul aria-label="Staged service features">
        {features.map((f) => (
          <li key={f.id} className="border p-2">
            <p>
              {f.label} · {f.shape} · {f.mode} · {f.face} · {f.count} opening(s)
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={stale}
              onClick={() => {
                setEditing(f.id)
                setForm(formOf(f))
                setPreview(null)
                setError('')
              }}
            >
              Edit {f.label}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={stale}
              onClick={() => {
                const copy = {
                  ...structuredClone(f),
                  id: `service_${crypto.randomUUID()}`,
                  label: `${f.label} copy`,
                }
                setForm(formOf(copy))
                setEditing(null)
                setPreview(null)
              }}
            >
              Duplicate {f.label}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={stale}
              onClick={() => {
                setFeatures(features.filter((x) => x.id !== f.id))
                if (editing === f.id) {
                  setEditing(null)
                  setForm(make())
                }
                setPreview(null)
              }}
            >
              Remove {f.label}
            </Button>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="outline"
        disabled={stale || !features.length}
        onClick={() => {
          setFeatures([])
          setEditing(null)
          setForm(make())
          setPreview(null)
        }}
      >
        Clear service features
      </Button>
      <Button
        size="sm"
        disabled={stale || !current || !!targetError}
        onClick={() => {
          setError('')
          setPreview(previewService(scene, cabinet.id, targetId, { version: 1, features }))
        }}
      >
        Preview service openings
      </Button>
      {preview && (
        <section aria-label="Service openings preview" className="space-y-2">
          {preview.errors.map((e) => (
            <p key={e} role="alert">
              {e}
            </p>
          ))}
          <p>
            Resolved service openings: {preview.rows.length}. Existing unrelated machining is
            retained.
          </p>
          {!preview.changed && !preview.errors.length && <p>No changes to apply.</p>}
          <table aria-label="Resolved service openings">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Centre X/Y mm</th>
                <th>Size mm</th>
                <th>Depth mm</th>
                <th>Face</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.cut.id}>
                  <td>
                    {r.feature.label} {r.index + 1}
                  </td>
                  <td>
                    {r.x.toFixed(1)} / {r.y.toFixed(1)}
                  </td>
                  <td>
                    {r.length} × {r.width}
                  </td>
                  <td>{r.depth}</td>
                  <td>{r.feature.face}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {current && (
            <svg
              role="img"
              aria-label="Service panel machining preview"
              className="w-full max-h-80 border"
              viewBox={`0 0 ${current.length} ${current.width}`}
            >
              <rect width={current.length} height={current.width} fill="#d1d5db" />
              {preview.rows.map((r) =>
                r.feature.shape === 'circle' ? (
                  <circle
                    key={r.cut.id}
                    cx={r.x}
                    cy={r.y}
                    r={r.length / 2}
                    fill={r.feature.mode === 'through' ? 'white' : '#fbbf24'}
                    stroke="#2563eb"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{r.feature.label}</title>
                  </circle>
                ) : (
                  <rect
                    key={r.cut.id}
                    x={r.x - r.length / 2}
                    y={r.y - r.width / 2}
                    width={r.length}
                    height={r.width}
                    fill={r.feature.mode === 'through' ? 'white' : '#fbbf24'}
                    stroke="#2563eb"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{r.feature.label}</title>
                  </rect>
                ),
              )}
            </svg>
          )}
          {preview.scene && (
            <div className="grid gap-2 md:grid-cols-3">
              {(['Front', 'Top', 'End'] as const).map((view) => (
                <figure key={view}>
                  <figcaption>{view}</figcaption>
                  <CabinetProjection
                    cabinet={cabinet}
                    view={view}
                    parts={preview.scene!.parts}
                    byId={componentsById(preview.scene!.components)}
                    materials={scene.materials}
                    selectedId={targetId}
                    onSelect={() => {}}
                  />
                </figure>
              ))}
            </div>
          )}
          <Button
            size="sm"
            disabled={stale || !!preview.errors.length || !preview.changed}
            onClick={() => {
              if (onApply(preview)) {
                setPreview(null)
                setApplied(true)
              } else {
                setPreview(null)
                setError('Service openings could not apply. Reset and preview again.')
              }
            }}
          >
            Apply service openings
          </Button>
        </section>
      )}
      <p>
        Clash and web checks use conservative cut envelopes. Rectangular slots have square corners;
        airflow performance, tooling access and structural strength need separate assessment.
      </p>
    </section>
  )
}
