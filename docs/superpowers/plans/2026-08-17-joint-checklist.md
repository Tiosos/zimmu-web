# Joint Checklist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the scene suggestions panel into a checklist. Every touching board pair keeps a row in one of three states — jointed (`✓`), open (chips), or no-offer (muted, its own collapsed section) — so the panel answers "have I jointed everything?" rather than only "what can I do next?".

**Architecture:** A new pure module `src/scene/jointChecklist.ts` joins three inputs — the touching-pair set (re-derived from the engine's own adjacency predicate), `scene.joints`, and the engine's suggestions — into `ChecklistRow[]`. The scoring engine is untouched: `suggestJointsForScene` keeps discarding jointed pairs. All rows sort on pair centre distance so a row holds its slot when it flips open → jointed.

**Tech Stack:** TypeScript (strict), React 19, Vitest + happy-dom + @testing-library/react, Tailwind v4, shadcn-style Radix primitives.

**Spec:** `docs/superpowers/specs/2026-08-17-joint-checklist-design.md`
**Notes:** `docs/superpowers/notes/2026-08-17-joint-checklist-notes.md`

---

## Background the engineer needs

Four facts drive the whole implementation. Getting any of them wrong produces a checklist that looks right on a two-board fixture and is wrong on a carcase.

1. **An existing joint admits a row on its own — adjacency is the weaker source of truth.** `reconcileJoints.ts:27-29` preserves a joint whose `deriveJoint` returns `null` (it keeps the last-good cuts and position rather than deleting). So a joint outlives its boards being moved apart. Gating rows on `boardsTouch` alone drops that row and silently decrements `jointedCount`. Row admission is `boardsTouch(a, b) || pairHasJoint`.

2. **`groupByPair` currently truncates, and that is a correctness bug once something classifies by it.** `groupSuggestions.ts:36` ends `.slice(0, MAX_SCENE_PAIRS)`. Harmless while the only consumer rendered the groups; fatal here, because "no group for this pair" would become a positive claim of "no joint available". The cap moves up to `buildJointChecklist`. **Task 2 must land before Task 3.**

3. **`PairGroup.aId` is role order, not sorted order.** `groupSuggestions.ts:13-16` warns that `orientationArrow` reads `aId` to decide arrow direction, so "tidying" the ids would silently invert every arrow on real data. Open rows must inherit `aId`/`bId` from the group verbatim; jointed and no-offer rows take board-iteration order.

4. **Distance is computed for every row, not inherited from the suggestion list.** This is the one property that makes the checklist usable — a row that jumps position the moment you joint it loses your place mid-carcase. Task 4 exists solely to pin it.

Run the full check suite before every commit:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## File Structure

| File | Responsibility |
|---|---|
| `src/scene/suggestJoints.ts` | Export `boardsTouch` (extracted) and `aabbCenterDist`; `cornerPair` delegates. |
| `src/scene/suggestJoints.test.ts` | `boardsTouch` cases. |
| `src/scene/groupSuggestions.ts` | Drop the `.slice`. Pure grouping; `MAX_SCENE_PAIRS` stays exported from here. |
| `src/scene/groupSuggestions.test.ts` | Cap test moves out; add a no-truncation test. |
| `src/scene/jointChecklist.ts` | **new.** `buildJointChecklist`, `ChecklistRow`, `PairState`, `JointChecklist`. No React. |
| `src/scene/jointChecklist.test.ts` | **new.** Unit tests for the above. |
| `src/ui/SceneSuggestionsPanel.tsx` | Counter header, `✓` rows, chips on open rows, nested no-offer section. |
| `src/ui/SceneSuggestionsPanel.test.tsx` | New state / counter / hover assertions. |
| `src/ui/sidebar.tsx` | Thread `onHoverPair` through to the panel. |
| `src/App.tsx` | `hoveredPair` state; `highlightedIds` falls back to it. |
| `docs/superpowers/notes/2026-08-17-joint-checklist-notes.md` | Append the outcome. |
| `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md` | Close the "Open" item. |
| `project-structure.html` | Add the new module. |

---

### Task 1: `boardsTouch` — one adjacency predicate the checklist can share

**Files:**
- Modify: `src/scene/suggestJoints.ts`
- Test: `src/scene/suggestJoints.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/suggestJoints.test.ts`. The file already imports `board` and defines `teeH` / `teeD` at lines 22-50:

```ts
// The checklist's denominator is this predicate, so it must agree with the engine's own idea of
// "these two boards meet" rather than being a third private copy.
test('boardsTouch: true for boards that meet, false for separated boards', () => {
  expect(boardsTouch(teeH, teeD)).toBe(true)
  const far = board({ id: 'F', position: { x: 5000, y: 0, z: 0 } })
  expect(boardsTouch(teeH, far)).toBe(false)
})

test('boardsTouch: true for boards touching broad face to broad face', () => {
  const lower = board({ id: 'L', length: 200, width: 100, thickness: 18 })
  const upper = board({
    id: 'U',
    length: 200,
    width: 100,
    thickness: 18,
    position: { x: 0, y: 0, z: 18 },
  })
  expect(boardsTouch(lower, upper)).toBe(true)
})
```

Add `boardsTouch` to the existing import from `./suggestJoints` at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: FAIL — `boardsTouch` is not exported, so the import errors.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/suggestJoints.ts`, insert immediately above `export function contactPair` (currently line 137):

```ts
// The adjacency predicate: do these two boards meet at all? Shared by cornerPair and the scene
// checklist (jointChecklist.ts), which needs exactly the engine's own notion of "touching" for its
// denominator. contactPair deliberately keeps its own fused copy — it derives contactAx and bestGap
// from the same iteration, so delegating here would walk the axes twice for no gain.
export function boardsTouch(a: BoardPart, b: BoardPart): boolean {
  const A = worldAabb(a)
  const B = worldAabb(b)
  for (const ax of WORLD_AXES) {
    if (Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax]) > TOUCH_TOL) return false
  }
  return true
}
```

Then replace `cornerPair`'s opening lines (currently 198-203):

```ts
  const A = worldAabb(a)
  const B = worldAabb(b)
  for (const ax of WORLD_AXES) {
    const gap = Math.max(A.min[ax], B.min[ax]) - Math.min(A.max[ax], B.max[ax])
    if (gap > TOUCH_TOL) return null
  }
