import { beforeAll, afterEach, expect, it, vi } from 'vitest'
import { strToU8 } from 'fflate'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { buildProductionPacket } from './buildProductionPacket'
import { assessProductionRelease } from './productionReleaseGate'
import * as integrity from './verifyProductionPacket'
import { compareProductionPackets } from './compareProductionPackets'
import { createRevisionReview } from './packetRevisionReview'

let packet: Uint8Array
beforeAll(async () => {
  packet = await buildProductionPacket({
    scene: machiningProject(),
    projectName: 'Release',
    hardwareLibrary: {},
    materialLibrary: {},
  })
})
afterEach(() => vi.restoreAllMocks())
const passed: integrity.PacketIntegrityReport = {
  schemaVersion: 1,
  status: 'passed',
  checkedFiles: 14,
  checkedOperations: 8,
  findings: [],
  scope: 'Scope',
  limitations: ['Unsigned evidence'],
}
const evidence = (items: unknown[]) =>
  vi.spyOn(integrity, 'inspectProductionPacket').mockResolvedValue({
    integrity: passed,
    files: {
      'manifest.json': strToU8(JSON.stringify({ counts: { parts: 1 } })),
      'readiness/review.json': strToU8(JSON.stringify({ schemaVersion: 1, items })),
    },
  })
const item = (category: string) => ({
  reference: 'PR:stable',
  category,
  message: 'Finding',
  targets: [{ kind: 'part', id: 'panel' }],
  operationId: 'drill',
  locations: ['machining/schedule.json#entry=0', 'drawings/shop-drawings.pdf#page=1'],
})

