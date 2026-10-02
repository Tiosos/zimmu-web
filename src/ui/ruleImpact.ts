import { resolveWorldMatrix, decomposeMatrix } from '../geom/transform'
import type { RulePreview } from '../scene/ruleFlow'
import type { HardwareLibraryEntry, MaterialDef, Part, Scene } from '../scene/types'
import { componentsById } from '../scene/componentTree'
import { carcaseHardware } from '../scene/carcaseHardware'
import { effectiveMaterialsOf } from '../scene/effectiveMaterials'
import { manufacturingParts, type ManufacturingPart } from '../scene/manufacturingPart'
import { canonicalContent } from '../scene/cataloguePackage'
import { groupDowelsFromRecords, groupEdgeBandFromRecords, groupPartsFromRecords } from './buildCsv'
import { groupHardware } from './groupHardware'

export interface ImpactPricing {
  library?: Record<string, MaterialDef>
  hardwareLibrary?: Record<string, HardwareLibraryEntry>
}
export interface PartFacts {
  label: string
  kind: Part['kind']
  localDimensions: number[]
  color: string
  stock: string
  finished: number[]
  cut: number[]
  material: string
  grain: string
  edges: string
  machining: string
  instructions: string
  placement: string
  machiningDetails: string[]
  instructionDetails: string[]
  problem?: string
}
export interface PartImpact {
  id: string
  status: 'added' | 'removed' | 'changed'
  fields: string[]
  before?: PartFacts
  after?: PartFacts
}
export interface QuantityFact {
  key: string
  name: string
  unit: string
  quantity: number | null
}
export interface QuantityImpact {
  key: string
  name: string
  unit: string
  before: number | null
  after: number | null
}
export interface ImpactCost {
  known: number
  total: number | null
  issues: string[]
}
export interface RuleImpact {
  parts: PartImpact[]
  materials: QuantityImpact[]
  hardware: QuantityImpact[]
  beforeCost: ImpactCost
  afterCost: ImpactCost
  costDelta: number | null
}
const valid = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0

