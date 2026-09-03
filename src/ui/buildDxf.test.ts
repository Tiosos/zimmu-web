import { describe, it, expect } from 'vitest'
import { buildDxf } from './buildDxf'
import { buildDrawingSheets } from '../geom/drawing'
import type { PlacedAssemblyView } from '../geom/drawing'
import { regenerateComponents } from '../scene/regenerateComponents'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { cabinet, partsOfBase600 } from '../geom/__fixtures__/cabinetSheet'
import type {
  BoardPart,
  Component,
  ComponentId,
  CylinderPart,
  DowelCut,
  Part,
} from '../scene/types'

function makeBoard(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 400,
    width: 200,
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

describe('buildDxf', () => {
  it('starts with DXF HEADER section', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER')).toBe(true)
  })

  it('ends with EOF', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true)
  })

  it('contains all 5 required layer names in TABLES section', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    for (const layer of ['OUTLINE', 'CUTS', 'DIM', 'TEXT', 'TITLE']) {
      expect(dxf).toContain(layer)
    }
  })

  it('contains LINE entities for board outlines (at least 3 views × 4 lines = 12)', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    const count = (dxf.match(/^0\nLINE$/gm) ?? []).length
    expect(count).toBeGreaterThanOrEqual(12)
  })

  it('applies Y-flip: SVG y=0 maps to DXF y=210', () => {
    // Face view placement.y = MARGIN = 15 in SVG → y_dxf for top of Face = 210 - 15 = 195
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const dxf = buildDxf(sheets[1])
    expect(dxf).toContain('\n195.000\n')
  })

  it('contains TEXT entity with the length label', () => {
    const sheets = buildDrawingSheets([makeBoard({ length: 750 })], 'Test')
    const dxf = buildDxf(sheets[1])
    expect(dxf).toContain('750mm')
  })

  it('cover sheet DXF also starts with HEADER and ends with EOF', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'My Project')
    const dxf = buildDxf(sheets[0])
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER')).toBe(true)
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true)
    expect(dxf).toContain('My Project')
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
    color: '#cc99aa',
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

describe('buildDxf — dowels', () => {
  it('emits a CIRCLE for the End view boundary', () => {
    const dxf = buildDxf(buildDrawingSheets([makeDowel()], 'Test')[1])
    expect(dxf).toContain('\nCIRCLE\n')
    expect(dxf.startsWith('0\nSECTION\n2\nHEADER')).toBe(true)
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true)
  })

  it('TABLES defines a DASHED linetype and a HIDDEN layer', () => {
    const dxf = buildDxf(buildDrawingSheets([makeDowel()], 'Test')[1])
    expect(dxf).toContain('LTYPE')
    expect(dxf).toContain('DASHED')
    expect(dxf).toContain('HIDDEN')
  })

  it('dashed bore geometry carries the DASHED linetype override on HIDDEN', () => {
    const bore: DowelCut = {
      kind: 'bore-axial',
      id: 'c1',
      label: 'Bore',
      end: '+Z',
      diameter: 6,
      depth: 30,
    }
    const dxf = buildDxf(buildDrawingSheets([makeDowel({ cuts: [bore] })], 'Test')[1])
    expect(dxf).toContain('8\nHIDDEN\n6\nDASHED')
  })

  it('applies Y-flip to dowel coordinates (top edge y=15 → 195)', () => {
    const dxf = buildDxf(buildDrawingSheets([makeDowel()], 'Test')[1])
    expect(dxf).toContain('\n195.000\n')
  })

  it('cover uses the generic Dimensions header and ⌀ row text', () => {
    const dxf = buildDxf(buildDrawingSheets([makeDowel()], 'Test')[0])
    expect(dxf).toContain('Dimensions')
    expect(dxf).toContain('⌀20×100')
  })
})

const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

const assemblySheet = (parts: Part[] = partsOfBase600()) => {
  const [, sheet] = buildDrawingSheets([], 'Job', [
    { cabinet, parts, byId, materials: PRESET_MATERIALS },
  ])
  if (sheet.kind !== 'assembly') throw new Error('expected an assembly sheet')
  return sheet
}

// The parts a Base 600 really carries, bores and all — `partsOfBase600` strips every cut, so an
// assembly sheet built from it has no machining to draw and cannot see a renderer that drops it.
const boredParts = (): Part[] =>
  regenerateComponents({
    parts: [],
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [cabinet],
  }).parts

// One chunk per entity, split on the group-code-0 record that starts each. Counting the bare
// substring 'LINE' also matches POLYLINE and LWPOLYLINE and would pass on a file holding no LINE
// entity at all. Bounded to the ENTITIES section because the TABLES section carries '\n0\n' inside
// its own records, where it starts a table entry rather than an entity.
const entitiesOf = (dxf: string, type: string): string[] =>
  dxf
    .slice(dxf.indexOf('2\nENTITIES\n'))
    .split('\n0\n')
    .filter((e) => e.startsWith(`${type}\n`))

const group = (entity: string, code: string): string =>
  entity.match(new RegExp(`^${code}\\n(.*)$`, 'm'))?.[1] ?? ''

const lineAt = (e: string) => ({
  layer: group(e, '8'),
  dashed: group(e, '6') === 'DASHED',
  x1: Number(group(e, '10')),
  y1: Number(group(e, '20')),
  x2: Number(group(e, '11')),
  y2: Number(group(e, '21')),
})

const totalOver = (
  sheet: ReturnType<typeof assemblySheet>,
  pick: (p: PlacedAssemblyView['parts'][number]) => number,
): number => sheet.views.reduce((n, v) => n + v.parts.reduce((m, p) => m + pick(p), 0), 0)

