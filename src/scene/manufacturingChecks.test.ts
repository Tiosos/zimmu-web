import { describe, expect, it } from 'vitest'
import { manufacturingChecks } from './manufacturingChecks'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import { createReadinessSnapshot } from './readinessSnapshot'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { defaultProject } from './projectStructure'
import type { BoardPart, CarcaseComponent } from './types'

const sceneOf = () => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board' || p.kind === 'cylinder')
  return scene
}
const reportOf = (scene = sceneOf()) =>
  manufacturingChecks(manufacturingParts(scene.parts, scene.materials, scene.components))
const boardOf = (scene: ReturnType<typeof sceneOf>) => scene.parts[0] as BoardPart
const codes = (scene: ReturnType<typeof sceneOf>) => reportOf(scene).findings.map((f) => f.code)

describe('shared record manufacturing checks', () => {
  it.each(['toString', 'constructor', '__proto__'])(
    'does not resolve inherited material names: %s',
    (name) => {
      const scene = sceneOf()
      const round = scene.parts.find((p) => p.kind === 'cylinder')!
      round.material = name
      scene.parts = [round]
      expect(reportOf(scene).findings.map((f) => f.code)).toEqual(['stock-unresolved'])
      const snapshot = createReadinessSnapshot(scene, 'Inherited name')
      expect(snapshot.manufacturing.findings.map((f) => f.code)).toEqual(['stock-unresolved'])
    },
  )

  it('allows resolved solid and round stock, excludes prices and placement, and checks hidden parts', () => {
    const scene = sceneOf()
    expect(reportOf(scene).findings).toEqual([])
    const before = reportOf(scene)
    scene.parts.forEach((p) => {
      p.visible = false
      p.position.x += 1000
    })
    scene.materials['18mm Ply'].costPerM2 = 999
    expect(reportOf(scene)).toEqual(before)
    expect(before.checkedParts).toBe(scene.parts.length)
    expect(before.unassessed).toContain('Machine operation compatibility')
    boardOf(scene).width = NaN
    expect(codes(scene)).toContain('part-size')
    expect(codes(scene)).toContain('cut-size')
  })
  it('reports missing stock, wrong uses and mismatched thickness without discarding explicit overrides', () => {
    const scene = sceneOf()
    const board = boardOf(scene)
    board.material = 'unknown'
    expect(codes(scene)).toContain('stock-unresolved')
    expect(codes(scene)).toContain('stock-thickness')
    board.material = '18mm Ply'
    board.thickness = 20
    expect(codes(scene)).toContain('thickness-mismatch')
    board.overrides = { thickness: 20 }
    expect(codes(scene)).not.toContain('thickness-mismatch')
    board.overrides.thickness = NaN
    expect(codes(scene)).toContain('thickness-mismatch')
    scene.materials[board.material].use = 'edge'
    expect(codes(scene)).toContain('stock-use')
  })
  it.each([0, -1, NaN, Infinity])(
    'rejects invalid sheet, thickness and round dimensions: %s',
    (value) => {
      const scene = sceneOf()
      const material = scene.materials[boardOf(scene).material]
      material.sheet = { length: value, width: 1200 }
      material.thickness = value
      const round = scene.parts.find((p) => p.kind === 'cylinder')!
      round.length = value
      expect(codes(scene)).toEqual(
        expect.arrayContaining(['sheet-size', 'stock-thickness', 'part-size']),
      )
    },
  )
  it('retains requested unresolved cabinet edges and respects explicit bare overrides', () => {
    const scene = manufacturingProject()
    const cabinet = scene.components[0] as CarcaseComponent
    cabinet.params.edgeMaterial = 'Missing tape'
    const parts = scene.parts.filter((p) => p.parentId === cabinet.id && p.kind === 'board')
    const records = manufacturingParts(
      parts,
      scene.materials,
      scene.components,
    ) as ManufacturingBoard[]
    expect(
      records.some((p) => p.requestedEdgeStock.some((e) => e.material === 'Missing tape')),
    ).toBe(true)
    expect(records.every((p) => !p.edgeMaterials.includes('Missing tape'))).toBe(true)
    expect(manufacturingChecks(records).findings.some((f) => f.code === 'edge-stock')).toBe(true)
    const board = parts[0] as BoardPart
    board.edgeBanding = { x0: null, x1: null, y0: null, y1: null }
    const r = manufacturingParts(
      [board],
      scene.materials,
      scene.components,
    )[0] as ManufacturingBoard
    expect(r.requestedEdgeStock).toEqual([])
  })
  it('resolves explicitly defined prototype-like stock and edge names after library merging', () => {
    const scene = sceneOf()
    const board = boardOf(scene)
    board.material = '__proto__'
    board.edgeBanding = { x0: 'toString' }
    scene.materials = JSON.parse(
      '{"__proto__":{"thickness":18},"toString":{"thickness":2,"use":"edge"},"Oak":{"costPerM":5}}',
    )
    expect(createReadinessSnapshot(scene, 'Explicit names').manufacturing.findings).toEqual([])
  })

  it('rejects unknown, wrong-use and invalid edge stock, preserving failed cut sizes', () => {
    const scene = sceneOf()
    delete scene.materials.Tape
    expect(codes(scene)).toContain('edge-stock')
    expect(codes(scene)).toContain('cut-size')
    scene.materials.Tape = { thickness: 2 }
    expect(codes(scene)).toContain('edge-stock')
    scene.materials.Tape = { thickness: Infinity, use: 'edge' }
    expect(codes(scene)).toContain('edge-stock')
    expect(codes(scene)).toContain('cut-size')
    scene.materials.Tape.thickness = 1000
    expect(codes(scene)).toContain('cut-size')
  })
  it('scopes duplicate labels to cabinet or assembly and retains all part IDs', () => {
    const scene = sceneOf()
    const p = boardOf(scene)
    p.parentId = 'cabinet-0'
    p.label = 'Panel'
    const other = { ...structuredClone(p), id: 'second', label: ' Panel ' }
    scene.parts.push(other)
    const finding = reportOf(scene).findings.find((f) => f.code === 'label-duplicate')!
    expect(finding.targets.map((t) => t.id)).toEqual([p.id, other.id])
    expect(finding.targets.every((t) => t.cabinetId === 'cabinet-0')).toBe(true)
    scene.components.push({
      kind: 'group',
      id: 'nested',
      label: 'Nested',
      parentId: 'cabinet-0',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
    })
    other.parentId = 'nested'
    expect(codes(scene)).toContain('label-duplicate')
    other.parentId = 'cabinet-1'
    expect(codes(scene)).not.toContain('label-duplicate')
    p.parentId = 'assembly'
    other.parentId = 'assembly'
    expect(codes(scene)).toContain('label-duplicate')
    other.parentId = 'other-assembly'
    expect(codes(scene)).not.toContain('label-duplicate')
    p.parentId = null
    other.parentId = null
    expect(codes(scene)).toContain('label-duplicate')
    other.label = 'panel'
    expect(codes(scene)).not.toContain('label-duplicate')
    p.label = '  '
    expect(codes(scene)).toContain('label-empty')
  })
  it('uses effective library definitions and freezes targets/stock before later edits', () => {
    const scene = sceneOf()
    const material = boardOf(scene).material
    const definition = structuredClone(scene.materials[material])
    delete scene.materials[material]
    const library = { [material]: definition }
    const snapshot = createReadinessSnapshot(scene, 'A', new Date('2026-10-03'), library)
    expect(snapshot.manufacturing.findings).toEqual([])
    definition.thickness = 90
    boardOf(scene).label = 'Changed'
    expect(snapshot.manufacturing.findings).toEqual([])
    expect(
      createReadinessSnapshot(scene, 'A', new Date(), library).manufacturing.findings.map(
        (f) => f.code,
      ),
    ).toContain('thickness-mismatch')
    const records = manufacturingParts(scene.parts, scene.materials, scene.components)
    const r = records[0] as ManufacturingBoard
    r.requestedEdgeStock[0].stock.thickness = 999
    expect(scene.materials.Tape.thickness).toBe(2)
  })
  it('retains findings and stable references through save/reopen without truncation', () => {
    const scene = sceneOf()
    boardOf(scene).thickness = 19
    const before = reportOf(scene)
    const parsed = parseFile(
      JSON.stringify({
        version: FILE_FORMAT_VERSION,
        name: 'Checks',
        appVersion: '0',
        units: 'mm',
        createdAt: '',
        updatedAt: '',
        camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
        project: defaultProject(scene, 'checks'),
        scene,
      }),
    )
    expect(parsed).not.toBeNull()
    expect(reportOf(parsed!.scene)).toEqual(before)
    const p = boardOf(scene)
    p.edgeBanding = { x0: 'Unknown' }
    scene.parts = Array.from({ length: 205 }, (_, i) => ({
      ...structuredClone(p),
      id: `part-${i}`,
      label: `Part ${i}`,
    }))
    const report = reportOf(scene)
    expect(report.checkedParts).toBe(205)
    expect(report.findings.length).toBeGreaterThan(200)
    expect(report.findings.at(-1)?.reference).toBe(`M${report.findings.length}`)
  })
})
