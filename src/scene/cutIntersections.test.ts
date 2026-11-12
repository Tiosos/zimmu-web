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
})
