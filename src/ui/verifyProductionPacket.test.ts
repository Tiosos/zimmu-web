import { beforeAll, describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { buildProductionPacket } from './buildProductionPacket'
import { buildDrawingIndexCsv } from './buildDrawingIndex'
import { buildMachiningCsv } from './buildMachiningCsv'
import { MAX_PACKET_BYTES, verifyProductionPacket } from './verifyProductionPacket'

let original: Uint8Array
beforeAll(async () => {
  original = await buildProductionPacket({
    scene: machiningProject(),
    projectName: 'Integrity',
    hardwareLibrary: {},
    materialLibrary: {},
  })
})
const json = (files: Record<string, Uint8Array>, path: string) => JSON.parse(strFromU8(files[path]))
const put = (files: Record<string, Uint8Array>, path: string, value: unknown) => {
  files[path] = strToU8(JSON.stringify(value))
}
async function repack(files: Record<string, Uint8Array>) {
  const manifest = json(files, 'manifest.json')
  manifest.files = await Promise.all(
    Object.entries(files)
      .filter(([path]) => path !== 'manifest.json')
      .map(async ([path, bytes]) => ({
        path,
        bytes: bytes.length,
        sha256: Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)),
          (b) => b.toString(16).padStart(2, '0'),
        ).join(''),
      })),
  )
  put(files, 'manifest.json', manifest)
  return zipSync(files)
}

