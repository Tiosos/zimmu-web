import type { CarcaseParams, Grain, ThicknessAxis } from './types'
import { dadoDepthFor } from '../geom/dado'
import { grainAxisOf, grainFieldFor } from './grain'
import type { RoleThickness } from './resolveThickness'
import type { CarcaseJointKind, RoleJointKind } from './resolveJointKind'
import { resolveSections, type FrontSpec, type ResolvedDivision, type ResolvedTree, type SectionId } from './sectionTree'
import { sectionInteriors } from './sectionInterior'
import { frontCells, frontRoleOf, type FrontCell } from './frontCells'
import {
  clearDepth,
  floorZ,
  frontGeometryOf,
  ladderMidRails,
  openingRect,
  orientedPanel,
  pinRow,
  sectionThickness,
  usableInteriorRect,
  type LocalBox,
  type PanelSpec,
} from './carcaseLayout'
import { validateCarcaseParams } from './carcaseValidation'
import { carcaseJoints } from './carcaseJoinery'
import {
  ADJUSTABLE_SHELF_SIDE_CLEARANCE,
  accessAperturesForSection,
  findShelfInsertionPath,
  frameAccessObstacles,
  type AccessObstacle,
} from './interiorAccess'

// How much narrower than its opening a loose shelf is cut, on each side. A chosen figure like
// MAX_LADDER_SPAN — enough that a shelf lifts in and out without binding, small enough not to read
// as a gap — not one derived from the material or from any tolerance the app knows about.
// How far behind the carcase face a loose shelf's front edge sits. A different figure for a
// different reason: `ADJUSTABLE_SHELF_SIDE_CLEARANCE` clears panels the shelf has to lift past, this clears
// whatever the cabinet ends up wearing. A shelf level with the carcase face rubs any door with an
// inset, and the door is not there to be measured against when the shelf is generated.
const SHELF_FRONT_SETBACK = 5

// What a front is called in the cutting list. A door and a false front are different parts to make
// and to price, so they are different words even where the geometry is identical.
const FRONT_LABEL: Record<FrontSpec['kind'], string> = {
  door: 'Door',
  'drawer-front': 'Drawer Front',
  'false-front': 'False Front',
  panel: 'Panel',
}

// Which pins the shelves sit on: `shelves` of them spread as evenly as the row allows. Spread over
// the *pin positions*, not over the section's height — a shelf can only rest where a pin is, and a
// ten-position row covers 288 mm of a 584 mm opening.
function shelfPins(shelves: number, pins: number): number[] {
  const seated: number[] = []
  for (let k = 0; k < shelves; k++) {
    const ideal = Math.round(((k + 1) * (pins - 1)) / (shelves + 1))
    // Strictly increasing: rounding puts two shelves on one pin as soon as the row is nearly as
    // short as the shelf count, and two boards in one place is worse than one pin higher up.
    const next = seated.length === 0 ? ideal : Math.max(ideal, seated[seated.length - 1] + 1)
    // A section with fewer pins than shelves seats what it can. Invalidating the whole cabinet
    // over one over-full opening is what the pin-count rule beside it already declines to do.
    if (next > pins - 1) break
    seated.push(next)
  }
  return seated
}

export interface RoleSpec {
  role: string
  label: string
  panel: PanelSpec
  grain: Grain
}

export interface RoleBox {
  role: string
  label: string
  box: LocalBox
  thicknessAxis: ThicknessAxis
}

