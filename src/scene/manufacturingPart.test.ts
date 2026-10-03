import { describe, expect, it } from 'vitest'
import { manufacturingPart, manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { componentsById } from './componentTree'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import { applyPipeline } from './pipeline'
import { FILE_FORMAT_VERSION, parseFile } from './useFile'
import { defaultProject } from './projectStructure'
import type { BoardPart, CarcaseComponent, HoleArrayCut, Scene } from './types'

const manualBoard = (scene: Scene) => scene.parts.find((p) => p.id === 'manual-board') as BoardPart
const record = (scene: Scene) =>
  manufacturingPart(manualBoard(scene), {
    byId: componentsById(scene.components),
    materials: scene.materials,
  }) as ManufacturingBoard

describe('physical manufacturing records', () => {
  it('keeps local axes separate from BOM grain order and finished band run lengths', () => {
    const r = record(manufacturingProject())
    expect(r.local).toEqual({ length: 560, width: 720, thickness: 18 })
    expect(r.finished).toEqual({ length: 720, width: 560, thickness: 18 })
    expect(r.cut).toEqual({ length: 718, width: 558, thickness: 18 })
    expect(r.grain).toBe('width')
    expect(r.bomGrain).toBe('length')
    expect(r.edges).toEqual({ x0: 'Tape', x1: null, y0: null, y1: 'Tape' })
    expect(r.edgeCode).toBe('1L1S')
    expect(r.edgeMaterials).toEqual(['Tape'])
    expect(r.edgeBand).toEqual([{ material: 'Tape', mm: 1280 }])
  })

  it('orders edge-stock names and keeps a long edge in BOM axes', () => {
    const scene = manufacturingProject()
    manualBoard(scene).edgeBanding = { x0: 'Tape' }
    expect(record(scene).edgeCode).toBe('1L')
    expect(record(scene).edgeBand).toEqual([{ material: 'Tape', mm: 720 }])
    scene.materials['Z tape'] = { thickness: 2, use: 'edge' }
    scene.materials['A tape'] = { thickness: 3, use: 'edge' }
    manualBoard(scene).edgeBanding = { x0: 'Z tape', y1: 'A tape' }
    expect(record(scene).edgeMaterials).toEqual(['A tape', 'Z tape'])
    manualBoard(scene).material = 'Z tape'
    expect(record(scene).stock.use).toBe('edge')
  })
  it('retains unconstrained grain while putting the longer free-grain size first', () => {
    const scene = manufacturingProject()
    manualBoard(scene).grain = 'free'
    const r = record(scene)
    expect(r.finished.length).toBe(720)
    expect(r.bomGrain).toBe('free')
    expect(r.grain).toBe('free')
  })
  it('retains cut-size problems and never clamps impossible dimensions', () => {
    const scene = manufacturingProject()
    delete scene.materials.Tape.thickness
    expect(record(scene).cut.problem).toContain('has no thickness')
    scene.materials.Tape.thickness = 600
    manualBoard(scene).edgeBanding = { x0: 'Tape', x1: 'Tape', y0: 'Tape', y1: 'Tape' }
    const r = record(scene)
    expect(r.cut.problem).toBe('cut size is zero or negative')
    expect(r.cut.length).toBeLessThan(0)
    expect(r.cut.width).toBeLessThan(0)
    expect(r.local).toEqual({ length: 560, width: 720, thickness: 18 })
  })
  it('captures nested cabinet identity, exact pins, detached roles and explicit overrides', () => {
    const scene = manufacturingProject()
    const cabinet = scene.components[0] as CarcaseComponent
    cabinet.catalogue = { id: 'missing.company.product', version: 99, overrides: {} }
    scene.components.push({
      kind: 'group',
      id: 'nested',
      label: 'Group',
      parentId: cabinet.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
    })
    const part = manualBoard(scene)
    part.parentId = 'nested'
    part.role = 'detached-panel'
    part.overrides = { material: part.material, thickness: 18 }
    const r = record(scene)
    expect(r.provenance).toEqual({
      parentId: 'nested',
      cabinetId: cabinet.id,
      cabinetLabel: cabinet.label,
      driven: false,
      role: 'detached-panel',
      partOverrides: { material: part.material, thickness: 18 },
      cataloguePin: { id: 'missing.company.product', version: 99 },
    })
    r.provenance.cataloguePin!.version = 100
    r.provenance.partOverrides!.thickness = 25
    expect(cabinet.catalogue.version).toBe(99)
    expect(part.overrides.thickness).toBe(18)
  })
  it('does not assign a catalogue by a loose part label or unresolved parent', () => {
    const scene = manufacturingProject()
    const part = manualBoard(scene)
    part.label = 'Base 600'
    part.parentId = 'missing-parent'
    const r = record(scene)
    expect(r.provenance.cabinetId).toBeNull()
    expect(r.provenance.cataloguePin).toBeNull()
    expect(r.provenance.role).toBeNull()
    expect(r.provenance.partOverrides).toBeNull()
    expect(r.provenance.parentId).toBe('missing-parent')
  })
  it('keeps geometric operations and manual instructions independently owned', () => {
    const scene = manufacturingProject()
    const part = manualBoard(scene)
    const cut: HoleArrayCut = {
      kind: 'hole-array',
      id: 'holes',
      label: 'Holes',
      face: '+Z',
      axis: 'U',
      start: { x: 10, y: 20, z: 18 },
      count: 2,
      pitch: 32,
      diameter: 5,
      depth: 10,
      sourceJointId: 'joint-owner',
    }
    part.cuts = [cut]
    const signature = JSON.stringify(scene)
    const r = record(scene)
    expect(r.cuts).toEqual(part.cuts)
    expect(r.operations).toEqual(part.operations)
    expect(r.cuts).toHaveLength(1)
    expect(r.operations).toHaveLength(1)
    expect((r.cuts[0] as HoleArrayCut).sourceJointId).toBe('joint-owner')
    ;(r.cuts[0] as HoleArrayCut).start.x = 999
    r.operations[0].at.x = 888
    r.operations[0].instruction = 'changed copy'
    expect(JSON.stringify(scene)).toBe(signature)
  })
  it('defaults absent manual instructions to an empty independent array', () => {
    const scene = manufacturingProject()
    delete manualBoard(scene).operations
    expect(record(scene).operations).toEqual([])
    expect(manualBoard(scene).operations).toBeUndefined()
  })
  it('retains purchased round-stock length and geometric end operations', () => {
    const scene = manufacturingProject()
    const r = manufacturingParts(scene.parts, scene.materials, scene.components).find(
      (p) => p.id === 'manual-round',
    )!
    expect(r.kind).toBe('cylinder')
    if (r.kind !== 'cylinder') throw new Error('expected round stock')
    expect(r.length).toBe(500)
    expect(r.diameter).toBe(8)
    expect(r.operations).toEqual([])
    expect(r.cuts).toEqual([
      { kind: 'end', id: 'trim', label: 'Trim', end: '+Z', offset: 10, angle: 0, azimuth: 0 },
    ])
    expect(r.cuts).not.toBe(scene.parts.find((p) => p.id === 'manual-round')!.cuts)
  })
  it('separates physical stock from prices and world placement', () => {
    const scene = manufacturingProject()
    const before = manufacturingParts(scene.parts, scene.materials, scene.components)
    const next = structuredClone(scene)
    next.components[0].position.x += 1000
    for (const material of Object.values(next.materials)) {
      material.costPerM2 = 99
      material.costPerM = 88
      if (material.sheet) material.sheet.costPerSheet = 123
    }
    expect(manufacturingParts(next.parts, next.materials, next.components)).toEqual(before)
    const stock = record(scene).stock
    expect(stock).toEqual({
      resolved: true,
      thickness: 18,
      hasGrain: true,
      sheet: { length: 2440, width: 1220 },
      use: null,
    })
    stock.sheet!.width = 999
    expect(scene.materials['18mm Ply'].sheet!.width).toBe(1220)
    delete scene.materials['18mm Ply']
    expect(record(scene).stock).toEqual({
      resolved: false,
      thickness: null,
      hasGrain: true,
      sheet: null,
      use: null,
    })
    scene.materials['18mm Ply'] = { hasGrain: false }
    expect(record(scene).stock.hasGrain).toBe(false)
  })
  it('keeps independent record IDs through save/reopen and width regeneration', () => {
    const scene = manufacturingProject()
    const before = manufacturingParts(scene.parts, scene.materials, scene.components)
    const file = {
      version: FILE_FORMAT_VERSION,
      name: 'Synthetic fixture',
      appVersion: '0',
      units: 'mm',
      createdAt: '',
      updatedAt: '',
      camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
      scene,
      project: defaultProject(scene, 'synthetic'),
    }
    const loaded = parseFile(JSON.stringify(file)).scene
    expect(manufacturingParts(loaded.parts, loaded.materials, loaded.components)).toEqual(before)
    const cabinet = loaded.components[0] as CarcaseComponent
    cabinet.params.width = 650
    cabinet.catalogue!.overrides.width = 650
    const next = applyPipeline(loaded)
    const after = manufacturingParts(next.parts, next.materials, next.components)
    expect(after.map((p) => p.id).sort()).toEqual(before.map((p) => p.id).sort())
    const generated = after.filter((p) => p.provenance.cabinetId === cabinet.id)
    expect(generated.every((p) => p.provenance.driven && p.provenance.role !== null)).toBe(true)
    expect(
      generated.some(
        (p) =>
          p.kind === 'board' &&
          p.local.length !== (before.find((b) => b.id === p.id) as ManufacturingBoard).local.length,
      ),
    ).toBe(true)
  })
})
