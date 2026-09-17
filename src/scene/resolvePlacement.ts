import type { CarcaseComponent, ComponentId, Scene, Vec3 } from './types'
import { anchoredPosition, translatedBounds } from './anchor'
import { localRotatedBoundsOf } from './carcaseWorldBounds'

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
  // parentId, not this. Anchors form a functional graph (out-degree at most 1), so walking from `c`
  // either comes back to `c` itself — `c` is ON the cycle, detach it — or it runs into a node the
  // walk has already passed through that is NOT `c` — `c` is merely a bystander pointing INTO a
  // cycle that belongs to other components, and its own anchor is fine: that cycle's members get
  // detached when the outer loop visits them in turn, `positionOf` freezes their position once they
  // are, and `c` resolves against that frozen position like any other anchor. Detaching a bystander
  // here — which an earlier version of this loop did, by detaching `c` on ANY revisited id rather
  // than only its own — would strip a live anchor for no reason connected to `c` at all.
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
      if (cur.id === c.id) {
        detached.add(c.id)
        break
      }
      if (seen.has(cur.id)) break // someone else's cycle — c itself is not on it
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
    // Translated by the position the recursion is COMPUTING, never by `target.position` — which
    // is stale until that write happens, and would resolve a whole chain against old positions.
    // That is why this is not `worldBoundsOf(target, ...)`.
    const targetWorld = translatedBounds(
      localRotatedBoundsOf(target, scene.materials),
      positionOf(target),
    )
    const own = localRotatedBoundsOf(c, scene.materials)
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
      // Referential identity when nothing changed: it is what lets the round-trip tests use `toBe`
      // honestly, and it matches the convention the other passes follow — no consumer memoises on
      // it today.
      if (!drop && !moved) return c
      // `anchor: undefined` rather than a rest-destructure: the key is dropped by JSON.stringify on
      // save, every read site tests for undefined, and the shape stays legible at the call site.
      return drop ? { ...c, anchor: undefined, position: next } : { ...c, position: next }
    }),
  }
}
