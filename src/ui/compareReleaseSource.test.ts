import { afterEach, expect, it, vi } from 'vitest'
import { machiningProject } from '../scene/__fixtures__/machiningProject'
import { manufacturingProject } from '../scene/__fixtures__/manufacturingProject'
import { captureProductionSource, type ProductionPacketInput } from './buildProductionPacket'
import { compareReleaseSource } from './compareReleaseSource'
import * as inventories from './packetPartInventory'

afterEach(() => vi.restoreAllMocks())

const inputOf = (): ProductionPacketInput => ({
  scene: machiningProject(),
  projectName: 'Kitchen',
  materialLibrary: {},
  hardwareLibrary: {},
})
const compare = (a: ProductionPacketInput, b: ProductionPacketInput) =>
  compareReleaseSource(captureProductionSource(a), captureProductionSource(b))

it('finds dimension, material and machining changes with stable part identities', () => {
  const before = inputOf(),
    after = structuredClone(before)
  const board = after.scene.parts.find((p) => p.kind === 'board')!
  if (board.kind !== 'board') throw new Error('Missing fixture board')
  board.length += 50
  board.material = ''
  board.cuts = []
  const report = compare(before, after)
  const change = report.changes.find((change) => change.id === board.id)!
  expect(change.classification).toBe('manufacturing')
  expect(change.fields.map((f) => f.name)).toEqual(
    expect.arrayContaining(['dimensions', 'material', 'cuts']),
  )
  expect(change.partIds).toEqual([board.id])
  expect(compare(before, structuredClone(before)).changes).toEqual([])
})

it('separates label changes from manufacturing changes', () => {
  const before = inputOf(),
    after = structuredClone(before)
  after.scene.parts[0].label = 'New shelf label'
  const changes = compare(before, after).changes
  expect(changes).toHaveLength(1)
  expect(changes[0]).toMatchObject({
    classification: 'metadata',
    change: 'modified',
    label: 'New shelf label',
  })
})

it('finds additions and removals without offering a removed viewport target', () => {
  const before = inputOf(),
    after = structuredClone(before)
  const removed = after.scene.parts.shift()!
  after.scene.parts.push({
    ...structuredClone(after.scene.parts[0]),
    id: 'new-part',
    label: 'New part',
  })
  const report = compare(before, after)
  expect(report.changes).toContainEqual(
    expect.objectContaining({ id: removed.id, change: 'removed', partIds: [] }),
  )
  expect(report.changes).toContainEqual(
    expect.objectContaining({ id: 'new-part', change: 'added', partIds: ['new-part'] }),
  )
})

it('finds manual hardware quantities, prices and links', () => {
  const before = inputOf()
  before.scene.hardware = [
    {
      id: 'hinge',
      name: 'Hinge',
      qty: 2,
      unit: 'pcs',
      supplier: 'Shop',
      partNumber: 'H1',
      unitCost: 4,
      notes: '',
      linkedPartIds: [before.scene.parts[0].id],
      linkedComponentIds: [],
    },
  ]
  const after = structuredClone(before)
  after.scene.hardware[0].qty = 4
  const item = compare(before, after).changes.find((c) => c.entity === 'hardware')!
  expect(item).toMatchObject({
    classification: 'manufacturing',
    change: 'modified',
    partIds: before.scene.hardware[0].linkedPartIds,
  })
  after.scene.hardware[0].qty = 2
  after.scene.hardware[0].unitCost = 5
  expect(compare(before, after).changes.find((c) => c.entity === 'hardware')!.classification).toBe(
    'metadata',
  )
})

it('keeps library and non-item source changes visible', () => {
  const before = inputOf(),
    after = structuredClone(before)
  after.projectName = 'Renamed kitchen'
  after.hardwareLibrary = { unused: { supplier: 'Shop', partNumber: 'P', unitCost: 2 } }
  const report = compare(before, after)
  expect(report.otherSourceChanges).toEqual(['Project name', 'Hardware library'])
})

