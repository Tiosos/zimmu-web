import { describe, it, expect } from 'vitest'
import { worldBoundsOf } from './carcaseWorldBounds'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent } from './types'

const cab = (over: Partial<CarcaseComponent> = {}): CarcaseComponent => ({
  kind: 'carcase',
  id: 'cmp_a',
  label: 'A',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
  ...over,
})

describe('worldBoundsOf', () => {
  it('is the cabinet occupied box when it sits at the origin unrotated', () => {
    const b = worldBoundsOf(cab(), PRESET_MATERIALS)
    expect(b.x0).toBe(0)
    expect(b.x1).toBe(CARCASE_PRESETS[0].params.width)
    expect(b.z0).toBe(0)
  })

  it('translates by the component position', () => {
    const at = worldBoundsOf(cab({ position: { x: 100, y: 20, z: 5 } }), PRESET_MATERIALS)
    const origin = worldBoundsOf(cab(), PRESET_MATERIALS)
    expect(at.x0).toBeCloseTo(origin.x0 + 100, 9)
    expect(at.x1).toBeCloseTo(origin.x1 + 100, 9)
    expect(at.y0).toBeCloseTo(origin.y0 + 20, 9)
    expect(at.z0).toBeCloseTo(origin.z0 + 5, 9)
  })

  // The asymmetric case: a 90° turn must swap the x and y EXTENTS, which a square-footprint
  // fixture could never show. Base 600 is 600 wide and ~560 deep, so the two differ.
  it('swaps the footprint extents on a quarter turn', () => {
    const flat = worldBoundsOf(cab(), PRESET_MATERIALS)
    const turned = worldBoundsOf(cab({ rotation: { x: 0, y: 0, z: 90 } }), PRESET_MATERIALS)
    expect(turned.x1 - turned.x0).toBeCloseTo(flat.y1 - flat.y0, 6)
    expect(turned.y1 - turned.y0).toBeCloseTo(flat.x1 - flat.x0, 6)
  })

  it('leaves the height alone on a quarter turn about z', () => {
    const flat = worldBoundsOf(cab(), PRESET_MATERIALS)
    const turned = worldBoundsOf(cab({ rotation: { x: 0, y: 0, z: 90 } }), PRESET_MATERIALS)
    expect(turned.z1 - turned.z0).toBeCloseTo(flat.z1 - flat.z0, 9)
  })
})
