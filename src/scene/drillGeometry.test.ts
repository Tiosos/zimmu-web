import { describe, expect, it } from 'vitest'
import { holeSegment, rowDrillOf, segmentDistance } from './drillGeometry'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import type { HoleArrayCut } from './types'

// The manual board is 560 × 720 × 18 in part-local millimetres: local.x is the length, local.y the
// width, local.z the thickness.
const boardOf = (): ManufacturingBoard => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board')
  scene.parts.forEach((p) => {
    p.cuts = []
  })
  return manufacturingParts(scene.parts, scene.materials, scene.components)[0] as ManufacturingBoard
}

const row = (overrides: Partial<HoleArrayCut> = {}): HoleArrayCut => ({
  kind: 'hole-array',
  id: 'row',
  label: 'Shelf pins',
  face: '+Z',
  axis: 'U',
  start: { x: 200, y: 380, z: 18 },
  pitch: 32,
  count: 5,
  diameter: 5,
  depth: 12,
  ...overrides,
})

describe('drill geometry', () => {
  it('runs a hole from the +Z face inward, clipped to the stock thickness', () => {
    const drill = rowDrillOf(boardOf(), row())!
    expect(drill.depth).toBe('z')
    expect(drill.run).toBe('x')
    expect(drill.across).toBe('y')
    expect(drill.radius).toBe(2.5)
    expect([drill.axialLo, drill.axialHi]).toEqual([6, 18])
  })

  it('clips a through hole to the stock rather than to its nominal depth', () => {
    // 30 mm of travel on an 18 mm board stops at the back face; it does not reach z = -12.
    const drill = rowDrillOf(boardOf(), row({ depth: 30 }))!
    expect([drill.axialLo, drill.axialHi]).toEqual([0, 18])
  })

  it('runs a hole from a negative face from that face inward', () => {
    const drill = rowDrillOf(boardOf(), row({ face: '-Z', start: { x: 200, y: 380, z: 0 } }))!
    expect([drill.axialLo, drill.axialHi]).toEqual([0, 12])
  })

  it('refuses a row that cannot describe a lattice of cylinders', () => {
    const board = boardOf()
    expect(rowDrillOf(board, row({ diameter: 0 }))).toBeNull()
    expect(rowDrillOf(board, row({ depth: Number.NaN }))).toBeNull()
    expect(rowDrillOf(board, row({ count: 0 }))).toBeNull()
    expect(rowDrillOf(board, row({ count: 2.5 }))).toBeNull()
    expect(rowDrillOf(board, row({ pitch: Number.NaN }))).toBeNull()
    expect(rowDrillOf(board, row({ count: 3, pitch: 0 }))).toBeNull()
    expect(rowDrillOf(board, row({ start: { x: Number.NaN, y: 380, z: 18 } }))).toBeNull()
    // A single hole may legitimately carry a zero pitch.
    expect(rowDrillOf(board, row({ count: 1, pitch: 0 }))).not.toBeNull()
  })

  it('gives a hole a finite centreline segment on its own lattice step', () => {
    const drill = rowDrillOf(boardOf(), row())!
    expect(holeSegment(drill, 0)).toEqual([
      { x: 200, y: 380, z: 6 },
      { x: 200, y: 380, z: 18 },
    ])
    expect(holeSegment(drill, 2)).toEqual([
      { x: 264, y: 380, z: 6 },
      { x: 264, y: 380, z: 18 },
    ])
  })

  it('measures the distance between parallel, skew and degenerate segments', () => {
    const point = (x: number, y: number, z: number) => ({ x, y, z })
    // Parallel, offset in x and overlapping in z.
    expect(
      segmentDistance(point(0, 0, 0), point(0, 0, 10), point(5, 0, 0), point(5, 0, 10)),
    ).toBeCloseTo(5)
    // Parallel, also separated in z: the clamped ends give the diagonal.
    expect(
      segmentDistance(point(0, 0, 0), point(0, 0, 10), point(5, 0, 20), point(5, 0, 30)),
    ).toBeCloseTo(Math.hypot(5, 10))
    // Perpendicular and meeting.
    expect(segmentDistance(point(0, 0, 0), point(10, 0, 0), point(5, -5, 0), point(5, 5, 0))).toBe(
      0,
    )
    // Perpendicular with a 3 mm miss.
    expect(
      segmentDistance(point(0, 0, 0), point(10, 0, 0), point(5, -5, 3), point(5, 5, 3)),
    ).toBeCloseTo(3)
    // Two points.
    expect(segmentDistance(point(0, 0, 0), point(0, 0, 0), point(3, 4, 0), point(3, 4, 0))).toBe(5)
  })
})
