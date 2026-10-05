import type { ManufacturingPart, PartProvenance } from './manufacturingPart'
import type { CutDef, DowelCut, ManualMachiningOperation } from './types'
import { drillingChecks } from './drillingChecks'
import { faceAxes } from './snapMath'

type Drilling = Extract<
  CutDef | DowelCut,
  { kind: 'hole-array' | 'bore-axial' | 'bore-transverse' }
>
interface EntryBase {
  part: {
    id: string
    label: string
    kind: ManufacturingPart['kind']
    material: string
    dimensions:
      | { length: number; width: number; thickness: number }
      | { length: number; diameter: number }
    provenance: PartProvenance
  }
  sourceComponentId: string | null
  sourceJointId: string | null
}
export type MachiningEntry = EntryBase &
  (
    | {
        category: 'geometric-drilling'
        operation: Drilling
        depthMode: 'blind' | 'through' | 'unassessed'
      }
    | { category: 'geometric-cut'; operation: Exclude<CutDef | DowelCut, Drilling> }
    | { category: 'manual-instruction'; operation: ManualMachiningOperation }
  )

// One entry per source definition, not per hole or grouped shop note. IDs are scoped by part;
// do not merge repeated IDs, labels or template instances from different parts.
export function buildMachiningSchedule(records: ManufacturingPart[]) {
  const entries: MachiningEntry[] = []
  for (const p of records) {
    const invalidDrilling = new Set(drillingChecks(p).map((issue) => issue.operation.id))
    const part: EntryBase['part'] = {
      id: p.id,
      label: p.label,
      kind: p.kind,
      material: p.material,
      dimensions: p.kind === 'board' ? { ...p.local } : { length: p.length, diameter: p.diameter },
      provenance: structuredClone(p.provenance),
    }
    for (const definition of [...p.cuts, ...p.operations]) {
      const operation = structuredClone(definition)
      const base: EntryBase = {
        part: structuredClone(part),
        sourceComponentId:
          'sourceComponentId' in operation ? (operation.sourceComponentId ?? null) : null,
        sourceJointId: 'sourceJointId' in operation ? (operation.sourceJointId ?? null) : null,
      }
      switch (operation.kind) {
        case 'hole-array':
        case 'bore-axial':
        case 'bore-transverse': {
          const extent =
            p.kind === 'board' && operation.kind === 'hole-array'
              ? { x: p.local.length, y: p.local.width, z: p.local.thickness }[
                  faceAxes(operation.face).depth
                ]
              : p.kind === 'cylinder' && operation.kind === 'bore-axial'
                ? p.length
                : p.kind === 'cylinder' && operation.kind === 'bore-transverse'
                  ? p.diameter
                  : NaN
          const assessed =
            Number.isFinite(extent) && extent > 0 && !invalidDrilling.has(operation.id)
          entries.push({
            ...base,
            category: 'geometric-drilling',
            operation,
            depthMode: !assessed ? 'unassessed' : operation.depth >= extent ? 'through' : 'blind',
          })
          break
        }
        case 'manual-machining':
          entries.push({ ...base, category: 'manual-instruction', operation })
          break
        case 'box':
        case 'mitre':
        case 'end':
        case 'notch':
          entries.push({ ...base, category: 'geometric-cut', operation })
          break
        default: {
          const exhaustive: never = operation
          throw new Error(`Unknown machining operation: ${JSON.stringify(exhaustive)}`)
        }
      }
    }
  }
  return {
    schemaVersion: 1 as const,
    units: 'mm' as const,
    angleUnits: 'degrees' as const,
    coordinateFrame: 'part-local' as const,
    scope:
      'All parts, including hidden items. One row per cut or manual instruction; hole arrays are not expanded. Row order is not an execution sequence. Definitions describe nominal stock, not tool paths or machine readiness.',
    unassessed: [
      'Interactions between cuts',
      'Manual machining geometry',
      'Machine compatibility and tool access',
    ],
    counts: {
      parts: records.length,
      entries: entries.length,
      geometricDrilling: entries.filter((e) => e.category === 'geometric-drilling').length,
      geometricCuts: entries.filter((e) => e.category === 'geometric-cut').length,
      manualInstructions: entries.filter((e) => e.category === 'manual-instruction').length,
    },
    entries,
  }
}
export type MachiningSchedule = ReturnType<typeof buildMachiningSchedule>

// JSON cannot encode non-finite numbers. Preserve them as explicit strings rather than silently
// writing null or clamping an invalid definition into something that appears manufacturable.
export function machiningScheduleJson(schedule: MachiningSchedule): string {
  return (
    JSON.stringify(
      schedule,
      (_key, value) =>
        typeof value === 'number' && !Number.isFinite(value) ? String(value) : value,
      2,
    ) + '\n'
  )
}
