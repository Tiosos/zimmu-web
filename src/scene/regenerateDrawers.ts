import type {
  BoardPart,
  BoxCut,
  CarcaseComponent,
  Component,
  ComponentId,
  CutDef,
  DrawerComponent,
  MaterialDef,
  Part,
  Scene,
} from './types'
import type { Rect, SectionId } from './sectionTree'
import { resolveCarcase } from './carcaseOpenings'
import { clearDepth } from './carcaseRoles'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import {
  defaultDrawerParams,
  drawerBoxMetrics,
  type DrawerBoxMetrics,
  type DrawerContext,
} from './drawerBox'
import { PART_COLORS } from './palette'

// Component ids are `cmp_<uuid>` and section ids are `sec_<uuid>`, so neither can contain a `|`.
// A released drawer names no opening at all, so it is kept out of the map rather than keyed on a
// stringified `null` — which is a key a section could never be called, right up until one is.
const keyOf = (cabinetId: ComponentId | null, sectionId: SectionId): string =>
  `${cabinetId}|${sectionId}`

// A drawer names its own material and, until the panel lets a user pick one, names nothing at all.
// So the fallback is what stands between a default drawer and a box with zero-thickness sides —
// 15 mm, the conventional drawer side. Stated here rather than in `drawerBox.ts`: it is what to do
// about an unresolved material, not a figure about a box.
const DEFAULT_BOX_SIDE_THICKNESS = 15

function boxSideThickness(drawer: DrawerComponent, materials: Record<string, MaterialDef>): number {
  return materials[drawer.params.material]?.thickness ?? DEFAULT_BOX_SIDE_THICKNESS
}

// Where one drawer's box goes, and everything about it the CABINET states. The drawer states the
// rest, so this is `DrawerContext` less the one field the drawer owns.
interface DrawerSite {
  sectionId: SectionId
  // The SECTION's own rectangle, never the front cell: `frontCells` expands an overlay front to the
  // material midline, so a box sized off a cell would be 33 mm too wide on a Base 600.
  opening: Rect
  ctx: Omit<DrawerContext, 'sideThickness'>
}

// Which openings of a cabinet wear a drawer front, in the order `sectionOpenings` states — bottom
// left first, up a column before across — and where each one's box has to fit. `null` where the
// cabinet cannot be resolved at all.
//
// Asked through `resolveCarcase` rather than re-derived here: it is the stated chain from a cabinet
// to its openings, and a second copy would be free to disagree with the scene tree about which
// opening is which.
function drawerSitesOf(cabinet: CarcaseComponent, scene: Scene): DrawerSite[] | null {
  const resolved = resolveCarcase(cabinet, scene.parts, scene.materials)
  if (resolved === null) return null
  const p = cabinet.params
  // Safe only after `resolveCarcase`: it validates through this same resolver, so a slot that
  // cannot say how thick it is has already returned null above rather than throwing here.
  const thicknessOf = roleThicknessFor(p, scene.materials, overridesOf(scene.parts, cabinet.id))
  const clear = clearDepth(p, p.backMode === 'none' ? 0 : thicknessOf('back'))
  return resolved.openings
    .filter((o) => o.section.front?.kind === 'drawer-front')
    .map((o) => ({
      sectionId: o.sectionId,
      opening: o.rect,
      ctx: {
        clearDepth: clear,
        // Only a two-leaf door has a leaf 1, so a drawer front's role key always ends in 0.
        frontThickness: thicknessOf(`front-${o.sectionId}-0`),
        inset: p.frontMount === 'inset',
      },
    }))
}

type BoxRole = 'box-left' | 'box-right' | 'box-front' | 'box-back' | 'box-bottom'

interface BoxBoard {
  role: BoxRole
  label: string
  length: number
  width: number
  thickness: number
  cuts: BoxCut[]
}

