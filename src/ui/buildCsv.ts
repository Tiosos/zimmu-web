import type { Part } from '../scene/types'

export interface GroupedRow {
  key: string
  qty: number
  labels: string
  material: string
  color: string
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
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}|${p.color}`
    const existing = map.get(key)
    if (existing) {
      existing.qty += 1
      existing.labels += `, ${p.label}`
      existing.cuts += p.cuts.length
    } else {
      order.push(key)
      map.set(key, {
        key,
        qty: 1,
        labels: p.label,
        material: p.material,
        color: p.color,
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
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildCsv(parts: Part[]): string {
  const header = 'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts'
  const rows = groupParts(parts).map((row) => {
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.length},${row.width},${row.thickness},${row.cuts}`
  })
  return [header, ...rows].join('\n')
}
