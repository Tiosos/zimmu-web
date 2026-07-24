import { test, expect } from 'vitest'
import type { DadoJoint, HalfLapJoint, MortiseTenonJoint } from './types'
import { jointInvolves } from './jointInvolves'

const dado: DadoJoint = {
  kind: 'dado',
  id: 'd',
  label: 'D',
  housingPartId: 'H',
  housingFace: '+Z',
  housedPartId: 'W',
  housedEnd: '+X',
  offset: 0,
  depth: 8,
  clearance: 0,
  profile: 'plain',
  tongueThickness: 8,
  rabbetFace: '+Z',
  stopStart: 0,
  stopEnd: 0,
}
const lap: HalfLapJoint = {
  kind: 'halflap',
  id: 'l',
  label: 'L',
  partAId: 'A',
  partBId: 'B',
  split: 0.5,
  clearance: 0,
}
const mt: MortiseTenonJoint = {
  kind: 'mortise-tenon',
  id: 'm',
  label: 'M',
  mortisePartId: 'MO',
  mortiseFace: '+Z',
  tenonPartId: 'TE',
  tenonEnd: '+X',
  tenonLength: 20,
  tenonThickness: 8,
  tenonWidth: 40,
  clearance: 0,
  through: false,
  offsetU: 0,
  offsetV: 0,
}

test('jointInvolves: dado matches housing/housed', () => {
  expect(jointInvolves(dado, 'H')).toBe(true)
  expect(jointInvolves(dado, 'W')).toBe(true)
  expect(jointInvolves(dado, 'X')).toBe(false)
})

test('jointInvolves: half-lap matches partA/partB', () => {
  expect(jointInvolves(lap, 'A')).toBe(true)
  expect(jointInvolves(lap, 'B')).toBe(true)
  expect(jointInvolves(lap, 'X')).toBe(false)
})

test('jointInvolves: mortise & tenon matches the mortise/tenon parts', () => {
  expect(jointInvolves(mt, 'MO')).toBe(true)
  expect(jointInvolves(mt, 'TE')).toBe(true)
  expect(jointInvolves(mt, 'X')).toBe(false)
})
