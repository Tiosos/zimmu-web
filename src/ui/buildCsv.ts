import type { HardwareItem, MaterialDef, Part } from '../scene/types'

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
  costPerUnit: number | null // null = no rate set for this material
  totalCost: number | null // null = no rate set; equals costPerUnit * qty
}

export function groupParts(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
): GroupedRow[] {
  const order: string[] = []
  const map = new Map<string, GroupedRow>()

  for (const p of parts) {
    if (p.kind !== 'board') continue
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}|${p.color}`
    const rate = materials[p.material]
    const costPerUnit =
      rate !== undefined ? ((p.length * p.width) / 1_000_000) * rate.costPerM2 : null
    const existing = map.get(key)
    if (existing) {
      existing.qty += 1
      existing.labels += `, ${p.label}`
      existing.cuts += p.cuts.length
      existing.totalCost =
        existing.costPerUnit !== null ? existing.costPerUnit * existing.qty : null
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
        costPerUnit,
        totalCost: costPerUnit,
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

export function buildCsv(parts: Part[], materials: Record<string, MaterialDef> = {}): string {
  const header =
    'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts,Cost/unit,Total'
  const rows = groupParts(parts, materials)
  const dataRows = rows.map((row) => {
    const costStr = row.costPerUnit !== null ? row.costPerUnit.toFixed(2) : ''
    const totalStr = row.totalCost !== null ? row.totalCost.toFixed(2) : ''
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.length},${row.width},${row.thickness},${row.cuts},${costStr},${totalStr}`
  })

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  if (!anyHasCost) return [header, ...dataRows].join('\n')

  const boardTotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const subtotalRow = `,,,,,,,,Board total,${boardTotal.toFixed(2)}`
  return [header, ...dataRows, subtotalRow].join('\n')
}

export function buildHardwareCsv(items: HardwareItem[]): string {
  const header = 'Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes'
  if (items.length === 0) return header

  const dataRows = items.map((item) => {
    const total = item.qty * item.unitCost
    return `${quoteField(item.name)},${item.qty},${quoteField(item.unit)},${quoteField(item.supplier)},${quoteField(item.partNumber)},${item.unitCost.toFixed(2)},${total.toFixed(2)},${quoteField(item.notes)}`
  })

  const hardwareTotal = items.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const totalRow = `,,,,Hardware total,${hardwareTotal.toFixed(2)},`
  return [header, ...dataRows, totalRow].join('\n')
}