// The carcase laid out face-to-face, before any joinery. Split from carcaseRoles because the
// extension pass needs boxes it can still grow, and because a box carries its thickness axis —
// the axis a joint at that panel's edge houses along.
//
// Ordered: the array is the build sequence downstream projects consume, so a role's index is part
// of the contract, not an artefact of how the function is written.
// Division labels carry an ordinal because they reach the user: the scene tree, the cutting list
// and the BOM all print them, and three panels all called "Shelf" is a worse cutting list than one
// that numbers them. A shelf also names its bay wherever there is more than one — which is what the
// pre-tree labels did, and dropping it was a regression only the e2e caught.
function divisionLabel(tree: ResolvedTree, d: ResolvedDivision): string {
  if (d.axis === 'vertical') return `Partition ${d.index + 1}`
  const bay = tree.placeOf(d.parentId)
  const inBays = bay !== undefined && bay.axis === 'vertical' && bay.count > 1
  return inBays ? `Bay ${bay.index + 1} Shelf ${d.index + 1}` : `Shelf ${d.index + 1}`
}

export function carcaseBoxes(p: CarcaseParams, thicknessOf: RoleThickness): RoleBox[] {
  if (validateCarcaseParams(p, thicknessOf).length > 0) return []

  const { width: W, height: H, depth: D } = p
  // Each panel's own thickness, read once. A shell edge is bounded by a specific panel, so which
  // one it is has to be named at every edge rather than shared between them.
  const TL = thicknessOf('left-side')
  const TR = thicknessOf('right-side')
  const TB = thicknessOf('bottom')
  const TT = p.hasTop ? thicknessOf('top') : 0
  const BT = p.backMode === 'none' ? 0 : thicknessOf('back')
  // A ladder is a frame *under* the carcase, so the carcase box starts on top of it. A toe kick is
  // a notch in sides that still run to the ground, so only the bottom panel rises. H is the total
  // height from the ground in every mode.
  const carcaseZ0 = p.baseMode === 'ladder' ? p.toeKickHeight : 0
  const floor = floorZ(p)
  const innerTop = p.hasTop ? H - TT : H
  const backY0 = clearDepth(p, BT)
  const shelfBackY = p.backMode === 'captured' ? backY0 : D
  const bayZ0 = floor + TB

  const boxes: RoleBox[] = [
    {
      role: 'left-side',
      label: 'Left Side',
      box: { x0: 0, x1: TL, y0: 0, y1: D, z0: carcaseZ0, z1: H },
      thicknessAxis: 'x',
    },
    {
      role: 'right-side',
      label: 'Right Side',
      box: { x0: W - TR, x1: W, y0: 0, y1: D, z0: carcaseZ0, z1: H },
      thicknessAxis: 'x',
    },
    {
      role: 'bottom',
      label: 'Bottom',
      box: { x0: TL, x1: W - TR, y0: 0, y1: D, z0: floor, z1: floor + TB },
      thicknessAxis: 'z',
    },
  ]

  if (p.hasTop) {
    boxes.push({
      role: 'top',
      label: 'Top',
      box: { x0: TL, x1: W - TR, y0: 0, y1: D, z0: H - TT, z1: H },
      thicknessAxis: 'z',
    })
  }

  if (p.backMode !== 'none') {
    // A captured back fills the opening it is let into. An applied one is screwed to the rear
    // edges, so it covers the shell instead: sized to the opening it would sit outside the carcase
    // and meet each panel along a line, touching everything and overlaying nothing.
    boxes.push({
      role: 'back',
      label: 'Back',
      box:
        p.backMode === 'applied'
          ? { x0: 0, x1: W, y0: D, y1: D + BT, z0: carcaseZ0, z1: H }
          : { x0: TL, x1: W - TR, y0: backY0, y1: backY0 + BT, z0: bayZ0, z1: innerTop },
      thicknessAxis: 'y',
    })
  }

  if (p.baseMode === 'toe-kick') {
    boxes.push({
      role: 'toe-kick',
      label: 'Toe Kick',
      box: {
        x0: TL,
        x1: W - TR,
        y0: p.toeKickSetback,
        y1: p.toeKickSetback + thicknessOf('toe-kick'),
        z0: 0,
        z1: floor,
      },
      thicknessAxis: 'y',
    })
  }

  if (p.baseMode === 'ladder') {
    const KS = p.toeKickSetback
    const KH = p.toeKickHeight
    const FR = thicknessOf('ladder-front')
    const BR = thicknessOf('ladder-back')
    const LR = thicknessOf('ladder-left')
    const RR = thicknessOf('ladder-right')
    boxes.push(
      {
        role: 'ladder-front',
        label: 'Base Front',
        box: { x0: 0, x1: W, y0: KS, y1: KS + FR, z0: 0, z1: KH },
        thicknessAxis: 'y',
      },
      {
        role: 'ladder-back',
        label: 'Base Back',
        box: { x0: 0, x1: W, y0: D - BR, y1: D, z0: 0, z1: KH },
        thicknessAxis: 'y',
      },
      {
        role: 'ladder-left',
        label: 'Base Left',
        box: { x0: 0, x1: LR, y0: KS + FR, y1: D - BR, z0: 0, z1: KH },
        thicknessAxis: 'x',
      },
      {
        role: 'ladder-right',
        label: 'Base Right',
        box: { x0: W - RR, x1: W, y0: KS + FR, y1: D - BR, z0: 0, z1: KH },
        thicknessAxis: 'x',
      },
    )
    const mids = ladderMidRails(p, thicknessOf)
    const spent = mids.reduce((sum, role) => sum + thicknessOf(role), 0)
    const span = (W - LR - RR - spent) / (mids.length + 1)
    // What the rails to this one's left have already spent, so each clear span is `span` wide
    // whether or not the rails are all the same thickness.
    let before = 0
    mids.forEach((role, i) => {
      const x0 = LR + (i + 1) * span + before
      const t = thicknessOf(role)
      before += t
      boxes.push({
        role,
        label: `Base Mid Rail ${i + 1}`,
        box: { x0, x1: x0 + t, y0: KS + FR, y1: D - BR, z0: 0, z1: KH },
        thicknessAxis: 'x',
      })
    })
  }

  const tree = resolveSections(
    p.section,
    openingRect(p, thicknessOf),
    sectionThickness(thicknessOf),
  )

  for (const d of tree.divisions) {
    const vertical = d.axis === 'vertical'
    const role = `division-${d.parentId}-${d.index}`
    boxes.push({
      role,
      label: divisionLabel(tree, d),
      box: {
        x0: d.rect.x0,
        x1: d.rect.x1,
        y0: 0,
        y1: d.kind === 'rail' ? thicknessOf(role) : shelfBackY,
        z0: d.rect.z0,
        z1: d.rect.z1,
      },
      thicknessAxis: vertical ? 'x' : 'z',
    })
  }

  const fronts = frontGeometryOf(p, tree)
  const cells: FrontCell[] = frontCells(p.section, tree, fronts)
  // How far forward the fronts stand: the frame's thickness where one was built, else nothing. One
  // member stands for all four — they share a slot.
  const frameDepth = fronts.frameOpenings === undefined ? 0 : thicknessOf('stile-left')

  // Fixed shelves inside a section, before the loose ones: a fixed shelf is structure and the pins
  // hold boards between them. Not a split — a split makes two sections and would want two fronts,
  // so a shelf *behind one door* has to come from the interior instead.
  let housed = 0
  for (const { sectionId, rect, spec } of sectionInteriors(p.section, tree)) {
    const n = spec.fixedShelves
    if (n < 1) continue
    const t = thicknessOf(`fixed-shelf-${sectionId}-0`)
    // The clear height the bays share, once the shelves have taken their own thickness out of it —
    // the same subtraction `resolveSpans` makes for a split, so n shelves leave n + 1 equal bays.
    const bay = (rect.z1 - rect.z0 - n * t) / (n + 1)
    for (let i = 0; i < n; i++) {
      const z0 = rect.z0 + (i + 1) * bay + i * t
      housed += 1
      boxes.push({
        role: `fixed-shelf-${sectionId}-${i}`,
        label: `Fixed Shelf ${housed}`,
        // The same depth extent a horizontal division has, because it is the same part. Jointed to
        // the uprights, so unlike a loose shelf it neither needs nor wants the clearances.
        box: { x0: rect.x0, x1: rect.x1, y0: 0, y1: shelfBackY, z0, z1: z0 + t },
        thicknessAxis: 'z',
      })
    }
  }

  const frontedSections = new Set(cells.map((c) => c.sectionId))
  // 0 unless this section actually wears an inset front: an opening with no door has nothing to
  // clear, and asking the *cabinet* instead of the section would set every shelf in the carcase
  // back because one opening has a door.
  const insetDepthOf = (sectionId: SectionId): number => {
    if (p.frontMount !== 'inset' || !frontedSections.has(sectionId)) return 0
    const frontThickness = thicknessOf(`front-${sectionId}-0`)
    // A framed inset front occupies the frame stock before it reaches the carcase interior.
    return Math.max(0, frontThickness - (fronts.frameOpenings?.has(sectionId) ? frameDepth : 0))
  }

  // Everything built so far is fixed structure. Loose shelves are installed independently, so
  // they never become obstacles for one another; the face-frame solids are added from the same
  // geometry that defines the apertures.
  const shelfAccessObstacles: AccessObstacle[] = [
    ...boxes.map((part) => ({ role: part.role, box: part.box })),
    ...frameAccessObstacles(fronts, frameDepth),
  ]

  // Loose shelves on pins, after the divisions: the build order runs shell, then what divides it,
  // then what sits inside. Keyed on the section's own id, the same way a division is keyed on the
  // id of the section it splits, so two openings that both hold shelves cannot name one board.
  let seated = 0
  for (const { sectionId, rect, spec } of sectionInteriors(p.section, tree)) {
    const a = spec.adjustable
    const usable = usableInteriorRect(rect, fronts.frameOpenings?.get(sectionId))
    const { first, count } = pinRow(usable, a)
    shelfPins(a.shelves, count).forEach((pin, i) => {
      const role = `adj-shelf-${sectionId}-${i}`
      const shelfThickness = thicknessOf(role)

      // The board's underside on the pin's centreline: an L-pin carries the shelf on an arm at
      // about the height of the hole it sits in, and modelling the pin itself would put hardware
      // in the cutting list to hold up a board.
      const z0 = first + pin * a.pitch
      const shelfBox: LocalBox = {
        x0: usable.x0 + ADJUSTABLE_SHELF_SIDE_CLEARANCE,
        x1: usable.x1 - ADJUSTABLE_SHELF_SIDE_CLEARANCE,
        // Set back at the front for the door it does not know about, and clear of the back panel
        // at the other end. A shelf that jams against the back cannot be tilted out past the
        // pins, and a shelf touching a panel it is not fixed to would read as an unjoined
        // contact on the joinery checklist.
        // An inset front stands in the first FT millimetres of the opening, so the shelf starts
        // behind it plus the same clearance it keeps from every other panel. An overlay front is
        // in front of y = 0 and costs nothing. The constant is the floor, never the answer.
        y0: Math.max(SHELF_FRONT_SETBACK, insetDepthOf(sectionId) + ADJUSTABLE_SHELF_SIDE_CLEARANCE),
        y1: shelfBackY - ADJUSTABLE_SHELF_SIDE_CLEARANCE,
        z0,
        z1: z0 + shelfThickness,
      }
      // Installed envelope and insertion path are different constraints. The rigid-body solver
      // must witness a collision-free path; a frame-only stile is never allowed to resize the
      // manufactured shelf merely to make the access test pass.
      const path = findShelfInsertionPath(
        shelfBox,
        accessAperturesForSection(sectionId, rect, fronts),
        shelfAccessObstacles,
        frameDepth,
      )
      if (path === null) return

      seated += 1
      boxes.push({
        role,
        // A cabinet-wide ordinal, like the pin rows label: which bay a leaf is in takes an ancestor
        // walk, and a shelf that only says "Adj Shelf" is a worse cutting list than a numbered one.
        label: `Adj Shelf ${seated}`,
        box: shelfBox,
        thicknessAxis: 'z',
      })
    })
  }

  // Fronts last: the build order runs shell, then what divides it, then what sits inside, then what
  // covers it. A front is housed in nothing, so no joint descriptor names it and the extension pass
  // in `carcaseRoles` passes it through face-to-face sized.
  let faced = 0
  for (const cell of cells) {
    const role = frontRoleOf(cell)
    const FT = thicknessOf(role)
    faced += 1
    boxes.push({
      role,
      label: `${FRONT_LABEL[cell.spec.kind]} ${faced}`,
      box: {
        x0: cell.rect.x0,
        x1: cell.rect.x1,
        // Inset sits in the opening, overlay in front of the carcase face. Both are measured from
        // y = 0, which is the cabinet's front throughout the generator — or, on a face frame, from
        // the frame's face: an inset door flush with it, an overlaying one standing on it.
        y0: p.frontMount === 'inset' ? -frameDepth : -frameDepth - FT,
        y1: p.frontMount === 'inset' ? -frameDepth + FT : -frameDepth,
        z0: cell.rect.z0,
        z1: cell.rect.z1,
      },
      thicknessAxis: 'y',
    })
  }

  return boxes
}

