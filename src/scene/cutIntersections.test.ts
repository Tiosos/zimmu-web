import { describe, expect, it } from 'vitest'
import { cutIntersections } from './cutIntersections'
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

const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box',
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z',
  position: { x: 100, y: 100, z: 12 },
  size: { x: 60, y: 200, z: 6 },
  ...overrides,
})

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

describe('cut intersections', () => {
  it('does nothing for a board with no box cuts', () => {
    const board = boardOf()
    board.cuts = [hole()]
    expect(cutIntersections(board)).toEqual([])
  })

  it('does nothing for a single box cut', () => {
    const board = boardOf()
    board.cuts = [box()]
    expect(cutIntersections(board)).toEqual([])
  })

  it('leaves box × drilling to the drilling pass', () => {
    const board = boardOf()
    board.cuts = [box(), hole()]
    expect(cutIntersections(board)).toEqual([])
  })

  it('does nothing for round stock', () => {
    const scene = manufacturingProject()
    const round = scene.parts.find((p) => p.kind === 'cylinder')!
    const record = manufacturingParts([round], scene.materials, scene.components)[0]
    expect(cutIntersections(record)).toEqual([])
  })

  it('reports two boxes that share material', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'shelf', label: 'Shelf dado' }),
      box({ id: 'bottom', label: 'Bottom dado', position: { x: 130, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board)).toEqual([
      {
        code: 'cut-intersection-review',
        message:
          'Cut "Shelf dado" [shelf]: shares removed material with cut "Bottom dado" [bottom]; verify this is intended.',
        operation: {
          id: 'shelf',
          label: 'Shelf dado',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
    ])
  })

  it.each([
    [0, 0],
    [1e-7, 0],
    [1e-3, 1],
  ] as const)('allows contact within the tolerance and reports a real overlap: %s', (overlap, expected) => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 160 - overlap, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board)).toHaveLength(expected)
  })

  it('allows boxes separated through the thickness in either order', () => {
    const board = boardOf()
    for (const order of ['top-first', 'bottom-first'] as const) {
      const top = box({ id: 'top', position: { x: 100, y: 100, z: 12 } })
      const bottom = box({ id: 'bottom', position: { x: 100, y: 100, z: 0 } })
      board.cuts = order === 'top-first' ? [top, bottom] : [bottom, top]
      expect(cutIntersections(board)).toEqual([])
    }
  })

  it('allows boxes that touch on an edge only', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 160, y: 300, z: 12 } }),
    ]
    expect(cutIntersections(board)).toEqual([])
  })

  it('allows boxes that touch on a corner only', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 160, y: 300, z: 18 } }),
    ]
    expect(cutIntersections(board)).toEqual([])
  })

  it('reports two full-thickness crossing cuts once', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'across', position: { x: 100, y: 0, z: 0 }, size: { x: 20, y: 720, z: 18 } }),
      box({ id: 'along', position: { x: 0, y: 300, z: 0 }, size: { x: 560, y: 20, z: 18 } }),
    ]
    expect(cutIntersections(board)).toHaveLength(1)
  })

  it('reports one finding per overlapping pair in input order', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 150, y: 100, z: 12 } }),
      box({ id: 'c', position: { x: 140, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board).map((i) => i.message)).toEqual([
      'Cut "Shelf dado" [a]: shares removed material with cut "Shelf dado" [b]; verify this is intended.',
      'Cut "Shelf dado" [a]: shares removed material with cut "Shelf dado" [c]; verify this is intended.',
      'Cut "Shelf dado" [b]: shares removed material with cut "Shelf dado" [c]; verify this is intended.',
    ])
  })

  it('skips a non-finite box and still compares the finite boxes', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'broken', position: { x: NaN, y: 100, z: 12 } }),
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 130, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board).map((i) => i.operation.id)).toEqual(['a'])
  })

  it('reports a box that lies entirely inside another, on the contained cut', () => {
    const board = boardOf()
    board.cuts = [
      box({
        id: 'outer',
        label: 'Sink cut-out',
        position: { x: 0, y: 0, z: 0 },
        size: { x: 200, y: 200, z: 18 },
      }),
      box({
        id: 'inner',
        label: 'Tap hole pocket',
        position: { x: 50, y: 50, z: 0 },
        size: { x: 20, y: 20, z: 18 },
      }),
    ]
    expect(cutIntersections(board)).toEqual([
      {
        code: 'cut-redundant-review',
        message:
          'Cut "Tap hole pocket" [inner]: lies entirely inside cut "Sink cut-out" [outer]; it removes no additional material.',
        operation: {
          id: 'inner',
          label: 'Tap hole pocket',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
    ])
  })

  it('reports an identical repeat on the later cut', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'first', label: 'Pocket' }),
      box({ id: 'second', label: 'Pocket' }),
    ]
    expect(cutIntersections(board)).toEqual([
      {
        code: 'cut-redundant-review',
        message:
          'Cut "Pocket" [second]: repeats cut "Pocket" [first] at the same volume; one of the two can be removed.',
        operation: {
          id: 'second',
          label: 'Pocket',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
    ])
  })

  it('treats a 1e-7 size difference as an identical pair', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'first', label: 'Pocket' }),
      box({ id: 'second', label: 'Pocket', size: { x: 60 + 1e-7, y: 200, z: 6 } }),
    ]
    expect(cutIntersections(board).map((i) => [i.code, i.operation.id])).toEqual([
      ['cut-redundant-review', 'second'],
    ])
  })

  it('treats a box ending on the other face as contained', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'outer', position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 18 } }),
      box({ id: 'inner', position: { x: 100, y: 0, z: 0 }, size: { x: 100, y: 200, z: 18 } }),
    ]
    expect(cutIntersections(board).map((i) => i.code)).toEqual(['cut-redundant-review'])
  })

  it('reports a box that pokes out beyond the tolerance as an overlap', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'outer', position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 18 } }),
      box({ id: 'inner', position: { x: 100, y: 0, z: 0 }, size: { x: 100.001, y: 200, z: 18 } }),
    ]
    expect(cutIntersections(board).map((i) => i.code)).toEqual(['cut-intersection-review'])
  })

  it('reports a contained pair once, as a redundancy', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'outer', position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 18 } }),
      box({ id: 'inner', position: { x: 50, y: 50, z: 0 }, size: { x: 20, y: 20, z: 18 } }),
    ]
    expect(cutIntersections(board).map((i) => i.code)).toEqual(['cut-redundant-review'])
  })
})
