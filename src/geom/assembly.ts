import { applyInverseToPoint, applyMatrixToPoint, resolveWorldMatrix } from './transform'
import { EPS } from './hiddenLine'
import type {
  CarcaseComponent,
  CarcaseParams,
  Component,
  ComponentId,
  Part,
  Vec3,
} from '../scene/types'
import type { Rect2D } from './drawing'

// Whole-cabinet orthographic projection. Pure, THREE-free, and in **unscaled millimetres** — two
// consumers read it (the interactive pane and the assembly sheet) and they scale differently, so a
// projector that scaled would have to be told a page size the pane does not have.

export interface CabinetBox {
  min: Vec3
  max: Vec3
  // True when the eight corners form an axis-aligned box in cabinet space. Read off the corners,
  // never off `rotation`: a board rotated 180 degrees is still an axis-aligned box, and only an
  // axis-aligned box may occlude — the rule has to follow the geometry it describes.
  axisAligned: boolean
  // The eight corners in cabinet space, kept for the non-axis-aligned outline.
  corners: Vec3[]
}

// A part's own extent in its local frame. A board occupies [0,L]x[0,W]x[0,T]; a cylinder's local
// origin lies on its axis at the base circle, so its box is centred in x and y.
function localExtent(part: Part): { min: Vec3; max: Vec3 } {
  if (part.kind === 'board') {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: part.length, y: part.width, z: part.thickness },
    }
  }
  const r = part.diameter / 2
  return { min: { x: -r, y: -r, z: 0 }, max: { x: r, y: r, z: part.length } }
}

export function cabinetSpaceBox(
  part: Part,
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
): CabinetBox {
  const mPart = resolveWorldMatrix(part, byId)
  const mCabinet = resolveWorldMatrix(cabinet, byId)
  const { min: lo, max: hi } = localExtent(part)

  const corners: Vec3[] = []
  for (const x of [lo.x, hi.x]) {
    for (const y of [lo.y, hi.y]) {
      for (const z of [lo.z, hi.z]) {
        const [wx, wy, wz] = applyMatrixToPoint(mPart, x, y, z)
        const [cx, cy, cz] = applyInverseToPoint(mCabinet, wx, wy, wz)
        corners.push({ x: cx, y: cy, z: cz })
      }
    }
  }

  const min = {
    x: Math.min(...corners.map((c) => c.x)),
    y: Math.min(...corners.map((c) => c.y)),
    z: Math.min(...corners.map((c) => c.z)),
  }
  const max = {
    x: Math.max(...corners.map((c) => c.x)),
    y: Math.max(...corners.map((c) => c.y)),
    z: Math.max(...corners.map((c) => c.z)),
  }

  // Axis-aligned exactly when every corner sits on the bounding box's own surface in all three
  // axes — which is what "the box IS the shape" means. A cylinder fails it by construction, since
  // its box is a prism around a round shape and must never occlude.
  const onFace = (v: number, a: number, b: number) => Math.abs(v - a) < EPS || Math.abs(v - b) < EPS
  const axisAligned =
    part.kind === 'board' &&
    corners.every(
      (c) => onFace(c.x, min.x, max.x) && onFace(c.y, min.y, max.y) && onFace(c.z, min.z, max.z),
    )

  return { min, max, axisAligned, corners }
}

export type Axis = 'x' | 'y' | 'z'

export interface ViewSpec {
  label: 'Front' | 'Top' | 'End'
  u: Axis
  v: Axis
  depth: Axis
  // -1 when larger means nearer. Applied once here so no consumer carries a per-view sign: every
  // emitted depth reads "smaller is nearer".
  depthSign: 1 | -1
  uSign: 1 | -1
  // Front is a view; Top and End are sections. A closed box under hidden-line removal is one solid
  // rectangle, so the two that look at a closed face cull their near half.
  cull: boolean
}

// End looks from +x, matching buildBoardSheet's End view (built from ['+X','-X'] and placed to the
// right). Looking from +x with +z up puts screen-right at -y, so the cabinet's front lands on the
// right of that view.
export const VIEWS: [ViewSpec, ViewSpec, ViewSpec] = [
  { label: 'Front', u: 'x', v: 'z', depth: 'y', depthSign: 1, uSign: 1, cull: false },
  { label: 'Top', u: 'x', v: 'y', depth: 'z', depthSign: -1, uSign: 1, cull: true },
  { label: 'End', u: 'y', v: 'z', depth: 'x', depthSign: -1, uSign: -1, cull: true },
]

// The cabinet's own extent along an axis, from its parameters rather than from the parts. A stray
// detached part must not move the cut plane and cull a shelf with it.
function cabinetExtent(p: CarcaseParams, axis: Axis): { lo: number; hi: number } {
  if (axis === 'x') return { lo: 0, hi: p.width }
  if (axis === 'z') return { lo: 0, hi: p.height }
  return { lo: 0, hi: p.depth }
}

export interface ProjectedBox {
  rect: Rect2D
  depthMin: number
  depthMax: number
}

// A cabinet-space box seen through one view spec, with depth already oriented so smaller is nearer.
export function projectBox(box: CabinetBox, view: ViewSpec, p: CarcaseParams): ProjectedBox {
  const uLo = view.uSign === 1 ? box.min[view.u] : -box.max[view.u]
  const uHi = view.uSign === 1 ? box.max[view.u] : -box.min[view.u]
  const uOrigin = view.uSign === 1 ? 0 : -cabinetExtent(p, view.u).hi
  const d0 = view.depthSign * box.min[view.depth]
  const d1 = view.depthSign * box.max[view.depth]
  return {
    rect: {
      x: uLo - uOrigin,
      y: box.min[view.v],
      w: uHi - uLo,
      h: box.max[view.v] - box.min[view.v],
    },
    depthMin: Math.min(d0, d1),
    depthMax: Math.max(d0, d1),
  }
}

// Parts lying entirely on the near side of the cut plane are omitted; a part crossing it is drawn
// whole. That keeps the section honest to read without any partial-cutting geometry, and everything
// crossing the plane is what you want to see in elevation anyway.
export function culled(box: CabinetBox, view: ViewSpec, p: CarcaseParams): boolean {
  if (!view.cull) return false
  const { lo, hi } = cabinetExtent(p, view.depth)
  // In oriented depth — the same `depthSign * raw` that projectBox emits — "entirely on the near
  // side" is one comparison for either sign: the box's own farthest point is still nearer than the
  // plane. Written this way there is no branch that the three views cannot reach.
  const plane = view.depthSign * ((lo + hi) / 2)
  const farthest = Math.max(
    view.depthSign * box.min[view.depth],
    view.depthSign * box.max[view.depth],
  )
  return farthest <= plane + EPS
}
