import { describe, expect, it } from 'vitest'
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  StandardFonts,
} from 'pdf-lib'
import { buildDrawingSheets } from '../geom/drawing'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { buildSvg } from './buildSvg'
import { buildDxf } from './buildDxf'
import { buildPdf } from './buildPdf'

async function pdfText(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc
    .getPages()
    .flatMap((page) => {
      const refs = page.node.lookup(PDFName.of('Contents'), PDFArray)
      return Array.from({ length: refs.size() }, (_, i) =>
        new TextDecoder().decode(decodePDFRawStream(refs.lookup(i, PDFRawStream)).decode()),
      )
    })
    .flatMap((operators) =>
      [...operators.matchAll(/<([0-9A-F]+)> Tj/g)].map((m) =>
        m[1]
          .match(/../g)!
          .map((n) => String.fromCharCode(parseInt(n, 16)))
          .join(''),
      ),
    )
    .join(' ')
}
describe('printed drawing identities', () => {
  it('keeps full UUID references inside page margins for cuts near a corner', async () => {
    const scene = machiningProject()
    const board = scene.parts[0]
    const cutId = 'cut_12345678-1234-1234-1234-123456789abc'
    board.cuts[0].id = cutId
    const sheets = buildDrawingSheets(scene.parts, 'Test')
    const sheet = sheets.find((s) => s.kind === 'part' && s.shape === 'board')!
    const label = `[${cutId}] 30×30mm`
    const svg = new DOMParser().parseFromString(buildSvg(sheet), 'image/svg+xml')
    const node = [...svg.querySelectorAll('text')].find((node) => node.textContent === label)!
    expect(node).toBeTruthy()
    const doc = await PDFDocument.load(await buildPdf(sheets))
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const widthMm = font.widthOfTextAtSize(label, Number(node.getAttribute('font-size')))
    const center = Number(node.getAttribute('x'))
    expect(center - widthMm / 2).toBeGreaterThanOrEqual(15)
    expect(center + widthMm / 2).toBeLessThanOrEqual(282)
    const hex = [...label]
      .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    const page = doc.getPage(sheets.indexOf(sheet))
    const contents = page.node.lookup(PDFName.of('Contents'), PDFArray)
    const operators = Array.from({ length: contents.size() }, (_, i) =>
      new TextDecoder().decode(decodePDFRawStream(contents.lookup(i, PDFRawStream)).decode()),
    ).join(' ')
    const position = new RegExp(`1 0 0 1 ([\\d.-]+) ([\\d.-]+) Tm\\s*<${hex}> Tj`).exec(operators)
    expect(position).not.toBeNull()
    const x = Number(position![1])
    const mmToPt = 72 / 25.4
    expect(x).toBeGreaterThanOrEqual(15 * mmToPt - 0.001)
    expect(x + font.widthOfTextAtSize(label, 2.5 * mmToPt)).toBeLessThanOrEqual(
      282 * mmToPt + 0.001,
    )
    expect(buildDxf(sheet)).toContain(cutId)
  })

  it('prints part IDs, geometric cut IDs, drilling IDs and explicitly manual references in all formats', async () => {
    const scene = machiningProject()
    const sheets = buildDrawingSheets(scene.parts, 'Test')
    const board = sheets.find((s) => s.kind === 'part' && s.shape === 'board')!
    if (board.kind !== 'part' || board.shape !== 'board') throw new Error('Expected board')
    const manualId = board.manualNoteReferences![0].operationIds[0]
    const texts = [buildSvg(board), buildDxf(board), await pdfText(await buildPdf(sheets))]
    for (const text of texts) {
      expect(text).toContain(`Part ID: ${board.partId}`)
      expect(text).toContain('[rebate]')
      expect(text).toContain('[bevel]')
      expect(text).toContain('[row]')
      expect(text).toContain(`Manual instruction [${manualId}]`)
      expect(text).toContain('Drilling [row]:')
    }
    const round = sheets.find((s) => s.kind === 'part' && s.shape === 'dowel')!
    if (round.kind !== 'part') throw new Error('Expected dowel')
    for (const text of [buildSvg(round), buildDxf(round), texts[2]]) {
      expect(text).toContain(`Part ID: ${round.partId}`)
      for (const cut of scene.parts.find((p) => p.id === round.partId)!.cuts)
        expect(text).toContain(`[${cut.id}]`)
    }
  })
})
