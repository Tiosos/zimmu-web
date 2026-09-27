import type { CarcaseParams, Face, HoleArrayCut } from './types'
import type { RoleThickness } from './resolveThickness'
import type { RoleJointKind } from './resolveJointKind'
import { resolveSections, type Bound, type SectionId } from './sectionTree'
import { sectionInteriors } from './sectionInterior'
import { frontCells } from './frontCells'
import { cupRow, plateScrewRows, slideScrewRow } from './frontMachining'
import { drawerBoxMetrics, type DrawerParams } from './drawerBox'
import { clearDepth, frontGeometryOf, openingRect, PIN_DIAMETER, pinRow, sectionThickness, usableInteriorRect } from './carcaseLayout'
import { carcaseRoles } from './carcaseParts'

const LEFT_EDGE_FACE: Face = '+Z'
const RIGHT_EDGE_FACE: Face = '-Z'

// Which board face of a bounding upright looks into a section. A section's left bound is the panel
// on its *left*, so the section lies on that panel's +x side — board +Z, the same face the joinery
// table names. Only the left and right bounds appear here: a shelf rests on pins in the uprights
// beside it, never in the panels above and below it.
const BOUND_FACE = { left: LEFT_EDGE_FACE, right: RIGHT_EDGE_FACE } as const

// The role of the panel a bound names. `boundsOf` only ever puts a vertical division in the left or
// right slot, so a bound found there is always an upright.
function boundRole(bound: Bound, side: keyof typeof BOUND_FACE): string {
  return bound.kind === 'shell' ? `${side}-side` : `division-${bound.parentId}-${bound.index}`
}

// The shelf-pin rows a carcase drills, asked the only way round that can answer correctly: a row
// belongs to the *section* that needs it, and is contributed to the panels bounding that section.
// A panel's rows are the union of what every section it bounds asks for — which is why a divider
// beside a drawer bank is bored on one face and not on two.
//
// Read against the reconciled panel rather than the raw parameters: a divider is shorter than a
// side and starts a bay above the floor, so the section's own floor has to be measured against the
// panel the row lands on.
export function carcaseHoleArrays(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
  kindOf: RoleJointKind,
  role: string,
): HoleArrayCut[] {
  const radius = PIN_DIAMETER / 2
  // Empty for a carcase whose parameters do not build, which is what makes every line below safe:
  // nothing here resolves a thickness or a rectangle for a cabinet the validator rejected.
  const panel = carcaseRoles(p, thicknessOf, kindOf).find((r) => r.role === role)?.panel
  if (panel === undefined) return []

  const tree = resolveSections(
    p.section,
    openingRect(p, thicknessOf),
    sectionThickness(thicknessOf),
  )
  const fronts = frontGeometryOf(p, tree)

  // Two thirds of the panel this row is bored into: deep enough to seat a pin, never a through
  // hole — which is a statement about that panel, not about the cabinet.
  const depth = Math.min(12, (thicknessOf(role) * 2) / 3)

  const cuts: HoleArrayCut[] = []
  for (const { sectionId, rect, bounds, spec } of sectionInteriors(p.section, tree)) {
    const a = spec.adjustable
    if (a.count <= 0 || a.setback < radius || a.backSetback < radius) continue
    // At most one: a panel cannot bound the same section on both sides.
    const side = (['left', 'right'] as const).find((s) => boundRole(bounds[s], s) === role)
    if (side === undefined) continue

    // The same row the shelves are seated on, so a shelf can never rest on a pin the cabinet did
    // not bore. Carried into the panel's frame: board y runs the carcase height and the panel's
    // origin is its own bottom edge.
    const usable = usableInteriorRect(rect, fronts.frameOpenings?.get(sectionId))
    const { first: firstZ, count } = pinRow(usable, a)
    if (count < 1) continue
    const first = firstZ - panel.position.z

    const face = BOUND_FACE[side]
    const rows = [a.setback, panel.length - a.backSetback].slice(0, a.rows)
    for (const [r, alongDepth] of rows.entries()) {
      cuts.push({
        kind: 'hole-array' as const,
        // Unique per (panel, section, row): one panel carries a row for every shelved section it
        // bounds, and an id that named only the panel would let the second silently replace the
        // first.
        id: `holes_${role}_${sectionId}_${r}`,
        label: `Shelf pins ${cuts.length + 1}`,
        face,
        // Board x runs the carcase depth and board y the height, so a vertical row marches along
        // the second of the face's two in-face axes.
        axis: 'V' as const,
        // The row starts on the face it is bored through: OCCT drills from `start` into the panel.
        start: { x: alongDepth, y: first, z: face === '+Z' ? panel.thickness : 0 },
        pitch: a.pitch,
        count,
        diameter: PIN_DIAMETER,
        depth,
      })
    }
  }
  return cuts
}

