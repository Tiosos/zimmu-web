import { sha256Hex, type ProductionRelease } from '../releases'
import type { ProductionReleaseRecord, ReleaseFinding } from '../../ui/productionReleaseGate'

export const readyAssessment = (packetSha256: string): ProductionReleaseRecord => ({
  schemaVersion: 1,
  kind: 'production-release-assessment',
  assessedAt: '2026-10-14T00:00:00.000Z',
  packetSha256,
  status: 'technically-ready',
  formalApproval: 'not-recorded',
  revision: { mode: 'initial', beforeSha256: null, reviewSha256: null },
  findings: [],
  limitations: [],
})

export const reviewFinding = (reference: string): ReleaseFinding => ({
  reference,
  category: 'review-required',
  source: 'readiness',
  message: 'Not assessed',
  partIds: [],
  operationId: null,
  locations: ['readiness/review.json'],
})

export const reviewAssessment = (packetSha256: string, open = 2): ProductionReleaseRecord => ({
  ...readyAssessment(packetSha256),
  status: 'review-required',
  findings: Array.from({ length: open }, (_, i) => reviewFinding(`unassessed-${i}`)),
})

export const SOURCE_A = JSON.stringify({
  scene: { parts: [] },
  projectName: 'Kitchen',
  hardwareLibrary: {},
  materialLibrary: {},
})

export async function makeRelease(
  overrides: Partial<ProductionRelease> = {},
): Promise<ProductionRelease> {
  const source = overrides.source ?? SOURCE_A
  const packetSha256 = overrides.packetSha256 ?? 'a'.repeat(64)
  return {
    id: 'rel-1',
    revision: 1,
    releasedBy: 'Sam Designer',
    identity: 'self-declared',
    releasedAt: '2026-10-14T01:00:00.000Z',
    packetSha256,
    sourceSha256: await sha256Hex(source),
    assessment: readyAssessment(packetSha256),
    source,
    ...overrides,
  }
}
