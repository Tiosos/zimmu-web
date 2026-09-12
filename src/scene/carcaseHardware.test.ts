import { describe, it, expect } from 'vitest'
import { CARCASE_PRESETS, PRESET_MATERIALS, type CarcasePreset } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { hingeCount } from './frontMachining'
import { carcaseHardware } from './carcaseHardware'
import { clearDepth } from './carcaseRoles'
import { defaultDrawerParams, drawerBoxMetrics } from './drawerBox'
import { resolveCarcase } from './carcaseOpenings'
import { reconcileJoints } from './reconcileJoints'
import { defaultScrewJoint } from './defaultJoint'
import { splitSection } from './editSection'
import { defaultInterior, firstInterior, setFrontOn, setInterior } from './sectionInterior'
import type { BoardPart, CarcaseParams, ComponentId, Joint, MaterialDef, Scene } from './types'

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

// qtyOf sums across every owner, so it cannot tell a right attribution from a swapped one — two
// cabinets' totals can move in opposite directions and still add up the same. Attribution tests
// need the count pinned to one componentId.
const qtyForOwner = (scene: Scene, componentId: ComponentId | null, key: string): number =>
  carcaseHardware(scene)
    .filter((l) => l.componentId === componentId && l.key === key)
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

  // The one case where "what the cabinet asked for" and "what it bored" come apart. `pinRow`
  // refuses to bore when the setback is inside the pin's own radius, but `shelfPins` seats shelves
  // regardless — so a pass multiplying by the section's `rows` quotes pins for a cabinet carrying
  // no pin holes at all.
  it('lists no pins when the setback is too small to bore a row', () => {
    const base = withShelves(2, 2)
    const spec = firstInterior(base.section)!
    const section = setInterior(base.section, base.section.id, {
      ...spec,
      adjustable: { ...spec.adjustable, setback: 2 },
    })
    const scene = sceneOf({ ...base, section })
    const bored = scene.parts.filter(
      (p) => p.kind === 'board' && p.cuts.some((c) => c.id.startsWith('holes_')),
    ).length
    expect(bored).toBe(0)
    expect(qtyOf(scene, 'shelf-pin-5mm')).toBe(0)
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
    const screwJoint = defaultScrewJoint(left, shelf, '+X', '-X', 'joint_mine', 'Mine')
    const mine: Joint = { ...screwJoint, driven: false }
    const before = qtyOf(scene, 'screw-8x40')
    const after = qtyOf(
      reconcileJoints({ ...scene, joints: [...scene.joints, mine] }),
      'screw-8x40',
    )
    expect(after).toBe(before + screwJoint.screwCount)
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
    const screwJoint = defaultScrewJoint(a, b, '+Z', '-X', 'joint_loose', 'Loose')
    const loose: Joint = { ...screwJoint, driven: false }
    const withLoose = reconcileJoints({
      ...scene,
      parts: [...scene.parts, a, b],
      joints: [...scene.joints, loose],
    })
    const ungrouped = carcaseHardware(withLoose).filter((l) => l.componentId === null)
    expect(ungrouped.length).toBe(1)
    expect(ungrouped[0].cabinetLabel).toBe('Ungrouped')
    expect(ungrouped[0].qty).toBe(screwJoint.screwCount)
  })

  // `deriveScrewJoint` places the clearance bore on the THROUGH panel and the pilot bore on the
  // RECEIVING panel — nothing requires the two to share an owner. Direction chosen: the through
  // panel is cabinet-owned, the receiving panel is a loose board. Attribution follows the through
  // panel, so the cabinet's count must gain exactly this joint's screws and Ungrouped must gain
  // none; a pass that read the pilot bore instead would flip both.
  it('attributes screws to the panel screwed through, not the panel receiving them', () => {
    const scene = piped(CARCASE_PRESETS[0].params)
    const through = scene.parts.find((p) => p.role === 'left-side') as BoardPart
    const receiving: BoardPart = {
      ...(scene.parts.find((p) => p.role?.startsWith('adj-shelf-')) as BoardPart),
      id: 'board_loose_receiving',
      parentId: null,
      driven: false,
      role: undefined,
      cuts: [],
    }
    const screwJoint = defaultScrewJoint(through, receiving, '+X', '-X', 'joint_cross', 'Cross')
    const cross: Joint = { ...screwJoint, driven: false }
    const beforeCabinet = qtyForOwner(scene, 'cmp_1', 'screw-8x40')

    const after = reconcileJoints({
      ...scene,
      parts: [...scene.parts, receiving],
      joints: [...scene.joints, cross],
    })

    expect(qtyForOwner(after, 'cmp_1', 'screw-8x40')).toBe(beforeCabinet + screwJoint.screwCount)
    expect(qtyForOwner(after, null, 'screw-8x40')).toBe(0)
  })

  // The owner check read the direct parent, so a board one level down fell to Ungrouped and the
  // cabinet's screw count dropped — which is what the forthcoming drawer box would have done.
  it('attributes a nested board’s screws to its cabinet, not to Ungrouped', () => {
    const scene = piped(CARCASE_PRESETS[0].params, 'Base A')
    const screwed = scene.parts.find(
      (p) => p.kind === 'board' && p.cuts.some((c) => c.id.endsWith('_clearance')),
    )
    expect(screwed).toBeDefined()
    const before = qtyForOwner(scene, 'cmp_1', 'screw-8x40')

    const moved: Scene = {
      ...scene,
      components: [
        ...scene.components,
        {
          kind: 'group',
          id: 'cmp_wrap',
          label: 'Wrapper',
          parentId: 'cmp_1',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
        },
      ],
      parts: scene.parts.map((p) => (p.id === screwed!.id ? { ...p, parentId: 'cmp_wrap' } : p)),
    }

    expect(qtyForOwner(moved, 'cmp_1', 'screw-8x40')).toBe(before)
    expect(qtyForOwner(moved, null, 'screw-8x40')).toBe(0)
  })
})

