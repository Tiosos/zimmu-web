import { applyMatrixToPoint, composeWorldMatrix } from '../geom/transform'
import { nearestCarcase } from './nearestCarcase'
import type { BoardPart, Component, ComponentId, EdgeKey, MaterialDef, Vec3 } from './types'

export const EDGE_KEYS: readonly EdgeKey[] = ['x0', 'x1', 'y0', 'y1']

// What a board's four edges actually carry: an edge material's name, or null for bare.
export type BoardEdges = Record<EdgeKey, string | null>

const NONE: BoardEdges = { x0: null, x1: null, y0: null, y1: null }

interface Direction {
  axis: 'x' | 'y' | 'z'
  sign: 1 | -1
}

// A cabinet's front faces -y: an overlay front sits in y ∈ [−FT, 0].
const FRONT: Direction = { axis: 'y', sign: -1 }

// Stated figures, like the hardware table: a woodworker's rule, not derivable from geometry. A role
// this function does not know is unbanded — visible in the part editor, unlike a wrong grain.
export function edgeRuleOf(role: string): 'all' | Direction[] {
  if (role.startsWith('front-')) return 'all'
  if (
    role === 'left-side' ||
    role === 'right-side' ||
    role === 'top' ||
    role === 'bottom' ||
    role.startsWith('division-') ||
    role.startsWith('adj-shelf-') ||
    role.startsWith('fixed-shelf-')
  ) {
    return [FRONT]
  }
  return []
}

const EDGE_NORMAL: Record<EdgeKey, Vec3> = {
  x0: { x: -1, y: 0, z: 0 },
  x1: { x: 1, y: 0, z: 0 },
  y0: { x: 0, y: -1, z: 0 },
  y1: { x: 0, y: 1, z: 0 },
}

// Which board edge faces a carcase direction: rotate each edge's outward normal by the part's own
// rotation and see which one lands on it. A panel whose thickness runs along that direction has no
// such edge and answers null.
function edgeFacing(rotation: Vec3, direction: Direction): EdgeKey | null {
  const m = composeWorldMatrix({ position: { x: 0, y: 0, z: 0 }, rotation })
  const component = { x: 0, y: 1, z: 2 }[direction.axis]
  for (const key of EDGE_KEYS) {
    const n = EDGE_NORMAL[key]
    const out = applyMatrixToPoint(m, n.x, n.y, n.z)
    if (Math.abs(out[component] - direction.sign) < 1e-6) return key
  }
  return null
}

// The effective edges of a board: the cabinet's rule for a generated one, then the board's own
// explicit entries on top. A detached or manual board follows only its explicit entries. A mitred
// board carries none, like a shaped edge — its outline is not the rectangle these rules measure.
export function edgesOf(
  part: BoardPart,
  byId: Map<ComponentId, Component>,
  materials: Record<string, MaterialDef>,
): BoardEdges {
  return boardEdgesOf(part, byId, materials)
}

// Requested rules retain unresolved stock for advisory checks without changing effective banding.
export function requestedEdgesOf(part: BoardPart, byId: Map<ComponentId, Component>): BoardEdges {
  return boardEdgesOf(part, byId)
}

function boardEdgesOf(
  part: BoardPart,
  byId: Map<ComponentId, Component>,
  materials?: Record<string, MaterialDef>,
): BoardEdges {
  if (part.cuts.some((c) => c.kind === 'mitre')) return { ...NONE }
  const edges: BoardEdges = { ...NONE }
  const named =
    part.driven && part.role !== undefined
      ? nearestCarcase(part, byId)?.params.edgeMaterial
      : undefined
  // A name the scene cannot resolve to edge stock is a note in the cabinet panel, not banding.
  const material =
    named !== undefined && (materials === undefined || materials[named]?.use === 'edge')
      ? named
      : undefined
  if (material && part.role !== undefined) {
    const rule = edgeRuleOf(part.role)
    const keys = rule === 'all' ? EDGE_KEYS : rule.map((d) => edgeFacing(part.rotation, d))
    for (const key of keys) if (key !== null) edges[key] = material
  }
  for (const key of EDGE_KEYS) {
    const own = part.edgeBanding?.[key]
    if (own !== undefined) edges[key] = own
  }
  return edges
}

