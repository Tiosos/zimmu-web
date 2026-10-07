import { strFromU8, unzipSync } from 'fflate'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib'
import { buildDrawingIndexCsv, type DrawingIndex } from './buildDrawingIndex'
import { buildMachiningCsv } from './buildMachiningCsv'
import type { MachiningSchedule } from '../scene/machiningSchedule'

export const MAX_PACKET_BYTES = 64 * 1024 * 1024
const MAX_EXPANDED_BYTES = 128 * 1024 * 1024
const REQUIRED = [
  'machining/drawing-index.json',
  'machining/drawing-index.csv',
  'machining/schedule.json',
  'lists/machining.csv',
  'readiness/review.json',
  'readiness/machining-reconciliation.json',
  'readiness/manufacturing.json',
  'readiness/reconciliation.json',
  'readiness/report.pdf',
  'drawings/shop-drawings.pdf',
  'lists/boards.csv',
  'lists/dowels.csv',
  'lists/hardware.csv',
]
export interface PacketIntegrityFinding {
  reference: string
  severity: 'error' | 'unassessed'
  code: string
  message: string
  partId: string | null
  operationId: string | null
  locations: string[]
  expected?: unknown
  actual?: unknown
}
export interface PacketIntegrityReport {
  schemaVersion: 1
  status: 'passed' | 'failed' | 'unassessed'
  checkedFiles: number
  checkedOperations: number
  findings: PacketIntegrityFinding[]
  scope: string
  limitations: string[]
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object')
  return value as Record<string, unknown>
}
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Expected array')
  return value
}
const string = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Expected string')
  return value
}
const integer = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error('Expected nonnegative integer')
  return value as number
}
const canonical = (value: unknown, depth = 0): string => {
  if (depth > 64) throw new Error('JSON nesting limit exceeded')
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, depth + 1)).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = record(value)
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k], depth + 1)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}
const safePath = (path: string) =>
  path.length > 0 &&
  !path.includes('\\') &&
  !Array.from(path).some((c) => c.charCodeAt(0) < 32) &&
  !path
    .split('/')
    .some((p) => ['', '.', '..', '__proto__', 'constructor', 'prototype'].includes(p)) &&
  !/^[a-z]:/i.test(path)

// Logical CSV records: a quoted newline does not advance a spreadsheet record number.
function csv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [],
    cell = '',
    quoted = false,
    endedQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
          endedQuote = true
        }
      } else cell += c
    } else if (c === '"') {
      if (cell || endedQuote) throw new Error('Invalid CSV quote')
      quoted = true
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell)
      cell = ''
      endedQuote = false
      if (c !== ',') {
        rows.push(row)
        row = []
        if (c === '\r' && text[i + 1] === '\n') i++
      }
    } else {
      if (endedQuote) throw new Error('Unexpected text after CSV quote')
      cell += c
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  if (cell || row.length || endedQuote) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}
function csvEquivalent(actual: string, expected: string): boolean {
  const a = csv(actual),
    b = csv(expected)
  const jsonColumns = b[0].flatMap((title, i) =>
    /^(Definition |Annotations$)/.test(title) ? [i] : [],
  )
  for (const rows of [a, b])
    for (const row of rows.slice(1))
      for (const col of jsonColumns) {
        row[col] = canonical(JSON.parse(row[col]))
      }
  return canonical(a) === canonical(b)
}