it('includes ancestor placement changes in the affected parts', () => {
  const before = inputOf(),
    after = structuredClone(before)
  after.scene.components[0].position.x += 100
  const report = compare(before, after)
  expect(report.changes.some((c) => c.fields.some((f) => f.name === 'placement'))).toBe(true)
  expect(report.otherSourceChanges).toContain('Scene components')
})

it('rejects malformed sources and duplicate identities', () => {
  const input = inputOf()
  expect(() => compareReleaseSource('{}', captureProductionSource(input))).toThrow()
  input.scene.parts.push(input.scene.parts[0])
  expect(() => compare(input, input)).toThrow()
})

it('refuses out-of-budget cabinet parameters before calculating generated hardware', () => {
  const input = inputOf()
  const cabinet = input.scene.components.find((c) => c.kind === 'carcase')!
  if (cabinet.kind !== 'carcase') throw new Error('Missing cabinet')
  cabinet.params.width = 100001
  expect(() => compare(input, input)).toThrow(/report limit/)
})

it('compares generated cabinet hardware from the actual emitted hinge bores', () => {
  const before = { ...inputOf(), scene: manufacturingProject() }
  const after = structuredClone(before)
  const board = after.scene.parts.find(
    (p) =>
      p.kind === 'board' &&
      p.cuts.some((cut) => cut.kind === 'hole-array' && cut.id.startsWith('cups_')),
  )!
  if (board.kind !== 'board') throw new Error('Missing hinge board')
  const cup = board.cuts.find((cut) => cut.kind === 'hole-array' && cut.id.startsWith('cups_'))!
  if (cup.kind !== 'hole-array') throw new Error('Missing hinge row')
  cup.count += 1
  const hardware = compare(before, after).changes.filter((c) => c.entity === 'hardware')
  expect(hardware.length).toBeGreaterThan(0)
  expect(hardware.some((c) => c.fields.some((f) => f.name === 'qty'))).toBe(true)
  expect(hardware.some((c) => c.partIds.includes(board.id))).toBe(true)
})

it('compares effective stock definitions supplied only by the material library', () => {
  const before = inputOf()
  const name = before.scene.parts[0].material
  delete before.scene.materials[name]
  before.materialLibrary[name] = { thickness: 18, sheet: { length: 2440, width: 1220 } }
  const after = structuredClone(before)
  after.materialLibrary[name].sheet = { length: 2800, width: 1220 }
  expect(
    compare(before, after).changes.some((c) =>
      c.fields.some((f) => f.name === 'stock' && f.classification === 'manufacturing'),
    ),
  ).toBe(true)
})

it('joins inventory parts to their source records by id, not by position', () => {
  const before = inputOf(),
    after = structuredClone(before)
  after.scene.parts[0].color = '#123456'
  const expected = compare(before, after)
  expect(expected.changes.find((c) => c.id === after.scene.parts[0].id)!.fields).toContainEqual(
    expect.objectContaining({ name: 'color', after: '#123456' }),
  )
  const original = inventories.buildPacketPartInventory
  vi.spyOn(inventories, 'buildPacketPartInventory').mockImplementation((records) => {
    const inventory = original(records)
    return { ...inventory, parts: [...inventory.parts].reverse() }
  })
  expect(compare(before, after)).toEqual(expected)
})

it('refuses an inventory part that names no source part', () => {
  const input = inputOf()
  const original = inventories.buildPacketPartInventory
  vi.spyOn(inventories, 'buildPacketPartInventory').mockImplementation((records) => {
    const inventory = original(records)
    return {
      ...inventory,
      parts: [{ ...inventory.parts[0], id: 'ghost' }, ...inventory.parts.slice(1)],
    }
  })
  expect(() => compare(input, input)).toThrow(/ghost/)
})

it('refuses an inventory that omits a source part', () => {
  const input = inputOf()
  const original = inventories.buildPacketPartInventory
  vi.spyOn(inventories, 'buildPacketPartInventory').mockImplementation((records) => {
    const inventory = original(records)
    return { ...inventory, parts: inventory.parts.slice(1) }
  })
  expect(() => compare(input, input)).toThrow(/does not cover every source part/)
})
