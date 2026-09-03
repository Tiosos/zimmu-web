import type {
  BoardPart,
  BoxCut,
  CarcaseComponent,
  Component,
  ComponentId,
  CylinderPart,
  DowelCut,
  Face,
  HoleArrayCut,
  MaterialDef,
  MitreCut,
  Part,
} from '../scene/types'
import { faceAxes } from '../scene/snapMath'
import { mitreFaceOutline } from './mitre'
import {
  buildAssemblyViews,
  CHAR_EM,
  RING_EM,
  TEXT_GAP_EM,
  TICK_EM,
  type AssemblyView,
} from './assembly'

export interface Point2D {
  x: number
  y: number
}
export interface Rect2D {
  x: number
  y: number
  w: number
  h: number
}

export interface DimLine {
  axis: 'h' | 'v'
  start: number
  end: number
  offset: number
  label: string
}

export interface CutLabel {
  rect: Rect2D
  text: string
}

export interface DrawCircle {
  cx: number
  cy: number
  r: number
  dashed: boolean // hidden bore profile when true
}

export interface DrawSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  dashed: boolean
}

export interface DrawRect {
  rect: Rect2D
  dashed: boolean
}

export interface DowelView {
  label: 'Side' | 'End'
  outline: Point2D[] // Side: silhouette rectangle (trimmed by end cuts). End: empty (boundary is circles[0]).
  circles: DrawCircle[]
  rects: DrawRect[]
  segments: DrawSegment[]
  cutLabels: CutLabel[]
  noteLabels: CutLabel[]
  dims: DimLine[]
  placement: Point2D
}

export interface DrawingView {
  label: 'Face' | 'Edge' | 'End'
  boardRect: Rect2D
  boardOutline?: Point2D[] // when a mitre bevels this view, replaces boardRect
  cuts: Rect2D[]
  circles: DrawCircle[] // hole-array bores, only in the view they are drilled square to
  cutLabels: CutLabel[]
  noteLabels: CutLabel[] // free-floating annotations (mitre angle)
  cutPosDims: DimLine[]
  boardDims: DimLine[]
  placement: Point2D
}

export interface CoverRow {
  index: number
  label: string
  material: string
  dimensions: string // board "L×W×T"; dowel "⌀D×L"
  cutCount: number
}

interface PartSheetCommon {
  partLabel: string
  material: string
  color: string
  date: string
  scaleLabel: string
}

export interface PlacedAssemblyView extends AssemblyView {
  placement: Point2D
}

export interface CabinetSheetInput {
  cabinet: CarcaseComponent
  parts: Part[]
  materials: Record<string, MaterialDef>
  // Required, not optional. Defaulting it to `new Map([[cabinet.id, cabinet]])` is right for a
  // top-level cabinet and silently wrong for one inside a group: every part whose parent chain
  // leaves that map resolves as though it were top-level, so the whole cabinet is drawn in the
  // wrong place with no error anywhere. `buildDrawingSheets`' third parameter is still optional,
  // so existing call sites are unaffected — this only binds callers that ask for an assembly
  // sheet, and those all have a component map already.
  byId: Map<ComponentId, Component>
}

export type DrawingSheet =
  | { kind: 'cover'; projectName: string; date: string; rows: CoverRow[] }
  | (PartSheetCommon & {
      kind: 'part'
      shape: 'board'
      views: [DrawingView, DrawingView, DrawingView]
    })
  | (PartSheetCommon & {
      kind: 'part'
      shape: 'dowel'
      views: [DowelView, DowelView]
    })
  | {
      kind: 'assembly'
      cabinetLabel: string
      date: string
      scaleLabel: string
      scale: number
      // The dimension ring, in SHEET millimetres, reserved outside every view's `bounds`. Carried
      // on the sheet rather than recomputed by each consumer: the renderer needs it to place the
      // labels and the layout needed it to choose the scale, and two derivations of one figure
      // drift. It does not scale with the drawing — the sheet font is a fixed page size.
      ring: number
      views: [PlacedAssemblyView, PlacedAssemblyView, PlacedAssemblyView]
    }

