import { describe, it, expect } from 'vitest'
import { CARCASE_PRESETS, PRESET_MATERIALS, type CarcasePreset } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { hingeCount } from './frontMachining'
import { carcaseHardware } from './carcaseHardware'
import { resolveCarcase } from './carcaseOpenings'
import { reconcileJoints } from './reconcileJoints'
import { defaultScrewJoint } from './defaultJoint'
import { splitSection } from './editSection'
import { defaultInterior, setFrontOn, setInterior } from './sectionInterior'
import type { BoardPart, CarcaseParams, Joint, MaterialDef, Scene } from './types'

// The scene a new file starts from, with one cabinet in it. Materials are a parameter because a
// door thin enough to refuse a cup needs a material the presets do not name.
const sceneOf = (
  params: CarcaseParams,
  label = 'Cabinet',
  materials: Record<string, MaterialDef> = PRESET_MATERIALS,
): Scene =>
  regenerateComponents({
    parts: [],
    materials: { ...materials },
    hardware: [],
    joints: [],
    components: [
      {
        kind: 'carcase',
        id: 'cmp_1',
        label,
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
        params,
      },
    ],
  })

const qtyOf = (scene: Scene, key: string): number =>
  carcaseHardware(scene)
    .filter((l) => l.key === key)
    .reduce((sum, l) => sum + l.qty, 0)

describe('carcaseHardware — hinges', () => {
  // Side A is the stated table read against each DOOR's own height; side B is the pass counting
  // bored cups. Counting cups on both sides would pass however wrong `hingeCount` is.
  it.each(CARCASE_PRESETS.map((p) => [p.name, p] as const))(
    '%s lists one hinge per cup, and the table agrees',
    (_name, preset: CarcasePreset) => {
      const scene = sceneOf(preset.params, preset.name)
      const doors = scene.parts.filter((p) => p.kind === 'board' && p.role?.startsWith('front-'))
      const expected = doors.reduce((sum, d) => sum + hingeCount(d.length), 0)
      expect(qtyOf(scene, 'hinge-overlay')).toBe(expected)
    },
  )

  // Tall 600's leaf is 1997 mm, so the table gives 4 — reading the CABINET's 2100 would give 5.
  it('counts by the leaf, not by the cabinet', () => {
    const tall = CARCASE_PRESETS.find((p) => p.name.startsWith('Tall'))!
    expect(qtyOf(sceneOf(tall.params), 'hinge-overlay')).toBe(8)
    expect(hingeCount(tall.params.height)).toBe(5) // the cabinet's own height would give 10
  })

  it('keys by the mount the cabinet is built to', () => {
    const inset = { ...CARCASE_PRESETS[0].params, frontMount: 'inset' as const }
    expect(qtyOf(sceneOf(inset), 'hinge-inset')).toBe(2)
    expect(qtyOf(sceneOf(inset), 'hinge-overlay')).toBe(0)
  })

  // `cupRow` returns null below CUP_DEPTH + MIN_FACE_BEHIND_CUP, so there is no cup to count and
  // no hinge to order. A parameter-driven count would order hinges for a door never bored for them.
  it('lists no hinge for a door too thin to bore a cup into', () => {
    // 10 mm leaves 1.5 mm behind a 12.5 mm cup, so `cupRow` returns null and nothing is bored.
    const thin = { ...CARCASE_PRESETS[0].params, frontMaterial: '10mm Ply' }
    const scene = sceneOf(thin, 'Thin', {
      ...PRESET_MATERIALS,
      '10mm Ply': { thickness: 10 },
    })
    expect(scene.parts.some((p) => p.role?.startsWith('front-'))).toBe(true)
    expect(qtyOf(scene, 'hinge-overlay')).toBe(0)
  })
})

// No preset has a drawer bay, so every runner test builds its own. Two bays, the LEFT one a drawer
// front — a single-bay fixture cannot tell "the bay that asked" from "the first bay".
const withDrawerBays = (drawers: number): CarcaseParams => {
  const p = CARCASE_PRESETS[0].params
  let section = splitSection(p.section, p.section.id, 'vertical', 'panel', 2)
  const kids = section.content.kind === 'split' ? section.content.children : []
  for (let i = 0; i < drawers; i++)
    section = setFrontOn(section, kids[i].id, { kind: 'drawer-front' })
  return { ...p, section }
}

