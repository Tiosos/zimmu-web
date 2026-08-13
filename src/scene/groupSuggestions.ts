import type { PartId } from './types'
import type { JointSuggestion } from './suggestJoints'
import { pairIdsOf } from './suggestJoints'

// Runaway guard on rows, not on suggestions. A row is one real decision where a suggestion was a
// quarter of one, so this sits far above any scene measured: an 8-board carcase needs 14 rows and
// three of them need 42. Applied after grouping so a rendered row is always complete — capping the
// flat list instead would render a pair with only some of its kinds.
export const MAX_SCENE_PAIRS = 100

export interface PairGroup {
  key: string
  aId: PartId
  bId: PartId
  options: JointSuggestion[]
}

// Keyed by a sorted pair id, because pairIdsOf returns role order — a dado gives
// [housing, housed], a finger joint gives [partA, partB] — so the same two boards arrive either way
// round. Keyed by a Map rather than by collapsing adjacent runs, because suggestJointsForScene
// sorts by pair distance and tiebreaks on kind, so equidistant pairs interleave and a pair's
// suggestions are not contiguous. Map iteration order is insertion order, which gives
// first-appearance row ordering for free.
export function groupByPair(suggestions: JointSuggestion[]): PairGroup[] {
  const groups = new Map<string, PairGroup>()
  for (const s of suggestions) {
    const [x, y] = pairIdsOf(s)
    const key = x < y ? `${x}|${y}` : `${y}|${x}`
    const existing = groups.get(key)
    if (existing) existing.options.push(s)
    else groups.set(key, { key, aId: x, bId: y, options: [s] })
  }
  return [...groups.values()].slice(0, MAX_SCENE_PAIRS)
}

// Only the ORIENTATION_MATTERS kinds (finger, tongue-groove) can appear twice for one pair, so an
// arrow is added only when that happens. '→' means the row's first-named board leads: it carries
// the finger joint's partA role, or the groove. Matches the →/← lead convention JointsPanel already
// uses for an existing joint.
export function orientationArrow(group: PairGroup, s: JointSuggestion): '→' | '←' | null {
  if (group.options.filter((o) => o.kind === s.kind).length < 2) return null
  const leadId =
    s.kind === 'finger' ? s.partAId : s.kind === 'tongue-groove' ? s.groovePartId : null
  if (leadId === null) return null
  return leadId === group.aId ? '→' : '←'
}