const SHEET_H = 210
export const MARGIN = 15
export const TITLE_H = 25
const DIM_MARGIN = 20
const GAP = 15
const AREA_W = 297 - 2 * MARGIN - DIM_MARGIN // 247
const AREA_H = SHEET_H - 2 * MARGIN - TITLE_H - DIM_MARGIN // 135
const BOARD_DIM_OFFSET = 8
const CUT_DIM_OFFSET = 13

export const STANDARD_SCALES = [1, 0.5, 0.2, 0.1, 0.05]

function selectScale(L: number, W: number, T: number): number {
  const raw = Math.min((AREA_W - GAP) / (L + W), (AREA_H - GAP) / (W + T))
  return STANDARD_SCALES.find((s) => s <= raw) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1]
}

function toScaleLabel(scale: number): string {
  return `1:${Math.round(1 / scale)}`
}

type Axis = 'x' | 'y' | 'z'

function projectCut(
  c: BoxCut,
  uAxis: Axis,
  vAxis: Axis,
  boardH: number,
  scale: number,
  flipV: boolean,
): Rect2D {
  const uPos = c.position[uAxis]
  const vPos = c.position[vAxis]
  const uSz = c.size[uAxis]
  const vSz = c.size[vAxis]
  // `position` is the cut box's MIN CORNER, not its centre — `makeCut` builds a box over
  // [0, size] and translates it by `position`, so the tool occupies [position, position + size].
  // Reading it as a centre drew every cut half its own size low and left, which put a full-width
  // dado half off the sheet.
  const x = uPos * scale
  const y = flipV ? (boardH - (vPos + vSz)) * scale : vPos * scale
  return { x, y, w: uSz * scale, h: vSz * scale }
}

// A row of bores reads as circles only in the view whose normal is the drill axis; the other two
// see it edge-on and draw nothing. The row marches along one of the view's own two axes, so the
// same `scale`/`flipV` that place a cut rect place every hole centre.
function projectHoleArray(
  h: HoleArrayCut,
  uAxis: Axis,
  vAxis: Axis,
  boardH: number,
  scale: number,
  flipV: boolean,
  dashed: boolean,
): DrawCircle[] {
  const stepU = h.axis === 'U' ? h.pitch : 0
  const stepV = h.axis === 'V' ? h.pitch : 0
  const r = (h.diameter / 2) * scale
  return Array.from({ length: h.count }, (_, i) => {
    const u = h.start[uAxis] + stepU * i
    const v = h.start[vAxis] + stepV * i
    return { cx: u * scale, cy: flipV ? (boardH - v) * scale : v * scale, r, dashed }
  })
}