describe('carcaseHardware — runners', () => {
  it('lists one pair per drawer bay, not one per bored upright', () => {
    const scene = sceneOf(withDrawerBays(1))
    // Both uprights bounding the bay carry a slide row; the runner is one pair.
    const rows = scene.parts.filter(
      (p) => p.kind === 'board' && p.cuts.some((c) => c.id.startsWith('slide_')),
    )
    expect(rows.length).toBe(2)
    expect(qtyOf(scene, 'runner-500')).toBe(1)
  })

  it('counts a pair for each drawer bay', () => {
    expect(qtyOf(sceneOf(withDrawerBays(2)), 'runner-500')).toBe(2)
  })

  // The nominal follows the cabinet's clear depth, so a bay beside a division and a bay beside a
  // side panel take the same runner — those two uprights are 548 mm and 560 mm long.
  it('takes the nominal from the clear depth, so both bays agree', () => {
    const lines = carcaseHardware(sceneOf(withDrawerBays(2))).filter((l) =>
      l.key.startsWith('runner-'),
    )
    expect(lines.length).toBe(1)
    expect(lines[0].key).toBe('runner-500')
  })

  it('shortens the runner with the cabinet', () => {
    const shallow = { ...withDrawerBays(1), depth: 330 }
    expect(qtyOf(sceneOf(shallow), 'runner-300')).toBe(1)
  })

  it('lists no runner in a cabinet too shallow for the smallest one', () => {
    const tiny = { ...withDrawerBays(1), depth: 200 }
    expect(carcaseHardware(sceneOf(tiny)).filter((l) => l.key.startsWith('runner-'))).toEqual([])
  })
})

const withShelves = (shelves: number, rows: 1 | 2): CarcaseParams => {
  const p = CARCASE_PRESETS[0].params
  const base = defaultInterior(shelves)
  const section = setInterior(p.section, p.section.id, {
    ...base,
    adjustable: { ...base.adjustable, rows },
  })
  return { ...p, section }
}

describe('carcaseHardware — shelf pins', () => {
  // Side A is what the section ASKED for, seated; side B is the pass counting emitted boards and
  // bored rows.
  it('gives every seated shelf one pin per bored row', () => {
    const scene = sceneOf(withShelves(2, 2))
    const seated = scene.parts.filter(
      (p) => p.kind === 'board' && p.role?.startsWith('adj-shelf-'),
    ).length
    expect(seated).toBe(2)
    expect(qtyOf(scene, 'shelf-pin-5mm')).toBe(seated * 4)
  })

  it('halves the pins when the section bores one row a side', () => {
    expect(qtyOf(sceneOf(withShelves(2, 1)), 'shelf-pin-5mm')).toBe(4)
    expect(qtyOf(sceneOf(withShelves(2, 2)), 'shelf-pin-5mm')).toBe(8)
  })

  it('counts the shelves the cabinet seated, not the shelves it was asked for', () => {
    // `shelfPins` seats what the pin row can hold; asking for more does not make more boards.
    const scene = sceneOf(withShelves(40, 2))
    const seated = scene.parts.filter(
      (p) => p.kind === 'board' && p.role?.startsWith('adj-shelf-'),
    ).length
    expect(seated).toBeLessThan(40)
    expect(qtyOf(scene, 'shelf-pin-5mm')).toBe(seated * 4)
  })

  it('lists no pins for a cabinet whose shelves are all fixed', () => {
    const tall = CARCASE_PRESETS.find((p) => p.name.startsWith('Tall'))!
    expect(qtyOf(sceneOf(tall.params), 'shelf-pin-5mm')).toBe(0)
  })

  // Two bays with DIFFERENT shelving on each side: a single-opening fixture (every other test in
  // this block) cannot distinguish "the opening that asked" from "the first opening" — `.find` and
  // `sections[0]` agree whenever there is only one. Left bay asks for 1 shelf at 1 bored row (2
  // pins); right bay asks for 3 at 2 bored rows. If the pass reads `sections[0]` for every opening,
  // it seats the LEFT bay's shelf count against the RIGHT bay's rows (or vice versa) for one of the
  // two bays, which this fixture is built so those wrong totals do not collide with the right one.
  it('attributes each opening’s pins to its own opening, not the first one', () => {
    const p = CARCASE_PRESETS[0].params
    let section = splitSection(p.section, p.section.id, 'vertical', 'panel', 2)
    const kids = section.content.kind === 'split' ? section.content.children : []
    const left = defaultInterior(1)
    section = setInterior(section, kids[0].id, {
      ...left,
      adjustable: { ...left.adjustable, rows: 1 },
    })
    const right = defaultInterior(3)
    section = setInterior(section, kids[1].id, {
      ...right,
      adjustable: { ...right.adjustable, rows: 2 },
    })
    const scene = sceneOf({ ...p, section })

    const cabinet = scene.components.find((c) => c.kind === 'carcase')
    if (cabinet === undefined || cabinet.kind !== 'carcase') throw new Error('fixture is a carcase')
    const resolved = resolveCarcase(cabinet, scene.parts, scene.materials)
    if (resolved === null) throw new Error('fixture must resolve')

    // Read what actually seated per opening — `shelfPins` caps what was asked for — attributed by
    // `resolveCarcase`, the same ownership chain the implementation reads.
    const seatedByOpening = resolved.nodes.sections.map(
      (n) => n.parts.filter((part) => part.role?.startsWith('adj-shelf-')).length,
    )
    expect(seatedByOpening).toEqual([1, 3])

    const expected = resolved.openings.reduce((sum, opening, i) => {
      const rows = opening.spec?.adjustable.rows ?? 0
      return sum + seatedByOpening[i] * 2 * rows
    }, 0)
    expect(expected).toBe(14) // 1*2*1 + 3*2*2

    expect(qtyOf(scene, 'shelf-pin-5mm')).toBe(14)
  })
})