```

with:

```ts
  if (!boardsTouch(a, b)) return null
  const A = worldAabb(a)
  const B = worldAabb(b)
```

This recomputes `worldAabb` once more per call than before. Accepted: `cornerPair` is already the cheaper of the two paths and the alternative is keeping a third copy of the predicate. Do **not** "optimise" it back by inlining.

Finally, add `export` to `aabbCenterDist` (currently line 229) — the checklist needs it as its ordering key:

```ts
export function aabbCenterDist(a: BoardPart, b: BoardPart): number {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/suggestJoints.test.ts`
Expected: PASS — all tests in the file, including the existing `cornerPair` cases. Those are the parity guard on the extraction: if any of them break, `boardsTouch` does not match the prelude it replaced.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass; test count up by 2.

- [ ] **Step 6: Commit**

```bash
git add src/scene/suggestJoints.ts src/scene/suggestJoints.test.ts
git commit -m "refactor(scene): extract boardsTouch so the checklist shares the engine's adjacency test"
```

---

### Task 2: `groupByPair` stops truncating

The cap must move **before** anything classifies by group presence, or beyond 100 pairs the checklist reports "no joint available" for pairs the engine has offers for.

**Files:**
- Modify: `src/scene/groupSuggestions.ts`
- Test: `src/scene/groupSuggestions.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scene/groupSuggestions.test.ts`, **replace** the existing test `'caps the number of groups, and the last kept group is complete'` with:

```ts
// The cap moved to buildJointChecklist. It has to: the checklist classifies a pair by whether
// groupByPair returned a group for it, so a truncation here turns "absent because truncated" into
// a positive claim of "no joint available".
test('does not truncate — every pair survives grouping', () => {
  const many: JointSuggestion[] = []
  for (let i = 0; i < MAX_SCENE_PAIRS + 5; i++) {
    many.push(dado('A', `B${i}`))
    many.push(mortiseTenon('A', `B${i}`))
  }
  const groups = groupByPair(many)
  expect(groups).toHaveLength(MAX_SCENE_PAIRS + 5)
  expect(groups[groups.length - 1].options).toHaveLength(2)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: FAIL — `expected length 100 to be 105`.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/groupSuggestions.ts`, change the return of `groupByPair` from:

```ts
  return [...groups.values()].slice(0, MAX_SCENE_PAIRS)
```

to:

```ts
  return [...groups.values()]
```

Update the `MAX_SCENE_PAIRS` doc comment (currently lines 5-8) to say where the cap is now applied:

```ts
// Runaway guard on rows. Applied by buildJointChecklist (jointChecklist.ts), not here: the checklist
// classifies a pair by whether grouping produced a group for it, so truncating before that point
// would report "no joint available" for pairs that have offers. A row is one real decision — an
// 8-board carcase needs 14 and three of them need 42. Note it now bounds *touching* pairs, a
// strictly larger set than the offering pairs it used to bound.
export const MAX_SCENE_PAIRS = 100
```

`MAX_SCENE_PAIRS` stays exported from this module — moving the constant as well as its application would churn imports for no gain.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/groupSuggestions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass. `SceneSuggestionsPanel` still renders every group — it has no >100-pair test, so nothing else moves.

- [ ] **Step 6: Commit**

```bash
git add src/scene/groupSuggestions.ts src/scene/groupSuggestions.test.ts
git commit -m "fix(scene): stop truncating in groupByPair so a classifier cannot misread absence"
```

---

### Task 3: `buildJointChecklist` — three states and the counts

**Files:**
- Create: `src/scene/jointChecklist.ts`
- Test: `src/scene/jointChecklist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/jointChecklist.test.ts`. Fixtures use the real engine rather than hand-built suggestion literals — both are pure and browser-free, and it is the join between them this module exists to make:

```ts
import { test, expect } from 'vitest'
import type { BoardPart, Part } from './types'
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

function build(parts: Part[], joints = [] as ReturnType<typeof defaultDadoJoint>[]) {
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

test('counts exclude no-offer rows so 100% stays reachable', () => {
  const joint = defaultDadoJoint(teeH, teeD, '+Z', '-X', 'joint_1', 'Dado 1')
  const c = build([teeH, teeD, stackLower, stackUpper], [joint])
  expect(c.jointedCount).toBe(1)
  expect(c.actionableTotal).toBe(1)
  expect(c.unresolved.length).toBeGreaterThan(0)
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

// groupSuggestions.ts:13-16 warns that PairGroup.aId is role order, and that sorting the ids would
// invert every orientation arrow. Open rows must inherit it verbatim.
test('an open row inherits the group role order, not board-iteration order', () => {
  const c = build([teeH, teeD])
  const [x, y] = [c.rows[0].aId, c.rows[0].bId]
  const first = c.rows[0].options[0]
  expect(first.kind === 'dado' && first.housingPartId).toBe(x)
  expect(y).toBe('D')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: FAIL — `Failed to resolve import "./jointChecklist"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/scene/jointChecklist.ts`:

```ts
import type { BoardPart, Joint, Part, PartId } from './types'
import type { JointSuggestion } from './suggestJoints'
import { boardsTouch, aabbCenterDist } from './suggestJoints'
import { groupByPair, MAX_SCENE_PAIRS } from './groupSuggestions'

export type PairState = 'jointed' | 'open' | 'no-offer'

export interface ChecklistRow {
  key: string
  // Open rows preserve PairGroup role order, which orientationArrow reads to point its arrows;
  // jointed and no-offer rows take board-iteration order. See groupSuggestions.ts:13-16.
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

// Float noise must not decide row order: two pairs 525 mm apart can differ in the last bit, and
// falling through to the key tiebreak is what keeps the list stable across rebuilds.
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
```

Sorting is deliberately absent — Task 4 adds it against a failing test.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: PASS — 9 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/jointChecklist.ts src/scene/jointChecklist.test.ts
git commit -m "feat(scene): buildJointChecklist classifies every board pair as jointed, open or no-offer"
```

---

### Task 4: Stable distance ordering

The single most important behavioural property of the feature, and the only one nothing else would catch.

**Files:**
- Modify: `src/scene/jointChecklist.ts`
- Test: `src/scene/jointChecklist.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/jointChecklist.test.ts`:

```ts
// Two uprights on one shelf, at different distances from it, so the row order is non-trivial.
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
// or reordered — the same interleaving trap groupSuggestions.ts:22-26 documents.
test('equidistant pairs come back in deterministic key order', () => {
  const mirrored = board({
    id: 'A',
    length: 80,
    width: 40,
    thickness: 18,
    rotation: { x: 0, y: -90, z: 0 },
    position: { x: 20, y: 30, z: 20 },
  })
  const alsoMirrored = { ...mirrored, id: 'Z' }
  const c = build([shelf, alsoMirrored, mirrored])
  expect(c.rows.map((r) => r.key)).toEqual(['A|S', 'S|Z'])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: FAIL — `'rows are ordered by pair centre distance'` returns `['R|S', 'N|S']` (board-iteration order, since `upFar` precedes `upNear` in the array).

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/jointChecklist.ts`, insert immediately before `const capped = ...`:

```ts
  const byDistance = (x: ChecklistRow, y: ChecklistRow) => {
    const d = x.dist - y.dist
    if (Math.abs(d) > DIST_EPS) return d
    return x.key < y.key ? -1 : x.key > y.key ? 1 : 0
  }
  rows.sort(byDistance)
  unresolved.sort(byDistance)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: PASS — 12 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/jointChecklist.ts src/scene/jointChecklist.test.ts
git commit -m "feat(scene): order checklist rows by pair distance so a row holds its slot when jointed"
```

---

### Task 5: Cap rows and no-offer rows independently

**Files:**
- Test: `src/scene/jointChecklist.test.ts`

Task 3 already wrote the two `.slice` calls. This task pins them, and pins that they are independent — a wall of no-offer rows must not starve the actionable list.

- [ ] **Step 1: Write the tests**

Add `MAX_SCENE_PAIRS` to the test file's imports:

```ts
import { MAX_SCENE_PAIRS } from './groupSuggestions'
```

Append:

```ts
test('caps rows and no-offer rows independently', () => {
  const parts: Part[] = [board({ id: 'B', length: 20000, width: 100, thickness: 20 })]
  // Stacked broad-face-on-broad-face pairs: touching, but no kind applies — all no-offer.
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
  const c = build(parts)
  expect(c.unresolved).toHaveLength(MAX_SCENE_PAIRS)
  // The actionable list is bounded by its own cap, not shortened by the no-offer flood.
  expect(c.rows.length).toBeLessThanOrEqual(MAX_SCENE_PAIRS)
  expect(c.actionableTotal).toBe(c.rows.length)
})
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run src/scene/jointChecklist.test.ts`
Expected: PASS — 13 passed. This is a guard test over Task 3's implementation, so it passes immediately. If it fails, the two `.slice` calls in Task 3 were written against one shared budget — fix `jointChecklist.ts`, not the test.

- [ ] **Step 3: Commit**

```bash
git add src/scene/jointChecklist.test.ts
git commit -m "test(scene): pin independent caps on checklist rows and no-offer rows"
```

---

### Task 6: Render the checklist

**Files:**
- Modify: `src/ui/SceneSuggestionsPanel.tsx`
- Modify: `src/ui/SceneSuggestionsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/ui/SceneSuggestionsPanel.test.tsx`, the existing `scene()` helper returns three boards at the origin with no joints. Those boards all touch (identical AABBs), which is what the existing tests need.

Add to the imports:

```tsx
import type { DadoJoint, PartId } from '../scene/types'
```

Every existing `render(...)` call in the file gains `onHoverPair={vi.fn()}`. Then **replace** the existing test `'the header counts pairs, not suggestions'` with:

```tsx
test('the header counts jointed against actionable', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={interleaved}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
    />,
  )
  expect(screen.getByText(/Joints — 0 \/ 2/)).toBeTruthy()
})
```

and update the two `fireEvent.click(screen.getByText(/All possible joints/))` calls elsewhere in the file to `fireEvent.click(screen.getByText(/Joints —/))`.

Append:

```tsx
const dadoJoint = (housing: PartId, housed: PartId): DadoJoint => ({
  kind: 'dado',
  id: 'joint_1',
  label: 'Dado 1',
  housingPartId: housing,
  housingFace: '+Z',
  housedPartId: housed,
  housedEnd: '-X',
  offset: 0,
  depth: 6,
  clearance: 0,
  profile: 'plain',
  tongueThickness: 9,
  rabbetFace: '+Z',
  stopStart: 0,
  stopEnd: 0,
})

function jointedScene() {
  return { ...scene(), joints: [dadoJoint('A', 'B')] }
}

test('a jointed pair renders a tick and its kind, with no chips', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={[]}
      scene={jointedScene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/Joints —/))
  expect(screen.getByText(/✓ Left Side \+ Bottom/)).toBeTruthy()
  expect(screen.getByText('Dado')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Dado' })).toBeNull()
})

test('the counter reads jointed over actionable', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={[dado('A', 'C')]}
      scene={jointedScene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
    />,
  )
  expect(screen.getByText(/Joints — 1 \/ 2/)).toBeTruthy()
})

test('hovering a jointed row reports the pair, and leaving clears it', () => {
  const onHoverPair = vi.fn()
  render(
    <SceneSuggestionsPanel
      suggestions={[]}
      scene={jointedScene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={onHoverPair}
    />,
  )
  fireEvent.click(screen.getByText(/Joints —/))
  const row = screen.getByText(/✓ Left Side \+ Bottom/)
  fireEvent.mouseEnter(row)
  expect(onHoverPair).toHaveBeenLastCalledWith(['A', 'B'])
  fireEvent.mouseLeave(row)
  expect(onHoverPair).toHaveBeenLastCalledWith(null)
})

// The no-offer group is muted, uncounted and closed by default: on a carcase it is noise most of
// the time, and inlining it would re-inflate the row count grouping brought down from 40 to 14.
test('no-offer pairs live in their own section, closed by default', () => {
  render(
    <SceneSuggestionsPanel
      suggestions={[]}
      scene={scene()}
      onApply={vi.fn()}
      onHoverSuggestion={vi.fn()}
      onHoverPair={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText(/Joints —/))
  expect(screen.getByText(/No joint available \(3\)/)).toBeTruthy()
  expect(screen.queryByText('Left Side + Bottom')).toBeNull()
  fireEvent.click(screen.getByText(/No joint available/))
  expect(screen.getByText('Left Side + Bottom')).toBeTruthy()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/ui/SceneSuggestionsPanel.test.tsx`
Expected: FAIL — `Unable to find an element with the text: /Joints —/`. The panel still renders "All possible joints (N)".

- [ ] **Step 3: Write the minimal implementation**

In `src/ui/SceneSuggestionsPanel.tsx`, keep `KIND_LABEL`, `CHIP_LABEL`, `label()` and `describe()` exactly as they are. `KIND_LABEL` is keyed by `JointSuggestion['kind']`, which is the same five-member union as `Joint['kind']`, so it indexes a joint without change.

Replace the `groupSuggestions` import with:

```tsx
import { orientationArrow } from '../scene/groupSuggestions'
import { buildJointChecklist } from '../scene/jointChecklist'
```

and add `PartId` to the type import from `../scene/types`.

Replace the whole `SceneSuggestionsPanel` function with:

```tsx
export function SceneSuggestionsPanel({
  suggestions,
  scene,
  onApply,
  onHoverSuggestion,
  onHoverPair,
}: {
  suggestions: JointSuggestion[]
  scene: Scene
  onApply: (s: JointSuggestion) => void
  onHoverSuggestion: (s: JointSuggestion | null) => void
  onHoverPair: (ids: [PartId, PartId] | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [unresolvedOpen, setUnresolvedOpen] = useState(false)
  const { rows, unresolved, jointedCount, actionableTotal } = useMemo(
    () => buildJointChecklist(scene.parts, scene.joints, suggestions),
    [scene.parts, scene.joints, suggestions],
  )
  if (rows.length === 0 && unresolved.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border px-2">
      <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground py-1.5 cursor-pointer select-none hover:text-foreground transition-colors">
        {open ? '▾' : '▸'} Joints — {jointedCount} / {actionableTotal}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center gap-1 py-0.5 border-t border-border/30"
            onMouseEnter={r.state === 'jointed' ? () => onHoverPair([r.aId, r.bId]) : undefined}
            onMouseLeave={r.state === 'jointed' ? () => onHoverPair(null) : undefined}
          >
            <span className="flex-1 text-[11px] text-foreground">
              {r.state === 'jointed' ? '✓ ' : ''}
              {label(scene, r.aId)} + {label(scene, r.bId)}
            </span>
            {r.state === 'jointed' ? (
              <span className="text-[11px] text-muted-foreground">
                {r.joints.map((j) => KIND_LABEL[j.kind]).join(', ')}
              </span>
            ) : (
              <div className="flex flex-wrap gap-1 justify-end">
                {r.options.map((s) => {
                  const arrow = orientationArrow(r, s)
                  return (
                    // Keyed by kind+arrow, not index: within a row only finger/tongue-groove repeat,
                    // and orientationArrow gives those two entries distinct arrows, so this is unique
                    // and — unlike an index — stable when the row's options change between renders.
                    <Button
                      key={`${s.kind}${arrow ?? ''}`}
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-1.5"
                      title={describe(scene, s)}
                      onMouseEnter={() => onHoverSuggestion(s)}
                      onMouseLeave={() => onHoverSuggestion(null)}
                      onClick={() => onApply(s)}
                    >
                      {CHIP_LABEL[s.kind]}
                      {arrow ? ` ${arrow}` : ''}
                    </Button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
        {unresolved.length > 0 && (
          <Collapsible
            open={unresolvedOpen}
            onOpenChange={setUnresolvedOpen}
            className="border-t border-border/30"
          >
            <CollapsibleTrigger className="w-full flex items-center gap-1 text-[10px] text-muted-foreground/70 py-1 cursor-pointer select-none hover:text-muted-foreground transition-colors">
              {unresolvedOpen ? '▾' : '▸'} No joint available ({unresolved.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {unresolved.map((r) => (
                <div key={r.key} className="py-0.5 text-[11px] text-muted-foreground/70">
                  {label(scene, r.aId)} + {label(scene, r.bId)}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
```

`orientationArrow(r, s)` typechecks against `ChecklistRow` because its parameter is structurally `{ aId, options }` — if TypeScript objects, widen `orientationArrow`'s first parameter to `{ aId: PartId; options: JointSuggestion[] }` rather than casting at the call site.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/ui/SceneSuggestionsPanel.test.tsx`
Expected: PASS — 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SceneSuggestionsPanel.tsx src/ui/SceneSuggestionsPanel.test.tsx
git commit -m "feat(ui): scene panel renders a joint checklist with a progress counter"
```

---

### Task 7: Thread the pair-hover tint through

**Files:**
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/App.tsx`

`pnpm typecheck` is failing at this point — Task 6 added a required prop that nothing passes. That is the failing state this task resolves.

- [ ] **Step 1: Verify the failing state**

Run: `pnpm typecheck`
Expected: FAIL — `Property 'onHoverPair' is missing` at the `SceneSuggestionsPanel` usage in `sidebar.tsx:1082`.

- [ ] **Step 2: Thread the prop through the sidebar**

In `src/ui/sidebar.tsx`:

- add to `SidebarProps` (beside `onHoverSuggestion`, line 84):
  ```ts
  onHoverPair: (ids: [PartId, PartId] | null) => void
  ```
  `PartId` is already imported in this file.
- add `onHoverPair,` to the destructured parameter list (beside `onHoverSuggestion`, line 860)
- pass it at the `SceneSuggestionsPanel` call site (line 1082):
  ```tsx
  onHoverPair={onHoverPair}
  ```

- [ ] **Step 3: Add the state in App**

In `src/App.tsx`, add below `hoveredSuggestion` (line 71):

```tsx
// A done row has no suggestion to preview, so it tints both boards without drawing face outlines.
// That is the complete answer for a jointed pair, not a degraded one: there is no candidate
// geometry an outline could depict.
const [hoveredPair, setHoveredPair] = useState<[PartId, PartId] | null>(null)
```

Change `highlightedIds` (lines 75-78) to:

```tsx
const highlightedIds = useMemo(
  () => (hoveredSuggestion ? pairIdsOf(hoveredSuggestion) : hoveredPair),
  [hoveredSuggestion, hoveredPair],
)
```

Leave `hoveredOutlines` unchanged — it stays driven by `hoveredSuggestion` alone.

Pass the setter to `Sidebar` beside `onHoverSuggestion` (line 415):

```tsx
onHoverPair={setHoveredPair}
```

Add `PartId` to the type import from `./scene/types` if it is not already there.

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/sidebar.tsx src/App.tsx
git commit -m "feat(ui): tint both boards when hovering a jointed checklist row"
```

---

### Task 8: Verify in the browser

Unit tests use synthetic fixtures. This confirms the real engine, the real scene state and the real viewport agree.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Open `http://localhost:5173` in Chrome. Wait for the OCCT WASM to boot — `+ Board` becomes enabled.

- [ ] **Step 2: Build a two-board tee**

Click `+ Board` twice. Leave Board 1 at its defaults. Select Board 2 and set Rotation Y to `-90`, Position to X `100`, Y `30`, Z `20`.

- [ ] **Step 3: Check the open state**

Expand the `Joints` section. Expected: header reads `Joints — 0 / 1`, one row `Board 1 + Board 2` with `Dado` and `M&T` chips.

- [ ] **Step 4: Check the flip to done**

Click `Dado`. Expected: the row **stays**, now reading `✓ Board 1 + Board 2  Dado`, and the header reads `Joints — 1 / 1`. On `main` the row disappears entirely — that difference is the whole feature.

- [ ] **Step 5: Check hover on the done row**

Hover the `✓` row. Expected: both boards tint in the viewport; no face outlines are drawn. Move away: the tint clears.

- [ ] **Step 6: Check the no-offer section**

Add a third board and leave it at the defaults, overlapping Board 1. Expected: a `No joint available` section appears, closed, with its own count; the header count does **not** include it.

- [ ] **Step 7: Record the result**

Append to `docs/superpowers/notes/2026-08-17-joint-checklist-notes.md` under a new `## <date> — shipped` heading: what the browser check showed, and anything that differed from the plan.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/notes/2026-08-17-joint-checklist-notes.md
git commit -m "docs: record joint checklist browser verification"
```

---

### Task 9: Close the docs loop

**Files:**
- Modify: `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Close the open item on the older thread**

That file's `## Open` section ends with:

> The scene panel still shows only *unjointed* pairs (a pair drops out once jointed). If the checklist framing proves valuable, the migration is to keep jointed pairs listed as done — which needs the engine to report what it currently discards.

Replace that bullet with a pointer to this work, recording that the engine was **not** changed:

```markdown
- ~~The scene panel still shows only *unjointed* pairs.~~ Closed 2026-08-17 by the joint checklist
  (`docs/superpowers/specs/2026-08-17-joint-checklist-design.md`). The engine still discards jointed
  pairs — `jointChecklist.ts` re-derives the touching-pair set above it from the same `boardsTouch`
  predicate, so `suggestForOrderedPair` never had to report what it drops.
```

- [ ] **Step 2: Add the new module to the structure reference**

Run: `grep -n "groupSuggestions.ts" project-structure.html`
Expected: one hit at line 539, inside the `src/scene/` table.

Insert immediately after that row:

```html
          <tr><td><code>jointChecklist.ts</code></td><td>Joins touching pairs, <code>scene.joints</code> and suggestions into <code>ChecklistRow[]</code> — each pair <em>jointed</em>, <em>open</em> or <em>no-offer</em> — ordered by pair distance so a row keeps its slot when it flips to done.</td></tr>
```

Also update the `groupSuggestions.ts` row's trailing clause, since the cap no longer lives there: replace `<code>MAX_SCENE_PAIRS</code> caps rows, not suggestions.` with `<code>MAX_SCENE_PAIRS</code> is applied by <code>jointChecklist.ts</code>.`

- [ ] **Step 3: Verify**

Run: `grep -c "jointChecklist" project-structure.html`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md project-structure.html
git commit -m "docs: add jointChecklist to the structure reference and close the older open item"
```

---

## Done when

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all pass
- [ ] Every touching pair has a row; jointed pairs stay listed with a `✓`
- [ ] The header reads `Joints — {jointed} / {jointed + open}`, excluding no-offer rows
- [ ] No-offer pairs are in their own section, closed by default, with their own count
- [ ] A row keeps its position when it flips open → jointed (pinned by test, seen in the browser)
- [ ] Hovering a done row tints both boards and draws no outlines
- [ ] A joint whose boards were moved apart still shows as jointed
- [ ] `groupByPair` no longer truncates; `MAX_SCENE_PAIRS` is applied in `jointChecklist.ts`
- [ ] Notes, the 2026-08-07 open item, and `project-structure.html` updated
