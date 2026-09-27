import { describe, expect, it } from 'vitest'
import { buildDrawingSheets } from '../geom/drawing'
import { isNestable } from '../ui/buildCsv'
import {
  CARCASE_PRESETS,
  DEFAULT_FRAME,
  DEFAULT_FRAME_MATERIAL,
  PRESET_MATERIALS,
} from './carcasePresets'
import { carcaseHardware } from './carcaseHardware'
import { frontGeometryOf } from './carcaseRoles'
import { setSectionSize, splitSection } from './editSection'
import { parseFile, FILE_FORMAT_VERSION } from './useFile'
import { regenerateComponents } from './regenerateComponents'
import { regenerateDrawers } from './regenerateDrawers'
import { regenerateFaceFrames } from './regenerateFaceFrames'
import { defaultInterior, setFrontOn, setInterior } from './sectionInterior'
import { resolveSections } from './sectionTree'
import { openingRect, sectionThickness } from './carcaseRoles'
import { roleThicknessFor } from './resolveThickness'
import type { BoardPart, CarcaseComponent, Scene } from './types'

const cabinetOf = (): CarcaseComponent => {
  const base = CARCASE_PRESETS[0].params
  let section = splitSection(base.section, base.section.id, 'vertical', 'panel', 2)
  if (section.content.kind !== 'split') throw new Error('fixture is not a split')
  section = setSectionSize(section, section.content.children[0].id, { kind: 'fixed', mm: 190 })
  if (section.content.kind !== 'split') throw new Error('fixture lost its split')
  const [left, right] = section.content.children
  section = setFrontOn(section, left.id, { kind: 'door', leaves: 1, hinge: 'left' })
  section = setInterior(section, left.id, defaultInterior(2))
  section = setFrontOn(section, right.id, { kind: 'drawer-front' })

  return {
    kind: 'carcase',
    id: 'cmp_golden',
    label: 'Golden framed manufacturing cabinet',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: {
      ...base,
      frame: DEFAULT_FRAME,
      frontMount: 'inset',
      section,
    },
  }
}

const goldenScene = (): Scene => {
  const cabinet = cabinetOf()
  const empty: Scene = {
    parts: [],
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [cabinet],
  }
  return regenerateComponents(regenerateDrawers(regenerateFaceFrames(empty)))
}

const frameBoards = (scene: Scene): BoardPart[] =>
  scene.parts.filter(
    (p): p is BoardPart =>
      p.kind === 'board' &&
      p.role !== undefined &&
      (p.role.startsWith('stile-') || p.role.startsWith('rail-')),
  )

describe('golden manufacturing package', () => {
  it('keeps regeneration, hardware, drawings, persistence and stock classification in agreement', () => {
    const scene = goldenScene()
    const cabinet = scene.components.find(
      (c): c is CarcaseComponent => c.kind === 'carcase' && c.id === 'cmp_golden',
    )
    expect(cabinet).toBeDefined()

    const frames = frameBoards(scene)
    expect(frames.some((p) => p.role?.startsWith('stile-') && p.role !== 'stile-left' && p.role !== 'stile-right')).toBe(true)

    const manual = frames.flatMap((p) => p.operations ?? [])
    expect(manual.length).toBeGreaterThan(0)
    expect(manual.every((op) => op.hardwareKey === 'hinge-blum-clip-inset-175h5030-21')).toBe(true)

    const cups = scene.parts
      .filter((p): p is BoardPart => p.kind === 'board' && p.role?.startsWith('front-') === true)
      .flatMap((p) => p.cuts)
      .filter((c) => c.kind === 'hole-array' && c.id.startsWith('cups_'))
      .reduce((sum, c) => sum + (c.kind === 'hole-array' ? c.count : 0), 0)
    const hingeQty = carcaseHardware(scene)
      .filter((line) => line.key === 'hinge-blum-clip-inset-175h5030-21')
      .reduce((sum, line) => sum + line.qty, 0)
    expect(cups).toBeGreaterThan(0)
    expect(hingeQty).toBe(cups)

    const carryingStile = frames.find((p) => (p.operations?.length ?? 0) > 0)!
    const sheets = buildDrawingSheets([carryingStile], 'Golden package')
    const sheet = sheets.find(
      (s) => s.kind === 'part' && s.shape === 'board' && s.partLabel === carryingStile.label,
    )
    if (sheet?.kind !== 'part' || sheet.shape !== 'board') throw new Error('missing stile sheet')
    expect(sheet.manufacturingNotes.some((n) => n.includes('175H5030.21'))).toBe(true)
    expect(sheet.views.flatMap((v) => v.circles)).toEqual([])

    const roundTrip = parseFile(
      JSON.stringify({
        version: FILE_FORMAT_VERSION,
        name: 'Golden package',
        appVersion: 'test',
        units: 'mm',
        createdAt: '2026-09-27T00:00:00.000Z',
        updatedAt: '2026-09-27T00:00:00.000Z',
        camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
        scene,
      }),
    )
    const loadedManual = roundTrip.scene.parts
      .filter((p): p is BoardPart => p.kind === 'board')
      .flatMap((p) => p.operations ?? [])
    expect(loadedManual).toEqual(manual)

    const thicknessOf = roleThicknessFor(cabinet!.params, scene.materials, new Map())
    const tree = resolveSections(
      cabinet!.params.section,
      openingRect(cabinet!.params, thicknessOf),
      sectionThickness(thicknessOf),
    )
    const openings = [...(frontGeometryOf(cabinet!.params, tree).frameOpenings?.values() ?? [])]
    expect(openings).toHaveLength(2)
    expect(openings[0].x1 - openings[0].x0).not.toBe(openings[1].x1 - openings[1].x0)

    expect(isNestable(scene.materials[DEFAULT_FRAME_MATERIAL])).toBe(false)
  })
})