function buildView(
  viewLabel: 'Face' | 'Edge' | 'End',
  facePair: [Face, Face],
  cuts: BoxCut[],
  holes: HoleArrayCut[],
  mitres: MitreCut[],
  outlineKind: 'Face' | 'Edge' | undefined,
  board: { length: number; width: number; thickness: number },
  boardW: number,
  boardH: number,
  scale: number,
  flipV: boolean,
  boardDimValues: { h?: number; v?: number },
): Omit<DrawingView, 'placement'> {
  const { depth: drillAxis, u: uAxis, v: vAxis } = faceAxes(facePair[0])
  const boardRect: Rect2D = { x: 0, y: 0, w: boardW * scale, h: boardH * scale }
  const throughDepth = { x: board.length, y: board.width, z: board.thickness }[drillAxis]

  const relevantMitres =
    outlineKind === undefined
      ? []
      : mitres.filter((m) => m.axis === (outlineKind === 'Face' ? 'Z' : 'Y'))

  const projectV = (vMm: number): number => (flipV ? (boardH - vMm) * scale : vMm * scale)

  let boardOutline: Point2D[] | undefined
  const noteLabels: CutLabel[] = []
  if (relevantMitres.length > 0) {
    boardOutline = mitreFaceOutline(board, relevantMitres, outlineKind!).map((p) => ({
      x: p.x * scale,
      y: projectV(p.y),
    }))
    for (const m of relevantMitres) {
      const vMax = outlineKind === 'Face' ? board.width : board.thickness
      const drop = vMax * Math.tan((m.angle * Math.PI) / 180)
      const longU = m.end === '+X' ? board.length : 0
      const shortU = m.end === '+X' ? board.length - drop : drop
      const midX = ((longU + shortU) / 2) * scale
      const midY = projectV(vMax / 2)
      noteLabels.push({
        rect: { x: midX, y: midY, w: 0, h: 0 },
        text: `${m.angle}°`,
      })
    }
  }

  const viewCuts = cuts.filter((c) => c.face === facePair[0] || c.face === facePair[1])

  const circles: DrawCircle[] = holes
    .filter((h) => h.face === facePair[0] || h.face === facePair[1])
    .flatMap((h) => projectHoleArray(h, uAxis, vAxis, boardH, scale, flipV, h.depth < throughDepth))

  const cutRects: Rect2D[] = viewCuts.map((c) => projectCut(c, uAxis, vAxis, boardH, scale, flipV))

  const cutLabels: CutLabel[] = viewCuts.map((c, i) => ({
    rect: cutRects[i],
    text: `${c.size[uAxis]}×${c.size[vAxis]}mm`,
  }))

  const cutPosDims: DimLine[] = []
  cutRects.forEach((cr) => {
    if (cr.x > 0.5) {
      cutPosDims.push({
        axis: 'h',
        start: 0,
        end: cr.x,
        offset: boardRect.h + CUT_DIM_OFFSET,
        label: `${Math.round(cr.x / scale)}mm`,
      })
    }
    if (cr.y > 0.5) {
      cutPosDims.push({
        axis: 'v',
        start: 0,
        end: cr.y,
        offset: boardRect.w + CUT_DIM_OFFSET,
        label: `${Math.round(cr.y / scale)}mm`,
      })
    }
  })

  const boardDims: DimLine[] = []
  if (boardDimValues.h !== undefined) {
    boardDims.push({
      axis: 'h',
      start: 0,
      end: boardRect.w,
      offset: boardRect.h + BOARD_DIM_OFFSET,
      label: `${boardDimValues.h}mm`,
    })
  }
  if (boardDimValues.v !== undefined) {
    boardDims.push({
      axis: 'v',
      start: 0,
      end: boardRect.h,
      offset: boardRect.w + BOARD_DIM_OFFSET,
      label: `${boardDimValues.v}mm`,
    })
  }

  return {
    label: viewLabel,
    boardRect,
    boardOutline,
    cuts: cutRects,
    circles,
    cutLabels,
    noteLabels,
    cutPosDims,
    boardDims,
  }
}

function buildBoardSheet(p: BoardPart, date: string): DrawingSheet {
  const { length: L, width: W, thickness: T } = p
  const scale = selectScale(L, W, T)
  const board = { length: L, width: W, thickness: T }
  // Partitioned by hand rather than by two `filter`s with type predicates: a predicate makes a new
  // CutDef member vanish from both lists with nothing to flag it, which is how a cut kind ends up
  // silently missing from a drawing. The `never` check turns the next one into a compile error.
  const boxCuts: BoxCut[] = []
  const mitres: MitreCut[] = []
  const holeArrays: HoleArrayCut[] = []
  for (const c of p.cuts) {
    switch (c.kind) {
      case 'box':
        boxCuts.push(c)
        break
      case 'mitre':
        mitres.push(c)
        break
      case 'hole-array':
        holeArrays.push(c)
        break
      default: {
        const _exhaustive: never = c
        throw new Error(`unknown cut kind: ${(_exhaustive as { kind: string }).kind}`)
      }
    }
  }

  const ox = MARGIN
  const oy = MARGIN

  const faceData = buildView('Face', ['+Z', '-Z'], boxCuts, holeArrays, mitres, 'Face', board, L, W, scale, false, { h: L, v: W }) // prettier-ignore
  const edgeData = buildView('Edge', ['+Y', '-Y'], boxCuts, holeArrays, mitres, 'Edge', board, L, T, scale, true, { v: T }) // prettier-ignore
  const endData = buildView('End', ['+X', '-X'], boxCuts, holeArrays, mitres, undefined, board, W, T, scale, true, {}) // prettier-ignore

  const faceView: DrawingView = { ...faceData, placement: { x: ox, y: oy } }
  const endView: DrawingView = {
    ...endData,
    placement: { x: ox + faceData.boardRect.w + GAP, y: oy },
  }
  const edgeView: DrawingView = {
    ...edgeData,
    placement: { x: ox, y: oy + faceData.boardRect.h + GAP },
  }

  return {
    kind: 'part',
    shape: 'board',
    partLabel: p.label,
    material: p.material,
    color: p.color,
    date,
    views: [faceView, edgeView, endView],
    scaleLabel: toScaleLabel(scale),
  }
}

