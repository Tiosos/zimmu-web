import type { BoardPart, BoxCut, MitreCut } from '../scene/types'
import { mitreFaceOutline } from '../geom/mitre'

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

// Grow every set cell by `r` in each direction, as two linear passes rather than a distance
// transform: O(w·h) whatever `r` is.
//
// The structuring element is a SQUARE, not a disc — a cell is grown if any set cell lies within
// Chebyshev distance `r`. That over-reserves by up to r·(√2−1) mm at a 45° corner, always in the
// direction of more clearance and never less, which is the side to err on when the number is a
// router cutter's radius.
function dilate(src: Mask, r: number): Mask {
  const w = src.w + 2 * r
  const h = src.h + 2 * r
  const wide = new Uint8Array(w * src.h)
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.bits[y * src.w + x] === 0) continue
      wide.fill(1, y * w + x, y * w + x + 2 * r + 1)
    }
  }
  const bits = new Uint8Array(w * h)
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < w; x++) {
      if (wide[y * w + x] === 0) continue
      for (let dy = 0; dy <= 2 * r; dy++) bits[(y + dy) * w + x] = 1
    }
  }
  return { w, h, bits }
}

export function occupancyMask(part: BoardPart, clearance: number): Mask {
  // Outward, so a 599.5 mm panel never nests as 599 and comes back short.
  const w = Math.ceil(part.length)
  const h = Math.ceil(part.width)
  const bits = new Uint8Array(w * h)

  // `mitreFaceOutline` returns [bl, br, tr, tl] in board-local millimetres with its min corner at
  // the origin, and only ever moves tr.x or tl.x — so the outline is a trapezoid and each row is a
  // single run. With no flat mitre it is the plain rectangle, which is why this is the only fill.
  // It filters on the 'Face' view's own axis, so passing every mitre is correct and the filter is
  // not duplicated here: a bevel through the thickness leaves the footprint square, and the widest
  // section is what a nest must reserve.
  const [bl, br, tr, tl] = mitreFaceOutline(
    { length: part.length, width: part.width, thickness: part.thickness },
    part.cuts.filter((c): c is MitreCut => c.kind === 'mitre'),
    'Face',
  )
  for (let y = 0; y < h; y++) {
    const t = (y + 0.5) / part.width
    // Inward: a cell is material only if its centre is inside. The opposite rounding to the
    // dimensions above, and the same principle — never claim material the part does not have.
    const left = Math.ceil(bl.x + (tl.x - bl.x) * t)
    const right = Math.floor(br.x + (tr.x - br.x) * t)
    if (right > left) bits.fill(1, y * w + Math.max(0, left), y * w + Math.min(w, right))
  }

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

  // Half the clearance on each side, so two neighbours that just fail to overlap are ONE full
  // clearance apart rather than two. The mask therefore grows: placement must position by the
  // dilated mask and report the undilated rectangle, or every offcut figure is a clearance out.
  const r = Math.ceil(clearance / 2)
  return r > 0 ? dilate({ w, h, bits }, r) : { w, h, bits }
}
