import { describe, expect, it } from 'vitest'
import type { BoardPart, CutDef } from './types'
import { shapeKey } from './utils'

const board: BoardPart = {
  kind: 'board',
  id: 'board_test',
  label: 'Test',
  length: 200,
  width: 100,
  thickness: 25,
  material: '',
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}

describe('shapeKey', () => {
  it('encodes kind and dimensions', () => {
    expect(shapeKey(board)).toBe('board|200|100|25|')
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

  it('no cuts — trailing pipe, empty segment', () => {
    expect(shapeKey(board)).toBe('board|200|100|25|')
  })

  it('one cut — encodes position and size', () => {
    const boardWithCut: BoardPart = {
      ...board,
      cuts: [
        {
          kind: 'box',
          id: 'cut_a',
          label: 'Cut 1',
          face: '+Z',
          position: { x: 90, y: 40, z: 15 },
          size: { x: 20, y: 20, z: 10 },
        },
      ],
    }
    expect(shapeKey(boardWithCut)).toBe('board|200|100|25|b:90,40,15|20,20,10')
  })

  it('encodes a mitre cut by end, axis, and angle', () => {
    const m: BoardPart = {
      ...board,
      cuts: [{ kind: 'mitre', id: 'm1', label: 'Mitre', end: '+X', axis: 'Z', angle: 45 }],
    }
    expect(shapeKey(m)).toBe('board|200|100|25|m:+X|Z|45')
  })

  it('changes when mitre angle, axis, or end changes', () => {
    const base: BoardPart = {
      ...board,
      cuts: [{ kind: 'mitre', id: 'm1', label: 'Mitre', end: '+X', axis: 'Z', angle: 45 }],
    }
    const angle: BoardPart = { ...base, cuts: [{ ...base.cuts[0], angle: 30 } as CutDef] }
    const axis: BoardPart = { ...base, cuts: [{ ...base.cuts[0], axis: 'Y' } as CutDef] }
    const end: BoardPart = { ...base, cuts: [{ ...base.cuts[0], end: '-X' } as CutDef] }
    expect(shapeKey(base)).not.toBe(shapeKey(angle))
    expect(shapeKey(base)).not.toBe(shapeKey(axis))
    expect(shapeKey(base)).not.toBe(shapeKey(end))
  })

  it('two cuts — sorted by id regardless of insertion order', () => {
    const cutA: CutDef = {
      kind: 'box',
      id: 'aaa',
      label: 'A',
      face: '+Z',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 10, y: 10, z: 10 },
    }
    const cutB: CutDef = {
      kind: 'box',
      id: 'bbb',
      label: 'B',
      face: '+X',
      position: { x: 1, y: 1, z: 1 },
      size: { x: 5, y: 5, z: 5 },
    }
    const order1: BoardPart = { ...board, cuts: [cutA, cutB] }
    const order2: BoardPart = { ...board, cuts: [cutB, cutA] }
    expect(shapeKey(order1)).toBe(shapeKey(order2))
  })

  it('excludes face and label — geometry only', () => {
    const cutFaceA: CutDef = {
      kind: 'box',
      id: 'cut_1',
      label: 'Dado',
      face: '+Z',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 20, y: 20, z: 10 },
    }
    const cutFaceB: CutDef = {
      kind: 'box',
      id: 'cut_1',
      label: 'Other',
      face: '-X',
      position: { x: 0, y: 0, z: 0 },
      size: { x: 20, y: 20, z: 10 },
    }
    expect(shapeKey({ ...board, cuts: [cutFaceA] })).toBe(shapeKey({ ...board, cuts: [cutFaceB] }))
  })

  it('changes when cut position changes', () => {
    const base: BoardPart = {
      ...board,
      cuts: [
        {
          kind: 'box',
          id: 'c1',
          label: 'C',
          face: '+Z',
          position: { x: 0, y: 0, z: 0 },
          size: { x: 10, y: 10, z: 10 },
        },
      ],
    }
    const moved: BoardPart = {
      ...board,
      cuts: [
        {
          kind: 'box',
          id: 'c1',
          label: 'C',
          face: '+Z',
          position: { x: 1, y: 0, z: 0 },
          size: { x: 10, y: 10, z: 10 },
        },
      ],
    }
    expect(shapeKey(base)).not.toBe(shapeKey(moved))
  })

  it('changes when cut size changes', () => {
    const base: BoardPart = {
      ...board,
      cuts: [
        {
          kind: 'box',
          id: 'c1',
          label: 'C',
          face: '+Z',
          position: { x: 0, y: 0, z: 0 },
          size: { x: 10, y: 10, z: 10 },
        },
      ],
    }
    const resized: BoardPart = {
      ...board,
      cuts: [
        {
          kind: 'box',
          id: 'c1',
          label: 'C',
          face: '+Z',
          position: { x: 0, y: 0, z: 0 },
          size: { x: 15, y: 10, z: 10 },
        },
      ],
    }
    expect(shapeKey(base)).not.toBe(shapeKey(resized))
  })
})
