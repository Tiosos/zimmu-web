import { describe, expect, it } from 'vitest'
import type { BoardPart, BoxCut, CutDef, CylinderPart, HoleArrayCut, Part, Scene } from './types'
import { shapeKey } from './utils'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'

const board: BoardPart = {
  kind: 'board',
  id: 'board_test',
  label: 'Test',
  length: 200,
  width: 100,
  thickness: 25,
  grain: 'free' as const,
  material: '',
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
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
      parentId: null,
      driven: false,
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
    parentId: null,
    driven: false,
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

describe('shapeKey with hole arrays', () => {
  const holeArray: HoleArrayCut = {
    kind: 'hole-array',
    id: 'h1',
    label: 'Shelf pins L',
    face: '+X',
    axis: 'V',
    start: { x: 0, y: 37, z: 200 },
    pitch: 32,
    count: 10,
    diameter: 5,
    depth: 12,
  }

  const boxCut: BoxCut = {
    kind: 'box',
    id: 'c1',
    label: 'Dado',
    face: '+Z',
    position: { x: 0, y: 0, z: 0 },
    size: { x: 20, y: 20, z: 10 },
  }

  it('encodes a hole array', () => {
    const part = { ...board, cuts: [holeArray] }
    expect(shapeKey(part)).toContain('h:')
  })

  it('changes when the hole count changes', () => {
    const a = shapeKey({ ...board, cuts: [holeArray] })
    const b = shapeKey({ ...board, cuts: [{ ...holeArray, count: 11 }] })
    expect(a).not.toBe(b)
  })

  it('changes when the pitch changes', () => {
    const a = shapeKey({ ...board, cuts: [holeArray] })
    const b = shapeKey({ ...board, cuts: [{ ...holeArray, pitch: 25 }] })
    expect(a).not.toBe(b)
  })

  it('is stable across repeated calls', () => {
    expect(shapeKey({ ...board, cuts: [holeArray] })).toBe(
      shapeKey({ ...board, cuts: [holeArray] }),
    )
  })

  it('changes when face, axis, start, diameter, or depth changes', () => {
    const base = shapeKey({ ...board, cuts: [holeArray] })
    expect(shapeKey({ ...board, cuts: [{ ...holeArray, face: '-X' }] })).not.toBe(base)
    expect(shapeKey({ ...board, cuts: [{ ...holeArray, axis: 'U' }] })).not.toBe(base)
    expect(shapeKey({ ...board, cuts: [{ ...holeArray, start: { x: 1, y: 37, z: 200 } }] })).not.toBe(base) // prettier-ignore
    expect(shapeKey({ ...board, cuts: [{ ...holeArray, diameter: 8 }] })).not.toBe(base)
    expect(shapeKey({ ...board, cuts: [{ ...holeArray, depth: 10 }] })).not.toBe(base)
  })

  it('a hole array alongside a box cut changes the key — it is not silently dropped', () => {
    const boxOnly = shapeKey({ ...board, cuts: [boxCut] })
    const both = shapeKey({ ...board, cuts: [boxCut, holeArray] })
    expect(both).not.toBe(boxOnly)
  })

  it('does not change when only the label changes', () => {
    const a = shapeKey({ ...board, cuts: [holeArray] })
    const b = shapeKey({ ...board, cuts: [{ ...holeArray, label: 'Shelf pins R' }] })
    expect(a).toBe(b)
  })
})

// Thickness has two sources now — the material a panel names, and an override on the part — and
// only one of them reaches the geometry worker: the resolved number regeneration writes onto the
// part. `shapeKey` reads that, so a material getting thicker has to change the key of every panel
// made of it, or the cabinet would keep the geometry it was built with.
describe('shapeKey against a material that changes thickness', () => {
  const cabinetScene = (materials: Scene['materials']): Scene =>
    regenerateComponents({
      parts: [],
      materials,
      hardware: [],
      joints: [],
      components: [
        {
          kind: 'carcase',
          id: 'cmp_1',
          label: 'Base 600',
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
          params: CARCASE_PRESETS[0].params,
        },
      ],
    })

  // Two scenes identical but for one material's thickness.
  const thin = cabinetScene({ ...PRESET_MATERIALS })
  const thick = cabinetScene({ ...PRESET_MATERIALS, '18mm Ply': { thickness: 25 } })
  const keyOf = (scene: Scene, role: string) => shapeKey(scene.parts.find((p) => p.role === role)!)
  const sideOf = (scene: Scene) => scene.parts.find((p) => p.role === 'left-side')!

  it('gives every panel made of that material a different key', () => {
    for (const role of ['left-side', 'right-side', 'bottom', 'top']) {
      expect(keyOf(thick, role), role).not.toBe(keyOf(thin, role))
    }
  })

  it('reads the resolved thickness the part carries, which is why the key is right', () => {
    const before = sideOf(thin)
    const after = sideOf(thick)
    expect(before.kind === 'board' && before.thickness).toBe(18)
    expect(after.kind === 'board' && after.thickness).toBe(25)
  })

  // The back's own material did not move, but the opening it fills did: a panel between 25 mm
  // sides is narrower. Its key has to follow the panel, not the material.
  it('follows the panel, not the material, where a thicker side reshapes a panel of another', () => {
    expect(keyOf(thick, 'back')).not.toBe(keyOf(thin, 'back'))
  })
})
