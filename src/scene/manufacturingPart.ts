import type {
  BoardPart,
  Component,
  ComponentId,
  CutDef,
  DowelCut,
  Grain,
  ManualMachiningOperation,
  MaterialDef,
  Part,
} from './types'
import type { PartOverrides } from './resolveThickness'
import { componentsById } from './componentTree'
import { nearestCarcase } from './nearestCarcase'
import { isSwapped } from './grain'
import {
  EDGE_KEYS,
  bandedEdgeLengths,
  cutSizeOf,
  nestingGeometryOf,
  edgeCode,
  edgesOf,
  type BoardEdges,
} from './edgeBanding'

export interface CutDims {
  length: number
  width: number
  thickness: number
}
// Grain chooses the reported length, not the longer stored axis: a tall side can be stored
// length 560/width 720, with its grain running along width. Thickness never participates.
export function finishedDimensions(p: BoardPart): CutDims {
  return isSwapped(p)
    ? { length: p.width, width: p.length, thickness: p.thickness }
    : { length: p.length, width: p.width, thickness: p.thickness }
}
export function cutDimensions(
  p: BoardPart,
  edges: BoardEdges,
  materials: Record<string, MaterialDef>,
): CutDims & { problem?: string } {
  const c = cutSizeOf(p, edges, materials)
  const dims = isSwapped(p)
    ? { length: c.width, width: c.length, thickness: c.thickness }
    : { length: c.length, width: c.width, thickness: c.thickness }
  return c.problem ? { ...dims, problem: c.problem } : dims
}
export interface ManufacturingStock {
  thickness: number | null
  hasGrain: boolean
  sheet: { length: number; width: number } | null
  use: 'edge' | null
}
export interface PartProvenance {
  parentId: ComponentId | null
  cabinetId: ComponentId | null
  cabinetLabel: string | null
  driven: boolean
  role: string | null
  partOverrides: PartOverrides | null
  cataloguePin: { id: string; version: number } | null
}
interface RecordBase {
  id: string
  label: string
  material: string
  color: string
  stock: ManufacturingStock
  provenance: PartProvenance
  operations: ManualMachiningOperation[]
}
export interface ManufacturingBoard extends RecordBase {
  kind: 'board'
  nesting: Pick<BoardPart, 'length' | 'width' | 'thickness' | 'cuts'>
  local: CutDims
  finished: CutDims
  cut: CutDims & { problem?: string }
  grain: Grain
  bomGrain: 'length' | 'free'
  edges: BoardEdges
  edgeCode: string
  edgeMaterials: string[]
  edgeBand: { material: string; mm: number }[]
  cuts: CutDef[]
}
export interface ManufacturingRoundStock extends RecordBase {
  kind: 'cylinder'
  length: number
  diameter: number
  cuts: DowelCut[]
}
export type ManufacturingPart = ManufacturingBoard | ManufacturingRoundStock
export interface ManufacturingContext {
  byId: Map<ComponentId, Component>
  materials: Record<string, MaterialDef>
}
export function manufacturingPart(p: Part, context: ManufacturingContext): ManufacturingPart {
  const cabinet = nearestCarcase(p, context.byId)
  const material = context.materials[p.material]
  const base: RecordBase = {
    id: p.id,
    label: p.label,
    material: p.material,
    color: p.color,
    stock: {
      thickness: material?.thickness ?? null,
      hasGrain: material?.hasGrain ?? true,
      sheet: material?.sheet
        ? { length: material.sheet.length, width: material.sheet.width }
        : null,
      use: material?.use ?? null,
    },
    provenance: {
      parentId: p.parentId,
      cabinetId: cabinet?.id ?? null,
      cabinetLabel: cabinet?.label ?? null,
      driven: p.driven,
      role: p.role ?? null,
      partOverrides: p.kind === 'board' && p.overrides ? { ...p.overrides } : null,
      cataloguePin: cabinet?.catalogue
        ? { id: cabinet.catalogue.id, version: cabinet.catalogue.version }
        : null,
    },
    operations: p.kind === 'board' ? structuredClone(p.operations ?? []) : [],
  }
  if (p.kind === 'cylinder')
    return {
      ...base,
      kind: 'cylinder',
      length: p.length,
      diameter: p.diameter,
      cuts: structuredClone(p.cuts),
    }
  const edges = edgesOf(p, context.byId, context.materials)
  const localCut = cutSizeOf(p, edges, context.materials)
  const cut = isSwapped(p)
    ? { ...localCut, length: localCut.width, width: localCut.length }
    : { ...localCut }
  return {
    ...base,
    kind: 'board',
    local: { length: p.length, width: p.width, thickness: p.thickness },
    finished: finishedDimensions(p),
    cut,
    nesting: nestingGeometryOf(p, edges, context.materials, localCut),
    grain: p.grain,
    // After BOM dimension ordering, any constrained grain runs along the reported length.
    bomGrain: p.grain === 'free' ? 'free' : 'length',
    edges,
    edgeCode: edgeCode(edges, isSwapped(p)),
    edgeMaterials: [
      ...new Set(
        EDGE_KEYS.map((key) => edges[key]).filter((name): name is string => name !== null),
      ),
    ].sort(),
    edgeBand: bandedEdgeLengths(p, edges),
    cuts: structuredClone(p.cuts),
  }
}
// Pricing and world placement stay outside these physical records: changing a rate or moving an
// assembly must not change the coordinate frame of its machining or its purchased dimensions.
export function manufacturingParts(
  parts: Part[],
  materials: Record<string, MaterialDef> = {},
  components: Component[] = [],
): ManufacturingPart[] {
  const context: ManufacturingContext = { byId: componentsById(components), materials }
  return parts.map((p) => manufacturingPart(p, context))
}
