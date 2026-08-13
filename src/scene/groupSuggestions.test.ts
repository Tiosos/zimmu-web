import { test, expect } from 'vitest'
import type { JointSuggestion } from './suggestJoints'
import { groupByPair } from './groupSuggestions'

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
