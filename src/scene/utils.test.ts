import { describe, expect, it } from 'vitest'
import type { BoardPart, CutDef, CylinderPart, Part } from './types'
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

  it('ignores sourceJointId — not a geometry field', () => {
    const plain: CutDef = {
      kind: 'box',
      id: 'c1',
      label: 'Cut',
      face: '+Z',
      position: { x: 0, y: 0, z: 10 },
      size: { x: 20, y: 20, z: 10 },
    }
    const tagged: CutDef = { ...plain, sourceJointId: 'joint_x' }
    expect(shapeKey({ ...board, cuts: [tagged] })).toBe(shapeKey({ ...board, cuts: [plain] }))
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

  it('shapeKey for a cylinder encodes diameter and length only', () => {
    const dowel: Part = {
      kind: 'cylinder',
      id: 'd1',
      label: 'Dowel 1',
      diameter: 8,
      length: 100,
      material: '',
      color: '#888888',
      position: { x: 5, y: 6, z: 7 },
      rotation: { x: 10, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
    }
    expect(shapeKey(dowel)).toBe('cylinder|8|100|')
  })
})

function dowel(over: Partial<CylinderPart> = {}): CylinderPart {
  return {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 8,
    length: 100,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...over,
  }
}

describe('shapeKey — cylinder cuts', () => {
  it('changes when a cut is added', () => {
    const base = shapeKey(dowel())
    const withCut = shapeKey(
      dowel({
        cuts: [
          { kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 },
        ],
      }),
    )
    expect(withCut).not.toBe(base)
  })

  it('is stable regardless of cut array order', () => {
    const a = shapeKey(
      dowel({
        cuts: [
          { kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 },
          { kind: 'end', id: 'c2', label: 'End 2', end: '-Z', offset: 0, angle: 30, azimuth: 0 },
        ],
      }),
    )
    const b = shapeKey(
      dowel({
        cuts: [
          { kind: 'end', id: 'c2', label: 'End 2', end: '-Z', offset: 0, angle: 30, azimuth: 0 },
          { kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 },
        ],
      }),
    )
    expect(a).toBe(b)
  })

  it('ignores position/rotation', () => {
    const a = shapeKey(dowel())
    const b = shapeKey(dowel({ position: { x: 50, y: 0, z: 0 }, rotation: { x: 1, y: 0, z: 0 } }))
    expect(a).toBe(b)
  })
})