describe('production packet integrity', () => {
  it('passes a real exported packet despite unassessed readiness, preserving manual and drilling distinctions', async () => {
    const report = await verifyProductionPacket(original)
    expect(report).toMatchObject({
      status: 'passed',
      checkedFiles: 14,
      checkedOperations: 8,
      findings: [],
    })
    expect(report.limitations.join(' ')).toContain('not a signature')
    expect(report.limitations.join(' ')).toContain('sourceSha256 cannot be independently verified')
  })
  it('captures input before asynchronous checks', async () => {
    const bytes = original.slice()
    const pending = verifyProductionPacket(bytes)
    bytes.fill(0)
    expect((await pending).status).toBe('passed')
  })
  it('finds changed, missing and unlisted files with stable references', async () => {
    const files = unzipSync(original)
    files['lists/machining.csv'] = strToU8('Changed')
    delete files['lists/boards.csv']
    files['extra.txt'] = strToU8('Extra')
    const report = await verifyProductionPacket(zipSync(files))
    expect(report.status).toBe('failed')
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'hash-mismatch',
          locations: ['lists/machining.csv', 'manifest.json'],
        }),
        expect.objectContaining({
          code: 'missing-file',
          locations: ['lists/boards.csv', 'manifest.json'],
        }),
        expect.objectContaining({
          code: 'unlisted-file',
          locations: ['extra.txt', 'manifest.json'],
        }),
      ]),
    )
    files['lists/machining.csv'] = strToU8('Changed again')
    const again = await verifyProductionPacket(zipSync(files))
    expect(again.findings.find((f) => f.code === 'hash-mismatch')?.reference).toBe(
      report.findings.find((f) => f.code === 'hash-mismatch')?.reference,
    )
  })
  it('detects a rehashed schedule/index identity mismatch and points to both outputs', async () => {
    const files = unzipSync(original),
      index = json(files, 'machining/drawing-index.json')
    index.entries[0].sourceComponentId = 'different-owner'
    put(files, 'machining/drawing-index.json', index)
    files['machining/drawing-index.csv'] = strToU8(buildDrawingIndexCsv(index))
    const report = await verifyProductionPacket(await repack(files))
    expect(report.status).toBe('failed')
    expect(report.findings.some((f) => f.code === 'hash-mismatch')).toBe(false)
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'operation-mismatch',
        partId: index.entries[0].partId,
        operationId: index.entries[0].operationId,
        locations: [
          'machining/drawing-index.json',
          'machining/schedule.json#entries/0',
          'lists/machining.csv#record=2',
        ],
      }),
    )
  })
  it('keeps operation finding IDs stable when schedule records move', async () => {
    const files = unzipSync(original),
      index = json(files, 'machining/drawing-index.json'),
      schedule = json(files, 'machining/schedule.json')
    index.entries[0].sourceComponentId = 'wrong-owner'
    put(files, 'machining/drawing-index.json', index)
    files['machining/drawing-index.csv'] = strToU8(buildDrawingIndexCsv(index))
    const before = await verifyProductionPacket(await repack(files))
    schedule.entries.reverse()
    index.entries.reverse()
    index.entries.forEach(
      (entry: { schedule: { entryIndex: number; csvRecord: number } }, i: number) => {
        entry.schedule.entryIndex = i
        entry.schedule.csvRecord = i + 2
      },
    )
    put(files, 'machining/schedule.json', schedule)
    put(files, 'machining/drawing-index.json', index)
    files['lists/machining.csv'] = strToU8(buildMachiningCsv(schedule))
    files['machining/drawing-index.csv'] = strToU8(buildDrawingIndexCsv(index))
    const after = await verifyProductionPacket(await repack(files))
    expect(
      after.findings.filter((f) => f.code === 'operation-mismatch').map((f) => f.reference),
    ).toEqual(
      before.findings.filter((f) => f.code === 'operation-mismatch').map((f) => f.reference),
    )
  })
  it('finds provenance contradictions inside the schedule even when both CSV and index agree', async () => {
    const files = unzipSync(original),
      index = json(files, 'machining/drawing-index.json'),
      schedule = json(files, 'machining/schedule.json')
    schedule.entries[0].sourceComponentId = 'wrong-owner'
    index.entries[0].sourceComponentId = 'wrong-owner'
    put(files, 'machining/schedule.json', schedule)
    put(files, 'machining/drawing-index.json', index)
    files['lists/machining.csv'] = strToU8(buildMachiningCsv(schedule))
    files['machining/drawing-index.csv'] = strToU8(buildDrawingIndexCsv(index))
    expect((await verifyProductionPacket(await repack(files))).findings).toContainEqual(
      expect.objectContaining({
        code: 'operation-provenance',
        operationId: schedule.entries[0].operation.id,
      }),
    )
  })
  it('detects wrong CSV records and omitted index entries even with updated hashes', async () => {
    const files = unzipSync(original),
      index = json(files, 'machining/drawing-index.json')
    index.entries[0].schedule.csvRecord = 99
    index.entries.pop()
    put(files, 'machining/drawing-index.json', index)
    const report = await verifyProductionPacket(await repack(files))
    expect(report.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining([
        'schedule-location',
        'unindexed-operation',
        'operation-inventory',
        'csv-mismatch',
      ]),
    )
  })
  it('checks actual PDF pages and printed operation IDs after a fully rehashed alteration', async () => {
    const files = unzipSync(original),
      index = json(files, 'machining/drawing-index.json')
    const doc = await PDFDocument.load(files['drawings/shop-drawings.pdf'])
    // Replace a part sheet by a blank page without changing the page count.
    const pageIndex = index.parts[0].page - 1
    doc.removePage(pageIndex)
    doc.insertPage(pageIndex)
    files['drawings/shop-drawings.pdf'] = new Uint8Array(await doc.save())
    const report = await verifyProductionPacket(await repack(files))
    expect(report.status).toBe('failed')
    expect(report.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(['printed-part-missing', 'printed-operation-missing']),
    )
    expect(report.findings.some((f) => f.code === 'hash-mismatch')).toBe(false)
  })
  it('rejects CSV instruction changes and accepts logical multiline records and reordered JSON keys', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    if (board.kind !== 'board') throw new Error('Expected board')
    board.operations![0].instruction = 'First line, "quote"\nSecond line'
    const bytes = await buildProductionPacket({
      scene,
      projectName: 'CSV',
      hardwareLibrary: {},
      materialLibrary: {},
    })
    expect((await verifyProductionPacket(bytes)).status).toBe('passed')
    const files = unzipSync(bytes),
      schedule = json(files, 'machining/schedule.json')
    // Keep the CSV definition JSON in its original key order.
    schedule.entries[0].operation = Object.fromEntries(
      Object.entries(schedule.entries[0].operation).reverse(),
    )
    put(files, 'machining/schedule.json', schedule)
    expect((await verifyProductionPacket(await repack(files))).status).toBe('passed')
    files['lists/machining.csv'] = strToU8(
      strFromU8(files['lists/machining.csv']).replace(/Second line/g, 'Different instruction'),
    )
    const report = await verifyProductionPacket(await repack(files))
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        code: 'csv-mismatch',
        locations: ['lists/machining.csv', 'machining/schedule.json'],
      }),
    )
    files['lists/machining.csv'] = strToU8(buildMachiningCsv(schedule))
    expect((await verifyProductionPacket(await repack(files))).status).toBe('passed')
  })
  it('verifies Unicode IDs using the same printable fallback as the drawing renderer', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    board.id = '部件—é'
    board.cuts[0].id = '钻孔😀'
    const bytes = await buildProductionPacket({
      scene,
      projectName: 'Unicode',
      hardwareLibrary: {},
      materialLibrary: {},
    })
    expect((await verifyProductionPacket(bytes)).status).toBe('passed')
  })
  it('separates declared missing drawings from corruption', async () => {
    const files = unzipSync(original),
      index = json(files, 'machining/drawing-index.json')
    index.entries[0].drawing.locations = []
    index.entries[0].status = 'missing-from-drawings'
    index.counts.referenced--
    index.counts.missing++
    const manifest = json(files, 'manifest.json')
    Object.assign(manifest.drawingReferences, index.counts)
    put(files, 'manifest.json', manifest)
    put(files, 'machining/drawing-index.json', index)
    files['machining/drawing-index.csv'] = strToU8(buildDrawingIndexCsv(index))
    const report = await verifyProductionPacket(await repack(files))
    expect(report.status).toBe('unassessed')
    expect(report.findings.map((f) => f.code)).toEqual(['unresolved-reference'])
  })
  it('keeps a valid through-hole and a grouped manual note verifiable', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    if (board.kind !== 'board') throw new Error('Expected board')
    board.operations!.push({ ...board.operations![0], id: 'second-manual' })
    const bytes = await buildProductionPacket({
      scene,
      projectName: 'Grouped manual',
      hardwareLibrary: {},
      materialLibrary: {},
    })
    const schedule = json(unzipSync(bytes), 'machining/schedule.json')
    expect(
      schedule.entries.find((e: { operation: { id: string } }) => e.operation.id === 'row')
        .depthMode,
    ).toBe('through')
    expect((await verifyProductionPacket(bytes)).status).toBe('passed')
  })
  it('does not pass unreadable PDFs, unknown operation categories or unsupported schedule versions', async () => {
    const files = unzipSync(original)
    files['drawings/shop-drawings.pdf'] = strToU8('Not a PDF')
    expect((await verifyProductionPacket(await repack(files))).status).toBe('unassessed')
    const schedule = json(files, 'machining/schedule.json')
    schedule.schemaVersion = 9
    put(files, 'machining/schedule.json', schedule)
    expect(
      (await verifyProductionPacket(await repack(files))).findings.map((f) => f.code),
    ).toContain('unsupported-schema')
    schedule.schemaVersion = 1
    schedule.entries[0].category = 'geometric-drilling'
    put(files, 'machining/schedule.json', schedule)
    expect((await verifyProductionPacket(await repack(files))).status).toBe('failed')
  })
  it('leaves unfamiliar PDF font encodings unassessed instead of reporting missing IDs', async () => {
    const files = unzipSync(original),
      doc = await PDFDocument.load(files['drawings/shop-drawings.pdf'])
    const fonts = doc.getPage(0).node.Resources()!.lookup(PDFName.of('Font'), PDFDict)
    const font = doc.context.lookup(fonts.values()[0], PDFDict)
    font.set(PDFName.of('Encoding'), PDFName.of('MacRomanEncoding'))
    files['drawings/shop-drawings.pdf'] = new Uint8Array(await doc.save())
    const report = await verifyProductionPacket(await repack(files))
    expect(report.status).toBe('unassessed')
    expect(report.findings.map((f) => f.code)).toEqual(['pdf-unassessed'])
  })
  it('bounds ZIP entry count and expanded file size before allocation', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 513 }, (_, i) => [`file-${i}`, new Uint8Array()]),
    )
    expect((await verifyProductionPacket(zipSync(files))).status).toBe('unassessed')
    const bytes = zipSync({ 'huge.txt': strToU8('small') })
    const view = new DataView(bytes.buffer)
    for (let i = 0; i < bytes.length - 4; i++)
      if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, MAX_PACKET_BYTES + 1, true)
    expect((await verifyProductionPacket(bytes)).findings.map((f) => f.code)).toContain(
      'resource-limit',
    )
  })
  it('reports malformed input, unsupported schemas and oversized inputs without passing', async () => {
    expect((await verifyProductionPacket(new Uint8Array([1, 2, 3]))).status).toBe('failed')
    expect((await verifyProductionPacket(zipSync({}))).status).toBe('failed')
    expect((await verifyProductionPacket(new Uint8Array(MAX_PACKET_BYTES + 1))).status).toBe(
      'unassessed',
    )
    const files = unzipSync(original),
      manifest = json(files, 'manifest.json')
    manifest.schemaVersion = 99
    put(files, 'manifest.json', manifest)
    expect((await verifyProductionPacket(zipSync(files))).status).toBe('unassessed')
    manifest.schemaVersion = 1
    manifest.files[0].bytes = -1
    put(files, 'manifest.json', manifest)
    expect((await verifyProductionPacket(zipSync(files))).findings.map((f) => f.code)).toContain(
      'invalid-manifest',
    )
    put(files, 'machining/schedule.json', { schemaVersion: 1, entries: [null] })
    expect(
      (await verifyProductionPacket(await repack(files))).findings.map((f) => f.code),
    ).toContain('invalid-machining-data')
  })
  it('rejects unsafe and duplicate ZIP paths before extraction', async () => {
    const unsafe = zipSync({ '../outside': strToU8('bad') })
    expect((await verifyProductionPacket(unsafe)).findings.map((f) => f.code)).toContain(
      'unsafe-path',
    )
    const bytes = zipSync({ 'one.txt': strToU8('1'), 'two.txt': strToU8('2') })
    // Rename both local and central entries to create a duplicate path.
    const text = new TextDecoder('latin1').decode(bytes)
    for (const match of text.matchAll(/two\.txt/g)) bytes.set(strToU8('one.txt'), match.index)
    expect((await verifyProductionPacket(bytes)).findings.map((f) => f.code)).toContain(
      'duplicate-file',
    )
  })
  it('catches review-summary divergence with valid file hashes', async () => {
    const files = unzipSync(original),
      review = json(files, 'readiness/review.json')
    review.status = 'no-reported-findings'
    put(files, 'readiness/review.json', review)
    expect((await verifyProductionPacket(await repack(files))).findings).toContainEqual(
      expect.objectContaining({
        code: 'summary-mismatch',
        locations: ['readiness/review.json', 'manifest.json#reviewSummary'],
      }),
    )
  })
})
