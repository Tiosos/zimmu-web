import type {
  BoardPart,
  BoxCut,
  CarcaseComponent,
  Component,
  ComponentId,
  CutDef,
  DrawerComponent,
  Face,
  Grain,
  MaterialDef,
  Part,
  Scene,
  ThicknessAxis,
} from './types'
import type { Rect, SectionId } from './sectionTree'
import { resolveCarcase } from './carcaseOpenings'
import { clearDepth, orientedPanel, type LocalBox, type PanelSpec } from './carcaseRoles'
import { grainAxisOf, grainFieldFor } from './grain'
import { overridesOf, roleThicknessFor } from './resolveThickness'
import {
  defaultDrawerParams,
  drawerBoxMetrics,
  UNDERMOUNT_HOLE_ABOVE_NOTCH,
  UNDERMOUNT_HOLE_DEPTH,
  UNDERMOUNT_HOLE_DIAMETER,
  UNDERMOUNT_NOTCH_HEIGHT,
  UNDERMOUNT_NOTCH_WIDTH,
  type DrawerBoxMetrics,
  type DrawerContext,
  type RunnerFamily,
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
  panel: PanelSpec
  grain: Grain
  // Not `BoxCut[]`: an undermount back carries a hole array beside its notches.
  cuts: CutDef[]
}

// One wall of the box, as the carcase box it occupies. `minSide` says which end of its own thickness
// axis it sits on, and that is what decides where its groove goes: `orientedPanel` puts a board's
// local origin on the box's min corner, so a min-side wall meets the box's interior at board z = t
// while the wall facing it meets it at board z = 0.
interface BoxWall {
  role: BoxRole
  label: string
  box: LocalBox
  thicknessAxis: ThicknessAxis
  minSide: boolean
}

// Which board face of a wall looks at the box interior. `orientedPanel` puts a board's origin on
// its box's min corner, so a wall sitting on the min end of its own thickness axis meets the
// interior at board +Z and the wall facing it meets it at board −Z. The groove is cut into it and
// the undermount hook bore is drilled into it, which is why it is written once rather than twice.
const innerFaceOf = (minSide: boolean): Face => (minSide ? '+Z' : '-Z')

// The five boards a box is, derived from the one statement of its geometry and placed through the
// same `orientedPanel` mapping every carcase panel goes through — the codebase's one carcase-box-to-
// board map, which `GRAIN_IN_PLANE` is the stated contract of. The bottom's size follows the groove
// rather than being a sixth number that can drift out of step with it.
function boxBoards(m: DrawerBoxMetrics, t: number, family: RunnerFamily): BoxBoard[] {
  const b = m.box
  const gd = m.groove.depth
  const up = m.groove.up
  // The one difference the family makes to the box itself. An undermount back is notched for the
  // runner's locking devices, so it is the one wall that carries no groove — and it sits on a
  // bottom that runs the box's full depth rather than closing the end the bottom stops at.
  const notchedBack = family === 'undermount'
  // The clear rectangle between the four walls: what the front, back and bottom span.
  const inside = { x0: b.x0 + t, x1: b.x1 - t, y0: b.y0 + t, y1: b.y1 - t }

  // The bottom reaches `gd` into every wall that is grooved for it, so each of its dimensions grows
  // by the groove depth once per grooved edge: twice across the box's width, whose two walls are
  // always grooved, and once along its depth at the front. What happens at the OTHER end of the
  // depth is the family's one remaining difference — a grooved back takes the bottom `gd` into
  // itself, while an undermount bottom runs the box's full depth and the back sits on top of it.
  // That is how a TANDEM box is assembled and it gives the back a face to be screwed down to.
  //
  // Stated before the walls because the back reads its top: two statements of where the bottom's
  // upper face is would eventually leave the back floating above it or buried in it.
  const bottom: LocalBox = {
    x0: inside.x0 - gd,
    x1: inside.x1 + gd,
    y0: inside.y0 - gd,
    y1: notchedBack ? b.y1 : inside.y1 + gd,
    z0: b.z0 + up,
    z1: b.z0 + up + t,
  }

  const walls: BoxWall[] = [
    {
      role: 'box-left',
      label: 'Box side L',
      box: { ...b, x1: b.x0 + t },
      thicknessAxis: 'x',
      minSide: true,
    },
    {
      role: 'box-right',
      label: 'Box side R',
      box: { ...b, x0: b.x1 - t },
      thicknessAxis: 'x',
      minSide: false,
    },
    {
      role: 'box-front',
      label: 'Box front',
      box: { ...b, x0: inside.x0, x1: inside.x1, y1: b.y0 + t },
      thicknessAxis: 'y',
      minSide: true,
    },
    {
      role: 'box-back',
      label: 'Box back',
      // Only the undermount back is raised: it stands ON the bottom rather than beside it, so it
      // is shorter than the box by the groove height and the bottom's thickness together. A
      // side-mount back is grooved like the other three walls and runs the box's full height.
      box: {
        ...b,
        x0: inside.x0,
        x1: inside.x1,
        y0: b.y1 - t,
        z0: notchedBack ? bottom.z1 : b.z0,
      },
      thicknessAxis: 'y',
      minSide: false,
    },
  ]

  // The slot runs the full span of the wall at a fixed height above the box floor, and that height
  // is board y on a side but board x on the front or back — `orientedPanel` maps board x to carcase
  // y on a thickness-on-x panel and to carcase z on a thickness-on-y one. Only as deep into the face
  // as the groove figure: a through-cut would saw the wall in two along its length.
  const grooveOf = (w: BoxWall, panel: PanelSpec): BoxCut[] => [
    {
      kind: 'box',
      id: 'groove_bottom',
      label: 'Bottom groove',
      face: innerFaceOf(w.minSide),
      position: {
        x: w.thicknessAxis === 'y' ? up : 0,
        y: w.thicknessAxis === 'y' ? 0 : up,
        z: w.minSide ? t - gd : 0,
      },
      size: {
        x: w.thicknessAxis === 'y' ? t : panel.length,
        y: w.thicknessAxis === 'y' ? panel.width : t,
        z: gd,
      },
    },
  ]

  const cutsOf = (w: BoxWall, panel: PanelSpec): CutDef[] =>
    notchedBack && w.role === 'box-back' ? backNotches(w, panel, t) : grooveOf(w, panel)

  const boardOf = (
    role: BoxRole,
    label: string,
    box: LocalBox,
    thicknessAxis: ThicknessAxis,
    cuts: (panel: PanelSpec) => CutDef[],
  ): BoxBoard => {
    const panel = orientedPanel(box, thicknessAxis)
    return {
      role,
      label,
      panel,
      // Derived through the same pair `carcaseRoles` derives a panel's grain through. A hardcoded
      // field here would be a second copy of the grain table, and wrong for the front and back.
      grain: grainFieldFor(thicknessAxis, grainAxisOf(role)),
      cuts: cuts(panel),
    }
  }

  return [
    ...walls.map((w) => boardOf(w.role, w.label, w.box, w.thicknessAxis, (p) => cutsOf(w, p))),
    boardOf('box-bottom', 'Box bottom', bottom, 'z', () => []),
  ]
}

