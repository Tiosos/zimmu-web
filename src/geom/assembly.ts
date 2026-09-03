import { applyInverseToPoint, applyMatrixToPoint, resolveWorldMatrix } from './transform'
import { EPS, subtractIntervals, type Span } from './hiddenLine'
import type {
  CarcaseComponent,
  CarcaseParams,
  Component,
  ComponentId,
  MaterialDef,
  Part,
  PartId,
  Vec3,
} from '../scene/types'
import type { DrawCircle, DrawRect, Point2D, Rect2D } from './drawing'
import type { BoxCut, CutDef, HoleArrayCut, MitreCut } from '../scene/types'
import { openingRect } from '../scene/carcaseRoles'
import { faceAxes } from '../scene/snapMath'
import { overridesOf, roleThicknessFor, type RoleThickness } from '../scene/resolveThickness'
import { resolveSections } from '../scene/sectionTree'
import { sectionOpenings } from '../scene/sectionInterior'

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

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface AssemblyPart {
  partId: PartId
  label: string
  color: string
  // The silhouette, after through-cuts have been taken out of it. Also the occluder set and the
  // hit shape: one list answers all three, so a click can never land somewhere the drawing says is
  // empty.
  rects: Rect2D[]
  // Replaces `rects` for a part that is not an axis-aligned box. Such a part is drawn solid and
  // takes no part in occlusion in either direction.
  outline?: Point2D[]
  solid: Segment[]
  hidden: Segment[]
  circles: DrawCircle[]
  cutRects: DrawRect[]
  depthMin: number
  depthMax: number
}

// THE RING GEOMETRY, IN EMS. Three consumers draw or reserve this ring — the interactive pane, the
// sheet layout and the SVG renderer — at three different font sizes, so the shape is stated here
// once, in ems, and each multiplies by its own font. It lives beside `AssemblyDim.ring`, the field
// that indexes it. Millimetres here would have made it a page size, and this module knows no page.
//
// Indexed by `AssemblyDim.ring`, which is 1 or 2 — index 0 is never read and is here so the index
// IS the ring number rather than one less than it. The gap between rings exceeds 1 em, so a label
// on the outer ring cannot land on the inner one's line.
export const RING_EM = [0, 0.5, 1.8]
export const TICK_EM = 0.4 // clearance between the view's edge and the innermost ring
export const TEXT_GAP_EM = 0.3 // between a ring's line and the label reading off it
// An upper bound on a digit's advance, not an average. The padding has to hold the widest glyphs
// the browser might pick, and being generous here costs a few millimetres of margin while being
// mean clips a label — which SVG does in silence.
export const CHAR_EM = 0.65

// A dimension in unscaled millimetres, placed by which side of the view it sits on and which ring
// out from it. Never a page offset: `renderDimLine` reads `offset` in sheet millimetres while it
// reads start/end as already scaled, so only a consumer that knows the scale can fill that in.
export interface AssemblyDim {
  axis: 'h' | 'v'
  side: 'above' | 'below' | 'left' | 'right'
  ring: 1 | 2
  start: number
  end: number
  label: string
}

export interface AssemblyView {
  label: 'Front' | 'Top' | 'End'
  bounds: Rect2D
  // Nearest first. Consumers read this order for hit-testing and for painting.
  parts: AssemblyPart[]
  dims: AssemblyDim[]
}

// The four edges of a rectangle, each as a span along its own axis at a fixed other coordinate.
function edgesOf(r: Rect2D): { horizontal: boolean; at: number; span: Span }[] {
  return [
    { horizontal: true, at: r.y, span: { a: r.x, b: r.x + r.w } },
    { horizontal: true, at: r.y + r.h, span: { a: r.x, b: r.x + r.w } },
    { horizontal: false, at: r.x, span: { a: r.y, b: r.y + r.h } },
    { horizontal: false, at: r.x + r.w, span: { a: r.y, b: r.y + r.h } },
  ]
}

// Splits one edge against the occluders in front of it. `hidden` is the complement of `visible`
// within the same span, from the same function — a second implementation is a second thing to get
// wrong.
function splitEdge(
  edge: { horizontal: boolean; at: number; span: Span },
  occluders: Rect2D[],
): { solid: Segment[]; hidden: Segment[] } {
  const holes: Span[] = []
  for (const o of occluders) {
    const across = edge.horizontal ? { lo: o.y, hi: o.y + o.h } : { lo: o.x, hi: o.x + o.w }
    if (edge.at < across.lo - EPS || edge.at > across.hi + EPS) continue
    holes.push(edge.horizontal ? { a: o.x, b: o.x + o.w } : { a: o.y, b: o.y + o.h })
  }
  const visible = subtractIntervals(edge.span, holes)
  const covered = subtractIntervals(edge.span, visible)
  const seg = (s: Span): Segment =>
    edge.horizontal
      ? { x1: s.a, y1: edge.at, x2: s.b, y2: edge.at }
      : { x1: edge.at, y1: s.a, x2: edge.at, y2: s.b }
  return { solid: visible.map(seg), hidden: covered.map(seg) }
}