// This reads the hex Tj strings emitted by our PDF renderer, not arbitrary PDF text layouts.
async function pdfText(
  bytes: Uint8Array,
): Promise<{ pages: string[]; safeId: (id: string) => string }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  if (doc.getPageCount() > 4096) throw new Error('PDF page limit exceeded')
  const supported = new Set((await doc.embedFont(StandardFonts.Helvetica)).getCharacterSet())
  const safeId = (id: string) =>
    Array.from(id.normalize('NFC'))
      .map((c) =>
        c === '⌀'
          ? 'DIA '
          : supported.has(c.codePointAt(0)!)
            ? c
            : `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`,
      )
      .join('')
  const pages: string[] = []
  let total = 0
  for (const page of doc.getPages()) {
    const fonts = page.node.Resources()?.lookup(PDFName.of('Font'))
    if (fonts && !(fonts instanceof PDFDict)) throw new Error('Unsupported PDF fonts')
    if (fonts instanceof PDFDict)
      for (const value of fonts.values()) {
        const font = doc.context.lookup(value)
        if (
          !(font instanceof PDFDict) ||
          font.get(PDFName.of('Subtype'))?.toString() !== '/Type1' ||
          !['/Helvetica', '/Helvetica-Bold'].includes(
            font.get(PDFName.of('BaseFont'))?.toString() ?? '',
          ) ||
          font.get(PDFName.of('Encoding'))?.toString() !== '/WinAnsiEncoding'
        )
          throw new Error('Unsupported PDF font encoding')
      }
    const content = page.node.get(PDFName.of('Contents'))
    const refs = content instanceof PDFArray ? content.asArray() : content ? [content] : []
    let text = ''
    for (const ref of refs) {
      const stream = doc.context.lookup(ref)
      if (!(stream instanceof PDFRawStream)) throw new Error('Unsupported PDF content stream')
      const filter = stream.dict.get(PDFName.of('Filter'))
      let bytes = new Uint8Array(stream.contents)
      if (filter?.toString() === '/FlateDecode') {
        const reader = new Blob([bytes])
          .stream()
          .pipeThrough(new DecompressionStream('deflate'))
          .getReader()
        const chunks: Uint8Array[] = []
        let size = 0
        try {
          while (true) {
            const next = await reader.read()
            if (next.done) break
            size += next.value.length
            if (size > 4 * 1024 * 1024 || total + size > 32 * 1024 * 1024)
              throw new Error('PDF text limit exceeded')
            chunks.push(next.value)
          }
        } finally {
          await reader.cancel()
        }
        bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.length
        }
      } else if (filter) throw new Error('Unsupported PDF stream encoding')
      total += bytes.length
      if (total > 32 * 1024 * 1024) throw new Error('PDF text limit exceeded')
      const commands = strFromU8(bytes)
      // Other text operators would make a negative lookup inconclusive.
      if (/\bTJ\b|\([^]*?\)\s*Tj/.test(commands)) throw new Error('Unsupported PDF text encoding')
      for (const match of commands.matchAll(/<([0-9a-f]+)>\s*Tj/gi)) {
        const encoded = Uint8Array.from(match[1].match(/../g) ?? [], (h) => parseInt(h, 16))
        text += new TextDecoder('windows-1252').decode(encoded) + '\n'
      }
    }
    pages.push(text)
  }
  return { pages, safeId }
}

export async function verifyProductionPacket(input: Uint8Array): Promise<PacketIntegrityReport> {
  return (await inspectProductionPacket(input)).integrity
}

