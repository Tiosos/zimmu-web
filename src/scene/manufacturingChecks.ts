import type { ManufacturingPart } from './manufacturingPart'
import { isNestable } from './manufacturingPart'

export type ManufacturingCheckCode =
  | 'stock-unresolved'
  | 'stock-thickness'
  | 'stock-use'
  | 'sheet-size'
  | 'part-size'
  | 'thickness-mismatch'
  | 'edge-stock'
  | 'cut-size'
  | 'label-empty'
  | 'label-duplicate'
export interface ManufacturingFinding {
  reference: string
  code: ManufacturingCheckCode
  message: string
  targets: { id: string; label: string; cabinetId: string | null; parentId: string | null }[]
}
const positive = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0

// Physical checks use only captured records. Rates, visibility and world placement are irrelevant.
export function manufacturingChecks(records: ManufacturingPart[]) {
  const findings: ManufacturingFinding[] = []
  const add = (code: ManufacturingCheckCode, message: string, parts: ManufacturingPart[]) => {
    findings.push({
      reference: `M${findings.length + 1}`,
      code,
      message,
      targets: parts.map((p) => ({
        id: p.id,
        label: p.label,
        cabinetId: p.provenance.cabinetId,
        parentId: p.provenance.parentId,
      })),
    })
  }
  const labels = new Map<string, ManufacturingPart[]>()
  for (const p of records) {
    const label = p.label.trim()
    if (!label) add('label-empty', 'Part label is empty; use the part ID to identify it.', [p])
    else {
      const owner =
        p.provenance.cabinetId !== null
          ? ['cabinet', p.provenance.cabinetId]
          : p.provenance.parentId !== null
            ? ['assembly', p.provenance.parentId]
            : ['loose']
      const key = JSON.stringify([owner, label])
      const group = labels.get(key)
      if (group) group.push(p)
      else labels.set(key, [p])
    }
    if (!p.material.trim() || !p.stock.resolved)
      add('stock-unresolved', `Material "${p.material}" is unresolved.`, [p])
    if (p.stock.use === 'edge') add('stock-use', 'Part material is designated as edge stock.', [p])
    if (p.stock.sheet !== null && !isNestable(p.stock))
      add('sheet-size', 'Defined sheet stock requires finite positive length and width.', [p])
    if (p.kind === 'cylinder') {
      if (!positive(p.length) || !positive(p.diameter))
        add('part-size', 'Round stock requires finite positive length and diameter.', [p])
      continue
    }
    if (!positive(p.stock.thickness))
      add('stock-thickness', 'Board stock thickness is missing or not finite and positive.', [p])
    if (!Object.values(p.local).every(positive))
      add('part-size', 'Board dimensions must be finite and positive.', [p])
    const override = p.provenance.partOverrides?.thickness
    const expected = positive(override) ? override : p.stock.thickness
    if (
      positive(expected) &&
      positive(p.local.thickness) &&
      Math.abs(expected - p.local.thickness) > 1e-6
    )
      add(
        'thickness-mismatch',
        `Board thickness ${p.local.thickness} mm differs from expected ${expected} mm.`,
        [p],
      )
    for (const edge of p.requestedEdgeStock)
      if (!edge.stock.resolved || edge.stock.use !== 'edge' || !positive(edge.stock.thickness))
        add(
          'edge-stock',
          `Requested edge material "${edge.material}" requires resolved edge stock with finite positive thickness.`,
          [p],
        )
    if (p.cut.problem || ![p.cut.length, p.cut.width, p.cut.thickness].every(positive))
      add('cut-size', p.cut.problem ?? 'Cut dimensions must be finite and positive.', [p])
  }
  for (const group of labels.values())
    if (group.length > 1)
      add(
        'label-duplicate',
        `Label "${group[0].label.trim()}" is repeated in the same cabinet, assembly or loose-part group. Part IDs remain authoritative.`,
        group,
      )
  return {
    schemaVersion: 1 as const,
    checkedParts: records.length,
    findings,
    unassessed: [
      'Drilling geometry',
      'Machine operation compatibility',
      'Hardware suitability',
      'Physical installation',
    ],
  }
}