function selectDowelScale(L: number, D: number): number {
  const raw = Math.min((AREA_W - GAP) / (L + D), AREA_H / D)
  return STANDARD_SCALES.find((s) => s <= raw) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1]
}

function buildDowelSheet(p: CylinderPart, date: string): DrawingSheet {
  const scale = selectDowelScale(p.length, p.diameter)
  return {
    kind: 'part',
    shape: 'dowel',
    partLabel: p.label,
    material: p.material,
    color: p.color,
    date,
    views: buildDowelViews(p, scale),
    scaleLabel: toScaleLabel(scale),
  }
}

// selectScale is board-shaped: it assumes the third dimension is a thickness. A cabinet's is
// 560 mm, and stacking Front over Top costs H + D against 120 mm of usable height — which puts a
// Base 600 at 1:20 and 30 x 36 mm on the page. Three views in a ROW is bound by width instead and
// reaches 1:10.
//
// THE RING IS PART OF THE DRAWING. A view's dimension lines and labels live OUTSIDE its `bounds`,
// so a layout measuring only `bounds` reserves nothing for them — the same bug `CabinetProjection`
// carried until its ring was expressed in ems. Here the font is a fixed PAGE size rather than a
// fraction of the cabinet, so the ring is a constant number of sheet millimetres and does not
// scale with the drawing.
//
// THE RING IS ALSO THE GAP. Two adjacent views each carry one, so the white space between two
// drawings is 2 x ring — already wider than the 15 mm GAP a board sheet puts between its views.
// Reserving both is what drags a Base 600 back down to 1:20.
// Exported for the renderer, which places labels on the same rings this reserves room for. The ring
// SHAPE is in `assembly.ts`, in ems; this is the one number that is a page size.
export const SHEET_FONT = 2.5

// DIM_MARGIN is deliberately NOT subtracted. It is a board sheet's single global fudge for
// "dimensions need some room somewhere"; this computes the room they actually need, per view, so
// subtracting both would reserve the same millimetres twice.
const PAGE_W = 297 - 2 * MARGIN
const PAGE_H = SHEET_H - 2 * MARGIN - TITLE_H

// Read off the labels the views actually carry, exactly as the pane does — not off a guess at the
// longest one a cabinet might produce.
function assemblyRing(views: AssemblyView[]): number {
  const widest = Math.max(...views.flatMap((v) => v.dims.map((d) => d.label.length)), 1)
  return SHEET_FONT * (RING_EM[2] + TICK_EM + TEXT_GAP_EM + CHAR_EM * widest)
}

function selectAssemblyScale(W: number, H: number, D: number, ring: number): number {
  // Six rings across: one either side of each of the three views. Two rings down: the tallest view
  // carries one above and one below.
  const raw = Math.min((PAGE_W - 6 * ring) / (W + D + W), (PAGE_H - 2 * ring) / Math.max(H, D))
  return STANDARD_SCALES.find((s) => s <= raw) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1]
}

