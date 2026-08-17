import { test, expect } from 'vitest'
import type { BoardPart, DadoJoint, Part } from './types'
import { suggestJointsForScene } from './suggestJoints'
import { defaultDadoJoint } from './defaultJoint'
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
