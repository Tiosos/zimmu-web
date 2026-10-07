import type { DrawingIndex } from './buildDrawingIndex'
import type { MachiningEntry, MachiningSchedule } from '../scene/machiningSchedule'
import type { PacketPart } from './packetPartInventory'
import {
  inspectProductionPacket,
  MAX_PACKET_BYTES,
  type PacketIntegrityReport,
} from './verifyProductionPacket'

export interface RevisionLocation {
  locations: string[]
  provenance: unknown
  definition: unknown
}
export interface RevisionChange {
  reference: string
  entity: 'part' | 'operation'
  partId: string
  operationId: string | null
  label: string
  change: 'added' | 'removed' | 'modified'
  classification: 'manufacturing' | 'metadata'
  fields: {
    field: string
    classification: 'manufacturing' | 'metadata'
    before: unknown
    after: unknown
  }[]
  before: RevisionLocation | null
  after: RevisionLocation | null
}
export interface PacketRevisionReport {
  schemaVersion: 1
  status: 'compared' | 'partial' | 'blocked'
  before: {
    sha256: string | null
    projectName: string | null
    capturedAt: string | null
    integrity: PacketIntegrityReport
  }
  after: {
    sha256: string | null
    projectName: string | null
    capturedAt: string | null
    integrity: PacketIntegrityReport
  }
  counts: {
    added: number
    removed: number
    modified: number
    manufacturing: number
    metadata: number
  }
  changes: RevisionChange[]
  packetMetadataChanges: string[]
  otherChangedFiles: string[]
  limitations: string[]
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
const hash = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
type PartDescriptor = Partial<PacketPart> & { id: string; label: string }
interface Snapshot {
  parts: Map<string, PartDescriptor>
  operations: Map<string, MachiningEntry>
  index: DrawingIndex
  fullInventory: boolean
  manifest: {
    projectName: string
    capturedAt: string
    sourceSha256: string
    files: { path: string; sha256: string }[]
  }
}
function snapshot(files: Record<string, Uint8Array>): Snapshot {
  const read = <T>(path: string): T => JSON.parse(new TextDecoder().decode(files[path])) as T
  const index = read<DrawingIndex>('machining/drawing-index.json')
  const schedule = read<MachiningSchedule>('machining/schedule.json')
  const fullInventory = Boolean(files['machining/parts.json'])
  const parts = new Map<string, PartDescriptor>()
  if (fullInventory)
    for (const part of read<{ parts: PacketPart[] }>('machining/parts.json').parts)
      parts.set(part.id, part)
  else {
    for (const part of index.parts) parts.set(part.partId, { id: part.partId, label: part.label })
    for (const entry of schedule.entries) parts.set(entry.part.id, entry.part)
  }
  return {
    parts,
    operations: new Map(
      schedule.entries.map((entry) => [JSON.stringify([entry.part.id, entry.operation.id]), entry]),
    ),
    index,
    fullInventory,
    manifest: read('manifest.json'),
  }
}
function partLocation(snapshot: Snapshot, part: PartDescriptor): RevisionLocation {
  return {
    provenance: part.provenance ?? null,
    definition: part,
    locations: [
      snapshot.fullInventory ? 'machining/parts.json' : 'machining/drawing-index.json',
      ...snapshot.index.parts
        .filter((p) => p.partId === part.id)
        .map((p) => `drawings/shop-drawings.pdf#page=${p.page}`),
    ],
  }
}
function operationLocation(snapshot: Snapshot, entry: MachiningEntry): RevisionLocation {
  const ref = snapshot.index.entries.find(
    (e) => e.partId === entry.part.id && e.operationId === entry.operation.id,
  )!
  return {
    definition: entry,
    provenance: {
      part: entry.part.provenance,
      sourceComponentId: entry.sourceComponentId,
      sourceJointId: entry.sourceJointId,
    },
    locations: [
      `${ref.schedule.jsonPath}#entries/${ref.schedule.entryIndex}`,
      `${ref.schedule.csvPath}#record=${ref.schedule.csvRecord}`,
      ...new Set(
        ref.drawing.locations.map((location) => `${ref.drawing.path}#page=${location.page}`),
      ),
    ],
  }
}
function fields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  metadata: string[],
  commonOnly = false,
) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((field) => {
    if (commonOnly && (!(field in before) || !(field in after))) return []
    if (canonical(before[field]) === canonical(after[field])) return []
    return [
      {
        field,
        classification: metadata.includes(field)
          ? ('metadata' as const)
          : ('manufacturing' as const),
        before: before[field] ?? null,
        after: after[field] ?? null,
      },
    ]
  })
}
function operationFields(entry: MachiningEntry): Record<string, unknown> {
  const {
    label,
    sourceComponentId,
    sourceJointId,
    id: _id,
    ...definition
  } = entry.operation as unknown as Record<string, unknown>
  void _id
  return {
    ...definition,
    category: entry.category,
    ...(entry.category === 'geometric-drilling' ? { depthMode: entry.depthMode } : {}),
    label,
    sourceComponentId: sourceComponentId ?? null,
    sourceJointId: sourceJointId ?? null,
  }
}