function buildAssemblySheet(input: CabinetSheetInput, date: string): DrawingSheet {
  const p = input.cabinet.params
  const [front, top, end] = buildAssemblyViews(
    input.parts,
    input.byId,
    input.cabinet,
    input.materials,
  )
  const ring = assemblyRing([front, top, end])
  const scale = selectAssemblyScale(p.width, p.height, p.depth, ring)

  // Front, End, Top left to right — Front and End share a top edge, so heights read straight
  // across between them. `placement` is each view's own origin; the ring sits outside it, which is
  // why consecutive origins are two rings apart rather than one GAP.
  const y = MARGIN + ring
  const x0 = MARGIN + ring
  const x1 = x0 + front.bounds.w * scale + 2 * ring
  const x2 = x1 + end.bounds.w * scale + 2 * ring

  return {
    kind: 'assembly',
    cabinetLabel: input.cabinet.label,
    date,
    scale,
    scaleLabel: toScaleLabel(scale),
    ring,
    views: [
      { ...front, placement: { x: x0, y } },
      { ...end, placement: { x: x1, y } },
      { ...top, placement: { x: x2, y } },
    ],
  }
}

export function buildDrawingSheets(
  parts: Part[],
  projectName: string,
  cabinets: CabinetSheetInput[] = [],
): DrawingSheet[] {
  const date = new Date().toISOString().slice(0, 10)

  const coverRows: CoverRow[] = parts.map((p, i) => ({
    index: i + 1,
    label: p.label,
    material: p.material,
    dimensions:
      p.kind === 'board' ? `${p.length}×${p.width}×${p.thickness}` : `⌀${p.diameter}×${p.length}`,
    cutCount: p.cuts.length,
  }))

  const cover: DrawingSheet = { kind: 'cover', projectName, date, rows: coverRows }

  const partSheets: DrawingSheet[] = parts.map((p) =>
    p.kind === 'board' ? buildBoardSheet(p, date) : buildDowelSheet(p, date),
  )

  const assemblySheets = cabinets.map((c) => buildAssemblySheet(c, date))

  return [cover, ...assemblySheets, ...partSheets]
}

// Side view: horizontal = axial z (0..L), vertical = diameter with the centerline at mid-height.
// A signed radial value `rad` (-R..+R) maps to view-y = (R - rad) * scale; top edge (+R) is y=0.
// End view (looking down -Z): a feature at azimuth θ sits at screen direction (cosθ, -sinθ) from
// the circle center, because screen-y is down while world +Y is up.

