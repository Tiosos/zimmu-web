import { test, expect } from 'vitest'
import type { Face, BoardPart } from './types'
import { localNormalToFaceString } from './snapMath'
import { synthHit, contactPair } from './suggestJoints'

const FACES: Face[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']

function board(over: Partial<BoardPart>): BoardPart {
  return {
    kind: 'board',
    id: 'X',
    label: 'X',
    length: 100,
    width: 40,
    thickness: 18,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...over,
  }
}

// Perpendicular tee: D stands on H's +Z face (Ry=-90 → local +X points to world +Z).
const teeH = board({ id: 'H', length: 200, width: 100, thickness: 20 })
const teeD = board({
  id: 'D',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 100, y: 30, z: 20 },
})

// Coplanar edge glue-up: G and E meet along y = 40.
const edgeG = board({ id: 'G', length: 200, width: 40, thickness: 18 })
const edgeE = board({
  id: 'E',
  length: 200,
  width: 40,
  thickness: 18,
  position: { x: 0, y: 40, z: 0 },
})

// Far apart.
const farA = board({ id: 'FA' })
const farB = board({ id: 'FB', position: { x: 500, y: 0, z: 0 } })

test('synthHit produces a FaceHit whose local normal round-trips to the same face', () => {
  for (const f of FACES) {
    const h = synthHit('P1', f)
    expect(h.partId).toBe('P1')
    expect(localNormalToFaceString(h.localFaceNormal)).toBe(f)
    expect(h.faceNormal).toEqual(h.localFaceNormal)
  }
})

test('contactPair finds the broad/end faces of a perpendicular tee', () => {
  expect(contactPair(teeH, teeD)).toEqual({ faceA: '+Z', faceB: '-X' })
})

test('contactPair finds the long-edge faces of a coplanar edge joint', () => {
  expect(contactPair(edgeG, edgeE)).toEqual({ faceA: '+Y', faceB: '-Y' })
})

test('contactPair returns null for separated boards', () => {
  expect(contactPair(farA, farB)).toBeNull()
})
