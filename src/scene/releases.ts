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

function readRelease(value: unknown): ProductionRelease | null {
  if (!isRecord(value)) return null
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
    assessment.status !== 'technically-ready' ||
    assessment.packetSha256 !== packetSha256 ||
    assessment.formalApproval !== 'not-recorded' ||
    !Array.isArray(assessment.findings) ||
    !Array.isArray(assessment.limitations) ||
    !isRecord(assessment.revision) ||
    (assessment.revision.mode !== 'initial' && assessment.revision.mode !== 'revision')
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
    assessment: assessment as unknown as ProductionReleaseRecord,
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