// How far past the housing's near face the housed panel's end runs: to the groove floor for a
// dado, clear through to the outer face for a finger corner, where the fingers need material on
// both sides of the joint line to mesh into.
//
// Nowhere at all for a screwed butt joint. There is no groove to reach into — the two panels meet
// face to face, which is where carcaseBoxes already put them — so a screwed cabinet's panels are
// exactly their butt sizes. Extending them by a thickness nobody removes would be silent: no
// error, just every housed panel in the cabinet too long, and a cutting list to match.
function extensionFor(kind: CarcaseJointKind, thickness: number): number {
  switch (kind) {
    case 'dado':
      return dadoDepthFor(thickness)
    case 'finger':
      return thickness
    case 'screw':
      return 0
  }
}

// A housing houses along its own thickness axis, and the panel it houses meets it end-on, so the
// only question is how far past the housing's near face that end runs.
function extendToward(housed: LocalBox, housing: LocalBox, ax: ThicknessAxis, into: number): void {
  const lo = `${ax}0` as const
  const hi = `${ax}1` as const
  if (housing[lo] + housing[hi] < housed[lo] + housed[hi]) housed[lo] = housing[hi] - into
  else housed[hi] = housing[lo] + into
}

// Face-to-face boxes plus what the joinery at each edge takes. Without this pass a panel is butt
// sized while its own joint expects it to reach the groove floor, and reconcileJoints closes the
// gap by *moving* the panel — twice, when both ends are housed, so one end ends up proud.
export function carcaseRoles(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
  kindOf: RoleJointKind,
): RoleSpec[] {
  const boxes = carcaseBoxes(p, thicknessOf)
  const byRole = new Map(boxes.map((b) => [b.role, b]))

  // The component id is only stamped on the descriptors; the extension reads their roles and kind.
  for (const d of carcaseJoints(p, thicknessOf, kindOf, '')) {
    // Both roles are always present: carcaseJoints derives its role names from the same parameters
    // carcaseBoxes builds its boxes from.
    const housing = byRole.get(d.housingRole)!
    const housed = byRole.get(d.housedRole)!
    const ax = housing.thicknessAxis
    const thickness = housing.box[`${ax}1`] - housing.box[`${ax}0`]
    extendToward(housed.box, housing.box, ax, extensionFor(d.kind, thickness))
  }

  return boxes.map((b) => ({
    role: b.role,
    label: b.label,
    panel: orientedPanel(b.box, b.thicknessAxis),
    grain: grainFieldFor(
      b.thicknessAxis,
      grainAxisOf(b.role, b.thicknessAxis === 'x' ? 'vertical' : 'horizontal'),
    ),
  }))
}

