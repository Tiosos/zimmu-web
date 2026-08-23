import type { BoardPart, HardwareItem, MaterialDef, Part } from '../scene/types'

export interface CutDims {
  length: number
  width: number
  thickness: number
}

// What a woodworker cuts, which is not what the part stores: `orientedPanel` fixes which carcase
// axis a board's x lands on to keep `position` the box min corner, so a 720 mm tall side is stored
// length 560. Thickness is never in play — only the two in-plane dimensions are reordered.
export function cutDimensions({ length, width, thickness }: BoardPart): CutDims {
  return length >= width ? { length, width, thickness } : { length: width, width: length, thickness }
}

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
    const dims = cutDimensions(p)
    const key = `${dims.length}×${dims.width}×${dims.thickness}|${p.material}|${p.color}`
    const rate = materials[p.material]?.costPerM2
    const costPerUnit = rate !== undefined ? ((dims.length * dims.width) / 1_000_000) * rate : null
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
        length: dims.length,
        width: dims.width,
        thickness: dims.thickness,
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

export interface DowelRow {
  key: string
  qty: number
  labels: string
  material: string
  color: string
  diameter: number
  length: number
  costPerUnit: number | null // null = no costPerM rate for this material
  totalCost: number | null
}

export function groupDowels(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
): DowelRow[] {
  const order: string[] = []
  const map = new Map<string, DowelRow>()

  for (const p of parts) {
    if (p.kind !== 'cylinder') continue
    const key = `${p.diameter}×${p.length}|${p.material}|${p.color}`
    const rate = materials[p.material]?.costPerM
    const costPerUnit = rate !== undefined ? (p.length / 1000) * rate : null
    const existing = map.get(key)
    if (existing) {
      existing.qty += 1
      existing.labels += `, ${p.label}`
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
        diameter: p.diameter,
        length: p.length,
        costPerUnit,
        totalCost: costPerUnit,
      })
    }
  }

  return order.map((k) => map.get(k)!)
}

export function buildDowelCsv(parts: Part[], materials: Record<string, MaterialDef> = {}): string {
  const header = 'Qty,Labels,Material,Color,Diameter (mm),Length (mm),Cost/unit,Total'
  const rows = groupDowels(parts, materials)
  const dataRows = rows.map((row) => {
    const costStr = row.costPerUnit !== null ? row.costPerUnit.toFixed(2) : ''
    const totalStr = row.totalCost !== null ? row.totalCost.toFixed(2) : ''
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.diameter},${row.length},${costStr},${totalStr}`
  })

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  if (!anyHasCost) return [header, ...dataRows].join('\n')

  const dowelTotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const subtotalRow = `,,,,,,Dowel total,${dowelTotal.toFixed(2)}`
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
  const totalRow = `,,,,,Hardware total,${hardwareTotal.toFixed(2)},`
  return [header, ...dataRows, totalRow].join('\n')
}
