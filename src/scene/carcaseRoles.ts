import type { CarcaseParams, Vec3 } from './types'

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

  // Dividers cut the carcase into vertical bays and shelves live inside a bay — a bookcase with a
  // centre upright — so `fixedShelves` is a count per bay. Consecutive edges are one bay.
  const bayEdges = [T, ...p.dividers.flatMap((d) => [W * d - T / 2, W * d + T / 2]), W - T]
  const shelfGap = (innerTop - bayZ0 - p.fixedShelves * T) / (p.fixedShelves + 1)
  for (let b = 0; b < bayEdges.length / 2; b++) {
    for (let i = 0; i < p.fixedShelves; i++) {
      const z0 = bayZ0 + (i + 1) * shelfGap + i * T
      roles.push({
        role: `shelf-${b}-${i}`,
        label: p.dividers.length > 0 ? `Bay ${b + 1} Shelf ${i + 1}` : `Shelf ${i + 1}`,
        panel: orientedPanel(
          { x0: bayEdges[b * 2], x1: bayEdges[b * 2 + 1], y0: 0, y1: shelfBackY, z0, z1: z0 + T },
          'z',
        ),
      })
    }
  }

  return roles
}
