import { describe, expect, it } from 'vitest'
import { cutWebs } from './cutWebs'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import type { BoxCut, MitreCut } from './types'

const boardOf = (): ManufacturingBoard => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board')
  scene.parts.forEach((p) => {
    p.cuts = []
  })
  return manufacturingParts(scene.parts, scene.materials, scene.components)[0] as ManufacturingBoard
}

// The manual board is 560 × 720 × 18. A default dado occupies x [100, 160], y [100, 300],
// z [12, 18]; `b` starts 2 mm to its right, which is a 2 mm web on x alone.
const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box',
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z',
  position: { x: 100, y: 100, z: 12 },
  size: { x: 60, y: 200, z: 6 },
  ...overrides,
})
const other = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  ...box({ id: 'bottom', label: 'Bottom dado', position: { x: 162, y: 100, z: 12 } }),
  ...overrides,
})

const messages = (board: ManufacturingBoard) => cutWebs(board).map((i) => i.message)

describe('cut webs', () => {
  it('reports two dados that leave a 2 mm web', () => {
    const board = boardOf()
    board.cuts = [box(), other()]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.00 mm with cut "Bottom dado" [bottom], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('is silent at the threshold and above it', () => {
    for (const gap of [3, 3.5, 40]) {
      const board = boardOf()
      board.cuts = [box(), other({ position: { x: 160 + gap, y: 100, z: 12 } })]
      expect(cutWebs(board)).toEqual([])
    }
  })

  it('is silent for dados that touch, which the overlap pass owns', () => {
    const board = boardOf()
    board.cuts = [box(), other({ position: { x: 160, y: 100, z: 12 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('measures a diagonal web as the three-axis distance', () => {
    const board = boardOf()
    // 2 mm in x and 2 mm in y: sqrt(8) = 2.828…, printed truncated as 2.82.
    board.cuts = [box(), other({ position: { x: 162, y: 302, z: 12 } })]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.82 mm with cut "Bottom dado" [bottom], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('never prints the threshold it says the web is below', () => {
    const board = boardOf()
    // 2.999 mm rounds to 3.00, which would read as "3.00 mm, thinner than the 3.00 mm minimum".
    board.cuts = [box(), other({ position: { x: 162.999, y: 100, z: 12 } })]
    expect(messages(board)[0]).toContain('leaves a web of 2.99 mm')
  })

  it('leaves a box at or below the exporter minimum alone', () => {
    const board = boardOf()
    board.cuts = [box(), other({ size: { x: 0.05, y: 200, z: 6 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('leaves a box with non-finite geometry to the geometry review', () => {
    const board = boardOf()
    board.cuts = [box(), other({ position: { x: Number.NaN, y: 100, z: 12 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('does nothing for round stock', () => {
    const scene = manufacturingProject()
    const round = scene.parts.find((p) => p.kind === 'cylinder')!
    expect(cutWebs(manufacturingParts([round], scene.materials, scene.components)[0])).toEqual([])
  })

  it('does nothing for a bevelled edge, which stays unassessed', () => {
    const board = boardOf()
    const mitre: MitreCut = { kind: 'mitre', id: 'bevel', label: 'Bevel', end: '+X', axis: 'Z', angle: 45 }
    board.cuts = [box(), mitre]
    expect(cutWebs(board)).toEqual([])
  })

  it('anchors each finding on the earlier cut and orders by it', () => {
    const board = boardOf()
    // 'toe' is far from 'dado' in y, so the only two thin pairs are toe×third and dado×third.
    // Walking (i, j) order therefore emits toe's finding before dado's, and both anchor on the
    // cut that comes first in `cuts`.
    board.cuts = [
      box({ id: 'toe', label: 'Toe notch', position: { x: 100, y: 100, z: 12 } }),
      box({ id: 'dado', label: 'Shelf dado', position: { x: 100, y: 400, z: 12 } }),
      box({ id: 'third', label: 'Third dado', position: { x: 162, y: 250, z: 12 } }),
    ]
    expect(cutWebs(board).map((i) => i.operation.id)).toEqual(['toe', 'dado'])
  })

  it('carries the anchor cut operation, with its component and joint provenance', () => {
    const board = boardOf()
    board.cuts = [
      box({ sourceJointId: 'joint-a', sourceComponentId: 'component-a' }),
      other(),
    ]
    expect(cutWebs(board)[0].operation).toEqual({
      id: 'dado',
      label: 'Shelf dado',
      kind: 'box',
      sourceComponentId: 'component-a',
      sourceJointId: 'joint-a',
    })
  })
})
