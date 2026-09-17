import type { CarcaseComponent, ComponentId, MaterialDef, Scene, Vec3 } from './types'
import { carcaseBounds, type Bounds3 } from './carcaseBounds'
import { anchoredPosition, rotatedBounds, translatedBounds } from './anchor'
import { roleThicknessFor, type PartOverrides } from './resolveThickness'

// Slots only. Overrides live on emitted parts and this pass runs before they exist; see
// carcaseBounds for why reading them would make the pipeline a fixed-point iteration.
const NO_OVERRIDES = new Map<string, PartOverrides>()

function boundsOf(c: CarcaseComponent, materials: Record<string, MaterialDef>): Bounds3 {
  return carcaseBounds(c.params, roleThicknessFor(c.params, materials, NO_OVERRIDES))
}

// Derives the position of every anchored carcase from its target's. Pure and idempotent, like the
// three regeneration passes it runs beside.
//
// An anchor is honoured only if it names a live carcase other than itself with the same parent: a
// cross-frame anchor would have to compose through two different ancestor chains, and nothing asks
// for one. Anything else is DETACHED — the cabinet keeps the position it last had rather than
// snapping to the origin, which is the difference between a cabinet you can find again and one you
// cannot.
export function resolvePlacement(scene: Scene): Scene {
  const carcases = new Map<ComponentId, CarcaseComponent>()
  for (const c of scene.components) if (c.kind === 'carcase') carcases.set(c.id, c)

  const targetOf = (c: CarcaseComponent): CarcaseComponent | undefined => {
    if (c.anchor === undefined) return undefined
    const t = carcases.get(c.anchor.to)
    // `t.id === c.id` is redundant today: a self-anchor is a one-length chain, and the cycle pass
    // below already detaches it. It stays anyway — it states the spec's "other than itself" rule
    // right where a reader is looking for it, and it keeps that rule true on its own rather than
    // leaving it to depend on the cycle detector staying shaped the way it is now.
    if (t === undefined || t.id === c.id || t.parentId !== c.parentId) return undefined
    return t
  }

  // A cycle among anchors is a second graph over the same components — componentTree's guards watch
  // parentId, not this. Detach every member of a chain that revisits an id, rather than guessing
  // which link the user meant.
  const detached = new Set<ComponentId>()
  for (const c of carcases.values()) {
    if (c.anchor === undefined) continue
    if (targetOf(c) === undefined) {
      detached.add(c.id)
      continue
    }
    const seen = new Set<ComponentId>([c.id])
    let cur = targetOf(c)
    while (cur !== undefined) {
      if (seen.has(cur.id)) {
        detached.add(c.id)
        break
      }
      seen.add(cur.id)
      cur = targetOf(cur)
    }
  }

  const resolved = new Map<ComponentId, Vec3>()
  const positionOf = (c: CarcaseComponent): Vec3 => {
    const memo = resolved.get(c.id)
    if (memo !== undefined) return memo
    const anchor = c.anchor
    const target = targetOf(c)
    if (anchor === undefined || target === undefined || detached.has(c.id)) {
      resolved.set(c.id, c.position)
      return c.position
    }
    // Cycles are already detached, so this recursion terminates.
    const targetWorld = translatedBounds(
      rotatedBounds(boundsOf(target, scene.materials), target.rotation),
      positionOf(target),
    )
    const own = rotatedBounds(boundsOf(c, scene.materials), c.rotation)
    const next = anchoredPosition(anchor, targetWorld, own)
    resolved.set(c.id, next)
    return next
  }

  return {
    ...scene,
    components: scene.components.map((c) => {
      if (c.kind !== 'carcase') return c
      const next = positionOf(c)
      const drop = detached.has(c.id)
      const moved = next.x !== c.position.x || next.y !== c.position.y || next.z !== c.position.z
      // Referential identity when nothing changed: the "leaves everything else alone" tests read it,
      // and React re-renders on it.
      if (!drop && !moved) return c
      // `anchor: undefined` rather than a rest-destructure: the key is dropped by JSON.stringify on
      // save, every read site tests for undefined, and the shape stays legible at the call site.
      return drop ? { ...c, anchor: undefined, position: next } : { ...c, position: next }
    }),
  }
}
