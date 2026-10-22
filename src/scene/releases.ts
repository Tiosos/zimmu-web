import type { ProductionReleaseRecord } from '../ui/productionReleaseGate'

export const MAX_RELEASE_SOURCE_BYTES = 16 * 1024 * 1024
export const MAX_RELEASED_BY_LENGTH = 100
export const MAX_RELEASES = 25 // each entry holds a whole scene; the file must not grow without bound

const HEX64 = /^[a-f0-9]{64}$/

export interface ProductionRelease {
  id: string
  revision: number // file-local; identify a release across files by packetSha256
  releasedBy: string
  identity: 'self-declared'
  releasedAt: string
  packetSha256: string
  sourceSha256: string
  assessment: ProductionReleaseRecord
  // How many review-required findings the releaser ticked as reviewed. Absent on entries written
  // before review-required packets could be recorded, which were all technically ready (0).
  acknowledgedReviewItems?: number
  // The exact text the packet manifest's sourceSha256 covers. A string, never an object: saving
  // rounds floats to 6 dp, which would change the hash.
  source: string
}

export interface UnreadableRelease {
  unreadable: true
  raw: unknown
}

export type ReleaseEntry = ProductionRelease | UnreadableRelease
export type ReleaseIntegrity = 'ok' | 'corrupted' | 'unreadable'

export const isReadable = (entry: ReleaseEntry): entry is ProductionRelease =>
  (entry as UnreadableRelease).unreadable !== true

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNullOrHex = (value: unknown): boolean =>
  value === null || (typeof value === 'string' && HEX64.test(value))

const openReviewItems = (assessment: ProductionReleaseRecord): number =>
  assessment.findings.filter((finding) => finding.category === 'review-required').length

function readRelease(value: unknown): ProductionRelease | null {
  if (!isRecord(value)) return null
  // A stray key would make isReadable misread a valid entry, and releasesForFile would drop it.
  if ('unreadable' in value) return null
  const { id, revision, releasedBy, identity, releasedAt, packetSha256, sourceSha256, source } =
    value
  if (typeof id !== 'string' || id === '') return null
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return null
  if (
    typeof releasedBy !== 'string' ||
    releasedBy.trim() === '' ||
    releasedBy.length > MAX_RELEASED_BY_LENGTH
  )
    return null
  if (identity !== 'self-declared') return null
  if (typeof releasedAt !== 'string' || !Number.isFinite(Date.parse(releasedAt))) return null
  if (typeof packetSha256 !== 'string' || !HEX64.test(packetSha256)) return null
  if (typeof sourceSha256 !== 'string' || !HEX64.test(sourceSha256)) return null
  if (typeof source !== 'string') return null
  const assessment = value.assessment
  if (
    !isRecord(assessment) ||
    assessment.schemaVersion !== 1 ||
    assessment.kind !== 'production-release-assessment' ||
    (assessment.status !== 'technically-ready' && assessment.status !== 'review-required') ||
    assessment.packetSha256 !== packetSha256 ||
    assessment.formalApproval !== 'not-recorded' ||
    !Array.isArray(assessment.findings) ||
    !assessment.findings.every(
      (finding) =>
        isRecord(finding) &&
        (finding.category === 'blocker' || finding.category === 'review-required'),
    ) ||
    !Array.isArray(assessment.limitations) ||
    !assessment.limitations.every((item) => typeof item === 'string') ||
    typeof assessment.assessedAt !== 'string' ||
    !Number.isFinite(Date.parse(assessment.assessedAt)) ||
    !isRecord(assessment.revision) ||
    (assessment.revision.mode !== 'initial' && assessment.revision.mode !== 'revision') ||
    !isNullOrHex(assessment.revision.beforeSha256) ||
    !isNullOrHex(assessment.revision.reviewSha256)
  )
    return null
  // A record that contradicts itself is unreadable: a blocker never records, a ready packet has
  // nothing to acknowledge, and a review-required one lists review items and acknowledged exactly
  // what it listed.
  const record = assessment as unknown as ProductionReleaseRecord
  const acknowledged = value.acknowledgedReviewItems
  if (record.findings.some((finding) => finding.category === 'blocker')) return null
  if (
    record.status === 'technically-ready'
      ? record.findings.length !== 0 || (acknowledged !== undefined && acknowledged !== 0)
      : openReviewItems(record) === 0 || acknowledged !== openReviewItems(record)
  )
    return null
  // Chars never exceed bytes, so this never rejects a source the recorder accepted. JSON validity
  // is not checked: a matching sourceSha256 (verifyReleases) is what ties it to what was captured.
  if (source.length > MAX_RELEASE_SOURCE_BYTES) return null
  // Spread first so a field a newer build added survives a save-as-copy; the validated fields win.
  return {
    ...(value as object),
    id,
    revision,
    releasedBy,
    identity,
    releasedAt,
    packetSha256,
    sourceSha256,
    assessment: record,
    source,
  }
}

