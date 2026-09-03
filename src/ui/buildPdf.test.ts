import { describe, it, expect } from 'vitest'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib'
import { assemblyDimLine, buildDrawingSheets } from '../geom/drawing'
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
      new Blob([new Uint8Array(stream.contents)])
        .stream()
        .pipeThrough(new DecompressionStream('deflate')),
    ).text()
  }

  const hex = (s: string): string =>
    [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join('')

  // Every string pdf-lib shows is preceded by the text matrix that positions it, so the stream can
  // be read back as (x, y, label) even though the document keeps no model of what was drawn.
  const textsIn = (content: string) =>
    [...content.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s*<([0-9A-Fa-f]*)> Tj/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      label: (m[3].match(/../g) ?? []).map((b) => String.fromCharCode(parseInt(b, 16))).join(''),
    }))

  const MM_TO_PT = 72 / 25.4
  const ptOf = (mm: number) => mm * MM_TO_PT
  const yflip = (mm: number) => ptOf(210) - ptOf(mm)

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

  // A board sheet names every view it draws; the assembly branch drew three unnamed ones. PDF y
  // runs up, so a label above its own drawing has the GREATER y.
  it('names each of its three views, above the drawing it names', async () => {
    const { sheets, sheet } = deck()
    const doc = await PDFDocument.load(await buildPdf(sheets))
    const texts = textsIn(await contentOf(doc, 1))
    for (const v of sheet.views) {
      const named = texts.filter((t) => t.label === v.label)
      expect(named).toHaveLength(1)
      expect(named[0].x).toBeCloseTo(ptOf(v.placement.x), 6)
      expect(named[0].y).toBeGreaterThan(yflip(v.placement.y))
    }
  })

  // A label reads away from its own dimension line. pdf-lib draws from the left edge, so a
  // left-hand label must be shifted by its own width — the whole label clear of the line, not just
  // its start. Invisible on a board sheet, where every vertical dim is on the right.
  it('places a vertical dimension label on the side its line is on', async () => {
    const { sheets, sheet } = deck()
    const doc = await PDFDocument.load(await buildPdf(sheets))
    const texts = textsIn(await contentOf(doc, 1))
    // The same standard font buildPdf embeds, so this measures the label the way the renderer did.
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
    const fs = ptOf(2)
    let onLeft = 0
    let onRight = 0
    for (const v of sheet.views) {
      // Each view's dimension ring is its own band of the page; a label landing in the next view's
      // band fails this, and should — the layout reserved that ring and chose the scale from it.
      const band = texts.filter(
        (t) =>
          t.x > ptOf(v.placement.x - sheet.ring) - 1e-6 &&
          t.x < ptOf(v.placement.x + v.bounds.w * sheet.scale + sheet.ring) + 1e-6,
      )
      for (const d of v.dims.filter((x) => x.axis === 'v')) {
        const line = assemblyDimLine(d, v.bounds, sheet.scale)
        const lineX = ptOf(v.placement.x + line.offset)
        const midY = yflip(v.placement.y + (line.start + line.end) / 2)
        const found = band.filter(
          (t) => t.label === d.label && Math.abs(t.y - midY) < font.heightAtSize(fs),
        )
        expect(found).toHaveLength(1)
        if (line.offset < 0) {
          onLeft++
          expect(found[0].x + font.widthOfTextAtSize(d.label, fs)).toBeLessThanOrEqual(lineX)
        } else {
          onRight++
          expect(found[0].x).toBeGreaterThan(lineX)
        }
      }
    }
    expect(onLeft).toBeGreaterThan(0)
    expect(onRight).toBeGreaterThan(0)
  })
})
