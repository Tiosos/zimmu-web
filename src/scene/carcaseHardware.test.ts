import { describe, it, expect } from 'vitest'
import { CARCASE_PRESETS, PRESET_MATERIALS, type CarcasePreset } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { hingeCount } from './frontMachining'
import { carcaseHardware } from './carcaseHardware'
import { splitSection } from './editSection'
import { setFrontOn } from './sectionInterior'
import type { CarcaseParams, MaterialDef, Scene } from './types'

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
