import { useMemo } from 'react'
import type { RulePreview } from '../scene/ruleFlow'
import {
  buildRuleImpact,
  type ImpactPricing,
  type PartFacts,
  type QuantityImpact,
} from './ruleImpact'
const placementLabels: Record<string, string> = {
  parentId: 'Parent assembly',
  localPosition: 'Local position (mm)',
  localRotation: 'Local rotation (degrees)',
  worldPosition: 'World position (mm)',
  worldRotation: 'World rotation (degrees)',
  rotationOrder: 'Rotation order',
}
const money = (n: number) => `$${n.toFixed(2)}`
const quantity = (n: number | null) =>
  n === null ? 'Unavailable' : n.toLocaleString('en-AU', { maximumFractionDigits: 6 })
function Quantities({ label, rows }: { label: string; rows: QuantityImpact[] }) {
  return (
    <details>
      <summary>
        {label}: {rows.length} changed lines
      </summary>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <caption className="sr-only">{label} before and after</caption>
            <thead>
              <tr>
                <th scope="col">Stock or hardware</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
                <th scope="col">Change</th>
                <th scope="col">Unit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <th scope="row" className="font-normal break-all pr-2">
                    {r.name}
                  </th>
                  <td>{quantity(r.before)}</td>
                  <td>{quantity(r.after)}</td>
                  <td>
                    {quantity(r.after === null || r.before === null ? null : r.after - r.before)}
                  </td>
                  <td>{r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No quantity changes.</p>
      )}
    </details>
  )
}
function Facts({ value }: { value?: PartFacts }) {
  if (!value) return <p>Absent</p>
  const stock = JSON.parse(value.stock) as {
    thickness: number | null
    hasGrain: boolean
    sheet: { length: number; width: number } | null
    use: string | null
  }
  const dimensions = (dims: number[]) => `${dims.map(quantity).join(' × ')} mm`
  return (
    <div className="space-y-1 break-all">
      <p>
        {value.label} ({value.kind})
      </p>
      <p>
        Finished: {dimensions(value.finished)}
        {value.kind === 'cylinder' ? ' (length × diameter)' : ' (BOM length × width × thickness)'}
      </p>
      <p>
        Cut: {dimensions(value.cut)}
        {value.kind === 'board' && ' (BOM length × width × thickness)'}
      </p>
      <p>
        Part-local size: {dimensions(value.localDimensions)}
        {value.kind === 'board' ? ' (X length × Y width × Z thickness)' : ' (length × diameter)'}
      </p>
      <p>Colour: {value.color}</p>
      <p>Material: {value.material || 'Unspecified'}</p>
      <p>
        Stock properties: thickness{' '}
        {stock.thickness === null ? 'unspecified' : `${quantity(stock.thickness)} mm`}; grain{' '}
        {stock.hasGrain ? 'constrained' : 'unconstrained'}; sheet{' '}
        {stock.sheet ? dimensions([stock.sheet.length, stock.sheet.width]) : 'not specified'}; use{' '}
        {stock.use ?? 'standard stock'}.
      </p>
      {value.kind === 'board' && (
        <>
          <p>
            Part-local grain: {value.grain}. BOM grain: {value.grain === 'free' ? 'free' : 'length'}
            .
          </p>
          <p>
            Edges (part-local axes):{' '}
            {Object.entries(JSON.parse(value.edges) as Record<string, string | null>)
              .map(([edge, stock]) => `${edge}: ${stock ?? 'bare'}`)
              .join('; ')}
          </p>
        </>
      )}
      {value.problem && <p className="text-destructive">{value.problem}</p>}
      <p>Machining: {value.machiningDetails.length} definitions (part-local axes)</p>
      <ul className="list-disc pl-4">
        {value.machiningDetails.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p>Manual instructions: {value.instructionDetails.length}</p>
      <ul className="list-disc pl-4">
        {value.instructionDetails.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p>
        Assembly placement:{' '}
        {Object.entries(JSON.parse(value.placement) as Record<string, unknown>)
          .map(
            ([key, v]) =>
              `${placementLabels[key] ?? key}: ${
                v && typeof v === 'object'
                  ? Object.entries(v)
                      .map(([axis, n]) => `${axis} ${String(n)}`)
                      .join(', ')
                  : String(v ?? 'none')
              }`,
          )
          .join('; ')}
      </p>
    </div>
  )
}
export function RuleImpactDetails({
  preview,
  library,
  hardwareLibrary,
}: { preview: RulePreview } & ImpactPricing) {
  const impact = useMemo(
    () => buildRuleImpact(preview, { library, hardwareLibrary }),
    [preview, library, hardwareLibrary],
  )
  if (!impact) return null
  return (
    <section
      aria-label="Update manufacturing impact"
      className="space-y-2 mt-2 border-t border-border pt-2"
    >
      <p>
        {impact.parts.filter((p) => p.status === 'added').length} parts added;{' '}
        {impact.parts.filter((p) => p.status === 'removed').length} removed;{' '}
        {impact.parts.filter((p) => p.status === 'changed').length} changed in manufacturing or
        assembly.
      </p>
      <details>
        <summary>Part and operation changes ({impact.parts.length})</summary>
        {impact.parts.length === 0 && <p>No part changes.</p>}
        {impact.parts.map((p) => (
          <details key={p.id} className="border-t border-border py-1">
            <summary>
              {p.after?.label ?? p.before?.label}: {p.status}
              {p.fields.length ? ` — ${p.fields.join(', ')}` : ''}
            </summary>
            <p className="break-all">Part ID: {p.id}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <h4 className="font-medium">Before</h4>
                <Facts value={p.before} />
              </div>
              <div>
                <h4 className="font-medium">After</h4>
                <Facts value={p.after} />
              </div>
            </div>
          </details>
        ))}
      </details>
      <Quantities label="Material quantities" rows={impact.materials} />
      <Quantities label="Hardware quantities" rows={impact.hardware} />
      <p>
        Estimated purchased material and hardware:{' '}
        {impact.beforeCost.total === null
          ? `${money(impact.beforeCost.known)} known subtotal (incomplete)`
          : money(impact.beforeCost.total)}{' '}
        →{' '}
        {impact.afterCost.total === null
          ? `${money(impact.afterCost.known)} known subtotal (incomplete)`
          : money(impact.afterCost.total)}
        .
      </p>
      <p>
        {impact.costDelta === null
          ? 'Total cost change unavailable until both estimates are complete.'
          : `Estimated cost change: ${money(impact.costDelta)}.`}
      </p>
      {!!(impact.beforeCost.issues.length + impact.afterCost.issues.length) && (
        <details>
          <summary>Missing rates or unusable quantities</summary>
          <h4>Before</h4>
          <ul className="list-disc pl-4 break-all">
            {impact.beforeCost.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <h4>After</h4>
          <ul className="list-disc pl-4 break-all">
            {impact.afterCost.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-muted-foreground">
        Whole-project comparison using current BOM library rates and saved project rates. Both sides
        use the same current library. Board quantities are cut area; round stock and edge band are
        lengths. Estimates exclude labour, waste, sheet purchasing, markup and tax. Review drawings
        and production readiness separately.
      </p>
    </section>
  )
}
