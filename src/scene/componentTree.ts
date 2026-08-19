import type { Component, ComponentId, Part, Scene } from './types'

const MAX_DEPTH = 64

export function componentsById(components: Component[]): Map<ComponentId, Component> {
  return new Map(components.map((c) => [c.id, c]))
}

// Nearest parent first, root last. Throws rather than looping if the chain is cyclic —
// a cycle is a bug in a reparent guard, and silently truncating would place geometry wrongly.
export function ancestorsOf(
  node: Part | Component,
  byId: Map<ComponentId, Component>,
): Component[] {
  const chain: Component[] = []
  let parentId = node.parentId
  while (parentId !== null) {
    if (chain.length >= MAX_DEPTH) {
      throw new Error(`componentTree: parent chain exceeded max depth ${MAX_DEPTH} — cycle?`)
    }
    const parent = byId.get(parentId)
    if (!parent) break
    chain.push(parent)
    parentId = parent.parentId
  }
  return chain
}

export function descendantIds(
  rootId: ComponentId,
  components: Component[],
  parts: Part[],
): { componentIds: ComponentId[]; partIds: string[] } {
  const componentIds: ComponentId[] = []
  const frontier = [rootId]
  while (frontier.length > 0) {
    const current = frontier.pop()!
    for (const c of components) {
      if (c.parentId === current) {
        componentIds.push(c.id)
        frontier.push(c.id)
      }
    }
  }
  const owned = new Set([rootId, ...componentIds])
  const partIds = parts.filter((p) => p.parentId !== null && owned.has(p.parentId)).map((p) => p.id)
  return { componentIds, partIds }
}

export function wouldCycle(
  components: Component[],
  nodeId: ComponentId,
  newParentId: ComponentId | null,
): boolean {
  if (newParentId === null) return false
  if (newParentId === nodeId) return true
  const byId = componentsById(components)
  let cursor: ComponentId | null = newParentId
  let depth = 0
  while (cursor !== null) {
    if (cursor === nodeId) return true
    if (++depth > MAX_DEPTH) return true
    cursor = byId.get(cursor)?.parentId ?? null
  }
  return false
}

// A dangling parentId costs hierarchy, never parts. Returns the input by identity when
// nothing needed promoting, so callers can skip a state update.
export function promoteOrphans(scene: Scene): Scene {
  const ids = new Set(scene.components.map((c) => c.id))
  const dangling = (parentId: ComponentId | null) => parentId !== null && !ids.has(parentId)

  const needsWork =
    scene.parts.some((p) => dangling(p.parentId)) ||
    scene.components.some((c) => dangling(c.parentId))
  if (!needsWork) return scene

  return {
    ...scene,
    parts: scene.parts.map((p) => (dangling(p.parentId) ? { ...p, parentId: null } : p)),
    components: scene.components.map((c) => (dangling(c.parentId) ? { ...c, parentId: null } : c)),
  }
}

// A cycle among components that all exist is not repaired by promoteOrphans — every parentId
// resolves, so nothing looks dangling — but it makes ancestorsOf throw at render time. Only
// reachable from a corrupted or hand-edited file, since wouldCycle guards the reparent path.
// Roots every component that can reach itself, which flattens the cycle rather than guessing
// which edge was the intended one: hierarchy is lost, components never are.
export function breakComponentCycles(scene: Scene): Scene {
  const byId = componentsById(scene.components)
  const cyclic = new Set<ComponentId>()

  for (const start of scene.components) {
    const seen = new Set<ComponentId>()
    let cursor: ComponentId | null = start.id
    while (cursor !== null) {
      if (seen.has(cursor)) {
        cyclic.add(cursor)
        break
      }
      seen.add(cursor)
      cursor = byId.get(cursor)?.parentId ?? null
    }
  }

  if (cyclic.size === 0) return scene
  return {
    ...scene,
    components: scene.components.map((c) => (cyclic.has(c.id) ? { ...c, parentId: null } : c)),
  }
}
