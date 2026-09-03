import { describe, it, expect } from 'vitest'
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { buildDrawingSheets } from '../geom/drawing'
import { regenerateComponents } from '../scene/regenerateComponents'
import { PRESET_MATERIALS } from '../scene/carcasePresets'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import type { BoardPart, Component, ComponentId, Part } from '../scene/types'
import { buildPdf } from './buildPdf'

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
      kind: 'box' as const,
      face: '+Z' as const,
      position: { x: 100, y: 100, z: 18 },
      size: { x: 20, y: 20, z: 6 },
    }
    const withCuts = buildDrawingSheets([makeBoard({ cuts: [cut] })], 'Test')
    await expect(buildPdf(withCuts)).resolves.toBeInstanceOf(Uint8Array)
  })
})

describe('buildPdf — assembly sheets', () => {
  const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

  // Every family the renderer draws, in one deck: a regenerated Base 600 brings the pin bores and
  // the toe-kick notches `partsOfBase600` strips, and the tilted dowel is the part whose silhouette
  // is not its bounding box. The content stream cannot be asked which of them is which — only that
  // the page carries one — so their share of this test is that they are drawn at all.
  const deck = () => {
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
    const bored = regenerateComponents({
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [cabinet],
    }).parts
    const sheets = buildDrawingSheets([], 'Job', [
      { cabinet, parts: [...bored, dowel], byId, materials: PRESET_MATERIALS },
    ])
    const sheet = sheets[1]
    if (sheet.kind !== 'assembly') throw new Error('expected an assembly sheet')
    return { sheets, sheet }
  }

  // pdf-lib keeps no model of what was drawn, so a page can only be asked for its content stream:
  // the operators, Flate-compressed, with every string written as hex. That is enough — an undrawn
  // page carries no Contents entry at all, so page count and orientation alone would pass a
  // renderer that drew nothing on it.
  const contentOf = async (doc: PDFDocument, page: number): Promise<string> => {
    const contents = doc.getPage(page).node.get(PDFName.of('Contents'))
    if (!(contents instanceof PDFArray)) throw new Error('the page carries no content stream')
    const stream = doc.context.lookup(contents.get(0))
    if (!(stream instanceof PDFRawStream)) throw new Error('expected a raw content stream')
    return new Response(
      new Blob([new Uint8Array(stream.contents)]).stream().pipeThrough(new DecompressionStream('deflate')),
    ).text()
  }

  const hex = (s: string): string =>
    [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join('')

  it('renders an assembly sheet as one landscape page', async () => {
    const { sheets, sheet } = deck()
    const doc = await PDFDocument.load(await buildPdf(sheets))
    expect(doc.getPageCount()).toBe(sheets.length)
    const page = doc.getPage(1)
    expect(page.getWidth()).toBeGreaterThan(page.getHeight())
    const content = await contentOf(doc, 1)
    expect(content).toContain(`<${hex(sheet.views[0].dims[0].label)}>`)
    expect(content).toContain(`<${hex(sheet.cabinetLabel)}>`)
  })
})
