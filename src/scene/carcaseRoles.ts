import type { BoxCut, CarcaseParams, Face, Grain, HoleArrayCut, ThicknessAxis, Vec3 } from './types'
import { dadoDepthFor } from '../geom/dado'
import { grainAxisOf, grainFieldFor } from './grain'
import {
  resolveSections,
  validateSection,
  type Bound,
  type Rect,
  type ResolvedDivision,
  type ResolvedTree,
  type SectionBounds,
} from './sectionTree'

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

// The rectangle the section tree divides: the clear opening between the shell panels. Stage A
// spends one thickness on each side because CarcaseParams still carries one; Stage B of the wider
// restructure replaces each of these four with that panel's own resolved thickness, and a
// symmetric fixture will not catch a mistake there.
export function openingRect(p: CarcaseParams): Rect {
  return {
    x0: p.thickness,
    x1: p.width - p.thickness,
    z0: floorZ(p) + p.thickness,
    z1: p.hasTop ? p.height - p.thickness : p.height,
  }
}

// Total and side-effect free by contract: the generator calls this on every keystroke and emits
// nothing when it returns errors, so the last-good parts survive transient states like a width of
// `6` on the way to `600`. Every problem is collected — a panel that reported one at a time would
// turn fixing three mistakes into three round trips.
export function validateCarcaseParams(p: CarcaseParams): string[] {
  const errors: string[] = []
  if (p.thickness <= 0) errors.push('thickness must be positive')
  if (p.width <= 2 * p.thickness) errors.push('width must exceed 2 × thickness')
  if (p.height <= 2 * p.thickness) errors.push('height must exceed 2 × thickness')
  if (p.depth <= p.thickness) errors.push('depth must exceed thickness')
  // Both bases spend toeKickHeight out of the total height: a toe kick lifts the bottom panel
  // inside sides that still reach the ground, a ladder lifts the whole carcase onto its frame.
  if (p.baseMode === 'toe-kick' || p.baseMode === 'ladder') {
    if (p.toeKickHeight >= p.height) {
      errors.push('toeKickHeight must be less than height')
    } else if (p.toeKickHeight + 2 * p.thickness >= p.height) {
      errors.push('toeKickHeight leaves no room between top and bottom')
    }
  }
  if (p.baseMode === 'toe-kick' && p.toeKickSetback >= p.depth) {
    errors.push('toeKickSetback must be less than depth')
  }
  // A ladder needs the setback to clear two rail thicknesses, not one: its side rails run
  // y:[KS+T, D-T] and invert — a negative extent OCCT sees as a degenerate solid — before the
  // front rail alone would run out of depth.
  if (p.baseMode === 'ladder' && p.toeKickSetback + 2 * p.thickness >= p.depth) {
    errors.push('toeKickSetback leaves no room for the ladder side rails')
  }
  if (p.backMode !== 'none' && p.backThickness >= p.depth) {
    errors.push('backThickness must be less than depth')
  }
  if (p.adjustableShelves.count < 0) errors.push('adjustable shelf count must be 0 or more')
  errors.push(...validateSection(p.section))
  // The tree's own rules are about the tree; only the resolved rectangles know whether the cabinet
  // is big enough to hold it. A section squeezed to nothing does not produce a thin panel, it
  // produces panels that pass through the shell and through each other — which is what the v12
  // rules named `dividers` and `fixedShelves` were guarding against.
  const resolved = resolveSections(p.section, openingRect(p), () => p.thickness)
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
function ladderMidRails(p: CarcaseParams): string[] {
  let n = 0
  while ((p.width - 2 * p.thickness - n * p.thickness) / (n + 1) > MAX_LADDER_SPAN) n++
  return Array.from({ length: n }, (_, i) => `ladder-mid-${i}`)
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

export function carcaseBoxes(p: CarcaseParams): RoleBox[] {
  if (validateCarcaseParams(p).length > 0) return []

  const { width: W, height: H, depth: D, thickness: T, backThickness: BT } = p
  // A ladder is a frame *under* the carcase, so the carcase box starts on top of it. A toe kick is
  // a notch in sides that still run to the ground, so only the bottom panel rises. H is the total
  // height from the ground in every mode.
  const carcaseZ0 = p.baseMode === 'ladder' ? p.toeKickHeight : 0
  const floor = floorZ(p)
  const innerTop = p.hasTop ? H - T : H
  const backY0 = p.backMode === 'captured' ? D - BT : D
  const shelfBackY = p.backMode === 'captured' ? backY0 : D
  const bayZ0 = floor + T

  const boxes: RoleBox[] = [
    {
      role: 'left-side',
      label: 'Left Side',
      box: { x0: 0, x1: T, y0: 0, y1: D, z0: carcaseZ0, z1: H },
      thicknessAxis: 'x',
    },
    {
      role: 'right-side',
      label: 'Right Side',
      box: { x0: W - T, x1: W, y0: 0, y1: D, z0: carcaseZ0, z1: H },
      thicknessAxis: 'x',
    },
    {
      role: 'bottom',
      label: 'Bottom',
      box: { x0: T, x1: W - T, y0: 0, y1: D, z0: floor, z1: floor + T },
      thicknessAxis: 'z',
    },
  ]

  if (p.hasTop) {
    boxes.push({
      role: 'top',
      label: 'Top',
      box: { x0: T, x1: W - T, y0: 0, y1: D, z0: H - T, z1: H },
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
          : { x0: T, x1: W - T, y0: backY0, y1: backY0 + BT, z0: bayZ0, z1: innerTop },
      thicknessAxis: 'y',
    })
  }

  if (p.baseMode === 'toe-kick') {
    boxes.push({
      role: 'toe-kick',
      label: 'Toe Kick',
      box: {
        x0: T,
        x1: W - T,
        y0: p.toeKickSetback,
        y1: p.toeKickSetback + T,
        z0: 0,
        z1: floor,
      },
      thicknessAxis: 'y',
    })
  }

  if (p.baseMode === 'ladder') {
    const KS = p.toeKickSetback
    const KH = p.toeKickHeight
    boxes.push(
      {
        role: 'ladder-front',
        label: 'Base Front',
        box: { x0: 0, x1: W, y0: KS, y1: KS + T, z0: 0, z1: KH },
        thicknessAxis: 'y',
      },
      {
        role: 'ladder-back',
        label: 'Base Back',
        box: { x0: 0, x1: W, y0: D - T, y1: D, z0: 0, z1: KH },
        thicknessAxis: 'y',
      },
      {
        role: 'ladder-left',
        label: 'Base Left',
        box: { x0: 0, x1: T, y0: KS + T, y1: D - T, z0: 0, z1: KH },
        thicknessAxis: 'x',
      },
      {
        role: 'ladder-right',
        label: 'Base Right',
        box: { x0: W - T, x1: W, y0: KS + T, y1: D - T, z0: 0, z1: KH },
        thicknessAxis: 'x',
      },
    )
    const mids = ladderMidRails(p)
    const span = (W - 2 * T - mids.length * T) / (mids.length + 1)
    mids.forEach((role, i) => {
      const x0 = T + (i + 1) * span + i * T
      boxes.push({
        role,
        label: `Base Mid Rail ${i + 1}`,
        box: { x0, x1: x0 + T, y0: KS + T, y1: D - T, z0: 0, z1: KH },
        thicknessAxis: 'x',
      })
    })
  }

  const tree = resolveSections(p.section, openingRect(p), () => p.thickness)

  for (const d of tree.divisions) {
    const vertical = d.axis === 'vertical'
    boxes.push({
      role: `division-${d.parentId}-${d.index}`,
      label: divisionLabel(tree, d),
      box: {
        x0: d.rect.x0,
        x1: d.rect.x1,
        y0: 0,
        y1: d.kind === 'rail' ? T : shelfBackY,
        z0: d.rect.z0,
        z1: d.rect.z1,
      },
      thicknessAxis: vertical ? 'x' : 'z',
    })
  }

  return boxes
}

// A housing houses along its own thickness axis, and the panel it houses meets it end-on, so the
// only question is how far past the housing's near face that end runs: to the groove floor for a
// dado, clear through to the outer face for a finger corner, where the fingers need material on
// both sides of the joint line to mesh into.
function extendToward(housed: LocalBox, housing: LocalBox, ax: ThicknessAxis, into: number): void {
  const lo = `${ax}0` as const
  const hi = `${ax}1` as const
  if (housing[lo] + housing[hi] < housed[lo] + housed[hi]) housed[lo] = housing[hi] - into
  else housed[hi] = housing[lo] + into
}

// Face-to-face boxes plus what the joinery at each edge takes. Without this pass a panel is butt
// sized while its own joint expects it to reach the groove floor, and reconcileJoints closes the
// gap by *moving* the panel — twice, when both ends are housed, so one end ends up proud.
export function carcaseRoles(p: CarcaseParams): RoleSpec[] {
  const boxes = carcaseBoxes(p)
  const byRole = new Map(boxes.map((b) => [b.role, b]))

  // The component id is only stamped on the descriptors; the extension reads their roles and kind.
  for (const d of carcaseJoints(p, '')) {
    // Both roles are always present: carcaseJoints derives its role names from the same parameters
    // carcaseBoxes builds its boxes from.
    const housing = byRole.get(d.housingRole)!
    const housed = byRole.get(d.housedRole)!
    const ax = housing.thicknessAxis
    const thickness = housing.box[`${ax}1`] - housing.box[`${ax}0`]
    extendToward(
      housed.box,
      housing.box,
      ax,
      d.kind === 'dado' ? dadoDepthFor(thickness) : thickness,
    )
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
  kind: 'dado' | 'finger'
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
// Returns nothing for the three fastener methods: their geometry is hardware, not a cut.
export function carcaseJoints(p: CarcaseParams, componentId: string): JointDescriptor[] {
  if (validateCarcaseParams(p).length > 0) return []
  if (p.jointMethod !== 'dado-rabbet' && p.jointMethod !== 'finger') return []

  const out: JointDescriptor[] = []
  const add = (
    kind: 'dado' | 'finger',
    housingRole: string,
    housedRole: string,
    housingFace: Face,
    housedEnd: Face,
  ) => {
    out.push({
      kind,
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

  for (const s of SIDES) {
    if (fingerBottom) add('finger', s.role, 'bottom', '-Y', s.endOfFlat)
    else add('dado', s.role, 'bottom', s.inward, s.endOfFlat)
    if (p.hasTop) {
      if (finger) add('finger', s.role, 'top', '+Y', s.endOfFlat)
      else add('dado', s.role, 'top', s.inward, s.endOfFlat)
    }
    if (p.backMode === 'captured') add('dado', s.role, 'back', s.inward, s.endOfUpright)
    if (p.baseMode === 'toe-kick') add('dado', s.role, 'toe-kick', s.inward, s.endOfUpright)
  }

  // The base frame is joined to itself: each side rail's end lands in the inner face of the
  // full-width rail crossing it. Nothing above the frame is jointed into it — the carcase is set
  // down on the frame's top plane, which carcaseContactPairs declares.
  if (p.baseMode === 'ladder') {
    for (const rail of ['ladder-left', 'ladder-right', ...ladderMidRails(p)]) {
      add('dado', 'ladder-front', rail, '+Z', '-X')
      add('dado', 'ladder-back', rail, '-Z', '+X')
    }
  }

  // A captured back sits on the bottom and under the top, so they house it, not the other way
  // round. An applied back is screwed onto the rear edges instead — carcaseContactPairs declares it.
  if (p.backMode === 'captured') {
    add('dado', 'bottom', 'back', '+Z', '-X')
    if (p.hasTop) add('dado', 'top', 'back', '-Z', '+X')
  }

  // A division is housed at both ends into whatever bounds its parent section along the
  // perpendicular axis: a partition into the bottom and the top, a shelf into the two uprights of
  // its bay, whether those are the sides or the partitions beside it.
  const tree = resolveSections(p.section, openingRect(p), () => p.thickness)
  for (const d of tree.divisions) {
    if (d.kind === 'rail') continue // butt-jointed; no housing
    const housedRole = `division-${d.parentId}-${d.index}`
    for (const h of housingsFor(p, d, tree.boundsOf(d.parentId))) {
      add('dado', h.role, housedRole, h.housingFace, h.housedEnd)
    }
  }

  return out
}

// Role pairs that touch and are deliberately left unjointed: a shelf stops at the back, it is not
// housed in it, and the kick carries the bottom rather than joining it. Independent of jointMethod —
// they abut whatever fastens the cabinet.
export function carcaseContactPairs(p: CarcaseParams): [string, string][] {
  if (validateCarcaseParams(p).length > 0) return []

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
      ...ladderMidRails(p),
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
    const tree = resolveSections(p.section, openingRect(p), () => p.thickness)
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
export function carcaseCuts(p: CarcaseParams, role: string): BoxCut[] {
  if (p.baseMode !== 'toe-kick') return []
  if (role !== 'left-side' && role !== 'right-side') return []

  return [
    {
      kind: 'box',
      id: `cut_toekick_${role}`,
      label: 'Toe Kick Notch',
      // The notch passes clear through the thickness, so it reads on the Face view.
      face: '-Z',
      // A tool face coplanar with the face it subtracts from is resolved unreliably by OCCT;
      // overshooting both thickness faces keeps it an unambiguous through-cut.
      position: { x: 0, y: 0, z: -p.thickness / 2 },
      size: { x: p.toeKickSetback, y: p.toeKickHeight, z: p.thickness * 2 },
    },
  ]
}

const PIN_DIAMETER = 5

// Which board-local faces a role bores pins into. A side and a partition are both thickness-on-x
// panels, so the inner face is board ±Z — the same faces the joinery table names. A partition
// stands between two bays and carries a row on each of its faces; every other role carries none.
function pinFaces(role: string, thicknessAxis: ThicknessAxis): Face[] {
  if (role === 'left-side') return [LEFT_EDGE_FACE]
  if (role === 'right-side') return [RIGHT_EDGE_FACE]
  // Only a vertical division is an upright that carries pins; a horizontal one is a shelf.
  if (role.startsWith('division-') && thicknessAxis === 'x')
    return [LEFT_EDGE_FACE, RIGHT_EDGE_FACE]
  return []
}

// The shelf-pin rows a carcase drills into the panels that carry adjustable shelves. Read against
// the reconciled panel rather than the raw parameters: a divider is shorter than a side and starts
// a bay above the floor, and a row placed from the parameters alone would run off its end.
export function carcaseHoleArrays(p: CarcaseParams, role: string): HoleArrayCut[] {
  const a = p.adjustableShelves
  const radius = PIN_DIAMETER / 2
  if (a.count <= 0 || a.setback < radius || a.backSetback < radius) return []
  // A `division-` role does not say on its own whether it is a partition or a shelf; its box does.
  const box = carcaseBoxes(p).find((b) => b.role === role)
  if (box === undefined) return []
  const faces = pinFaces(role, box.thicknessAxis)
  if (faces.length === 0) return []
  const panel = carcaseRoles(p).find((r) => r.role === role)?.panel
  if (panel === undefined) return []

  // Two thirds of the panel thickness: deep enough to seat a pin, never a through hole.
  const depth = Math.min(12, (p.thickness * 2) / 3)

  // `startHeight` is a height above the carcase floor, not above the panel's own bottom edge. A
  // divider begins a bay up, so rows measured from each panel's own edge would sit at two
  // different heights across one bay and every shelf in the cabinet would rest on a slope.
  const first = a.startHeight - panel.position.z
  // A cabinet can be too short to hold the configured count. Dropping the holes that would run past
  // the panel's end is the only alternative to boring through it.
  const count = Math.min(a.count, Math.floor((panel.width - radius - first) / a.pitch) + 1)
  if (first < radius || count < 1) return []

  const rows = [a.setback, panel.length - a.backSetback].slice(0, a.rows)

  return faces.flatMap((face, f) =>
    rows.map((alongDepth, r) => {
      const i = f * rows.length + r
      return {
        kind: 'hole-array' as const,
        id: `holes_${role}_${i}`,
        label: `Shelf pins ${i + 1}`,
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
      }
    }),
  )
}

// Which carcase parameter, if any, a driven part's board dimension is a direct expression of.
// Used by the detach prompt to offer "change the cabinet" instead of "detach" where the edit has
// somewhere to go.
//
// Only *direct* one-to-one relationships are reported. A bottom panel's length is
// `width - 2 * thickness` — two parameters — so there is nothing unambiguous to push an edit into,
// and offering to change the cabinet there would silently pick one.
export function parameterForRole(
  role: string | undefined,
  dimension: 'length' | 'width' | 'thickness',
  p: CarcaseParams,
): keyof CarcaseParams | null {
  if (role === undefined) return null

  // A division — partition or shelf — spans whatever the tree gives it, and is material-thick.
  if (role.startsWith('division-')) {
    return dimension === 'thickness' ? 'thickness' : null
  }

  switch (role) {
    case 'left-side':
    case 'right-side':
      if (dimension === 'length') return 'depth'
      if (dimension === 'thickness') return 'thickness'
      // The side spans carcaseZ0..H, so its width is the height parameter only when the carcase
      // starts on the ground. Under a ladder base it is height - toeKickHeight, and pushing an
      // edit into `height` would move the top without moving the bottom.
      return p.baseMode === 'ladder' ? null : 'height'
    case 'bottom':
    case 'top':
      if (dimension === 'width') return 'depth'
      if (dimension === 'thickness') return 'thickness'
      return null
    case 'back':
      return dimension === 'thickness' ? 'backThickness' : null
    case 'toe-kick':
      return dimension === 'thickness' ? 'thickness' : null
    default:
      return null
  }
}
