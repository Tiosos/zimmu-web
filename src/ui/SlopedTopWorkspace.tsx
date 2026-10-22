import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import type { ProjectStructure } from '../scene/projectStructure'
import {
  defaultSlopeDraft,
  previewSlope,
  slopeShelfClearances,
  slopeSignature,
  type SlopeDraft,
  type SlopePreview,
} from '../scene/slopedTop'
import { slopeMetrics } from '../scene/slopedTopRecipe'
import { manufacturingParts } from '../scene/manufacturingPart'
import { SlopedTopViews } from './SlopedTopViews'
import { buildSlopeCsv } from './buildSlopeCsv'
import { downloadBlob } from './download'
const numeric = (s: string) => (s.trim() ? Number(s) : NaN)
export function SlopedTopWorkspace({
  scene,
  project,
  onApply,
  onClose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  scene: Scene
  project: ProjectStructure
  onApply: (p: SlopePreview) => boolean
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const signature = slopeSignature(scene, project),
    cabinets = scene.components.filter((c): c is CarcaseComponent => c.kind === 'carcase'),
    [base, setBase] = useState(signature),
    [draft, setDraft] = useState<SlopeDraft>(() => defaultSlopeDraft(scene, cabinets[0]?.id ?? '')),
    [preview, setPreview] = useState<SlopePreview | null>(null),
    [fixed, setFixed] = useState<'start' | 'end'>('start'),
    [message, setMessage] = useState(''),
    stale = base !== signature,
    cab = cabinets.find((c) => c.id === draft.cabinetId),
    span = draft.profile.axis === 'width' ? (cab?.params.width ?? 0) : (cab?.params.depth ?? 0),
    angle = (Math.atan((draft.second - draft.first) / span) * 180) / Math.PI
  const patch = (change: Partial<SlopeDraft>) => {
    setDraft((d) => ({ ...d, ...change }))
    setPreview(null)
    setMessage('')
  }
  const reset = (id = draft.cabinetId) => {
    setDraft(defaultSlopeDraft(scene, id))
    setPreview(null)
    setBase(signature)
    setMessage('')
  }
  const result = !stale && !preview?.errors.length ? preview?.scene : null,
    candidate = result?.components.find(
      (c): c is CarcaseComponent => c.kind === 'carcase' && c.id === draft.cabinetId,
    ),
    records = result
      ? manufacturingParts(result.parts, result.materials, result.components).filter(
          (p) => p.provenance.cabinetId === draft.cabinetId,
        )
      : []
  const number = (name: string, value: number, onChange: (n: number) => void) => (
    <label className="block" key={name}>
      {name}
      <input
        type="number"
        step="any"
        aria-label={name}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(numeric(e.target.value))}
      />
    </label>
  )
  return (
    <aside
      aria-label="Sloped top cabinet workspace"
      className="absolute right-3 top-14 z-40 w-[600px] max-w-[95vw] max-h-[85vh] overflow-y-auto bg-card text-foreground border rounded p-4 shadow-xl space-y-3"
    >
      <div className="flex justify-between">
        <h2>Sloped-Top Cabinets</h2>
        <Button onClick={onClose}>Close sloped top</Button>
      </div>
      <p className="text-xs">
        Open, upright, frameless cabinets with none/applied backs. Set both roof heights at the body
        footprint. Overhangs can extend above the stated high endpoint; check the complete envelope.
        Opening and shelf layouts stay below the lowest roof underside.
      </p>
      <div className="flex gap-2">
        <Button disabled={!canUndo} onClick={onUndo}>
          Undo slope change
        </Button>
        <Button disabled={!canRedo} onClick={onRedo}>
          Redo slope change
        </Button>
        <Button onClick={() => reset()}>Reload slope settings</Button>
      </div>
      {stale && (
        <p role="alert">Source changed. Reload before continuing; stale diagrams are hidden.</p>
      )}
      <fieldset disabled={stale} className="space-y-3">
        <legend>Slope settings</legend>
        <label className="block">
          Cabinet
          <select
            aria-label="Slope cabinet"
            value={draft.cabinetId}
            onChange={(e) => reset(e.target.value)}
          >
            <option value="">Choose cabinet</option>
            {cabinets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <input
            type="checkbox"
            aria-label="Enable sloped top"
            checked={draft.enabled}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          Enable sloped top
        </label>
        <label className="block">
          Slope across
          <select
            aria-label="Slope axis"
            value={draft.profile.axis}
            onChange={(e) =>
              patch({ profile: { ...draft.profile, axis: e.target.value as 'width' | 'depth' } })
            }
          >
            <option value="width">Width: left → right</option>
            <option value="depth">Depth: front → back</option>
          </select>
        </label>
        {number('First roof height (mm)', draft.first, (n) => patch({ first: n }))}
        {number('Opposite roof height (mm)', draft.second, (n) => patch({ second: n }))}
        <label className="block">
          Fixed end
          <select
            aria-label="Fixed slope end"
            value={fixed}
            onChange={(e) => setFixed(e.target.value as 'start' | 'end')}
          >
            <option value="start">First end</option>
            <option value="end">Opposite end</option>
          </select>
        </label>
        {number('Slope angle (degrees)', angle, (n) => {
          const delta = Math.tan((n * Math.PI) / 180) * span
          patch(
            fixed === 'start' ? { second: draft.first + delta } : { first: draft.second - delta },
          )
        })}
        {(['left', 'right', 'front', 'back', 'minClearance'] as const).map((k) =>
          number(
            k === 'minClearance' ? 'Minimum clear height (mm)' : `${k} top overhang (mm)`,
            draft.profile[k],
            (n) => patch({ profile: { ...draft.profile, [k]: n } }),
          ),
        )}
        <Button
          onClick={() => {
            setPreview(previewSlope(scene, project, draft))
            setMessage('')
          }}
        >
          Preview sloped cabinet
        </Button>
        {!stale &&
          preview?.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
        {result && candidate && (
          <section aria-label="Sloped cabinet preview" className="space-y-3">
            <p>
              Roof {slopeMetrics(candidate.params).start.toFixed(2)} →{' '}
              {slopeMetrics(candidate.params).end.toFixed(2)} mm · conservative clear opening{' '}
              {preview!.openingHeight.toFixed(2)} mm
            </p>
            {preview?.warnings.map((w) => (
              <p role="status" key={w}>
                {w}
              </p>
            ))}
            <SlopedTopViews scene={result} cabinet={candidate} />
            {slopeShelfClearances(result, candidate.id).map((s) => (
              <p key={s.id}>
                {s.label}: {s.headroom.toFixed(2)} mm minimum roof headroom
              </p>
            ))}
            <p className="text-xs">
              Projection shows generated roof profiles; drilling and toe-kick notches are omitted in
              this diagram. Applied 3D geometry and exports include them.
            </p>
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th>Panel</th>
                  <th>Blank L × W × T (mm)</th>
                  <th>Material</th>
                  <th>Roof cuts</th>
                </tr>
              </thead>
              <tbody>
                {records.map((p) =>
                  p.kind === 'board' ? (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td>
                        {p.nesting.length.toFixed(2)} × {p.nesting.width.toFixed(2)} ×{' '}
                        {p.nesting.thickness.toFixed(2)}
                      </td>
                      <td>{p.material}</td>
                      <td>
                        {p.cuts
                          .filter((c) => c.kind === 'mitre' && c.sourceComponentId)
                          .map((c) =>
                            c.kind === 'mitre'
                              ? `${c.end} ${c.axis === 'Z' ? 'profile' : 'bevel'} ${c.angle.toFixed(2)}° ${c.flip ? 'opposite long edge' : ''}`
                              : '',
                          )
                          .join('; ')}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
            {!preview?.changed && <p>No slope settings changed.</p>}
            <Button
              onClick={() =>
                downloadBlob(buildSlopeCsv(records), 'sloped-panel-schedule.csv', 'text/csv')
              }
            >
              Export sloped panel schedule
            </Button>
          </section>
        )}
        <Button
          disabled={!preview?.changed || !result || !!preview?.errors.length}
          onClick={() => {
            if (preview && onApply(preview)) {
              setPreview(null)
              setMessage('Slope settings applied. Reload to continue.')
            } else setMessage('Source changed. Reload and preview again.')
          }}
        >
          Apply sloped cabinet
        </Button>
      </fieldset>
      <Button onClick={() => reset()}>Cancel slope changes</Button>
      {message && <p role="status">{message}</p>}
    </aside>
  )
}