it('assesses real packets without altering valid drilling or hiding unassessed readiness', async () => {
  const original = packet.slice()
  const record = await assessProductionRelease({
    packet,
    mode: 'initial',
    assessedAt: new Date('2026-10-10T00:00:00Z'),
  })
  expect(record.formalApproval).toBe('not-recorded')
  expect(record.findings.some((f) => f.source === 'readiness')).toBe(true)
  expect(record.status).not.toBe('technically-ready')
  expect(packet).toEqual(original)
  expect(record.packetSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(record.assessedAt).toBe('2026-10-10T00:00:00.000Z')
})
it('combines traceable correction blockers and distinguishes technical readiness from approval', async () => {
  const inspect = evidence([item('needs-correction')])
  const blocked = await assessProductionRelease({ packet, mode: 'initial' })
  expect(blocked.status).toBe('blocked')
  expect(blocked.findings[0]).toMatchObject({
    reference: 'PR:stable',
    partIds: ['panel'],
    operationId: 'drill',
    locations: [
      'readiness/review.json',
      'machining/schedule.json#entry=0',
      'drawings/shop-drawings.pdf#page=1',
    ],
  })
  inspect.mockResolvedValue({
    integrity: passed,
    files: {
      'manifest.json': strToU8(JSON.stringify({ counts: { parts: 1 } })),
      'readiness/review.json': strToU8(JSON.stringify({ schemaVersion: 1, items: [] })),
    },
  })
  const ready = await assessProductionRelease({ packet, mode: 'initial' })
  expect(ready.status).toBe('technically-ready')
  expect(ready.formalApproval).toBe('not-recorded')
  const missingRevision = await assessProductionRelease({ packet, mode: 'revision' })
  expect(missingRevision.status).toBe('review-required')
  expect(missingRevision.findings.some((f) => f.reference === 'RG:revision-evidence')).toBe(true)
})
it.each(['advisory', 'unassessed'])(
  'keeps %s readiness findings requiring review',
  async (category) => {
    evidence([item(category)])
    expect((await assessProductionRelease({ packet, mode: 'initial' })).status).toBe(
      'review-required',
    )
  },
)
it('fails closed for malformed readiness and captures input before asynchronous work', async () => {
  evidence([{ ...item('advisory'), operationId: undefined }])
  const bytes = packet.slice(),
    pending = assessProductionRelease({ packet: bytes, mode: 'initial' })
  bytes.fill(0)
  const record = await pending
  expect(record.status).toBe('blocked')
  expect(record.findings.some((f) => f.reference === 'RG:readiness-evidence')).toBe(true)
  expect(record.packetSha256).toBe(
    (await assessProductionRelease({ packet, mode: 'initial' })).packetSha256,
  )
  expect(record.packetSha256).not.toBe(
    (await assessProductionRelease({ packet: bytes, mode: 'initial' })).packetSha256,
  )
})
it('preserves integrity blockers without trusting inaccessible readiness files', async () => {
  vi.spyOn(integrity, 'inspectProductionPacket').mockResolvedValue({
    integrity: {
      ...passed,
      status: 'failed',
      findings: [
        {
          reference: 'PI:hash',
          severity: 'error',
          code: 'hash',
          message: 'Altered',
          partId: null,
          operationId: null,
          locations: ['lists/boards.csv'],
        },
      ],
    },
    files: null,
  })
  const record = await assessProductionRelease({ packet, mode: 'initial' })
  expect(record.status).toBe('blocked')
  expect(record.findings[0].reference).toBe('PI:hash')
})
it('requires all revision coverage acknowledgments and rejects stale review binding', async () => {
  const comparison = await compareProductionPackets(packet, packet)
  expect(comparison.status).toBe('compared')
  const review = createRevisionReview(comparison)
  const pending = await assessProductionRelease({
    packet,
    mode: 'revision',
    earlierPacket: packet,
    reviewJson: JSON.stringify(review),
  })
  expect(pending.findings.some((f) => f.source === 'revision')).toBe(true)
  for (const group of [review.changes, review.outputs, review.limitations])
    for (const entry of group) entry.acknowledged = true
  const complete = await assessProductionRelease({
    packet,
    mode: 'revision',
    earlierPacket: packet,
    reviewJson: JSON.stringify(review),
  })
  expect(complete.findings.filter((f) => f.source === 'revision')).toEqual([])
  expect(complete.revision.beforeSha256).toBe(complete.packetSha256)
  expect(complete.revision.reviewSha256).toMatch(/^[a-f0-9]{64}$/)
  review.comparison.after.sha256 = 'c'.repeat(64)
  const stale = await assessProductionRelease({
    packet,
    mode: 'revision',
    earlierPacket: packet,
    reviewJson: JSON.stringify(review),
  })
  expect(stale.findings.some((f) => f.reference === 'RG:revision-invalid')).toBe(true)
})

it('marks unsupported readiness, duplicate findings and missing fields as blockers', async () => {
  const inspect = evidence([])
  for (const value of [
    { schemaVersion: 2, items: [] },
    { schemaVersion: 1, items: [item('advisory'), item('advisory')] },
    { schemaVersion: 1, items: [{ ...item('advisory'), locations: null }] },
    { schemaVersion: 1, items: [item('unknown')] },
  ]) {
    inspect.mockResolvedValue({
      integrity: passed,
      files: {
        'manifest.json': strToU8(JSON.stringify({ counts: { parts: 1 } })),
        'readiness/review.json': strToU8(JSON.stringify(value)),
      },
    })
    expect((await assessProductionRelease({ packet, mode: 'initial' })).status).toBe('blocked')
  }
})
it('retains incomplete integrity and incomplete revision comparisons as unassessed', async () => {
  const inspect = vi
    .spyOn(integrity, 'inspectProductionPacket')
    .mockResolvedValue({ integrity: { ...passed, status: 'unassessed' }, files: null })
  expect((await assessProductionRelease({ packet, mode: 'initial' })).status).toBe(
    'review-required',
  )
  inspect.mockRestore()
  const record = await assessProductionRelease({
    packet,
    mode: 'revision',
    earlierPacket: new Uint8Array([0]),
    reviewJson: '{}',
  })
  expect(record.findings.some((f) => f.reference === 'RG:revision-invalid')).toBe(true)
})
it('rejects oversized packet and review inputs before inspection', async () => {
  const inspect = vi.spyOn(integrity, 'inspectProductionPacket')
  const oversized = new Uint8Array(integrity.MAX_PACKET_BYTES + 1)
  await expect(assessProductionRelease({ packet: oversized, mode: 'initial' })).rejects.toThrow(
    '64 MiB',
  )
  await expect(
    assessProductionRelease({ packet, earlierPacket: oversized, mode: 'revision' }),
  ).rejects.toThrow('64 MiB')
  await expect(
    assessProductionRelease({
      packet,
      mode: 'revision',
      reviewJson: 'x'.repeat(2 * 1024 * 1024 + 1),
    }),
  ).rejects.toThrow('2 MiB')
  expect(inspect).not.toHaveBeenCalled()
})

it('blocks an empty production packet even when all reports are clear', async () => {
  vi.spyOn(integrity, 'inspectProductionPacket').mockResolvedValue({
    integrity: passed,
    files: {
      'manifest.json': strToU8(JSON.stringify({ counts: { parts: 0 } })),
      'readiness/review.json': strToU8(JSON.stringify({ schemaVersion: 1, items: [] })),
    },
  })
  const record = await assessProductionRelease({ packet, mode: 'initial' })
  expect(record.status).toBe('blocked')
  expect(record.findings.some((f) => f.reference === 'RG:packet-contents')).toBe(true)
})
