import { strFromU8 } from 'fflate'
import { inspectProductionPacket, MAX_PACKET_BYTES } from './verifyProductionPacket'
import { compareProductionPackets } from './compareProductionPackets'
import { importRevisionReview } from './packetRevisionReview'

export const PRODUCTION_RELEASE_POLICY = {
  schemaVersion: 1,
  assessment: 'Separate release record bound to the final ZIP SHA-256',
  sources: ['packet-integrity', 'readiness/review.json', 'revision-review.json'],
  correctionFindings: 'block-release',
  advisoryAndUnassessedFindings: 'require-review',
  formalApproval: 'not-recorded',
} as const

export interface ReleaseFinding {
  reference: string
  category: 'blocker' | 'review-required'
  source: 'integrity' | 'readiness' | 'revision'
  message: string
  partIds: string[]
  operationId: string | null
  locations: string[]
}
export interface ProductionReleaseRecord {
  schemaVersion: 1
  kind: 'production-release-assessment'
  assessedAt: string
  packetSha256: string
  status: 'blocked' | 'review-required' | 'technically-ready'
  formalApproval: 'not-recorded'
  revision: {
    mode: 'initial' | 'revision'
    beforeSha256: string | null
    reviewSha256: string | null
  }
  findings: ReleaseFinding[]
  limitations: string[]
}
export interface ProductionReleaseInput {
  packet: Uint8Array
  mode: 'initial' | 'revision'
  earlierPacket?: Uint8Array
  reviewJson?: string
  assessedAt?: Date
}
const hash = async (bytes: Uint8Array) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
const obj = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid release evidence.')
  return value as Record<string, unknown>
}
const text = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('Invalid release evidence text.')
  return value
}
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Invalid release evidence list.')
  return value
}

