import { describe, expect, it } from 'vitest'
import { buildShelfReadiness, MAX_READINESS_SHELVES } from './shelfReadiness'
import { cabinet, partsOfCarcase } from '../geom/__fixtures__/cabinetSheet'
import { DEFAULT_FRAME, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseParams, Scene } from './types'

const sceneOf = (params: CarcaseParams = cabinet.params): Scene => ({
  components: [{ ...cabinet, params }],
  parts: partsOfCarcase(params),
  materials: PRESET_MATERIALS,
  hardware: [],
  joints: [],
})
const pair = (): CarcaseParams => ({
  ...cabinet.params,
  frame: { ...DEFAULT_FRAME, pairStile: true },
  section: { ...cabinet.params.section, front: { kind: 'door', leaves: 2, hinge: 'left' } },
})

describe('shelf readiness report', () => {
  const withCount = (shelves: number): CarcaseParams => ({
    ...cabinet.params,
    section: {
      ...cabinet.params.section,
      interior: {
        ...cabinet.params.section.interior!,
        adjustable: { ...cabinet.params.section.interior!.adjustable, shelves },
      },
    },
  })

  it.each([MAX_READINESS_SHELVES + 1, 1e12])(
    'safely skips an excessive request of %s without changing the scene',
    (count) => {
      const scene = sceneOf(withCount(count))
      const before = JSON.stringify(scene)
      const report = buildShelfReadiness(scene)[0]
      expect(report.requested).toBe(count)
      expect(report.generated).toBe(
        scene.parts.filter((p) => p.role?.startsWith('adj-shelf-')).length,
      )
      expect(report.shelves).toEqual([])
      expect([report.missing, report.angled, report.unverified]).toEqual([null, null, null])
      expect(report.issues.join(' ')).toContain('report limit')
      expect(JSON.stringify(scene)).toBe(before)
    },
  )

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'reports an invalid quantity %s rather than silently treating it as zero',
    (count) => {
      const scene = sceneOf()
      scene.components = [{ ...cabinet, params: withCount(count) }]
      const report = buildShelfReadiness(scene)[0]
      expect(report.requested).toBeNull()
      expect(report.missing).toBeNull()
      expect(report.shelves).toEqual([])
      expect(report.issues.join(' ')).toContain('safe integers')
    },
  )

  it('assesses the boundary and recovers normally after correcting an excessive quantity', () => {
    const report = buildShelfReadiness(sceneOf(withCount(MAX_READINESS_SHELVES)))[0]
    expect(report.shelves).toHaveLength(MAX_READINESS_SHELVES)
    expect(report.issues).toEqual([])
    const scene = sceneOf(withCount(1e12))
    scene.components.push({ ...cabinet, id: 'healthy' })
    expect(buildShelfReadiness(scene)[1].shelves[0].status).toBe('straight')
    scene.components[0] = cabinet
    expect(buildShelfReadiness(scene)[0].shelves).toHaveLength(1)
  })

  it('applies the budget to the whole cabinet, not each leaf, and handles total overflow', () => {
    for (const count of [600, Number.MAX_SAFE_INTEGER]) {
      const scene = sceneOf()
      const leaf = withCount(count).section
      scene.components = [
        {
          ...cabinet,
          params: {
            ...cabinet.params,
            section: {
              id: 'root',
              size: { kind: 'equal' },
              content: {
                kind: 'split',
                axis: 'vertical',
                division: 'panel',
                children: [
                  { ...leaf, id: 'a' },
                  { ...leaf, id: 'b' },
                ],
              },
            },
          },
        },
      ]
      const report = buildShelfReadiness(scene)[0]
      expect(report.shelves).toEqual([])
      expect(report.missing).toBeNull()
      expect(report.requested).toBe(count === 600 ? 1200 : null)
    }
  })

  it('counts actual scene boards and identifies straight, angled and declined shelves', () => {
    const straight = buildShelfReadiness(sceneOf())[0]
    expect([
      straight.requested,
      straight.generated,
      straight.missing,
      straight.angled,
      straight.unverified,
    ]).toEqual([1, 1, 0, 0, 0])
    expect(straight.shelves[0].status).toBe('straight')
    const angled = buildShelfReadiness(sceneOf(pair()))[0]
    expect([angled.generated, angled.angled]).toEqual([1, 1])
    const blocked = buildShelfReadiness(sceneOf({ ...pair(), height: 300 }))[0]
    expect([blocked.requested, blocked.generated, blocked.missing, blocked.unverified]).toEqual([
      1, 0, 1, 1,
    ])
    expect(blocked.shelves[0].access?.path).toBeNull()
  })

  it('retains requests that never receive a pin position rather than counting only solver results', () => {
    const section = cabinet.params.section
    const params = {
      ...cabinet.params,
      section: {
        ...section,
        interior: {
          ...section.interior!,
          adjustable: { ...section.interior!.adjustable, shelves: 3, count: 0 },
        },
      },
    }
    const report = buildShelfReadiness(sceneOf(params))[0]
    expect([report.requested, report.generated, report.missing]).toEqual([3, 0, 3])
    expect(report.shelves.every((s) => s.status === 'unplaced' && s.access === undefined)).toBe(
      true,
    )
  })

  it('detects a missing board even when its path is verified; does not mutate the scene', () => {
    const scene = sceneOf()
    scene.parts = scene.parts.filter((p) => !p.role?.startsWith('adj-shelf-'))
    const before = JSON.stringify(scene)
    const report = buildShelfReadiness(scene)[0]
    expect([report.generated, report.missing]).toEqual([0, 1])
    expect(report.shelves[0].status).toBe('straight')
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('includes hidden cabinets and keeps repeated section roles scoped to their owning cabinet', () => {
    const scene = sceneOf()
    scene.components.push({ ...cabinet, id: 'cmp_second', visible: false })
    const report = buildShelfReadiness(scene)
    expect(report).toHaveLength(2)
    expect(report.map((r) => r.generated)).toEqual([1, 0])
    expect(report.map((r) => r.requested)).toEqual([1, 1])
  })

  it('reports invalid geometry and duplicates without claiming they have verified access', () => {
    const scene = sceneOf()
    const shelf = scene.parts.find((p) => p.role?.startsWith('adj-shelf-'))!
    scene.parts.push({ ...shelf, id: 'duplicate' })
    expect(buildShelfReadiness(scene)[0].issues.join(' ')).toContain('duplicate')
    scene.materials = {}
    const invalid = buildShelfReadiness(scene)[0]
    expect(invalid.issues.length).toBeGreaterThan(0)
    expect(invalid.shelves[0].status).toBe('unassessed')
    expect(invalid.shelves[0].access).toBeUndefined()
  })

  it('reassesses geometry and role thickness overrides each time and handles an empty project', () => {
    const scene = sceneOf()
    const shelf = scene.parts.find((p) => p.role?.startsWith('adj-shelf-'))!
    if (shelf.kind !== 'board') throw new Error('expected shelf')
    shelf.overrides = { thickness: 25 }
    const box = buildShelfReadiness(scene)[0].shelves[0].access!.shelfBox
    expect(box.z1 - box.z0).toBe(25)
    scene.components = []
    expect(buildShelfReadiness(scene)).toEqual([])
  })
})