const piped = (params: CarcaseParams, label = 'Cabinet'): Scene =>
  reconcileJoints(sceneOf(params, label))

describe('carcaseHardware — screws', () => {
  // Side A is `screwCount` summed over the cabinet's screw joints; side B is the pass counting
  // clearance bores. Both are derived; neither is a number anyone typed.
  it.each(CARCASE_PRESETS.map((p) => [p.name, p] as const))(
    '%s lists one screw per clearance hole',
    (_name, preset: CarcasePreset) => {
      const scene = piped(preset.params, preset.name)
      const expected = scene.joints
        .filter((j) => j.kind === 'screw')
        .reduce((sum, j) => sum + (j.kind === 'screw' ? j.screwCount : 0), 0)
      expect(expected).toBeGreaterThan(0)
      expect(qtyOf(scene, 'screw-8x40')).toBe(expected)
    },
  )

  it('matches the figures measured for the presets', () => {
    expect(qtyOf(piped(CARCASE_PRESETS[0].params), 'screw-8x40')).toBe(32)
    expect(qtyOf(piped(CARCASE_PRESETS[1].params), 'screw-8x40')).toBe(28)
    expect(qtyOf(piped(CARCASE_PRESETS[2].params), 'screw-8x40')).toBe(66)
  })

  // A screw joint the USER added inside a cabinet still needs screws; it carries no
  // sourceComponentId, so attributing by that would drop it.
  it('counts a user-added joint into the cabinet whose panels it joins', () => {
    const scene = piped(CARCASE_PRESETS[0].params)
    const left = scene.parts.find((p) => p.role === 'left-side') as BoardPart
    const shelf = scene.parts.find((p) => p.role?.startsWith('adj-shelf-')) as BoardPart
    const mine: Joint = {
      ...defaultScrewJoint(left, shelf, '+X', '-X', 'joint_mine', 'Mine'),
      driven: false,
    }
    const before = qtyOf(scene, 'screw-8x40')
    const after = qtyOf(
      reconcileJoints({ ...scene, joints: [...scene.joints, mine] }),
      'screw-8x40',
    )
    expect(after).toBeGreaterThan(before)
    const lines = carcaseHardware(
      reconcileJoints({ ...scene, joints: [...scene.joints, mine] }),
    ).filter((l) => l.key === 'screw-8x40')
    expect(lines.map((l) => l.componentId)).toEqual(['cmp_1'])
  })

  // A joint between parts owned by no cabinet still needs its screws bought.
  it('files screws for parentless parts under Ungrouped', () => {
    const scene = piped(CARCASE_PRESETS[0].params)
    const a: BoardPart = {
      ...(scene.parts.find((p) => p.role === 'bottom') as BoardPart),
      id: 'board_loose_a',
      parentId: null,
      driven: false,
      role: undefined,
      cuts: [],
    }
    const b: BoardPart = { ...a, id: 'board_loose_b' }
    const loose: Joint = {
      ...defaultScrewJoint(a, b, '+Z', '-X', 'joint_loose', 'Loose'),
      driven: false,
    }
    const withLoose = reconcileJoints({
      ...scene,
      parts: [...scene.parts, a, b],
      joints: [...scene.joints, loose],
    })
    const ungrouped = carcaseHardware(withLoose).filter((l) => l.componentId === null)
    expect(ungrouped.length).toBe(1)
    expect(ungrouped[0].cabinetLabel).toBe('Ungrouped')
    expect(ungrouped[0].qty).toBeGreaterThan(0)
  })
})
