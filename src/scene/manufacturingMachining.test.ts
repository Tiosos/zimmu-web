import { describe, expect, it } from 'vitest'
import { manufacturingMachining } from './manufacturingMachining'
import { manufacturingParts } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import { faceAxes } from './snapMath'
import { deriveScrewJoint } from '../geom/screw'
import { defaultScrewJoint } from './defaultJoint'
import { componentsById } from './componentTree'
import { stepVector } from '../geom/occt'
import { createReadinessSnapshot } from './readinessSnapshot'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { defaultProject } from './projectStructure'
import type { BoardPart, Face, HoleArrayCut } from './types'

const sceneOf = () => {
  const scene = manufacturingProject()
  const p = scene.parts.find((p) => p.id === 'manual-board') as BoardPart
  p.operations = []
  p.edgeBanding = {}
  p.cuts = []
  scene.parts = [p]
  return scene
}
const boardOf = (scene: ReturnType<typeof sceneOf>) => scene.parts[0] as BoardPart
const hole = (changes: Partial<HoleArrayCut> = {}): HoleArrayCut => ({
  kind: 'hole-array',
  id: 'row-1',
  label: 'Row',
  face: '+Z',
  axis: 'U',
  start: { x: 20, y: 20, z: 18 },
  pitch: 32,
  count: 3,
  diameter: 5,
  depth: 12,
  ...changes,
})
const report = (scene: ReturnType<typeof sceneOf>) =>
  manufacturingMachining(manufacturingParts(scene.parts, scene.materials, scene.components))
const check = (changes: Partial<HoleArrayCut> = {}) => {
  const s = sceneOf()
  boardOf(s).cuts = [hole(changes)]
  return report(s)
}

