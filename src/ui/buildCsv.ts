import type { BoardPart, Component, HardwareItem, MaterialDef, Part } from '../scene/types'
import { ancestorsOf, componentsById } from '../scene/componentTree'
import type { HardwareRow } from './groupHardware'

// A sheet created by typing one dimension into the library carries 0 for the other. Zero is
// absent, not a zero-sized sheet: a material is nestable only once both dimensions are real.
export function isNestable(def: MaterialDef): boolean {
  return def.sheet !== undefined && def.sheet.length > 0 && def.sheet.width > 0
}

export interface CutDims {
  length: number
  width: number
  thickness: number
}

// What a woodworker cuts, which is not what the part stores: `orientedPanel` fixes which carcase
// axis a board's x lands on to keep `position` the box min corner, so a 720 mm tall side is stored
// length 560. Grain decides which dimension is the length, because that is what the length *means*
// on a sheet good — size only decides it when grain is unconstrained. Thickness is never in play.
export function cutDimensions({ length, width, thickness, grain }: BoardPart): CutDims {
  if (grain === 'length') return { length, width, thickness }
  if (grain === 'width') return { length: width, width: length, thickness }
  return length >= width
    ? { length, width, thickness }
    : { length: width, width: length, thickness }
}

// After `cutDimensions` the grain-running dimension *is* the reported length, so a board with any
// direction reports 'length' here and only an unconstrained one reports 'free'. Reporting the raw
// field instead would print 'width' for a board whose reported length is its grain direction — and
// would let a 600x300 'length' board, a 300x600 'width' board and a 600x300 'free' board share one
// row while disagreeing about grain.
function cutGrain(p: BoardPart): 'length' | 'free' {
  return p.grain === 'free' ? 'free' : 'length'
}

export interface GroupedRow {
  key: string
  qty: number
  labels: string
  component: string
  material: string
  color: string
  length: number
  width: number
  thickness: number
  grain: 'length' | 'free'
  cuts: number
  costPerUnit: number | null // null = no rate set for this material
  totalCost: number | null // null = no rate set; equals costPerUnit * qty
}

export function groupParts(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
  components: Component[] = [],
): GroupedRow[] {
  const byId = componentsById(components)
  const order: string[] = []
  const map = new Map<string, GroupedRow>()

  for (const p of parts) {
    if (p.kind !== 'board') continue
    const dims = cutDimensions(p)
    const component = ancestorsOf(p, byId)[0]?.label ?? ''
    // Grain is in the key, not just the row: a part the nester may rotate and one it may not are
    // different cuts even at identical dimensions.
    const key = `${component}|${dims.length}×${dims.width}×${dims.thickness}|${cutGrain(p)}|${p.material}|${p.color}`
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
        component,
        material: p.material,
        color: p.color,
        length: dims.length,
        width: dims.width,
        thickness: dims.thickness,
        grain: cutGrain(p),
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

export function buildCsv(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
  components: Component[] = [],
): string {
  const header =
    'Cabinet,Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Grain,Cuts,Cost/unit,Total'
  const rows = groupParts(parts, materials, components)
  const dataRows = rows.map((row) => {
    const costStr = row.costPerUnit !== null ? row.costPerUnit.toFixed(2) : ''
    const totalStr = row.totalCost !== null ? row.totalCost.toFixed(2) : ''
    return `${quoteField(row.component)},${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.length},${row.width},${row.thickness},${row.grain},${row.cuts},${costStr},${totalStr}`
  })

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  if (!anyHasCost) return [header, ...dataRows].join('\n')

  const boardTotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const subtotalRow = `,,,,,,,,,,Board total,${boardTotal.toFixed(2)}`
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

export function buildHardwareCsv(items: HardwareItem[], derived: HardwareRow[] = []): string {
  const header = 'Cabinet,Name,Qty,Unit,Supplier,Part #,Unit cost,Total,Notes'
  if (items.length === 0 && derived.length === 0) return header

  const money = (n: number | null): string => (n === null ? '' : n.toFixed(2))

  // Generated rows first, in the order carcaseHardware stated; then what the user typed.
  const derivedRows = derived.map(
    (r) =>
      `${quoteField(r.cabinetLabel)},${quoteField(r.name)},${r.qty},${quoteField(r.unit)},` +
      `${quoteField(r.supplier)},${quoteField(r.partNumber)},${money(r.unitCost)},${money(r.totalCost)},`,
  )
  const manualRows = items.map(
    (item) =>
      `,${quoteField(item.name)},${item.qty},${quoteField(item.unit)},${quoteField(item.supplier)},` +
      `${quoteField(item.partNumber)},${item.unitCost.toFixed(2)},${(item.qty * item.unitCost).toFixed(2)},` +
      `${quoteField(item.notes)}`,
  )

  // Three figures rather than one: which half of the quote the app generated is worth seeing.
  const generatedTotal = derived.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const manualTotal = items.reduce((sum, i) => sum + i.qty * i.unitCost, 0)

  return [
    header,
    ...derivedRows,
    ...manualRows,
    `,,,,,,Generated total,${generatedTotal.toFixed(2)},`,
    `,,,,,,Hand-entered total,${manualTotal.toFixed(2)},`,
    `,,,,,,Hardware total,${(generatedTotal + manualTotal).toFixed(2)},`,
  ].join('\n')
}