// A locking-device cut-out at each end of an undermount drawer back, with the runner's hook bore
// above it. Both are cuts the generator already emits and `shapeKey` already encodes, so the
// undermount box needs no new cut kind and no file-format change.
//
// The back is a thickness-on-y panel, so `orientedPanel` runs its HEIGHT along board x and its span
// across the box along board y — the notch is therefore as tall as board x and as wide as board y,
// the other way round from how the two figures read on the bench. The hook bore goes in the face
// that looks at the box interior, the same face the other three walls take their groove in: the
// runner reaches the back from inside the box, not through its outside.
//
// Both are placed from the back's own bottom edge, which the bottom now holds a groove height and a
// board thickness above the box floor — so in CARCASE space this whole pattern rose with the back.
// That is the height a device has to reach the back at now that the bottom runs beneath it, and it
// is what the notch clears. Whether a TANDEM device instead comes up THROUGH the bottom — which
// would put the cut-out in the bottom's rear corners and leave the back carrying only its bore — is
// a hardware question none of the sources reached here settle, and the same class of question as
// the notch figures themselves. Flagged in the notes rather than guessed at.
function backNotches(w: BoxWall, panel: PanelSpec, t: number): CutDef[] {
  const face = innerFaceOf(w.minSide)
  return [0, 1].flatMap((i): CutDef[] => {
    const y = i === 0 ? 0 : panel.width - UNDERMOUNT_NOTCH_WIDTH
    return [
      {
        kind: 'box',
        id: `notch_${i}`,
        label: 'Runner notch',
        face,
        // Oversize through the thickness, the convention every cut in this codebase follows: a cut
        // face coplanar with the board's own leaves OCCT resolving a zero-thickness face.
        position: { x: 0, y, z: -t / 2 },
        size: { x: UNDERMOUNT_NOTCH_HEIGHT, y: UNDERMOUNT_NOTCH_WIDTH, z: 2 * t },
      },
      {
        kind: 'hole-array',
        id: `locate_${i}`,
        label: 'Runner locating hole',
        face,
        axis: 'U',
        start: {
          x: UNDERMOUNT_NOTCH_HEIGHT + UNDERMOUNT_HOLE_ABOVE_NOTCH,
          y: y + UNDERMOUNT_NOTCH_WIDTH / 2,
          z: face === '+Z' ? panel.thickness : 0,
        },
        // One hole has no pitch.
        pitch: 0,
        count: 1,
        diameter: UNDERMOUNT_HOLE_DIAMETER,
        depth: UNDERMOUNT_HOLE_DEPTH,
      },
    ]
  })
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
      length: b.panel.length,
      width: b.panel.width,
      thickness: b.panel.thickness,
      grain: b.grain,
      material,
      color: existing?.color ?? PART_COLORS[i % PART_COLORS.length],
      position: b.panel.position,
      rotation: b.panel.rotation,
      rotationOrder: b.panel.rotationOrder,
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
      metrics === null ? [] : boxBoards(metrics, t, drawer.params.family),
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