export async function assessProductionRelease(
  input: ProductionReleaseInput,
): Promise<ProductionReleaseRecord> {
  if (
    input.packet.length > MAX_PACKET_BYTES ||
    (input.earlierPacket?.length ?? 0) > MAX_PACKET_BYTES
  )
    throw new Error('Packet exceeds the 64 MiB limit.')
  if ((input.reviewJson?.length ?? 0) > 2 * 1024 * 1024)
    throw new Error('Review exceeds the 2 MiB limit.')
  const packet = input.packet.slice(),
    earlier = input.earlierPacket?.slice(),
    reviewJson = input.reviewJson,
    mode = input.mode
  const assessedAt = new Date(input.assessedAt ?? new Date()).toISOString()
  const result = await inspectProductionPacket(packet)
  const findings: ReleaseFinding[] = result.integrity.findings.map((f) => ({
    reference: f.reference,
    category: f.severity === 'error' ? 'blocker' : 'review-required',
    source: 'integrity',
    message: f.message,
    partIds: f.partId ? [f.partId] : [],
    operationId: f.operationId,
    locations: f.locations,
  }))
  const add = (
    reference: string,
    message: string,
    source: ReleaseFinding['source'],
    category: ReleaseFinding['category'] = 'review-required',
    locations: string[] = [],
  ) =>
    findings.push({
      reference,
      message,
      source,
      category,
      locations,
      partIds: [],
      operationId: null,
    })
  if (result.integrity.status !== 'passed')
    add(
      'RG:integrity',
      'A verified packet is required before readiness and revision evidence can be assessed.',
      'integrity',
      result.integrity.status === 'failed' ? 'blocker' : 'review-required',
      ['archive'],
    )
  if (result.files) {
    try {
      const manifest = obj(JSON.parse(strFromU8(result.files['manifest.json'])))
      const partCount = obj(manifest.counts).parts
      if (!Number.isSafeInteger(partCount) || (partCount as number) < 1)
        throw new Error('No production parts.')
    } catch {
      add(
        'RG:packet-contents',
        'A production release must contain at least one part with valid packet counts.',
        'readiness',
        'blocker',
        ['manifest.json#counts.parts'],
      )
    }
    try {
      const review = obj(JSON.parse(strFromU8(result.files['readiness/review.json'])))
      if (review.schemaVersion !== 1) throw new Error('Unsupported readiness evidence.')
      const seen = new Set<string>()
      const items = list(review.items).map((value) => {
        const item = obj(value),
          reference = text(item.reference),
          category = text(item.category)
        if (
          !reference ||
          seen.has(reference) ||
          !['needs-correction', 'advisory', 'unassessed'].includes(category)
        )
          throw new Error('Invalid readiness finding.')
        seen.add(reference)
        return {
          reference,
          category:
            category === 'needs-correction' ? ('blocker' as const) : ('review-required' as const),
          source: 'readiness' as const,
          message: text(item.message),
          partIds: list(item.targets)
            .map(obj)
            .filter((target) => target.kind === 'part')
            .map((target) => text(target.id)),
          operationId: item.operationId === null ? null : text(item.operationId),
          locations: ['readiness/review.json', ...list(item.locations).map(text)],
        }
      })
      findings.push(...items)
    } catch {
      add(
        'RG:readiness-evidence',
        'Readiness findings are missing, malformed or unsupported.',
        'readiness',
        'blocker',
        ['readiness/review.json'],
      )
    }
  }
  let beforeSha256: string | null = null,
    reviewSha256: string | null = null
  if (mode === 'revision') {
    if (!earlier || !reviewJson || !result.files)
      add(
        'RG:revision-evidence',
        'Provide verified earlier/current packets and their saved revision review.',
        'revision',
      )
    else {
      beforeSha256 = await hash(earlier)
      reviewSha256 = await hash(new TextEncoder().encode(reviewJson))
      try {
        const comparison = await compareProductionPackets(earlier, packet)
        if (comparison.status !== 'compared') throw new Error('Comparison is incomplete.')
        const review = importRevisionReview(JSON.parse(reviewJson), comparison)
        for (const group of ['changes', 'outputs', 'limitations'] as const) {
          for (const entry of review[group].filter((entry) => !entry.acknowledged)) {
            const change = comparison.changes.find((change) => change.reference === entry.reference)
            findings.push({
              reference: `RG:${entry.reference}`,
              category: 'review-required',
              source: 'revision',
              message: `Pending revision ${group} acknowledgment.`,
              partIds: change ? [change.partId] : [],
              operationId: change?.operationId ?? null,
              locations: [
                'revision-review.json',
                ...(group === 'outputs'
                  ? comparison.otherChangedFiles
                      .filter((path) => `PO:${JSON.stringify(path)}` === entry.reference)
                      .flatMap((path) => [`earlier:${path}`, `current:${path}`])
                  : []),
                ...(change?.before?.locations ?? []).map((path) => `earlier:${path}`),
                ...(change?.after?.locations ?? []).map((path) => `current:${path}`),
              ],
            })
          }
        }
      } catch {
        add(
          'RG:revision-invalid',
          'Revision evidence is stale, invalid, or based on an incomplete comparison.',
          'revision',
          'review-required',
          ['revision-review.json'],
        )
      }
    }
  } else if (mode !== 'initial') {
    add('RG:revision-mode', 'Choose initial or revision release.', 'revision')
  }
  return {
    schemaVersion: 1,
    kind: 'production-release-assessment',
    assessedAt,
    packetSha256: await hash(packet),
    status: findings.some((f) => f.category === 'blocker')
      ? 'blocked'
      : findings.length
        ? 'review-required'
        : 'technically-ready',
    formalApproval: 'not-recorded',
    revision: { mode, beforeSha256, reviewSha256 },
    findings,
    limitations: [
      ...result.integrity.limitations,
      'Readiness is assessed from unsigned packet reports, not independently recalculated geometry or machine compatibility.',
      'Initial-release mode is a local declaration. Revision acknowledgments and this record do not grant formal production approval.',
    ],
  }
}