export async function compareProductionPackets(
  beforeInput: Uint8Array,
  afterInput: Uint8Array,
): Promise<PacketRevisionReport> {
  // Capture both inputs before any await; never compare against a later mutated buffer.
  const beforeBytes = beforeInput.length <= MAX_PACKET_BYTES ? beforeInput.slice() : beforeInput
  const afterBytes = afterInput.length <= MAX_PACKET_BYTES ? afterInput.slice() : afterInput
  const before = await inspectProductionPacket(beforeBytes)
  const after = await inspectProductionPacket(afterBytes)
  const report: PacketRevisionReport = {
    schemaVersion: 1,
    status: 'blocked',
    before: { sha256: null, projectName: null, capturedAt: null, integrity: before.integrity },
    after: { sha256: null, projectName: null, capturedAt: null, integrity: after.integrity },
    counts: { added: 0, removed: 0, modified: 0, manufacturing: 0, metadata: 0 },
    changes: [],
    packetMetadataChanges: [],
    otherChangedFiles: [],
    limitations: [
      'Both packets must pass integrity verification before part/operation changes are compared. Blocked comparisons do not mean there are no changes.',
      'Comparison covers captured part stock, dimensions, edges, provenance and operation definitions, not assembly placement, hardware suitability, readiness approval or machine compatibility.',
      'Other changed files are listed without assuming that their changes are formatting-only. PDF coordinates and annotation layout are not compared.',
      'Enclosed manifests are unsigned; integrity and revision comparison do not authenticate authorship or approve fabrication.',
    ],
  }
  for (const [side, result, bytes] of [
    [report.before, before, beforeBytes],
    [report.after, after, afterBytes],
  ] as const) {
    if (bytes.length <= MAX_PACKET_BYTES) side.sha256 = await hash(bytes)
    if (result.files) {
      const value = snapshot(result.files).manifest
      side.projectName = value.projectName
      side.capturedAt = value.capturedAt
    }
  }
  if (!before.files || !after.files) return report
  const a = snapshot(before.files),
    b = snapshot(after.files)
  const full = a.fullInventory && b.fullInventory
  report.status = full ? 'compared' : 'partial'
  if (!full)
    report.limitations.push(
      'An older packet lacks machining/parts.json. Only shared recorded part fields can be compared; stock/edge coverage and dimensions for parts without operations may be missing.',
    )
  const add = (
    entity: RevisionChange['entity'],
    partId: string,
    operationId: string | null,
    label: string,
    old: RevisionLocation | null,
    next: RevisionLocation | null,
    changes: RevisionChange['fields'],
  ) => {
    report.changes.push({
      reference: `PC:${JSON.stringify([entity, partId, operationId])}`,
      entity,
      partId,
      operationId,
      label,
      change: old ? (next ? 'modified' : 'removed') : 'added',
      classification:
        !old || !next || changes.some((f) => f.classification === 'manufacturing')
          ? 'manufacturing'
          : 'metadata',
      fields: changes,
      before: old,
      after: next,
    })
  }
  for (const id of new Set([...a.parts.keys(), ...b.parts.keys()])) {
    const old = a.parts.get(id),
      next = b.parts.get(id)
    const changed =
      old && next
        ? fields(
            old as Record<string, unknown>,
            next as Record<string, unknown>,
            ['label', 'provenance'],
            !full,
          )
        : []
    if (!old || !next || changed.length)
      add(
        'part',
        id,
        null,
        (next ?? old)!.label,
        old ? partLocation(a, old) : null,
        next ? partLocation(b, next) : null,
        changed,
      )
  }
  for (const id of new Set([...a.operations.keys(), ...b.operations.keys()])) {
    const old = a.operations.get(id),
      next = b.operations.get(id)
    const changed =
      old && next
        ? fields(operationFields(old), operationFields(next), [
            'label',
            'sourceComponentId',
            'sourceJointId',
          ])
        : []
    if (!old || !next || changed.length) {
      const entry = (next ?? old)!
      add(
        'operation',
        entry.part.id,
        entry.operation.id,
        entry.operation.label,
        old ? operationLocation(a, old) : null,
        next ? operationLocation(b, next) : null,
        changed,
      )
    }
  }
  report.changes.sort((x, y) => x.reference.localeCompare(y.reference))
  for (const change of report.changes) {
    report.counts[change.change]++
    report.counts[change.classification]++
  }
  report.packetMetadataChanges = ['projectName', 'capturedAt', 'sourceSha256'].filter(
    (field) =>
      canonical(a.manifest[field as keyof typeof a.manifest]) !==
      canonical(b.manifest[field as keyof typeof b.manifest]),
  )
  const known = new Set([
    'machining/parts.json',
    'machining/schedule.json',
    'lists/machining.csv',
    'machining/drawing-index.json',
    'machining/drawing-index.csv',
  ])
  const aFiles = new Map(a.manifest.files.map((file) => [file.path, file.sha256])),
    bFiles = new Map(b.manifest.files.map((file) => [file.path, file.sha256]))
  report.otherChangedFiles = [...new Set([...aFiles.keys(), ...bFiles.keys()])]
    .filter(
      (path) =>
        !known.has(path) && aFiles.get(path)?.toLowerCase() !== bFiles.get(path)?.toLowerCase(),
    )
    .sort()
  return report
}
