import { describe, expect, it } from 'vitest'
import { defaultProject, moveRootToItem, reconcileProject } from './projectStructure'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import type { Scene } from './types'

const root = (id: string) => ({
  kind: 'group' as const, id, label: id, parentId: null,
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ' as const, visible: true,
})
const scene = (ids: string[]): Scene => ({
  parts: [], materials: {}, hardware: [], joints: [], components: ids.map(root),
})
const file = (s: Scene) => JSON.stringify({
  version: 20, name: 'Old project', appVersion: '0.0.0', units: 'mm',
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }, scene: s,
})

describe('project structure migration', () => {
  it('gives a legacy scene deterministic editable defaults without changing geometry', () => {
    const text = file(scene(['cabinet-a', 'cabinet-b']))
    const one = parseFile(text)
    const two = parseFile(text)
    expect(one.project).toEqual(two.project)
    expect(one.project!.areas[0].rooms[0].items[0].rootComponentIds).toEqual([
      'cabinet-a', 'cabinet-b',
    ])
    expect(one.scene).toEqual(scene(['cabinet-a', 'cabinet-b']))
    const written = JSON.stringify({ ...one, version: FILE_FORMAT_VERSION })
    expect(parseFile(written).project).toEqual(one.project)
    expect(parseFile(written).scene).toEqual(one.scene)
  })

  it('assigns a new root once, removes deleted roots and preserves a moved root', () => {
    const base = defaultProject(scene(['a']), 'fixture')
    const itemId = 'item_second'
    const withSecond = { ...base, areas: base.areas.map((area) => ({ ...area,
      rooms: area.rooms.map((room) => ({ ...room, items: [...room.items,
        { id: itemId, name: 'Pantry', rootComponentIds: [], rootPartIds: [] },
      ] })),
    })) }
    const moved = moveRootToItem(withSecond, 'a', itemId)
    const updated = reconcileProject(moved, scene(['a', 'b']))
    expect(updated.areas[0].rooms[0].items[0].rootComponentIds).toEqual(['b'])
    expect(updated.areas[0].rooms[0].items[1].rootComponentIds).toEqual(['a'])
    expect(reconcileProject(updated, scene(['a', 'b']))).toBe(updated)
    const active = reconcileProject(updated, scene(['a', 'b', 'c']), itemId)
    expect(active.areas[0].rooms[0].items[1].rootComponentIds).toEqual(['a', 'c'])
    expect(reconcileProject(updated, scene(['b'])).areas[0].rooms[0].items[1].rootComponentIds).toEqual([])
  })

  it('keeps loose parts with an item when a new cabinet is added', () => {
    const withPart = { ...scene(['a']), parts: [{ id: 'loose', parentId: null }] as Scene['parts'] }
    const project = defaultProject(withPart, 'part-fixture')
    expect(project.areas[0].rooms[0].items[0].rootPartIds).toEqual(['loose'])
    const updated = reconcileProject(project, { ...withPart, components: [...withPart.components, root('b')] })
    expect(updated.areas[0].rooms[0].items[0].rootPartIds).toEqual(['loose'])
    expect(updated.areas[0].rooms[0].items[0].rootComponentIds).toEqual(['a', 'b'])
  })

  it('rejects duplicate ownership and a malformed cutlist reference at the file boundary', () => {
    const parsed = parseFile(file(scene(['a'])))
    const item = parsed.project!.areas[0].rooms[0].items[0]
    const bad = structuredClone(parsed)
    bad.project!.areas[0].rooms[0].items.push({ ...item, id: 'other', rootComponentIds: ['a'] })
    expect(() => parseFile(JSON.stringify(bad))).toThrow(/rootComponentIds/)
    item.cutlistNumber = '12345'
    expect(() => parseFile(JSON.stringify(parsed))).toThrow(/six digits/)
  })

  it('keeps distinct item IDs when display JIDs and a cutlist reference are shared', () => {
    const parsed = parseFile(file(scene(['a', 'b'])))
    const initial = parsed.project!.areas[0].rooms[0].items[0]
    initial.name = 'Kitchen'
    initial.jid = 'J01'
    initial.cutlistNumber = '000001'
    const other = { ...initial, id: 'item_pantry', name: 'Pantry', rootComponentIds: ['b'], rootPartIds: [] }
    initial.rootComponentIds = ['a']
    parsed.project!.areas[0].rooms[0].items.push(other)
    const loaded = parseFile(JSON.stringify({ ...parsed, version: FILE_FORMAT_VERSION }))
    const [kitchen, pantry] = loaded.project!.areas[0].rooms[0].items
    expect(kitchen.id).not.toBe(pantry.id)
    expect([kitchen.jid, pantry.jid]).toEqual(['J01', 'J01'])
    expect([kitchen.cutlistNumber, pantry.cutlistNumber]).toEqual(['000001', '000001'])
    expect(kitchen.rootComponentIds).toEqual(['a'])
    expect(pantry.rootComponentIds).toEqual(['b'])
  })
})