function buildDowelViews(p: CylinderPart, scale: number): [DowelView, DowelView] {
  const L = p.length
  const D = p.diameter
  const R = D / 2

  const sidePlacement: Point2D = { x: MARGIN, y: MARGIN }
  const endPlacement: Point2D = { x: MARGIN + L * scale + GAP, y: MARGIN }

  // Side silhouette corners (mm, pre-scale). End cuts trim the corresponding end.
  const corners = { tlx: 0, trx: L, blx: 0, brx: L }
  const noteLabels: CutLabel[] = []
  const sideSegments: DrawSegment[] = []
  const sideRects: DrawRect[] = []
  const sideCutLabels: CutLabel[] = []
  const sideDims: DimLine[] = []

  const endR = R * scale
  const endCx = R * scale
  const endCy = R * scale
  const endCircles: DrawCircle[] = [{ cx: endCx, cy: endCy, r: endR, dashed: false }]
  const endSegments: DrawSegment[] = []
  const endCutLabels: CutLabel[] = []

  for (const cut of p.cuts) {
    if (cut.kind === 'end') {
      applyEndCut(cut, L, D, scale, corners, noteLabels)
    } else if (cut.kind === 'notch') {
      applyNotch(
        cut,
        D,
        R,
        scale,
        sideRects,
        sideCutLabels,
        sideDims,
        endSegments,
        endCutLabels,
        endCx,
        endCy,
      )
    } else if (cut.kind === 'bore-axial') {
      applyAxialBore(cut, L, R, scale, sideSegments, sideCutLabels, endCircles, endCx, endCy)
    } else {
      applyTransverseBore(
        cut,
        D,
        R,
        scale,
        sideSegments,
        sideCutLabels,
        sideDims,
        endSegments,
        endCx,
        endCy,
      )
    }
  }

  const outline: Point2D[] = [
    { x: corners.tlx * scale, y: 0 },
    { x: corners.trx * scale, y: 0 },
    { x: corners.brx * scale, y: D * scale },
    { x: corners.blx * scale, y: D * scale },
  ]

  const overallDims: DimLine[] = [
    { axis: 'h', start: 0, end: L * scale, offset: D * scale + BOARD_DIM_OFFSET, label: `${L}mm` },
    { axis: 'v', start: 0, end: D * scale, offset: L * scale + BOARD_DIM_OFFSET, label: `⌀${D}mm` },
  ]

  const side: DowelView = {
    label: 'Side',
    outline,
    circles: [],
    rects: sideRects,
    segments: sideSegments,
    cutLabels: sideCutLabels,
    noteLabels,
    dims: [...overallDims, ...sideDims],
    placement: sidePlacement,
  }

  const end: DowelView = {
    label: 'End',
    outline: [],
    circles: endCircles,
    rects: [],
    segments: endSegments,
    cutLabels: endCutLabels,
    noteLabels: [],
    dims: [],
    placement: endPlacement,
  }

  return [side, end]
}

function applyEndCut(
  cut: Extract<DowelCut, { kind: 'end' }>,
  L: number,
  D: number,
  scale: number,
  corners: { tlx: number; trx: number; blx: number; brx: number },
  noteLabels: CutLabel[],
): void {
  if (cut.angle <= 0 && cut.offset <= 0) return
  const drop = cut.angle > 0 ? D * Math.tan((cut.angle * Math.PI) / 180) : 0
  if (cut.end === '+Z') {
    corners.trx = L - cut.offset
    corners.brx = L - cut.offset - drop
  } else {
    corners.tlx = cut.offset
    corners.blx = cut.offset + drop
  }
  const midZ = cut.end === '+Z' ? L - cut.offset - drop / 2 : cut.offset + drop / 2
  noteLabels.push({
    rect: { x: midZ * scale, y: (D / 2) * scale, w: 0, h: 0 },
    text: cut.angle > 0 ? `${cut.angle}°` : `${cut.offset}mm`,
  })
}

function applyNotch(
  cut: Extract<DowelCut, { kind: 'notch' }>,
  D: number,
  R: number,
  scale: number,
  sideRects: DrawRect[],
  sideCutLabels: CutLabel[],
  sideDims: DimLine[],
  endSegments: DrawSegment[],
  endCutLabels: CutLabel[],
  endCx: number,
  endCy: number,
): void {
  if (cut.depth <= 0 || cut.width <= 0) return
  // Side: slot against the top edge at the true axial position.
  const x = (cut.position - cut.width / 2) * scale
  const rect: Rect2D = { x, y: 0, w: cut.width * scale, h: cut.depth * scale }
  sideRects.push({ rect, dashed: false })
  sideCutLabels.push({ rect, text: `${cut.width}×${cut.depth} az${cut.azimuth}°` })
  if (x > 0.5) {
    sideDims.push({
      axis: 'h',
      start: 0,
      end: x,
      offset: D * scale + CUT_DIM_OFFSET,
      label: `${Math.round(x / scale)}mm`,
    })
  }
  // End: the flat (chord) the notch leaves, perpendicular to the azimuth direction.
  if (cut.depth < D) {
    const rad = (cut.azimuth * Math.PI) / 180
    const dirX = Math.cos(rad)
    const dirY = -Math.sin(rad)
    const dist = (R - cut.depth) * scale
    const rS = R * scale
    const half = Math.sqrt(Math.max(0, rS * rS - dist * dist))
    const mx = endCx + dist * dirX
    const my = endCy + dist * dirY
    const px = -dirY // perpendicular = rotate dir by +90°
    const py = dirX
    endSegments.push({
      x1: mx + half * px,
      y1: my + half * py,
      x2: mx - half * px,
      y2: my - half * py,
      dashed: false,
    })
    endCutLabels.push({ rect: { x: mx, y: my, w: 0, h: 0 }, text: `d${cut.depth}` })
  }
}

