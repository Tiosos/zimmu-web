import type { CarcaseComponent, Component, ComponentId, DrawerComponent, Scene } from './types'
import type { SectionId } from './sectionTree'
import { resolveCarcase } from './carcaseOpenings'
import { defaultDrawerParams } from './drawerBox'

// Component ids are `cmp_<uuid>` and section ids are `sec_<uuid>`, so neither can contain a `|`.
const keyOf = (cabinetId: ComponentId | null, sectionId: SectionId): string =>
  `${cabinetId}|${sectionId}`

// Which openings of a cabinet wear a drawer front, in the order `sectionOpenings` states — bottom
// left first, up a column before across. `null` where the cabinet cannot be resolved at all.
//
// Asked through `resolveCarcase` rather than re-derived here: it is the stated chain from a cabinet
// to its openings, and a second copy would be free to disagree with the scene tree about which
// opening is which.
function drawerOpeningsOf(cabinet: CarcaseComponent, scene: Scene): SectionId[] | null {
  const resolved = resolveCarcase(cabinet, scene.parts, scene.materials)
  if (resolved === null) return null
  return resolved.openings
    .filter((o) => o.section.front?.kind === 'drawer-front')
    .map((o) => o.sectionId)
}

// The only pass that adds or removes components.
//
// It runs BEFORE `regenerateComponents` because the carcase's slide machining reads drawer
// *parameters*, while the drawer reads nothing the carcase *emits* — its inputs are the section
// tree, the drawer params and the materials, all of which exist before the carcase pass. Run the
// other way round, the first pass after an opening becomes a drawer front bores no slide screws and
// the second does: convergence over two passes rather than idempotence in one.
export function regenerateDrawers(scene: Scene): Scene {
  const carcases = scene.components.filter((c): c is CarcaseComponent => c.kind === 'carcase')
  if (carcases.length === 0) return scene

  // Keyed by (cabinet, section) and never by index: the v12 divider shim rebuilds section ids on
  // every keystroke, so an index would rebind a drawer to a different bay. Driven only — a detached
  // drawer must not be reached into to satisfy an opening, which is the same rule that releases a
  // detached part's role key.
  const existing = new Map<string, DrawerComponent>()
  for (const c of scene.components) {
    if (c.kind === 'drawer' && c.driven) existing.set(keyOf(c.parentId, c.sectionId), c)
  }

  const kept: DrawerComponent[] = []

  for (const cabinet of carcases) {
    const openings = drawerOpeningsOf(cabinet, scene)
    // Unresolvable parameters preserve this cabinet's drawers rather than emptying it mid-keystroke,
    // the contract `regenerateOne` already keeps for parts. A drawer carries per-drawer parameters,
    // so deleting and recreating one would lose them for a width of `6` typed on the way to `600`.
    if (openings === null) {
      for (const c of existing.values()) if (c.parentId === cabinet.id) kept.push(c)
      continue
    }
    for (const sectionId of openings) {
      kept.push(
        existing.get(keyOf(cabinet.id, sectionId)) ?? {
          kind: 'drawer',
          id: `cmp_${crypto.randomUUID()}`,
          label: 'Drawer',
          parentId: cabinet.id,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
          sectionId,
          params: defaultDrawerParams('side-mount'),
          driven: true,
        },
      )
    }
  }

  // A detached drawer is the user's: no regeneration and no deletion, exactly as a detached part is
  // preserved when its role disappears.
  const others: Component[] = scene.components.filter((c) => c.kind !== 'drawer' || !c.driven)

  const next: Component[] = [...others, ...kept]
  // Element-wise, not set-wise: equal length and mutual membership would call a list holding one
  // drawer twice unchanged, which is exactly what a reconciliation key that had lost the section id
  // would produce.
  const unchanged =
    next.length === scene.components.length && next.every((c, i) => c === scene.components[i])
  return unchanged ? scene : { ...scene, components: next }
}
