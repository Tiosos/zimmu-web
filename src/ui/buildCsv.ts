import type { Component, HardwareItem, MaterialDef, Part } from '../scene/types'
import { EDGE_KEYS } from '../scene/edgeBanding'
import { manufacturingParts, type ManufacturingPart } from '../scene/manufacturingPart'
import type { HardwareRow } from './groupHardware'
export {
  finishedDimensions,
  cutDimensions,
  isNestable,
  type CutDims,
} from '../scene/manufacturingPart'

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
  finishedLength: number
  finishedWidth: number
  edgeCode: string
  edgeMaterials: string // distinct edge materials, comma-separated; '' when unbanded
  edgeMaterialList: string[]
  members: { id: string; label: string; cuts: number }[]
  problem?: string
}

export function groupParts(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
  components: Component[] = [],
): GroupedRow[] {
  return groupPartsFromRecords(
    manufacturingParts(
      parts.filter((p) => p.kind === 'board'),
      materials,
      components,
    ),
    materials,
  )
}

export function groupPartsFromRecords(
  parts: ManufacturingPart[],
  materials: Record<string, MaterialDef> = {},
): GroupedRow[] {
  const order: string[] = []
  const map = new Map<string, GroupedRow>()

  for (const p of parts) {
    if (p.kind !== 'board') continue
    const finished = p.finished
    const edges = p.edges
    const dims = p.cut
    const code = p.edgeCode
    const edgeMaterialList = p.edgeMaterials
    const edgeMaterials = edgeMaterialList.join(', ')
    // The label is part of the grouping key below, so naming the wrong ancestor does not just
    // mislabel a row — it merges boards cut for different cabinets into one.
    const component = p.provenance.cabinetLabel ?? ''
    // Grain is in the key, not just the row: a part the nester may rotate and one it may not are
    // different cuts even at identical dimensions.
    const key = `${component}|${dims.length}×${dims.width}×${dims.thickness}|${finished.length}×${finished.width}|${code}|${p.bomGrain}|${p.material}|${p.color}|${EDGE_KEYS.map((k) => edges[k] ?? '-').join('/')}`
    const rate = materials[p.material]?.costPerM2
    const costPerUnit = rate !== undefined ? ((dims.length * dims.width) / 1_000_000) * rate : null
    const existing = map.get(key)
    if (existing) {
      existing.qty += 1
      existing.labels += `, ${p.label}`
      existing.cuts += p.cuts.length
      existing.members.push({ id: p.id, label: p.label, cuts: p.cuts.length })
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
        grain: p.bomGrain,
        cuts: p.cuts.length,
        costPerUnit,
        totalCost: costPerUnit,
        finishedLength: finished.length,
        finishedWidth: finished.width,
        edgeCode: code,
        edgeMaterials,
        edgeMaterialList,
        members: [{ id: p.id, label: p.label, cuts: p.cuts.length }],
        ...(dims.problem ? { problem: dims.problem } : {}),
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

export function buildCsvFromRows(rows: GroupedRow[], edge: EdgeBandLine[]): string {
  const header =
    'Cabinet,Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Grain,Cuts,Cost/unit,Total,Finished length (mm),Finished width (mm),Edges,Edge material'
  const dataRows = rows.map((row) => {
    const costStr = row.costPerUnit !== null ? row.costPerUnit.toFixed(2) : ''
    const totalStr = row.totalCost !== null ? row.totalCost.toFixed(2) : ''
    return `${quoteField(row.component)},${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.length},${row.width},${row.thickness},${row.grain},${row.cuts},${costStr},${totalStr},${row.finishedLength},${row.finishedWidth},${row.edgeCode},${quoteField(row.edgeMaterials)}`
  })

  const edgeSection =
    edge.length === 0
      ? []
      : [
          '',
          'Edge material,Metres,Cost/m,Total',
          ...edge.map(
            (l) =>
              `${quoteField(l.material)},${l.metres.toFixed(3)},${l.costPerM !== null ? l.costPerM.toFixed(2) : ''},${l.cost !== null ? l.cost.toFixed(2) : ''}`,
          ),
        ]

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  if (!anyHasCost) return [header, ...dataRows, ...edgeSection].join('\n')

  const boardTotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const subtotalRow = `,,,,,,,,,,Board total,${boardTotal.toFixed(2)}`
  return [header, ...dataRows, subtotalRow, ...edgeSection].join('\n')
}

export function buildCsv(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
  components: Component[] = [],
): string {
  return buildCsvFromRows(
    groupParts(parts, materials, components),
    groupEdgeBand(parts, materials, components),
  )
}

export interface EdgeBandLine {
  material: string
  metres: number
  costPerM: number | null
  cost: number | null
}

export function groupEdgeBand(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
  components: Component[] = [],
): EdgeBandLine[] {
  return groupEdgeBandFromRecords(
    manufacturingParts(
      parts.filter((p) => p.kind === 'board'),
      materials,
      components,
    ),
    materials,
  )
}

export function groupEdgeBandFromRecords(
  parts: ManufacturingPart[],
  materials: Record<string, MaterialDef> = {},
): EdgeBandLine[] {
  const totals = new Map<string, number>()
  for (const p of parts) {
    if (p.kind !== 'board') continue
    for (const { material, mm } of p.edgeBand) {
      totals.set(material, (totals.get(material) ?? 0) + mm)
    }
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([material, mm]) => {
      const rate = materials[material]?.costPerM
      const metres = mm / 1000
      return {
        material,
        metres,
        costPerM: rate ?? null,
        cost: rate !== undefined ? metres * rate : null,
      }
    })
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
  members: { id: string; label: string }[]
}

export function groupDowels(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
): DowelRow[] {
  return groupDowelsFromRecords(
    manufacturingParts(
      parts.filter((p) => p.kind === 'cylinder'),
      materials,
    ),
    materials,
  )
}

export function groupDowelsFromRecords(
  parts: ManufacturingPart[],
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
      existing.members.push({ id: p.id, label: p.label })
      existing.totalCost =
        existing.costPerUnit !== null ? existing.costPerUnit * existing.qty : null
    } else {
      order.push(key)
      map.set(key, {
        key,
        qty: 1,
        labels: p.label,
        members: [{ id: p.id, label: p.label }],
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
  return buildDowelCsvFromRows(groupDowels(parts, materials))
}

export function buildDowelCsvFromRows(rows: DowelRow[]): string {
  const header = 'Qty,Labels,Material,Color,Diameter (mm),Length (mm),Cost/unit,Total'
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
