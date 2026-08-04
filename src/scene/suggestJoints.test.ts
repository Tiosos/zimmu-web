import { test, expect } from 'vitest'
import type { Face, BoardPart, Joint, Part } from './types'
import { localNormalToFaceString } from './snapMath'
import { isValidHalfLap } from '../geom/halflap'
import { isValidDadoSeat } from '../geom/dado'
import { isValidMortiseTenon } from '../geom/mortisetenon'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { synthHit, contactPair, cornerPair, suggestJointsFor } from './suggestJoints'

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

// Two crossing coplanar equal-thickness boards → half-lap.
const lapA = board({ id: 'LA', length: 200, width: 40, thickness: 20 })
const lapB = board({
  id: 'LB',
  length: 40,
  width: 200,
  thickness: 20,
  position: { x: 80, y: -80, z: 0 },
})

// A cylinder + a hidden board for the negative cases.
const cyl = { ...board({ id: 'CY' }), kind: 'cylinder' as const, diameter: 10 } as unknown as Part
const hidden = board({ id: 'HID', visible: false })

function kinds(parts: Part[], selectedId: string, joints: Joint[] = []): string[] {
  return suggestJointsFor(selectedId, parts, joints)
    .map((s) => s.kind)
    .sort()
}

test('perpendicular tee suggests both dado and mortise-tenon', () => {
  expect(kinds([teeH, teeD], 'H')).toEqual(['dado', 'mortise-tenon'])
})

test('coplanar edge joint suggests tongue-groove only (no mortise-tenon)', () => {
  expect(kinds([edgeG, edgeE], 'G')).toEqual(['tongue-groove'])
})

test('crossing coplanar boards suggest half-lap', () => {
  expect(kinds([lapA, lapB], 'LA')).toEqual(['halflap'])
})

test('separated boards yield no suggestions', () => {
  expect(suggestJointsFor('FA', [farA, farB], [])).toEqual([])
})

test('an already-joined pair yields no suggestion for that pair', () => {
  const joint = {
    kind: 'dado',
    id: 'j1',
    housingPartId: 'H',
    housedPartId: 'D',
  } as unknown as Joint
  expect(suggestJointsFor('H', [teeH, teeD], [joint])).toEqual([])
})

test('null selection, a cylinder, or a hidden board yield no suggestions', () => {
  expect(suggestJointsFor(null, [teeH, teeD], [])).toEqual([])
  expect(suggestJointsFor('CY', [cyl, teeD], [])).toEqual([])
  expect(suggestJointsFor('HID', [hidden, teeD], [])).toEqual([])
})

test('every emitted suggestion round-trips through its validity gate', () => {
  const scenes: Array<{ parts: Part[]; sel: string }> = [
    { parts: [teeH, teeD], sel: 'H' },
    { parts: [edgeG, edgeE], sel: 'G' },
    { parts: [lapA, lapB], sel: 'LA' },
  ]
  const asBoard = (parts: Part[], id: string) => parts.find((p) => p.id === id) as BoardPart
  for (const { parts, sel } of scenes) {
    for (const s of suggestJointsFor(sel, parts, [])) {
      if (s.kind === 'halflap') {
        expect(isValidHalfLap(asBoard(parts, s.partAId), asBoard(parts, s.partBId))).toBe(true)
      } else if (s.kind === 'dado') {
        expect(
          isValidDadoSeat(
            asBoard(parts, s.housingPartId),
            s.housingFace,
            asBoard(parts, s.housedPartId),
            s.housedEnd,
          ),
        ).toBe(true)
      } else if (s.kind === 'mortise-tenon') {
        expect(
          isValidMortiseTenon(
            asBoard(parts, s.mortisePartId),
            s.mortiseFace,
            asBoard(parts, s.tenonPartId),
            s.tenonEnd,
          ),
        ).toBe(true)
      } else {
        expect(
          isValidTongueGroove(
            asBoard(parts, s.groovePartId),
            s.grooveEdge,
            asBoard(parts, s.tonguePartId),
            s.tongueEdge,
          ),
        ).toBe(true)
      }
    }
  }
})

// A second tee neighbour on teeH, farther along +X than teeD.
const teeDFar = board({
  id: 'D2',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 180, y: 30, z: 20 },
})

test('suggestions are ordered nearest-neighbour first', () => {
  const out = suggestJointsFor('H', [teeH, teeD, teeDFar], [])
  const firstFar = out.findIndex((s) => s.neighborId === 'D2')
  const lastNear = out.map((s) => s.neighborId).lastIndexOf('D')
  expect(firstFar).toBeGreaterThan(lastNear)
  expect(out.every((s) => s.neighborId === 'D' || s.neighborId === 'D2')).toBe(true)
})

// Flush box corner: cornerA's +X end meets cornerB's -X end; shared edge runs along world Y.
const cornerA = board({ id: 'CA', length: 200, width: 100, thickness: 18 })
const cornerB = board({
  id: 'CB',
  length: 150,
  width: 100,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 200, y: 0, z: 18 },
})

// Same orientation and widths, but standing on cornerA's broad face mid-span rather than at its end.
const faceStandB = board({
  id: 'FS',
  length: 150,
  width: 100,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 138, y: 0, z: 18 },
})

test('cornerPair finds the two end faces of a flush right-angle corner', () => {
  expect(cornerPair(cornerA, cornerB)).toEqual({ endA: '+X', endB: '-X' })
})

test('cornerPair returns null for separated boards', () => {
  expect(cornerPair(farA, farB)).toBeNull()
})

test('cornerPair rejects a board standing mid-face, not at an end', () => {
  expect(cornerPair(cornerA, faceStandB)).toBeNull()
})
