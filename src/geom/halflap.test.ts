import { test, expect } from 'vitest'
import type { BoardPart, HalfLapJoint, Part } from '../scene/types'
import { isValidHalfLap, stackAxis, worldAabb, deriveHalfLap } from './halflap'

const A: BoardPart = {
  kind: 'board',
  id: 'A',
  label: 'A',
  length: 200,
  width: 40,
  thickness: 20,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
}
const B: BoardPart = {
  ...A,
  id: 'B',
  label: 'B',
  length: 40,
  width: 200,
  position: { x: 80, y: -80, z: 0 },
}
const parts: Part[] = [A, B]
const joint: HalfLapJoint = {
  kind: 'halflap',
  id: 'j1',
  label: 'Half-lap 1',
  driven: false,
  partAId: 'A',
  partBId: 'B',
  split: 0.5,
  clearance: 0,
}

test('stackAxis / worldAabb for an axis-aligned board', () => {
  expect(stackAxis(A)).toBe('z')
  expect(worldAabb(A)).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 200, y: 40, z: 20 } })
})

test('worldAabb / stackAxis for a Rz=90 board', () => {
  const C: BoardPart = { ...A, id: 'C', rotation: { x: 0, y: 0, z: 90 } }
  expect(stackAxis(C)).toBe('z')
  const bb = worldAabb(C)
  expect(bb.min.x).toBeCloseTo(-40, 6)
  expect(bb.max.x).toBeCloseTo(0, 6)
  expect(bb.min.y).toBeCloseTo(0, 6)
  expect(bb.max.y).toBeCloseTo(200, 6)
})

// worldAabb is a pure function of a board's immutable geometry, and the scene rebuilds it on every
// pair in two O(n^2) walks. Memoizing on object identity is safe because an edit replaces the part
// with a new object. The referential-equality check is the proof of a cache hit — a fresh compute
// would return a new object each call.
test('worldAabb memoizes per board object', () => {
  const first = worldAabb(A)
  expect(worldAabb(A)).toBe(first)
  // A structurally-equal but distinct object is a different key, so it recomputes to an equal value.
  const clone: BoardPart = { ...A }
  const cloned = worldAabb(clone)
  expect(cloned).not.toBe(first)
  expect(cloned).toEqual(first)
})

test('isValidHalfLap: coplanar equal-thickness overlapping boards are valid', () => {
  expect(isValidHalfLap(A, B)).toBe(true)
})

test('isValidHalfLap: a z-offset (non-coplanar) board is invalid', () => {
  expect(isValidHalfLap(A, { ...B, position: { x: 80, y: -80, z: 5 } })).toBe(false)
})

test('isValidHalfLap: unequal thickness is invalid', () => {
  expect(isValidHalfLap(A, { ...B, thickness: 25 })).toBe(false)
})

test('isValidHalfLap: disjoint footprints are invalid', () => {
  expect(isValidHalfLap(A, { ...B, position: { x: 400, y: -80, z: 0 } })).toBe(false)
})

test('isValidHalfLap: a non-axis-aligned (45° about Z) board is invalid', () => {
  expect(isValidHalfLap(A, { ...B, rotation: { x: 0, y: 0, z: 45 } })).toBe(false)
})

test('deriveHalfLap: complementary corner cuts, one per board, no seat', () => {
  const r = deriveHalfLap(joint, parts)
  expect(r).not.toBeNull()
  expect(r!.seat).toBeUndefined()
  expect(r!.cuts).toHaveLength(2)
  const cutA = r!.cuts.find((c) => c.partId === 'A')!.cut
  const cutB = r!.cuts.find((c) => c.partId === 'B')!.cut
  expect(cutA.id).toBe('cut_j1_lapA')
  expect(cutA.position).toEqual({ x: 80, y: 0, z: 10 })
  expect(cutA.size).toEqual({ x: 40, y: 40, z: 10 })
  expect(cutA.sourceJointId).toBe('j1')
  expect(cutB.id).toBe('cut_j1_lapB')
  expect(cutB.position).toEqual({ x: 0, y: 80, z: 0 })
  expect(cutB.size).toEqual({ x: 40, y: 40, z: 10 })
  expect(cutA.label).toBe('Half-lap 1 lap A')
  expect(cutB.label).toBe('Half-lap 1 lap B')
})

test('deriveHalfLap: split shifts the shared plane', () => {
  const r = deriveHalfLap({ ...joint, split: 0.25 }, parts)!
  const cutA = r.cuts.find((c) => c.partId === 'A')!.cut
  expect(cutA.position.z).toBeCloseTo(5, 6)
  expect(cutA.size.z).toBeCloseTo(15, 6)
})

test('deriveHalfLap: clearance deepens each notch past the mid-plane', () => {
  const r = deriveHalfLap({ ...joint, clearance: 2 }, parts)!
  const cutA = r.cuts.find((c) => c.partId === 'A')!.cut
  const cutB = r.cuts.find((c) => c.partId === 'B')!.cut
  expect(cutA.position.z).toBeCloseTo(8, 6)
  expect(cutA.size.z).toBeCloseTo(12, 6)
  expect(cutB.position.z).toBeCloseTo(0, 6)
  expect(cutB.size.z).toBeCloseTo(12, 6)
})

test('deriveHalfLap: stale (non-coplanar) returns null', () => {
  expect(deriveHalfLap(joint, [A, { ...B, position: { x: 80, y: -80, z: 5 } }])).toBeNull()
})

test('deriveHalfLap: cuts are correct when the second board is rotated Rz=90 (still axis-aligned)', () => {
  const C: BoardPart = {
    ...A,
    id: 'C',
    rotation: { x: 0, y: 0, z: 90 },
    position: { x: 120, y: 0, z: 0 },
  }
  const jointAC = { ...joint, partBId: 'C' }
  const r = deriveHalfLap(jointAC, [A, C])
  expect(r).not.toBeNull()
  const cutA = r!.cuts.find((c) => c.partId === 'A')!.cut
  const cutC = r!.cuts.find((c) => c.partId === 'C')!.cut
  // A keeps low, removes high [10,20] over the overlap x[80,120] y[0,40]:
  expect(cutA.position.x).toBeCloseTo(80, 6)
  expect(cutA.position.y).toBeCloseTo(0, 6)
  expect(cutA.position.z).toBeCloseTo(10, 6)
  expect(cutA.size.x).toBeCloseTo(40, 6)
  expect(cutA.size.y).toBeCloseTo(40, 6)
  expect(cutA.size.z).toBeCloseTo(10, 6)
  // C (Rz=90 at (120,0,0)) removes low [0,10]; via worldBoxToLocalCut → local pos (0,0,0) size (40,40,10):
  expect(cutC.position.x).toBeCloseTo(0, 6)
  expect(cutC.position.y).toBeCloseTo(0, 6)
  expect(cutC.position.z).toBeCloseTo(0, 6)
  expect(cutC.size.x).toBeCloseTo(40, 6)
  expect(cutC.size.y).toBeCloseTo(40, 6)
  expect(cutC.size.z).toBeCloseTo(10, 6)
})
