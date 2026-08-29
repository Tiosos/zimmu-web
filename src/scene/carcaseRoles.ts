import type { BoxCut, CarcaseParams, Face, Grain, HoleArrayCut, ThicknessAxis, Vec3 } from './types'
import { dadoDepthFor } from '../geom/dado'
import { grainAxisOf, grainFieldFor } from './grain'
import type { RoleThickness } from './resolveThickness'
import type { CarcaseJointKind, RoleJointKind } from './resolveJointKind'
import {
  resolveSections,
  validateSection,
  type Bound,
  type DivisionThickness,
  type Rect,
  type ResolvedDivision,
  type ResolvedTree,
  type SectionBounds,
} from './sectionTree'
import { sectionInteriors, type AdjustableSpec } from './sectionInterior'

export type { ThicknessAxis }

export interface LocalBox {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

export interface PanelSpec {
  length: number
  width: number
  thickness: number
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
}

// Every carcase part is an axis-aligned panel; only which axis carries the material thickness
// differs. Each rotation maps all three board axes onto carcase axes positively, so the board's
// local origin always lands on the box's min corner and `position` needs no compensation.
export function orientedPanel(b: LocalBox, thicknessAxis: ThicknessAxis): PanelSpec {
  const dx = b.x1 - b.x0
  const dy = b.y1 - b.y0
  const dz = b.z1 - b.z0
  const position = { x: b.x0, y: b.y0, z: b.z0 }
  const rotationOrder = 'XYZ' as const

  if (thicknessAxis === 'z') {
    return {
      length: dx,
      width: dy,
      thickness: dz,
      position,
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder,
    }
  }
  if (thicknessAxis === 'x') {
    // board x→carcase y, y→z, z→x
    return {
      length: dy,
      width: dz,
      thickness: dx,
      position,
      rotation: { x: 0, y: 90, z: 90 },
      rotationOrder,
    }
  }
  // board x→carcase z, y→x, z→y
  return {
    length: dz,
    width: dx,
    thickness: dy,
    position,
    rotation: { x: -90, y: 0, z: -90 },
    rotationOrder,
  }
}

// Where the bottom panel sits. Shared by the validator and the role table so a shelf budget is
// never computed against a floor the generator does not use.
function floorZ(p: CarcaseParams): number {
  return p.baseMode === 'toe-kick' || p.baseMode === 'ladder' ? p.toeKickHeight : 0
}

// The rectangle the section tree divides: the clear opening between the shell panels. Each edge
// spends the thickness of the panel that bounds it — four separate panels, four separate calls —
// so a 25 mm left side moves x0 to 25 while an 18 mm right side leaves x1 where it was. A fixture
// whose panels are all the same thickness cannot tell the four apart.
export function openingRect(p: CarcaseParams, thicknessOf: RoleThickness): Rect {
  return {
    x0: thicknessOf('left-side'),
    x1: p.width - thicknessOf('right-side'),
    z0: floorZ(p) + thicknessOf('bottom'),
    z1: p.hasTop ? p.height - thicknessOf('top') : p.height,
  }
}

// A division panel is as thick as the panel it is, not as thick as the cabinet: the tree asks by
// parent section and index, which is exactly what the box table names the role after.
function sectionThickness(thicknessOf: RoleThickness): DivisionThickness {
  return (parentId, index) => thicknessOf(`division-${parentId}-${index}`)
}

// Total and side-effect free by contract: the generator calls this on every keystroke and emits
// nothing when it returns errors, so the last-good parts survive transient states like a width of
// `6` on the way to `600`. Every problem is collected — a panel that reported one at a time would
// turn fixing three mistakes into three round trips.
export function validateCarcaseParams(p: CarcaseParams, thicknessOf: RoleThickness): string[] {
  const errors: string[] = []

  // `roleThicknessFor` is fatal by design; here it must not be. The parameter panel validates on
  // every keystroke, so a slot whose material cannot say how thick it is has to read back as a
  // message beside the fields rather than as an exception that takes the app down mid-edit. Every
  // rule below reads thicknesses through this, so the function stays total.
  const unresolved = new Set<string>()
  const thicknessAt: RoleThickness = (role) => {
    try {
      return thicknessOf(role)
    } catch {
      // Named by slot, not by role: every role but the back draws on the same one, so one message
      // per slot is what the user can act on.
      const message =
        role === 'back'
          ? `backMaterial "${p.backMaterial}" has no thickness`
          : `carcaseMaterial "${p.carcaseMaterial}" has no thickness`
      if (!unresolved.has(message)) {
        unresolved.add(message)
        errors.push(message)
      }
      return 0
    }
  }
  const left = thicknessAt('left-side')
  const right = thicknessAt('right-side')
  const bottom = thicknessAt('bottom')
  // Charged against the height budget whether or not the cabinet has a top, as one cabinet-wide
  // thickness was: a carcase too short for two panels is too short for the one it does have.
  const top = thicknessAt('top')
  const back = p.backMode === 'none' ? 0 : thicknessAt('back')
  const ladderFront = p.baseMode === 'ladder' ? thicknessAt('ladder-front') : 0
  const ladderBack = p.baseMode === 'ladder' ? thicknessAt('ladder-back') : 0
  // Asked about, and the answer discarded: no rule below reads these, but every panel the box
  // table will build has to fail here, where an unusable material is a message, rather than there,
  // where it is a throw.
  if (p.baseMode === 'toe-kick') thicknessAt('toe-kick')
  if (p.baseMode === 'ladder') {
    thicknessAt('ladder-left')
    thicknessAt('ladder-right')
  }
  // Nothing below this can mean anything while a thickness is unknown.
  if (errors.length > 0) return errors

  if (Math.min(left, right, bottom, top) <= 0) errors.push('thickness must be positive')
  if (p.width <= left + right) errors.push('width must exceed 2 × thickness')
  if (p.height <= bottom + top) errors.push('height must exceed 2 × thickness')
  // The thickest shell panel is the one that runs out of depth first.
  if (p.depth <= Math.max(left, right, bottom, top)) errors.push('depth must exceed thickness')
  // Both bases spend toeKickHeight out of the total height: a toe kick lifts the bottom panel
  // inside sides that still reach the ground, a ladder lifts the whole carcase onto its frame.
  if (p.baseMode === 'toe-kick' || p.baseMode === 'ladder') {
    if (p.toeKickHeight >= p.height) {
      errors.push('toeKickHeight must be less than height')
    } else if (p.toeKickHeight + bottom + top >= p.height) {
      errors.push('toeKickHeight leaves no room between top and bottom')
    }
  }
  if (p.baseMode === 'toe-kick' && p.toeKickSetback >= p.depth) {
    errors.push('toeKickSetback must be less than depth')
  }
  // A ladder needs the setback to clear two rail thicknesses, not one: its side rails run
  // y:[KS+T, D-T] and invert — a negative extent OCCT sees as a degenerate solid — before the
  // front rail alone would run out of depth.
  if (p.baseMode === 'ladder' && p.toeKickSetback + ladderFront + ladderBack >= p.depth) {
    errors.push('toeKickSetback leaves no room for the ladder side rails')
  }
  if (p.backMode !== 'none' && back >= p.depth) {
    errors.push('the back material is thicker than the cabinet is deep')
  }
  errors.push(...validateSection(p.section))
  // The tree's own rules are about the tree; only the resolved rectangles know whether the cabinet
  // is big enough to hold it. A section squeezed to nothing does not produce a thin panel, it
  // produces panels that pass through the shell and through each other — which is what the v12
  // rules named `dividers` and `fixedShelves` were guarding against.
  const resolved = resolveSections(
    p.section,
    openingRect(p, thicknessAt),
    sectionThickness(thicknessAt),
  )
  for (const rect of resolved.rects.values()) {
    if (rect.x1 - rect.x0 <= 0 || rect.z1 - rect.z0 <= 0) {
      errors.push('the sections do not fit in the carcase')
      break
    }
  }
  return errors
}

// The widest clear span a ladder base is allowed to leave between two of its uprights. A chosen
// parameter of the rule — the span the existing four-edge frame already carries at a standard
// 600 mm base unit — not a figure derived from the material or from any deflection calculation.
// Change it and the rail count follows.
const MAX_LADDER_SPAN = 600

// A perimeter rectangle carries the cabinet bottom on its four edges alone, which is fine at
// 600 mm and not at 1200. The fewest mid rails that bring every clear span within the limit.
// Shared by the box, joint and contact tables so none of them can disagree on how many there are.
function ladderMidRails(p: CarcaseParams, thicknessOf: RoleThickness): string[] {
  // Two thicknesses with two meanings, and no longer one number: the frame's own outer rails bound
  // the clear width, and each mid rail spends its own thickness out of what is left. The rails
  // bound it rather than the side panels above them — the mid rails divide the frame, and the box
  // table below positions them from the same two edges.
  const clear = p.width - thicknessOf('ladder-left') - thicknessOf('ladder-right')
  const roles: string[] = []
  let spent = 0
  while ((clear - spent) / (roles.length + 1) > MAX_LADDER_SPAN) {
    const role = `ladder-mid-${roles.length}`
    spent += thicknessOf(role)
    roles.push(role)
  }
  return roles
}

const PIN_DIAMETER = 5

// How far above a section's own floor its first pin hole sits. A chosen figure — one increment of
// the system being modelled — not one derived from the panel or from the shelf: nothing can rest
// flush on a section's bottom, and 32 mm is the step every other hole in the row takes.
const FIRST_PIN_INSET = 32

// How much narrower than its opening a loose shelf is cut, on each side. A chosen figure like
// MAX_LADDER_SPAN — enough that a shelf lifts in and out without binding, small enough not to read
// as a gap — not one derived from the material or from any tolerance the app knows about.
const SHELF_CLEARANCE = 2

// The pin positions a section actually has: what its spec asked for, capped by what fits between
// its own floor and its own ceiling. Stated once because two things read it — the row of bores,
// and the shelves that have to sit on pins that exist.
function pinRow(rect: Rect, a: AdjustableSpec): { first: number; count: number } {
  const first = rect.z0 + FIRST_PIN_INSET
  const count = Math.min(a.count, Math.floor((rect.z1 - PIN_DIAMETER / 2 - first) / a.pitch) + 1)
  return { first, count }
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
  const backY0 = p.backMode === 'captured' ? D - BT : D
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

  // Loose shelves on pins, after the divisions: the build order runs shell, then what divides it,
  // then what sits inside. Keyed on the section's own id, the same way a division is keyed on the
  // id of the section it splits, so two openings that both hold shelves cannot name one board.
  let seated = 0
  for (const { sectionId, rect, spec } of sectionInteriors(p.section, tree)) {
    const a = spec.adjustable
    const { first, count } = pinRow(rect, a)
    shelfPins(a.shelves, count).forEach((pin, i) => {
      const role = `adj-shelf-${sectionId}-${i}`
      // The board's underside on the pin's centreline: an L-pin carries the shelf on an arm at
      // about the height of the hole it sits in, and modelling the pin itself would put hardware
      // in the cutting list to hold up a board.
      const z0 = first + pin * a.pitch
      seated += 1
      boxes.push({
        role,
        // A cabinet-wide ordinal, like the pin rows label: which bay a leaf is in takes an ancestor
        // walk, and a shelf that only says "Adj Shelf" is a worse cutting list than a numbered one.
        label: `Adj Shelf ${seated}`,
        box: {
          x0: rect.x0 + SHELF_CLEARANCE,
          x1: rect.x1 - SHELF_CLEARANCE,
          // Front edge flush with the carcase, where a fixed shelf sits and where the user looks;
          // the back edge clear of the back panel. A shelf that jams against the back cannot be
          // tilted out past the pins, and a shelf touching a panel it is not fixed to would read
          // as an unjoined contact on the joinery checklist.
          y0: 0,
          y1: shelfBackY - SHELF_CLEARANCE,
          z0,
          z1: z0 + thicknessOf(role),
        },
        thicknessAxis: 'z',
      })
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

export interface JointDescriptor {
  kind: CarcaseJointKind
  housingRole: string
  housedRole: string
  housingFace: Face
  housedEnd: Face
  sourceComponentId: string
  driven: true
}

// Board-local faces, so they follow the panel's thickness axis. A side and a divider are both
// thickness-on-x panels, which is why one pair of constants covers every housing here: an edge
// facing carcase +x presents its board +Z, and the panel it houses meets it with its own -X (for
// a thickness-on-z panel: bottom, top, shelf) or -Y (thickness-on-y: back, toe kick).
const LEFT_EDGE_FACE: Face = '+Z'
const RIGHT_EDGE_FACE: Face = '-Z'

interface SideSpec {
  role: string
  inward: Face
  endOfFlat: Face
  endOfUpright: Face
}

const SIDES: SideSpec[] = [
  { role: 'left-side', inward: LEFT_EDGE_FACE, endOfFlat: '-X', endOfUpright: '-Y' },
  { role: 'right-side', inward: RIGHT_EDGE_FACE, endOfFlat: '+X', endOfUpright: '+Y' },
]

interface Housing {
  role: string
  housingFace: Face
  housedEnd: Face
}

// What a division is housed into, and with which faces. Both branches are transcribed from the two
// rules the old code wrote separately — a partition into bottom and top, a shelf into whatever
// bounds its bay — so these face constants are the ones that were already shipping, not ones
// re-derived from the frames.
//
// The two panel kinds line up because a bound is always the same thickness axis as the shell panel
// it replaces: a shelf is thickness-on-z like bottom and top, a partition is thickness-on-x like a
// side, so one pair of faces covers a shell bound and a division bound alike.
function housingsFor(p: CarcaseParams, d: ResolvedDivision, parent: SectionBounds): Housing[] {
  const roleOf = (b: Bound, shell: string | null): string | null =>
    b.kind === 'division' ? `division-${b.parentId}-${b.index}` : shell

  if (d.axis === 'vertical') {
    // Was: add('dado', 'bottom', `divider-${i}`, '+Z', '-Y') / ('top', …, '-Z', '+Y')
    const below = roleOf(parent.bottom, 'bottom')
    const above = roleOf(parent.top, p.hasTop ? 'top' : null)
    return [
      ...(below === null
        ? []
        : [{ role: below, housingFace: '+Z' as Face, housedEnd: '-Y' as Face }]),
      ...(above === null
        ? []
        : [{ role: above, housingFace: '-Z' as Face, housedEnd: '+Y' as Face }]),
    ]
  }

  // Was: add('dado', left, `shelf-…`, LEFT_EDGE_FACE, '-X') / (right, …, RIGHT_EDGE_FACE, '+X')
  const left = roleOf(parent.left, 'left-side')
  const right = roleOf(parent.right, 'right-side')
  return [
    ...(left === null
      ? []
      : [{ role: left, housingFace: LEFT_EDGE_FACE, housedEnd: '-X' as Face }]),
    ...(right === null
      ? []
      : [{ role: right, housingFace: RIGHT_EDGE_FACE, housedEnd: '+X' as Face }]),
  ]
}

// The joints a carcase implies, keyed by role because part ids are only known after reconciliation.
//
// Screw fixing is joinery here, not hardware — the comment this replaces said the opposite of all
// three fastener methods. A ScrewJoint derives two hole arrays, clearance through one panel and
// pilots into the other's end, so a screwed cabinet emits the same role pairs the dado path does
// and gets its bores from them. Dowel and confirmat still emit nothing, for the reason screwing no
// longer has: neither is a kind in the Joint union, so there is nothing to derive geometry from.
export function carcaseJoints(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
  kindOf: RoleJointKind,
  componentId: string,
): JointDescriptor[] {
  if (validateCarcaseParams(p, thicknessOf).length > 0) return []
  if (
    p.jointMethod !== 'dado-rabbet' &&
    p.jointMethod !== 'finger' &&
    p.jointMethod !== 'butt-screw'
  )
    return []

  const out: JointDescriptor[] = []
  const add = (
    kind: CarcaseJointKind,
    housingRole: string,
    housedRole: string,
    housingFace: Face,
    housedEnd: Face,
  ) => {
    out.push({
      // What this pair is actually joined with: a joint the user took ownership of is the one
      // regeneration keeps, so it is the one the panels have to be sized to. `jointMethod` is only
      // the default the rest of this function derives.
      kind: kindOf(housingRole, housedRole) ?? kind,
      housingRole,
      housedRole,
      housingFace,
      housedEnd,
      sourceComponentId: componentId,
      driven: true,
    })
  }

  // A corner takes fingers only when the two outer faces are coplanar. A toe kick insets the bottom
  // while the sides still run to the floor, so that corner stays a dado — which is also the only
  // thing the suggestion engine would offer there.
  const finger = p.jointMethod === 'finger'
  const fingerBottom = finger && p.baseMode !== 'toe-kick'
  // Every pair the dado path names, a screwed cabinet names too, with the same two faces: the
  // panel that would house the groove is the one screwed through, and the panel that would sit in
  // it takes the pilots in its end. That is the pairing defaultScrewJoint is written to.
  const joinery: CarcaseJointKind = p.jointMethod === 'butt-screw' ? 'screw' : 'dado'

  for (const s of SIDES) {
    if (fingerBottom) add('finger', s.role, 'bottom', '-Y', s.endOfFlat)
    else add(joinery, s.role, 'bottom', s.inward, s.endOfFlat)
    if (p.hasTop) {
      if (finger) add('finger', s.role, 'top', '+Y', s.endOfFlat)
      else add(joinery, s.role, 'top', s.inward, s.endOfFlat)
    }
    if (p.backMode === 'captured') add(joinery, s.role, 'back', s.inward, s.endOfUpright)
    if (p.baseMode === 'toe-kick') add(joinery, s.role, 'toe-kick', s.inward, s.endOfUpright)
  }

  // The base frame is joined to itself: each side rail's end lands in the inner face of the
  // full-width rail crossing it. Nothing above the frame is jointed into it — the carcase is set
  // down on the frame's top plane, which carcaseContactPairs declares.
  if (p.baseMode === 'ladder') {
    for (const rail of ['ladder-left', 'ladder-right', ...ladderMidRails(p, thicknessOf)]) {
      add(joinery, 'ladder-front', rail, '+Z', '-X')
      add(joinery, 'ladder-back', rail, '-Z', '+X')
    }
  }

  // A captured back sits on the bottom and under the top, so they house it, not the other way
  // round. An applied back is screwed onto the rear edges instead — carcaseContactPairs declares it.
  if (p.backMode === 'captured') {
    add(joinery, 'bottom', 'back', '+Z', '-X')
    if (p.hasTop) add(joinery, 'top', 'back', '-Z', '+X')
  }

  // A division is housed at both ends into whatever bounds its parent section along the
  // perpendicular axis: a partition into the bottom and the top, a shelf into the two uprights of
  // its bay, whether those are the sides or the partitions beside it.
  const tree = resolveSections(
    p.section,
    openingRect(p, thicknessOf),
    sectionThickness(thicknessOf),
  )
  for (const d of tree.divisions) {
    if (d.kind === 'rail') continue // butt-jointed; no housing
    const housedRole = `division-${d.parentId}-${d.index}`
    for (const h of housingsFor(p, d, tree.boundsOf(d.parentId))) {
      add(joinery, h.role, housedRole, h.housingFace, h.housedEnd)
    }
  }

  return out
}

// Role pairs that touch and are deliberately left unjointed: a shelf stops at the back, it is not
// housed in it, and the kick carries the bottom rather than joining it. Independent of jointMethod —
// they abut whatever fastens the cabinet.
export function carcaseContactPairs(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
): [string, string][] {
  if (validateCarcaseParams(p, thicknessOf).length > 0) return []

  const pairs: [string, string][] = []
  if (p.baseMode === 'toe-kick') pairs.push(['bottom', 'toe-kick'])
  // Everything the ladder frame meets, it meets across one plane: the carcase is built as a box and
  // set down on the frame's top at z = toeKickHeight. The bottom lies flat on the rails exactly as
  // it lies on a toe kick, and each side's bottom edge lands on a rail's top edge — end to end, not
  // end into face. Screwed down through that plane, not joined into it.
  if (p.baseMode === 'ladder') {
    for (const rail of [
      'ladder-front',
      'ladder-back',
      'ladder-left',
      'ladder-right',
      ...ladderMidRails(p, thicknessOf),
    ]) {
      pairs.push(['bottom', rail])
    }
    for (const [side, rail] of [
      ['left-side', 'ladder-left'],
      ['right-side', 'ladder-right'],
    ] as const) {
      pairs.push([side, 'ladder-front'], [side, 'ladder-back'], [side, rail])
    }
  }
  // An applied back is screwed onto the back of the shell instead of being let into a groove in
  // it, so every panel it meets there is a contact rather than joinery.
  if (p.backMode === 'applied') {
    pairs.push(['back', 'left-side'], ['back', 'right-side'], ['back', 'bottom'])
    if (p.hasTop) pairs.push(['back', 'top'])
    // Covering the shell, the back runs down to the top of a ladder frame, where its bottom edge
    // lands on the back rail's top edge — the same set-down plane the sides and the bottom meet the
    // frame across, and screwed down through it just the same.
    if (p.baseMode === 'ladder') pairs.push(['back', 'ladder-back'])
  }
  if (p.backMode !== 'none') {
    const tree = resolveSections(
      p.section,
      openingRect(p, thicknessOf),
      sectionThickness(thicknessOf),
    )
    for (const d of tree.divisions) pairs.push(['back', `division-${d.parentId}-${d.index}`])
  }
  return pairs
}

// Cuts a carcase places on its own panels, independent of any joint. With a toe kick the sides run
// to the floor while the bottom sits on top of the kick, so the recess is blocked by the sides
// themselves until each is notched at the front bottom corner.
//
// The panel's board frame comes from orientedPanel(..., 'x'): board x runs the carcase depth axis,
// board y the height axis, board z the material thickness.
export function carcaseCuts(p: CarcaseParams, thicknessOf: RoleThickness, role: string): BoxCut[] {
  if (p.baseMode !== 'toe-kick') return []
  if (role !== 'left-side' && role !== 'right-side') return []

  const T = thicknessOf(role)
  return [
    {
      kind: 'box',
      id: `cut_toekick_${role}`,
      label: 'Toe Kick Notch',
      // The notch passes clear through the thickness, so it reads on the Face view.
      face: '-Z',
      // A tool face coplanar with the face it subtracts from is resolved unreliably by OCCT;
      // overshooting both thickness faces keeps it an unambiguous through-cut.
      position: { x: 0, y: 0, z: -T / 2 },
      size: { x: p.toeKickSetback, y: p.toeKickHeight, z: T * 2 },
    },
  ]
}

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
    const { first: firstZ, count } = pinRow(rect, a)
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

// Which carcase parameter, if any, a driven part's board dimension is a direct expression of.
// Used by the detach prompt to offer "change the cabinet" instead of "detach" where the edit has
// somewhere to go.
//
// Only *direct* one-to-one relationships are reported. A bottom panel's length is
// `width - 2 * thickness` — two parameters — so there is nothing unambiguous to push an edit into,
// and offering to change the cabinet there would silently pick one.
//
// No dimension maps to a thickness any more: thickness comes from the panel's material, and a
// cabinet-wide number to push it into no longer exists. An edit there has to become a material
// choice or a per-part override instead.
export function parameterForRole(
  role: string | undefined,
  dimension: 'length' | 'width' | 'thickness',
  p: CarcaseParams,
): keyof CarcaseParams | null {
  if (role === undefined || dimension === 'thickness') return null

  // A division — partition or shelf — spans whatever the tree gives it.
  if (role.startsWith('division-')) return null

  switch (role) {
    case 'left-side':
    case 'right-side':
      if (dimension === 'length') return 'depth'
      // The side spans carcaseZ0..H, so its width is the height parameter only when the carcase
      // starts on the ground. Under a ladder base it is height - toeKickHeight, and pushing an
      // edit into `height` would move the top without moving the bottom.
      return p.baseMode === 'ladder' ? null : 'height'
    case 'bottom':
    case 'top':
      return dimension === 'width' ? 'depth' : null
    default:
      return null
  }
}
