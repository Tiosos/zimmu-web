import type { CutDef, Part } from '../scene/types'
import { faceAxes } from '../scene/snapMath'

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

export interface DrawingView {
  label: 'Face' | 'Edge' | 'End'
  boardRect: Rect2D
  cuts: Rect2D[]
  cutLabels: CutLabel[]
  cutPosDims: DimLine[]
  boardDims: DimLine[]
  placement: Point2D
}

export interface CoverRow {
  index: number
  label: string
  material: string
  length: number
  width: number
  thickness: number
  cutCount: number
}

export type DrawingSheet =
  | { kind: 'cover'; projectName: string; date: string; rows: CoverRow[] }
  | {
      kind: 'part'
      partLabel: string
      material: string
      color: string
      date: string
      views: [DrawingView, DrawingView, DrawingView]
      scaleLabel: string
    }

const SHEET_H = 210
const MARGIN = 15
const TITLE_H = 25
const DIM_MARGIN = 20
const GAP = 15
const AREA_W = 297 - 2 * MARGIN - DIM_MARGIN // 247
const AREA_H = SHEET_H - 2 * MARGIN - TITLE_H - DIM_MARGIN // 135
const BOARD_DIM_OFFSET = 8
const CUT_DIM_OFFSET = 13

const STANDARD_SCALES = [1, 0.5, 0.2, 0.1, 0.05]

function selectScale(L: number, W: number, T: number): number {
  const raw = Math.min((AREA_W - GAP) / (L + W), (AREA_H - GAP) / (W + T))
  return STANDARD_SCALES.find((s) => s <= raw) ?? STANDARD_SCALES[STANDARD_SCALES.length - 1]
}

function toScaleLabel(scale: number): string {
  return `1:${Math.round(1 / scale)}`
}

type Axis = 'x' | 'y' | 'z'

function projectCut(
  c: CutDef,
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
  const x = (uPos - uSz / 2) * scale
  const y = flipV ? (boardH - (vPos + vSz / 2)) * scale : (vPos - vSz / 2) * scale
  return { x, y, w: uSz * scale, h: vSz * scale }
}

function buildView(
  viewLabel: 'Face' | 'Edge' | 'End',
  facePair: [CutDef['face'], CutDef['face']],
  cuts: CutDef[],
  boardW: number,
  boardH: number,
  scale: number,
  flipV: boolean,
  boardDimValues: { h?: number; v?: number },
): Omit<DrawingView, 'placement'> {
  const { u: uAxis, v: vAxis } = faceAxes(facePair[0])
  const boardRect: Rect2D = { x: 0, y: 0, w: boardW * scale, h: boardH * scale }

  const viewCuts = cuts.filter((c) => c.face === facePair[0] || c.face === facePair[1])

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

  return { label: viewLabel, boardRect, cuts: cutRects, cutLabels, cutPosDims, boardDims }
}

export function buildDrawingSheets(parts: Part[], projectName: string): DrawingSheet[] {
  const date = new Date().toISOString().slice(0, 10)

  const coverRows: CoverRow[] = parts.map((p, i) => ({
    index: i + 1,
    label: p.label,
    material: p.material,
    length: p.length,
    width: p.width,
    thickness: p.thickness,
    cutCount: p.cuts.length,
  }))

  const cover: DrawingSheet = { kind: 'cover', projectName, date, rows: coverRows }

  const partSheets: DrawingSheet[] = parts.map((p) => {
    const { length: L, width: W, thickness: T, cuts } = p
    const scale = selectScale(L, W, T)

    const ox = MARGIN
    const oy = MARGIN

    const faceData = buildView('Face', ['+Z', '-Z'], cuts, L, W, scale, false, { h: L, v: W })
    const edgeData = buildView('Edge', ['+Y', '-Y'], cuts, L, T, scale, true, { v: T })
    const endData = buildView('End', ['+X', '-X'], cuts, W, T, scale, true, {})

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
      partLabel: p.label,
      material: p.material,
      color: p.color,
      date,
      views: [faceView, edgeView, endView],
      scaleLabel: toScaleLabel(scale),
    }
  })

  return [cover, ...partSheets]
}
