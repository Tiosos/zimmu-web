import type { CarcaseParams } from './types'
import type { RoleThickness } from './resolveThickness'
import { hasAnyFront } from './sectionTree'
import { frontGeometryOf } from './carcaseRoles'

// Axis-aligned box in a carcase's own frame. Named `Bounds3` rather than reusing `LocalBox` — the
// two are structurally identical, so TypeScript would accept either in the other's place — because
// this is a whole cabinet's envelope, not a panel's box, and a reader should never have to check
// which one a given box is.
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
//   - an overlay front, and a face frame, reach in front of y = 0,
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
  // A face frame stands in front of the carcase wherever one was built — with or without anything
  // hung on it — and a door that is not inset stands on whatever is in front: the frame, or the
  // carcase face. Asked through `frontGeometryOf` so a frame stage 1 declines counts for nothing,
  // exactly as it builds nothing. Not `=== 'overlay'`: half-overlay protrudes just as far.
  const frame = frontGeometryOf(p).frameOpenings === undefined ? 0 : thicknessOf('stile-left')
  const door = p.frontMount !== 'inset' && hasAnyFront(p.section) ? thicknessOf(FRONT_ROLE) : 0
  const front = frame + door
  const back = p.backMode === 'applied' ? thicknessOf('back') : 0
  return {
    x0: 0,
    x1: p.width,
    // Not `-front`: negating a literal 0 produces -0, and Object.is (so `toBe`/`toEqual` in every
    // test here) treats -0 as unequal to 0 — a doorless cabinet's front edge would fail every
    // caller's plain `0` expectation.
    y0: 0 - front,
    y1: p.depth + back,
    z0: 0,
    z1: p.height,
  }
}
