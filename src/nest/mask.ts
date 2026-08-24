import type { BoardPart, BoxCut } from '../scene/types'

// A part's footprint on a sheet, rasterised at 1 mm per cell.
//
// The mask is in the board's OWN axes — `w` is `part.length`, `h` is `part.width` — and never in
// `cutDimensions`' grain-ordered pair. The two answer different questions: `cutDimensions` says
// which dimension the cutting list calls the length, this says what shape the part is on a sheet.
// Placement reads `part.grain` to decide which rotations are allowed, and a pre-transposed mask
// would apply that decision twice.
export interface Mask {
  w: number
  h: number
  bits: Uint8Array // row-major, length w * h; 1 = material
}

export function maskArea(m: Mask): number {
  let n = 0
  for (let i = 0; i < m.bits.length; i++) n += m.bits[i]
  return n
}

// A dado is not a notch. A box cut only changes the shape someone cuts around when it goes all the
// way through the material — a 6 mm groove in an 18 mm panel leaves a full rectangle, and treating
// it as an outline change would let a neighbour tuck into the groove.
//
// The kernel is the authority on the span: `makeCut` builds a box over [0, size] and translates it
// by `position`, so the tool occupies [position, position + size] and `position` is the min corner.
// Both live through-cut conventions satisfy this — `computeFingerSlots` is exactly flush and the
// toe-kick notch overshoots.
function isThroughCut(c: BoxCut, thickness: number): boolean {
  return c.position.z <= 0 && c.position.z + c.size.z >= thickness
}

export function occupancyMask(part: BoardPart, clearance: number): Mask {
  // Outward, so a 599.5 mm panel never nests as 599 and comes back short.
  const w = Math.ceil(part.length)
  const h = Math.ceil(part.width)
  const bits = new Uint8Array(w * h).fill(1)

  for (const c of part.cuts) {
    // `face` is not consulted: a box cut is an axis-aligned box in board-local space, so its
    // footprint is its x-y span whichever face it was authored from. Hole arrays never change the
    // outline; mitres are handled by the outline itself.
    if (c.kind !== 'box' || !isThroughCut(c, part.thickness)) continue
    const x0 = Math.max(0, Math.round(c.position.x))
    const x1 = Math.min(w, Math.round(c.position.x + c.size.x))
    const y0 = Math.max(0, Math.round(c.position.y))
    const y1 = Math.min(h, Math.round(c.position.y + c.size.y))
    for (let y = y0; y < y1; y++) bits.fill(0, y * w + x0, y * w + x1)
  }

  void clearance
  return { w, h, bits }
}
