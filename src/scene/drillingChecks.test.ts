import { describe, expect, it } from 'vitest'
import { manufacturingChecks } from './manufacturingChecks'
import { manufacturingParts } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import { createReadinessSnapshot } from './readinessSnapshot'
import { defaultProject } from './projectStructure'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import type { BoardPart, CylinderPart, Face, HoleArrayCut } from './types'

const sceneOf = () => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board' || p.id === 'manual-round')
  scene.parts.forEach((p) => {
    p.cuts = []
  })
  return scene
}
const hole = (overrides: Partial<HoleArrayCut> = {}): HoleArrayCut => ({
  kind: 'hole-array',
  id: 'row-1',
  label: 'Shelf pins',
  face: '+Z',
  axis: 'U',
  start: { x: 20, y: 30, z: 18 },
  pitch: 32,
  count: 3,
  diameter: 5,
  depth: 12,
  sourceComponentId: 'cabinet-0',
  ...overrides,
})
const boardOf = (scene: ReturnType<typeof sceneOf>) => scene.parts[0] as BoardPart
const roundOf = (scene: ReturnType<typeof sceneOf>) => scene.parts[1] as CylinderPart
const reportOf = (scene: ReturnType<typeof sceneOf>) =>
  manufacturingChecks(manufacturingParts(scene.parts, scene.materials, scene.components))
const drillingOf = (scene: ReturnType<typeof sceneOf>) =>
  reportOf(scene).findings.filter((f) => f.code.startsWith('drilling-'))

