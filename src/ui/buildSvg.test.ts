import { describe, it, expect } from 'vitest'
import { buildSvg } from './buildSvg'
import { buildDrawingSheets } from '../geom/drawing'
import type { Part } from '../scene/types'

function makeBoard(overrides: Partial<Part> = {}): Part {
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
})