// The five boards a box is, derived from the one statement of its geometry. The bottom's size
// follows the groove rather than being a sixth number that can drift out of step with it.
function boxBoards(m: DrawerBoxMetrics, t: number): BoxBoard[] {
  const depth = m.box.y1 - m.box.y0
  const height = m.box.z1 - m.box.z0
  const insideWidth = m.box.x1 - m.box.x0 - 2 * t
  const insideDepth = depth - 2 * t
  const grooveAdd = m.groove === null ? 0 : 2 * m.groove.depth

  // Board x runs a panel's length and board y its width, so a groove `up` from the bottom edge is a
  // slot at y = up: as wide as the board it captures, and only as deep into the face as the groove
  // figure. Not a through-cut — that would saw the side in two along its length.
  const groove = (length: number): BoxCut[] =>
    m.groove === null
      ? []
      : [
          {
            kind: 'box',
            id: 'groove_bottom',
            label: 'Bottom groove',
            face: '-Z',
            position: { x: 0, y: m.groove.up, z: 0 },
            size: { x: length, y: t, z: m.groove.depth },
          },
        ]

  return [
    {
      role: 'box-left',
      label: 'Box side L',
      length: depth,
      width: height,
      thickness: t,
      cuts: groove(depth),
    },
    {
      role: 'box-right',
      label: 'Box side R',
      length: depth,
      width: height,
      thickness: t,
      cuts: groove(depth),
    },
    {
      role: 'box-front',
      label: 'Box front',
      length: insideWidth,
      width: height,
      thickness: t,
      cuts: groove(insideWidth),
    },
    {
      role: 'box-back',
      label: 'Box back',
      length: insideWidth,
      width: height,
      thickness: t,
      cuts: groove(insideWidth),
    },
    {
      role: 'box-bottom',
      label: 'Box bottom',
      length: insideDepth + grooveAdd,
      width: insideWidth + grooveAdd,
      thickness: t,
      cuts: [],
    },
  ]
}