describe('manufacturing drilling checks', () => {
  it('accepts generated drilling in the representative cabinet project', () => {
    const scene = manufacturingProject()
    expect(scene.parts.some((p) => p.cuts.some((c) => c.kind === 'hole-array'))).toBe(true)
    expect(drillingOf(scene)).toEqual([])
  })
  const faces: [Face, 'x' | 'y' | 'z', 'x' | 'y' | 'z', 'x' | 'y' | 'z'][] = [
    ['+X', 'x', 'y', 'z'],
    ['-X', 'x', 'y', 'z'],
    ['+Y', 'y', 'x', 'z'],
    ['-Y', 'y', 'x', 'z'],
    ['+Z', 'z', 'x', 'y'],
    ['-Z', 'z', 'x', 'y'],
  ]
  it.each(faces)(
    'checks both row axes on %s without rejecting through holes',
    (face, normal, u, v) => {
      const scene = sceneOf()
      const p = boardOf(scene)
      const dims = { x: p.length, y: p.width, z: p.thickness }
      for (const axis of ['U', 'V'] as const) {
        const run = axis === 'U' ? u : v
        const across = axis === 'U' ? v : u
        const start = { x: 0, y: 0, z: 0 }
        start[normal] = face.startsWith('+') ? dims[normal] : 0
        start[run] = 2.5 // Tangency is valid; radius must be included at both row ends.
        start[across] = dims[across] / 2
        for (const depth of [1, dims[normal], dims[normal] + 100]) {
          p.cuts = [hole({ face, axis, start, count: 2, pitch: dims[run] - 5, depth })]
          expect(drillingOf(scene)).toEqual([])
        }
        const cut = p.cuts[0] as HoleArrayCut
        cut.pitch += 0.01
        expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-bounds'])
        cut.pitch -= 0.01
        cut.start[across] = 2.49
        expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-bounds'])
        cut.start[across] = dims[across] / 2
        cut.start[normal] += face.startsWith('+') ? -0.1 : 0.1
        expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-position'])
      }
    },
  )

  it.each([0, -1, NaN, Infinity, -Infinity])(
    'rejects nonpositive/nonfinite drilling sizes: %s',
    (value) => {
      for (const field of ['diameter', 'depth'] as const) {
        const scene = sceneOf()
        boardOf(scene).cuts = [hole({ [field]: value })]
        roundOf(scene).cuts = [
          {
            kind: 'bore-axial',
            id: 'axial',
            label: 'Axial',
            end: '-Z',
            diameter: 3,
            depth: 50,
            [field]: value,
          },
          {
            kind: 'bore-transverse',
            id: 'cross',
            label: 'Cross',
            position: 40,
            azimuth: 0,
            diameter: 3,
            depth: 4,
            [field]: value,
          },
        ]
        expect(drillingOf(scene).map((f) => f.code)).toEqual(Array(3).fill('drilling-size'))
        expect(drillingOf(scene).map((f) => f.operation?.id)).toEqual(['row-1', 'axial', 'cross'])
      }
    },
  )

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid array counts: %s',
    (count) => {
      const scene = sceneOf()
      boardOf(scene).cuts = [hole({ count })]
      expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-array'])
    },
  )
  it.each([0, -32, NaN, Infinity])('rejects invalid multi-hole pitch: %s', (pitch) => {
    const scene = sceneOf()
    boardOf(scene).cuts = [hole({ pitch })]
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-array'])
  })
  it('accepts a single hole with zero pitch and validates huge rows without enumerating them', () => {
    const scene = sceneOf()
    boardOf(scene).cuts = [hole({ count: 1, pitch: 0 })]
    expect(drillingOf(scene)).toEqual([])
    boardOf(scene).cuts = [hole({ count: Number.MAX_SAFE_INTEGER, pitch: Number.MAX_VALUE })]
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-bounds'])
  })
  it.each(['x', 'y', 'z'] as const)('rejects nonfinite entry coordinate %s', (axis) => {
    const scene = sceneOf()
    const cut = hole()
    cut.start[axis] = NaN
    boardOf(scene).cuts = [cut]
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-position'])
  })
  it('retains boundary tolerance and board-local coordinates independently of grain, banding and placement', () => {
    const scene = sceneOf()
    const p = boardOf(scene)
    p.cuts = [hole({ count: 1, pitch: 0, start: { x: 2.5, y: 30, z: 18 + 1e-7 } })]
    expect(drillingOf(scene)).toEqual([])
    p.grain = 'length'
    p.visible = false
    p.position.x = 1000
    p.rotation.z = 90
    scene.materials.Tape.costPerM = 99
    expect(drillingOf(scene)).toEqual([])
    ;(p.cuts[0] as HoleArrayCut).start.x = 2.49
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-bounds'])
  })
  it('keeps invalid stock and unsupported definitions explicitly unassessed', () => {
    const scene = sceneOf()
    boardOf(scene).cuts = [hole()]
    boardOf(scene).width = NaN
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-unassessed'])
    boardOf(scene).width = 720
    boardOf(scene).cuts = [hole({ face: 'invalid' as Face })]
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-unassessed'])
    boardOf(scene).cuts = [hole({ axis: 'invalid' as 'U' })]
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-unassessed'])
    expect(reportOf(scene).unassessed).toEqual(
      expect.arrayContaining([
        'Manual machining geometry',
        'Drilling intersections with other cuts',
        'Machine operation compatibility',
      ]),
    )
  })
  it('accepts blind and through axial bores from either cap, but rejects bores consuming the full stock diameter', () => {
    const scene = sceneOf()
    const p = roundOf(scene)
    for (const end of ['+Z', '-Z'] as const) {
      for (const depth of [20, p.length, p.length * 2]) {
        p.cuts = [{ kind: 'bore-axial', id: 'axial', label: 'Axial', end, diameter: 3, depth }]
        expect(drillingOf(scene)).toEqual([])
      }
    }
    for (const diameter of [p.diameter, p.diameter + 1]) {
      p.cuts = [{ kind: 'bore-axial', id: 'axial', label: 'Axial', end: '+Z', diameter, depth: 20 }]
      expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-bounds'])
    }
  })
  it('checks transverse bore end margins and finite azimuth without rejecting through depths or wrapped angles', () => {
    const scene = sceneOf()
    const p = roundOf(scene)
    const cut = {
      kind: 'bore-transverse' as const,
      id: 'cross',
      label: 'Cross',
      position: 2,
      azimuth: 720,
      diameter: 4,
      depth: 2,
    }
    p.cuts = [cut]
    for (const depth of [2, p.diameter, p.diameter * 2]) {
      cut.depth = depth
      for (const position of [2, p.length - 2]) {
        cut.position = position
        expect(drillingOf(scene)).toEqual([])
      }
    }
    for (const position of [-1, 1.99, p.length - 1.99, p.length + 1]) {
      cut.position = position
      expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-bounds'])
    }
    cut.position = Infinity
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-position'])
    cut.position = 40
    for (const diameter of [p.diameter, p.diameter + 1]) {
      cut.diameter = diameter
      expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-bounds'])
    }
    cut.diameter = 4
    cut.azimuth = NaN
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-position'])
    cut.azimuth = 0
    p.length = 0
    expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-unassessed'])
  })
  it('captures part, cut and owner IDs, preserves save/reopen and detaches findings from subsequent edits', () => {
    const scene = sceneOf()
    const p = boardOf(scene)
    p.parentId = 'cabinet-0'
    p.cuts = [
      hole({
        start: { x: 20, y: 1, z: 18 },
        sourceComponentId: undefined,
        sourceJointId: 'screw-joint',
      }),
    ]
    const before = structuredClone(scene)
    const snapshot = createReadinessSnapshot(scene, 'Drilling')
    expect(scene).toEqual(before)
    const finding = snapshot.manufacturing.findings.find((f) => f.code === 'drilling-bounds')!
    expect(finding.targets).toEqual([
      { id: p.id, label: p.label, cabinetId: 'cabinet-0', parentId: 'cabinet-0' },
    ])
    expect(finding.operation).toEqual({
      id: 'row-1',
      label: 'Shelf pins',
      kind: 'hole-array',
      sourceComponentId: null,
      sourceJointId: 'screw-joint',
    })
    const parsed = parseFile(
      JSON.stringify({
        version: FILE_FORMAT_VERSION,
        name: 'Drilling',
        appVersion: '0',
        units: 'mm',
        createdAt: '',
        updatedAt: '',
        camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
        project: defaultProject(scene, 'drilling'),
        scene,
      }),
    )
    expect(parsed).not.toBeNull()
    expect(reportOf(parsed!.scene)).toEqual(snapshot.manufacturing)
    p.cuts[0].id = 'later-cut'
    p.label = 'Later panel'
    expect(finding.operation?.id).toBe('row-1')
    expect(finding.targets[0].label).toBe('Manual panel')
  })
})
