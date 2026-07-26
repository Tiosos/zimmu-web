import { test, expect } from 'vitest'
import type {
  DadoJoint,
  FingerJoint,
  HalfLapJoint,
  MortiseTenonJoint,
  TongueGrooveJoint,
} from './types'
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

const finger: FingerJoint = {
  kind: 'finger',
  id: 'f',
  label: 'F',
  partAId: 'FA',
  endA: '+X',
  partBId: 'FB',
  endB: '+X',
  fingerCount: 5,
  clearance: 0,
}

test('jointInvolves: finger joint matches partA/partB', () => {
  expect(jointInvolves(finger, 'FA')).toBe(true)
  expect(jointInvolves(finger, 'FB')).toBe(true)
  expect(jointInvolves(finger, 'X')).toBe(false)
})

const tongueGroove: TongueGrooveJoint = {
  kind: 'tongue-groove',
  id: 'tg',
  label: 'TG',
  groovePartId: 'GR',
  grooveEdge: '+Y',
  tonguePartId: 'TO',
  tongueEdge: '-Y',
  tongueThickness: 6,
  tongueDepth: 8,
  clearance: 0,
}

test('jointInvolves: tongue & groove matches the groove/tongue parts', () => {
  expect(jointInvolves(tongueGroove, 'GR')).toBe(true)
  expect(jointInvolves(tongueGroove, 'TO')).toBe(true)
  expect(jointInvolves(tongueGroove, 'X')).toBe(false)
})