const operationLabels: Record<string, string> = {
  kind: 'Type',
  id: 'Operation ID',
  label: 'Operation',
  face: 'Face',
  axis: 'Axis',
  position: 'Position (mm)',
  size: 'Size (mm)',
  start: 'First centre (mm)',
  pitch: 'Pitch (mm)',
  count: 'Count',
  diameter: 'Diameter (mm)',
  depth: 'Depth (mm)',
  end: 'End',
  angle: 'Angle (degrees)',
  azimuth: 'Azimuth (degrees)',
  offset: 'Offset (mm)',
  width: 'Width (mm)',
  at: 'Reference (mm)',
  edgeOffset: 'Edge offset (mm)',
  hardwareKey: 'Hardware',
  template: 'Template',
  instruction: 'Instruction',
  pairedCutId: 'Paired operation',
  sourceJointId: 'Source joint',
  sourceComponentId: 'Owning assembly',
}
function operationDetails(operation: object): string {
  return Object.entries(operation)
    .map(
      ([key, value]: [string, unknown]) =>
        `${operationLabels[key] ?? key}: ${
          value && typeof value === 'object'
            ? Object.entries(value)
                .map(([axis, n]) => `${axis} ${String(n)}`)
                .join(', ')
            : String(value)
        }`,
    )
    .join('; ')
}
function partFacts(scene: Scene, records: ManufacturingPart[]): Map<string, PartFacts> {
  const byId = componentsById(scene.components)
  return new Map(
    records.map((record, index) => {
      const p = scene.parts[index]
      const world = decomposeMatrix(resolveWorldMatrix(p, byId))
      const edges = record.kind === 'board' ? record.edges : undefined
      return [
        p.id,
        {
          label: record.label,
          kind: record.kind,
          localDimensions:
            record.kind === 'board'
              ? [record.local.length, record.local.width, record.local.thickness]
              : [record.length, record.diameter],
          color: record.color,
          stock: canonicalContent(record.stock),
          finished:
            record.kind === 'board'
              ? [record.finished.length, record.finished.width, record.finished.thickness]
              : [record.length, record.diameter],
          cut:
            record.kind === 'board'
              ? [record.cut.length, record.cut.width, record.cut.thickness]
              : [record.length, record.diameter],
          material: record.material,
          grain: record.kind === 'board' ? record.grain : '—',
          edges: edges ? canonicalContent(edges) : '—',
          machining: canonicalContent(record.cuts),
          machiningDetails: record.cuts.map(operationDetails),
          instructionDetails: record.operations.map(operationDetails),
          instructions: canonicalContent(record.operations),
          placement: canonicalContent({
            parentId: p.parentId,
            localPosition: p.position,
            localRotation: p.rotation,
            worldPosition: world.position,
            worldRotation: world.rotation,
            rotationOrder: p.rotationOrder,
          }),
          ...(record.kind === 'board' && record.cut.problem ? { problem: record.cut.problem } : {}),
        },
      ]
    }),
  )
}
const fields: [keyof PartFacts, string][] = [
  ['kind', 'part type'],
  ['localDimensions', 'part-local size'],
  ['color', 'colour'],
  ['stock', 'stock properties'],
  ['finished', 'finished size'],
  ['cut', 'cut size'],
  ['material', 'material'],
  ['grain', 'grain'],
  ['edges', 'edge treatment'],
  ['machining', 'machining'],
  ['instructions', 'manual instructions'],
  ['placement', 'assembly placement'],
  ['problem', 'cut-size problem'],
  ['label', 'label'],
]
function quantities(before: QuantityFact[], after: QuantityFact[]): QuantityImpact[] {
  const a = new Map(before.map((q) => [q.key, q]))
  const b = new Map(after.map((q) => [q.key, q]))
  return [...new Set([...a.keys(), ...b.keys()])].sort().flatMap((key) => {
    const old = a.has(key) ? a.get(key)!.quantity : 0
    const next = b.has(key) ? b.get(key)!.quantity : 0
    const q = b.get(key) ?? a.get(key)!
    return old === next ? [] : [{ key, name: q.name, unit: q.unit, before: old, after: next }]
  })
}
function production(
  scene: Scene,
  pricing: ImpactPricing,
  materials: Record<string, MaterialDef>,
  records: ManufacturingPart[],
) {
  const boards = groupPartsFromRecords(records, materials)
  const dowels = groupDowelsFromRecords(records, materials)
  const edges = groupEdgeBandFromRecords(records, materials)
  const hardware = groupHardware(carcaseHardware(scene), pricing.hardwareLibrary ?? {})
  const totals = new Map<string, QuantityFact>()
  const issues = new Set<string>()
  let known = 0
  function material(kind: string, name: string, unit: string, quantity: number | null) {
    const key = JSON.stringify([kind, name])
    const previous = totals.has(key) ? totals.get(key)!.quantity : 0
    if (previous !== null && quantity !== null && !valid(previous + quantity))
      issues.add(`${kind} ${name}: quantity exceeds numeric range or is invalid`)
    totals.set(key, {
      key,
      name: `${kind}: ${name || '(unspecified material)'}`,
      unit,
      quantity:
        previous === null || quantity === null || !valid(previous + quantity)
          ? null
          : previous + quantity,
    })
  }
  function priced(name: string, cost: number | null, usable: boolean, reason: string) {
    if (!usable || !valid(cost)) issues.add(`${name}: ${reason}`)
    else if (!valid(known + cost)) issues.add(`${name}: cost subtotal exceeds numeric range`)
    else known += cost
  }
  for (const b of boards) {
    material('Board', b.material, 'm²', b.problem ? null : (b.qty * b.length * b.width) / 1_000_000)
    priced(
      `Board ${b.material || '(unspecified)'}`,
      b.totalCost,
      !b.problem && valid(materials[b.material]?.costPerM2),
      b.problem ?? 'missing or invalid area rate',
    )
  }
  for (const d of dowels) {
    const usable =
      Number.isFinite(d.length) && d.length > 0 && Number.isFinite(d.diameter) && d.diameter > 0
    material('Round stock', d.material, 'm', usable ? (d.qty * d.length) / 1000 : null)
    priced(
      `Round stock ${d.material || '(unspecified)'}`,
      d.totalCost,
      usable && valid(materials[d.material]?.costPerM),
      usable
        ? 'missing or invalid length rate'
        : 'invalid length/diameter (must be positive finite mm)',
    )
  }
  for (const e of edges) {
    material('Edge band', e.material, 'm', e.metres)
    priced(`Edge band ${e.material}`, e.cost, valid(e.costPerM), 'missing or invalid length rate')
  }
  for (const h of hardware)
    priced(
      `${h.cabinetLabel} / ${h.name}`,
      h.totalCost,
      valid(h.unitCost),
      valid(h.qty) ? 'missing or invalid hardware rate' : 'invalid hardware quantity',
    )
  for (const h of scene.hardware)
    priced(
      `Manual hardware ${h.name}`,
      h.qty * h.unitCost,
      valid(h.qty) && valid(h.unitCost),
      'invalid quantity or rate',
    )
  const cost: ImpactCost = { known, total: issues.size ? null : known, issues: [...issues].sort() }
  const hardwareQuantities = hardware
    .map((h) => ({
      key: JSON.stringify(['derived', h.componentId, h.key]),
      name: `${h.cabinetLabel} / ${h.name} (${h.key})`,
      unit: h.unit,
      quantity: valid(h.qty) ? h.qty : null,
    }))
    .concat(
      scene.hardware.map((h) => ({
        key: JSON.stringify(['manual', h.id, h.unit]),
        name: `Manual: ${h.name}`,
        unit: h.unit,
        quantity: valid(h.qty) ? h.qty : null,
      })),
    )
  return { materials: [...totals.values()], hardware: hardwareQuantities, cost }
}

