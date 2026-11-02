import { describe, expect, it } from 'vitest'
import { drillingIntersections } from './drillingIntersections'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import type { BoxCut, HoleArrayCut } from './types'

const boardOf = (): ManufacturingBoard => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board')
  scene.parts.forEach((p) => {
    p.cuts = []
  })
  return manufacturingParts(scene.parts, scene.materials, scene.components)[0] as ManufacturingBoard
}
const hole = (overrides: Partial<HoleArrayCut> = {}): HoleArrayCut => ({
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
const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box' as const,
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z' as const,
  position: { x: 230, y: 330, z: 12 },
  size: { x: 60, y: 100, z: 6 },
  ...overrides,
})

describe('drilling intersections', () => {
  it('reports the contiguous hole range that breaks into a box cut', () => {
    const board = boardOf()
    board.cuts = [hole(), box()]
    expect(drillingIntersections(board, new Set()).map((i) => [i.code, i.detail])).toEqual([
      [
        'drilling-intersection',
        'holes 2–3 of 5 intersect cut "Shelf dado" [dado]; the opening is broken.',
      ],
    ])
  })
  it('ignores tangency and overlap within 1e-6 mm', () => {
    for (const [overlap, expected] of [
      [0, 0],
      [1e-7, 0],
      [1e-3, 1],
    ] as const) {
      const board = boardOf()
      board.cuts = [
        hole({ count: 1, pitch: 0 }),
        box({ position: { x: 202.5 - overlap, y: 330, z: 12 } }),
      ]
      expect(drillingIntersections(board, new Set())).toHaveLength(expected)
    }
  })
  it('treats a box cut with any size at or below 0.1 mm as absent', () => {
    const board = boardOf()
    board.cuts = [
      hole({ count: 1, pitch: 0 }),
      // The thin box must straddle the hole, or the test would pass without the size skip.
      box({ position: { x: 202, y: 379.975, z: 12 }, size: { x: 60, y: 0.05, z: 6 } }),
    ]
    expect(drillingIntersections(board, new Set())).toEqual([])
  })
  it('skips cuts whose volume is undefined', () => {
    const board = boardOf()
    board.cuts = [hole(), box()]
    expect(drillingIntersections(board, new Set(['row']))).toEqual([])
  })
  it('answers a huge row by arithmetic, not by enumerating it', () => {
    const board = boardOf()
    board.cuts = [
      hole({ count: 1_000_000_000, pitch: 32, diameter: 3, start: { x: 0, y: 380, z: 18 } }),
      box(),
    ]
    const issues = drillingIntersections(board, new Set())
    expect(issues).toHaveLength(1)
    expect(issues[0].detail).toBe(
      'holes 9–10 of 1000000000 intersect cut "Shelf dado" [dado]; the opening is broken.',
    )
  })
  it('still intersects a row that is out of bounds', () => {
    const board = boardOf()
    board.cuts = [hole({ count: 1000 }), box()]
    expect(drillingIntersections(board, new Set())).toHaveLength(1)
  })
})
