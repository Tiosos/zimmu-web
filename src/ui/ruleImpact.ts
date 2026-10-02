import { resolveWorldMatrix, decomposeMatrix } from '../geom/transform'
import type { RulePreview } from '../scene/ruleFlow'
import type { HardwareLibraryEntry, MaterialDef, Part, Scene } from '../scene/types'
import { componentsById } from '../scene/componentTree'
import { carcaseHardware } from '../scene/carcaseHardware'
import { effectiveMaterialsOf } from '../scene/effectiveMaterials'
import { edgesOf } from '../scene/edgeBanding'
import { canonicalContent } from '../scene/cataloguePackage'
import {
  cutDimensions,
  finishedDimensions,
  groupDowels,
  groupEdgeBand,
  groupParts,
} from './buildCsv'
import { groupHardware } from './groupHardware'

export interface ImpactPricing {
  library?: Record<string, MaterialDef>
  hardwareLibrary?: Record<string, HardwareLibraryEntry>
}
export interface PartFacts {
  label: string
  kind: Part['kind']
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
}
function operationDetails(operation: object): string {
  return Object.entries(operation)
    .filter(([key]) => key !== 'sourceJointId' && key !== 'sourceComponentId')
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
function partFacts(scene: Scene): Map<string, PartFacts> {
  const byId = componentsById(scene.components)
  return new Map(
    scene.parts.map((p) => {
      const world = decomposeMatrix(resolveWorldMatrix(p, byId))
      const edges = p.kind === 'board' ? edgesOf(p, byId, scene.materials) : undefined
      const finished = p.kind === 'board' ? finishedDimensions(p) : undefined
      const cut = p.kind === 'board' ? cutDimensions(p, edges!, scene.materials) : undefined
      return [
        p.id,
        {
          label: p.label,
          kind: p.kind,
          finished: finished
            ? [finished.length, finished.width, finished.thickness]
            : [p.length, p.kind === 'cylinder' ? p.diameter : 0],
          cut: cut
            ? [cut.length, cut.width, cut.thickness]
            : [p.length, p.kind === 'cylinder' ? p.diameter : 0],
          material: p.material,
          grain: p.kind === 'board' ? p.grain : '—',
          edges: edges ? canonicalContent(edges) : '—',
          machining: canonicalContent(p.cuts),
          machiningDetails: p.cuts.map(operationDetails),
          instructionDetails: p.kind === 'board' ? (p.operations ?? []).map(operationDetails) : [],
          instructions: canonicalContent(p.kind === 'board' ? (p.operations ?? []) : []),
          placement: canonicalContent({
            parentId: p.parentId,
            localPosition: p.position,
            localRotation: p.rotation,
            worldPosition: world.position,
            worldRotation: world.rotation,
            rotationOrder: p.rotationOrder,
          }),
          ...(cut?.problem ? { problem: cut.problem } : {}),
        },
      ]
    }),
  )
}
const fields: [keyof PartFacts, string][] = [
  ['kind', 'part type'],
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
function production(scene: Scene, pricing: ImpactPricing) {
  const materials = effectiveMaterialsOf(pricing.library ?? {}, scene.materials)
  const boards = groupParts(scene.parts, materials, scene.components)
  const dowels = groupDowels(scene.parts, materials)
  const edges = groupEdgeBand(scene.parts, materials, scene.components)
  const hardware = groupHardware(carcaseHardware(scene), pricing.hardwareLibrary ?? {})
  const totals = new Map<string, QuantityFact>()
  const issues = new Set<string>()
  let known = 0
  function material(kind: string, name: string, unit: string, quantity: number | null) {
    const key = JSON.stringify([kind, name])
    const previous = totals.has(key) ? totals.get(key)!.quantity : 0
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
  function priced(name: string, cost: number | null, usable = true) {
    if (!usable || !valid(cost) || !valid(known + cost)) issues.add(name)
    else known += cost
  }
  for (const b of boards) {
    material('Board', b.material, 'm²', b.problem ? null : (b.qty * b.length * b.width) / 1_000_000)
    priced(
      `Board ${b.material || '(unspecified)'}: ${b.problem ?? 'missing or invalid area rate'}`,
      b.totalCost,
      !b.problem && valid(materials[b.material]?.costPerM2),
    )
  }
  for (const d of dowels) {
    const usable =
      Number.isFinite(d.length) && d.length > 0 && Number.isFinite(d.diameter) && d.diameter > 0
    material('Round stock', d.material, 'm', usable ? (d.qty * d.length) / 1000 : null)
    priced(
      `Round stock ${d.material || '(unspecified)'}: missing or invalid length rate`,
      d.totalCost,
      usable && valid(materials[d.material]?.costPerM),
    )
  }
  for (const e of edges) {
    material('Edge band', e.material, 'm', e.metres)
    priced(`Edge band ${e.material}: missing or invalid length rate`, e.cost, valid(e.costPerM))
  }
  for (const h of hardware)
    priced(
      `${h.cabinetLabel} / ${h.name}: missing or invalid hardware rate`,
      h.totalCost,
      valid(h.unitCost),
    )
  for (const h of scene.hardware)
    priced(
      `Manual hardware ${h.name}: invalid quantity or rate`,
      h.qty * h.unitCost,
      valid(h.qty) && valid(h.unitCost),
    )
  const cost: ImpactCost = { known, total: issues.size ? null : known, issues: [...issues].sort() }
  const hardwareQuantities = hardware
    .map((h) => ({
      key: JSON.stringify(['derived', h.componentId, h.key]),
      name: `${h.cabinetLabel} / ${h.name} (${h.key})`,
      unit: h.unit,
      quantity: h.qty,
    }))
    .concat(
      scene.hardware.map((h) => ({
        key: JSON.stringify(['manual', h.id]),
        name: `Manual: ${h.name}`,
        unit: h.unit,
        quantity: h.qty,
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
  const before = partFacts(source)
  const after = partFacts(preview.candidate)
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
  const old = production(source, pricing)
  const next = production(preview.candidate, pricing)
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
