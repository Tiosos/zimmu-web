import { test, expect } from 'vitest'
import type { BoardPart, BoxCut, FingerJoint, Part } from '../scene/types'
import {
  isValidFingerJoint,
  computeFingerCuts,
  computeFingerSeat,
  deriveFingerJoint,
} from './fingerjoint'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'
import { componentsById } from '../scene/componentTree'
import type { DerivedCut } from './dado'

// A finger joint's geometry is slots, so every cut it derives is a box; DerivedCut is wider than
// that because a joint may also own a bore.
function boxCut(cut: DerivedCut['cut']): BoxCut {
  if (cut.kind !== 'box') throw new Error(`expected a box cut, got ${cut.kind}`)
  return cut
}

const NO_COMPONENTS = componentsById([])

const A: BoardPart = {
  kind: 'board',
  id: 'A',
  label: 'A',
  length: 200,
  width: 80,
  thickness: 18,
  grain: 'free' as const,
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
  kind: 'board',
  id: 'B',
  label: 'B',
  length: 200,
  width: 80,
  thickness: 18,
  grain: 'free' as const,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 90, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: null,
  driven: false,
}
const parts: Part[] = [A, B]
const joint: FingerJoint = {
  kind: 'finger',
  id: 'j1',
  label: 'Finger joint 1',
  driven: false,
  partAId: 'A',
  endA: '+X',
  partBId: 'B',
  endB: '+X',
  fingerCount: 4,
  clearance: 0,
}

test('isValidFingerJoint: axis-aligned equal-width right-angle corner is valid', () => {
  expect(isValidFingerJoint(A, '+X', B, '+X', NO_COMPONENTS)).toBe(true)
})
test('isValidFingerJoint: a non-axis-aligned board is invalid', () => {
  expect(
    isValidFingerJoint(A, '+X', { ...B, rotation: { x: 0, y: 45, z: 0 } }, '+X', NO_COMPONENTS),
  ).toBe(false)
})
test('isValidFingerJoint: a thickness (z) end is invalid', () => {
  expect(isValidFingerJoint(A, '+X', B, '+Z', NO_COMPONENTS)).toBe(false)
})
test('isValidFingerJoint: parallel (non-perpendicular) ends are invalid', () => {
  expect(
    isValidFingerJoint(A, '+X', { ...B, rotation: { x: 0, y: 0, z: 0 } }, '+X', NO_COMPONENTS),
  ).toBe(false)
})
test('isValidFingerJoint: unequal joint widths are invalid', () => {
  expect(isValidFingerJoint(A, '+X', { ...B, width: 60 }, '+X', NO_COMPONENTS)).toBe(false)
})

test('computeFingerCuts: A removes world-odd segments (1,3) full-depth full-thickness', () => {
  const cuts = computeFingerCuts(A, '+X', joint, B.thickness, 1, false)
  expect(cuts).toHaveLength(2)
  const by = (i: number) => cuts.find((c) => c.id === `cut_j1_finger${i}`)!
  expect(by(1).position).toEqual({ x: 182, y: 20, z: 0 })
  expect(by(1).size).toEqual({ x: 18, y: 20, z: 18 })
  expect(by(3).position).toEqual({ x: 182, y: 60, z: 0 })
  expect(by(3).size).toEqual({ x: 18, y: 20, z: 18 })
  expect(by(1).sourceJointId).toBe('j1')
})
test('computeFingerCuts: B removes world-even segments (0,2), depth = A thickness', () => {
  const cuts = computeFingerCuts(B, '+X', joint, A.thickness, 0, false)
  expect(cuts).toHaveLength(2)
  const ids = cuts.map((c) => c.id).sort()
  expect(ids).toEqual(['cut_j1_finger0', 'cut_j1_finger2'])
})
test('computeFingerCuts: flip reverses B parity to stay complementary in world', () => {
  const cuts = computeFingerCuts(B, '+X', joint, A.thickness, 0, true)
  expect(cuts.map((c) => c.id).sort()).toEqual(['cut_j1_finger1', 'cut_j1_finger3'])
})
test('computeFingerCuts: clearance widens interior slot edges', () => {
  const cuts = computeFingerCuts(A, '+X', { ...joint, clearance: 2 }, B.thickness, 1, false)
  const f1 = cuts.find((c) => c.id === 'cut_j1_finger1')!
  expect(f1.position.y).toBe(19)
  expect(f1.size.y).toBe(22)
})
test('computeFingerCuts: N < 2 yields no cuts (defensive)', () => {
  expect(computeFingerCuts(A, '+X', { ...joint, fingerCount: 1 }, 18, 1, false)).toHaveLength(0)
})

