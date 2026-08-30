import { describe, it, expect } from 'vitest'
import { cabinetSpaceBox } from './assembly'
import type {
  BoardPart,
  CarcaseComponent,
  Component,
  ComponentId,
  GroupComponent,
} from '../scene/types'
import { CARCASE_PRESETS } from '../scene/carcasePresets'

const cabinet: CarcaseComponent = {
  kind: 'carcase',
  id: 'cmp_1',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

const byId = new Map<ComponentId, Component>([[cabinet.id, cabinet]])

function board(over: Partial<BoardPart> = {}): BoardPart {
  return {
    kind: 'board',
    id: 'board_1',
    label: 'Left Side',
    length: 560,
    width: 720,
    thickness: 18,
    grain: 'length',
    material: '',
    color: '#c8a',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: cabinet.id,
    driven: true,
    ...over,
  }
}

describe('cabinetSpaceBox', () => {
  it('puts an unrotated board at its own position', () => {
    const b = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), byId, cabinet)
    expect(b.min).toEqual({ x: 10, y: 20, z: 30 })
    expect(b.max).toEqual({ x: 570, y: 740, z: 48 })
    expect(b.axisAligned).toBe(true)
  })

  // The carcase generator only ever emits rotations of 0 or ±90, so every driven panel is an
  // axis-aligned box in cabinet space even though most of them are "rotated".
  it('calls a 90-degree rotated board axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 90, z: 90 } }), byId, cabinet)
    expect(b.axisAligned).toBe(true)
  })

  // The mutation this exists for: a `rotation === 0` test would call this NOT axis-aligned and
  // silently exempt the part from occlusion, while its box is a perfectly ordinary rectangle.
  it('calls a 180-degree rotated board axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 0, z: 180 } }), byId, cabinet)
    expect(b.axisAligned).toBe(true)
    expect(b.max.x - b.min.x).toBeCloseTo(560, 6)
    expect(b.max.y - b.min.y).toBeCloseTo(720, 6)
  })

  it('calls a 30-degree rotated board not axis-aligned', () => {
    const b = cabinetSpaceBox(board({ rotation: { x: 0, y: 0, z: 30 } }), byId, cabinet)
    expect(b.axisAligned).toBe(false)
  })

  // The cabinet may sit anywhere in the scene. Its own projection must not move when it does.
  it('is unchanged by moving and rotating the cabinet itself', () => {
    const moved: CarcaseComponent = {
      ...cabinet,
      position: { x: 1000, y: -400, z: 90 },
      rotation: { x: 0, y: 0, z: 90 },
    }
    const movedById = new Map<ComponentId, Component>([[moved.id, moved]])
    const a = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), byId, cabinet)
    const b = cabinetSpaceBox(board({ position: { x: 10, y: 20, z: 30 } }), movedById, moved)
    expect(b.min.x).toBeCloseTo(a.min.x, 6)
    expect(b.min.y).toBeCloseTo(a.min.y, 6)
    expect(b.min.z).toBeCloseTo(a.min.z, 6)
    expect(b.max.x).toBeCloseTo(a.max.x, 6)
  })

  it('gives a cylinder the box its diameter and length imply', () => {
    const dowel = {
      kind: 'cylinder' as const,
      id: 'board_2',
      label: 'Dowel 1',
      diameter: 8,
      length: 40,
      material: '',
      color: '#ca8',
      position: { x: 100, y: 100, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
      visible: true,
      parentId: cabinet.id,
      driven: false,
    }
    const b = cabinetSpaceBox(dowel, byId, cabinet)
    expect(b.min).toEqual({ x: 96, y: 96, z: 0 })
    expect(b.max).toEqual({ x: 104, y: 104, z: 40 })
    // A cylinder is never an occluder: its box is not its shape.
    expect(b.axisAligned).toBe(false)
  })

  // A board can be axis-aligned in its OWN frame and not in the cabinet's: its rotation is zero,
  // but a group between it and the cabinet is turned 45 degrees. This is the case that separates
  // "read the corners" from "read the rotation" — every other fixture here is a multiple of 90,
  // which a rotation-based test gets right by luck.
  it('is not axis-aligned when an intervening group is rotated', () => {
    const group: GroupComponent = {
      kind: 'group',
      id: 'cmp_2',
      label: 'Skewed',
      parentId: cabinet.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 45 },
      rotationOrder: 'XYZ',
      visible: true,
    }
    const nested = new Map<ComponentId, Component>([
      [cabinet.id, cabinet],
      [group.id, group],
    ])
    const b = cabinetSpaceBox(board({ parentId: group.id }), nested, cabinet)
    expect(b.axisAligned).toBe(false)
  })
})
