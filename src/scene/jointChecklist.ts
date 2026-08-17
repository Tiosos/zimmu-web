import type { BoardPart, Joint, Part, PartId } from './types'
import type { JointSuggestion } from './suggestJoints'
import { boardsTouch, aabbCenterDist } from './suggestJoints'
import { groupByPair, MAX_SCENE_PAIRS } from './groupSuggestions'

export type PairState = 'jointed' | 'open' | 'no-offer'

export interface ChecklistRow {
  key: string
  // Open rows preserve PairGroup role order, which orientationArrow reads to point its arrows;
  // jointed and no-offer rows take board-iteration order. See the comment on PairGroup.
  aId: PartId
  bId: PartId
  state: PairState
  options: JointSuggestion[]
  joints: Joint[]
  dist: number
}

export interface JointChecklist {
  rows: ChecklistRow[]
  unresolved: ChecklistRow[]
  jointedCount: number
  actionableTotal: number
}

function pairKey(x: PartId, y: PartId): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`
}

// Mirrors pairIdsOf for joints. Local to this module — one consumer, so no shared home until there
// is a second. The never guard makes a sixth joint kind a compile error rather than a pair silently
// reported as unjointed.
function jointPairIds(j: Joint): [PartId, PartId] {
  switch (j.kind) {
    case 'dado':
      return [j.housingPartId, j.housedPartId]
    case 'halflap':
      return [j.partAId, j.partBId]
    case 'mortise-tenon':
      return [j.mortisePartId, j.tenonPartId]
    case 'finger':
      return [j.partAId, j.partBId]
    case 'tongue-groove':
      return [j.groovePartId, j.tonguePartId]
    default: {
      const _exhaustive: never = j
      throw new Error(`unhandled joint kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

export function buildJointChecklist(
  parts: Part[],
  joints: Joint[],
  suggestions: JointSuggestion[],
): JointChecklist {
  // The same filter suggestJointsForScene uses. Any divergence would produce rows for pairs the
  // engine never considered.
  const boards = parts.filter((p): p is BoardPart => p.kind === 'board' && p.visible)

  const groups = new Map(groupByPair(suggestions).map((g) => [g.key, g]))
  const jointsByKey = new Map<string, Joint[]>()
  for (const j of joints) {
    const [x, y] = jointPairIds(j)
    const k = pairKey(x, y)
    const existing = jointsByKey.get(k)
    if (existing) existing.push(j)
    else jointsByKey.set(k, [j])
  }

  const rows: ChecklistRow[] = []
  const unresolved: ChecklistRow[] = []

  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const a = boards[i]
      const b = boards[j]
      const key = pairKey(a.id, b.id)
      const js = jointsByKey.get(key)
      // A recorded joint admits the row on its own. reconcileJoints preserves a stale joint, so a
      // joint outlives its boards being moved apart; gating on adjacency alone would drop the row
      // and silently decrement jointedCount.
      if (!js && !boardsTouch(a, b)) continue
      const dist = aabbCenterDist(a, b)
      if (js) {
        rows.push({ key, aId: a.id, bId: b.id, state: 'jointed', options: [], joints: js, dist })
        continue
      }
      const g = groups.get(key)
      if (g) {
        rows.push({
          key,
          aId: g.aId,
          bId: g.bId,
          state: 'open',
          options: g.options,
          joints: [],
          dist,
        })
      } else {
        unresolved.push({
          key,
          aId: a.id,
          bId: b.id,
          state: 'no-offer',
          options: [],
          joints: [],
          dist,
        })
      }
    }
  }

  const capped = rows.slice(0, MAX_SCENE_PAIRS)
  return {
    rows: capped,
    unresolved: unresolved.slice(0, MAX_SCENE_PAIRS),
    // Counted from the capped rows, so the header can never claim more than is rendered.
    jointedCount: capped.filter((r) => r.state === 'jointed').length,
    actionableTotal: capped.length,
  }
}
