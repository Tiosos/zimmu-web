import type { CarcaseComponent, Component, ComponentId, MaterialDef } from './types'
import { worldBoundsOf } from './carcaseWorldBounds'

export interface Run {
  // Every cabinet in the run, in geometric order: left to right, then front to back.
  members: ComponentId[]
}

// A run is a straight line of cabinets against one wall, so only a LEFT or RIGHT anchor continues
// one. A front or back anchor is how a return run meets a corner — it starts a new run, which is
// what gives the blind-width check two runs to compare rather than one L-shaped one.
const CONTINUES_A_RUN = new Set<string>(['left', 'right'])

export function runsOf(components: Component[], materials: Record<string, MaterialDef>): Run[] {
  const carcases = new Map<ComponentId, CarcaseComponent>()
  for (const c of components) if (c.kind === 'carcase') carcases.set(c.id, c)

  // Undirected: direction says who moves when the target moves, not what is in the line. A cabinet
  // on each side of one target is one run of three.
  const neighbours = new Map<ComponentId, Set<ComponentId>>()
  for (const id of carcases.keys()) neighbours.set(id, new Set())
  for (const c of carcases.values()) {
    const a = c.anchor
    if (a === undefined || !CONTINUES_A_RUN.has(a.face)) continue
    const t = carcases.get(a.to)
    // Honoured on exactly resolvePlacement's terms. A run built from anchors the resolver ignores
    // is a run that is not on screen.
    if (t === undefined || t.id === c.id || t.parentId !== c.parentId) continue
    neighbours.get(c.id)?.add(t.id)
    neighbours.get(t.id)?.add(c.id)
  }

  // Geometric order, the same choice sectionOpenings makes: a run assembled right-to-left and one
  // assembled left-to-right must read identically, which topological order cannot promise — and
  // which a walk from an endpoint could not even define once a user anchors three cabinets to one
  // target.
  const origin = new Map<ComponentId, { x: number; y: number }>()
  for (const c of carcases.values()) {
    const b = worldBoundsOf(c, materials)
    origin.set(c.id, { x: b.x0, y: b.y0 })
  }
  const before = (l: ComponentId, r: ComponentId): number => {
    const a = origin.get(l)
    const b = origin.get(r)
    if (a === undefined || b === undefined) return 0
    return a.x !== b.x ? a.x - b.x : a.y - b.y
  }

  const seen = new Set<ComponentId>()
  const runs: Run[] = []
  // Iterating `components` rather than the map keeps RUN order stable against the scene's own
  // component order, the way the hardware BOM's rows are.
  for (const c of components) {
    if (c.kind !== 'carcase' || seen.has(c.id)) continue
    const members: ComponentId[] = []
    const stack = [c.id]
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || seen.has(id)) continue
      seen.add(id)
      members.push(id)
      for (const n of neighbours.get(id) ?? []) if (!seen.has(n)) stack.push(n)
    }
    runs.push({ members: members.sort(before) })
  }
  return runs
}
