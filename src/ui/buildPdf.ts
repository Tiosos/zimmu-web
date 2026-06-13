import { PDFDocument } from 'pdf-lib'
import type { DrawingSheet } from '../geom/drawing'

const MM_TO_PT = 72 / 25.4
const PAGE_W_PT = 297 * MM_TO_PT
const PAGE_H_PT = 210 * MM_TO_PT

export async function buildPdf(sheets: DrawingSheet[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _sheet of sheets) {
    doc.addPage([PAGE_W_PT, PAGE_H_PT])
  }
  return doc.save()
}