function applyAxialBore(
  cut: Extract<DowelCut, { kind: 'bore-axial' }>,
  L: number,
  R: number,
  scale: number,
  sideSegments: DrawSegment[],
  sideCutLabels: CutLabel[],
  endCircles: DrawCircle[],
  endCx: number,
  endCy: number,
): void {
  if (cut.diameter <= 0 || cut.depth <= 0) return
  const boreR = cut.diameter / 2
  const reach = Math.min(cut.depth, L)
  const xCap = cut.end === '+Z' ? L * scale : 0
  const xInner = cut.end === '+Z' ? (L - reach) * scale : reach * scale
  const yTop = (R - boreR) * scale
  const yBot = (R + boreR) * scale
  sideSegments.push({ x1: xCap, y1: yTop, x2: xInner, y2: yTop, dashed: true })
  sideSegments.push({ x1: xCap, y1: yBot, x2: xInner, y2: yBot, dashed: true })
  if (cut.depth < L) {
    sideSegments.push({ x1: xInner, y1: yTop, x2: xInner, y2: yBot, dashed: true })
  }
  sideCutLabels.push({
    rect: { x: (xCap + xInner) / 2, y: R * scale, w: 0, h: 0 },
    text: `⌀${cut.diameter} ${cut.depth >= L ? 'through' : cut.depth}`,
  })
  // End: concentric dashed circle.
  endCircles.push({ cx: endCx, cy: endCy, r: boreR * scale, dashed: true })
}

function applyTransverseBore(
  cut: Extract<DowelCut, { kind: 'bore-transverse' }>,
  D: number,
  R: number,
  scale: number,
  sideSegments: DrawSegment[],
  sideCutLabels: CutLabel[],
  sideDims: DimLine[],
  endSegments: DrawSegment[],
  endCx: number,
  endCy: number,
): void {
  if (cut.diameter <= 0) return
  const boreR = cut.diameter / 2
  // Side: the two hidden hole walls spanning the full diameter at the axial position.
  const xL = (cut.position - boreR) * scale
  const xR = (cut.position + boreR) * scale
  sideSegments.push({ x1: xL, y1: 0, x2: xL, y2: D * scale, dashed: true })
  sideSegments.push({ x1: xR, y1: 0, x2: xR, y2: D * scale, dashed: true })
  sideCutLabels.push({
    rect: { x: cut.position * scale, y: R * scale, w: 0, h: 0 },
    text: `⌀${cut.diameter} az${cut.azimuth}°`,
  })
  const cx = cut.position * scale
  if (cx > 0.5) {
    sideDims.push({
      axis: 'h',
      start: 0,
      end: cx,
      offset: D * scale + CUT_DIM_OFFSET,
      label: `${cut.position}mm`,
    })
  }
  // End: the slot the crosswise hole projects to — two dashed lines parallel to the azimuth dir.
  if (boreR < R) {
    const rad = (cut.azimuth * Math.PI) / 180
    const dirX = Math.cos(rad)
    const dirY = -Math.sin(rad)
    const px = -dirY
    const py = dirX
    const rS = R * scale
    const oS = boreR * scale
    const half = Math.sqrt(Math.max(0, rS * rS - oS * oS))
    for (const sign of [1, -1]) {
      const ox = endCx + sign * oS * px
      const oy = endCy + sign * oS * py
      endSegments.push({
        x1: ox + half * dirX,
        y1: oy + half * dirY,
        x2: ox - half * dirX,
        y2: oy - half * dirY,
        dashed: true,
      })
    }
  }
}
