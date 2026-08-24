import { describe, it, expect } from 'vitest'
import { buildSvg } from './buildSvg'
import { buildDrawingSheets } from '../geom/drawing'
import { regenerateComponents } from '../scene/regenerateComponents'
import { CARCASE_PRESETS } from '../scene/carcasePresets'
import type { BoardPart, Component, CylinderPart, DowelCut } from '../scene/types'

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

describe('buildSvg', () => {
  it('returns well-formed XML', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const svgStr = buildSvg(sheets[1])
    const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

  it('SVG root has A4 landscape dimensions', () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('width="297mm"')
    expect(svgStr).toContain('height="210mm"')
    expect(svgStr).toContain('viewBox="0 0 297 210"')
  })

  it('Face view board rect width matches L×scale', () => {
    // scale 1:5 (0.2) → 400×0.2 = 80mm wide
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200 })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('width="80.000"')
  })

  it('contains a cut rect for each cut in the sheet', () => {
    const cut = {
      id: 'c1',
      label: 'Dado',
      kind: 'box' as const,
      face: '+Z' as const,
      position: { x: 100, y: 100, z: 18 },
      size: { x: 20, y: 20, z: 6 },
    }
    const sheets = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'Test')
    const svgStr = buildSvg(sheets[1])
    // At minimum 5 rects: 3 board outlines + 1 cut + 1 title block
    expect((svgStr.match(/<rect /g) ?? []).length).toBeGreaterThanOrEqual(5)
  })

  it('dim text contains the length label', () => {
    const sheets = buildDrawingSheets([makeBoard({ length: 750 })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('750mm')
  })

  it('title block contains the part label', () => {
    const sheets = buildDrawingSheets([makeBoard({ label: 'Top Rail' })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('Top Rail')
  })

  it('title block contains the scale label', () => {
    const sheets = buildDrawingSheets([makeBoard({ length: 400, width: 200 })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).toContain('1:5')
  })

  it('cover sheet contains all part labels', () => {
    const parts = [makeBoard({ id: 'p1', label: 'Top' }), makeBoard({ id: 'p2', label: 'Bottom' })]
    const svgStr = buildSvg(buildDrawingSheets(parts, 'Cabinet')[0])
    expect(svgStr).toContain('Top')
    expect(svgStr).toContain('Bottom')
  })

  it('escapes special characters in part label to prevent XSS', () => {
    const sheets = buildDrawingSheets([makeBoard({ label: '<script>alert(1)</script>' })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).not.toContain('<script>')
    expect(svgStr).toContain('&lt;script&gt;')
  })

  it('escapes ampersands in material name', () => {
    const sheets = buildDrawingSheets([makeBoard({ material: 'Oak & Pine' })], 'Test')
    const svgStr = buildSvg(sheets[1])
    expect(svgStr).not.toContain('Oak & Pine')
    expect(svgStr).toContain('Oak &amp; Pine')
  })

  it('cover header uses the generic Dimensions column', () => {
    const svgStr = buildSvg(buildDrawingSheets([makeBoard()], 'Test')[0])
    expect(svgStr).toContain('Dimensions')
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

describe('buildSvg — dowels', () => {
  it('dowel sheet is well-formed XML', () => {
    const svgStr = buildSvg(buildDrawingSheets([makeDowel()], 'Test')[1])
    const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

  it('End view emits a circle with r = R×scale', () => {
    // ⌀20×100 → scale 1, R = 10
    const svgStr = buildSvg(buildDrawingSheets([makeDowel()], 'Test')[1])
    expect(svgStr).toContain('<circle')
    expect(svgStr).toContain('r="10.000"')
  })

  it('dashed bore profiles carry stroke-dasharray; solid boundary does not', () => {
    const bore: DowelCut = {
      kind: 'bore-axial',
      id: 'c1',
      label: 'Bore',
      end: '+Z',
      diameter: 6,
      depth: 30,
    }
    const svgStr = buildSvg(buildDrawingSheets([makeDowel({ cuts: [bore] })], 'Test')[1])
    expect(svgStr).toContain('stroke-dasharray')
    // the solid boundary circle (r=10) must not be dashed
    const boundary = svgStr.match(/<circle[^>]*r="10\.000"[^>]*\/>/)?.[0] ?? ''
    expect(boundary).not.toContain('stroke-dasharray')
  })

  it('notch renders a slot rect with an azimuth label', () => {
    const notch: DowelCut = {
      kind: 'notch',
      id: 'c1',
      label: 'Notch',
      position: 50,
      width: 20,
      depth: 5,
      azimuth: 90,
    }
    const svgStr = buildSvg(buildDrawingSheets([makeDowel({ cuts: [notch] })], 'Test')[1])
    expect(svgStr).toContain('az90°')
    expect((svgStr.match(/<rect /g) ?? []).length).toBeGreaterThanOrEqual(2) // slot + title block
  })

  it('title block carries the dowel label and scale', () => {
    const svgStr = buildSvg(buildDrawingSheets([makeDowel({ label: 'Shelf Pin' })], 'Test')[1])
    expect(svgStr).toContain('Shelf Pin')
    expect(svgStr).toContain('1:1')
  })

  it('cover lists the dowel with a ⌀ dimensions string', () => {
    const svgStr = buildSvg(buildDrawingSheets([makeDowel()], 'Test')[0])
    expect(svgStr).toContain('⌀20×100')
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
    params: CARCASE_PRESETS[0].params,
  }
  const scene = regenerateComponents({
    parts: [],
    materials: {},
    hardware: [],
    joints: [],
    components: [carcase],
  })
  const side = scene.parts.find((p) => p.role === 'left-side')
  if (side === undefined || side.kind !== 'board') throw new Error('expected a board left side')
  return side
}

function partSvgCircles(part: BoardPart): Element[] {
  const svgStr = buildSvg(buildDrawingSheets([part], 'Test')[1])
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  return [...doc.querySelectorAll('circle')]
}

describe('buildSvg — hole arrays', () => {
  it('emits a circle for every pin hole', () => {
    const side = pinnedSide()
    const holes = side.cuts.filter((c) => c.kind === 'hole-array').reduce((n, a) => n + a.count, 0)
    expect(holes).toBeGreaterThan(0)
    expect(partSvgCircles(side)).toHaveLength(holes)
  })

  it('dashes blind pin holes and leaves through holes solid', () => {
    const side = pinnedSide()
    const blind = partSvgCircles(side)
    expect(blind.length).toBeGreaterThan(0)
    expect(blind.every((c) => c.getAttribute('stroke-dasharray') !== null)).toBe(true)

    const drilledThrough: BoardPart = {
      ...side,
      cuts: side.cuts.map((c) => (c.kind === 'hole-array' ? { ...c, depth: side.thickness } : c)),
    }
    const solid = partSvgCircles(drilledThrough)
    expect(solid.length).toBeGreaterThan(0)
    expect(solid.some((c) => c.getAttribute('stroke-dasharray') !== null)).toBe(false)
  })
})
