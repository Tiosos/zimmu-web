import { describe, expect, it } from 'vitest'
import { cabinet } from '../geom/__fixtures__/cabinetSheet'
import { DEFAULT_FRAME, PRESET_MATERIALS } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { regenerateDrawers } from './regenerateDrawers'
import { regenerateFaceFrames } from './regenerateFaceFrames'
import { buildProductionReadiness } from './productionReadiness'
import { buildShelfReadiness } from './shelfReadiness'
import { jointPairIds } from './jointChecklist'
import type { CarcaseParams, Scene } from './types'

const sceneOf = (params: CarcaseParams = cabinet.params): Scene =>
  regenerateComponents(
    regenerateDrawers(
      regenerateFaceFrames({
        components: [{ ...cabinet, params }],
        parts: [],
        joints: [],
        hardware: [],
        materials: PRESET_MATERIALS,
      }),
    ),
  )

describe('production readiness', () => {
  it('honours explicit thickness overrides and reports invalid board geometry', () => {
    const scene = sceneOf()
    const p = scene.parts.find((p) => p.kind === 'board')!
    if (p.kind !== 'board') throw Error('board')
    p.material = 'unknown-stock'
    expect(
      buildProductionReadiness(scene).findings.some(
        (f) => f.kind === 'material' && f.targets[0].selection.id === p.id,
      ),
    ).toBe(true)
    p.overrides = { thickness: 18 }
    expect(
      buildProductionReadiness(scene).findings.some(
        (f) => f.kind === 'material' && f.targets[0].selection.id === p.id,
      ),
    ).toBe(false)
    p.length = -1
    expect(buildProductionReadiness(scene).findings.some((f) => f.kind === 'geometry')).toBe(true)
  })

  it('does not let another cabinet satisfy a missing role', () => {
    const scene = sceneOf()
    const second = { ...cabinet, id: 'second', position: { x: 2000, y: 0, z: 0 } }
    const other = regenerateComponents({ ...scene, components: [second], parts: [], joints: [] })
    scene.components.push(second)
    scene.parts = [...scene.parts.filter((p) => p.role !== 'bottom'), ...other.parts]
    scene.joints.push(...other.joints)
    const missing = buildProductionReadiness(scene).findings.filter((f) =>
      f.message.includes('(bottom)'),
    )
    expect(missing).toHaveLength(1)
    expect(missing[0].targets[0].selection).toEqual({ kind: 'component', id: cabinet.id })
  })

  it('uses generated roles and declared contacts without changing the scene', () => {
    const scene = sceneOf()
    const before = JSON.stringify(scene)
    const report = buildProductionReadiness(scene)
    expect(report.findings).toEqual([])
    expect(report.intentionalContacts).toBeGreaterThan(0)
    expect(report.joineryComplete).toBe(true)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('finds a missing non-shelf board and targets its cabinet, including hidden cabinets', () => {
    const scene = sceneOf()
    scene.components[0].visible = false
    scene.parts = scene.parts.filter((p) => p.role !== 'bottom')
    const finding = buildProductionReadiness(scene).findings.find((f) =>
      f.message.includes('(bottom)'),
    )!
    expect(finding.kind).toBe('missing')
    expect(finding.targets[0].selection).toEqual({ kind: 'component', id: cabinet.id })
  })

  it('finds a missing frame assembly and an individual frame member', () => {
    const scene = sceneOf({ ...cabinet.params, frame: DEFAULT_FRAME })
    const frame = scene.components.find((c) => c.kind === 'faceFrame')!
    const part = scene.parts.find((p) => p.parentId === frame.id)!
    const withoutPart = { ...scene, parts: scene.parts.filter((p) => p.id !== part.id) }
    expect(
      buildProductionReadiness(withoutPart).findings.some(
        (f) => f.kind === 'missing' && f.message.includes(part.role!),
      ),
    ).toBe(true)
    scene.parts = scene.parts.filter((p) => p.parentId !== frame.id)
    scene.components = scene.components.filter((c) => c.id !== frame.id)
    expect(
      buildProductionReadiness(scene).findings.some((f) =>
        f.message.includes('Missing generated face frame'),
      ),
    ).toBe(true)
  })

  it('finds missing drawer boards and explicitly skips detached assemblies', () => {
    const scene = sceneOf({
      ...cabinet.params,
      section: { ...cabinet.params.section, front: { kind: 'drawer-front' } },
    })
    const drawer = scene.components.find((c) => c.kind === 'drawer')!
    expect(drawer).toBeTruthy()
    scene.parts = scene.parts.filter((p) => !(p.parentId === drawer.id && p.role === 'box-bottom'))
    expect(
      buildProductionReadiness(scene).findings.some((f) => f.message.includes('(box-bottom)')),
    ).toBe(true)
    if (drawer.kind !== 'drawer') throw Error('drawer')
    drawer.driven = false
    expect(
      buildProductionReadiness(scene).findings.some(
        (f) => f.kind === 'unassessed' && f.message.includes('Detached'),
      ),
    ).toBe(true)
  })

  it('reports invalid cabinet dimensions and unknown material thickness without throwing', () => {
    const scene = sceneOf()
    const c = scene.components[0]
    if (c.kind !== 'carcase') throw Error('carcase')
    c.params = { ...c.params, width: 1 }
    let report = buildProductionReadiness(scene)
    expect(report.findings.some((f) => f.kind === 'geometry')).toBe(true)
    expect(report.joineryComplete).toBe(false)
    c.params = cabinet.params
    scene.materials = {}
    report = buildProductionReadiness(scene)
    expect(report.findings.some((f) => f.kind === 'material')).toBe(true)
    expect(report.findings.some((f) => f.kind === 'unassessed')).toBe(true)
  })

  it('finds a removed required joint even when its boards are no longer adjacent', () => {
    const scene = sceneOf()
    const removed = scene.joints[0]
    scene.joints = scene.joints.slice(1)
    const moved = scene.parts.find((p) => p.id === jointPairIds(removed)[0])!
    moved.position = { x: 10000, y: 10000, z: 10000 }
    const report = buildProductionReadiness(scene)
    expect(removed).toBeTruthy()
    expect(report.findings.some((f) => f.message.includes('Missing cabinet joint'))).toBe(true)
    expect(
      report.findings.filter((f) => f.message.includes('Missing cabinet joint'))[0].targets,
    ).toHaveLength(2)
  })

  it('bounds report work for huge fixed shelves, numeric overflow and large joinery scenes', () => {
    const scene = sceneOf()
    const c = scene.components[0]
    if (c.kind !== 'carcase') throw Error('carcase')
    c.params = {
      ...c.params,
      section: {
        ...c.params.section,
        interior: { ...c.params.section.interior!, fixedShelves: 1e12 },
      },
    }
    expect(buildProductionReadiness(scene).findings.some((f) => f.kind === 'unassessed')).toBe(true)
    expect(buildShelfReadiness(scene)[0].missing).toBeNull()
    c.params = cabinet.params
    const board = scene.parts[0]
    scene.parts = Array.from({ length: 201 }, (_, i) => ({
      ...board,
      id: `b${i}`,
      parentId: null,
      role: undefined,
    }))
    expect(buildProductionReadiness(scene).joineryComplete).toBe(false)
  })
})
