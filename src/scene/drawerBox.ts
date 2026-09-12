import type { Rect } from './sectionTree'
import { RUNNER_NOMINALS, runnerKeyFor } from './hardwareCatalogue'

// Which family of runner a drawer is built for. The families are not one rule with two constants:
// side-mount fixes the gap either side of the box, undermount fixes the box's own interior, so
// their outside widths diverge as the side material gets thicker. Collapsing them is the mistake
// this type exists to make impossible.
export type RunnerFamily = 'side-mount' | 'undermount'

// Every figure below is stated, not derived, and they do not all carry the same confidence. See the
// "Stated figures" table in docs/superpowers/specs/2026-09-12-drawer-boxes-design.md. A wrong figure
// here produces a perfectly self-consistent drawer that does not slide, and no test in this repo can
// falsify one — the same risk class as the hinge-count table in `frontMachining.ts`.

// A documented side-mount ball-bearing convention: 1/2" each side.
export const SIDE_MOUNT_CLEARANCE = 12.7

// Undermount fixes the drawer's INSIDE width: opening minus this, thickness-dependent.
// UNVERIFIED. From vendor and distributor summaries of Blum TANDEM, not from Blum's printed
// installation instructions — the egress proxy blocked every primary PDF. Check before cutting.
export const UNDERMOUNT_DEDUCTION_THIN = 42
export const UNDERMOUNT_DEDUCTION_THICK = 49
export const UNDERMOUNT_THIN_MAX_THICKNESS = 16

// The weakest figure in this file: unsourced, a convention chosen by the author, and model-specific
// across the side-mount family in a way the others are not. That is why it is a parameter with this
// as its default rather than a constant every drawer is stuck with.
export const SIDE_MOUNT_RUNNER_OFFSET = 32

// Conventions.
export const BOX_HEIGHT_UNDER_FRONT = 25
export const BOTTOM_GROOVE_UP = 10
export const BOTTOM_GROOVE_DEPTH = 6

export interface DrawerParams {
  family: RunnerFamily
  // null derives it from the front cell. An explicit value lets a shallow box sit behind a tall
  // front, which is ordinary where plumbing or a rail is in the way.
  boxHeight: number | null
  // Side-mount only: how far above the box bottom the runner's screw line sits.
  runnerOffset: number
  material: string
}

export function defaultDrawerParams(family: RunnerFamily): DrawerParams {
  return { family, boxHeight: null, runnerOffset: SIDE_MOUNT_RUNNER_OFFSET, material: '' }
}

export interface BoxExtents {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

export interface DrawerBoxMetrics {
  // Carcase space, so the machining can read it without converting.
  box: BoxExtents
  // Carcase z of the runner's screw line.
  runnerZ: number
  // null for undermount, where the bottom rests on the runner instead of sitting in a groove.
  groove: { up: number; depth: number } | null
}

export interface DrawerContext {
  clearDepth: number
  frontThickness: number
  inset: boolean
  // The DRAWER's own side material, not the carcase's. Only undermount reads it, and it is required
  // anyway — the mirror of `runnerOffset`, which undermount ignores. Optional with a `?? 0` default
  // sized an undermount box as if its sides were paper: too narrow by twice the stock, and by more
  // the thicker the stock, which is the one error this family is prone to and slowest to notice.
  sideThickness: number
}

// The one statement of a drawer box's geometry. The drawer generator reads it to build boards and
// `carcaseMachining` reads it to place slide screws. Neither reads the other's output, which is
// what keeps the generator a function in one direction.
//
// Returns null when the cabinet is too shallow for the smallest runner. That mirrors the rule that
// a door too thin to bore lists no hinge: the generator declines rather than inventing a size, and
// a box beside a missing runner would be a drawer nobody can build.
export function drawerBoxMetrics(
  // The SECTION's own rectangle, from `tree.rects`, never the front cell. `frontCells` expands an
  // overlay front to the material midline, so a Base 600's cell is ~597 wide against a 564 opening
  // — a box sized off the cell would be 33 mm too wide and would not go in the cabinet.
  opening: Rect,
  params: DrawerParams,
  ctx: DrawerContext,
): DrawerBoxMetrics | null {
  // The nominal is recovered from the key rather than chosen here, so the box and the hardware
  // quote cannot pick different runners for the same cabinet.
  const runnerKey = runnerKeyFor(ctx.clearDepth)
  const depth = RUNNER_NOMINALS.find((n) => `runner-${n}` === runnerKey)
  if (depth === undefined) return null

  const openingHeight = opening.z1 - opening.z0
  const height = Math.min(params.boxHeight ?? openingHeight - BOX_HEIGHT_UNDER_FRONT, openingHeight)

  const [x0, x1] =
    params.family === 'side-mount'
      ? [opening.x0 + SIDE_MOUNT_CLEARANCE, opening.x1 - SIDE_MOUNT_CLEARANCE]
      : undermountSpan(opening, ctx.sideThickness)

  // The applied front occupies y ∈ [−FT, 0] overlay and y ∈ [0, FT] inset, so the box starts where
  // the front stops.
  const y0 = ctx.inset ? ctx.frontThickness : 0

  return {
    box: { x0, x1, y0, y1: y0 + depth, z0: opening.z0, z1: opening.z0 + height },
    runnerZ: opening.z0 + (params.family === 'side-mount' ? params.runnerOffset : 0),
    groove:
      params.family === 'side-mount' ? { up: BOTTOM_GROOVE_UP, depth: BOTTOM_GROOVE_DEPTH } : null,
  }
}

// Undermount states the drawer's INSIDE width, so the outside width moves with the side material.
// At 16 mm sides the outside clearance works out near 5 mm a side, not the 12.7 mm a side-mount
// needs — which is why this cannot be expressed as a per-side constant.
function undermountSpan(opening: Rect, sideThickness: number): [number, number] {
  const deduction =
    sideThickness <= UNDERMOUNT_THIN_MAX_THICKNESS
      ? UNDERMOUNT_DEDUCTION_THIN
      : UNDERMOUNT_DEDUCTION_THICK
  const inside = opening.x1 - opening.x0 - deduction
  const outside = inside + 2 * sideThickness
  const slack = (opening.x1 - opening.x0 - outside) / 2
  return [opening.x0 + slack, opening.x1 - slack]
}
