import type { BoardPart, Component, ComponentId, Joint, Part, PartId } from './types'
import type { JointSuggestion } from './suggestJoints'
import { boardsTouch, aabbCenterDist } from './suggestJoints'
import { obbOverlap } from './obbOverlap'
import { groupByPair } from './groupSuggestions'

// Two runaway guards, sized to their lists rather than sharing one number. Actionable rows (jointed
// + open) are all real decisions, so their cap is generous — it only exists to bound a pathological
// scene, and 200 covers well over ten carcases. No-offer rows are muted noise the OBB filter has
// already pruned, so a tight cap keeps that section from ever growing long. Splitting the two is
// what restores the headroom the single 100-pair cap lost when it began counting touching pairs (a
// strictly larger set) rather than offering pairs.
export const MAX_ACTIONABLE_ROWS = 200
export const MAX_NOOFFER_ROWS = 50

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

// Float noise must not decide row order: two pairs the same distance apart can differ in the last
// bit, and falling through to the key tiebreak is what keeps the list stable across rebuilds.
const DIST_EPS = 1e-4

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
  byId: Map<ComponentId, Component>,
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
      if (!js && !boardsTouch(a, b, byId)) continue
      const dist = aabbCenterDist(a, b, byId)
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
      } else if (obbOverlap(a, b, byId)) {
        // boardsTouch is an AABB test — it over-reports for a diagonal corner-kiss or a rotated
        // board whose axis-aligned bounds balloon past its footprint. The oriented-box check keeps
        // the muted group honest: a pair that only overlaps as loose bounding boxes gets no row at
        // all, rather than padding the "no joint available" list. Run only on the no-offer path, so
        // the cheap AABB gate above still filters most pairs before the exact test.
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

  const byDistance = (x: ChecklistRow, y: ChecklistRow) => {
    const d = x.dist - y.dist
    if (Math.abs(d) > DIST_EPS) return d
    return x.key < y.key ? -1 : x.key > y.key ? 1 : 0
  }
  rows.sort(byDistance)
  unresolved.sort(byDistance)

  const capped = rows.slice(0, MAX_ACTIONABLE_ROWS)
  return {
    rows: capped,
    unresolved: unresolved.slice(0, MAX_NOOFFER_ROWS),
    // Counted from the capped rows, so the header can never claim more than is rendered.
    jointedCount: capped.filter((r) => r.state === 'jointed').length,
    actionableTotal: capped.length,
  }
}
