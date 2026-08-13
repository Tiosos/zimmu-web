import { test, expect } from 'vitest'
import type { JointSuggestion } from './suggestJoints'
import { groupByPair, orientationArrow, MAX_SCENE_PAIRS } from './groupSuggestions'

const dado = (housing: string, housed: string): JointSuggestion => ({
  kind: 'dado',
  neighborId: housed,
  housingPartId: housing,
  housingFace: '+Z',
  housedPartId: housed,
  housedEnd: '-X',
})

const mortiseTenon = (mortise: string, tenon: string): JointSuggestion => ({
  kind: 'mortise-tenon',
  neighborId: tenon,
  mortisePartId: mortise,
  mortiseFace: '+Z',
  tenonPartId: tenon,
  tenonEnd: '-X',
})

test('collapses every suggestion for one pair into a single group', () => {
  const groups = groupByPair([dado('A', 'B'), mortiseTenon('A', 'B')])
  expect(groups).toHaveLength(1)
  expect(groups[0].aId).toBe('A')
  expect(groups[0].bId).toBe('B')
  expect(groups[0].options).toHaveLength(2)
})

// The real carcase ordering: suggestJointsForScene sorts by pair distance and tiebreaks on kind,
// so two equidistant pairs interleave. This is the test an adjacency-based grouping fails.
test('groups a pair whose suggestions are interleaved with another pair', () => {
  const groups = groupByPair([
    dado('A', 'B'),
    dado('A', 'C'),
    mortiseTenon('A', 'B'),
    mortiseTenon('A', 'C'),
  ])
  expect(groups).toHaveLength(2)
  expect(groups.map((g) => g.options.length)).toEqual([2, 2])
})

test('orders groups by first appearance', () => {
  const groups = groupByPair([dado('A', 'C'), dado('A', 'B')])
  expect(groups.map((g) => g.bId)).toEqual(['C', 'B'])
})

// pairIdsOf returns role order, which differs per kind, so the same two boards can arrive either
// way round. They must still land in one group.
test('treats a pair as the same group regardless of role order', () => {
  const groups = groupByPair([dado('A', 'B'), mortiseTenon('B', 'A')])
  expect(groups).toHaveLength(1)
})

// groupByPair does not sort. It does not need to: within one pair every suggestion has the same
// pair distance, so suggestJointsForScene's tiebreak is KIND_PRIORITY — preserving input order is
// exactly what delivers KIND_PRIORITY chip order.
test('keeps options in input order within a group', () => {
  const groups = groupByPair([mortiseTenon('A', 'B'), dado('A', 'B')])
  expect(groups[0].options.map((o) => o.kind)).toEqual(['mortise-tenon', 'dado'])
})

test('returns an empty array for no suggestions', () => {
  expect(groupByPair([])).toEqual([])
})

const finger = (a: string, b: string): JointSuggestion => ({
  kind: 'finger',
  neighborId: b,
  partAId: a,
  endA: '+X',
  partBId: b,
  endB: '-X',
})

test('no arrow when a kind appears once in the group', () => {
  const [group] = groupByPair([dado('A', 'B'), finger('A', 'B')])
  expect(orientationArrow(group, group.options[0])).toBeNull()
  expect(orientationArrow(group, group.options[1])).toBeNull()
})

test('arrows point at whichever board leads when a kind appears twice', () => {
  const [group] = groupByPair([dado('A', 'B'), finger('A', 'B'), finger('B', 'A')])
  expect(group.aId).toBe('A')
  const fingers = group.options.filter((o) => o.kind === 'finger')
  // Both orientations survive grouping — they are different joints, not duplicates.
  expect(fingers).toHaveLength(2)
  expect(orientationArrow(group, fingers[0])).toBe('→')
  expect(orientationArrow(group, fingers[1])).toBe('←')
  expect(orientationArrow(group, group.options[0])).toBeNull()
})

test('caps the number of groups, and the last kept group is complete', () => {
  // The worst ordering suggestJointsForScene can produce: when pairs tie on distance the sort
  // falls through to kind, so across the whole tied set every dado precedes every mortise-tenon
  // and a pair's two options end up far apart. Measured on a real carcase, where Left Side+Bottom
  // and Left Side+Top are both 525mm and interleave exactly like this. This
  // is what makes the completeness assertion meaningful — slicing the flat list at 100 would keep
  // 100 dados and no mortise-tenons, producing 100 groups that each have one option instead of two.
  const many: JointSuggestion[] = []
  const pairCount = MAX_SCENE_PAIRS + 5
  for (let i = 0; i < pairCount; i++) many.push(dado('A', `B${i}`))
  for (let i = 0; i < pairCount; i++) many.push(mortiseTenon('A', `B${i}`))

  const groups = groupByPair(many)
  expect(groups).toHaveLength(MAX_SCENE_PAIRS)
  // A partial row is worse than an absent one: a missing chip is indistinguishable from a joint
  // the engine cannot make.
  expect(groups[groups.length - 1].options).toHaveLength(2)
})
