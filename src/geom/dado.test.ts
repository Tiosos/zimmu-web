import { test, expect } from 'vitest'
import type { BoardPart, DadoJoint } from '../scene/types'
import {
  isValidDadoSeat,
  deriveDadoAxes,
  computeDadoGroove,
  computeDadoSeat,
  defaultDadoDepth,
} from './dado'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'
import { computeLocalFaceCenter } from '../scene/snapMath'

// Housing: flat board, +Z face up, at the origin, unrotated.
const housing: BoardPart = {
  kind: 'board',
  id: 'H',
  label: 'Housing',
  length: 200,
  width: 100,
  thickness: 25,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
// Housed: standing vertically via Ry=90 so its local +X end points to world -Z
// (opposes housing +Z → valid seat). Local +Z (thickness) → world +X.
const housed: BoardPart = {
  kind: 'board',
  id: 'D',
  label: 'Housed',
  length: 120,
  width: 100,
  thickness: 18,
  material: '',
  color: '#fff',
  position: { x: 50, y: 0, z: 30 },
  rotation: { x: 0, y: 90, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
const joint: DadoJoint = {
  kind: 'dado',
  id: 'j1',
  label: 'Dado 1',
  housingPartId: 'H',
  housingFace: '+Z',
  housedPartId: 'D',
  housedEnd: '+X',
  offset: 50,
  depth: 8,
  clearance: 0,
  profile: 'plain',
  tongueThickness: 8,
  rabbetFace: '+Z',
}

test('isValidDadoSeat: perpendicular end opposing the face is valid', () => {
  expect(isValidDadoSeat(housing, '+Z', housed, '+X')).toBe(true)
})

test('isValidDadoSeat: a non-opposing end is invalid', () => {
  const flat: BoardPart = { ...housed, rotation: { x: 0, y: 0, z: 0 } }
  expect(isValidDadoSeat(housing, '+Z', flat, '+X')).toBe(false)
})

test('deriveDadoAxes: narrow axis follows the housed thickness direction', () => {
  // housed thickness (local Z) → world +X → housing u ('x' for +Z face).
  expect(deriveDadoAxes(housing, housed, '+Z')).toEqual({ narrowAx: 'x', runAx: 'y' })
})

test('computeDadoGroove: full-width channel, thickness-wide, depth-deep from the face', () => {
  const cut = computeDadoGroove(housing, housed, joint)
  expect(cut.kind).toBe('box')
  expect(cut.sourceJointId).toBe('j1')
  expect(cut.face).toBe('+Z')
  expect(cut.size).toEqual({ x: 18, y: 100, z: 8 }) // thk+clr, full width, depth
  expect(cut.position).toEqual({ x: 50 - 9, y: 0, z: 25 - 8 }) // centered at offset, flush at +Z
})

test('computeDadoGroove: depth clamps below the housing thickness', () => {
  const deep = computeDadoGroove(housing, housed, { ...joint, depth: 999 })
  expect(deep.size.z).toBe(24) // thickness - 1
})

test('defaultDadoDepth: ~thickness/3, clamped', () => {
  expect(defaultDadoDepth(housing, '+Z')).toBe(8) // round(25/3)=8
})

test('computeDadoSeat: housed end lands on the groove bottom, centered on offset', () => {
  const seat = computeDadoSeat(housing, housed, joint)
  const seated: BoardPart = { ...housed, position: seat.position }
  const endLocal = computeLocalFaceCenter({ x: 1, y: 0, z: 0 }, seated) // +X end center
  const [wx, , wz] = applyMatrixToPoint(
    composeWorldMatrix(seated),
    endLocal.x,
    endLocal.y,
    endLocal.z,
  )
  expect(wz).toBeCloseTo(25 - 8, 6) // groove bottom plane
  expect(wx).toBeCloseTo(50, 6) // groove center = offset
})

test('computeDadoSeat is idempotent (re-seating a seated board is a no-op)', () => {
  const once = computeDadoSeat(housing, housed, joint)
  const twice = computeDadoSeat(housing, { ...housed, position: once.position }, joint)
  expect(twice.position.x).toBeCloseTo(once.position.x, 6)
  expect(twice.position.y).toBeCloseTo(once.position.y, 6)
  expect(twice.position.z).toBeCloseTo(once.position.z, 6)
})
