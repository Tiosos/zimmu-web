import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MaterialDef, Scene } from '../scene/types'
import type { ProjectStructure } from '../scene/projectStructure'
import { roomComponentIds } from '../scene/projectStructure'
import { stockPlanError, type StockOption, type StockPlan } from '../scene/stockPlanRecipe'
import {
  defaultStockPlan,
  previewStockPlan,
  stockRecords,
  stockSignature,
  type StockPreview,
} from '../scene/stockPlanning'
import { manufacturingLabels } from '../scene/manufacturingLabels'
import { buildStockCsv, buildStockSheetSvg } from './buildStockExports'
import { downloadBlob } from './download'
const numeric = (s: string) => (s.trim() ? Number(s) : NaN)
export function StockWorkspace({
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
  onApply: (p: StockPreview, action: 'save' | 'consume', remnantIds: string[]) => boolean
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const signature = stockSignature(scene, project, materials),
    [base, setBase] = useState(signature),
    [draft, setDraft] = useState<StockPlan>(() =>
      structuredClone(scene.stockPlan ?? defaultStockPlan(materials, clearance)),
    ),
    [preview, setPreview] = useState<StockPreview | null>(null),
    [roomId, setRoomId] = useState(''),
    [remnants, setRemnants] = useState<string[]>([]),
    [message, setMessage] = useState('')
  const stale = base !== signature,
    rooms = project.areas.flatMap((a) => a.rooms),
    room = rooms.find((r) => r.id === roomId),
    roomIds = room
      ? roomComponentIds(
          room.items.flatMap((i) => i.rootComponentIds),
          scene,
        )
      : null,
    cabinets = scene.components.filter(
      (c) => c.kind === 'carcase' && (!roomIds || roomIds.has(c.id)),
    ),
    error = stockPlanError(draft),
    result = !stale ? preview?.result : null
  const records = useMemo(() => stockRecords(scene, materials, draft), [scene, materials, draft]),
    labels = manufacturingLabels(records),
    label = (id: string) => labels.get(id)?.text ?? id
  const demand = [...new Set(records.map((p) => p.material))]
    .sort()
    .map((material) => ({ material, count: records.filter((p) => p.material === material).length }))
  const patch = (change: Partial<StockPlan>) => {
    setDraft((d) => ({ ...d, ...change }))
    setPreview(null)
    setRemnants([])
    setMessage('')
  }
  const stockPatch = (id: string, change: Partial<StockOption>) =>
    patch({ stocks: draft.stocks.map((s) => (s.id === id ? { ...s, ...change } : s)) })
  const reset = () => {
    setDraft(structuredClone(scene.stockPlan ?? defaultStockPlan(materials, clearance)))
    setBase(signature)
    setPreview(null)
    setRemnants([])
    setMessage('')
  }
  const addStock = (kind: StockOption['kind']) => {
    const material =
        Object.keys(materials).find((m) => materials[m].thickness && materials[m].use !== 'edge') ??
        'Panel',
      def = materials[material]
    patch({
      stocks: [
        ...draft.stocks,
        {
          id: `stock_${crypto.randomUUID()}`,
          name: kind === 'offcut' ? 'New offcut' : 'New sheet',
          kind,
          material,
          thickness: def?.thickness ?? 18,
          length: kind === 'offcut' ? 600 : (def?.sheet?.length ?? 2440),
          width: kind === 'offcut' ? 400 : (def?.sheet?.width ?? 1220),
          grain: def?.hasGrain === false ? 'none' : 'length',
          quantity: kind === 'offcut' ? 1 : null,
          price: kind === 'offcut' ? 0 : (def?.sheet?.costPerSheet ?? null),
          trim: 0,
          enabled: true,
          location: '',
        },
      ],
    })
  }
  const apply = (action: 'save' | 'consume') => {
    if (preview && onApply(preview, action, remnants)) {
      setMessage(
        action === 'save'
          ? 'Stock settings saved. Reload to continue.'
          : 'Stock consumed and selected remnants saved. Reload before another job.',
      )
      setPreview(null)
    } else setMessage('The source changed or the request is invalid. Reload and preview again.')
  }
  const dimension = (key: 'clearance' | 'minLength' | 'minWidth', name: string) => (
    <label className="block" key={key}>
      {name} (mm)
      <input
        aria-label={name}
        type="number"
        step="any"
        value={Number.isFinite(draft[key]) ? draft[key] : ''}
        onChange={(e) => patch({ [key]: numeric(e.target.value) })}
      />
    </label>
  )
  return (
    <aside
      aria-label="Stock optimisation workspace"
      className="absolute right-3 top-14 z-40 w-[720px] max-w-[95vw] max-h-[85vh] overflow-y-auto bg-card text-foreground border rounded p-4 shadow-xl space-y-3"
    >
      <div className="flex justify-between">
        <h2 className="font-semibold">Sheet Stock &amp; Offcut Optimisation</h2>
        <Button onClick={onClose}>Close stock optimisation</Button>
      </div>
      <p className="text-xs">
        Project-local inventory. Deterministic rectangular estimates reserve shaped-panel bounds and
        matched blanks. These layouts do not verify saw sequences or CNC machining. Previewing and
        exporting never consume stock.
      </p>
      <div className="flex gap-2">
        <Button disabled={!canUndo} onClick={onUndo}>
          Undo stock change
        </Button>
        <Button disabled={!canRedo} onClick={onRedo}>
          Redo stock change
        </Button>
        <Button onClick={reset}>Reload stock settings</Button>
      </div>
      {stale && (
        <p role="alert">
          The scene, project or material stock changed. Reload before editing, exporting or
          applying.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={stale} className="space-y-3">
        <legend>Inventory and job settings</legend>
        <label className="block">
          Room filter
          <select
            aria-label="Stock room filter"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs">
          Filtering does not discard selected cabinets. An empty cabinet selection includes all
          boards, including manual parts.
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() =>
              patch({
                cabinetIds: [...new Set([...draft.cabinetIds, ...cabinets.map((c) => c.id)])],
              })
            }
          >
            Add visible cabinets
          </Button>
          <Button onClick={() => patch({ cabinetIds: [] })}>Use all boards</Button>
        </div>
        {cabinets.map((c) => (
          <label className="block" key={c.id}>
            <input
              type="checkbox"
              aria-label={`Include cabinet ${c.label}`}
              checked={draft.cabinetIds.includes(c.id)}
              onChange={(e) =>
                patch({
                  cabinetIds: e.target.checked
                    ? [...draft.cabinetIds, c.id]
                    : draft.cabinetIds.filter((id) => id !== c.id),
                })
              }
            />
            {c.label}
          </label>
        ))}
        {draft.cabinetIds.map((id) => (
          <div key={id}>
            {scene.components.find((c) => c.id === id)?.label ?? `Missing cabinet ${id}`}{' '}
            <Button onClick={() => patch({ cabinetIds: draft.cabinetIds.filter((x) => x !== id) })}>
              Remove cabinet {id}
            </Button>
          </div>
        ))}
        <section aria-label="Panel demand">
          <h3>Required panels</h3>
          {demand.map((d) => (
            <p key={d.material}>
              {d.material}: {d.count} panels
            </p>
          ))}
          <p>{records.length} total panels</p>
        </section>
        <div className="flex gap-2">
          <Button disabled={draft.stocks.length >= 100} onClick={() => addStock('sheet')}>
            Add sheet stock
          </Button>
          <Button disabled={draft.stocks.length >= 100} onClick={() => addStock('offcut')}>
            Add reusable offcut
          </Button>
        </div>
        {draft.stocks.map((s) => (
          <details key={s.id} className="border rounded p-2">
            <summary>
              {s.name} · {s.kind} · {s.length} × {s.width} × {s.thickness} mm ·{' '}
              {s.quantity ?? 'Unlimited'} available{s.enabled ? '' : ' · Disabled'}
            </summary>
            <div className="space-y-2 mt-2" role="group" aria-label={`Stock ${s.id}`}>
              <p className="text-xs">ID: {s.id}</p>
              <label className="block">
                Name
                <input
                  aria-label={`Stock name ${s.id}`}
                  value={s.name}
                  onChange={(e) => stockPatch(s.id, { name: e.target.value })}
                />
              </label>
              <label className="block">
                Material
                <input
                  aria-label={`Stock material ${s.id}`}
                  list="stock-materials"
                  value={s.material}
                  onChange={(e) => stockPatch(s.id, { material: e.target.value })}
                />
              </label>
              {(['length', 'width', 'thickness', 'trim'] as const).map((key) => (
                <label className="block" key={key}>
                  {key} (mm)
                  <input
                    aria-label={`Stock ${key} ${s.id}`}
                    type="number"
                    step="any"
                    value={Number.isFinite(s[key]) ? s[key] : ''}
                    onChange={(e) => stockPatch(s.id, { [key]: numeric(e.target.value) })}
                  />
                </label>
              ))}
              <label className="block">
                Grain
                <select
                  aria-label={`Stock grain ${s.id}`}
                  value={s.grain}
                  onChange={(e) =>
                    stockPatch(s.id, { grain: e.target.value as StockOption['grain'] })
                  }
                >
                  <option value="length">Along length</option>
                  <option value="width">Along width</option>
                  <option value="none">No grain</option>
                </select>
              </label>
              <label className="block">
                Quantity (blank = unlimited sheets)
                <input
                  aria-label={`Stock quantity ${s.id}`}
                  type="number"
                  step="1"
                  value={s.quantity === null ? '' : Number.isFinite(s.quantity) ? s.quantity : ''}
                  onChange={(e) =>
                    stockPatch(s.id, {
                      quantity: e.target.value.trim() ? numeric(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="block">
                Price per sheet (blank = unknown)
                <input
                  aria-label={`Stock price ${s.id}`}
                  type="number"
                  step="any"
                  value={s.price === null ? '' : Number.isFinite(s.price) ? s.price : ''}
                  onChange={(e) =>
                    stockPatch(s.id, {
                      price: e.target.value.trim() ? numeric(e.target.value) : null,
                    })
                  }
                />
              </label>
              <label className="block">
                Storage location
                <input
                  aria-label={`Stock location ${s.id}`}
                  value={s.location}
                  onChange={(e) => stockPatch(s.id, { location: e.target.value })}
                />
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  aria-label={`Stock enabled ${s.id}`}
                  checked={s.enabled}
                  onChange={(e) => stockPatch(s.id, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <Button onClick={() => patch({ stocks: draft.stocks.filter((x) => x.id !== s.id) })}>
                Remove stock {s.id}
              </Button>
            </div>
          </details>
        ))}
        <datalist id="stock-materials">
          {Object.keys(materials).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <label className="block">
          Strategy
          <select
            aria-label="Stock strategy"
            value={draft.strategy}
            onChange={(e) => patch({ strategy: e.target.value as StockPlan['strategy'] })}
          >
            <option value="fewer-sheets">Fewer sheets</option>
            <option value="lower-cost">Lower purchase cost</option>
            <option value="offcut-first">Offcuts first</option>
          </select>
        </label>
        <label className="block">
          <input
            type="checkbox"
            aria-label="Use available offcuts"
            checked={draft.useOffcuts}
            onChange={(e) => patch({ useOffcuts: e.target.checked })}
          />
          Use available offcuts
        </label>
        {dimension('clearance', 'Stock tool clearance')}
        {dimension('minLength', 'Minimum remnant length')}
        {dimension('minWidth', 'Minimum remnant width')}
        {error && <p role="alert">{error}</p>}
        <Button
          disabled={!!error}
          onClick={() => {
            setPreview(previewStockPlan(scene, project, materials, draft))
            setRemnants([])
            setMessage('')
          }}
        >
          Preview stock optimisation
        </Button>
        {!stale &&
          preview?.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
        {result && (
          <section aria-label="Stock optimisation preview" className="space-y-3">
            <h3>Strategy comparison</h3>
            {preview?.baselineIssue && (
              <p role="status">Single-size baseline unavailable: {preview.baselineIssue}</p>
            )}
            <p className="text-xs">
              Heuristics, not guaranteed global optima. Lower cost compares immediate known purchase
              cost per packed area; offcuts have zero new purchase cost. Missing prices are shown
              separately.
            </p>
            <table className="text-xs w-full">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Sheets</th>
                  <th>Unplaced</th>
                  <th>Known purchase cost</th>
                  <th>Unknown-price sheets</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...(preview!.baseline
                    ? [{ ...preview!.baseline, strategy: 'Single-size baseline' }]
                    : []),
                  ...preview!.comparisons,
                ].map((r) => (
                  <tr key={r.strategy}>
                    <td>{r.strategy}</td>
                    <td>{r.sheets.length}</td>
                    <td>{r.unplaced.length}</td>
                    <td>{r.cost.toFixed(2)}</td>
                    <td>{r.unknownPrices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              {result.sheets.length} sheets ·{' '}
              {result.counts.filter((c) => c.kind === 'sheet').reduce((a, c) => a + c.count, 0)}{' '}
              purchased ·{' '}
              {result.counts.filter((c) => c.kind === 'offcut').reduce((a, c) => a + c.count, 0)}{' '}
              offcuts used
            </p>
            <p>
              Known purchase cost: {result.cost.toFixed(2)} · Unknown-price sheets:{' '}
              {result.unknownPrices}
            </p>
            <p>
              Utilisation:{' '}
              {result.area ? (((result.area - result.waste) / result.area) * 100).toFixed(2) : '0'}%
              · Reserved waste: {(result.waste / 1000000).toFixed(3)} m²
            </p>
            {result.counts.map((c) => (
              <p key={c.stockId}>
                {c.name} ({c.stockId}): use {c.count}; remaining {c.remaining ?? 'Unlimited'}; cost{' '}
                {c.cost?.toFixed(2) ?? 'Unknown'}
              </p>
            ))}
            {result.unplaced.map((p) => (
              <p role="alert" key={p.id}>
                {label(p.id)}: {p.reason}
              </p>
            ))}
            <p className="text-xs">
              Green dashed boundaries show usable stock after trim; green filled rectangles are
              proposed reusable remnants. Purple outlines preserve matched groups. Coordinates are
              sheet-local X right, Y up.
            </p>
            {result.sheets.map((s, i) => (
              <div key={i}>
                <h4>
                  Sheet {i + 1}: {s.stock.name} · {s.stock.id} · {s.stock.material} ·{' '}
                  {s.stock.length} × {s.stock.width} mm
                </h4>
                <div dangerouslySetInnerHTML={{ __html: buildStockSheetSvg(result, i, label) }} />
                <Button
                  onClick={() =>
                    downloadBlob(
                      buildStockSheetSvg(result, i, label),
                      `stock-sheet-${i + 1}.svg`,
                      'image/svg+xml',
                    )
                  }
                >
                  Export stock sheet {i + 1}
                </Button>
              </div>
            ))}
            <h3>Proposed remnants</h3>
            <p className="text-xs">
              Rectangular free regions exclude trim and reserved tool clearance. Select only
              remnants you intend to retain; physical cutting and condition still need workshop
              review.
            </p>
            {result.remnants.map((r) => (
              <label className="block" key={r.id}>
                <input
                  type="checkbox"
                  aria-label={`Keep remnant ${r.id}`}
                  checked={remnants.includes(r.id)}
                  onChange={(e) =>
                    setRemnants(
                      e.target.checked ? [...remnants, r.id] : remnants.filter((id) => id !== r.id),
                    )
                  }
                />
                Sheet {r.sheet + 1}: {r.w.toFixed(2)} × {r.h.toFixed(2)} mm at {r.x.toFixed(2)},{' '}
                {r.y.toFixed(2)}
              </label>
            ))}
            <Button
              onClick={() =>
                downloadBlob(buildStockCsv(result, label), 'stock-allocation.csv', 'text/csv')
              }
            >
              Export stock allocation and purchase list
            </Button>
            <Button
              disabled={JSON.stringify(scene.stockPlan) === JSON.stringify(draft)}
              onClick={() => apply('save')}
            >
              Save stock settings
            </Button>
            <p className="text-xs">
              Consume updates finite quantities and adds only selected remnants in one undo step. It
              does not reserve stock in other projects or mark these panels as manufactured.
            </p>
            <Button
              disabled={
                !!result.unplaced.length ||
                !result.sheets.length ||
                draft.stocks.length + remnants.length > 100
              }
              onClick={() => apply('consume')}
            >
              Consume stock and save selected remnants
            </Button>
          </section>
        )}
      </fieldset>
    </aside>
  )
}
