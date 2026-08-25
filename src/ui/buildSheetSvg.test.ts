import { describe, expect, it } from 'vitest'
import { buildSheetSvg } from './buildSheetSvg'
import type { Placement, SheetSpec } from '../nest/nest'

const SHEET: SheetSpec = { length: 2440, width: 1220 }
const VIEWPORT = 600

function place(over: Partial<Placement> & { id: string }): Placement {
  return { sheet: 0, rotation: 0, x: 0, y: 0, w: 600, h: 300, ...over }
}

function parse(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement as unknown as SVGSVGElement
  expect(doc.querySelector('parsererror'), 'the SVG must parse').toBeNull()
  return root
}

// The sheet outline the same code produced, so the containment test below asserts no number this
// test supplies — the shape of assertion that caught the drawing-projection bug in #34.
function sheetRect(root: Element): { x: number; y: number; w: number; h: number } {
  const el = root.querySelector('[data-sheet]')!
  return {
    x: Number(el.getAttribute('x')),
    y: Number(el.getAttribute('y')),
    w: Number(el.getAttribute('width')),
    h: Number(el.getAttribute('height')),
  }
}

function partRects(root: Element) {
  return [...root.querySelectorAll('[data-part]')].map((el) => ({
    id: el.getAttribute('data-part')!,
    x: Number(el.getAttribute('x')),
    y: Number(el.getAttribute('y')),
    w: Number(el.getAttribute('width')),
    h: Number(el.getAttribute('height')),
  }))
}

describe('buildSheetSvg', () => {
  it('draws one rect per placement', () => {
    const root = parse(
      buildSheetSvg(
        SHEET,
        [place({ id: 'a' }), place({ id: 'b', x: 700 }), place({ id: 'c', y: 400 })],
        (id) => id,
        VIEWPORT,
      ),
    )
    expect(partRects(root).map((r) => r.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('draws every part inside the sheet outline', () => {
    const placements = [
      place({ id: 'origin', x: 0, y: 0 }),
      place({ id: 'far', x: 2440 - 600, y: 1220 - 300 }),
      place({ id: 'mid', x: 900, y: 500, w: 400, h: 200 }),
    ]
    const root = parse(buildSheetSvg(SHEET, placements, (id) => id, VIEWPORT))
    const sheet = sheetRect(root)
    for (const r of partRects(root)) {
      expect(r.x, r.id).toBeGreaterThanOrEqual(sheet.x)
      expect(r.y, r.id).toBeGreaterThanOrEqual(sheet.y)
      expect(r.x + r.w, r.id).toBeLessThanOrEqual(sheet.x + sheet.w + 1e-9)
      expect(r.y + r.h, r.id).toBeLessThanOrEqual(sheet.y + sheet.h + 1e-9)
    }
  })

  // A nest has its origin bottom-left, like a sheet lying on a bench; SVG y grows downward. Stated
  // and tested rather than assumed — the Face-view flip in drawing.ts is the cautionary tale.
  it('puts a part at y = 0 against the BOTTOM of the drawing', () => {
    const root = parse(buildSheetSvg(SHEET, [place({ id: 'bottom', y: 0 })], (id) => id, VIEWPORT))
    const sheet = sheetRect(root)
    const [r] = partRects(root)
    expect(r.y + r.h).toBeCloseTo(sheet.y + sheet.h, 6)
  })

  it('puts a part at the top of the sheet against the top of the drawing', () => {
    const root = parse(
      buildSheetSvg(SHEET, [place({ id: 'top', y: 1220 - 300 })], (id) => id, VIEWPORT),
    )
    expect(partRects(root)[0].y).toBeCloseTo(sheetRect(root).y, 6)
  })

  it('scales the sheet to the viewport width, keeping the stock s proportions', () => {
    const root = parse(buildSheetSvg(SHEET, [], () => '', VIEWPORT))
    const sheet = sheetRect(root)
    expect(sheet.w).toBeCloseTo(VIEWPORT, 6)
    expect(sheet.w / sheet.h).toBeCloseTo(SHEET.length / SHEET.width, 6)
  })

  it('labels every placement', () => {
    const root = parse(
      buildSheetSvg(SHEET, [place({ id: 'a' }), place({ id: 'b', x: 700 })], (id) => `Part ${id}`, VIEWPORT),
    )
    const texts = [...root.querySelectorAll('text')].map((t) => t.textContent)
    expect(texts).toContain('Part a')
    expect(texts).toContain('Part b')
  })

  it('omits a label too big for its part rather than letting it overflow', () => {
    const root = parse(
      buildSheetSvg(SHEET, [place({ id: 'tiny', w: 20, h: 20 })], () => 'A very long label', VIEWPORT),
    )
    expect(root.querySelectorAll('text')).toHaveLength(0)
  })

  it('escapes a label that would otherwise break the markup', () => {
    const svg = buildSheetSvg(SHEET, [place({ id: 'x' })], () => 'A & B <thing>', VIEWPORT)
    const root = parse(svg)
    expect(root.querySelector('text')!.textContent).toBe('A & B <thing>')
  })

  it('renders an empty sheet without throwing', () => {
    const root = parse(buildSheetSvg(SHEET, [], () => '', VIEWPORT))
    expect(partRects(root)).toEqual([])
    expect(sheetRect(root).w).toBeCloseTo(VIEWPORT, 6)
  })
})
