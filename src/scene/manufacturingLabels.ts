import type { ManufacturingPart } from './manufacturingPart'

export interface ManufacturingLabel {
  id: string
  cabinetId: string | null
  text: string
  detail: string
}

// Identity is never inferred from the text: two cabinets can use the same part label.
export function manufacturingLabels(records: ManufacturingPart[]): Map<string, ManufacturingLabel> {
  return new Map(
    records.map((p) => {
      const owner = p.provenance.cabinetLabel ?? 'Unassigned'
      const size =
        p.kind === 'board'
          ? `Finished ${p.finished.length} × ${p.finished.width} × ${p.finished.thickness} mm; Cut ${p.cut.length} × ${p.cut.width} × ${p.cut.thickness} mm; Grain ${p.bomGrain}; Edges ${p.edgeCode || 'none'}${p.cut.problem ? `; ${p.cut.problem}` : ''}`
          : `Round stock ${p.diameter} × ${p.length} mm`
      return [
        p.id,
        {
          id: p.id,
          cabinetId: p.provenance.cabinetId,
          text: p.label,
          detail: `${owner}; Cabinet ID ${p.provenance.cabinetId ?? 'none'}; Part ID ${p.id}; ${p.label}; ${p.material}; ${size}`,
        },
      ]
    }),
  )
}