describe('carcaseHardware — rows', () => {
  const twoCabinets = (): Scene => {
    const one = sceneOf(CARCASE_PRESETS[0].params, 'Base A')
    const other = sceneOf(CARCASE_PRESETS[1].params, 'Wall B')
    return regenerateComponents({
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [one.components[0], { ...other.components[0], id: 'cmp_2', label: 'Wall B' }],
    })
  }

  it('groups per cabinet rather than merging the job', () => {
    const lines = carcaseHardware(twoCabinets()).filter((l) => l.key === 'hinge-overlay')
    expect(lines.map((l) => [l.cabinetLabel, l.qty])).toEqual([
      ['Base A', 2],
      ['Wall B', 2],
    ])
  })

  it('orders cabinets as the scene holds them, then keys as the catalogue lists them', () => {
    const lines = carcaseHardware(reconcileJoints(twoCabinets()))
    expect(lines.map((l) => `${l.cabinetLabel}/${l.key}`)).toEqual([
      'Base A/hinge-overlay',
      'Base A/shelf-pin-5mm',
      'Base A/screw-8x40',
      'Wall B/hinge-overlay',
      'Wall B/shelf-pin-5mm',
      'Wall B/screw-8x40',
    ])
  })

  it('emits one line per cabinet and key, however many parts contributed', () => {
    const lines = carcaseHardware(reconcileJoints(sceneOf(CARCASE_PRESETS[0].params)))
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length)
  })

  // A cabinet mid-keystroke invalid keeps its last good parts, so it keeps its last good counts —
  // the same thing the scene tree and the 3D view show.
  it('keeps the last good counts for a cabinet whose parameters no longer build', () => {
    const good = reconcileJoints(sceneOf(CARCASE_PRESETS[0].params))
    const broken = regenerateComponents({
      ...good,
      components: good.components.map((c) =>
        c.kind === 'carcase' ? { ...c, params: { ...c.params, width: 0 } } : c,
      ),
    })
    expect(qtyOf(broken, 'hinge-overlay')).toBe(qtyOf(good, 'hinge-overlay'))
  })

  it('returns nothing for a scene with no cabinets', () => {
    expect(
      carcaseHardware({ parts: [], materials: {}, hardware: [], joints: [], components: [] }),
    ).toEqual([])
  })
})

// The box and the quote read one statement of the usable depth, so they cannot name different
// runners for the same cabinet. An inset cabinet is the case that separates them: its front sits
// inside the opening and takes its own thickness out of the depth before the box starts.
describe('carcaseHardware — the runner quoted is the runner the box is built to', () => {
  // 572 deep behind a 12 mm captured back is 560 clear, which takes the 550 nominal outright and
  // the 500 once an 18 mm inset front has had its share. A Base 600's 548 clear takes 500 either
  // way, so it cannot tell the two rules apart.
  const insetDrawer: CarcaseParams = {
    ...withDrawerBays(1),
    depth: 572,
    frontMount: 'inset',
  }

  it('quotes the nominal the box comes out at, not the one the clear depth alone would pick', () => {
    const scene = sceneOf(insetDrawer)
    const quoted = carcaseHardware(scene).filter((l) => l.key.startsWith('runner-'))
    expect(quoted.length).toBe(1)

    // The other side, built from the cabinet's own emitted panels — never from the quote.
    const back = scene.parts.find((p) => p.role === 'back') as BoardPart
    const front = scene.parts.find((p) => p.role?.startsWith('front-')) as BoardPart
    const box = drawerBoxMetrics(
      { x0: 18, x1: 582, z0: 18, z1: 400 },
      defaultDrawerParams('side-mount'),
      {
        clearDepth: clearDepth(insetDrawer, back.thickness),
        frontThickness: front.thickness,
        inset: true,
        sideThickness: 18,
      },
    )!
    expect(quoted[0].key).toBe(`runner-${box.box.y1 - box.box.y0}`)
    // Stated as well as agreed: two sides that had both lost the front's thickness would agree at
    // 450 just as happily.
    expect(quoted[0].key).toBe('runner-500')
  })

  // The mount is the only thing that changed, so an overlay cabinet of the same size must still
  // quote the full 550 — a deduction taken unconditionally would drop it to 500 here too.
  it('leaves an overlay cabinet of the same size on the longer runner', () => {
    const overlay: CarcaseParams = { ...insetDrawer, frontMount: 'overlay' }
    expect(qtyOf(sceneOf(overlay), 'runner-550')).toBe(1)
  })
})
