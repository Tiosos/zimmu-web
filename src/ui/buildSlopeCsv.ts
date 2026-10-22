import type { ManufacturingPart } from '../scene/manufacturingPart'
const quote = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
export function buildSlopeCsv(records: ManufacturingPart[]): string {
  const rows: (string | number)[][] = [
    [
      'Cabinet ID',
      'Part ID',
      'Part',
      'Material',
      'Blank length mm',
      'Blank width mm',
      'Thickness mm',
      'End',
      'Profile / bevel',
      'Angle degrees',
      'Long edge',
      'Review',
    ],
  ]
  for (const p of records)
    if (p.kind === 'board')
      for (const c of p.cuts)
        if (c.kind === 'mitre' && c.sourceComponentId)
          rows.push([
            p.provenance.cabinetId ?? '',
            p.id,
            p.label,
            p.material,
            p.nesting.length,
            p.nesting.width,
            p.nesting.thickness,
            c.end,
            c.axis === 'Z' ? 'Flat profile' : 'Through-thickness bevel',
            c.angle,
            c.flip ? 'Opposite edge' : 'Transverse zero',
            'Joinery and shaped-edge treatment require workshop design',
          ])
  return rows.map((r) => r.map(quote).join(',')).join('\n') + '\n'
}
