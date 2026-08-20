import { test, expect } from 'vitest'
import type { BoardPart, MortiseTenonJoint, Part } from '../scene/types'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'
import { computeLocalFaceCenter } from '../scene/snapMath'
import {
  isValidMortiseTenon,
  computeTenonShoulders,
  computeMortisePocket,
  computeMortiseTenonSeat,
  computeMortiseOffset,
  deriveMortiseTenon,
} from './mortisetenon'
import { componentsById } from '../scene/componentTree'

const NO_COMPONENTS = componentsById([])

const M: BoardPart = {
  kind: 'board',
  id: 'M',
  label: 'M',
  length: 200,
  width: 100,
  thickness: 40,
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
const T: BoardPart = {
  kind: 'board',
  id: 'T',
  label: 'T',
  length: 120,
  width: 60,
  thickness: 30,
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
const parts: Part[] = [M, T]
const joint: MortiseTenonJoint = {
  kind: 'mortise-tenon',
  id: 'j1',
  label: 'Mortise & tenon 1',
  driven: false,
  mortisePartId: 'M',
  mortiseFace: '+Z',
  tenonPartId: 'T',
  tenonEnd: '+X',
  tenonLength: 27,
  tenonThickness: 10,
  tenonWidth: 40,
  clearance: 0,
  through: false,
  offsetU: 100,
  offsetV: 50,
}

test('isValidMortiseTenon: perpendicular, axis-aligned, length/width-end seat is valid', () => {
  expect(isValidMortiseTenon(M, '+Z', T, '+X', NO_COMPONENTS)).toBe(true)
})
test('isValidMortiseTenon: a non-perpendicular seat is invalid', () => {
  expect(
    isValidMortiseTenon(M, '+Z', { ...T, rotation: { x: 0, y: 0, z: 0 } }, '+X', NO_COMPONENTS),
  ).toBe(false)
})
test('isValidMortiseTenon: a thickness-end tenon is invalid (perpendicular but seatAx z)', () => {
  // Unrotated tenon, tenonEnd '-Z': perpendicular to M's '+Z' (dot −1), axis-aligned,
  // but faceAxes('-Z').depth === 'z' — so only the thickness-end guard rejects it.
  expect(
    isValidMortiseTenon(M, '+Z', { ...T, rotation: { x: 0, y: 0, z: 0 } }, '-Z', NO_COMPONENTS),
  ).toBe(false)
})
test('isValidMortiseTenon: a non-axis-aligned tenon board is invalid', () => {
  expect(
    isValidMortiseTenon(M, '+Z', { ...T, rotation: { x: 0, y: 45, z: 0 } }, '+X', NO_COMPONENTS),
  ).toBe(false)
})

test('computeTenonShoulders: 4 centered shoulder strips over the tenon length', () => {
  const cuts = computeTenonShoulders(T, joint)
  expect(cuts).toHaveLength(4)
  const by = (s: string) => cuts.find((c) => c.id === `cut_j1_shoulder${s}`)!
  expect(by('Zhi').position).toEqual({ x: 93, y: 0, z: 20 })
  expect(by('Zhi').size).toEqual({ x: 27, y: 60, z: 10 })
  expect(by('Zlo').position).toEqual({ x: 93, y: 0, z: 0 })
  expect(by('Zlo').size).toEqual({ x: 27, y: 60, z: 10 })
  expect(by('Whi').position).toEqual({ x: 93, y: 50, z: 0 })
  expect(by('Whi').size).toEqual({ x: 27, y: 10, z: 30 })
  expect(by('Wlo').position).toEqual({ x: 93, y: 0, z: 0 })
  expect(by('Wlo').size).toEqual({ x: 27, y: 10, z: 30 })
  expect(by('Zhi').sourceJointId).toBe('j1')
})
test('computeTenonShoulders: full-width tenon drops the width shoulders (2 strips)', () => {
  const cuts = computeTenonShoulders(T, { ...joint, tenonWidth: 60 })
  expect(cuts).toHaveLength(2)
  expect(cuts.every((c) => c.id.includes('shoulderZ'))).toBe(true)
})

test('computeMortisePocket: blind pocket sized + oriented to the tenon, centered on the offset', () => {
  const cut = computeMortisePocket(M, T, joint, NO_COMPONENTS)
  expect(cut.id).toBe('cut_j1_mortise')
  expect(cut.position).toEqual({ x: 95, y: 30, z: 13 })
  expect(cut.size).toEqual({ x: 10, y: 40, z: 27 })
})
test('computeMortisePocket: through pocket spans the full thickness', () => {
  const cut = computeMortisePocket(M, T, { ...joint, through: true }, NO_COMPONENTS)
  expect(cut.position.z).toBe(0)
  expect(cut.size.z).toBe(40)
})

test('computeMortiseTenonSeat: tongue tip on the pocket bottom, centered on the mortise', () => {
  const seat = computeMortiseTenonSeat(M, T, joint, NO_COMPONENTS)
  const seated: BoardPart = { ...T, position: seat.position }
  const endLocal = computeLocalFaceCenter({ x: 1, y: 0, z: 0 }, seated)
  const [wx, wy, wz] = applyMatrixToPoint(
    composeWorldMatrix(seated),
    endLocal.x,
    endLocal.y,
    endLocal.z,
  )
  expect(wx).toBeCloseTo(100, 6)
  expect(wy).toBeCloseTo(50, 6)
  expect(wz).toBeCloseTo(13, 6)
})

test('computeMortiseOffset: projects the tenon board center onto the mortise face axes', () => {
  const { offsetU, offsetV } = computeMortiseOffset(M, T, '+Z', NO_COMPONENTS)
  expect(offsetU).toBeCloseTo(15, 6)
  expect(offsetV).toBeCloseTo(30, 6)
})

test('deriveMortiseTenon: 4 shoulders (tenon) + 1 pocket (mortise) + a seat', () => {
  const r = deriveMortiseTenon(joint, parts, NO_COMPONENTS)
  expect(r).not.toBeNull()
  expect(r!.seat!.partId).toBe('T')
  expect(r!.cuts).toHaveLength(5)
  expect(r!.cuts.filter((c) => c.partId === 'T')).toHaveLength(4)
  expect(r!.cuts.filter((c) => c.partId === 'M')).toHaveLength(1)
})
test('deriveMortiseTenon: stale (non-perpendicular) returns null', () => {
  expect(
    deriveMortiseTenon(joint, [M, { ...T, rotation: { x: 0, y: 0, z: 0 } }], NO_COMPONENTS),
  ).toBeNull()
})
