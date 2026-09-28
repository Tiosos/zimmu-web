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

const independentCabinetOf = (): CarcaseComponent => {
  const base = CARCASE_PRESETS[0].params
  const section = setInterior(
    { ...base.section, front: undefined },
    base.section.id,
    defaultInterior(1),
  )
  return {
    kind: 'carcase',
    id: 'cmp_independent_golden',
    label: 'Independent frame golden cabinet',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    visible: true,
    params: {
      ...base,
      section,
      frame: {
        ...DEFAULT_FRAME,
        layout: {
          [section.id]: {
            id: 'zones',
            size: { kind: 'equal' },
            content: {
              kind: 'split',
              axis: 'horizontal',
              children: [
                {
                  id: 'lower',
                  size: { kind: 'equal' },
                  content: {
                    kind: 'split',
                    axis: 'vertical',
                    children: [
                      {
                        id: 'lower-left',
                        size: { kind: 'equal' },
                        front: { kind: 'door', leaves: 1, hinge: 'left' },
                        content: { kind: 'leaf' },
                      },
                      {
                        id: 'lower-right',
                        size: { kind: 'equal' },
                        front: { kind: 'door', leaves: 1, hinge: 'right' },
                        content: { kind: 'leaf' },
                      },
                    ],
                  },
                },
                {
                  id: 'upper-drawer',
                  size: { kind: 'fixed', mm: 140 },
                  front: { kind: 'drawer-front' },
                  content: { kind: 'leaf' },
                },
              ],
            },
          },
        },
      },
      frontMount: 'inset',
    },
  }
}

const independentScene = (): Scene => {
  const cabinet = independentCabinetOf()
  const empty: Scene = {
    parts: [],
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [cabinet],
  }
  return regenerateComponents(regenerateDrawers(regenerateFaceFrames(empty)))
}

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

  it('builds drawer-over-pair manufacturing truth without a structural partition', () => {
    const scene = independentScene()
    const cabinet = scene.components.find(
      (component): component is CarcaseComponent =>
        component.kind === 'carcase' && component.id === 'cmp_independent_golden',
    )!
    expect(cabinet.params.section.content.kind).toBe('leaf')
    expect(scene.parts.some((part) => part.role?.startsWith('division-'))).toBe(false)

    const frameRoles = frameBoards(scene).map((part) => part.role)
    expect(frameRoles).toContain('rail-zone-zones-0')
    expect(frameRoles).toContain('stile-zone-lower-0')

    const fronts = scene.parts.filter(
      (part): part is BoardPart => part.kind === 'board' && part.role?.startsWith('front-') === true,
    )
    expect(fronts).toHaveLength(3)
    expect(fronts.every((part) => part.role?.includes('|'))).toBe(true)

    const drawer = scene.components.find((component) => component.kind === 'drawer')
    expect(drawer?.kind).toBe('drawer')
    if (drawer?.kind !== 'drawer') return
    expect(drawer.sectionId).toBe(cabinet.params.section.id)
    expect(drawer.frameOpeningId).toBe('upper-drawer')
    expect(scene.parts.filter((part) => part.parentId === drawer.id)).toHaveLength(5)
    const looseShelves = scene.parts.filter(
      (part) => part.kind === 'board' && part.role?.startsWith('adj-shelf-') === true,
    )
    expect(looseShelves).toHaveLength(1)
    // The shelf is still the full installed width behind the frame. It enters through the
    // full-width upper drawer aperture; the lower pair openings do not resize it.
    expect(looseShelves[0].length).toBeGreaterThan(400)

    const cups = fronts
      .flatMap((part) => part.cuts)
      .filter((cut) => cut.kind === 'hole-array' && cut.id.startsWith('cups_'))
      .reduce((sum, cut) => sum + (cut.kind === 'hole-array' ? cut.count : 0), 0)
    const hingeQty = carcaseHardware(scene)
      .filter((line) => line.key.startsWith('hinge-blum-'))
      .reduce((sum, line) => sum + line.qty, 0)
    expect(cups).toBe(4)
    expect(hingeQty).toBe(cups)

    const roundTrip = parseFile(
      JSON.stringify({
        version: FILE_FORMAT_VERSION,
        name: 'Independent frame golden',
        appVersion: 'test',
        units: 'mm',
        createdAt: '2026-09-28T00:00:00.000Z',
        updatedAt: '2026-09-28T00:00:00.000Z',
        camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 } },
        scene,
      }),
    )
    const loadedCabinet = roundTrip.scene.components.find(
      (component) => component.kind === 'carcase',
    )
    expect(loadedCabinet?.kind).toBe('carcase')
    if (loadedCabinet?.kind !== 'carcase') return
    expect(loadedCabinet.params.frame?.layout?.[cabinet.params.section.id]?.content.kind).toBe(
      'split',
    )
    const loadedDrawer = roundTrip.scene.components.find((component) => component.kind === 'drawer')
    expect(loadedDrawer?.kind).toBe('drawer')
    if (loadedDrawer?.kind !== 'drawer') return
    expect(loadedDrawer.frameOpeningId).toBe('upper-drawer')
  })

  it('declines the golden loose shelf when no sampled rigid-body route reaches the interior', () => {
    const cabinet = independentCabinetOf()
    const layout = cabinet.params.frame?.layout?.[cabinet.params.section.id]
    if (layout?.content.kind !== 'split') throw new Error('missing independent layout')
    const [lower, upper] = layout.content.children
    cabinet.params = {
      ...cabinet.params,
      frame: {
        ...cabinet.params.frame!,
        layout: {
          [cabinet.params.section.id]: {
            ...layout,
            content: {
              ...layout.content,
              children: [
                lower,
                {
                  ...upper,
                  front: undefined,
                  content: {
                    kind: 'split',
                    axis: 'vertical',
                    children: [
                      {
                        id: 'upper-left',
                        size: { kind: 'equal' },
                        front: { kind: 'drawer-front' },
                        content: { kind: 'leaf' },
                      },
                      {
                        id: 'upper-right',
                        size: { kind: 'equal' },
                        content: { kind: 'leaf' },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }
    const scene = regenerateComponents(
      regenerateDrawers(
        regenerateFaceFrames({
          parts: [],
          materials: { ...PRESET_MATERIALS },
          hardware: [],
          joints: [],
          components: [cabinet],
        }),
      ),
    )
    expect(
      scene.parts.filter(
        (part) => part.kind === 'board' && part.role?.startsWith('adj-shelf-') === true,
      ),
    ).toEqual([])
    expect(scene.parts.some((part) => part.role?.startsWith('division-'))).toBe(false)
  })
})
