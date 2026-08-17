import { test, expect } from 'vitest'
import type { BoardPart, DadoJoint, Part } from './types'
import { suggestJointsForScene } from './suggestJoints'
import { defaultDadoJoint } from './defaultJoint'
import { MAX_SCENE_PAIRS } from './groupSuggestions'
import { buildJointChecklist } from './jointChecklist'

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

// Perpendicular tee — the engine offers a dado and a mortise-tenon for this pair.
const teeH = board({ id: 'H', length: 200, width: 100, thickness: 20 })
const teeD = board({
  id: 'D',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 100, y: 30, z: 20 },
})

// Broad face on broad face: they touch, but no joint kind applies. Not a half-lap either —
// isValidHalfLap requires a shared stack axis with coincident spans, and these are stacked.
const stackLower = board({ id: 'L', length: 200, width: 100, thickness: 18 })
const stackUpper = board({
  id: 'U',
  length: 200,
  width: 100,
  thickness: 18,
  position: { x: 0, y: 0, z: 18 },
})

function build(parts: Part[], joints: DadoJoint[] = []) {
  return buildJointChecklist(parts, joints, suggestJointsForScene(parts, joints))
}

test('a touching pair with offers and no joint is open', () => {
  const c = build([teeH, teeD])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('open')
  expect(c.rows[0].options.length).toBeGreaterThan(0)
  expect(c.rows[0].joints).toEqual([])
})

test('a pair carrying a joint is jointed, and carries no options', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1')
  const c = build([teeH, teeD], [joint])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('jointed')
  expect(c.rows[0].joints).toEqual([joint])
  expect(c.rows[0].options).toEqual([])
})

test('a touching pair the engine has no offer for is no-offer, and is not a row', () => {
  const c = build([stackLower, stackUpper])
  expect(c.rows).toEqual([])
  expect(c.unresolved).toHaveLength(1)
  expect(c.unresolved[0].state).toBe('no-offer')
})

test('a non-touching pair produces no row at all', () => {
  const far = board({ id: 'F', position: { x: 5000, y: 0, z: 0 } })
  const c = build([teeH, teeD, far])
  expect([...c.rows, ...c.unresolved].map((r) => r.key)).toEqual(['D|H'])
})

// AABB adjacency over-reports: a small board sitting in the empty off-diagonal corner of a rotated
// bar's bounding box passes boardsTouch but does not actually meet the bar. The oriented-box check
// keeps it out of the no-offer group entirely, rather than padding that list with a phantom pair.
test('an AABB-only false positive is dropped from the no-offer group', () => {
  const bar = board({
    id: 'BAR',
    length: 200,
    width: 20,
    thickness: 20,
    rotation: { x: 0, y: 0, z: 45 },
  })
  const corner = board({
    id: 'S',
    length: 20,
    width: 20,
    thickness: 20,
    position: { x: 110, y: 0, z: 0 },
  })
  const c = build([bar, corner])
  expect(c.rows).toEqual([])
  expect(c.unresolved).toEqual([])
})

// reconcileJoints preserves a joint whose deriveJoint returns null, so a joint outlives its boards
// being moved apart. Gating rows on adjacency alone would drop it and silently decrement the count.
test('a jointed pair whose boards no longer touch still produces a jointed row', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1')
  const moved = { ...teeD, position: { x: 5000, y: 0, z: 0 } }
  const c = build([teeH, moved], [joint])
  expect(c.rows).toHaveLength(1)
  expect(c.rows[0].state).toBe('jointed')
  expect(c.jointedCount).toBe(1)
})

// The stacked pair is parked well clear of the tee: at the origin it would touch teeD's standing
// end and quietly become a second *open* row, which is not what this test is measuring.
test('counts exclude no-offer rows so 100% stays reachable', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1')
  const farLower = { ...stackLower, position: { x: 0, y: 1000, z: 0 } }
  const farUpper = { ...stackUpper, position: { x: 0, y: 1000, z: 18 } }
  const c = build([teeH, teeD, farLower, farUpper], [joint])
  expect(c.jointedCount).toBe(1)
  expect(c.actionableTotal).toBe(1)
  expect(c.unresolved).toHaveLength(1)
})

test('hidden and non-board parts produce no rows', () => {
  const hidden = { ...teeD, visible: false }
  expect(build([teeH, hidden]).rows).toEqual([])
  expect(build([teeH, hidden]).unresolved).toEqual([])
})

