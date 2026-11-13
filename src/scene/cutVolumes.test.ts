import { describe, expect, it } from 'vitest'
import { boxGeometryIsFinite, boxVolumeOf } from './cutVolumes'
import type { BoxCut } from './types'

const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box',
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z',
  position: { x: 10, y: 20, z: 12 },
  size: { x: 60, y: 100, z: 6 },
  ...overrides,
})

describe('box cut volumes', () => {
  it('builds the removed box from position and size', () => {
    expect(boxVolumeOf(box())).toEqual({
      min: { x: 10, y: 20, z: 12 },
      max: { x: 70, y: 120, z: 18 },
    })
  })

  it('treats a box at or below the exporter minimum as absent', () => {
    for (const size of [0, -1, 0.05, 0.1]) {
      expect(boxVolumeOf(box({ size: { x: size, y: 100, z: 6 } }))).toBeNull()
    }
  })

  it('treats a non-finite position or size as absent', () => {
    expect(boxVolumeOf(box({ position: { x: NaN, y: 20, z: 12 } }))).toBeNull()
    expect(boxVolumeOf(box({ size: { x: Infinity, y: 100, z: 6 } }))).toBeNull()
  })

  it('separates invalid geometry from an absent box', () => {
    expect(boxGeometryIsFinite(box())).toBe(true)
    expect(boxGeometryIsFinite(box({ position: { x: NaN, y: 20, z: 12 } }))).toBe(false)
    expect(boxGeometryIsFinite(box({ size: { x: Infinity, y: 100, z: 6 } }))).toBe(false)
    expect(boxGeometryIsFinite(box({ size: { x: -Infinity, y: 100, z: 6 } }))).toBe(false)
    expect(boxGeometryIsFinite(box({ size: { x: 0.05, y: 100, z: 6 } }))).toBe(true)
  })
})
