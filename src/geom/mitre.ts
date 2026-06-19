import type { MitreCut, Vec3 } from '../scene/types'

const DEG2RAD = Math.PI / 180

interface BoardDims {
  length: number
  width: number
  thickness: number
}

export interface MitreTool {
  boxOrigin: Vec3 // axis-aligned oversized box min-corner, BEFORE rotation
  boxSize: Vec3 // oversized box dimensions
  pivot: Vec3 // rotation axis point (on the long-point end edge)
  axisDir: Vec3 // unit rotation axis ('Z' → (0,0,1); 'Y' → (0,1,0))
  angleRad: number // signed rotation that tilts the box's inner face into the board
}

// Single source of truth for the mitre cutting tool. Pure (no OCCT) so it is
// unit-tested directly; makeMitreCut consumes it to build the OCCT Boolean.
//
// Sign of the rotation per end×axis (derived in the spec, pinned by tests):
//   +X flat (Z): +angle   -X flat (Z): -angle
//   +X bevel (Y): -angle  -X bevel (Y): +angle
export function computeMitreTool(board: BoardDims, mitre: MitreCut): MitreTool {
  const { length: L, width: W, thickness: T } = board
  const BIG = 4 * (L + W + T)
  const span = 2 * BIG

  const xEnd = mitre.end === '+X' ? L : 0
  const sign = (mitre.end === '+X' ? 1 : -1) * (mitre.axis === 'Z' ? 1 : -1)

  return {
    boxOrigin: { x: mitre.end === '+X' ? L : -span, y: -BIG, z: -BIG },
    boxSize: { x: span, y: span, z: span },
    pivot: { x: xEnd, y: 0, z: 0 },
    axisDir: mitre.axis === 'Z' ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 },
    angleRad: sign * mitre.angle * DEG2RAD,
  }
}

export interface Point2D {
  x: number
  y: number
}

// 2D outline (mm, NOT scaled) of the bevelled board face for a drawing view.
// Face view uses (u=x length, v=y width) and is affected by flat (Z) mitres;
// Edge view uses (u=x length, v=z thickness) and is affected by bevel (Y) mitres.
// Returns the polygon that REPLACES the rectangular board outline. The long
// point sits at the v=0 edge; the +X/-X end's short corner is pulled back by drop.
export function mitreFaceOutline(
  board: BoardDims,
  mitres: MitreCut[],
  view: 'Face' | 'Edge',
): Point2D[] {
  const uMax = board.length
  const vMax = view === 'Face' ? board.width : board.thickness
  const relevantAxis: MitreCut['axis'] = view === 'Face' ? 'Z' : 'Y'

  const bl: Point2D = { x: 0, y: 0 }
  const br: Point2D = { x: uMax, y: 0 }
  const tr: Point2D = { x: uMax, y: vMax }
  const tl: Point2D = { x: 0, y: vMax }

  for (const m of mitres) {
    if (m.axis !== relevantAxis) continue
    const drop = vMax * Math.tan(m.angle * DEG2RAD)
    if (m.end === '+X') tr.x -= drop
    else tl.x += drop
  }

  return [bl, br, tr, tl]
}
