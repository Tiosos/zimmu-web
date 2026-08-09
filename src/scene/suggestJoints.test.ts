import { test, expect } from 'vitest'
import type { Face, BoardPart, Joint, Part } from './types'
import { localNormalToFaceString } from './snapMath'
import { isValidHalfLap } from '../geom/halflap'
import { isValidDadoSeat } from '../geom/dado'
import { isValidMortiseTenon } from '../geom/mortisetenon'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { isValidFingerJoint } from '../geom/fingerjoint'
import {
  synthHit,
  contactPair,
  cornerPair,
  suggestJointsFor,
  suggestJointsForScene,
  pairIdsOf,
  suggestionFaceRefs,
  faceHitForDisplay,
} from './suggestJoints'

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
    { parts: [cornerA, cornerB], sel: 'CA' },
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
      } else if (s.kind === 'finger') {
        expect(
          isValidFingerJoint(asBoard(parts, s.partAId), s.endA, asBoard(parts, s.partBId), s.endB),
        ).toBe(true)
      } else if (s.kind === 'tongue-groove') {
        expect(
          isValidTongueGroove(
            asBoard(parts, s.groovePartId),
            s.grooveEdge,
            asBoard(parts, s.tonguePartId),
            s.tongueEdge,
          ),
        ).toBe(true)
      } else {
        // A new suggestion kind must be given a gate here, not skipped silently.
        const _exhaustive: never = s
        throw new Error(`unhandled suggestion kind: ${JSON.stringify(_exhaustive)}`)
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

// Pinned as an exact set, not toContain: a butt corner offering all three is the most visible
// behavioural change finger-joint suggestions introduced, and toContain('finger') would still
// pass if dado or mortise-tenon silently stopped being offered here.
test('a right-angle corner suggests finger alongside dado and mortise-tenon', () => {
  expect(kinds([cornerA, cornerB], 'CA')).toEqual(['dado', 'finger', 'mortise-tenon'])
})

test('a board standing mid-face does not suggest a finger joint', () => {
  expect(kinds([cornerA, faceStandB], 'CA')).not.toContain('finger')
})

test('suggestionFaceRefs: half-lap has no single pair of faces', () => {
  expect(
    suggestionFaceRefs({ kind: 'halflap', neighborId: 'B', partAId: 'A', partBId: 'B' }),
  ).toEqual([])
})

test('suggestionFaceRefs: dado maps the housing face and the housed end', () => {
  expect(
    suggestionFaceRefs({
      kind: 'dado',
      neighborId: 'B',
      housingPartId: 'A',
      housingFace: '+Z',
      housedPartId: 'B',
      housedEnd: '+X',
    }),
  ).toEqual([
    { partId: 'A', face: '+Z' },
    { partId: 'B', face: '+X' },
  ])
})

test('suggestionFaceRefs: mortise-tenon maps the mortise face and the tenon end', () => {
  expect(
    suggestionFaceRefs({
      kind: 'mortise-tenon',
      neighborId: 'B',
      mortisePartId: 'A',
      mortiseFace: '+Z',
      tenonPartId: 'B',
      tenonEnd: '-X',
    }),
  ).toEqual([
    { partId: 'A', face: '+Z' },
    { partId: 'B', face: '-X' },
  ])
})

test('suggestionFaceRefs: tongue-groove maps both long edges', () => {
  expect(
    suggestionFaceRefs({
      kind: 'tongue-groove',
      neighborId: 'B',
      groovePartId: 'A',
      grooveEdge: '+Y',
      tonguePartId: 'B',
      tongueEdge: '-Y',
    }),
  ).toEqual([
    { partId: 'A', face: '+Y' },
    { partId: 'B', face: '-Y' },
  ])
})

test('suggestionFaceRefs: finger maps both ends', () => {
  expect(
    suggestionFaceRefs({
      kind: 'finger',
      neighborId: 'B',
      partAId: 'A',
      endA: '+X',
      partBId: 'B',
      endB: '-X',
    }),
  ).toEqual([
    { partId: 'A', face: '+X' },
    { partId: 'B', face: '-X' },
  ])
})

// Pins a known limitation, not desired behaviour. Both kinds are emitted from the same
// contact pair with the same housing/housed values (suggestJoints.ts), so their face refs
// are identical by construction — confirmed in the browser, where hovering each of them
// lights up a pixel-for-pixel identical highlight. The hover outlines therefore cannot
// distinguish dado from mortise & tenon anywhere they are offered together, which is every
// perpendicular tee and every butt corner. Telling them apart needs something other than
// which faces are involved (they differ in how much material comes out, not where).
test('dado and mortise-tenon resolve to identical faces — outlines cannot distinguish them', () => {
  const suggestions = suggestJointsFor('H', [teeH, teeD], [])
  const dado = suggestions.find((s) => s.kind === 'dado')
  const mortiseTenon = suggestions.find((s) => s.kind === 'mortise-tenon')
  expect(dado).toBeDefined()
  expect(mortiseTenon).toBeDefined()
  expect(suggestionFaceRefs(dado!)).toEqual(suggestionFaceRefs(mortiseTenon!))
})

test('faceHitForDisplay keeps the local normal and adds the world normal', () => {
  // Unrotated: world normal equals local normal.
  const flat = board({ id: 'F' })
  const hFlat = faceHitForDisplay(flat, '+X')
  expect(hFlat.partId).toBe('F')
  expect(hFlat.localFaceNormal).toEqual({ x: 1, y: 0, z: 0 })
  expect(hFlat.faceNormal.x).toBeCloseTo(1)
  expect(hFlat.faceNormal.y).toBeCloseTo(0)
  expect(hFlat.faceNormal.z).toBeCloseTo(0)

  // Rotated Ry=-90: local +X maps to world +Z. This is the case that catches the bug —
  // an unrotated board cannot distinguish a world normal from a local one.
  const spun = board({ id: 'R', rotation: { x: 0, y: -90, z: 0 } })
  const hSpun = faceHitForDisplay(spun, '+X')
  expect(hSpun.localFaceNormal).toEqual({ x: 1, y: 0, z: 0 })
  expect(hSpun.faceNormal.x).toBeCloseTo(0)
  expect(hSpun.faceNormal.y).toBeCloseTo(0)
  expect(hSpun.faceNormal.z).toBeCloseTo(1)
})

// --- scene-wide suggestions -------------------------------------------------------------------
// The dedup rule is per kind, not uniform. Measured 2026-08-07: scoring a pair from both sides
// gives identical roles for dado and mortise-tenon (housing/housed is decided by geometry, not by
// which board was selected) but genuinely different joints for finger and tongue & groove.

function sceneKinds(parts: Part[]): string[] {
  return suggestJointsForScene(parts, [])
    .map((s) => s.kind)
    .sort()
}

test('scene: a perpendicular tee yields dado and mortise-tenon exactly once each', () => {
  // Both would appear twice if the reverse direction were kept for symmetric kinds.
  expect(sceneKinds([teeH, teeD])).toEqual(['dado', 'mortise-tenon'])
})

test('scene: a crossing lap yields one half-lap, not one per direction', () => {
  expect(sceneKinds([lapA, lapB])).toEqual(['halflap'])
})

test('scene: an edge glue-up offers the groove on either board', () => {
  const tg = suggestJointsForScene([edgeG, edgeE], []).filter((s) => s.kind === 'tongue-groove')
  expect(tg).toHaveLength(2)
  // The whole point of keeping both: which board carries the groove is a real choice.
  const grooved = tg.map((s) => (s.kind === 'tongue-groove' ? s.groovePartId : '')).sort()
  expect(grooved).toEqual(['E', 'G'])
})

test('scene: a box corner offers the finger joint led from either board', () => {
  const finger = suggestJointsForScene([cornerA, cornerB], []).filter((s) => s.kind === 'finger')
  expect(finger).toHaveLength(2)
  // partAId is the board that stays put while the other auto-seats — not interchangeable.
  const leads = finger.map((s) => (s.kind === 'finger' ? s.partAId : '')).sort()
  expect(leads).toEqual(['CA', 'CB'])
})

test('scene: a pair that already carries a joint is skipped, as in the per-part path', () => {
  const joint: Joint = {
    kind: 'halflap',
    id: 'j1',
    label: 'Half-lap 1',
    partAId: 'LA',
    partBId: 'LB',
    split: 0.5,
    clearance: 0,
  }
  expect(suggestJointsForScene([lapA, lapB], [joint])).toEqual([])
})

test('scene: hidden boards are excluded', () => {
  expect(suggestJointsForScene([lapA, { ...lapB, visible: false }], [])).toEqual([])
})

test('scene: every per-part suggestion for a board is reachable scene-wide', () => {
  const parts = [teeH, teeD]
  const scene = suggestJointsForScene(parts, [])
  for (const s of suggestJointsFor('H', parts, [])) {
    expect(
      scene.some((x) => x.kind === s.kind && pairIdsOf(x).sort().join() === pairIdsOf(s).sort().join()),
      `scene list is missing the ${s.kind} the per-part list offers`,
    ).toBe(true)
  }
})

test('pairIdsOf names both boards for every kind', () => {
  const parts = [cornerA, cornerB]
  for (const s of suggestJointsForScene(parts, [])) {
    expect(pairIdsOf(s).sort()).toEqual(['CA', 'CB'])
  }
})

test('scene: an all-pairs pass over a 24-board scene stays within budget', () => {
  const many: Part[] = []
  for (let i = 0; i < 24; i++) {
    many.push(board({ id: `B${i}`, position: { x: (i % 6) * 40, y: Math.floor(i / 6) * 40, z: 0 } }))
  }
  const t0 = performance.now()
  suggestJointsForScene(many, [])
  // Measured ~30ms for the equivalent per-part sweep; this guards an order-of-magnitude regression,
  // not a precise number, since it recomputes on every scene.parts change.
  expect(performance.now() - t0).toBeLessThan(300)
})
