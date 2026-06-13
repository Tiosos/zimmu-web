import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildDrawingSheets } from '../geom/drawing'
import type { Part } from '../scene/types'
import { buildPdf } from './buildPdf'

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

describe('buildPdf', () => {
  it('returns a Uint8Array starting with %PDF-', async () => {
    const bytes = await buildPdf(buildDrawingSheets([makeBoard()], 'Test Project'))
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('produces one page per sheet', async () => {
    const sheets = buildDrawingSheets([makeBoard()], 'Test Project')
    const bytes = await buildPdf(sheets)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(sheets.length)
  })

  it('handles a part with cuts without throwing', async () => {
    const cut = {
      id: 'c1',
      label: 'Dado',
      face: '+Z' as const,
      position: { x: 100, y: 100, z: 18 },
      size: { x: 20, y: 20, z: 6 },
    }
    const withCuts = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'Test')
    await expect(buildPdf(withCuts)).resolves.toBeInstanceOf(Uint8Array)
  })
})
