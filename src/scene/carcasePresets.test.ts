import { describe, it, expect } from 'vitest'
import { CARCASE_PRESETS, PRESET_MATERIALS, type CarcasePreset } from './carcasePresets'
import { carcaseRoles, validateCarcaseParams } from './carcaseRoles'
import { regenerateComponents } from './regenerateComponents'
import { roleThicknessFor } from './resolveThickness'
import type { Scene } from './types'

// The scene a new file starts from: empty except for the material definitions seeded with it. A
// preset names its materials rather than carrying thicknesses, so dropped into a scene that has
// never heard of those names not one panel resolves — the cabinet would fail validation and never
// appear. These tests drop each preset into that scene rather than into a hand-built one.
const freshScene = (preset: CarcasePreset): Scene => ({
  parts: [],
  materials: { ...PRESET_MATERIALS },
  hardware: [],
  joints: [],
  components: [
    {
      kind: 'carcase',
      id: 'cmp_1',
      label: preset.name,
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params: preset.params,
    },
  ],
})

const PRESET_CASES = CARCASE_PRESETS.map((p) => [p.name, p] as const)

describe('CARCASE_PRESETS', () => {
  it.each(PRESET_CASES)('%s validates with no errors in a fresh scene', (_name, preset) => {
    const scene = freshScene(preset)
    expect(
      validateCarcaseParams(
        preset.params,
        roleThicknessFor(preset.params, scene.materials, new Map()),
      ),
    ).toEqual([])
  })

  it.each(PRESET_CASES)('%s generates panels in a fresh scene', (_name, preset) => {
    const scene = freshScene(preset)
    expect(
      carcaseRoles(preset.params, roleThicknessFor(preset.params, scene.materials, new Map()))
        .length,
    ).toBeGreaterThan(0)
  })

  // Through the pipeline the app runs, not just the generator: a preset that resolves but emits
  // nothing would still leave the user staring at an empty cabinet.
  it.each(PRESET_CASES)('%s emits driven parts through regeneration', (_name, preset) => {
    const parts = regenerateComponents(freshScene(preset)).parts
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.every((p) => p.driven)).toBe(true)
  })

  it('names every preset uniquely', () => {
    const names = CARCASE_PRESETS.map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('seeds a material, with a thickness, for every slot a preset names', () => {
    for (const preset of CARCASE_PRESETS) {
      for (const name of [preset.params.carcaseMaterial, preset.params.backMaterial]) {
        expect(PRESET_MATERIALS[name]?.thickness, `${preset.name}: ${name}`).toBeGreaterThan(0)
      }
    }
  })
})
