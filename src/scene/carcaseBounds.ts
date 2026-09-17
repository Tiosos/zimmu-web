import type { CarcaseParams } from './types'
import type { RoleThickness } from './resolveThickness'
import { hasAnyFront } from './sectionTree'

// Axis-aligned box in a carcase's own frame. Named `Bounds3` rather than reusing `LocalBox` because
// this is a whole cabinet's envelope, not a panel's box, and the two must not be swapped by accident.
export interface Bounds3 {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

// Any role in the `front-` family resolves to the front material slot — `materialForRole` reads the
// family, never the section id — so this stands in for whichever front the cabinet actually has.
const FRONT_ROLE = 'front-bounds-0'

// What a cabinet OCCUPIES, not its structural shell. Three things fall outside the shell and every
// one of them matters when two cabinets are butted together:
//
//   - an applied back reaches behind y = D,
//   - an overlay front reaches in front of y = 0,
//   - a toe kick fills the floor-to-carcase gap, so the box reaches z = 0 in every base mode.
//
// The last is decisive: anchoring on the shell would leave every toe-kick cabinet floating its own
// kick height off the floor.
//
// Reads the cabinet's material SLOTS only, never its parts' overrides. Overrides live on emitted
// parts, and placement runs before they are emitted — reading them would turn this pass into a
// fixed-point iteration. The deliberate consequence: a per-part override that thickens one back
// does not shove the neighbour.
export function carcaseBounds(p: CarcaseParams, thicknessOf: RoleThickness): Bounds3 {
  const front = p.frontMount === 'overlay' && hasAnyFront(p.section) ? thicknessOf(FRONT_ROLE) : 0
  const back = p.backMode === 'applied' ? thicknessOf('back') : 0
  return {
    x0: 0,
    x1: p.width,
    y0: 0 - front,
    y1: p.depth + back,
    z0: 0,
    z1: p.height,
  }
}