// Reconciled by role key, the shape `regenerateOne` already uses for a carcase's panels: a detached
// board is the user's and comes back untouched, a driven one is rebuilt, and one whose role the box
// no longer implies is deleted. An empty `wanted` is therefore the decline path, stated by not
// being stated — the generator emits nothing rather than inventing a size.
function reconcileBoards(
  parts: Part[],
  drawer: DrawerComponent,
  wanted: BoxBoard[],
  material: string,
): Part[] {
  const mine = parts.filter((p) => p.parentId === drawer.id)
  const others = parts.filter((p) => p.parentId !== drawer.id)
  const byRole = new Map<string, Part>()
  for (const p of mine) if (p.role !== undefined) byRole.set(p.role, p)

  const roles = new Set<string>(wanted.map((b) => b.role))
  const kept: Part[] = []
  for (const p of mine) {
    if (p.role !== undefined && roles.has(p.role)) continue // reconciled in the role pass below
    if (p.driven && p.role !== undefined) continue // driven, no longer implied → delete
    // Detached, or never role-bound: the user's. Keep it, and release a role key the box no longer
    // implies so a later regeneration cannot reclaim the part.
    kept.push(p.role === undefined ? p : { ...p, role: undefined })
  }

  const generated: Part[] = wanted.map((b, i) => {
    const existing = byRole.get(b.role)
    if (existing !== undefined && !existing.driven) return existing

    const own = b.cuts.map((c) => ({ ...c, sourceComponentId: drawer.id }))
    const existingCuts: CutDef[] = existing?.kind === 'board' ? existing.cuts : []
    const board: BoardPart = {
      kind: 'board',
      id: existing?.id ?? `board_${crypto.randomUUID()}`,
      label: existing?.label ?? b.label,
      length: b.length,
      width: b.width,
      thickness: b.thickness,
      grain: 'length',
      material,
      color: existing?.color ?? PART_COLORS[i % PART_COLORS.length],
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      // Only the drawer's own cuts are the drawer's to re-derive. A joint-owned cut belongs to
      // reconcileJoints and an untagged one to the user, exactly as on a carcase panel.
      cuts: [
        ...existingCuts.filter(
          (c) => !('sourceComponentId' in c && c.sourceComponentId !== undefined),
        ),
        ...own,
      ],
      visible: existing?.visible ?? true,
      parentId: drawer.id,
      driven: true,
      role: b.role,
    }
    return board
  })

  return [...others, ...kept, ...generated]
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
  // every keystroke, so an index would rebind a drawer to a different bay. Driven and detached
  // alike — a detached drawer *satisfies* its opening and is returned by identity, exactly as
  // `regenerateOne` returns a detached part rather than building a driven one beside it. Two boxes
  // in one bay is what keying over driven drawers only produced.
  const existing = new Map<string, DrawerComponent>()
  for (const c of scene.components) {
    if (c.kind === 'drawer' && c.sectionId !== null) existing.set(keyOf(c.parentId, c.sectionId), c)
  }

  const kept: DrawerComponent[] = []
  const claimed = new Set<DrawerComponent>()
  // Only a drawer whose cabinet resolved has one: a drawer carried through an unresolvable cabinet
  // is in `kept` with nowhere to put a box.
  const sites = new Map<DrawerComponent, DrawerSite>()
  const claim = (c: DrawerComponent): void => {
    kept.push(c)
    claimed.add(c)
  }

  for (const cabinet of carcases) {
    const openings = drawerSitesOf(cabinet, scene)
    // Unresolvable parameters preserve this cabinet's drawers rather than emptying it mid-keystroke,
    // the contract `regenerateOne` already keeps for parts. A drawer carries per-drawer parameters,
    // so deleting and recreating one would lose them for a width of `6` typed on the way to `600`.
    if (openings === null) {
      for (const c of existing.values()) if (c.parentId === cabinet.id) claim(c)
      continue
    }
    for (const site of openings) {
      const found = existing.get(keyOf(cabinet.id, site.sectionId))
      if (found !== undefined) {
        claim(found)
        sites.set(found, site)
        continue
      }
      const made: DrawerComponent = {
        kind: 'drawer',
        id: `cmp_${crypto.randomUUID()}`,
        label: 'Drawer',
        parentId: cabinet.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
        sectionId: site.sectionId,
        params: defaultDrawerParams('side-mount'),
        driven: true,
      }
      kept.push(made)
      sites.set(made, site)
    }
  }

  // A detached drawer is the user's: no regeneration and no deletion, exactly as a detached part is
  // preserved when its role disappears — and released the same way. A drawer left over here names
  // an opening that is gone, so its section id goes with it; keeping it would let the drawer
  // reclaim a later opening that happens to be rebuilt under the same id. A driven leftover is
  // dropped, as a driven part whose role disappeared is.
  const released: DrawerComponent[] = []
  for (const c of scene.components) {
    if (c.kind !== 'drawer' || c.driven || claimed.has(c)) continue
    released.push(c.sectionId === null ? c : { ...c, sectionId: null })
  }

  let parts = scene.parts
  for (const drawer of kept) {
    // A detached drawer is the user's, and its boards are ordinarily driven — so the per-board rule
    // in `reconcileBoards` cannot save them. Skipping is what preservation means here: it leaves
    // this drawer's parts exactly where they are.
    if (!drawer.driven) continue
    const site = sites.get(drawer)
    // Its cabinet did not resolve, so the drawer itself was carried over. Its boards are carried
    // with it: emptying a box mid-keystroke is the same defect one level down.
    if (site === undefined) continue
    const t = boxSideThickness(drawer, scene.materials)
    const metrics = drawerBoxMetrics(site.opening, drawer.params, { ...site.ctx, sideThickness: t })
    // No runner fits, or the box will not go in its own opening. The generator declines rather than
    // inventing a size, exactly as a door too thin to bore lists no hinge — a box beside a runner
    // the hardware list does not quote is a drawer nobody can build.
    parts = reconcileBoards(
      parts,
      drawer,
      metrics === null ? [] : boxBoards(metrics, t),
      drawer.params.material,
    )
  }

  const others: Component[] = scene.components.filter((c) => c.kind !== 'drawer')

  const next: Component[] = [...others, ...released, ...kept]
  // Element-wise, not set-wise: equal length and mutual membership would call a list holding one
  // drawer twice unchanged, which is exactly what a reconciliation key that had lost the section id
  // would produce.
  const unchanged =
    next.length === scene.components.length && next.every((c, i) => c === scene.components[i])
  const components = unchanged ? scene.components : next
  return components === scene.components && parts === scene.parts
    ? scene
    : { ...scene, components, parts }
}
