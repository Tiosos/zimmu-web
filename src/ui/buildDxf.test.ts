import { describe, it, expect } from 'vitest'
import { buildDxf } from './buildDxf'
import { buildDrawingSheets } from '../geom/drawing'
import type { BoardPart, CylinderPart, DowelCut } from '../scene/types'

function makeBoard(overrides: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'p1',
    label: 'Shelf',
    length: 400,
    width: 200,
    thickness: 18,
    material: 'Plywood',
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
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
