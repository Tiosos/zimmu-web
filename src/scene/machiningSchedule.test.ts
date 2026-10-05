import { describe, expect, it } from 'vitest'
import { buildMachiningSchedule, machiningScheduleJson } from './machiningSchedule'
import { manufacturingParts } from './manufacturingPart'
import { machiningProject } from './__fixtures__/machiningProject'
import { buildDrawingSheets } from '../geom/drawing'
import { defaultProject } from './projectStructure'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import type { BoardPart, CylinderPart, Face, HoleArrayCut } from './types'

const scheduleOf = (scene = machiningProject()) =>
  buildMachiningSchedule(manufacturingParts(scene.parts, scene.materials, scene.components))

describe('shared machining schedule', () => {
  it('retains every geometric cut and separate manual instruction with part-scoped identity and provenance', () => {
    const scene = machiningProject()
    const schedule = scheduleOf(scene)
    expect(schedule.counts).toEqual({
      parts: 2,
      entries: 8,
      geometricDrilling: 3,
      geometricCuts: 4,
      manualInstructions: 1,
    })
    expect(schedule.entries.map((e) => [e.category, e.operation.kind])).toEqual([
      ['geometric-cut', 'box'],
      ['geometric-cut', 'mitre'],
      ['geometric-drilling', 'hole-array'],
      ['manual-instruction', 'manual-machining'],
      ['geometric-cut', 'end'],
      ['geometric-cut', 'notch'],
      ['geometric-drilling', 'bore-axial'],
      ['geometric-drilling', 'bore-transverse'],
    ])
    const row = schedule.entries.find((e) => e.operation.id === 'row')!
    expect(row).toMatchObject({
      sourceJointId: 'screw-owner',
      sourceComponentId: null,
      part: {
        id: 'manual-board',
        material: '18mm Ply',
        dimensions: { length: 560, width: 720, thickness: 18 },
        provenance: {
          cabinetId: 'cabinet-0',
          parentId: 'cabinet-0',
          cabinetLabel: scene.components[0].label,
        },
      },
    })
    const manual = schedule.entries.find((e) => e.category === 'manual-instruction')!
    expect(manual.operation).toEqual((scene.parts[0] as BoardPart).operations![0])
    expect(manual.sourceComponentId).toBe('jig-owner')
    expect(manual).not.toHaveProperty('depthMode')
    expect(schedule.coordinateFrame).toBe('part-local')
    expect(schedule.unassessed).toContain('Machine compatibility and tool access')
  })
  it.each([
    ['+X', 560],
    ['-X', 560],
    ['+Y', 720],
    ['-Y', 720],
    ['+Z', 18],
    ['-Z', 18],
  ] as [Face, number][])(
    'classifies blind and through depths along board face %s',
    (face, extent) => {
      const scene = machiningProject()
      const p = scene.parts[0] as BoardPart
      const normal = face.endsWith('X') ? 'x' : face.endsWith('Y') ? 'y' : 'z'
      const start = { x: 40, y: 40, z: 9 }
      start[normal] = face.startsWith('+') ? extent : 0
      for (const [depth, mode] of [
        [extent - 1, 'blind'],
        [extent, 'through'],
        [extent + 1, 'through'],
      ] as const) {
        p.cuts = [
          {
            kind: 'hole-array',
            id: 'row',
            label: 'Row',
            face,
            axis: 'U',
            start,
            count: 1,
            pitch: 0,
            diameter: 3,
            depth,
          },
        ]
        expect(scheduleOf(scene).entries.find((e) => e.operation.id === 'row')).toMatchObject({
          depthMode: mode,
        })
      }
    },
  )
  it('uses length for axial bores and stock diameter for transverse through bores', () => {
    const scene = machiningProject()
    const p = scene.parts[1] as CylinderPart
    for (const cut of p.cuts) {
      if (cut.kind !== 'bore-axial' && cut.kind !== 'bore-transverse') continue
      const extent = cut.kind === 'bore-axial' ? p.length : p.diameter
      for (const [depth, mode] of [
        [extent - 1, 'blind'],
        [extent, 'through'],
        [extent + 1, 'through'],
      ] as const) {
        cut.depth = depth
        expect(scheduleOf(scene).entries.find((e) => e.operation.id === cut.id)).toMatchObject({
          depthMode: mode,
        })
      }
    }
  })
  it('retains invalid drilling definitions with an unassessed depth mode and explicit nonfinite JSON numbers', () => {
    const scene = machiningProject()
    const row = (scene.parts[0] as BoardPart).cuts[2] as HoleArrayCut
    row.depth = Infinity
    row.start.x = NaN
    const schedule = scheduleOf(scene)
    expect(schedule.entries.find((e) => e.operation.id === 'row')).toMatchObject({
      depthMode: 'unassessed',
    })
    const saved = JSON.parse(machiningScheduleJson(schedule))
    expect(
      saved.entries.find((e: { operation: { id: string } }) => e.operation.id === 'row').operation,
    ).toMatchObject({ depth: 'Infinity', start: { x: 'NaN' } })
    row.depth = 18
    row.start.x = 1
    expect(scheduleOf(scene).entries.find((e) => e.operation.id === 'row')).toMatchObject({
      depthMode: 'unassessed',
    })
  })
  it('preserves IDs across different parts and keeps schedule entries detached from records and each other', () => {
    const scene = machiningProject()
    const p = scene.parts[0] as BoardPart
    const copy = structuredClone(p)
    copy.id = 'other-board'
    copy.parentId = null
    scene.parts.push(copy)
    const records = manufacturingParts(scene.parts, scene.materials, scene.components)
    const before = structuredClone(records)
    const schedule = buildMachiningSchedule(records)
    expect(records).toEqual(before)
    expect(schedule.entries.filter((e) => e.operation.id === 'row').map((e) => e.part.id)).toEqual([
      'manual-board',
      'other-board',
    ])
    const row = schedule.entries.find((e) => e.operation.id === 'row')!
    row.part.provenance.parentId = 'changed'
    row.operation.label = 'Changed row'
    expect(records).toEqual(before)
    expect(schedule.entries[0].part.provenance.parentId).toBe('cabinet-0')
    p.position.x += 1000
    p.rotation.z = 90
    p.visible = true
    scene.materials[p.material].costPerM2 = 99
    expect(scheduleOf(scene)).toEqual(buildMachiningSchedule(before))
  })
  it('matches drilling annotations and manual shop notes without turning instructions into geometry', () => {
    const scene = machiningProject()
    const p = scene.parts[0] as BoardPart
    p.cuts = [p.cuts[2]]
    const row = p.cuts[0] as HoleArrayCut
    for (const depth of [12, 18, 25]) {
      row.depth = depth
      const entry = scheduleOf(scene).entries.find((e) => e.operation.id === 'row')!
      const sheet = buildDrawingSheets([p], 'Machining').find((s) => s.kind === 'part')!
      if (sheet.kind !== 'part' || sheet.shape !== 'board') throw new Error('Expected board sheet')
      const circles = sheet.views.flatMap((v) => v.circles)
      expect(circles).toHaveLength(row.count)
      expect(
        circles.every(
          (c) =>
            c.dashed === (entry.category === 'geometric-drilling' && entry.depthMode === 'blind'),
        ),
      ).toBe(true)
      expect(sheet.cutCount).toBe(1)
      expect(sheet.manufacturingNotes.join('\n')).toContain(p.operations![0].instruction)
    }
  })
  it('is stable through save/reopen and emits an explicit empty schedule', () => {
    const scene = machiningProject()
    const parsed = parseFile(
      JSON.stringify({
        version: FILE_FORMAT_VERSION,
        name: 'Machining',
        appVersion: '0',
        units: 'mm',
        createdAt: '',
        updatedAt: '',
        camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
        project: defaultProject(scene, 'machining'),
        scene,
      }),
    )
    expect(parsed).not.toBeNull()
    expect(scheduleOf(parsed!.scene)).toEqual(scheduleOf(scene))
    const empty = buildMachiningSchedule([])
    expect(empty.counts).toEqual({
      parts: 0,
      entries: 0,
      geometricDrilling: 0,
      geometricCuts: 0,
      manualInstructions: 0,
    })
    expect(empty.entries).toEqual([])
  })
})
