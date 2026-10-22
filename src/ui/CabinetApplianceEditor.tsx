import { useState } from 'react'
import type { CarcaseComponent, Scene } from '../scene/types'
import {
  APPLIANCE_CATEGORIES,
  BAY_NUMBERS,
  defaultApplianceBay,
  type ApplianceBay,
} from '../scene/applianceRecipe'
import {
  applianceOpenings,
  applianceSignature,
  copyAppliance,
  previewAppliance,
  resolveAppliance,
  type AppliancePreview,
} from '../scene/applianceBays'
import { ApplianceFitViews } from './ApplianceFitViews'
import { Button } from '@/components/ui/button'
type BayForm = Omit<ApplianceBay, (typeof BAY_NUMBERS)[number]> &
  Record<(typeof BAY_NUMBERS)[number], string>
const formOf = (bay: ApplianceBay): BayForm => ({
  ...bay,
  ...(Object.fromEntries(BAY_NUMBERS.map((k) => [k, String(bay[k])])) as Record<
    (typeof BAY_NUMBERS)[number],
    string
  >),
})
const parse = (bay: BayForm): ApplianceBay => ({
  ...bay,
  ...(Object.fromEntries(
    BAY_NUMBERS.map((k) => [k, bay[k].trim() ? Number(bay[k]) : NaN]),
  ) as Record<(typeof BAY_NUMBERS)[number], number>),
})
const LABELS: Record<(typeof BAY_NUMBERS)[number], string> = {
  width: 'Appliance width',
  height: 'Appliance height',
  depth: 'Appliance depth',
  left: 'Left clearance',
  right: 'Right clearance',
  top: 'Top clearance',
  bottom: 'Bottom clearance',
  rear: 'Rear clearance',
  offset: 'Horizontal offset',
  elevation: 'Mounting elevation',
  recess: 'Front recess (+) or projection (−)',
}
export function CabinetApplianceEditor({
  scene,
  cabinet,
  onApply,
}: {
  scene: Scene
  cabinet: CarcaseComponent
  onApply: (preview: AppliancePreview) => boolean
}) {
  let openings: ReturnType<typeof applianceOpenings> = [],
    openingError = ''
  try {
    openings = applianceOpenings(scene, cabinet.id)
  } catch (e) {
    openingError = e instanceof Error ? e.message : String(e)
  }
  const context = applianceSignature(scene)
  const make = () =>
    formOf(defaultApplianceBay(`bay_${crypto.randomUUID()}`, cabinet.id, openings[0]?.id ?? ''))
  const [base, setBase] = useState(context),
    [form, setForm] = useState(make),
    [preview, setPreview] = useState<AppliancePreview | null>(null),
    [error, setError] = useState(''),
    [source, setSource] = useState(''),
    [applied, setApplied] = useState(false)
  const stale = context !== base
  if (applied && stale) {
    setBase(context)
    setApplied(false)
  }
  const edit = (patch: Partial<BayForm>) => {
    setForm({ ...form, ...patch })
    setPreview(null)
    setError('')
  }
  const load = (bay?: ApplianceBay) => {
    setBase(context)
    setApplied(false)
    setForm(bay ? formOf(bay) : make())
    setPreview(null)
    setError('')
  }
  return (
    <section aria-label="Appliance bays editor" className="space-y-3 text-sm">
      <h2 className="font-medium">Appliance bays</h2>
      <p>
        Enter appliance body dimensions and required installation clearances. Bays reserve space
        without changing cabinet construction. Fit issues remain visible when a valid bay is saved.
      </p>
      {stale && (
        <p role="alert">The scene changed. Reset or reload a saved bay before previewing.</p>
      )}
      {(error || openingError) && <p role="alert">{error || openingError}</p>}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={() => load()}>
          New appliance bay
        </Button>
        <Button size="sm" variant="outline" onClick={() => load()}>
          Reset appliance draft
        </Button>
        <Button size="sm" variant="outline" onClick={() => load()}>
          Cancel appliance changes
        </Button>
      </div>
      <label className="block">
        Bay name
        <input
          aria-label="Bay name"
          value={form.label}
          onChange={(e) => edit({ label: e.target.value })}
          className="border p-1 ml-2"
        />
      </label>
      <label className="block">
        Appliance category
        <select
          aria-label="Appliance category"
          value={form.category}
          onChange={(e) => edit({ category: e.target.value as ApplianceBay['category'] })}
        >
          {APPLIANCE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        Appliance opening
        <select
          aria-label="Appliance opening"
          value={form.openingId}
          onChange={(e) => edit({ openingId: e.target.value })}
        >
          {!openings.some((o) => o.id === form.openingId) && (
            <option value={form.openingId}>Unavailable saved opening</option>
          )}
          {openings.map((o) => (
            <option key={o.id} value={o.id}>
              Opening {o.number}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Horizontal reference
        <select
          aria-label="Horizontal reference"
          value={form.alignment}
          onChange={(e) => edit({ alignment: e.target.value as ApplianceBay['alignment'] })}
        >
          <option value="left">Left</option>
          <option value="centre">Centre</option>
          <option value="right">Right</option>
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {BAY_NUMBERS.map((key) => (
          <label key={key}>
            {LABELS[key]} (mm)
            <input
              aria-label={LABELS[key]}
              type="number"
              value={form[key]}
              onChange={(e) => edit({ [key]: e.target.value })}
              className="border p-1 block"
            />
          </label>
        ))}
      </div>
      <label className="block">
        Copy appliance specifications from
        <select
          aria-label="Copy appliance specifications from"
          value={source}
          onChange={(e) => {
            setSource(e.target.value)
            setPreview(null)
          }}
        >
          <option value="">Choose saved bay</option>
          {(scene.applianceBays ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        variant="outline"
        disabled={stale || !source}
        onClick={() => {
          try {
            edit(formOf(copyAppliance(scene, source, parse(form))))
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        }}
      >
        Copy appliance specifications
      </Button>
      <Button
        size="sm"
        disabled={stale || !!openingError || !openings.length}
        onClick={() => {
          setError('')
          setPreview(previewAppliance(scene, parse(form)))
        }}
      >
        Preview appliance bay
      </Button>
      {preview && (
        <section aria-label="Appliance bay preview" className="space-y-2">
          {preview.errors.map((e) => (
            <p key={e} role="alert">
              {e}
            </p>
          ))}
          {preview.action === 'delete' ? (
            <p>Remove {preview.bay.label}. Associated service references will need reassignment.</p>
          ) : (
            preview.resolved && (
              <>
                <p>
                  {preview.resolved.issues.length
                    ? 'Needs fit review'
                    : 'Fits the assessed stock envelopes'}
                </p>
                {preview.resolved.required && preview.resolved.available && (
                  <table aria-label="Appliance opening fit">
                    <thead>
                      <tr>
                        <th>Dimension</th>
                        <th>Available mm</th>
                        <th>Required mm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['x', 'z', 'y'] as const).map((a, i) => (
                        <tr key={a}>
                          <td>{['Width', 'Height', 'Depth'][i]}</td>
                          <td>{preview.resolved!.available![a].toFixed(1)}</td>
                          <td>{preview.resolved!.required![a].toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <ul aria-label="Appliance fit issues">
                  {preview.resolved.issues.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                <ApplianceFitViews scene={scene} cabinet={cabinet} resolved={preview.resolved} />
              </>
            )
          )}
          {!preview.changed && !preview.errors.length && <p>No changes to apply.</p>}
          <Button
            size="sm"
            disabled={stale || !!preview.errors.length || !preview.changed}
            onClick={() => {
              if (onApply(preview)) {
                load()
                setApplied(true)
              } else {
                setPreview(null)
                setError('The appliance proposal could not apply. Reset and preview again.')
              }
            }}
          >
            {preview.action === 'delete' ? 'Remove appliance bay' : 'Save appliance bay'}
          </Button>
        </section>
      )}
      <h3 className="font-medium">Saved appliance bays</h3>
      <ul aria-label="Saved appliance bays">
        {(scene.applianceBays ?? [])
          .filter((b) => b.cabinetId === cabinet.id)
          .map((b) => {
            const resolved = resolveAppliance(scene, b)
            return (
              <li key={b.id} className="border p-2 space-y-1">
                <p>
                  {b.label} · {b.category} · {b.width} × {b.height} × {b.depth} mm
                </p>
                <p>
                  {resolved.errors.length
                    ? resolved.errors.join('; ')
                    : resolved.issues.length
                      ? resolved.issues.join('; ')
                      : 'Fits the assessed stock envelopes'}
                </p>
                <Button size="sm" variant="outline" onClick={() => load(b)}>
                  Edit {b.label}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={stale}
                  onClick={() => setPreview(previewAppliance(scene, b, 'delete'))}
                >
                  Remove {b.label}
                </Button>
              </li>
            )
          })}
      </ul>
      <p>
        Stock-envelope checks use conservative bounds and do not subtract existing holes. Confirm
        supplier installation, ventilation and access requirements.
      </p>
    </section>
  )
}