// The machining a front implies, asked the same way `carcaseHoleArrays` is: given a panel, what
// does it need? Most of the answer is not on the front — a cup is bored into the door, the plate
// screws that carry it into the upright beside it — so this answers for a side as readily as for a
// door. `frontMachining.ts` owns every figure; this owns only which panel gets which row.
export function carcaseMachining(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
  kindOf: RoleJointKind,
  role: string,
  // The drawer of each opening that wears one: its *parameters* and its side material's thickness,
  // never its emitted boards — which is what keeps this pass a function in one direction. Returns
  // null for an opening with no drawer, in which case no slide row is bored. Side thickness is
  // resolved by the caller because this function has no access to `scene.materials`.
  drawerFor: (sectionId: SectionId) => { params: DrawerParams; sideThickness: number } | null,
): HoleArrayCut[] {
  // Empty for a carcase whose parameters do not build, which is what makes every line below safe.
  const panel = carcaseRoles(p, thicknessOf, kindOf).find((r) => r.role === role)?.panel
  if (panel === undefined) return []

  const tree = resolveSections(
    p.section,
    openingRect(p, thicknessOf),
    sectionThickness(thicknessOf),
  )
    const cells = frontCells(p.section, tree, fronts)

  const cuts: HoleArrayCut[] = []
  for (const cell of cells) {
    const frontRole = `front-${cell.sectionId}-${cell.leaf}`

    // On the front itself: only a door, and only its cups.
    if (role === frontRole) {
      if (cell.spec.kind !== 'door' || cell.hinge === undefined) continue
      // Face-frame hinges are stage 4. Until then a framed door is bored for nothing: a frameless
      // pattern would put its plates in a side the stile covers, and the hardware list would quote
      // hinges off those bores. Declining is what a door too thin to bore already does.
      if (fronts.frameOpenings?.has(cell.sectionId)) continue
      const cup = cupRow(panel, cell.hinge, frontRole)
      if (cup !== null) cuts.push(cup)
      continue
    }

    // On the carcase: which side of this cell is this panel, if either? The same question the pin
    // rows ask, through the same two helpers, so the two families cannot disagree about which
    // upright bounds which opening.
    const bounds = tree.boundsOf(cell.sectionId)
    const side = (['left', 'right'] as const).find((s) => boundRole(bounds[s], s) === role)
    if (side === undefined) continue
    const face = BOUND_FACE[side]

    if (cell.spec.kind === 'door') {
      // Stage 4, as above: the plates follow the cups, and a framed door has none.
      if (fronts.frameOpenings?.has(cell.sectionId)) continue
      // The upright a door is *hinged on* carries its plates, and no other. A row bored into the
      // upright on the handle side is a row of holes nothing will ever use — the same defect Stage D
      // fixed for pin rows, one family further out. A two-leaf pair is hinged at both outer edges,
      // so each leaf claims its own side and between them they claim both.
      if (cell.hinge !== side) continue
      const door = carcaseRoles(p, thicknessOf, kindOf).find((r) => r.role === frontRole)?.panel
      if (door === undefined) continue
      const cup = cupRow(door, cell.hinge, frontRole)
      if (cup === null) continue
      // Carried across through *carcase* space, reading each panel's own origin: board x on the
      // door runs the carcase height from the door's bottom edge, board y on the upright runs it
      // from the upright's. The two edges are at different heights — a toe-kick side starts on the
      // floor and the door it carries starts above the bottom panel — so a figure copied straight
      // over would hang the door on a slope.
      const heights = Array.from(
        { length: cup.count },
        (_, i) => door.position.z + cup.start.x + cup.pitch * i - panel.position.z,
      )
      cuts.push(...plateScrewRows(panel, face, heights, frontRole))
      continue
    }

    if (cell.spec.kind === 'drawer-front') {
      // The runner mounts to the box side and the screws in the upright follow it, so the height is
      // read through `drawerBoxMetrics` — the one statement of the box's geometry — rather than off
      // the front's centreline as it was before a box existed to measure from. The box and the
      // screws that carry it cannot drift apart because both read this figure. The section's own
      // rectangle, never the cell: `frontCells` expands an overlay front past the opening.
      const drawer = drawerFor(cell.sectionId)
      if (drawer === null) continue
      const sectionRect = tree.rects.get(cell.sectionId)
      if (sectionRect === undefined) continue
      const drawerOpening = usableInteriorRect(
        sectionRect,
        fronts.frameOpenings?.get(cell.sectionId),
      )
      const metrics = drawerBoxMetrics(drawerOpening, drawer.params, {
        clearDepth: clearDepth(p, thicknessOf('back')),
        frontThickness: thicknessOf(frontRole),
        inset: p.frontMount === 'inset',
        frameDepth: fronts.frameOpenings?.has(cell.sectionId) ? thicknessOf('stile-left') : 0,
        sideThickness: drawer.sideThickness,
      })
      // Declined, exactly as the box boards are — no runner fits, or the box will not go in its own
      // opening. A slide row beside a box the drawer generator refused to build is screws for a
      // runner nobody ordered.
      if (metrics === null) continue
      cuts.push(slideScrewRow(panel, face, metrics.runnerZ - panel.position.z, frontRole))
    }
  }
  return cuts
}