export interface CutSize {
  length: number
  width: number
  thickness: number
  // Set when the figures cannot be trusted; the figures are still returned, never clamped.
  problem?: string
}

function thicknessOfEdge(
  name: string | null,
  materials: Record<string, MaterialDef>,
): number | null {
  if (name === null) return 0
  return materials[name]?.thickness ?? null
}

const round2 = (v: number): number => Math.round(v * 100) / 100

// The one statement of the subtraction: a banded x-edge removes its thickness from the LENGTH, a
// banded y-edge from the WIDTH. Board axes; the cutlist reorders by grain afterwards.
export function cutSizeOf(
  part: BoardPart,
  edges: BoardEdges,
  materials: Record<string, MaterialDef>,
): CutSize {
  let length = part.length
  let width = part.width
  let problem: string | undefined
  for (const key of EDGE_KEYS) {
    const t = thicknessOfEdge(edges[key], materials)
    if (t === null) {
      problem = `edge material "${edges[key]}" has no thickness`
      continue
    }
    if (key === 'x0' || key === 'x1') length -= t
    else width -= t
  }
  length = round2(length)
  width = round2(width)
  if (problem === undefined && (length <= 0 || width <= 0)) {
    problem = 'cut size is zero or negative'
  }
  return { length, width, thickness: part.thickness, ...(problem ? { problem } : {}) }
}

// `swapped` is whether the cutlist reports the board's width as its length, decided by the caller
// from the same rule `finishedDimensions` uses. A long edge is one that runs along the reported length.
export function edgeCode(edges: BoardEdges, swapped: boolean): string {
  const long: EdgeKey[] = swapped ? ['x0', 'x1'] : ['y0', 'y1']
  const short: EdgeKey[] = swapped ? ['y0', 'y1'] : ['x0', 'x1']
  const count = (keys: EdgeKey[]): number => keys.filter((k) => edges[k] !== null).length
  const l = count(long)
  const s = count(short)
  return `${l > 0 ? `${l}L` : ''}${s > 0 ? `${s}S` : ''}`
}

// Run lengths are finished dimensions: an x-edge runs along the width, a y-edge along the length.
export function bandedEdgeLengths(
  part: BoardPart,
  edges: BoardEdges,
): { material: string; mm: number }[] {
  const totals = new Map<string, number>()
  for (const key of EDGE_KEYS) {
    const name = edges[key]
    if (name === null) continue
    const run = key === 'x0' || key === 'x1' ? part.width : part.length
    totals.set(name, (totals.get(name) ?? 0) + run)
  }
  return [...totals].map(([material, mm]) => ({ material, mm }))
}

// Detached board-local cut geometry. Machining consumers keep the original coordinates;
// only the nesting footprint moves box cuts by the removed x0/y0 edge stock.
export function nestingGeometryOf(
  part: BoardPart,
  edges: BoardEdges,
  materials: Record<string, MaterialDef>,
  size: CutSize = cutSizeOf(part, edges, materials),
): Pick<BoardPart, 'length' | 'width' | 'thickness' | 'cuts'> {
  const changed = !size.problem && (size.length !== part.length || size.width !== part.width)
  const dx = changed ? (thicknessOfEdge(edges.x0, materials) ?? 0) : 0
  const dy = changed ? (thicknessOfEdge(edges.y0, materials) ?? 0) : 0
  const cuts = structuredClone(part.cuts)
  for (const cut of cuts) {
    if (cut.kind === 'box') {
      cut.position.x -= dx
      cut.position.y -= dy
    }
  }
  return { length: size.length, width: size.width, thickness: size.thickness, cuts }
}

// Compatibility scene-part wrapper: invalid or unchanged sizes retain the original part.
export function cutPartOf(
  part: BoardPart,
  byId: Map<ComponentId, Component>,
  materials: Record<string, MaterialDef>,
): BoardPart {
  const edges = edgesOf(part, byId, materials)
  const size = cutSizeOf(part, edges, materials)
  if (size.problem !== undefined) return part
  if (size.length === part.length && size.width === part.width) return part
  return { ...part, ...nestingGeometryOf(part, edges, materials, size) }
}
