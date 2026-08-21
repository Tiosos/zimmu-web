import type { BoxCut, CarcaseParams, Face, Vec3 } from './types'

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
export function orientedPanel(b: LocalBox, thicknessAxis: 'x' | 'y' | 'z'): PanelSpec {
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

// Dividers cut the carcase into vertical bays and a bay is a consecutive pair of edges. Shared by
// the role table and the joint table so a change to bay layout cannot desynchronise the two.
function bayEdges(p: CarcaseParams): number[] {
  const { width: W, thickness: T } = p
  return [T, ...p.dividers.flatMap((d) => [W * d - T / 2, W * d + T / 2]), W - T]
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
  if (p.fixedShelves < 0) {
    errors.push('fixedShelves must be 0 or more')
  } else if (p.fixedShelves > 0) {
    // Shelf pitch is the one place where height, toe kick, top and shelf count all draw on the
    // same budget; a negative bay does not produce a degenerate shelf, it produces shelves that
    // pass through the bottom panel and through each other.
    const bayZ0 = floorZ(p) + p.thickness
    const innerTop = p.hasTop ? p.height - p.thickness : p.height
    if (innerTop - bayZ0 - p.fixedShelves * p.thickness <= 0) {
      errors.push('fixedShelves do not fit in the internal height')
    }
  }
  if (p.adjustableShelves.count < 0) errors.push('adjustable shelf count must be 0 or more')
  if (p.dividers.some((d) => d <= 0 || d >= 1)) {
    errors.push('dividers must lie strictly between 0 and 1')
  }
  if (p.dividers.some((d, i) => i > 0 && d <= p.dividers[i - 1])) {
    errors.push('dividers must be ascending')
  }
  // A divider is centred on its fraction and is T wide, so `0 < d < 1` is not enough: at d = 0.02
  // on a 600mm carcase it spans x[3,21] and runs straight through the left side at x[0,18].
  if (p.dividers.some((d) => p.width * d - p.thickness / 2 <= p.thickness)) {
    errors.push('dividers must clear the side panels')
  }
  if (p.dividers.some((d) => p.width * d + p.thickness / 2 >= p.width - p.thickness)) {
    errors.push('dividers must clear the side panels')
  }
  // Ascending is not enough either — two dividers can be ordered and still overlap, or leave a
  // bay too narrow to hold anything.
  if (p.dividers.some((d, i) => i > 0 && p.width * (d - p.dividers[i - 1]) <= p.thickness)) {
    errors.push('dividers must leave a bay between them')
  }
  return errors
}

export interface RoleSpec {
  role: string
  label: string
  panel: PanelSpec
}

// Ordered: the array is the build sequence downstream projects consume, so a role's index is part
// of the contract, not an artefact of how the function is written.
export function carcaseRoles(p: CarcaseParams): RoleSpec[] {
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

  const roles: RoleSpec[] = [
    {
      role: 'left-side',
      label: 'Left Side',
      panel: orientedPanel({ x0: 0, x1: T, y0: 0, y1: D, z0: carcaseZ0, z1: H }, 'x'),
    },
    {
      role: 'right-side',
      label: 'Right Side',
      panel: orientedPanel({ x0: W - T, x1: W, y0: 0, y1: D, z0: carcaseZ0, z1: H }, 'x'),
    },
    {
      role: 'bottom',
      label: 'Bottom',
      panel: orientedPanel({ x0: T, x1: W - T, y0: 0, y1: D, z0: floor, z1: floor + T }, 'z'),
    },
  ]

  if (p.hasTop) {
    roles.push({
      role: 'top',
      label: 'Top',
      panel: orientedPanel({ x0: T, x1: W - T, y0: 0, y1: D, z0: H - T, z1: H }, 'z'),
    })
  }

  if (p.backMode !== 'none') {
    roles.push({
      role: 'back',
      label: 'Back',
      panel: orientedPanel(
        { x0: T, x1: W - T, y0: backY0, y1: backY0 + BT, z0: bayZ0, z1: innerTop },
        'y',
      ),
    })
  }

  if (p.baseMode === 'toe-kick') {
    roles.push({
      role: 'toe-kick',
      label: 'Toe Kick',
      panel: orientedPanel(
        {
          x0: T,
          x1: W - T,
          y0: p.toeKickSetback,
          y1: p.toeKickSetback + T,
          z0: 0,
          z1: floor,
        },
        'y',
      ),
    })
  }

  if (p.baseMode === 'ladder') {
    const KS = p.toeKickSetback
    const KH = p.toeKickHeight
    roles.push(
      {
        role: 'ladder-front',
        label: 'Base Front',
        panel: orientedPanel({ x0: 0, x1: W, y0: KS, y1: KS + T, z0: 0, z1: KH }, 'y'),
      },
      {
        role: 'ladder-back',
        label: 'Base Back',
        panel: orientedPanel({ x0: 0, x1: W, y0: D - T, y1: D, z0: 0, z1: KH }, 'y'),
      },
      {
        role: 'ladder-left',
        label: 'Base Left',
        panel: orientedPanel({ x0: 0, x1: T, y0: KS + T, y1: D - T, z0: 0, z1: KH }, 'x'),
      },
      {
        role: 'ladder-right',
        label: 'Base Right',
        panel: orientedPanel({ x0: W - T, x1: W, y0: KS + T, y1: D - T, z0: 0, z1: KH }, 'x'),
      },
    )
  }

  p.dividers.forEach((d, i) => {
    roles.push({
      role: `divider-${i}`,
      label: `Divider ${i + 1}`,
      panel: orientedPanel(
        { x0: W * d - T / 2, x1: W * d + T / 2, y0: 0, y1: shelfBackY, z0: bayZ0, z1: innerTop },
        'x',
      ),
    })
  })

  // Shelves live inside a bay — a bookcase with a centre upright — so `fixedShelves` is a count
  // per bay.
  const edges = bayEdges(p)
  const shelfGap = (innerTop - bayZ0 - p.fixedShelves * T) / (p.fixedShelves + 1)
  for (let b = 0; b < edges.length / 2; b++) {
    for (let i = 0; i < p.fixedShelves; i++) {
      const z0 = bayZ0 + (i + 1) * shelfGap + i * T
      roles.push({
        role: `shelf-${b}-${i}`,
        label: p.dividers.length > 0 ? `Bay ${b + 1} Shelf ${i + 1}` : `Shelf ${i + 1}`,
        panel: orientedPanel(
          { x0: edges[b * 2], x1: edges[b * 2 + 1], y0: 0, y1: shelfBackY, z0, z1: z0 + T },
          'z',
        ),
      })
    }
  }

  return roles
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
    if (p.backMode !== 'none') add('dado', s.role, 'back', s.inward, s.endOfUpright)
    if (p.baseMode === 'toe-kick') add('dado', s.role, 'toe-kick', s.inward, s.endOfUpright)
  }

  // The back sits on the bottom and under the top, so they house it, not the other way round.
  if (p.backMode !== 'none') {
    add('dado', 'bottom', 'back', '+Z', '-X')
    if (p.hasTop) add('dado', 'top', 'back', '-Z', '+X')
  }

  // A divider spans floor to ceiling of the bay and never reaches a side.
  for (let i = 0; i < p.dividers.length; i++) {
    add('dado', 'bottom', `divider-${i}`, '+Z', '-Y')
    if (p.hasTop) add('dado', 'top', `divider-${i}`, '-Z', '+Y')
  }

  const bays = bayEdges(p).length / 2
  for (let b = 0; b < bays; b++) {
    const left = b === 0 ? 'left-side' : `divider-${b - 1}`
    const right = b === bays - 1 ? 'right-side' : `divider-${b}`
    for (let i = 0; i < p.fixedShelves; i++) {
      add('dado', left, `shelf-${b}-${i}`, LEFT_EDGE_FACE, '-X')
      add('dado', right, `shelf-${b}-${i}`, RIGHT_EDGE_FACE, '+X')
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
  if (p.backMode !== 'none') {
    for (let i = 0; i < p.dividers.length; i++) pairs.push(['back', `divider-${i}`])
    const bays = bayEdges(p).length / 2
    for (let b = 0; b < bays; b++) {
      for (let i = 0; i < p.fixedShelves; i++) pairs.push(['back', `shelf-${b}-${i}`])
    }
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

  // Shelves and dividers carry a bay index, and every one of them is material-thick.
  if (role.startsWith('shelf-') || role.startsWith('divider-')) {
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
