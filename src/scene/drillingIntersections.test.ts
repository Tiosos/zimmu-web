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
  it('reports a hole that lies wholly inside a cut instead of a collision', () => {
    const board = boardOf()
    board.cuts = [
      hole(),
      box({
        id: 'pocket',
        label: 'Pocket',
        position: { x: 250, y: 330, z: 6 },
        size: { x: 32, y: 100, z: 12 },
      }),
    ]
    expect(drillingIntersections(board, new Set()).map((i) => [i.code, i.detail])).toEqual([
      [
        'drilling-redundant',
        'hole 3 of 5 lies entirely inside cut "Pocket" [pocket]; no hole will remain.',
      ],
    ])
  })
  it('splits a partly voided, partly clipped row into redundant then clipped', () => {
    const board = boardOf()
    board.cuts = [
      hole({ pitch: 20, count: 5, diameter: 10 }),
      box({
        id: 'pocket',
        label: 'Pocket',
        position: { x: 240, y: 330, z: 6 },
        size: { x: 50, y: 100, z: 12 },
      }),
    ]
    expect(drillingIntersections(board, new Set()).map((i) => i.code)).toEqual([
      'drilling-redundant',
      'drilling-intersection',
    ])
  })
  it('reports redundant then clipped runs when holes are voided on both sides', () => {
    const board = boardOf()
    board.cuts = [
      hole(),
      box({
        id: 'pocket',
        label: 'Pocket',
        position: { x: 231, y: 330, z: 6 },
        size: { x: 96, y: 100, z: 12 },
      }),
    ]
    expect(drillingIntersections(board, new Set()).map((i) => [i.code, i.detail])).toEqual([
      [
        'drilling-redundant',
        'holes 3–4 of 5 lie entirely inside cut "Pocket" [pocket]; no hole will remain.',
      ],
      [
        'drilling-intersection',
        'hole 2 of 5 intersects cut "Pocket" [pocket]; the opening is broken.',
      ],
      [
        'drilling-intersection',
        'hole 5 of 5 intersects cut "Pocket" [pocket]; the opening is broken.',
      ],
    ])
  })
  it('words a single fully voided hole in the singular', () => {
    const board = boardOf()
    board.cuts = [
      hole({ count: 1, pitch: 0 }),
      box({
        id: 'pocket',
        label: 'Pocket',
        position: { x: 196, y: 376, z: 6 },
        size: { x: 8, y: 8, z: 12 },
      }),
    ]
    expect(drillingIntersections(board, new Set()).map((i) => [i.code, i.detail])).toEqual([
      [
        'drilling-redundant',
        'the hole lies entirely inside cut "Pocket" [pocket]; no hole will remain.',
      ],
    ])
  })

  const one = (overrides: Partial<HoleArrayCut> = {}) => hole({ count: 1, pitch: 0, ...overrides })

  it('allows a stepped coaxial pair and reviews an identical one', () => {
    const stepped = boardOf()
    stepped.cuts = [one(), one({ id: 'cup', label: 'Cup', depth: 8 })]
    expect(drillingIntersections(stepped, new Set())).toEqual([])

    const duplicate = boardOf()
    duplicate.cuts = [one(), one({ id: 'cup', label: 'Cup' })]
    expect(drillingIntersections(duplicate, new Set()).map((i) => [i.code, i.detail])).toEqual([
      [
        'drilling-overlap-review',
        'the hole repeats drilling "Cup" [cup] at the same position and diameter; verify this is intended.',
      ],
    ])
  })
  it('reviews identical drills from opposite faces and blocks unequal ones that meet', () => {
    const identical = boardOf()
    identical.cuts = [one({ depth: 9 }), one({ id: 'back', label: 'Back', face: '-Z', depth: 9 })]
    expect(drillingIntersections(identical, new Set()).map((i) => i.code)).toEqual([
      'drilling-overlap-review',
    ])

    const meeting = boardOf()
    meeting.cuts = [one({ depth: 12 }), one({ id: 'back', label: 'Back', face: '-Z', depth: 8 })]
    expect(drillingIntersections(meeting, new Set()).map((i) => i.code)).toEqual([
      'drilling-intersection',
    ])
  })
  it('leaves two identical blind bores from opposite ends as separate features', () => {
    const board = boardOf()
    board.cuts = [one({ depth: 4 }), one({ id: 'back', label: 'Back', face: '-Z', depth: 4 })]
    expect(drillingIntersections(board, new Set())).toEqual([])
  })
  it('blocks holes from adjacent faces that meet at a corner', () => {
    const board = boardOf()
    board.cuts = [
      one({ id: 'edge', label: 'Edge', face: '+X', start: { x: 560, y: 4, z: 4 } }),
      one({ id: 'face', label: 'Face', depth: 18, start: { x: 555, y: 4, z: 18 } }),
    ]
    expect(drillingIntersections(board, new Set()).map((i) => i.code)).toEqual([
      'drilling-intersection',
    ])

    const missing = boardOf()
    missing.cuts = [
      one({ id: 'edge', label: 'Edge', face: '+X', start: { x: 560, y: 4, z: 4 } }),
      one({ id: 'face', label: 'Face', depth: 18, start: { x: 540, y: 4, z: 18 } }),
    ]
    expect(drillingIntersections(missing, new Set())).toEqual([])
  })
  it('reviews crossing rows that share an identical hole position', () => {
    const board = boardOf()
    board.cuts = [
      hole({ id: 'a', label: 'Row A', start: { x: 204, y: 300, z: 18 }, count: 4 }),
      hole({ id: 'b', label: 'Row B', axis: 'V', start: { x: 300, y: 108, z: 18 }, count: 7 }),
    ]
    expect(drillingIntersections(board, new Set()).map((i) => i.detail)).toEqual([
      'hole 4 of 4 repeats drilling "Row B" [b] at the same position and diameter; verify this is intended.',
    ])
  })
  it('answers a dense row pair with one conservative finding instead of per-hole work', () => {
    const board = boardOf()
    board.cuts = [
      hole({
        id: 'a',
        label: 'Row A',
        start: { x: 300, y: 300, z: 18 },
        count: 1000,
        pitch: 0.005,
      }),
      hole({
        id: 'b',
        label: 'Row B',
        axis: 'V',
        start: { x: 300, y: 300, z: 18 },
        count: 1000,
        pitch: 0.005,
      }),
    ]
    const issues = drillingIntersections(board, new Set())
    expect(issues.map((i) => i.cut.id)).toEqual(['a', 'b', 'a'])
    expect(issues[1].detail).toContain('adjacent holes overlap (pitch 0.005 mm, diameter 5 mm)')
    expect(issues[2].detail).toBe(
      'holes 1–1000 of 1000 break into drilling "Row B" [b]; the opening is broken.',
    )
  })
  it('blocks adjacent holes in one row whose openings merge', () => {
    const board = boardOf()
    board.cuts = [hole({ pitch: 4, count: 3, diameter: 5 })]
    expect(drillingIntersections(board, new Set()).map((i) => [i.code, i.detail])).toEqual([
      [
        'drilling-intersection',
        'adjacent holes overlap (pitch 4 mm, diameter 5 mm); the openings merge into a continuous slot.',
      ],
    ])
  })
  it('answers two huge rows without enumerating either', () => {
    const board = boardOf()
    board.cuts = [
      hole({ id: 'a', label: 'Row A', start: { x: 204, y: 300, z: 18 }, count: 1_000_000_000 }),
      hole({
        id: 'b',
        label: 'Row B',
        axis: 'V',
        start: { x: 300, y: 108, z: 18 },
        count: 1_000_000_000,
      }),
    ]
    expect(drillingIntersections(board, new Set())).toHaveLength(1)
  })
})