test('computeFingerSeat: seats B into a flush corner at (182,0,200), idempotent', () => {
  const seat = computeFingerSeat(A, B, joint, NO_COMPONENTS)
  expect(seat.position.x).toBeCloseTo(182, 6)
  expect(seat.position.y).toBeCloseTo(0, 6)
  expect(seat.position.z).toBeCloseTo(200, 6)
  const again = computeFingerSeat(A, { ...B, position: seat.position }, joint, NO_COMPONENTS)
  expect(again.position.x).toBeCloseTo(182, 6)
  expect(again.position.y).toBeCloseTo(0, 6)
  expect(again.position.z).toBeCloseTo(200, 6)
})

test('deriveFingerJoint: 4 cuts split across both boards + a seat on B', () => {
  const r = deriveFingerJoint(joint, parts, NO_COMPONENTS)
  expect(r).not.toBeNull()
  expect(r!.seat!.partId).toBe('B')
  expect(r!.cuts).toHaveLength(4)
  expect(r!.cuts.filter((c) => c.partId === 'A')).toHaveLength(2)
  expect(r!.cuts.filter((c) => c.partId === 'B')).toHaveLength(2)
})
test('deriveFingerJoint: A and B cover complementary world-Y bands (interlock)', () => {
  const r = deriveFingerJoint(joint, parts, NO_COMPONENTS)!
  const aSlots = r.cuts
    .filter((c) => c.partId === 'A')
    .map((c) => boxCut(c.cut).position.y)
    .sort((x, y) => x - y)
  const bSlots = r.cuts
    .filter((c) => c.partId === 'B')
    .map((c) => boxCut(c.cut).position.y)
    .sort((x, y) => x - y)
  expect(aSlots).toEqual([20, 60])
  expect(bSlots).toEqual([0, 40])
})
test('deriveFingerJoint: unequal thickness → asymmetric slot depths', () => {
  const a2: BoardPart = { ...A, thickness: 12 }
  const b2: BoardPart = { ...B, thickness: 24 }
  const r = deriveFingerJoint(joint, [a2, b2], NO_COMPONENTS)!
  const aCut = boxCut(r.cuts.find((c) => c.partId === 'A')!.cut)
  const bCut = boxCut(r.cuts.find((c) => c.partId === 'B')!.cut)
  expect(aCut.size.x).toBe(24)
  expect(bCut.size.x).toBe(12)
})
test('deriveFingerJoint: stale (non-axis-aligned) returns null', () => {
  expect(
    deriveFingerJoint(joint, [A, { ...B, rotation: { x: 0, y: 45, z: 0 } }], NO_COMPONENTS),
  ).toBeNull()
})

test('deriveFingerJoint: genuinely anti-parallel board triggers flip=true and world-interlocks', () => {
  // rotation (180,90,0) sends B's local +X end-normal → world +Z and its finger axis
  // (local +Y) → world −Y: a perpendicular, equal-width corner whose finger axis is
  // anti-parallel to A's (+Y), so deriveFingerJoint must compute flip = fA·fB < 0 = true.
  const Bflip: BoardPart = { ...B, rotation: { x: 180, y: 90, z: 0 } }

  // Confirm the two preconditions the flip decision hinges on, at runtime.
  expect(isValidFingerJoint(A, '+X', Bflip, '+X', NO_COMPONENTS)).toBe(true)
  const fAdotFB = composeWorldMatrix(Bflip)[5] // fA = world +Y; local +Y column's y-component = fA·fB
  expect(fAdotFB).toBeLessThan(0)

  const r = deriveFingerJoint(joint, [A, Bflip], NO_COMPONENTS)!
  const bIds = r.cuts
    .filter((c) => c.partId === 'B')
    .map((c) => c.cut.id)
    .sort()
  expect(bIds).toEqual(['cut_j1_finger1', 'cut_j1_finger3']) // flip reversed B's parity from {0,2}

  const worldBandY = (part: BoardPart, cut: BoxCut): [number, number] => {
    const m = composeWorldMatrix(part)
    const cy = applyMatrixToPoint(
      m,
      cut.position.x + cut.size.x / 2,
      cut.position.y + cut.size.y / 2,
      cut.position.z + cut.size.z / 2,
    )[1]
    return [cy - cut.size.y / 2, cy + cut.size.y / 2]
  }
  const seatedB: BoardPart = { ...Bflip, position: r.seat!.position }
  const aBands = r.cuts.filter((c) => c.partId === 'A').map((c) => worldBandY(A, boxCut(c.cut)))
  const bBands = r.cuts
    .filter((c) => c.partId === 'B')
    .map((c) => worldBandY(seatedB, boxCut(c.cut)))
  const overlap = (p: [number, number], q: [number, number]) =>
    Math.min(p[1], q[1]) - Math.max(p[0], q[0]) > 1e-6
  for (const ab of aBands) for (const bb of bBands) expect(overlap(ab, bb)).toBe(false)
})
