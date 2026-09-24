import { describe, it, expect } from 'vitest'
import { turnedInPlace } from './turnCabinet'
import { worldBoundsOf } from './carcaseWorldBounds'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent } from './types'

// Asymmetric: 600 wide against ~578 occupied depth, so a quarter turn visibly changes the extents.
const cab = (over: Partial<CarcaseComponent> = {}): CarcaseComponent => ({
  kind: 'carcase',
  id: 'cmp_a',
  label: 'A',
  parentId: null,
  position: { x: 1000, y: 400, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
  ...over,
})

const centre = (c: CarcaseComponent) => {
  const b = worldBoundsOf(c, PRESET_MATERIALS)
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
}

describe('turnedInPlace', () => {
  it('adds the turn to the cabinet rotation', () => {
    expect(turnedInPlace(cab(), PRESET_MATERIALS, 90).rotation.z).toBe(90)
  })

  it('keeps the footprint centre where it was', () => {
    const before = cab()
    const after = turnedInPlace(before, PRESET_MATERIALS, 90)
    expect(centre(after).x).toBeCloseTo(centre(before).x, 6)
    expect(centre(after).y).toBeCloseTo(centre(before).y, 6)
  })

  // The regression the compensation exists to prevent: rotating about the local origin alone moves
  // the box by most of its own size.
  it('moves the position, because the box turns about its own origin', () => {
    const before = cab()
    const after = turnedInPlace(before, PRESET_MATERIALS, 90)
    expect(after.position).not.toEqual(before.position)
  })

  it('swaps the footprint extents', () => {
    const before = cab()
    const b0 = worldBoundsOf(before, PRESET_MATERIALS)
    const b1 = worldBoundsOf(turnedInPlace(before, PRESET_MATERIALS, 90), PRESET_MATERIALS)
    expect(b1.x1 - b1.x0).toBeCloseTo(b0.y1 - b0.y0, 6)
    expect(b1.y1 - b1.y0).toBeCloseTo(b0.x1 - b0.x0, 6)
  })

  it('wraps at a full turn rather than growing without bound', () => {
    const turned = turnedInPlace(cab({ rotation: { x: 0, y: 0, z: 270 } }), PRESET_MATERIALS, 90)
    expect(turned.rotation.z).toBe(0)
  })

  it('returns to the starting box after four quarter turns', () => {
    const start = cab()
    let c = start
    for (let i = 0; i < 4; i++) c = turnedInPlace(c, PRESET_MATERIALS, 90)
    const a = worldBoundsOf(start, PRESET_MATERIALS)
    const b = worldBoundsOf(c, PRESET_MATERIALS)
    expect(b.x0).toBeCloseTo(a.x0, 6)
    expect(b.y0).toBeCloseTo(a.y0, 6)
  })

  it('leaves the height alone', () => {
    const b0 = worldBoundsOf(cab(), PRESET_MATERIALS)
    const b1 = worldBoundsOf(turnedInPlace(cab(), PRESET_MATERIALS, 90), PRESET_MATERIALS)
    expect(b1.z0).toBeCloseTo(b0.z0, 9)
    expect(b1.z1 - b1.z0).toBeCloseTo(b0.z1 - b0.z0, 9)
  })
})