describe('buildDxf — assembly sheets', () => {
  it('emits one LINE per projected segment, on the right layers', () => {
    const sheet = assemblySheet()
    const drawn = entitiesOf(buildDxf(sheet), 'LINE').map(lineAt)
    const solid = totalOver(sheet, (p) => p.solid.length)
    const hidden = totalOver(sheet, (p) => p.hidden.length)
    expect(solid).toBeGreaterThan(0)
    expect(hidden).toBeGreaterThan(0)
    expect(drawn.filter((l) => l.layer === 'OUTLINE')).toHaveLength(solid)
    // The words alone are not the evidence: dxfTables DEFINES the HIDDEN layer and the DASHED
    // linetype, so a file that drew every hidden edge solid still contains both. The entities that
    // carry them are counted, and each one's per-entity override with them.
    const dashed = drawn.filter((l) => l.layer === 'HIDDEN')
    expect(dashed).toHaveLength(hidden)
    expect(dashed.every((l) => l.dashed)).toBe(true)
  })

  it('dimensions an assembly sheet', () => {
    const sheet = assemblySheet()
    const texts = entitiesOf(buildDxf(sheet), 'TEXT').map((e) => group(e, '1'))
    const labels = sheet.views.flatMap((v) => v.dims.map((d) => d.label))
    expect(labels.length).toBeGreaterThan(0)
    for (const label of labels) expect(texts).toContain(label)
  })

  it('draws a non-axis-aligned part as its outline, not as a box', () => {
    const dowel: Part = {
      kind: 'cylinder',
      id: 'board_dowel',
      label: 'Dowel 1',
      diameter: 8,
      length: 40,
      material: '',
      color: '#ca8',
      position: { x: 100, y: 100, z: 100 },
      rotation: { x: 0, y: 30, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
      parentId: cabinet.id,
      driven: false,
    }
    const sheet = assemblySheet([dowel])
    const drawn = entitiesOf(buildDxf(sheet), 'LINE')
      .map(lineAt)
      .filter((l) => l.layer === 'OUTLINE')
    const hull = totalOver(sheet, (p) => p.outline?.length ?? 0)
    expect(hull).toBeGreaterThan(0)
    // One edge per hull segment and no more: the bounding box `solid` traces is the hit shape, not
    // the drawing, and the two are alternatives.
    expect(drawn).toHaveLength(hull)
    // Front sees the cylinder tilted, so its silhouette has edges no bounding box has. Without
    // this a renderer that drew the box instead would match the count in every view.
    expect(drawn.some((l) => l.x1 !== l.x2 && l.y1 !== l.y2)).toBe(true)
  })

  it('draws the machining an assembly sheet carries', () => {
    const sheet = assemblySheet(boredParts())
    const dxf = buildDxf(sheet)
    const circles = totalOver(sheet, (p) => p.circles.length)
    const cutRects = totalOver(sheet, (p) => p.cutRects.length)
    expect(circles).toBeGreaterThan(0)
    expect(cutRects).toBeGreaterThan(0)
    expect(entitiesOf(dxf, 'CIRCLE')).toHaveLength(circles)
    const cuts = entitiesOf(dxf, 'LINE')
      .map(lineAt)
      .filter((l) => l.layer === 'CUTS')
    expect(cuts).toHaveLength(4 * cutRects)
  })

  it('keeps the tables that define the layer and the linetype its entities reference', () => {
    const dxf = buildDxf(assemblySheet())
    expect(dxf).toContain('0\nLTYPE\n2\nDASHED\n')
    expect(dxf).toContain('0\nLAYER\n2\nHIDDEN\n')
    expect(dxf.indexOf('2\nTABLES')).toBeLessThan(dxf.indexOf('2\nENTITIES'))
  })

  it('titles the sheet with the cabinet, the scale and the date', () => {
    const sheet = assemblySheet()
    const texts = entitiesOf(buildDxf(sheet), 'TEXT').map((e) => group(e, '1'))
    expect(texts).toContain(sheet.cabinetLabel)
    expect(texts).toContain(`Scale: ${sheet.scaleLabel}`)
    expect(texts).toContain(`Date: ${sheet.date}`)
  })

  // Every dxf* helper takes sheet millimetres with y running DOWN and applies the flip to DXF's
  // y-up page itself, so the assembly branch converts carcase v to sheet y and stops. Flipping a
  // second time on the way in draws the cabinet upside down inside a plausible-looking sheet — the
  // fixture is asymmetric in v (a toe kick at the bottom, nothing matching it at the top), so the
  // flipped and unflipped sets differ.
  it('maps carcase v to DXF y with a single flip', () => {
    const sheet = assemblySheet()
    const front = sheet.views[0]
    const right = front.placement.x + front.bounds.w * sheet.scale
    const round = (n: number) => Math.round(n * 1e3) / 1e3
    const drawn = new Set(
      entitiesOf(buildDxf(sheet), 'LINE')
        .map(lineAt)
        .filter((l) => l.layer === 'OUTLINE' && l.x1 <= right + 1e-6 && l.x2 <= right + 1e-6)
        .flatMap((l) => [l.y1, l.y2])
        .map(round),
    )
    const expected = new Set(
      front.parts
        .flatMap((p) => p.solid)
        .flatMap((s) => [s.y1, s.y2])
        .map((v) => round(210 - (front.placement.y + (front.bounds.h - v) * sheet.scale))),
    )
    expect(expected.size).toBeGreaterThan(1)
    const asc = (s: Set<number>) => [...s].sort((a, b) => a - b)
    expect(asc(drawn)).toEqual(asc(expected))
  })
})