export function buildRuleImpact(
  preview: RulePreview,
  pricing: ImpactPricing = {},
): RuleImpact | undefined {
  if (preview.errors.length) return undefined
  // RulePreview.source is the captured scene signature, never a newer live scene.
  const source = JSON.parse(preview.source) as Scene
  const beforeMaterials = effectiveMaterialsOf(pricing.library ?? {}, source.materials)
  const afterMaterials = effectiveMaterialsOf(pricing.library ?? {}, preview.candidate.materials)
  const beforeRecords = manufacturingParts(source.parts, beforeMaterials, source.components)
  const afterRecords = manufacturingParts(
    preview.candidate.parts,
    afterMaterials,
    preview.candidate.components,
  )
  const before = partFacts(source, beforeRecords)
  const after = partFacts(preview.candidate, afterRecords)
  const parts = [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .flatMap((id): PartImpact[] => {
      const a = before.get(id)
      const b = after.get(id)
      if (!a) return [{ id, status: 'added', fields: [], after: b }]
      if (!b) return [{ id, status: 'removed', fields: [], before: a }]
      const changed = fields
        .filter(([key]) => canonicalContent(a[key]) !== canonicalContent(b[key]))
        .map(([, label]) => label)
      return changed.length ? [{ id, status: 'changed', fields: changed, before: a, after: b }] : []
    })
  const old = production(source, pricing, beforeMaterials, beforeRecords)
  const next = production(preview.candidate, pricing, afterMaterials, afterRecords)
  return {
    parts,
    materials: quantities(old.materials, next.materials),
    hardware: quantities(old.hardware, next.hardware),
    beforeCost: old.cost,
    afterCost: next.cost,
    costDelta:
      old.cost.total === null || next.cost.total === null ? null : next.cost.total - old.cost.total,
  }
}
