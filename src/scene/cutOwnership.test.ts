import { test, expect } from 'vitest'
import type { BoxCut, HoleArrayCut, MitreCut } from './types'
import { isJointOwned, isOwnedBy } from './cutOwnership'

const box: BoxCut = {
  kind: 'box',
  id: 'c_box',
  label: 'Groove',
  face: '+Z',
  position: { x: 0, y: 0, z: 0 },
  size: { x: 10, y: 10, z: 5 },
}

const holes: HoleArrayCut = {
  kind: 'hole-array',
  id: 'c_holes',
  label: 'Bores',
  face: '+Z',
  axis: 'U',
  start: { x: 10, y: 10, z: 0 },
  pitch: 32,
  count: 3,
  diameter: 5,
  depth: 12,
}

const mitre: MitreCut = {
  kind: 'mitre',
  id: 'c_mitre',
  label: 'Mitre',
  end: '+X',
  axis: 'Z',
  angle: 45,
}

test('a box cut carrying sourceJointId is joint-owned', () => {
  expect(isJointOwned({ ...box, sourceJointId: 'j1' })).toBe(true)
})

test('a hole array carrying sourceJointId is joint-owned', () => {
  expect(isJointOwned({ ...holes, sourceJointId: 'j1' })).toBe(true)
})

test('a hole array carrying only sourceComponentId is not joint-owned', () => {
  expect(isJointOwned({ ...holes, sourceComponentId: 'cmp_1' })).toBe(false)
})

test('a plain box cut is not joint-owned', () => {
  expect(isJointOwned(box)).toBe(false)
})

test('a mitre cut, which carries neither field, is not joint-owned', () => {
  expect(isJointOwned(mitre)).toBe(false)
})

test('isOwnedBy distinguishes two joint ids, for a box and for a hole array', () => {
  expect(isOwnedBy({ ...box, sourceJointId: 'j1' }, 'j1')).toBe(true)
  expect(isOwnedBy({ ...box, sourceJointId: 'j1' }, 'j2')).toBe(false)
  expect(isOwnedBy({ ...holes, sourceJointId: 'j1' }, 'j1')).toBe(true)
  expect(isOwnedBy({ ...holes, sourceJointId: 'j1' }, 'j2')).toBe(false)
})

test('isOwnedBy is false for an unowned cut, whatever the joint id', () => {
  expect(isOwnedBy(box, 'j1')).toBe(false)
  expect(isOwnedBy(holes, 'j1')).toBe(false)
  expect(isOwnedBy(mitre, 'j1')).toBe(false)
})