test('an empty scene produces empty arrays and zero counts', () => {
  const c = build([])
  expect(c).toEqual({ rows: [], unresolved: [], jointedCount: 0, actionableTotal: 0 })
})

// Two uprights on one shelf, at different distances from it, so row order is non-trivial.
const shelf = board({ id: 'S', length: 400, width: 100, thickness: 20 })
const upNear = board({
  id: 'N',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 180, y: 30, z: 20 },
})
const upFar = board({
  id: 'R',
  length: 80,
  width: 40,
  thickness: 18,
  rotation: { x: 0, y: -90, z: 0 },
  position: { x: 20, y: 30, z: 20 },
})

test('rows are ordered by pair centre distance, nearest first', () => {
  const c = build([shelf, upFar, upNear])
  expect(c.rows.map((r) => r.key)).toEqual(['N|S', 'R|S'])
})

// The whole point of computing distance for jointed rows too: joint the nearest pair and the row
// order must not move. Ordering off the suggestion list instead would make a row jump the moment
// you joint it, losing your place halfway through a carcase.
test('a row keeps its position when it flips from open to jointed', () => {
  const parts = [shelf, upFar, upNear]
  const before = build(parts)
  const joint = defaultDadoJoint(shelf, upNear, '+Z', '-X', 'joint_1', 'Dado 1')
  const after = build(parts, [joint])

  expect(after.rows.map((r) => r.key)).toEqual(before.rows.map((r) => r.key))
  expect(after.rows.find((r) => r.key === 'N|S')!.state).toBe('jointed')
  expect(after.rows.find((r) => r.key === 'R|S')!.state).toBe('open')
})

// Equidistant pairs otherwise fall back on board-iteration order and reshuffle as parts are added
// or reordered — the same interleaving trap groupByPair documents.
// Mirrored about the shelf's centre so both pairs are exactly equidistant. Two things bite here:
// under Ry=-90 `position.x` is the board's *max* x edge, so A spans x 2..20 (centre 11) and its
// mirror about the shelf centre of 200 is centre 389, i.e. position.x 398. And they must not be
// coincident copies — two boards in the same place overlap on every axis and form a half-lap with
// each other, adding a third row this test is not about.
test('equidistant pairs come back in deterministic key order', () => {
  const left = board({
    id: 'A',
    length: 80,
    width: 40,
    thickness: 18,
    rotation: { x: 0, y: -90, z: 0 },
    position: { x: 20, y: 30, z: 20 },
  })
  const right = { ...left, id: 'Z', position: { x: 398, y: 30, z: 20 } }
  const c = build([shelf, right, left])
  expect(c.rows.map((r) => r.key)).toEqual(['A|S', 'S|Z'])
})

// A flood of no-offer pairs must not eat the actionable list's budget. The uprights sit well clear
// of the stacked plates in x, so the only pairs in play are each plate on the base (no-offer) and
// each upright teed into it (open).
test('caps rows and no-offer rows independently', () => {
  const base = board({ id: 'B', length: 20000, width: 100, thickness: 20 })
  const parts: Part[] = [base]
  for (let i = 0; i < MAX_SCENE_PAIRS + 5; i++) {
    parts.push(
      board({
        id: `P${i}`,
        length: 40,
        width: 100,
        thickness: 18,
        position: { x: i * 60, y: 0, z: 20 },
      }),
    )
  }
  for (let i = 0; i < 3; i++) {
    parts.push(
      board({
        id: `T${i}`,
        length: 80,
        width: 40,
        thickness: 18,
        rotation: { x: 0, y: -90, z: 0 },
        position: { x: 10000 + i * 200, y: 30, z: 20 },
      }),
    )
  }
  const c = build(parts)
  expect(c.unresolved).toHaveLength(MAX_SCENE_PAIRS)
  expect(c.rows).toHaveLength(3)
  expect(c.rows.every((r) => r.state === 'open')).toBe(true)
  expect(c.actionableTotal).toBe(3)
})

// groupSuggestions.ts warns that PairGroup.aId is role order, and that sorting the ids would invert
// every orientation arrow. Open rows must inherit it verbatim rather than take board-loop order.
test('an open row inherits the group role order, not board-iteration order', () => {
  const c = build([teeH, teeD])
  const row = c.rows[0]
  const dado = row.options.find((o) => o.kind === 'dado')
  if (dado?.kind !== 'dado') throw new Error('expected a dado suggestion for the tee fixture')
  expect(row.aId).toBe(dado.housingPartId)
  expect(row.bId).toBe(dado.housedPartId)
})
