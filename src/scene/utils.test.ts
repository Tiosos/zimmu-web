import { describe, expect, it } from 'vitest'
import type { BoardPart } from './types'
import { shapeKey } from './utils'

const board: BoardPart = {
  kind: 'board',
  id: 'board_test',
  label: 'Test',
  length: 200,
  width: 100,
  thickness: 25,
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
}

describe('shapeKey', () => {
  it('encodes kind and dimensions', () => {
    expect(shapeKey(board)).toBe('board|200|100|25')
  })

  it('changes when length changes', () => {
    expect(shapeKey({ ...board, length: 300 })).not.toBe(shapeKey(board))
  })

  it('changes when width changes', () => {
    expect(shapeKey({ ...board, width: 50 })).not.toBe(shapeKey(board))
  })

  it('changes when thickness changes', () => {
    expect(shapeKey({ ...board, thickness: 10 })).not.toBe(shapeKey(board))
  })

  it('does not change when position changes', () => {
    expect(shapeKey({ ...board, position: { x: 10, y: 20, z: 30 } })).toBe(shapeKey(board))
  })

  it('does not change when label or color changes', () => {
    expect(shapeKey({ ...board, label: 'X', color: '#fff' })).toBe(shapeKey(board))
  })
})
