import { beforeAll, describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { buildProductionPacket } from './buildProductionPacket'
import { compareProductionPackets } from './compareProductionPackets'
import { inspectProductionPacket } from './verifyProductionPacket'

const packet = (
  scene = machiningProject(),
  capturedAt = new Date('2026-10-06T01:00:00Z'),
  projectName = 'Revision',
) =>
  buildProductionPacket({
    scene,
    projectName,
    capturedAt,
    hardwareLibrary: {},
    materialLibrary: {},
  })
let original: Uint8Array
beforeAll(async () => {
  original = await packet()
})
const json = (files: Record<string, Uint8Array>, path: string) => JSON.parse(strFromU8(files[path]))
async function legacy(bytes: Uint8Array) {
  const files = unzipSync(bytes),
    manifest = json(files, 'manifest.json')
  delete files['machining/parts.json']
  delete manifest.partInventory
  manifest.files = manifest.files.filter(
    (entry: { path: string }) => entry.path !== 'machining/parts.json',
  )
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  return zipSync(files)
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
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  return zipSync(files, { level: 0 })
}
describe('packet revision comparison', () => {
  it('compares identical exports and records both archive identities', async () => {
    const report = await compareProductionPackets(original, original)
    expect(report).toMatchObject({
      status: 'compared',
      counts: { added: 0, removed: 0, modified: 0 },
      changes: [],
      packetMetadataChanges: [],
      otherChangedFiles: [],
    })
    expect(report.before.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(report.before.sha256).toBe(report.after.sha256)
    expect(report.before.integrity.status).toBe('passed')
  })
  it('distinguishes capture dates and renamed projects from manufacturing changes', async () => {
    const report = await compareProductionPackets(
      original,
      await packet(machiningProject(), new Date('2026-10-06T02:00:00Z'), 'Renamed project'),
    )
    expect(report.changes).toEqual([])
    expect(report.packetMetadataChanges).toEqual(
      expect.arrayContaining(['projectName', 'capturedAt']),
    )
    expect(report.otherChangedFiles).toContain('drawings/shop-drawings.pdf')
  })
  it('reports stock geometry on a part with no machining operations', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    if (board.kind !== 'board') throw new Error('Expected board')
    board.cuts = []
    board.operations = []
    const earlier = await packet(scene)
    board.length += 10
    const report = await compareProductionPackets(earlier, await packet(scene))
    expect(report.status).toBe('compared')
    const change = report.changes.find((c) => c.partId === board.id)
    expect(change).toMatchObject({
      entity: 'part',
      change: 'modified',
      classification: 'manufacturing',
    })
    expect(change?.fields.map((f) => f.field)).toContain('dimensions')
    expect(change?.before?.locations).toContain('machining/parts.json')
    expect(
      change?.after?.locations.some((location) => location.includes('shop-drawings.pdf#page=')),
    ).toBe(true)
  })
  it('separates geometric drilling and changed manual instructions, retaining provenance and both locations', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    if (board.kind !== 'board') throw new Error('Expected board')
    const drilling = board.cuts.find((c) => c.kind === 'hole-array')!
    if (drilling.kind !== 'hole-array') throw new Error('Expected drilling')
    drilling.diameter += 1
    board.operations![0].instruction = 'Use revised jig, then inspect'
    const report = await compareProductionPackets(original, await packet(scene))
    const drill = report.changes.find((c) => c.operationId === drilling.id)!
    expect(drill.classification).toBe('manufacturing')
    expect(drill.fields.map((f) => f.field)).toContain('diameter')
    expect(drill.after?.definition).toMatchObject({
      category: 'geometric-drilling',
      depthMode: 'through',
    })
    expect(drill.after?.provenance).toMatchObject({ sourceJointId: 'screw-owner' })
    expect(drill.before?.locations).toEqual(
      expect.arrayContaining(['machining/schedule.json#entries/2', 'lists/machining.csv#record=4']),
    )
    expect(
      drill.after?.locations.some((location) => location.includes('shop-drawings.pdf#page=')),
    ).toBe(true)
    expect(
      report.changes.find((c) => c.operationId === board.operations![0].id)?.after?.definition,
    ).toMatchObject({ category: 'manual-instruction' })
  })
  it('reports additions and removals by stable identity without matching labels', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    const added = structuredClone(board)
    added.id = 'new-part'
    added.cuts = []
    if (added.kind === 'board') added.operations = []
    scene.parts = [board, added]
    const report = await compareProductionPackets(original, await packet(scene))
    expect(report.changes).toContainEqual(
      expect.objectContaining({
        entity: 'part',
        partId: 'new-part',
        change: 'added',
        before: null,
      }),
    )
    expect(report.changes).toContainEqual(
      expect.objectContaining({
        entity: 'part',
        partId: 'manual-round',
        change: 'removed',
        after: null,
      }),
    )
    expect(
      report.changes.some(
        (c) => c.entity === 'operation' && c.partId === 'manual-round' && c.change === 'removed',
      ),
    ).toBe(true)
    expect(report.changes.find((c) => c.partId === 'new-part')?.after?.definition).toMatchObject({
      id: 'new-part',
    })
  })
  it('classifies label and ownership edits as metadata and retains stable IDs when records move', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    board.label = 'Renamed panel'
    board.cuts[0].label = 'Renamed rebate'
    const rebate = board.cuts[0]
    if (rebate.kind !== 'box') throw new Error('Expected rebate')
    rebate.sourceComponentId = 'different-owner'
    const beforeMove = await compareProductionPackets(original, await packet(scene))
    expect(beforeMove.counts).toMatchObject({ modified: 2, metadata: 2, manufacturing: 0 })
    expect(beforeMove.changes.every((c) => c.classification === 'metadata')).toBe(true)
    scene.parts.reverse()
    board.cuts.reverse()
    const afterMove = await compareProductionPackets(original, await packet(scene))
    expect(afterMove.changes.map((c) => c.reference)).toEqual(
      beforeMove.changes.map((c) => c.reference),
    )
    expect(
      afterMove.changes.find((c) => c.operationId === board.cuts.at(-1)!.id)?.after?.locations,
    ).not.toEqual(
      beforeMove.changes.find((c) => c.operationId === board.cuts.at(-1)!.id)?.after?.locations,
    )
  })
  it('scopes reused operation IDs by part and reports operation additions/removals', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    if (board.kind !== 'board') throw new Error('Expected board')
    const clone = structuredClone(board)
    clone.id = 'other-board'
    clone.parentId = null
    scene.parts.push(clone)
    const earlier = await packet(scene)
    const drill = clone.cuts.find((c) => c.kind === 'hole-array')!
    if (drill.kind !== 'hole-array') throw new Error('Expected drilling')
    drill.diameter += 1
    const report = await compareProductionPackets(earlier, await packet(scene))
    expect(report.changes).toHaveLength(1)
    expect(report.changes[0]).toMatchObject({
      partId: 'other-board',
      operationId: 'row',
      change: 'modified',
    })
    board.operations!.push({ ...board.operations![0], id: 'new-instruction' })
    board.cuts = board.cuts.filter((c) => c.kind !== 'mitre')
    const changes = (await compareProductionPackets(earlier, await packet(scene))).changes
    expect(changes).toContainEqual(
      expect.objectContaining({
        partId: board.id,
        operationId: 'new-instruction',
        change: 'added',
        before: null,
      }),
    )
    expect(changes).toContainEqual(
      expect.objectContaining({
        partId: board.id,
        operationId: 'bevel',
        change: 'removed',
        after: null,
      }),
    )
  })
  it('does not treat drawing-page shifts or schedule ordering as manufacturing changes', async () => {
    const scene = machiningProject()
    scene.parts.reverse()
    scene.parts.forEach((part) => part.cuts.reverse())
    const report = await compareProductionPackets(original, await packet(scene))
    expect(report.changes).toEqual([])
    expect(report.otherChangedFiles).toContain('drawings/shop-drawings.pdf')
  })
  it('marks legacy part coverage partial without fabricating changes from missing fields', async () => {
    const report = await compareProductionPackets(await legacy(original), original)
    expect(report.status).toBe('partial')
    expect(report.changes).toEqual([])
    expect(report.limitations.join(' ')).toContain('Only shared recorded part fields')
  })
  it('blocks comparisons when either packet has failed or incomplete integrity checks', async () => {
    const files = unzipSync(original)
    files['lists/machining.csv'] = strToU8('Altered')
    const report = await compareProductionPackets(original, zipSync(files))
    expect(report.status).toBe('blocked')
    expect(report.changes).toEqual([])
    expect(report.after.integrity.status).toBe('failed')
    expect(report.after.integrity.findings.map((f) => f.code)).toContain('hash-mismatch')
    const manifest = json(files, 'manifest.json')
    manifest.schemaVersion = 9
    files['manifest.json'] = strToU8(JSON.stringify(manifest))
    expect((await compareProductionPackets(zipSync(files), original)).before.integrity.status).toBe(
      'unassessed',
    )
  })
  it('ignores ZIP compression and JSON whitespace/key order while retaining archive hashes', async () => {
    const files = unzipSync(original)
    for (const path of ['machining/parts.json', 'machining/schedule.json']) {
      const value = json(files, path)
      files[path] = strToU8(JSON.stringify(Object.fromEntries(Object.entries(value).reverse())))
    }
    const report = await compareProductionPackets(original, await repack(files))
    expect(report.status).toBe('compared')
    expect(report.changes).toEqual([])
    expect(report.before.sha256).not.toBe(report.after.sha256)
  })
  it('reports edge stock edits as manufacturing changes', async () => {
    const scene = machiningProject(),
      board = scene.parts[0]
    if (board.kind !== 'board') throw new Error('Expected board')
    // Mitred boards intentionally carry no effective banding. Compare an ordinary board.
    board.cuts = board.cuts.filter((c) => c.kind !== 'mitre')
    const earlier = await packet(scene)
    board.edgeBanding = { ...board.edgeBanding, y0: 'Tape' }
    const report = await compareProductionPackets(earlier, await packet(scene))
    const change = report.changes.find((c) => c.entity === 'part' && c.partId === board.id)!
    expect(change.classification).toBe('manufacturing')
    expect(change.fields.map((f) => f.field)).toContain('edges')
  })
  it('rejects missing, malformed or inconsistent declared inventory instead of claiming complete coverage', async () => {
    const files = unzipSync(original),
      inventory = json(files, 'machining/parts.json')
    inventory.parts[0].dimensions.length += 1
    files['machining/parts.json'] = strToU8(JSON.stringify(inventory))
    expect(
      (await compareProductionPackets(original, await repack(files))).after.integrity.findings.map(
        (f) => f.code,
      ),
    ).toContain('inventory-schedule-mismatch')
    delete files['machining/parts.json']
    expect((await compareProductionPackets(original, await repack(files))).status).toBe('blocked')
    inventory.parts[0].dimensions = {}
    files['machining/parts.json'] = strToU8(JSON.stringify(inventory))
    expect((await compareProductionPackets(original, await repack(files))).status).toBe('blocked')
  })
  it('captures both input buffers before verification awaits', async () => {
    const before = original.slice(),
      after = original.slice()
    const pending = compareProductionPackets(before, after)
    before.fill(0)
    after.fill(0)
    expect((await pending).status).toBe('compared')
  })
  it('exposes bounded files only after successful verification', async () => {
    expect((await inspectProductionPacket(original)).files).toBeTruthy()
    expect((await inspectProductionPacket(new Uint8Array([1, 2]))).files).toBeNull()
  })
})
