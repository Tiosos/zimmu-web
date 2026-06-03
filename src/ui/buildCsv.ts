import type { Part } from '../scene/types'

export interface GroupedRow {
  qty: number
  labels: string
  material: string
  length: number
  width: number
  thickness: number
  cuts: number
}

export function groupParts(parts: Part[]): GroupedRow[] {
  const order: string[] = []
  const map = new Map<string, GroupedRow>()

  for (const p of parts) {
    if (p.kind !== 'board') continue
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}`
    const existing = map.get(key)
    if (existing) {
      existing.qty += 1
      existing.labels += `, ${p.label}`
      existing.cuts += p.cuts.length
    } else {
      order.push(key)
      map.set(key, {
        qty: 1,
        labels: p.label,
        material: p.material,
        length: p.length,
        width: p.width,
        thickness: p.thickness,
        cuts: p.cuts.length,
      })
    }
  }

  return order.map((k) => map.get(k)!)
}

function quoteField(value: string): string {
  if (value.includes(',') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildCsv(parts: Part[]): string {
  const header = 'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts'
  const rows = groupParts(parts).map((row) => {
    return `${row.qty},${quoteField(row.labels)},${row.material},${row.length},${row.width},${row.thickness},${row.cuts}`
  })
  return [header, ...rows].join('\n')
}
