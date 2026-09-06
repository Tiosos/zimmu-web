import { describe, it, expect } from 'vitest'
import { CARCASE_PRESETS, PRESET_MATERIALS, type CarcasePreset } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { hingeCount } from './frontMachining'
import { carcaseHardware } from './carcaseHardware'
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