// Only successfully verified, bounded contents are exposed to downstream comparison.
export async function inspectProductionPacket(input: Uint8Array): Promise<{
  integrity: PacketIntegrityReport
  files: Record<string, Uint8Array> | null
}> {
  let files: Record<string, Uint8Array> = {}
  const report: PacketIntegrityReport = {
    schemaVersion: 1,
    status: 'passed',
    checkedFiles: 0,
    checkedOperations: 0,
    findings: [],
    scope:
      'ZIP inventory, SHA-256 hashes, packet summary consistency, machining CSV/JSON and drawing-index references to printed PDF IDs.',
    limitations: [
      'An enclosed manifest is not a signature or proof of authorship; coordinated edits can remain internally consistent.',
      'The source snapshot is not included, so sourceSha256 cannot be independently verified.',
      'Integrity does not establish fabrication readiness, machining geometry, machine compatibility or production approval.',
      'PDF checks locate printed IDs on indexed pages, not annotation coordinates, view placement or annotation ordinals.',
    ],
  }
  const add = (
    code: string,
    message: string,
    locations: string[],
    severity: PacketIntegrityFinding['severity'] = 'error',
    partId: string | null = null,
    operationId: string | null = null,
  ) => {
    const reference = `PI:${JSON.stringify([code, locations[0], partId, operationId])}`
    const existing = report.findings.find((f) => f.reference === reference)
    if (existing) {
      existing.locations = [...new Set([...existing.locations, ...locations])]
      return existing
    }
    const finding: PacketIntegrityFinding = {
      reference,
      severity,
      code,
      message,
      locations,
      partId,
      operationId,
    }
    report.findings.push(finding)
    return finding
  }
  const finish = () => {
    report.findings.sort((a, b) => a.reference.localeCompare(b.reference))
    report.status = report.findings.some((f) => f.severity === 'error')
      ? 'failed'
      : report.findings.length
        ? 'unassessed'
        : 'passed'
    return { integrity: report, files: report.status === 'passed' ? files : null }
  }
  if (input.length > MAX_PACKET_BYTES) {
    add('resource-limit', 'Packet exceeds the 64 MiB upload limit.', ['archive'], 'unassessed')
    return finish()
  }
  const captured = input.slice()
  const names = new Set<string>()
  const archiveSizes = new Map<string, number>()
  let expanded = 0
  let archiveEntries = 0
  try {
    files = unzipSync(captured, {
      filter: (info) => {
        if (
          ++archiveEntries > 512 ||
          expanded + info.originalSize > MAX_EXPANDED_BYTES ||
          info.originalSize > MAX_PACKET_BYTES
        ) {
          throw new Error('resource-limit')
        }
        expanded += info.originalSize
        if (!safePath(info.name)) {
          add('unsafe-path', 'Archive contains an unsafe file path.', [info.name])
          return false
        }
        if (names.has(info.name)) {
          add('duplicate-file', 'Archive contains a duplicate file path.', [info.name])
          return false
        }
        names.add(info.name)
        archiveSizes.set(info.name, info.originalSize)
        return true
      },
    })
  } catch (error) {
    const limited = error instanceof Error && error.message === 'resource-limit'
    add(
      limited ? 'resource-limit' : 'invalid-archive',
      limited ? 'Archive exceeds extraction limits.' : 'ZIP could not be read.',
      ['archive'],
      limited ? 'unassessed' : 'error',
    )
    return finish()
  }
  for (const [path, bytes] of Object.entries(files)) {
    if (bytes.length !== archiveSizes.get(path))
      add('archive-size-mismatch', 'ZIP file length differs from its directory entry.', [
        path,
        'archive',
      ])
  }
  const read = (path: string) => {
    if (!files[path]) throw new Error(`Missing ${path}`)
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files[path]))
    canonical(value) // Bound nesting before further traversal.
    return record(value)
  }
  let manifest: Record<string, unknown>
  try {
    manifest = read('manifest.json')
  } catch {
    add('invalid-manifest', 'Manifest is missing or is not a JSON object.', ['manifest.json'])
    return finish()
  }
  if (manifest.schemaVersion !== 1) {
    add(
      'unsupported-schema',
      'Manifest schema version is not supported.',
      ['manifest.json'],
      'unassessed',
    )
    return finish()
  }
  try {
    string(manifest.projectName)
    if (!Number.isFinite(Date.parse(string(manifest.capturedAt))))
      throw new Error('Invalid capture date')
    if (!/^[a-f0-9]{64}$/i.test(string(manifest.sourceSha256)))
      throw new Error('Invalid source digest')
    for (const value of Object.values(record(manifest.counts))) integer(value)
    const declared = new Set<string>()
    for (const value of array(manifest.files)) {
      const entry = record(value),
        path = string(entry.path),
        size = integer(entry.bytes),
        hash = string(entry.sha256)
      if (!safePath(path) || path === 'manifest.json' || !/^[a-f0-9]{64}$/i.test(hash))
        throw new Error('Invalid manifest file entry')
      if (declared.has(path))
        add('duplicate-declaration', 'Manifest declares this file more than once.', [
          path,
          'manifest.json',
        ])
      declared.add(path)
      const bytes = files[path]
      if (!bytes) {
        add('missing-file', 'A declared file is missing.', [path, 'manifest.json'])
        continue
      }
      report.checkedFiles++
      if (bytes.length !== size)
        add('size-mismatch', `Expected ${size} bytes; found ${bytes.length}.`, [
          path,
          'manifest.json',
        ])
      const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
      const actual = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')
      if (actual !== hash.toLowerCase())
        add('hash-mismatch', 'File SHA-256 differs from the manifest.', [path, 'manifest.json'])
    }
    for (const path of Object.keys(files))
      if (path !== 'manifest.json' && !declared.has(path))
        add('unlisted-file', 'File is not declared in the manifest.', [path, 'manifest.json'])
    for (const path of REQUIRED) {
      if (!files[path])
        add('missing-file', 'Required packet file is missing.', [path, 'manifest.json'])
      if (!declared.has(path))
        add('missing-declaration', 'Required file has no manifest declaration.', [
          path,
          'manifest.json',
        ])
    }
  } catch {
    add('invalid-manifest', 'Manifest file declarations are invalid or could not be checked.', [
      'manifest.json',
    ])
  }
  const compare = (
    actual: unknown,
    expected: unknown,
    code: string,
    locations: string[],
    partId: string | null = null,
    operationId: string | null = null,
  ) => {
    if (canonical(actual) !== canonical(expected)) {
      const finding = add(code, 'Packet outputs disagree.', locations, 'error', partId, operationId)
      finding.expected = expected
      finding.actual = actual
    }
  }
  for (const [path, field, keys] of [
    ['readiness/review.json', 'reviewSummary', null],
    [
      'readiness/machining-reconciliation.json',
      'machiningReconciliation',
      ['status', 'compared', 'totalFindings', 'unassessed'],
    ],
    [
      'readiness/reconciliation.json',
      'reconciliation',
      ['status', 'compared', 'totalFindings', 'truncated', 'unassessed'],
    ],
    ['readiness/manufacturing.json', 'manufacturing', ['checkedParts', 'unassessed']],
  ] as const) {
    try {
      const value = read(path)
      if (path !== 'readiness/reconciliation.json' && value.schemaVersion !== 1) {
        add('unsupported-schema', 'Summary schema version is not supported.', [path], 'unassessed')
        continue
      }
      if (path === 'readiness/review.json') {
        const items = array(value.items).map(record)
        const counts = {
          needsCorrection: items.filter((item) => item.category === 'needs-correction').length,
          advisory: items.filter((item) => item.category === 'advisory').length,
          unassessed: items.filter((item) => item.category === 'unassessed').length,
        }
        compare(value.counts, counts, 'review-counts', [path + '#counts'])
        const status = counts.needsCorrection
          ? 'needs-correction'
          : counts.unassessed
            ? 'review-required'
            : counts.advisory
              ? 'advisory-review'
              : 'no-reported-findings'
        compare(value.status, status, 'review-status', [path + '#status'])
        if (
          items.some(
            (item) =>
              !['needs-correction', 'advisory', 'unassessed'].includes(string(item.category)),
          )
        )
          throw new Error('Unknown review category')
      }
      if (path === 'readiness/manufacturing.json') {
        compare(
          array(value.findings).length,
          record(manifest.counts).manufacturingFindings,
          'manufacturing-finding-count',
          [path, 'manifest.json#counts.manufacturingFindings'],
        )
        compare(value.checkedParts, record(manifest.counts).parts, 'summary-mismatch', [
          path,
          'manifest.json#counts.parts',
        ])
      }
      compare(
        keys ? Object.fromEntries(keys.map((k) => [k, value[k]])) : value,
        manifest[field],
        'summary-mismatch',
        [path, `manifest.json#${field}`],
      )
    } catch {
      add('invalid-json', 'Required summary could not be read.', [path])
    }
  }
  try {
    const schedule = read('machining/schedule.json'),
      index = read('machining/drawing-index.json')
    if (schedule.schemaVersion !== 1 || index.schemaVersion !== 1) {
      add(
        'unsupported-schema',
        'Machining or drawing-index schema is not supported.',
        ['machining/schedule.json', 'machining/drawing-index.json'],
        'unassessed',
      )
      return finish()
    }
    const entries = array(schedule.entries).map(record),
      references = array(index.entries).map(record),
      parts = array(index.parts).map(record)
    const annotationCount = references.reduce(
      (total, ref) => total + array(record(ref.drawing).locations).length,
      0,
    )
    if (
      annotationCount > 65536 ||
      references.some((ref) => array(record(ref.drawing).locations).length > 64)
    ) {
      add(
        'resource-limit',
        'Packet exceeds annotation reference limits.',
        ['machining/drawing-index.json'],
        'unassessed',
      )
      return finish()
    }
    if (entries.length > 4096 || references.length > 4096 || parts.length > 4096) {
      add(
        'resource-limit',
        'Packet exceeds the 4096 operation/part reference limit.',
        ['machining/schedule.json', 'machining/drawing-index.json'],
        'unassessed',
      )
      return finish()
    }
    // Validate the structural fields consumed by the shared CSV serializers. Geometry may
    // legitimately contain explicit nonfinite values; readiness owns geometry validation.
    for (const [position, entry] of entries.entries()) {
      const part = record(entry.part),
        op = record(entry.operation)
      string(part.id)
      string(part.label)
      string(part.material)
      const provenance = record(part.provenance)
      for (const field of ['parentId', 'cabinetId', 'cabinetLabel', 'role'])
        if (provenance[field] !== null) string(provenance[field])
      record(part.dimensions)
      if (!['board', 'cylinder'].includes(string(part.kind))) throw new Error('Unknown part kind')
      string(op.id)
      string(op.label)
      string(op.kind)
      const category =
        op.kind === 'manual-machining'
          ? 'manual-instruction'
          : ['hole-array', 'bore-axial', 'bore-transverse'].includes(string(op.kind))
            ? 'geometric-drilling'
            : ['box', 'mitre', 'end', 'notch'].includes(string(op.kind))
              ? 'geometric-cut'
              : null
      if (!category || category !== entry.category)
        throw new Error('Operation kind/category mismatch')
      if (
        category === 'geometric-drilling' &&
        !['blind', 'through', 'unassessed'].includes(string(entry.depthMode))
      )
        throw new Error('Invalid depth mode')
      for (const value of [entry.sourceComponentId, entry.sourceJointId])
        if (value !== null) string(value)
      compare(
        [entry.sourceComponentId, entry.sourceJointId],
        [op.sourceComponentId ?? null, op.sourceJointId ?? null],
        'operation-provenance',
        ['machining/schedule.json', `lists/machining.csv#record=${position + 2}`],
        string(part.id),
        string(op.id),
      )

      if (
        !['geometric-cut', 'geometric-drilling', 'manual-instruction'].includes(
          string(entry.category),
        )
      )
        throw new Error('Unknown machining category')
    }
    if (manifest.partInventory && !files['machining/parts.json'])
      add('missing-file', 'Declared part inventory is missing.', [
        'machining/parts.json',
        'manifest.json#partInventory',
      ])
    if (files['machining/parts.json']) {
      const inventory = read('machining/parts.json')
      if (inventory.schemaVersion !== 1) {
        add(
          'unsupported-schema',
          'Part inventory schema is not supported.',
          ['machining/parts.json'],
          'unassessed',
        )
      } else {
        const inventoryParts = array(inventory.parts).map(record)
        compare(
          manifest.partInventory,
          { schemaVersion: 1, jsonPath: 'machining/parts.json', parts: inventoryParts.length },
          'summary-mismatch',
          ['machining/parts.json', 'manifest.json#partInventory'],
        )

        if (inventoryParts.length > 4096) {
          add(
            'resource-limit',
            'Part inventory exceeds 4096 parts.',
            ['machining/parts.json'],
            'unassessed',
          )
          return finish()
        }
        compare(inventoryParts.length, record(manifest.counts).parts, 'part-inventory', [
          'machining/parts.json',
          'manifest.json#counts.parts',
        ])
        const byId = new Map<string, Record<string, unknown>>()
        for (const part of inventoryParts) {
          const id = string(part.id)
          string(part.label)
          string(part.material)
          const dimensions = record(part.dimensions)
          const numeric = (v: unknown) =>
            typeof v === 'number' ||
            (typeof v === 'string' && ['NaN', 'Infinity', '-Infinity'].includes(v))
          for (const key of part.kind === 'board'
            ? ['length', 'width', 'thickness']
            : ['length', 'diameter'])
            if (!numeric(dimensions[key])) throw new Error('Invalid inventory dimension')

          const provenance = record(part.provenance)
          for (const key of ['parentId', 'cabinetId', 'cabinetLabel', 'role'])
            if (provenance[key] !== null) string(provenance[key])
          if (typeof provenance.driven !== 'boolean') throw new Error('Invalid part provenance')
          const stock = record(part.stock)
          if (
            typeof stock.resolved !== 'boolean' ||
            typeof stock.hasGrain !== 'boolean' ||
            (stock.thickness !== null && !numeric(stock.thickness))
          )
            throw new Error('Invalid part stock')
          if (stock.use !== null && stock.use !== 'edge') throw new Error('Invalid stock use')
          if (stock.sheet !== null) {
            const sheet = record(stock.sheet)
            if (!numeric(sheet.length) || !numeric(sheet.width))
              throw new Error('Invalid stock sheet')
          }

          if (!['board', 'cylinder'].includes(string(part.kind)))
            throw new Error('Unknown inventory part kind')
          if (part.kind === 'board') {
            for (const dims of [record(part.finished), record(part.cut)])
              for (const key of ['length', 'width', 'thickness'])
                if (!numeric(dims[key])) throw new Error('Invalid board dimensions')
            const edges = record(part.edges)
            for (const key of ['x0', 'x1', 'y0', 'y1']) if (edges[key] !== null) string(edges[key])
            if (!['length', 'width', 'free'].includes(string(part.grain)))
              throw new Error('Invalid grain')
            array(part.requestedEdgeStock)
          }
          if (byId.has(id))
            add(
              'ambiguous-part-inventory',
              'Part inventory contains duplicate IDs.',
              ['machining/parts.json'],
              'unassessed',
              id,
            )
          byId.set(id, part)
        }
        compare(
          inventoryParts.map((p) => [p.id, p.label]).sort(),
          parts.map((p) => [p.partId, p.label]).sort(),
          'part-inventory',
          ['machining/parts.json', 'machining/drawing-index.json'],
        )
        for (const entry of entries) {
          const part = record(entry.part),
            inventoryPart = byId.get(string(part.id))
          compare(
            inventoryPart && [
              inventoryPart.id,
              inventoryPart.label,
              inventoryPart.kind,
              inventoryPart.material,
              inventoryPart.dimensions,
              inventoryPart.provenance,
            ],
            [part.id, part.label, part.kind, part.material, part.dimensions, part.provenance],
            'inventory-schedule-mismatch',
            ['machining/parts.json', 'machining/schedule.json'],
            string(part.id),
            string(record(entry.operation).id),
          )
        }
      }
    }
    const counts = {
      parts: integer(record(schedule.counts).parts),
      entries: entries.length,
      geometricDrilling: entries.filter((e) => e.category === 'geometric-drilling').length,
      geometricCuts: entries.filter((e) => e.category === 'geometric-cut').length,
      manualInstructions: entries.filter((e) => e.category === 'manual-instruction').length,
    }
    compare(schedule.counts, counts, 'schedule-counts', ['machining/schedule.json#counts'])
    compare(
      manifest.machining,
      {
        ...counts,
        units: schedule.units,
        angleUnits: schedule.angleUnits,
        coordinateFrame: schedule.coordinateFrame,
        unassessed: schedule.unassessed,
      },
      'summary-mismatch',
      ['machining/schedule.json', 'manifest.json#machining'],
    )
    compare(
      [schedule.units, schedule.angleUnits, schedule.coordinateFrame],
      ['mm', 'degrees', 'part-local'],
      'schedule-units',
      ['machining/schedule.json'],
    )
    compare(record(manifest.counts).parts, counts.parts, 'summary-mismatch', [
      'machining/schedule.json#counts.parts',
      'manifest.json#counts.parts',
    ])
    const indexCounts = {
      partSheets: parts.length,
      operations: references.length,
      referenced: references.filter((e) => e.status === 'referenced').length,
      missing: references.filter((e) => e.status === 'missing-from-drawings').length,
      ambiguous: references.filter((e) => e.status === 'ambiguous').length,
    }
    compare(index.counts, indexCounts, 'index-counts', ['machining/drawing-index.json#counts'])
    compare(parts.length, counts.parts, 'part-inventory', [
      'machining/drawing-index.json#parts',
      'machining/schedule.json#counts.parts',
    ])
    for (const part of parts) {
      string(part.partId)
      string(part.label)
      if (integer(part.page) < 1) throw new Error('Invalid part page')
    }

    compare(
      manifest.drawingReferences,
      {
        schemaVersion: 1,
        ...indexCounts,
        jsonPath: 'machining/drawing-index.json',
        csvPath: 'machining/drawing-index.csv',
        scope: index.scope,
      },
      'summary-mismatch',
      ['machining/drawing-index.json', 'manifest.json#drawingReferences'],
    )
    compare(references.length, entries.length, 'operation-inventory', [
      'machining/drawing-index.json',
      'machining/schedule.json',
    ])
    const occupied = new Set<number>()
    for (const ref of references) {
      const partId = string(ref.partId),
        operationId = string(ref.operationId),
        link = record(ref.schedule),
        drawing = record(ref.drawing)
      const position = integer(link.entryIndex)
      const locations = [
        'machining/drawing-index.json',
        `machining/schedule.json#entries/${position}`,
        `lists/machining.csv#record=${position + 2}`,
      ]
      if (occupied.has(position))
        add(
          'duplicate-reference',
          'Schedule entry has more than one index entry.',
          locations,
          'error',
          partId,
          operationId,
        )
      occupied.add(position)
      const entry = entries[position]
      if (!entry) {
        add(
          'missing-operation',
          'Index points outside the schedule.',
          locations,
          'error',
          partId,
          operationId,
        )
        continue
      }
      const part = record(entry.part),
        op = record(entry.operation)
      compare(
        [
          ref.partId,
          ref.partLabel,
          ref.operationId,
          ref.operationLabel,
          ref.category,
          ref.sourceComponentId,
          ref.sourceJointId,
          ref.provenance,
        ],
        [
          part.id,
          part.label,
          op.id,
          op.label,
          entry.category,
          entry.sourceComponentId,
          entry.sourceJointId,
          part.provenance,
        ],
        'operation-mismatch',
        locations,
        partId,
        operationId,
      )
      compare(
        link,
        {
          jsonPath: 'machining/schedule.json',
          entryIndex: position,
          csvPath: 'lists/machining.csv',
          csvRecord: position + 2,
        },
        'schedule-location',
        locations,
        partId,
        operationId,
      )
      compare(
        drawing.path,
        'drawings/shop-drawings.pdf',
        'drawing-location',
        ['machining/drawing-index.json', 'drawings/shop-drawings.pdf'],
        partId,
        operationId,
      )
      const pages = parts.filter((p) => p.partId === partId).map((p) => integer(p.page))
      compare(
        drawing.partPages,
        pages,
        'part-pages',
        ['machining/drawing-index.json', 'drawings/shop-drawings.pdf'],
        partId,
        operationId,
      )
      const annotations = array(drawing.locations).map(record)
      const duplicate =
        entries.filter(
          (e) => record(e.part).id === partId && record(e.operation).id === operationId,
        ).length > 1 ||
        pages.length > 1 ||
        annotations.some((a, i) =>
          annotations
            .slice(0, i)
            .some((b) => b.page === a.page && b.view === a.view && b.annotation === a.annotation),
        )
      const status = duplicate
        ? 'ambiguous'
        : annotations.length
          ? 'referenced'
          : 'missing-from-drawings'
      compare(
        ref.status,
        status,
        'reference-status',
        ['machining/drawing-index.json'],
        partId,
        operationId,
      )
      if (status !== 'referenced')
        add(
          'unresolved-reference',
          'Drawing reference is missing or ambiguous.',
          ['machining/drawing-index.json', 'drawings/shop-drawings.pdf'],
          'unassessed',
          partId,
          operationId,
        )
      for (const a of annotations) {
        integer(a.index)
        if (
          !pages.includes(integer(a.page)) ||
          !['cut-label', 'note-label', 'manual-instruction', 'drilling-callout'].includes(
            string(a.annotation),
          ) ||
          (['manual-instruction', 'drilling-callout'].includes(string(a.annotation))
            ? a.view !== null
            : typeof a.view !== 'string')
        ) {
          add(
            'drawing-location',
            'Annotation location is invalid.',
            ['machining/drawing-index.json', 'drawings/shop-drawings.pdf'],
            'error',
            partId,
            operationId,
          )
        }
        const allowed =
          entry.category === 'manual-instruction'
            ? ['manual-instruction']
            : entry.category === 'geometric-drilling'
              ? ['cut-label', 'note-label', 'drilling-callout']
              : ['cut-label', 'note-label']
        if (!allowed.includes(string(a.annotation)))
          add(
            'annotation-category',
            'Annotation kind disagrees with the operation category.',
            ['machining/drawing-index.json', 'machining/schedule.json'],
            'error',
            partId,
            operationId,
          )
      }
      report.checkedOperations++
    }
    for (let i = 0; i < entries.length; i++)
      if (!occupied.has(i)) {
        add(
          'unindexed-operation',
          'Schedule operation has no drawing-index entry.',
          ['machining/drawing-index.json', `machining/schedule.json#entries/${i}`],
          'error',
          string(record(entries[i].part).id),
          string(record(entries[i].operation).id),
        )
      }
    for (const [path, expected] of [
      ['lists/machining.csv', buildMachiningCsv(schedule as unknown as MachiningSchedule)],
      ['machining/drawing-index.csv', buildDrawingIndexCsv(index as unknown as DrawingIndex)],
    ]) {
      try {
        if (!csvEquivalent(new TextDecoder('utf-8', { fatal: true }).decode(files[path]), expected))
          add('csv-mismatch', 'CSV records differ from their JSON source.', [
            path,
            path === 'lists/machining.csv'
              ? 'machining/schedule.json'
              : 'machining/drawing-index.json',
          ])
      } catch {
        add('invalid-csv', 'CSV could not be compared to its JSON source.', [path])
      }
    }
    if (files['drawings/shop-drawings.pdf']) {
      try {
        const pdf = await pdfText(files['drawings/shop-drawings.pdf'])
        compare(pdf.pages.length, record(manifest.counts).drawingSheets, 'pdf-page-count', [
          'drawings/shop-drawings.pdf',
          'manifest.json#counts.drawingSheets',
        ])
        for (const part of parts) {
          const page = integer(part.page),
            partId = string(part.partId)
          if (!pdf.pages[page - 1]?.split('\n').includes(`Part ID: ${pdf.safeId(partId)}`))
            add(
              'printed-part-missing',
              'Indexed part ID is not printed on this PDF page.',
              ['machining/drawing-index.json', `drawings/shop-drawings.pdf#page=${page}`],
              'error',
              partId,
            )
        }
        for (const ref of references.filter((ref) => ref.status === 'referenced'))
          for (const annotation of array(record(ref.drawing).locations).map(record)) {
            const page = integer(annotation.page),
              partId = string(ref.partId),
              operationId = string(ref.operationId)
            const token = pdf.safeId(operationId),
              text = pdf.pages[page - 1] ?? ''
            const group =
              annotation.annotation === 'manual-instruction'
                ? references
                    .filter(
                      (other) =>
                        other.partId === partId &&
                        array(record(other.drawing).locations)
                          .map(record)
                          .some(
                            (a) =>
                              a.annotation === 'manual-instruction' &&
                              a.page === page &&
                              a.index === annotation.index,
                          ),
                    )
                    .map((other) => pdf.safeId(string(other.operationId)))
                    .join(', ')
                : token
            if (!text.includes(`[${group}]`))
              add(
                'printed-operation-missing',
                'Indexed operation ID is not printed on this PDF page.',
                ['machining/drawing-index.json', `drawings/shop-drawings.pdf#page=${page}`],
                'error',
                partId,
                operationId,
              )
          }
      } catch {
        add(
          'pdf-unassessed',
          'Drawing PDF is unreadable, exceeds limits or uses unsupported text encoding.',
          ['drawings/shop-drawings.pdf'],
          'unassessed',
        )
      }
    }
  } catch {
    add(
      'invalid-machining-data',
      'Machining schedule or drawing-index structure is invalid; reference checks could not finish.',
      ['machining/schedule.json', 'machining/drawing-index.json'],
    )
  }
  return finish()
}
