import { test, expect } from 'vitest'
import type { BoardPart, Part, TongueGrooveJoint } from '../scene/types'
import {
  isValidTongueGroove,
  computeGrooveCut,
  computeTongueShoulders,
  computeTongueGrooveSeat,
  deriveTongueGroove,
} from './tonguegroove'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'

// Groove board: 800×150×18 at origin, unrotated. Its +Y long edge (world y=150) carries the groove.
const GROOVE: BoardPart = {
  kind: 'board',
  id: 'G',
  label: 'G',
  length: 800,
  width: 150,
  thickness: 18,
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
// Tongue board: same size, unrotated, placed on the +Y side (y=160) with its -Y edge facing the groove.
const TONGUE: BoardPart = {
  ...GROOVE,
  id: 'T',
  label: 'T',
  position: { x: 0, y: 160, z: 0 },
}
const parts: Part[] = [GROOVE, TONGUE]
const joint: TongueGrooveJoint = {
  kind: 'tongue-groove',
  id: 'j1',
  label: 'Tongue & groove 1',
  driven: false,
  groovePartId: 'G',
  grooveEdge: '+Y',
  tonguePartId: 'T',
  tongueEdge: '-Y',
  tongueThickness: 6,
  tongueDepth: 8,
  clearance: 0,
}

test('isValidTongueGroove: coplanar equal-thickness facing long edges are valid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', TONGUE, '-Y')).toBe(true)
})
test('isValidTongueGroove: a non-edge face (end +X) is invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+X', TONGUE, '-Y')).toBe(false)
})
test('isValidTongueGroove: a broad face (+Z) is invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', TONGUE, '+Z')).toBe(false)
})
test('isValidTongueGroove: parallel (non-facing) edges are invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', TONGUE, '+Y')).toBe(false)
})
test('isValidTongueGroove: unequal thickness is invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', { ...TONGUE, thickness: 20 }, '-Y')).toBe(false)
})
test('isValidTongueGroove: a non-axis-aligned board is invalid', () => {
  expect(
    isValidTongueGroove(GROOVE, '+Y', { ...TONGUE, rotation: { x: 0, y: 0, z: 30 } }, '-Y'),
  ).toBe(false)
})
test('isValidTongueGroove: perpendicular thickness axes (rotated y:90) is invalid', () => {
  // local -Y still → world -Y (facing), but local Z (thickness) → world X, not coplanar with groove.
  expect(
    isValidTongueGroove(GROOVE, '+Y', { ...TONGUE, rotation: { x: 0, y: 90, z: 0 } }, '-Y'),
  ).toBe(false)
})

test('computeGrooveCut: centered through groove on the +Y edge', () => {
  const cut = computeGrooveCut(GROOVE, joint)
  expect(cut.face).toBe('+Y')
  expect(cut.size).toEqual({ x: 800, y: 8, z: 6 }) // full length, depth 8, width = tongueThickness
  expect(cut.position).toEqual({ x: 0, y: 142, z: 6 }) // y = 150-8; z = 18/2 - 6/2 (centered)
  expect(cut.id).toBe('cut_j1_groove')
  expect(cut.sourceJointId).toBe('j1')
})
test('computeGrooveCut: clearance widens the groove across thickness only', () => {
  const cut = computeGrooveCut(GROOVE, { ...joint, clearance: 2 })
  expect(cut.size).toEqual({ x: 800, y: 8, z: 8 }) // z width 6+2
  expect(cut.position).toEqual({ x: 0, y: 142, z: 5 }) // recentered: 9 - 8/2
})

test('computeTongueShoulders: two symmetric shoulders leave a centered tongue', () => {
  const cuts = computeTongueShoulders(TONGUE, joint)
  expect(cuts).toHaveLength(2)
  const s0 = cuts.find((c) => c.id === 'cut_j1_shoulder0')!
  const s1 = cuts.find((c) => c.id === 'cut_j1_shoulder1')!
  expect(s0.face).toBe('-Y')
  expect(s0.size).toEqual({ x: 800, y: 8, z: 6 })
  expect(s0.position).toEqual({ x: 0, y: 0, z: 0 }) // -Z shoulder removes z∈[0,6]
  expect(s1.size).toEqual({ x: 800, y: 8, z: 6 })
  expect(s1.position).toEqual({ x: 0, y: 0, z: 12 }) // +Z shoulder removes z∈[12,18]; tongue = z∈[6,12]
})

test('computeTongueGrooveSeat: seats the tongue 8mm into the groove, idempotent', () => {
  const seat = computeTongueGrooveSeat(GROOVE, TONGUE, joint)
  expect(seat.position.x).toBeCloseTo(0, 6)
  expect(seat.position.y).toBeCloseTo(142, 6) // tongue -Y edge lands at the groove bottom (150-8)
  expect(seat.position.z).toBeCloseTo(0, 6)
  const again = computeTongueGrooveSeat(GROOVE, { ...TONGUE, position: seat.position }, joint)
  expect(again.position.y).toBeCloseTo(142, 6)
})

test('deriveTongueGroove: 3 cuts (1 groove + 2 shoulders) split across both boards + a seat', () => {
  const r = deriveTongueGroove(joint, parts)
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(3)
  expect(r!.cuts.filter((c) => c.partId === 'G')).toHaveLength(1)
  expect(r!.cuts.filter((c) => c.partId === 'T')).toHaveLength(2)
  expect(r!.seat!.partId).toBe('T')
})
test('deriveTongueGroove: stale (unequal thickness) returns null', () => {
  expect(deriveTongueGroove(joint, [GROOVE, { ...TONGUE, thickness: 20 }])).toBeNull()
})

test('deriveTongueGroove: rotated tongue board (z:180, anti-parallel length) still closes the joint', () => {
  // rotate 180° about Z: local Z (thickness) preserved → still coplanar; local +Y face → world -Y,
  // so tongueEdge must be '+Y' to face the groove board's +Y edge; local X (length) → world -X.
  const Trot: BoardPart = { ...TONGUE, rotation: { x: 0, y: 0, z: 180 } }
  const jrot: TongueGrooveJoint = { ...joint, tongueEdge: '+Y' }
  expect(isValidTongueGroove(GROOVE, '+Y', Trot, '+Y')).toBe(true)
  const r = deriveTongueGroove(jrot, [GROOVE, Trot])
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(3)
  // The seated tongue-edge face center must land at the groove bottom (world y=142) and the groove
  // thickness mid-plane (world z=9), regardless of the tongue board's rotation.
  const seated: BoardPart = { ...Trot, position: r!.seat!.position }
  const m = composeWorldMatrix(seated)
  // '+Y' local face center of an 800×150×18 board = (400,150,9)
  const [, ey, ez] = applyMatrixToPoint(m, 400, 150, 9)
  expect(ey).toBeCloseTo(142, 6)
  expect(ez).toBeCloseTo(9, 6)
})