// Structure only: hashing is async, so parseFile stays synchronous and verifyReleases runs after load.
// A damaged or duplicate entry is kept as unreadable rather than failing the whole file.
export function parseReleases(value: unknown): ReleaseEntry[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) return [{ unreadable: true, raw: value }]
  const ids = new Set<string>()
  const revisions = new Set<number>()
  return value.map((raw): ReleaseEntry => {
    const release = readRelease(raw)
    if (!release || ids.has(release.id) || revisions.has(release.revision))
      return { unreadable: true, raw }
    ids.add(release.id)
    revisions.add(release.revision)
    return release
  })
}

export function releasesForFile(entries: readonly ReleaseEntry[]): unknown[] {
  return entries.map((entry) => (isReadable(entry) ? entry : entry.raw))
}

// Detects accidental corruption only: the digest is stored beside the data it covers in an
// editable file, so it is not evidence against deliberate edits.
export function verifyReleases(entries: readonly ReleaseEntry[]): Promise<ReleaseIntegrity[]> {
  return Promise.all(
    entries.map(async (entry): Promise<ReleaseIntegrity> => {
      if (!isReadable(entry)) return 'unreadable'
      return (await sha256Hex(entry.source)) === entry.sourceSha256 ? 'ok' : 'corrupted'
    }),
  )
}

export type RecordRefusal =
  | 'not-ready'
  | 'review-not-acknowledged'
  | 'invalid-manifest-hash'
  | 'invalid-packet-hash'
  | 'source-mismatch'
  | 'invalid-name'
  | 'duplicate-packet'
  | 'unchanged'
  | 'source-too-large'
  | 'release-limit'
  | 'stale' // returned by useFile when the list changed while a record was in flight

export interface RecordReleaseInput {
  assessment: ProductionReleaseRecord
  packetSourceSha256: string // sourceSha256 from the verified packet manifest
  liveSource: string // captureProductionSource(...) of the live project
  releasedBy: string
  acknowledgeReview?: boolean // the releaser ticked that the open review items were reviewed
  releasedAt?: Date
  id?: string
}

export type RecordReleaseResult =
  | { ok: true; releases: ReleaseEntry[]; release: ProductionRelease }
  | { ok: false; reason: RecordRefusal }

const refuse = (reason: RecordRefusal): RecordReleaseResult => ({ ok: false, reason })

export async function recordRelease(
  existing: readonly ReleaseEntry[],
  input: RecordReleaseInput,
): Promise<RecordReleaseResult> {
  const { assessment } = input
  // Refuse whatever readRelease would reject, so a recorded release always reloads.
  if (
    assessment.status === 'blocked' ||
    assessment.findings.some((finding) => finding.category !== 'review-required') ||
    (assessment.status === 'technically-ready'
      ? assessment.findings.length !== 0
      : openReviewItems(assessment) === 0)
  )
    return refuse('not-ready')
  if (assessment.status === 'review-required' && input.acknowledgeReview !== true)
    return refuse('review-not-acknowledged')
  const packetSource = input.packetSourceSha256.toLowerCase()
  if (!HEX64.test(packetSource)) return refuse('invalid-manifest-hash')
  if (!HEX64.test(assessment.packetSha256)) return refuse('invalid-packet-hash')
  const releasedBy = input.releasedBy.trim()
  if (releasedBy === '' || releasedBy.length > MAX_RELEASED_BY_LENGTH) return refuse('invalid-name')
  if (new TextEncoder().encode(input.liveSource).length > MAX_RELEASE_SOURCE_BYTES)
    return refuse('source-too-large')
  const sourceSha256 = await sha256Hex(input.liveSource)
  if (sourceSha256 !== packetSource) return refuse('source-mismatch')
  const readable = existing.filter(isReadable)
  if (existing.length >= MAX_RELEASES) return refuse('release-limit')
  if (readable.some((release) => release.packetSha256 === assessment.packetSha256))
    return refuse('duplicate-packet')
  const newest = readable.reduce<ProductionRelease | undefined>(
    (best, release) => (best === undefined || release.revision > best.revision ? release : best),
    undefined,
  )
  if (newest?.sourceSha256 === sourceSha256) return refuse('unchanged')
  const release: ProductionRelease = {
    id: input.id ?? crypto.randomUUID(),
    revision: (newest?.revision ?? 0) + 1,
    releasedBy,
    identity: 'self-declared',
    releasedAt: new Date(input.releasedAt ?? new Date()).toISOString(),
    packetSha256: assessment.packetSha256,
    sourceSha256,
    assessment,
    source: input.liveSource,
    acknowledgedReviewItems:
      assessment.status === 'review-required' ? openReviewItems(assessment) : 0,
  }
  return { ok: true, releases: [...existing, release], release }
}