describe('shared-record drilling assessment', () => {
  for (const face of ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as Face[])
    for (const axis of ['U', 'V'] as const) {
      it(`matches kernel row axes and accepts boundary/through drilling on ${face}/${axis}`, () => {
        const s = sceneOf(),
          p = boardOf(s),
          axes = faceAxes(face)
        const dims = { x: p.length, y: p.width, z: p.thickness }
        const start = { x: 10, y: 10, z: 10 }
        start[axes.depth] = face.startsWith('+') ? dims[axes.depth] : 0
        const row = axis === 'U' ? axes.u : axes.v
        start[row] = 4
        const h = hole({
          face,
          axis,
          start,
          pitch: 4,
          count: 2,
          diameter: 2,
          depth: dims[axes.depth] + 100,
        })
        expect(stepVector(face, axis, h.pitch)[row]).toBe(4)
        p.cuts = [h]
        expect(report(s).findings).toEqual([])
        h.start[row] = dims[row] - 3
        expect(report(s).findings[0]?.code).toBe('drilling-bounds')
        h.pitch = -4
        expect(report(s).findings).toEqual([])
        h.start[axes.depth] += 1
        expect(report(s).findings[0]?.code).toBe('drilling-entry')
      })
    }
  it('allows one hole at zero pitch and exact tangencies without grain/banding/placement changes', () => {
    const s = sceneOf(),
      p = boardOf(s)
    p.cuts = [hole({ count: 1, pitch: 0, start: { x: 2.5, y: 2.5, z: 18 } })]
    const before = report(s)
    expect(before.boardHoleArrays).toBe(1)
    expect(before.findings).toEqual([])
    p.grain = 'free'
    p.edgeBanding = { x0: 'Tape' }
    p.visible = false
    p.position.x += 3000
    expect(report(s)).toEqual(before)
    const h = p.cuts[0] as HoleArrayCut
    h.start.y = 2
    expect(report(s).findings[0]?.code).toBe('drilling-bounds')
  })
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid counts without iterating holes: %s',
    (count) => {
      expect(check({ count }).findings[0]?.code).toBe('drilling-parameters')
    },
  )
  it.each([0, -1, NaN, Infinity])('rejects invalid diameter/depth: %s', (value) => {
    expect(check({ diameter: value }).findings[0]?.code).toBe('drilling-parameters')
    expect(check({ depth: value }).findings[0]?.code).toBe('drilling-parameters')
  })
  it('rejects legacy invalid face/row enums instead of silently treating them as Z/V', () => {
    expect(check({ face: 'invalid' as Face }).findings[0]?.code).toBe('drilling-parameters')
    expect(check({ axis: 'invalid' as HoleArrayCut['axis'] }).findings[0]?.code).toBe(
      'drilling-parameters',
    )
  })
  it('rejects nonfinite coordinates, degenerate spacing and overflowing or outlying endpoints in constant time', () => {
    expect(check({ start: { x: NaN, y: 20, z: 18 } }).findings[0]?.code).toBe('drilling-parameters')
    expect(check({ pitch: Infinity }).findings[0]?.code).toBe('drilling-parameters')
    expect(check({ pitch: 0 }).findings[0]?.code).toBe('drilling-parameters')
    expect(
      check({ count: Number.MAX_SAFE_INTEGER, pitch: Number.MAX_VALUE }).findings[0]?.message,
    ).toContain('overflows')
    expect(check({ count: Number.MAX_SAFE_INTEGER, pitch: 1 }).findings[0]?.code).toBe(
      'drilling-bounds',
    )
    expect(check({ count: 2, pitch: -32 }).findings[0]?.code).toBe('drilling-bounds')
  })
  it('marks invalid board dimensions unassessed and retains part/operation/source identity', () => {
    const s = sceneOf(),
      p = boardOf(s)
    p.length = NaN
    p.parentId = 'cabinet-0'
    p.visible = false
    p.cuts = [hole({ sourceJointId: 'joint-1' })]
    const r = report(s)
    expect(r.findings[0]).toMatchObject({
      code: 'drilling-unassessed',
      part: { id: p.id, cabinetId: 'cabinet-0' },
      operation: { id: 'row-1', sourceJointId: 'joint-1' },
    })
    expect(r.unassessed).toContain('Machine operation compatibility')
  })
  it('reports manual setup and each round-stock bore explicitly, detached from records', () => {
    const s = manufacturingProject()
    const p = s.parts.find((p) => p.id === 'manual-board') as BoardPart
    const round = s.parts.find((p) => p.kind === 'cylinder')!
    if (round.kind !== 'cylinder') throw new Error('round stock')
    round.cuts.push(
      { kind: 'bore-axial', id: 'axial', label: 'Axial', end: '+Z', diameter: 4, depth: 20 },
      {
        kind: 'bore-transverse',
        id: 'cross',
        label: 'Cross',
        position: 40,
        azimuth: 30,
        diameter: 4,
        depth: 10,
      },
    )
    const records = manufacturingParts(s.parts, s.materials, s.components),
      r = manufacturingMachining(records)
    expect(r.roundBores).toBe(2)
    expect(r.findings.filter((f) => f.operation.id === 'axial')[0].code).toBe('drilling-unassessed')
    expect(r.findings.filter((f) => f.operation.id === 'cross')[0].code).toBe('drilling-unassessed')
    const manual = r.findings.find((f) => f.operation.id === 'manual-instruction')!
    expect(manual.code).toBe('manual-review')
    expect(manual.instruction).toEqual(p.operations![0])
    records.find((r) => r.id === p.id)!.operations[0].instruction = 'Changed record'
    expect(manual.instruction!.instruction).toBe('Confirm jig setup before machining')
    expect(p.operations![0].instruction).toBe('Confirm jig setup before machining')
  })
  it('accepts generated screw clearance and pilot rows and preserves their joint provenance', () => {
    const s = sceneOf(),
      template = boardOf(s)
    const through: BoardPart = {
      ...template,
      id: 'through',
      length: 200,
      width: 100,
      thickness: 25,
      grain: 'free',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    }
    const receiving: BoardPart = {
      ...through,
      id: 'receiving',
      length: 120,
      thickness: 18,
      position: { x: 50, y: 0, z: 145 },
      rotation: { x: 0, y: 90, z: 0 },
    }
    const joint = defaultScrewJoint(through, receiving, '+Z', '+X', 'screw-joint', 'Screw fixing')
    const derived = deriveScrewJoint(joint, [through, receiving], componentsById([]))!
    expect(derived).not.toBeNull()
    for (const p of [through, receiving])
      p.cuts = derived.cuts.filter((c) => c.partId === p.id).map((c) => c.cut)
    s.parts = [through, receiving]
    s.components = []
    expect(report(s).boardHoleArrays).toBe(2)
    expect(report(s).findings).toEqual([])
    through.width = 1
    expect(report(s).findings[0].operation.sourceJointId).toBe('screw-joint')
  })
  it('accepts generated shelf drilling and retains its source identity when a board changes', () => {
    const s = manufacturingProject()
    const p = s.parts.find(
      (p) => p.kind === 'board' && p.cuts.some((h) => h.kind === 'hole-array'),
    ) as BoardPart
    expect(p).toBeTruthy()
    s.parts = [p]
    p.operations = []
    expect(report(s).findings).toEqual([])
    p.width = 1
    const r = report(s)
    expect(r.findings.some((f) => f.code === 'drilling-bounds')).toBe(true)
    expect(r.findings[0].operation.sourceComponentId).toBeTruthy()
  })
  it('keeps captured findings and manual setup through save/reopen and later source edits', () => {
    const s = sceneOf(),
      p = boardOf(s)
    p.cuts = [hole({ start: { x: 1, y: 20, z: 18 } })]
    const before = createReadinessSnapshot(s, 'Drill').machining
    const loaded = parseFile(
      JSON.stringify({
        version: FILE_FORMAT_VERSION,
        name: 'Drill',
        appVersion: '0',
        units: 'mm',
        createdAt: '',
        updatedAt: '',
        camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
        project: defaultProject(s, 'drill'),
        scene: s,
      }),
    ).scene
    expect(createReadinessSnapshot(loaded, 'Drill').machining).toEqual(before)
    p.label = 'Later'
    p.cuts = []
    expect(before.findings[0].part.label).not.toBe('Later')
    expect(before.findings[0].operation.id).toBe('row-1')
  })
})
