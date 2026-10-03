import { describe, expect, it } from 'vitest'
import golden from './__fixtures__/manufacturingNest.json'
import { shapeKey } from './utils'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingLabels } from './manufacturingLabels'
import { groupNestRecords, jobSignature } from './useNest'
import { cutPartOf } from './edgeBanding'
import { componentsById } from './componentTree'
import { occupancyMask, maskArea } from '../nest/mask'
import { allowedRotations } from '../nest/nest'
import { groupPartsFromRecords } from '../ui/buildCsv'
import { applyPipeline } from './pipeline'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { defaultProject } from './projectStructure'
import type { BoardPart, CarcaseComponent, Scene } from './types'

const recordsOf = (s: Scene) => manufacturingParts(s.parts, s.materials, s.components)
const boardOf = (s: Scene) => s.parts.find((p) => p.id === 'manual-board') as BoardPart
const recordOf = (s: Scene) =>
  recordsOf(s).find((p) => p.id === 'manual-board') as ManufacturingBoard
const signature = (s: Scene) => jobSignature(groupNestRecords(recordsOf(s)), 14)

describe('shared manufacturing nesting and label facts', () => {
  it('matches frozen merged-main nesting dimensions, cuts and grain byte-for-byte', () => {
    const groups = groupNestRecords(recordsOf(manufacturingProject()))
    const facts = groups.map((g) => ({
      material: g.material,
      sheet: g.def.sheet,
      hasGrain: g.def.hasGrain ?? true,
      parts: g.parts.map((p) => ({ shape: shapeKey(p), grain: p.grain })),
    }))
    expect(facts).toEqual(golden)
  })
  it('preserves legacy valid local footprints across the four-cabinet project', () => {
    const scene = manufacturingProject()
    const records = recordsOf(scene)
    const inputs = groupNestRecords(records).flatMap((g) => g.parts)
    const byId = componentsById(scene.components)
    const boards = scene.parts.filter(
      (p): p is BoardPart =>
        p.kind === 'board' &&
        (scene.materials[p.material]?.sheet?.length ?? 0) > 0 &&
        (scene.materials[p.material]?.sheet?.width ?? 0) > 0,
    )
    expect(inputs).toHaveLength(32)
    expect(boards).toHaveLength(32)
    for (const p of boards) {
      const legacy = cutPartOf(p, byId, scene.materials)
      expect(inputs.find((n) => n.id === p.id)).toEqual({
        kind: 'board',
        id: p.id,
        length: legacy.length,
        width: legacy.width,
        thickness: legacy.thickness,
        grain: p.grain,
        cuts: legacy.cuts,
      })
    }
    expect(inputs.some((p) => p.id === 'manual-round')).toBe(false)
  })

  it('shifts a through notch once into the local cut origin and retains original machining', () => {
    const scene = manufacturingProject()
    const p = boardOf(scene)
    p.length = 100
    p.width = 80
    p.edgeBanding = { x0: 'Tape', y0: 'Tape' }
    p.cuts = [
      {
        kind: 'box',
        face: '+Z',
        id: 'notch',
        label: 'Notch',
        position: { x: 0, y: 0, z: -1 },
        size: { x: 12, y: 22, z: 20 },
      },
    ]
    const source = JSON.stringify(scene)
    const r = recordOf(scene)
    expect(r.nesting.length).toBe(98)
    expect(r.nesting.width).toBe(78)
    expect(r.nesting.cuts[0]).toMatchObject({ position: { x: -2, y: -2, z: -1 } })
    expect(r.cuts[0]).toMatchObject({ position: { x: 0, y: 0, z: -1 } })
    expect(maskArea(occupancyMask(r.nesting, 0))).toBe(98 * 78 - 10 * 20)
    expect(r.cut).toEqual({ length: 78, width: 98, thickness: 18 })
    expect(allowedRotations(r.grain, r.stock.hasGrain)).toEqual([90, 270])
    r.nesting.cuts.length = 0
    expect(JSON.stringify(scene)).toBe(source)
    expect(r.cuts).toHaveLength(1)
  })

  it('excludes impossible or unknown band sizes and restores eligibility after repair', () => {
    const scene = manufacturingProject()
    delete scene.materials.Tape.thickness
    const groups = groupNestRecords(recordsOf(scene))
    const excluded = groups.flatMap((g) => g.excluded)
    expect(excluded.find((p) => p.id === 'manual-board')?.problem).toBe(
      'edge material "Tape" has no thickness',
    )
    expect(groups.flatMap((g) => g.parts).some((p) => p.id === 'manual-board')).toBe(false)
    scene.materials.Tape.thickness = 600
    expect(
      groupNestRecords(recordsOf(scene))
        .flatMap((g) => g.excluded)
        .find((p) => p.id === 'manual-board')?.problem,
    ).toBe('cut size is zero or negative')
    scene.materials.Tape.thickness = 2
    expect(
      groupNestRecords(recordsOf(scene))
        .flatMap((g) => g.parts)
        .some((p) => p.id === 'manual-board'),
    ).toBe(true)
  })

  it('keeps missing and incomplete sheet stock absent and uses conservative grain defaults', () => {
    const scene = manufacturingProject()
    delete scene.materials['18mm Ply'].sheet
    expect(groupNestRecords(recordsOf(scene)).some((g) => g.material === '18mm Ply')).toBe(false)
    scene.materials['18mm Ply'].sheet = { length: 2440, width: 0 }
    expect(groupNestRecords(recordsOf(scene)).some((g) => g.material === '18mm Ply')).toBe(false)
    delete scene.materials['18mm Ply']
    expect(groupNestRecords(recordsOf(scene)).some((g) => g.material === '18mm Ply')).toBe(false)
    scene.materials['18mm Ply'] = { sheet: { length: 2440, width: 1220 } }
    expect(
      groupNestRecords(recordsOf(scene)).find((g) => g.material === '18mm Ply')?.def.hasGrain,
    ).toBe(true)
  })

  it.each([NaN, Infinity, -Infinity, -1, 0])(
    'rejects malformed library sheet stock (%s) before masking',
    (value) => {
      const scene = manufacturingProject()
      for (const axis of ['length', 'width'] as const) {
        scene.materials['18mm Ply'].sheet = { length: 2440, width: 1220, [axis]: value }
        expect(groupNestRecords(recordsOf(scene)).some((g) => g.material === '18mm Ply')).toBe(
          false,
        )
      }
    },
  )

  it('refreshes labels without invalidating a nest for rates, placement or manual instructions', () => {
    const scene = manufacturingProject()
    const before = signature(scene)
    const p = boardOf(scene)
    p.label = 'Renamed panel'
    p.position.x += 100
    p.operations![0].instruction = 'Use another jig'
    scene.materials['18mm Ply'].costPerM2 = 999
    scene.materials['18mm Ply'].sheet!.costPerSheet = 123
    scene.components[0].position.z += 500
    expect(signature(scene)).toBe(before)
    expect(manufacturingLabels(recordsOf(scene)).get(p.id)?.text).toBe('Renamed panel')
    const cases: ((s: Scene) => void)[] = [
      (s) => {
        boardOf(s).length += 1
      },
      (s) => {
        boardOf(s).grain = 'free'
      },
      (s) => {
        s.materials.Tape.thickness = 3
      },
      (s) => {
        boardOf(s).edgeBanding = { x1: 'Tape', y1: 'Tape' }
        boardOf(s).cuts = [
          {
            kind: 'box',
            face: '+Z',
            id: 'notch',
            label: '',
            position: { x: 0, y: 0, z: 0 },
            size: { x: 10, y: 10, z: 18 },
          },
        ]
      },
      (s) => {
        s.materials['18mm Ply'].hasGrain = false
      },
      (s) => {
        s.materials['18mm Ply'].sheet!.width += 1
      },
      (s) => {
        boardOf(s).material = '12mm MDF'
      },
    ]
    for (const change of cases) {
      const next = structuredClone(scene)
      change(next)
      expect(signature(next)).not.toBe(before)
    }
  })

  it('retains separate identities for duplicate labels under nested cabinet ownership', () => {
    const scene = manufacturingProject()
    const p = boardOf(scene)
    const cabinet = scene.components[0]
    p.label = 'Side'
    p.parentId = 'inner'
    scene.components.push({
      kind: 'group',
      id: 'inner',
      label: 'Inner',
      parentId: cabinet.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
    })
    scene.parts.push({ ...structuredClone(p), id: 'other-side', parentId: scene.components[1].id })
    const labels = manufacturingLabels(recordsOf(scene))
    expect(labels.get(p.id)).toMatchObject({ id: p.id, text: 'Side', cabinetId: cabinet.id })
    expect(labels.get('other-side')).toMatchObject({
      text: 'Side',
      cabinetId: scene.components[1].id,
    })
    expect(labels.get(p.id)?.detail).toContain(`Part ID ${p.id}`)
    expect(labels.get(p.id)?.detail).toContain('Finished 720 × 560 × 18 mm; Cut 718 × 558 × 18 mm')
    expect(labels.get('manual-round')?.detail).toContain('Round stock 8 × 500 mm')
    const row = groupPartsFromRecords(recordsOf(scene), scene.materials).find((r) =>
      r.members.some((m) => m.id === p.id),
    )!
    expect(labels.get(p.id)?.detail).toContain(
      `Cut ${row.length} × ${row.width} × ${row.thickness} mm`,
    )
  })

  it('preserves label and nesting identities through save/reopen and regeneration', () => {
    const scene = manufacturingProject()
    const loaded = parseFile(
      JSON.stringify({
        version: FILE_FORMAT_VERSION,
        name: 'Shared outputs',
        appVersion: '0',
        units: 'mm',
        createdAt: '',
        updatedAt: '',
        camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
        scene,
        project: defaultProject(scene, 'synthetic'),
      }),
    ).scene
    expect(signature(loaded)).toBe(signature(scene))
    expect(manufacturingLabels(recordsOf(loaded))).toEqual(manufacturingLabels(recordsOf(scene)))
    const before = recordsOf(loaded)
    const c = loaded.components[0] as CarcaseComponent
    c.params.width = 650
    c.catalogue!.overrides.width = 650
    const next = applyPipeline(loaded)
    const after = recordsOf(next)
    expect(after.map((p) => p.id).sort()).toEqual(before.map((p) => p.id).sort())
    expect(signature(next)).not.toBe(signature(scene))
    expect([...manufacturingLabels(after).keys()].sort()).toEqual(before.map((p) => p.id).sort())
  })
})
