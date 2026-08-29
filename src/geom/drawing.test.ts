import { describe, it, expect } from 'vitest'
import { buildDrawingSheets } from './drawing'
import type { DrawingSheet } from './drawing'
import { regenerateComponents } from '../scene/regenerateComponents'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import type { BoardPart, Component, CylinderPart, DowelCut } from '../scene/types'

function makeBoard(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 800,
    width: 300,
    thickness: 18,
    grain: 'free' as const,
    material: 'Plywood',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...overrides,
  }
}

describe('buildDrawingSheets', () => {
  it('returns 2 sheets for a single board (cover + 1 part)', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'My Project')
    expect(sheets).toHaveLength(2)
    expect(sheets[0].kind).toBe('cover')
    expect(sheets[1].kind).toBe('part')
  })

  it('part sheet has Face/Edge/End views with board rects matching L×W, L×T, W×T', () => {
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200, thickness: 18 })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
    // scale 1:5 → factor 0.2
    const s = 0.2
    const [face, edge, end] = sheet.views
    expect(face.label).toBe('Face')
    expect(face.boardRect.w).toBeCloseTo(400 * s, 3)
    expect(face.boardRect.h).toBeCloseTo(200 * s, 3)
    expect(edge.label).toBe('Edge')
    expect(edge.boardRect.w).toBeCloseTo(400 * s, 3)
    expect(edge.boardRect.h).toBeCloseTo(18 * s, 3)
    expect(end.label).toBe('End')
    expect(end.boardRect.w).toBeCloseTo(200 * s, 3)
    expect(end.boardRect.h).toBeCloseTo(18 * s, 3)
  })

  it('cut on +Z face appears only in Face view', () => {
    const cut = {
      id: 'c1',
      label: 'Dado',
      kind: 'box' as const,
      face: '+Z' as const,
      position: { x: 100, y: 150, z: 18 },
      size: { x: 20, y: 300, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(1)
    expect(edge.cuts).toHaveLength(0)
    expect(end.cuts).toHaveLength(0)
  })

  it('cut on +Y face appears only in Edge view', () => {
    const cut = {
      id: 'c1',
      label: 'Groove',
      kind: 'box' as const,
      face: '+Y' as const,
      position: { x: 400, y: 300, z: 9 },
      size: { x: 20, y: 10, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(0)
    expect(edge.cuts).toHaveLength(1)
    expect(end.cuts).toHaveLength(0)
  })

  it('cut on +X face appears only in End view', () => {
    const cut = {
      id: 'c1',
      label: 'Tenon',
      kind: 'box' as const,
      face: '+X' as const,
      position: { x: 800, y: 150, z: 9 },
      size: { x: 10, y: 20, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
    const [face, edge, end] = sheet.views
    expect(face.cuts).toHaveLength(0)
    expect(edge.cuts).toHaveLength(0)
    expect(end.cuts).toHaveLength(1)
  })

  it('flat mitre gives the Face view a boardOutline and an angle note; End view stays a rect', () => {
    const sheets = buildDrawingSheets(
      [
        makeBoard({
          length: 400,
          width: 200,
          thickness: 18,
          cuts: [{ kind: 'mitre', id: 'm1', label: 'Mitre', end: '+X', axis: 'Z', angle: 45 }],
        }),
      ],
      'P',
    )
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
    const [face, edge, end] = sheet.views
    expect(face.boardOutline).toBeDefined()
    expect(face.boardOutline).toHaveLength(4)
    expect(face.noteLabels.map((n) => n.text)).toContain('45°')
    expect(edge.boardOutline).toBeUndefined() // bevel-only view, flat mitre absent
    expect(end.boardOutline).toBeUndefined()
  })

  it('bevel mitre affects the Edge view, not the Face view', () => {
    const sheets = buildDrawingSheets(
      [
        makeBoard({
          cuts: [{ kind: 'mitre', id: 'm1', label: 'Mitre', end: '+X', axis: 'Y', angle: 45 }],
        }),
      ],
      'P',
    )
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
    const [face, edge] = sheet.views
    expect(face.boardOutline).toBeUndefined()
    expect(edge.boardOutline).toBeDefined()
  })

  it('selects scale 1:5 for a 400×200×18 board', () => {
    // raw = min((247-15)/(400+200), (135-15)/(200+18)) = min(0.387, 0.550) = 0.387 → 0.2
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200, thickness: 18 })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
    expect(sheet.scaleLabel).toBe('1:5')
  })

  it('selects scale 1:10 for a 1200×600×20 board', () => {
    // raw = min((247-15)/1800, (135-15)/620) = min(0.129, 0.194) = 0.129 → 0.1
    const sheets = buildDrawingSheets([makeBoard({ length: 1200, width: 600, thickness: 20 })], 'P')
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
    expect(sheet.scaleLabel).toBe('1:10')
  })

  it('cover sheet has correct rows for all parts', () => {
    const parts = [
      makeBoard({
        id: 'p1',
        label: 'Top',
        material: 'Oak',
        length: 800,
        width: 400,
        thickness: 18,
        cuts: [],
      }),
      makeBoard({
        id: 'p2',
        label: 'Side',
        material: 'Plywood',
        length: 600,
        width: 300,
        thickness: 12,
        cuts: [],
      }),
    ]
    const sheets = buildDrawingSheets(parts, 'Cabinet')
    const cover = sheets[0]
    if (cover.kind !== 'cover') throw new Error('expected cover')
    expect(cover.projectName).toBe('Cabinet')
    expect(cover.rows).toHaveLength(2)
    expect(cover.rows[0]).toMatchObject({ label: 'Top', material: 'Oak', dimensions: '800×400×18' })
    expect(cover.rows[1]).toMatchObject({
      label: 'Side',
      material: 'Plywood',
      dimensions: '600×300×12',
    })
  })

  it('sheet count = 1 + part count', () => {
    const parts = [makeBoard({ id: 'p1' }), makeBoard({ id: 'p2' }), makeBoard({ id: 'p3' })]
    const sheets = buildDrawingSheets(parts, 'P')
    expect(sheets).toHaveLength(4)
  })
})

function makeDowel(overrides: Partial<CylinderPart> = {}): CylinderPart {
  return {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel',
    diameter: 20,
    length: 100,
    material: 'Beech',
    color: '#c9a',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
    ...overrides,
  }
}

// ⌀20×100 fits at scale 1 (raw = min(232/120, 135/20) = 1.93 → 1), so view coords == mm.
function dowelSheet(cuts: DowelCut[] = [], overrides: Partial<CylinderPart> = {}) {
  const sheets = buildDrawingSheets([makeDowel({ cuts, ...overrides })], 'P')
  const sheet = sheets[1]
  if (sheet.kind !== 'part' || sheet.shape !== 'dowel') throw new Error('expected dowel part')
  return sheet
}

function midpoint(s: { x1: number; y1: number; x2: number; y2: number }) {
  return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 }
}

describe('buildDrawingSheets — dowels', () => {
  it('uncut dowel → Side rectangle + End circle, listed on cover', () => {
    const sheets = buildDrawingSheets([makeDowel()], 'P')
    expect(sheets).toHaveLength(2)
    const sheet = sheets[1]
    if (sheet.kind !== 'part' || sheet.shape !== 'dowel') throw new Error('expected dowel part')
    const [side, end] = sheet.views
    expect(side.label).toBe('Side')
    expect(end.label).toBe('End')
    expect(side.outline).toHaveLength(4)
    expect(side.outline[1]).toEqual({ x: 100, y: 0 })
    expect(side.outline[2]).toEqual({ x: 100, y: 20 })
    expect(side.dims.map((d) => d.label)).toEqual(expect.arrayContaining(['100mm', '⌀20mm']))
    expect(end.outline).toHaveLength(0)
    expect(end.circles[0].r).toBe(10)
    expect(end.circles[0].dashed).toBe(false)

    const cover = sheets[0]
    if (cover.kind !== 'cover') throw new Error('expected cover')
    expect(cover.rows[0]).toMatchObject({ dimensions: '⌀20×100', cutCount: 0 })
  })

  it('square end cut shortens the Side outline by offset', () => {
    const side = dowelSheet([
      { kind: 'end', id: 'c1', label: 'Trim', end: '+Z', offset: 10, angle: 0, azimuth: 0 },
    ]).views[0]
    expect(side.outline[1]).toEqual({ x: 90, y: 0 }) // top-right
    expect(side.outline[2]).toEqual({ x: 90, y: 20 }) // bottom-right
    expect(side.noteLabels.map((n) => n.text)).toContain('10mm')
  })

  it('angled end cut bevels the end and notes the angle', () => {
    const side = dowelSheet([
      { kind: 'end', id: 'c1', label: 'Mitre', end: '+Z', offset: 0, angle: 45, azimuth: 0 },
    ]).views[0]
    // drop = ⌀·tan(45°) = 20: top stays at 100, bottom recedes to 80
    expect(side.outline[1].x).toBeCloseTo(100, 3)
    expect(side.outline[2].x).toBeCloseTo(80, 3)
    expect(side.noteLabels.map((n) => n.text)).toContain('45°')
  })

  it('notch → Side slot + axial dim; End chord at radius R−depth', () => {
    const sheet = dowelSheet([
      { kind: 'notch', id: 'c1', label: 'Notch', position: 50, width: 20, depth: 5, azimuth: 0 },
    ])
    const [side, end] = sheet.views
    expect(side.rects).toHaveLength(1)
    expect(side.rects[0].rect).toEqual({ x: 40, y: 0, w: 20, h: 5 })
    expect(side.rects[0].dashed).toBe(false)
    expect(side.cutLabels[0].text).toBe('20×5 az0°')
    expect(side.dims.some((d) => d.label === '40mm')).toBe(true)
    expect(end.segments).toHaveLength(1)
    const m = midpoint(end.segments[0])
    expect(Math.hypot(m.x - 10, m.y - 10)).toBeCloseTo(5, 3) // R−depth = 10−5
  })

  it('axial blind bore → dashed walls + closing line + concentric dashed circle', () => {
    const sheet = dowelSheet([
      { kind: 'bore-axial', id: 'c1', label: 'Bore', end: '+Z', diameter: 6, depth: 30 },
    ])
    const [side, end] = sheet.views
    expect(side.segments).toHaveLength(3) // two walls + one closing (blind)
    expect(side.segments.every((s) => s.dashed)).toBe(true)
    expect(side.cutLabels[0].text).toBe('⌀6 30')
    expect(end.circles).toHaveLength(2)
    expect(end.circles[1]).toMatchObject({ r: 3, dashed: true })
  })

  it('axial through bore → no closing line, "through" label', () => {
    const side = dowelSheet([
      { kind: 'bore-axial', id: 'c1', label: 'Bore', end: '-Z', diameter: 6, depth: 100 },
    ]).views[0]
    expect(side.segments).toHaveLength(2) // walls only
    expect(side.cutLabels[0].text).toBe('⌀6 through')
  })

  it('transverse bore → dashed Side walls + axial dim + dashed End slot', () => {
    const sheet = dowelSheet([
      {
        kind: 'bore-transverse',
        id: 'c1',
        label: 'Cross',
        position: 50,
        azimuth: 0,
        diameter: 6,
        depth: 20,
      },
    ])
    const [side, end] = sheet.views
    expect(side.segments).toHaveLength(2)
    expect(side.segments.map((s) => s.x1).sort()).toEqual([47, 53])
    expect(side.segments.every((s) => s.dashed)).toBe(true)
    expect(side.cutLabels[0].text).toBe('⌀6 az0°')
    expect(side.dims.some((d) => d.label === '50mm')).toBe(true)
    expect(end.segments).toHaveLength(2)
    expect(end.segments.every((s) => s.dashed)).toBe(true)
  })

  it('degenerate cuts contribute no geometry', () => {
    const sheet = dowelSheet([
      { kind: 'notch', id: 'c1', label: 'n', position: 50, width: 20, depth: 0, azimuth: 0 },
      { kind: 'end', id: 'c2', label: 'e', end: '+Z', offset: 0, angle: 0, azimuth: 0 },
    ])
    const [side] = sheet.views
    expect(side.rects).toHaveLength(0)
    expect(side.noteLabels).toHaveLength(0)
    expect(side.outline[1]).toEqual({ x: 100, y: 0 }) // untrimmed
  })

  it('mixed scene → cover rows per kind; board + dowel sheets', () => {
    const board = makeBoard({ id: 'p1', label: 'Top', length: 800, width: 400, thickness: 18 })
    const sheets = buildDrawingSheets([board, makeDowel({ id: 'd1', label: 'Pin' })], 'Mix')
    expect(sheets).toHaveLength(3)
    const cover = sheets[0]
    if (cover.kind !== 'cover') throw new Error('expected cover')
    expect(cover.rows[0].dimensions).toBe('800×400×18')
    expect(cover.rows[1].dimensions).toBe('⌀20×100')
    expect(sheets[1].kind === 'part' && sheets[1].shape).toBe('board')
    expect(sheets[2].kind === 'part' && sheets[2].shape).toBe('dowel')
  })

  it('selects a smaller scale for a long thin dowel', () => {
    // ⌀10×2000: raw = min((247-15)/2010, 135/10) = min(0.115, 13.5) = 0.115 → 0.1
    const sheet = dowelSheet([], { diameter: 10, length: 2000 })
    expect(sheet.scaleLabel).toBe('1:10')
  })
})

function pinnedSide(): BoardPart {
  const carcase: Component = {
    id: 'cmp_1',
    kind: 'carcase',
    label: 'Base 600',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    // The preset's door taken off. A hinge plate screw shares the pin row's 37 mm front setback —
    // deliberately, they are the same 32 mm-system figure — so with a door on, the side carries two
    // families in one column on the Face view and these tests could no longer isolate a row. They
    // are about how a hole array is *drawn*, not about which families a cabinet has.
    params: { ...CARCASE_PRESETS[0].params, section: { ...CARCASE_PRESETS[0].params.section, front: undefined } },
  }
  const scene = regenerateComponents({
    parts: [],
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [carcase],
  })
  const side = scene.parts.find((p) => p.role === 'left-side')
  if (side === undefined || side.kind !== 'board') throw new Error('expected a board left side')
  return side
}

type BoardSheet = Extract<DrawingSheet, { kind: 'part'; shape: 'board' }>

function boardSheet(part: BoardPart): BoardSheet {
  const sheet = buildDrawingSheets([part], 'P')[1]
  if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('expected board part')
  return sheet
}

function scaleOf(sheet: BoardSheet): number {
  return 1 / Number(sheet.scaleLabel.split(':')[1])
}

describe('buildDrawingSheets — hole arrays', () => {
  it('draws one circle per hole in the view the row is drilled into', () => {
    const side = pinnedSide()
    const arrays = side.cuts.filter((c) => c.kind === 'hole-array')
    expect(arrays.length).toBeGreaterThan(0)
    const [face, edge, end] = boardSheet(side).views
    expect(face.circles).toHaveLength(arrays.reduce((n, a) => n + a.count, 0))
    expect(edge.circles).toEqual([])
    expect(end.circles).toEqual([])
  })

  it('gives every circle a radius of half the hole diameter, scaled', () => {
    const side = pinnedSide()
    const arrays = side.cuts.filter((c) => c.kind === 'hole-array')
    const sheet = boardSheet(side)
    const scale = scaleOf(sheet)
    for (const c of sheet.views[0].circles) {
      expect(c.r).toBeCloseTo((arrays[0].diameter / 2) * scale, 9)
    }
  })

  it('spaces consecutive holes one pitch apart, scaled', () => {
    const side = pinnedSide()
    const row = side.cuts.filter((c) => c.kind === 'hole-array')[0]
    const sheet = boardSheet(side)
    const scale = scaleOf(sheet)
    // The fixture's rows run along the panel height (the face's V axis), so one row is the
    // circles sharing its start's x — and, since the preset's side panel bounds a section above
    // and below its fixed shelf, lying within that row's own span. Sections are disjoint in
    // height, so the two rows at one setback stack rather than interleave.
    const top = (row.start.y + row.pitch * (row.count - 1)) * scale
    const circles = sheet.views[0].circles
      .filter(
        (c) =>
          Math.abs(c.cx - row.start.x * scale) < 1e-9 &&
          c.cy >= row.start.y * scale - 1e-9 &&
          c.cy <= top + 1e-9,
      )
      .sort((a, b) => a.cy - b.cy)
    expect(circles).toHaveLength(row.count)
    expect(circles[0].cy).toBeCloseTo(row.start.y * scale, 9)
    for (let i = 1; i < circles.length; i++) {
      expect(circles[i].cy - circles[i - 1].cy).toBeCloseTo(row.pitch * scale, 9)
    }
  })

  it('dashes a blind hole and leaves a through hole solid', () => {
    const side = pinnedSide()
    const arrays = side.cuts.filter((c) => c.kind === 'hole-array')
    expect(arrays[0].depth).toBeLessThan(side.thickness)
    expect(boardSheet(side).views[0].circles.every((c) => c.dashed)).toBe(true)

    const drilledThrough: BoardPart = {
      ...side,
      cuts: side.cuts.map((c) => (c.kind === 'hole-array' ? { ...c, depth: side.thickness } : c)),
    }
    expect(boardSheet(drilledThrough).views[0].circles.some((c) => c.dashed)).toBe(false)
  })

  it('gives a part with no hole arrays an empty circle list in every view', () => {
    for (const view of boardSheet(makeBoard()).views) {
      expect(view.circles).toEqual([])
    }
  })
})

describe('buildDrawingSheets — a cut rectangle sits on the board it is cut from', () => {
  // `BoxCut.position` is the box's MIN CORNER, not its centre: `makeCut` builds
  // `BRepPrimAPI_MakeBox_1(size)` — a box over [0, size] — and translates it by `position`, so the
  // tool occupies [position, position + size]. A projection that reads it as a centre draws every
  // cut offset by half its own size, which on a full-width dado puts half the rectangle off the
  // sheet. Containment is the assertion because it needs no number this test supplies.
  function everyCutRect(part: BoardPart) {
    const rects: { view: string; x: number; y: number; w: number; h: number; bw: number; bh: number }[] =
      []
    for (const sheet of buildDrawingSheets([part], 'test')) {
      if (sheet.kind !== 'part' || sheet.shape !== 'board') continue
      for (const v of sheet.views) {
        for (const r of v.cuts) {
          rects.push({
            view: v.label,
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            bw: v.boardRect.w,
            bh: v.boardRect.h,
          })
        }
      }
    }
    return rects
  }

  it('never draws a cut outside the board on a generated cabinet', () => {
    const cabinet: Component = {
      kind: 'carcase',
      id: 'cmp_1',
      label: 'Base 600',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params: CARCASE_PRESETS[0].params,
    }
    const scene = regenerateComponents({
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [cabinet],
    })
    const boards = scene.parts.filter((p): p is BoardPart => p.kind === 'board')
    const withCuts = boards.filter((b) => b.cuts.length > 0)
    expect(withCuts.length).toBeGreaterThan(0)

    for (const board of withCuts) {
      for (const r of everyCutRect(board)) {
        const where = `${board.role} ${r.view}`
        expect(r.x, where).toBeGreaterThanOrEqual(0)
        expect(r.y, where).toBeGreaterThanOrEqual(0)
        expect(r.x + r.w, where).toBeLessThanOrEqual(r.bw + 1e-9)
        expect(r.y + r.h, where).toBeLessThanOrEqual(r.bh + 1e-9)
      }
    }
  })

  it('places a cut at the offset its position names', () => {
    // A 100 x 50 through cut whose min corner is (200, 60) on an 800 x 300 face, at 1:1 scale after
    // dividing out whatever scale was chosen. Read off the board rect rather than hard-coded.
    const part = makeBoard({
      cuts: [
        {
          kind: 'box',
          id: 'c1',
          label: 'Cut',
          face: '+Z',
          position: { x: 200, y: 60, z: 0 },
          size: { x: 100, y: 50, z: 18 },
        },
      ],
    })
    const [r] = everyCutRect(part).filter((c) => c.view === 'Face')
    const scale = r.bw / 800
    expect(r.x / scale).toBeCloseTo(200, 6)
    expect(r.w / scale).toBeCloseTo(100, 6)
    // The Face view alone is built with flipV = false (Edge and End flip), so its y is the cut's
    // own v offset rather than a distance from the top. Predicted 300 - 110 here and the code said
    // 60; the code was right.
    expect(r.y / scale).toBeCloseTo(60, 6)
    expect(r.h / scale).toBeCloseTo(50, 6)
  })
})
