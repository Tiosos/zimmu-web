import type { Grain } from '../scene/types'
import { maskArea } from './mask'
import type { Mask } from './mask'

export type Rotation = 0 | 90 | 180 | 270

// The sheet's grain runs along its length, the x axis. `grain` names which of the BOARD's own axes
// the grain runs along, and a mask is in board axes — so 'length' is already parallel to the sheet
// and 'width' has to turn a quarter to get there.
//
// The design doc originally said 0°/180° for any grained part, which silently assumes grain always
// runs along the mask's w. Measured against real panels, that locks a Tall 600 side (560 × 2100,
// grain along its width) to an orientation 2114 mm tall — taller than any standard sheet is wide,
// so it could never be placed at all.
//
// 180° is in every list because a notched or mitred part is not symmetric even when its bounding
// box is.
export function allowedRotations(grain: Grain, stockHasGrain: boolean): Rotation[] {
  if (grain === 'free' || !stockHasGrain) return [0, 90, 180, 270]
  return grain === 'length' ? [0, 180] : [90, 270]
}

export function rotateMask(m: Mask, rotation: Rotation): Mask {
  if (rotation === 0) return m
  const swapped = rotation === 90 || rotation === 270
  const w = swapped ? m.h : m.w
  const h = swapped ? m.w : m.h
  const bits = new Uint8Array(w * h)

  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (m.bits[y * m.w + x] === 0) continue
      const [nx, ny] =
        rotation === 90
          ? [m.h - 1 - y, x]
          : rotation === 180
            ? [m.w - 1 - x, m.h - 1 - y]
            : [y, m.w - 1 - x]
      bits[ny * w + nx] = 1
    }
  }
  // Dilation is isotropic, so a quarter turn does not change how far the mask exceeds the material.
  return { w, h, bits, pad: m.pad }
}

export interface NestItem {
  id: string // the part id: the report needs it, and ties in the sort break on it
  mask: Mask
  grain: Grain
}

export interface SheetSpec {
  length: number // along the sheet's grain
  width: number
}

export interface Placement {
  id: string
  sheet: number
  rotation: Rotation
  // The min corner and extent of the REAL part, not of its dilated mask. Everything downstream —
  // utilisation, offcuts, the drawing — measures material, and the mask exceeds the material by
  // `mask.pad` on every side.
  x: number
  y: number
  w: number
  h: number
}

export interface NestResult {
  sheets: Placement[][]
  utilisation: number[] // per sheet: placed material area / sheet area
  // Parts that fit no sheet in any allowed rotation. Not in the design doc and load-bearing: a
  // panel longer than the stock is a real user mistake, and dropping it silently would make the
  // sheet count a lie.
  unplaced: string[]
}

interface Sheet {
  bits: Uint8Array
  placements: Placement[]
  area: number
}

function collides(sheet: Sheet, sw: number, m: Mask, ox: number, oy: number): boolean {
  for (let y = 0; y < m.h; y++) {
    const srow = (oy + y) * sw + ox
    const mrow = y * m.w
    for (let x = 0; x < m.w; x++) {
      if (m.bits[mrow + x] === 1 && sheet.bits[srow + x] === 1) return true
    }
  }
  return false
}

function stamp(sheet: Sheet, sw: number, m: Mask, ox: number, oy: number): void {
  for (let y = 0; y < m.h; y++) {
    const srow = (oy + y) * sw + ox
    const mrow = y * m.w
    for (let x = 0; x < m.w; x++) if (m.bits[mrow + x] === 1) sheet.bits[srow + x] = 1
  }
}

// Lowest free position, then leftmost, and take the first that does not collide. First-fit rather
// than best-fit: predictable, and measured fast enough — a six-cabinet job scans tens of millions
// of candidate positions in about a second, because in bottom-left order almost every candidate
// collides on its first row and costs a handful of comparisons rather than a full mask scan.
function firstFit(sheet: Sheet, spec: SheetSpec, m: Mask): { x: number; y: number } | null {
  for (let y = 0; y + m.h <= spec.width; y++) {
    for (let x = 0; x + m.w <= spec.length; x++) {
      if (!collides(sheet, spec.length, m, x, y)) return { x, y }
    }
  }
  return null
}

export function nestSheets(
  items: NestItem[],
  spec: SheetSpec,
  opts: { hasGrain: boolean },
): NestResult {
  // Area descending, ties by id. The sort has to be total for the result to be deterministic —
  // two parts of equal area would otherwise place in whatever order the input happened to hold.
  const ordered = [...items].sort((a, b) => {
    const d = maskArea(b.mask) - maskArea(a.mask)
    return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const sheetArea = spec.length * spec.width
  const sheets: Sheet[] = []
  const unplaced: string[] = []

  const newSheet = (): Sheet => ({
    bits: new Uint8Array(spec.length * spec.width),
    placements: [],
    area: 0,
  })

  for (const item of ordered) {
    const rotations = allowedRotations(item.grain, opts.hasGrain)
    const masks = rotations.map((r) => ({ r, m: rotateMask(item.mask, r) }))
    // A part that exceeds the stock in every allowed rotation has no home on any sheet, open or
    // new — checking that first keeps it out of the per-sheet scan entirely.
    const feasible = masks.filter(({ m }) => m.w <= spec.length && m.h <= spec.width)
    if (feasible.length === 0) {
      unplaced.push(item.id)
      continue
    }

    // Every open sheet before a new one: a part rejected from sheet 1 may still fit sheet 2's
    // offcut, and only ever looking at the newest sheet wastes stock.
    let done = false
    for (const sheet of sheets) {
      for (const { r, m } of feasible) {
        const at = firstFit(sheet, spec, m)
        if (at === null) continue
        stamp(sheet, spec.length, m, at.x, at.y)
        const w = m.w - 2 * m.pad
        const h = m.h - 2 * m.pad
        sheet.placements.push({
          id: item.id,
          sheet: sheets.indexOf(sheet),
          rotation: r,
          x: at.x + m.pad,
          y: at.y + m.pad,
          w,
          h,
        })
        sheet.area += w * h
        done = true
        break
      }
      if (done) break
    }
    if (done) continue

    const sheet = newSheet()
    sheets.push(sheet)
    const { r, m } = feasible[0]
    const at = firstFit(sheet, spec, m)
    // `feasible` already proved the rotated mask fits the stock, and the sheet is empty.
    if (at === null) throw new Error(`zimmu: ${item.id} fits the stock but not an empty sheet`)
    stamp(sheet, spec.length, m, at.x, at.y)
    const w = m.w - 2 * m.pad
    const h = m.h - 2 * m.pad
    sheet.placements.push({
      id: item.id,
      sheet: sheets.length - 1,
      rotation: r,
      x: at.x + m.pad,
      y: at.y + m.pad,
      w,
      h,
    })
    sheet.area += w * h
  }

  return {
    sheets: sheets.map((s) => s.placements),
    utilisation: sheets.map((s) => s.area / sheetArea),
    unplaced,
  }
}
