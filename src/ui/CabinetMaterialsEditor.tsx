import { useState } from 'react'
import type { CarcaseComponent, EdgeKey, Grain, Scene } from '../scene/types'
import { componentsById } from '../scene/componentTree'
import { EDGE_KEYS, cutSizeOf, edgesOf } from '../scene/edgeBanding'
import { finishingMaterials } from '../scene/finishingPanels'
import {
  materialsSignature,
  cabinetEdgeLabel,
  cabinetEdgeDirection,
  copyBoardTreatments,
  materialTargets,
  previewMaterials,
  stageEdges,
  stageMaterials,
  type MaterialsDraft,
  type MaterialsPreview,
} from '../scene/cabinetMaterials'
import { Button } from '@/components/ui/button'

function stagedDescription(treatment: MaterialsDraft[string]): string {
  const grain =
    treatment.grain === null
      ? 'inherited'
      : treatment.grain === 'free'
        ? 'no direction'
        : `along ${treatment.grain}`
  return [
    treatment.material !== undefined ? `Material: ${treatment.material ?? 'inherited'}` : null,
    treatment.grain !== undefined ? `Grain: ${grain}` : null,
    ...Object.entries(treatment.edges ?? {}).map(
      ([key, value]) =>
        `${key}: ${value === null ? 'bare' : typeof value === 'object' ? 'inherited' : value}`,
    ),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function CabinetMaterialsEditor({
  cabinet,
  scene,
  mode,
  onApply,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  mode: 'materials' | 'edges'
  onApply: (preview: MaterialsPreview) => boolean
}) {
  const [base, setBase] = useState(() => materialsSignature(scene))
  const [applied, setApplied] = useState(false)
  const [draft, setDraft] = useState<MaterialsDraft>({})
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState(''),
    [family, setFamily] = useState(''),
    [opening, setOpening] = useState('')
  const [material, setMaterial] = useState(''),
    [grain, setGrain] = useState<Grain>('length')
  const [edgeStock, setEdgeStock] = useState(''),
    [edgeKeys, setEdgeKeys] = useState<EdgeKey[]>(['y0']),
    [direction, setDirection] = useState('front')
  const [preserve, setPreserve] = useState(true),
    [source, setSource] = useState('')
  const [preview, setPreview] = useState<MaterialsPreview | null>(null),
    [error, setError] = useState('')
  const stale = base !== materialsSignature(scene),
    title = mode === 'materials' ? 'Materials' : 'Edgebanding'
  if (applied && stale) {
    setBase(materialsSignature(scene))
    setApplied(false)
  }
  let targets: ReturnType<typeof materialTargets> = [],
    targetError = ''
  try {
    targets = materialTargets(scene, cabinet.id)
  } catch (e) {
    targetError = e instanceof Error ? e.message : String(e)
  }
  const shown = targets.filter(
    (t) =>
      (!query || t.board.label.toLowerCase().includes(query.toLowerCase())) &&
      (!filter || t.board.material === filter) &&
      (!family || t.family === family) &&
      (!opening || t.opening === opening),
  )
  const focus = targets.find((t) => selected.includes(t.board.id))
  const byId = componentsById(scene.components)
  const edgeMaterials = Object.entries(scene.materials)
    .filter(([, m]) => m.use === 'edge' && Number.isFinite(m.thickness) && m.thickness! > 0)
    .map(([name]) => name)
  const edit = (fn: () => void) => {
    setPreview(null)
    setError('')
    fn()
  }
  const run = (fn: () => MaterialsDraft) => {
    setPreview(null)
    setError('')
    if (stale) {
      setError('The scene changed. Reset the draft before staging again.')
      return
    }
    try {
      setDraft(fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const reset = () => {
    setApplied(false)
    setBase(materialsSignature(scene))
    setDraft({})
    setSelected([])
    setPreview(null)
    setError('')
  }
  const stageEdge = (
    value: string | null,
    inherit = false,
    preset: 'selected' | 'front' | 'perimeter' = 'selected',
  ) =>
    run(() =>
      stageEdges(scene, cabinet.id, draft, selected, edgeKeys, value, inherit, preserve, preset),
    )
  const select = (
    label: string,
    value: string,
    values: string[],
    change: (v: string) => void,
    empty: string,
  ) => (
    <label className="block">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => edit(() => change(e.target.value))}
        className="block border rounded p-1"
      >
        <option value="">{empty}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  )
  const disabled = stale || !!targetError || !selected.length
  return (
    <section aria-label={`${title} editor`} className="space-y-3 text-sm">
      <h2 className="font-medium">Cabinet {title.toLowerCase()}</h2>
      <p>
        {mode === 'materials'
          ? 'Stage materials and grain, then preview the generated boards. Drawer materials apply to the whole box. Independent thickness overrides remain in effect.'
          : 'Stage board-local edges or cabinet-facing presets. Existing explicit decisions are protected by default. Tape width, adhesive and installation suitability require separate assessment.'}
      </p>
      {stale && <p role="alert">The scene changed. Reset the draft to load current boards.</p>}
      {(error || targetError) && <p role="alert">{error || targetError}</p>}
      <label className="block">
        Find boards
        <input
          aria-label="Find boards"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border rounded p-1 ml-2"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        {select(
          'Filter material',
          filter,
          [...new Set(targets.map((t) => t.board.material))].filter(Boolean),
          setFilter,
          'All materials',
        )}
        {select(
          'Filter role',
          family,
          [...new Set(targets.map((t) => t.family))],
          setFamily,
          'All roles',
        )}
        {select(
          'Filter opening',
          opening,
          [...new Set(targets.map((t) => t.opening))],
          setOpening,
          'All openings',
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={stale}
          onClick={() =>
            edit(() => setSelected(shown.filter((t) => !t.locked).map((t) => t.board.id)))
          }
        >
          Select matching boards
        </Button>
        <Button size="sm" variant="outline" onClick={() => edit(() => setSelected([]))}>
          Clear board selection
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Reset {title.toLowerCase()} draft
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel {title.toLowerCase()} changes
        </Button>
      </div>
      <p>
        {selected.length} selected · {Object.keys(draft).length} staged boards
      </p>
      <ul className="space-y-2" aria-label="Cabinet treatment boards">
        {shown.map(({ board: p, family, opening, locked, shared }) => (
          <li key={p.id} className="border rounded p-2">
            <label>
              <input
                type="checkbox"
                aria-label={`Select ${p.label}`}
                checked={selected.includes(p.id)}
                disabled={locked || stale}
                onChange={(e) =>
                  edit(() =>
                    setSelected(
                      e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id),
                    ),
                  )
                }
              />{' '}
              {p.label} · {family} · {opening}
              {shared ? ' · shared run panel' : ''}
              {locked ? ' · detached (locked)' : ''}
            </label>
            <p>
              {p.material || 'Unspecified'} · {p.length} × {p.width} × {p.thickness} mm · stock{' '}
              {scene.materials[p.material]?.thickness ?? 'unspecified'} mm · grain {p.grain}
            </p>
            <p>
              Material:{' '}
              {p.overrides?.material !== undefined
                ? 'override'
                : p.driven
                  ? 'inherited'
                  : 'panel owned'}
              ; grain:{' '}
              {p.overrides?.grain !== undefined
                ? 'override'
                : p.driven
                  ? 'inherited'
                  : 'panel owned'}
              {p.overrides?.thickness !== undefined
                ? `; thickness override ${p.overrides.thickness} mm`
                : ''}
            </p>
            {mode === 'edges' && (
              <p>
                {EDGE_KEYS.map(
                  (k) =>
                    `${k}: ${edgesOf(p, byId, scene.materials)[k] ?? 'bare'} (${p.edgeBanding?.[k] === undefined ? 'inherited' : 'explicit'})`,
                ).join(' · ')}
              </p>
            )}
            {draft[p.id] && (
              <div>
                <p>Staged: {stagedDescription(draft[p.id])}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    edit(() => {
                      const next = { ...draft }
                      delete next[p.id]
                      setDraft(next)
                    })
                  }
                >
                  Discard {p.label} changes
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {mode === 'materials' ? (
        <div className="space-y-2">
          {select(
            'Panel material',
            material,
            finishingMaterials(scene),
            setMaterial,
            'Choose panel stock',
          )}
          <p>Selected stock thickness: {scene.materials[material]?.thickness ?? '—'} mm</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={disabled || !material}
              onClick={() =>
                run(() => stageMaterials(scene, cabinet.id, draft, selected, { material }))
              }
            >
              Stage material
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                run(() => stageMaterials(scene, cabinet.id, draft, selected, { material: null }))
              }
            >
              Restore inherited material
            </Button>
          </div>
          <label>
            Board grain
            <select
              aria-label="Board grain"
              value={grain}
              onChange={(e) => edit(() => setGrain(e.target.value as Grain))}
            >
              <option value="length">Along length</option>
              <option value="width">Along width</option>
              <option value="free">No direction</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={disabled}
              onClick={() =>
                run(() => stageMaterials(scene, cabinet.id, draft, selected, { grain }))
              }
            >
              Stage grain
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                run(() => stageMaterials(scene, cabinet.id, draft, selected, { grain: null }))
              }
            >
              Restore inherited grain
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {select('Edgebanding stock', edgeStock, edgeMaterials, setEdgeStock, 'Choose edge stock')}
          <label className="block">
            <input
              type="checkbox"
              checked={preserve}
              onChange={(e) => edit(() => setPreserve(e.target.checked))}
            />{' '}
            Preserve explicit edge decisions
          </label>
          <fieldset>
            <legend>Board-local edges{focus ? ` — ${focus.board.label}` : ''}</legend>
            {EDGE_KEYS.map((k) => (
              <label key={k} className="block">
                <input
                  type="checkbox"
                  aria-label={`Treat ${k}`}
                  checked={edgeKeys.includes(k)}
                  onChange={(e) =>
                    edit(() =>
                      setEdgeKeys(
                        e.target.checked ? [...edgeKeys, k] : edgeKeys.filter((key) => key !== k),
                      ),
                    )
                  }
                />
                {focus ? cabinetEdgeLabel(scene, cabinet.id, focus.board, k) : k}
              </label>
            ))}
          </fieldset>
          {focus && (
            <svg
              aria-label="Selected board edge preview"
              viewBox="0 0 240 150"
              className="w-64 border bg-white"
              role="img"
            >
              <rect x="30" y="30" width="180" height="90" fill="#ddd" />
              {EDGE_KEYS.map((k) => {
                const points = {
                  x0: [30, 30, 30, 120],
                  x1: [210, 30, 210, 120],
                  y0: [30, 30, 210, 30],
                  y1: [30, 120, 210, 120],
                }[k]
                return (
                  <line
                    key={k}
                    x1={points[0]}
                    y1={points[1]}
                    x2={points[2]}
                    y2={points[3]}
                    stroke={edgeKeys.includes(k) ? '#2563eb' : '#555'}
                    strokeWidth={edgeKeys.includes(k) ? 6 : 2}
                  >
                    <title>{cabinetEdgeLabel(scene, cabinet.id, focus.board, k)}</title>
                  </line>
                )
              })}
              <text x="90" y="80" fontSize="12" fill="black">
                Length →
              </text>
              <text x="35" y="22" fontSize="10" fill="black">
                y0
              </text>
              <text x="35" y="140" fontSize="10" fill="black">
                y1
              </text>
              <text x="5" y="80" fontSize="10" fill="black">
                x0
              </text>
              <text x="215" y="80" fontSize="10" fill="black">
                x1
              </text>
            </svg>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={disabled || !edgeStock}
              onClick={() => stageEdge(edgeStock)}
            >
              Stage selected edges
            </Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => stageEdge(null)}>
              Stage bare edges
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => stageEdge(null, true)}
            >
              Restore inherited edges
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || !edgeStock}
              onClick={() => stageEdge(edgeStock, false, 'front')}
            >
              Stage cabinet-front edges
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || !edgeStock}
              onClick={() => stageEdge(edgeStock, false, 'perimeter')}
            >
              Stage perimeter edges
            </Button>
          </div>
          <label>
            Matching cabinet direction
            <select
              aria-label="Matching cabinet direction"
              value={direction}
              onChange={(e) => edit(() => setDirection(e.target.value))}
            >
              {['front', 'rear', 'left', 'right', 'top', 'bottom'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !edgeStock}
            onClick={() =>
              run(() => {
                let next = draft
                for (const id of selected) {
                  const p = targets.find((t) => t.board.id === id)!.board
                  const keys = EDGE_KEYS.filter(
                    (k) => cabinetEdgeDirection(scene, cabinet.id, p, k) === direction,
                  )
                  next = stageEdges(scene, cabinet.id, next, [id], keys, edgeStock, false, preserve)
                }
                return next
              })
            }
          >
            Stage matching cabinet edges
          </Button>
        </div>
      )}
      <label className="block">
        Copy treatments from
        <select
          aria-label="Copy treatments from"
          value={source}
          onChange={(e) => edit(() => setSource(e.target.value))}
        >
          <option value="">Choose source board</option>
          {targets.map((t) => (
            <option key={t.board.id} value={t.board.id}>
              {t.board.label} · {t.opening}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !source}
        onClick={() =>
          run(() => copyBoardTreatments(scene, cabinet.id, draft, source, selected, mode, preserve))
        }
      >
        Copy {title.toLowerCase()} to selection
      </Button>
      <Button
        size="sm"
        disabled={stale || !!targetError || !Object.keys(draft).length}
        onClick={() => {
          setError('')
          setPreview(previewMaterials(scene, cabinet.id, draft, mode))
        }}
      >
        Preview {title.toLowerCase()}
      </Button>
      {preview && (
        <section aria-label={`${title} preview`} className="space-y-2">
          {preview.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          {!preview.errors.length && !preview.changed && <p>No changes to apply.</p>}
          <p>
            Board quantity: {targets.length} → {preview.rows.length}. Review all generated changes
            before applying.
          </p>
          <table aria-label="Board treatment comparison">
            <thead>
              <tr>
                <th>Board</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => {
                const describe = (p: typeof r.after, s: Scene) => {
                  const edges = edgesOf(p, componentsById(s.components), s.materials),
                    cut = cutSizeOf(p, edges, s.materials)
                  return `${p.material || 'Unspecified'}; ${p.length} × ${p.width} × ${p.thickness} mm; grain ${p.grain}; edges ${EDGE_KEYS.map((k) => `${k}=${edges[k] ?? 'bare'}${edges[k] ? ` (${k.startsWith('x') ? p.width : p.length} mm)` : ''}`).join(', ')}; cut ${cut.length} × ${cut.width} mm`
                }
                return (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{r.before ? describe(r.before, scene) : 'Not generated'}</td>
                    <td>{describe(r.after, preview.scene!)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <table aria-label="Hardware quantity comparison">
            <thead>
              <tr>
                <th>Hardware</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {preview.hardware.map((h) => (
                <tr key={h.key}>
                  <td>{h.key}</td>
                  <td>{h.before}</td>
                  <td>{h.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table aria-label="Edgebanding length totals">
            <thead>
              <tr>
                <th>Stock</th>
                <th>Before mm</th>
                <th>After mm</th>
              </tr>
            </thead>
            <tbody>
              {preview.totals.map((t) => (
                <tr key={t.material}>
                  <td>{t.material}</td>
                  <td>{t.before.toFixed(1)}</td>
                  <td>{t.after.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            size="sm"
            disabled={stale || !!preview.errors.length || !preview.changed}
            onClick={() => {
              if (onApply(preview)) {
                reset()
                setApplied(true)
              } else {
                setPreview(null)
                setError('The proposal could not apply. Reset and preview again.')
              }
            }}
          >
            Apply {title.toLowerCase()}
          </Button>
        </section>
      )}
    </section>
  )
}