// A cut's box in cabinet space. Cuts live in BOARD axes — `position` is the min corner, `size` the
// extent — so each goes through the same matrices the silhouette does.
function boxFromLocal(
  lo: Vec3,
  hi: Vec3,
  part: Part,
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
): CabinetBox {
  const mPart = resolveWorldMatrix(part, byId)
  const mCabinet = resolveWorldMatrix(cabinet, byId)
  const corners: Vec3[] = []
  for (const x of [lo.x, hi.x])
    for (const y of [lo.y, hi.y])
      for (const z of [lo.z, hi.z]) {
        const [wx, wy, wz] = applyMatrixToPoint(mPart, x, y, z)
        const [cx, cy, cz] = applyInverseToPoint(mCabinet, wx, wy, wz)
        corners.push({ x: cx, y: cy, z: cz })
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
  return { min, max, axisAligned: true, corners }
}

// Asked PER VIEW, never once per cut. The toe-kick notch is through in End (it spans the side's
// whole thickness) and internal in Front (there is still material behind it) — one cut, two
// answers, and an implementation that decides once gets one of them wrong.
function isThrough(cut: CabinetBox, part: CabinetBox, view: ViewSpec): boolean {
  return (
    cut.min[view.depth] <= part.min[view.depth] + EPS &&
    cut.max[view.depth] >= part.max[view.depth] - EPS
  )
}

const clip = (r: Rect2D, to: Rect2D): Rect2D | null => {
  const x = Math.max(r.x, to.x)
  const y = Math.max(r.y, to.y)
  const w = Math.min(r.x + r.w, to.x + to.w) - x
  const h = Math.min(r.y + r.h, to.y + to.h) - y
  return w > EPS && h > EPS ? { x, y, w, h } : null
}

// A rectangle minus a list of rectangles, as a list of rectangles. Horizontal bands split by the
// same interval subtraction the edges use — an occluder is a list, so this is all it takes for a
// notched part to stop occluding through its notch.
function subtractRects(base: Rect2D, holes: Rect2D[]): Rect2D[] {
  const ys = new Set<number>([base.y, base.y + base.h])
  for (const h of holes) {
    if (h.y > base.y + EPS && h.y < base.y + base.h - EPS) ys.add(h.y)
    if (h.y + h.h > base.y + EPS && h.y + h.h < base.y + base.h - EPS) ys.add(h.y + h.h)
  }
  const rows = [...ys].sort((a, b) => a - b)
  const out: Rect2D[] = []
  for (let i = 0; i + 1 < rows.length; i++) {
    const y = rows[i]
    const h = rows[i + 1] - y
    const mid = y + h / 2
    const spans = holes
      .filter((q) => q.y <= mid && q.y + q.h >= mid)
      .map((q): Span => ({ a: q.x, b: q.x + q.w }))
    for (const s of subtractIntervals({ a: base.x, b: base.x + base.w }, spans)) {
      out.push({ x: s.a, y, w: s.b - s.a, h })
    }
  }
  return out
}

// Every cut kind, named. The `never` check makes a new CutDef member a COMPILE error rather than a
// shape that silently vanishes from every drawing — the same discipline buildBoardSheet uses.
interface SortedCuts {
  boxes: BoxCut[]
  holes: HoleArrayCut[]
  mitres: MitreCut[]
}

function sortCuts(cuts: CutDef[]): SortedCuts {
  const out: SortedCuts = { boxes: [], holes: [], mitres: [] }
  for (const c of cuts) {
    switch (c.kind) {
      case 'box':
        out.boxes.push(c)
        break
      case 'hole-array':
        out.holes.push(c)
        break
      case 'mitre':
        out.mitres.push(c)
        break
      default: {
        const exhaustive: never = c
        throw new Error(`unknown cut kind: ${(exhaustive as { kind: string }).kind}`)
      }
    }
  }
  return out
}

// A row of bores reads as circles only in the view whose depth axis IS the drill axis; the other two
// see it edge-on and draw nothing, the convention drawing.ts already states. Asked per array rather
// than once per part: a side panel carries pin rows drilled through its face and, wherever a screw
// joint lands, pilots drilled into its end — one answer for both is wrong for one of them.
//
// Every bore is dashed. In a whole-cabinet projection machining is interior detail whichever face it
// is on; the through/blind distinction buildBoardSheet draws is about one board seen alone.
function boreCircles(
  holes: HoleArrayCut[],
  part: Part,
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
  view: ViewSpec,
  p: CarcaseParams,
): DrawCircle[] {
  const out: DrawCircle[] = []
  for (const h of holes) {
    const ax = faceAxes(h.face)
    // A unit step along the drill axis, carried into cabinet space. Square-on exactly when that step
    // is flat in BOTH of the view's own axes — which is also what rejects a skewed part, whose drill
    // axis has extent along all three and so points at no view at all.
    const tip: Vec3 = { ...h.start }
    tip[ax.depth] += 1
    const drill = boxFromLocal(h.start, tip, part, byId, cabinet)
    const flat = (a: Axis) => Math.abs(drill.max[a] - drill.min[a]) < EPS
    if (!flat(view.u) || !flat(view.v)) continue

    const along = h.axis === 'U' ? ax.u : ax.v
    for (let i = 0; i < h.count; i++) {
      const centre: Vec3 = { ...h.start }
      centre[along] += h.pitch * i
      const proj = projectBox(boxFromLocal(centre, centre, part, byId, cabinet), view, p)
      out.push({ cx: proj.rect.x, cy: proj.rect.y, r: h.diameter / 2, dashed: true })
    }
  }
  return out
}

// Collision is prevented by construction — no two families share a side AND a ring — so nothing
// here needs a placement search, which is most of what drawing.ts's complexity actually is.

const mm = (n: number): string => String(Math.round(n * 100) / 100)

function buildDims(view: ViewSpec, p: CarcaseParams, thicknessOf: RoleThickness): AssemblyDim[] {
  const eu = cabinetExtent(p, view.u)
  const ev = cabinetExtent(p, view.v)
  const dims: AssemblyDim[] = [
    { axis: 'h', side: 'below', ring: 1, start: 0, end: eu.hi - eu.lo, label: mm(eu.hi - eu.lo) },
    { axis: 'v', side: 'right', ring: 1, start: 0, end: ev.hi - ev.lo, label: mm(ev.hi - ev.lo) },
  ]

  if (p.baseMode !== 'none') {
    dims.push({
      axis: 'v',
      side: 'left',
      ring: 2,
      start: 0,
      end: p.toeKickHeight,
      label: mm(p.toeKickHeight),
    })
  }

  // Openings are chained only where they divide along one of this view's own axes: nothing divides
  // in y, so the Top view carries overall figures alone.
  if (view.label === 'Front') {
    const tree = resolveSections(p.section, openingRect(p, thicknessOf), (parentId, index) =>
      thicknessOf(`division-${parentId}-${index}`),
    )
    const leaves = sectionOpenings(p.section, tree)
    // Read off the RESOLVED rectangles, never re-walked from the tree's percentages: a chain
    // derived from the same rectangles the elevation draws cannot disagree with it.
    //
    // The chain lists the OPENINGS themselves, deduped — two leaves stacked inside one bay share
    // that bay's x-span and must not dimension it twice. Deliberately it does not sum to the
    // overall: the panels between openings are a material spec, not a dimension. Taking gaps
    // between every distinct edge instead would emit those panels too, giving `273 | 18 | 273`
    // for a two-bay cabinet.
    const chain = (
      pick: (r: { x0: number; x1: number; z0: number; z1: number }) => [number, number],
    ): [number, number][] => {
      const seen = new Map<string, [number, number]>()
      for (const l of leaves) {
        const span = pick(l.rect)
        seen.set(span.map((n) => Math.round(n * 1e6)).join(':'), span)
      }
      return [...seen.values()].sort((a, b) => a[0] - b[0])
    }

    for (const [a, b] of chain((r) => [r.x0, r.x1])) {
      dims.push({ axis: 'h', side: 'above', ring: 1, start: a, end: b, label: mm(b - a) })
    }
    for (const [a, b] of chain((r) => [r.z0, r.z1])) {
      dims.push({ axis: 'v', side: 'left', ring: 1, start: a, end: b, label: mm(b - a) })
    }
  }

  return dims
}

export function buildAssemblyViews(
  parts: Part[],
  byId: Map<ComponentId, Component>,
  cabinet: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): [AssemblyView, AssemblyView, AssemblyView] {
  const p = cabinet.params
  // Overrides are read BEFORE the layout resolves, exactly as the generator does. A drawing that
  // used the cabinet's nominal thickness would show openings the boards it dimensions do not have.
  const thicknessOf = roleThicknessFor(p, materials, overridesOf(parts, cabinet.id))
  const boxes = parts
    .filter((part) => part.visible)
    .map((part) => ({ part, box: cabinetSpaceBox(part, byId, cabinet) }))

  const views = VIEWS.map((view): AssemblyView => {
    const kept = boxes.filter(({ box }) => !culled(box, view, p))
    const projected = kept
      .map(({ part, box }) => ({ part, box, proj: projectBox(box, view, p) }))
      .sort((a, b) => a.proj.depthMin - b.proj.depthMin)

    // Cuts are resolved before occlusion, in their own pass: `rects` (the part's silhouette AFTER
    // its through-cuts are taken out) is also the occluder set — a part cut clean through must stop
    // occluding through the hole, and reading occluders off `rects` rather than the raw projected
    // rectangle is the only way that holds.
    const withCuts = projected.map(({ part, box, proj }) => {
      const sorted: SortedCuts =
        part.kind === 'board' ? sortCuts(part.cuts) : { boxes: [], holes: [], mitres: [] }
      // A mitre bevels the silhouette away from its bounding box, so a mitred board is no longer
      // "the box is the shape": it draws as its hull and takes no part in occlusion, exactly like a
      // cylinder. The hull still overstates it — the bevel itself is not drawn — but it can never
      // hide a part it does not really cover.
      const axisAligned = box.axisAligned && sorted.mitres.length === 0
      const projectedCuts = sorted.boxes.map((cut) => ({
        cut,
        cabinet: boxFromLocal(
          cut.position,
          {
            x: cut.position.x + cut.size.x,
            y: cut.position.y + cut.size.y,
            z: cut.position.z + cut.size.z,
          },
          part,
          byId,
          cabinet,
        ),
      }))
      const through = projectedCuts
        .filter((c) => isThrough(c.cabinet, box, view))
        .map((c) => projectBox(c.cabinet, view, p).rect)
      const internal = projectedCuts
        .filter((c) => !isThrough(c.cabinet, box, view))
        .map((c) => projectBox(c.cabinet, view, p).rect)

      const rects = axisAligned ? subtractRects(proj.rect, through) : [proj.rect]
      // Clipped on the way IN. A consumer that had to clip would be a second place the rule lived.
      const cutRects: DrawRect[] = internal
        .map((r) => clip(r, proj.rect))
        .filter((r): r is Rect2D => r !== null)
        .map((rect) => ({ rect, dashed: true }))

      return {
        part,
        box,
        proj,
        axisAligned,
        rects,
        cutRects,
        circles: boreCircles(sorted.holes, part, byId, cabinet, view, p),
      }
    })

    const assembled = withCuts.map(
      ({ part, box, proj, axisAligned, rects, cutRects, circles }, i): AssemblyPart => {
        // Hidden-line removal here is rectangle subtraction: a shape that is not a rectangle has
        // no edges this machinery can meaningfully cut, so it neither occludes nor is occluded.
        const occluders = axisAligned
          ? withCuts
              .slice(0, i)
              .filter((q) => q.axisAligned && q.proj.depthMax <= proj.depthMin + EPS)
              // No rectangle pre-filter here. `splitEdge` already decomposes the intersection into
              // two exact 1-D tests on each occluder's real coordinates — its crossing guard on one
              // axis and `subtractIntervals` on the other — so admitting a candidate that does not
              // really overlap costs a little work and changes no output. A pre-filter would be code
              // no test could falsify.
              .flatMap((q) => q.rects)
          : []

        const solid: Segment[] = []
        const hidden: Segment[] = []
        for (const r of rects) {
          for (const e of edgesOf(r)) {
            const split = splitEdge(e, occluders)
            solid.push(...split.solid)
            hidden.push(...split.hidden)
          }
        }

        return {
          partId: part.id,
          label: part.label,
          color: part.color,
          // For a part that is not an axis-aligned box, `rects` is its bounding rectangle and serves
          // only as the hit shape; `outline` is what gets drawn. Its `hidden` comes out empty on its
          // own, because it has no occluders — no branch needed to force it.
          rects,
          outline: axisAligned ? undefined : hullOf(box, view, p),
          solid,
          hidden,
          circles,
          cutRects,
          depthMin: proj.depthMin,
          depthMax: proj.depthMax,
        }
      },
    )

    const eu = cabinetExtent(p, view.u)
    const ev = cabinetExtent(p, view.v)
    return {
      label: view.label,
      bounds: { x: 0, y: 0, w: eu.hi - eu.lo, h: ev.hi - ev.lo },
      parts: assembled,
      dims: buildDims(view, p, thicknessOf),
    }
  })

  return [views[0], views[1], views[2]]
}

// The convex hull of a non-axis-aligned part's projected corners, as a closed polygon. Monotone
// chain: eight points at most, so the simplest correct algorithm is the right one.
function hullOf(box: CabinetBox, view: ViewSpec, p: CarcaseParams): Point2D[] {
  const uOrigin = view.uSign === 1 ? 0 : -cabinetExtent(p, view.u).hi
  const pts = box.corners
    .map((c) => ({ x: view.uSign * c[view.u] - uOrigin, y: c[view.v] }))
    .sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (source: Point2D[]): Point2D[] => {
    const out: Point2D[] = []
    for (const q of source) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop()
      out.push(q)
    }
    out.pop()
    return out
  }
  return [...half(pts), ...half([...pts].reverse())]
}
