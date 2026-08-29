// The machining a front implies — which is not the same as machining *on* fronts. A hinge cup is
// bored into the door, but the plate screws that carry it are bored into the carcase upright beside
// it, and a drawer's slide screws are bored into two uprights with nothing on the front at all. So
// this module is asked per *role*, like `carcaseHoleArrays`, and answers for a side panel as
// readily as for a door.
//
// Every figure below is a Blum-style 32 mm-system value, **stated rather than derived**: read off
// standard hardware, not computed from anything the app knows. The hardware model in a later design
// supersedes them, which is why no vendor parameter is added here — a hardware item will carry its
// own geometry, and a parameter now would be orphaned then.

import type { Face, HoleArrayCut } from './types'

export const CUP_DIAMETER = 35
export const CUP_DEPTH = 12.5
export const CUP_EDGE_DISTANCE = 22.5
export const HINGE_END_INSET = 100

export const PLATE_SCREW_PITCH = 32
export const PLATE_SCREW_SETBACK = 37
export const PLATE_SCREW_DIAMETER = 5
export const PLATE_SCREW_DEPTH = 12

export const SLIDE_SCREW_PITCH = 32
export const SLIDE_SCREW_SETBACK = 37

// The minimum face a cup may leave behind it. A cup 12.5 mm into a 14 mm door leaves 1.5 mm, which
// is a hole waiting to burst through — the same reasoning that clamps a pilot in `screw.ts`.
const MIN_FACE_BEHIND_CUP = 3

// A stated table, not a formula. Hardware guidance, held still so a test can pin the boundaries.
export function hingeCount(height: number): number {
  if (height <= 900) return 2
  if (height <= 1600) return 3
  if (height <= 2000) return 4
  return 5
}

export interface Row {
  first: number
  pitch: number
  count: number
}

// First and last a fixed inset from each end, the rest evenly spaced — which is what makes the row
// one `HoleArrayCut` with a uniform pitch rather than n separate cuts.
//
// A door shorter than two insets cannot hold that, so the inset shrinks to a quarter of the door
// rather than the row running off its end. That is a guard, not a rounding: a hinge bored past the
// edge is a hole in nothing.
export function hingePositions(height: number): Row {
  const count = hingeCount(height)
  const inset = Math.min(HINGE_END_INSET, height / 4)
  return { first: inset, pitch: (height - 2 * inset) / (count - 1), count }
}

export interface PanelDims {
  length: number
  width: number
  thickness: number
}

// Two thirds of the panel, never through it. The same rule the shelf-pin rows follow, and for the
// same reason: a fixing that reaches the far face bursts out of it.
const blindDepth = (stated: number, thickness: number): number =>
  Math.min(stated, (thickness * 2) / 3)

// The cup row on a door's back face. Board +X runs the door's height and board +Y its width, so a
// left-hinged door is hinged at board y = 0 and a right-hinged one at board y = width.
//
// `start.z` is the panel's thickness because OCCT drills *from* `start` into the panel and a '+Z'
// face drills in −z — the convention `carcaseHoleArrays` already follows for its own '+Z' rows.
export function cupRow(
  panel: PanelDims,
  hinge: 'left' | 'right',
  frontRole: string,
): HoleArrayCut | null {
  if (panel.thickness < CUP_DEPTH + MIN_FACE_BEHIND_CUP) return null
  const row = hingePositions(panel.length)
  return {
    kind: 'hole-array',
    id: `cups_${frontRole}`,
    label: 'Hinge cups',
    face: '+Z',
    axis: 'U',
    start: {
      x: row.first,
      y: hinge === 'left' ? CUP_EDGE_DISTANCE : panel.width - CUP_EDGE_DISTANCE,
      z: panel.thickness,
    },
    pitch: row.pitch,
    count: row.count,
    diameter: CUP_DIAMETER,
    depth: CUP_DEPTH,
  }
}

// The screws that carry each hinge plate, in the upright beside the door. An upright's board frame
// is `orientedPanel(box, 'x')`: board x runs the carcase depth and board y the height, so the pair
// runs along board x at the height of the cup it serves.
//
// `cupHeights` are board-y values on *this* panel, resolved by the caller: the door and the upright
// have different board frames and different origins, so a height carried across untranslated would
// hang the door on a slope.
export function plateScrewRows(
  panel: PanelDims,
  face: Face,
  cupHeights: number[],
  frontRole: string,
): HoleArrayCut[] {
  return cupHeights.map((y, i) => ({
    kind: 'hole-array' as const,
    id: `plate_${frontRole}_${i}`,
    label: `Hinge plate ${i + 1}`,
    face,
    axis: 'U' as const,
    start: { x: PLATE_SCREW_SETBACK, y, z: face === '+Z' ? panel.thickness : 0 },
    pitch: PLATE_SCREW_PITCH,
    count: 2,
    diameter: PLATE_SCREW_DIAMETER,
    depth: blindDepth(PLATE_SCREW_DEPTH, panel.thickness),
  }))
}

// A runner is screwed along the panel at one height. `count` follows the depth rather than being
// stated: a 560 mm cabinet takes more screws than a 300 mm one, and the row must not run off the
// back edge.
export function slideScrewRow(
  panel: PanelDims,
  face: Face,
  height: number,
  frontRole: string,
): HoleArrayCut {
  const runnable = panel.length - SLIDE_SCREW_SETBACK
  return {
    kind: 'hole-array',
    id: `slide_${frontRole}`,
    label: 'Drawer slide',
    face,
    axis: 'U',
    start: { x: SLIDE_SCREW_SETBACK, y: height, z: face === '+Z' ? panel.thickness : 0 },
    pitch: SLIDE_SCREW_PITCH,
    count: Math.max(2, Math.floor(runnable / SLIDE_SCREW_PITCH)),
    diameter: PLATE_SCREW_DIAMETER,
    depth: blindDepth(PLATE_SCREW_DEPTH, panel.thickness),
  }
}
