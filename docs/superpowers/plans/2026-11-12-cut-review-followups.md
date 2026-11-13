# Cut-review follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report a box cut whose position or size is non-finite, and collapse a connected group of plain overlaps into one finding, without changing pair classification or the two-cut message.

**Architecture:** `cutVolumes.ts` gains `boxGeometryIsFinite`, the one statement of "this record can describe a volume", and `boxVolumeOf` delegates to it. `cutIntersections.ts` reports invalid boxes before the pair pass, then unions the qualifying pairs into components: contained and repeated cuts stay one finding each, plain intersections become one finding per component attached to its first cut, and every finding is sorted by the cut it is anchored on. No schema, file-format or drilling change.

**Tech Stack:** TypeScript, Vitest, pnpm. Spec:
`docs/superpowers/specs/2026-11-12-cut-review-followups-design.md`.

---

## Environment

- Working directory: `C:\Github Repos\zimmu`.
- This Windows host needs `NODE_OPTIONS=--no-experimental-webstorage` for the full suite; without it, Node 26's experimental `localStorage` global fails baseline tests.
- `pnpm check:file-casing` needs `C:\Program Files\Git\cmd` on `PATH`.
- Branch: `fix/cut-review-followups`, created from `main` before Task 1.
- Baseline before this plan: **251 test files, 4515 passed, 10 skipped**.
- Expected after this plan: **251 test files, 4525 passed, 10 skipped**.
- No file-format or schema version changes.

---

## File structure

| File | Responsibility after this plan |
| --- | --- |
| `src/scene/cutVolumes.ts` | Box volume model and the validity predicate. Knows nothing about pairs or findings. |
| `src/scene/cutIntersections.ts` | Box-cut findings for one board: invalid geometry, redundancy, clustered plain overlap, ordering. |
| `src/scene/manufacturingChecks.ts` | Adds `M<n>` references and targets; owns the unassessed list. |
| `src/scene/productionReview.ts` | Classifies findings; owns the policy sentence. |
| `src/scene/*.test.ts` | Behaviour pinned through public functions. |

No new source module: union-find is about ten lines used once, so it stays private to
`cutIntersections.ts`.

---

### Task 1: Extract the box geometry validity predicate

**Files:**
- Modify: `src/scene/cutVolumes.ts`
- Test: `src/scene/cutVolumes.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe('box cut volumes', ...)` block in `src/scene/cutVolumes.test.ts`:

```ts
  it('separates invalid geometry from an absent box', () => {
    expect(boxGeometryIsFinite(box())).toBe(true)
    expect(boxGeometryIsFinite(box({ position: { x: NaN, y: 20, z: 12 } }))).toBe(false)
    expect(boxGeometryIsFinite(box({ size: { x: Infinity, y: 100, z: 6 } }))).toBe(false)
    expect(boxGeometryIsFinite(box({ size: { x: -Infinity, y: 100, z: 6 } }))).toBe(false)
    expect(boxGeometryIsFinite(box({ size: { x: 0.05, y: 100, z: 6 } }))).toBe(true)
  })
```

Change the import on line 2 to:

```ts
import { boxGeometryIsFinite, boxVolumeOf } from './cutVolumes'
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm vitest run src/scene/cutVolumes.test.ts
```

Expected: FAIL — `boxGeometryIsFinite is not a function` (or a TypeScript error naming the missing
export). The other three tests still pass.

- [ ] **Step 3: Write the minimal implementation**

Replace the whole of `src/scene/cutVolumes.ts` with:

```ts
import { MIN_CUT_SIZE_MM } from '../geom/cutLimits'
import type { BoxCut, Vec3 } from './types'

export interface BoxVolume {
  min: Vec3
  max: Vec3
}

const isFiniteVec = (v: Vec3) => [v.x, v.y, v.z].every(Number.isFinite)

// True when the record can describe a volume: every position and size component is finite. A box
// that fails this is invalid — the record is wrong. A finite box at or below MIN_CUT_SIZE_MM is a
// different thing: merely absent from the solid. Only the first is reported.
export function boxGeometryIsFinite(box: BoxCut): boolean {
  return isFiniteVec(box.position) && isFiniteVec(box.size)
}

// A box cut removes [position, position + size]. A box with any size at or below the exporter's
// minimum is absent from the solid: makeShape skips it. The machining schedule still lists the
// definition, so "absent" means solid-absent, not packet-absent. A non-finite position or size
// cannot describe a volume, so it is absent for the same reason; makeShape does not skip it.
export function boxVolumeOf(box: BoxCut): BoxVolume | null {
  if (!boxGeometryIsFinite(box)) return null
  const { x, y, z } = box.size
  if (![x, y, z].every((n) => n > MIN_CUT_SIZE_MM)) return null
  return {
    min: box.position,
    max: { x: box.position.x + x, y: box.position.y + y, z: box.position.z + z },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm vitest run src/scene/cutVolumes.test.ts
```

Expected: PASS — **4 tests**.

- [ ] **Step 5: Commit**

```bash
git add src/scene/cutVolumes.ts src/scene/cutVolumes.test.ts
git commit -m "feat: expose box geometry validity"
```

---

### Task 2: Report invalid box-cut geometry

**Files:**
- Modify: `src/scene/cutIntersections.ts`
- Modify: `src/scene/cutIntersections.test.ts`
- Modify: `src/scene/manufacturingChecks.ts:116-125`
- Modify: `src/scene/manufacturingChecks.test.ts:50`
- Modify: `src/scene/productionReview.ts:98-104,229`
- Modify: `src/scene/productionReview.test.ts:181-191`

- [ ] **Step 1: Replace the skip test and add the validity tests**

In `src/scene/cutIntersections.test.ts`, replace the test
`skips a non-finite box and still compares the finite boxes` with:

```ts
  it('reports a non-finite box and still compares the finite boxes', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'broken', label: 'Broken pocket', position: { x: NaN, y: 100, z: 12 } }),
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 130, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board)).toEqual([
      {
        code: 'cut-geometry-review',
        message:
          'Cut "Broken pocket" [broken]: has a non-finite position or size, so its removed volume is undefined; correct the geometry before machining.',
        operation: {
          id: 'broken',
          label: 'Broken pocket',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
      {
        code: 'cut-intersection-review',
        message:
          'Cut "Shelf dado" [a]: shares removed material with cut "Shelf dado" [b]; verify this is intended.',
        operation: {
          id: 'a',
          label: 'Shelf dado',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
    ])
  })
```

Add these three tests immediately after it:

```ts
  it('reports a non-finite size as invalid geometry', () => {
    const board = boardOf()
    board.cuts = [box({ id: 'broken', size: { x: Infinity, y: 200, z: 6 } })]
    expect(cutIntersections(board).map((i) => [i.code, i.operation.id])).toEqual([
      ['cut-geometry-review', 'broken'],
    ])
  })

  it('reports each invalid box once in cut order', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'first', position: { x: NaN, y: 100, z: 12 } }),
      box({ id: 'second', size: { x: 60, y: -Infinity, z: 6 } }),
    ]
    expect(cutIntersections(board).map((i) => i.operation.id)).toEqual(['first', 'second'])
  })

  it('leaves a sub-minimum box silent and out of the pair pass', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'rank', size: { x: 0.05, y: 200, z: 6 } }),
      box({ id: 'ill', size: { x: 0.1, y: 200, z: 6 } }),
    ]
    expect(cutIntersections(board)).toEqual([])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm vitest run src/scene/cutIntersections.test.ts
```

Expected: FAIL — the three validity tests receive no finding (and the replaced test receives only
the overlap finding). `cut-geometry-review` does not exist yet.

- [ ] **Step 3: Implement the geometry finding**

In `src/scene/cutIntersections.ts`, change the import on line 10 to:

```ts
import { boxGeometryIsFinite, boxVolumeOf, type BoxVolume } from './cutVolumes'
```

Extend the code union:

```ts
export type CutIntersectionCode =
  | 'cut-intersection-review'
  | 'cut-redundant-review'
  | 'cut-geometry-review'
```

Add this helper immediately after `redundantIssue`:

```ts
function geometryIssue(cut: BoxCut): CutIntersectionIssue {
  return {
    code: 'cut-geometry-review',
    message: `Cut "${cut.label}" [${cut.id}]: has a non-finite position or size, so its removed volume is undefined; correct the geometry before machining.`,
    operation: operationOf(cut),
  }
}
```

Replace the opening of `cutIntersections` (the guard, the box collection and the `issues`
declaration) with:

```ts
export function cutIntersections(part: ManufacturingPart): CutIntersectionIssue[] {
  if (part.kind !== 'board') return []
  const boxes: { cut: BoxCut; volume: BoxVolume }[] = []
  const issues: CutIntersectionIssue[] = []
  for (const cut of part.cuts) {
    if (cut.kind !== 'box') continue
    const volume = boxVolumeOf(cut)
    if (volume !== null) boxes.push({ cut, volume })
    else if (!boxGeometryIsFinite(cut)) issues.push(geometryIssue(cut))
  }
```

Leave the pair loop and its `return issues` unchanged. The old `const issues` declaration that sat
between the box loop and the pair loop is now the one above; delete the duplicate.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm vitest run src/scene/cutIntersections.test.ts
```

Expected: PASS — **24 tests**.

- [ ] **Step 5: Write the integration test and change the unassessed assertion**

In `src/scene/manufacturingChecks.test.ts`, change line 50 from `.toContain` to:

```ts
    expect(before.unassessed).not.toContain('Non-finite box cut geometry')
```

Add this test immediately after the existing `attaches ...` cut-overlap test (the one that ends
with `targets: [{ id: board.id, ... }]` around line 265):

```ts
  it('reports invalid box geometry with the cut operation and drops the unassessed gap', () => {
    const scene = sceneOf()
    const board = boardOf(scene)
    board.cuts = [
      {
        kind: 'box',
        id: 'broken',
        label: 'Broken pocket',
        face: '+Z',
        position: { x: NaN, y: 100, z: 12 },
        size: { x: 60, y: 200, z: 6 },
        sourceJointId: 'joint-broken',
      },
    ]
    const report = reportOf(scene)
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({
      reference: 'M1',
      code: 'cut-geometry-review',
      message:
        'Cut "Broken pocket" [broken]: has a non-finite position or size, so its removed volume is undefined; correct the geometry before machining.',
      operation: {
        id: 'broken',
        label: 'Broken pocket',
        kind: 'box',
        sourceComponentId: null,
        sourceJointId: 'joint-broken',
      },
      targets: [{ id: board.id, label: board.label, cabinetId: null, parentId: null }],
    })
    expect(report.unassessed).not.toContain('Non-finite box cut geometry')
  })
```

- [ ] **Step 6: Run it to verify it fails**

```bash
pnpm vitest run src/scene/manufacturingChecks.test.ts
```

Expected: FAIL — the finding is reported, but `unassessed` still contains
`'Non-finite box cut geometry'`.

- [ ] **Step 7: Remove the unassessed line**

In `src/scene/manufacturingChecks.ts`, delete this entry from the `unassessed` array:

```ts
      'Non-finite box cut geometry',
```

The array now has seven entries in this order:

```ts
    unassessed: [
      'Cut interactions involving bevelled edges or round-stock notches',
      'Drilling that breaks into a different part',
      'Minimum remaining material between cuts',
      'Manual machining geometry',
      'Machine operation compatibility',
      'Hardware suitability',
      'Physical installation',
    ],
```

- [ ] **Step 8: Run the manufacturing checks tests**

```bash
pnpm vitest run src/scene/manufacturingChecks.test.ts
```

Expected: PASS.

- [ ] **Step 9: Add the advisory classification test**

Replace the test `treats overlapping and redundant cuts as advisory` in
`src/scene/productionReview.test.ts` with:

```ts
  it('treats invalid, overlapping and redundant cuts as advisory', () => {
    const input = inputOf()
    input.manufacturing.findings = [
      { reference: 'M1', code: 'cut-intersection-review', message: 'Overlap', targets: [] },
      { reference: 'M2', code: 'cut-redundant-review', message: 'Redundant', targets: [] },
      { reference: 'M3', code: 'cut-geometry-review', message: 'Invalid', targets: [] },
      { reference: 'M4', code: 'cut-size', message: 'Invalid', targets: [] },
    ]
    const review = buildProductionReview(input)
    expect(review.counts).toMatchObject({ needsCorrection: 1, advisory: 3 })
    expect(review.classification).toContain(
      'box cuts that are non-finite, overlapping or redundant',
    )
  })
```

- [ ] **Step 10: Run it to verify it fails**

```bash
pnpm vitest run src/scene/productionReview.test.ts
```

Expected: FAIL — `cut-geometry-review` is classified `needs-correction` (2 corrections, 2 advisory),
and the classification sentence does not contain the new phrase.

- [ ] **Step 11: Classify the code as advisory and update the policy sentence**

In `src/scene/productionReview.ts`, add the code to the advisory condition:

```ts
        f.code === 'cut-intersection-review' ||
        f.code === 'cut-redundant-review' ||
        f.code === 'cut-geometry-review'
```

Replace the policy sentence on line 229 with:

```ts
      'Invalid part, stock and cut-envelope definitions, missing parts and output mismatches need correction. Labels, joinery reminders, angled insertion, repeated or meeting drilling, and box cuts that are non-finite, overlapping or redundant are advisory. Skipped checks, assessment limits and unverified installation are unassessed.',
```

- [ ] **Step 12: Run the three affected files**

```bash
pnpm vitest run src/scene/cutIntersections.test.ts src/scene/manufacturingChecks.test.ts src/scene/productionReview.test.ts
```

Expected: PASS — **24 + the existing manufacturing and review tests**, no failures.

- [ ] **Step 13: Commit**

```bash
git add src/scene/cutIntersections.ts src/scene/cutIntersections.test.ts src/scene/manufacturingChecks.ts src/scene/manufacturingChecks.test.ts src/scene/productionReview.ts src/scene/productionReview.test.ts
git commit -m "feat: report invalid box cut geometry"
```

---

### Task 3: Report an overlap cluster once, ordered by cut

**Files:**
- Modify: `src/scene/cutIntersections.ts`
- Modify: `src/scene/cutIntersections.test.ts`

- [ ] **Step 1: Replace the pairwise expectation and add the cluster tests**

In `src/scene/cutIntersections.test.ts`, replace the test
`reports one finding per overlapping pair in input order` with:

```ts
  it('reports one finding for a three-cut cluster, at the first cut', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a', label: 'A' }),
      box({ id: 'b', label: 'B', position: { x: 150, y: 100, z: 12 } }),
      box({ id: 'c', label: 'C', position: { x: 140, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board)).toEqual([
      {
        code: 'cut-intersection-review',
        message:
          'Cut "A" [a]: forms one connected group of overlapping cuts with "B" [b] and "C" [c]; verify this is intended.',
        operation: {
          id: 'a',
          label: 'A',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
    ])
  })
```

Add these five tests after it:

```ts
  it('reports a chain of four overlaps once, naming every member', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a', label: 'A' }),
      box({ id: 'b', label: 'B', position: { x: 150, y: 100, z: 12 } }),
      box({ id: 'c', label: 'C', position: { x: 200, y: 100, z: 12 } }),
      box({ id: 'd', label: 'D', position: { x: 250, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board).map((i) => i.message)).toEqual([
      'Cut "A" [a]: forms one connected group of overlapping cuts with "B" [b], "C" [c] and "D" [d]; verify this is intended.',
    ])
  })

  it('reports two disjoint clusters separately', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a1', label: 'A1' }),
      box({ id: 'a2', label: 'A2', position: { x: 150, y: 100, z: 12 } }),
      box({ id: 'a3', label: 'A3', position: { x: 140, y: 100, z: 12 } }),
      box({ id: 'b1', label: 'B1', position: { x: 400, y: 100, z: 12 } }),
      box({ id: 'b2', label: 'B2', position: { x: 450, y: 100, z: 12 } }),
      box({ id: 'b3', label: 'B3', position: { x: 440, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board).map((i) => [i.operation.id, i.message])).toEqual([
      [
        'a1',
        'Cut "A1" [a1]: forms one connected group of overlapping cuts with "A2" [a2] and "A3" [a3]; verify this is intended.',
      ],
      [
        'b1',
        'Cut "B1" [b1]: forms one connected group of overlapping cuts with "B2" [b2] and "B3" [b3]; verify this is intended.',
      ],
    ])
  })

  it('keeps contained cuts as separate redundancies', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'outer', position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 18 } }),
      box({ id: 'p1', position: { x: 20, y: 20, z: 0 }, size: { x: 20, y: 20, z: 18 } }),
      box({ id: 'p2', position: { x: 120, y: 120, z: 0 }, size: { x: 20, y: 20, z: 18 } }),
    ]
    expect(cutIntersections(board).map((i) => [i.code, i.operation.id])).toEqual([
      ['cut-redundant-review', 'p1'],
      ['cut-redundant-review', 'p2'],
    ])
  })

  it('reports a mixed cluster once and its redundancy separately, in cut order', () => {
    const board = boardOf()
    board.cuts = [
      box({
        id: 'outer',
        label: 'Outer',
        position: { x: 0, y: 0, z: 0 },
        size: { x: 200, y: 200, z: 18 },
      }),
      box({
        id: 'pocket',
        label: 'Pocket',
        position: { x: 20, y: 20, z: 0 },
        size: { x: 20, y: 20, z: 18 },
      }),
      box({
        id: 'poke',
        label: 'Poke',
        position: { x: 150, y: 0, z: 0 },
        size: { x: 100, y: 200, z: 18 },
      }),
    ]
    expect(cutIntersections(board).map((i) => [i.code, i.operation.id, i.message])).toEqual([
      [
        'cut-intersection-review',
        'outer',
        'Cut "Outer" [outer]: forms one connected group of overlapping cuts with "Pocket" [pocket] and "Poke" [poke]; verify this is intended.',
      ],
      [
        'cut-redundant-review',
        'pocket',
        'Cut "Pocket" [pocket]: lies entirely inside cut "Outer" [outer]; it removes no additional material.',
      ],
    ])
  })

  it('orders geometry, cluster and redundancy findings by cut', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'broken', label: 'Broken', position: { x: NaN, y: 100, z: 12 } }),
      box({
        id: 'outer',
        label: 'Outer',
        position: { x: 0, y: 0, z: 0 },
        size: { x: 200, y: 200, z: 18 },
      }),
      box({
        id: 'poke',
        label: 'Poke',
        position: { x: 150, y: 0, z: 0 },
        size: { x: 100, y: 200, z: 18 },
      }),
      box({
        id: 'pocket',
        label: 'Pocket',
        position: { x: 20, y: 20, z: 0 },
        size: { x: 20, y: 20, z: 18 },
      }),
    ]
    expect(cutIntersections(board).map((i) => i.code)).toEqual([
      'cut-geometry-review',
      'cut-intersection-review',
      'cut-redundant-review',
    ])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm vitest run src/scene/cutIntersections.test.ts
```

Expected: FAIL — the three-cut cluster reports three findings instead of one, the chain and disjoint
cases report every pair, the mixed case reports three findings, and the ordering test gets the pair
order rather than cut order.

- [ ] **Step 3: Add union-find and the cluster message**

In `src/scene/cutIntersections.ts`, add this interface after `CutIntersectionIssue`:

```ts
interface AnchoredIssue {
  anchor: number
  issue: CutIntersectionIssue
}
```

Add these helpers immediately after `geometryIssue`:

```ts
function findRoot(parent: number[], i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]]
    i = parent[i]
  }
  return i
}

function union(parent: number[], a: number, b: number): void {
  const rootA = findRoot(parent, a)
  const rootB = findRoot(parent, b)
  if (rootA !== rootB) parent[rootB] = rootA
}

function clusterIssue(anchor: BoxCut, others: BoxCut[]): CutIntersectionIssue {
  const names = others.map((cut) => `"${cut.label}" [${cut.id}]`)
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return {
    code: 'cut-intersection-review',
    message: `Cut "${anchor.label}" [${anchor.id}]: forms one connected group of overlapping cuts with ${list}; verify this is intended.`,
    operation: operationOf(anchor),
  }
}
```

- [ ] **Step 4: Replace `cutIntersections` with the clustered, ordered version**

Replace the whole exported function (from `export function cutIntersections` to the final closing
brace) with:

```ts
export function cutIntersections(part: ManufacturingPart): CutIntersectionIssue[] {
  if (part.kind !== 'board') return []
  const boxes: { cut: BoxCut; volume: BoxVolume; at: number }[] = []
  const anchored: AnchoredIssue[] = []
  part.cuts.forEach((cut, at) => {
    if (cut.kind !== 'box') return
    const volume = boxVolumeOf(cut)
    if (volume !== null) boxes.push({ cut, volume, at })
    else if (!boxGeometryIsFinite(cut)) anchored.push({ anchor: at, issue: geometryIssue(cut) })
  })

  const parent = boxes.map((_, i) => i)
  const plain: [number, number][] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const first = boxes[i]
      const second = boxes[j]
      if (axes.some((axis) => sharedExtent(first.volume, second.volume, axis) <= tolerance))
        continue
      union(parent, i, j)
      const firstInSecond = containedBy(second.volume, first.volume)
      const secondInFirst = containedBy(first.volume, second.volume)
      if (firstInSecond && secondInFirst)
        anchored.push({
          anchor: second.at,
          issue: redundantIssue(second.cut, first.cut, 'repeat'),
        })
      else if (firstInSecond)
        anchored.push({ anchor: first.at, issue: redundantIssue(first.cut, second.cut, 'inside') })
      else if (secondInFirst)
        anchored.push({ anchor: second.at, issue: redundantIssue(second.cut, first.cut, 'inside') })
      else plain.push([i, j])
    }
  }

  const components = new Map<number, number[]>()
  for (let i = 0; i < boxes.length; i++) {
    const root = findRoot(parent, i)
    const members = components.get(root)
    if (members) members.push(i)
    else components.set(root, [i])
  }
  for (const root of new Set(plain.map(([i]) => findRoot(parent, i)))) {
    const members = components.get(root)!
    const anchor = boxes[members[0]]
    const others = members.slice(1).map((i) => boxes[i].cut)
    anchored.push({
      anchor: anchor.at,
      issue:
        others.length === 1
          ? intersectionIssue(anchor.cut, others[0])
          : clusterIssue(anchor.cut, others),
    })
  }

  return anchored.sort((a, b) => a.anchor - b.anchor).map((entry) => entry.issue)
}
```

The pair classification, tolerance and precedence are unchanged: a contained or identical pair
still pushes one redundancy, and only the remaining plain intersections join a component.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm vitest run src/scene/cutIntersections.test.ts
```

Expected: PASS — **29 tests**.

- [ ] **Step 6: Run the adjacent suites**

```bash
pnpm vitest run src/scene/cutVolumes.test.ts src/scene/cutIntersections.test.ts src/scene/drillingIntersections.test.ts src/scene/manufacturingChecks.test.ts src/scene/productionReview.test.ts src/scene/machiningSchedule.test.ts
```

Expected: PASS, no failures. `drillingIntersections` is unchanged and must stay green.

- [ ] **Step 7: Commit**

```bash
git add src/scene/cutIntersections.ts src/scene/cutIntersections.test.ts
git commit -m "feat: report an overlap cluster once"
```

---

### Task 4: Documentation, notes and full verification

**Files:**
- Modify: `README.md:45`
- Modify: `docs/production-review.md:8`
- Modify: `CLAUDE.md:379`
- Modify: `docs/superpowers/notes/2026-11-12-cut-review-followups-notes.md` (started in Task 1)
- Regenerate: `project-structure.html`

- [ ] **Step 1: Update the README readiness paragraph**

In `README.md`, replace the last sentence of the readiness bullet (the sentence beginning
`Overlapping or redundant board box cuts are reviewed as advisory;`) with:

```markdown
Overlapping or redundant board box cuts are reviewed as advisory, and a connected group of overlaps
is reported once at its first cut; a box cut with non-finite geometry is reported as advisory instead
of being silently skipped. Cut interactions involving bevelled edges or round-stock notches, minimum
remaining material, manual machining geometry and machine compatibility remain unassessed.
```

- [ ] **Step 2: Update the review policy doc**

In `docs/production-review.md`, scope the Needs correction bullet and extend the Advisory bullet
the same way the code policy sentence is scoped, so a non-finite box cut is not called both a
correction and an advisory:

```markdown
- **Needs correction:** invalid part, stock and cut-envelope definitions, missing generated parts/shelves, and missing, duplicated or mismatched machining output facts.
- **Advisory:** empty/duplicate part labels, repeated or meeting drilling, joinery reminders, angled shelf insertion, non-finite box-cut geometry, and overlapping or redundant cuts. IDs remain authoritative; recorded joints do not certify geometry.
```

- [ ] **Step 3: Extend the `CLAUDE.md` invariant**

Replace the existing box-cut invariant sentence with:

```markdown
- **Box cuts may meet on purpose; their overlap is advisory.** A back-panel groove runs into the bottom housing, a shelf housing runs into the toe-kick notch, and two joint housings meet at a corner. `sourceJointId` says which joint emitted a cut but not whether the meeting was intended, so `cutIntersections.ts` reviews every shared box volume (`cut-intersection-review`) instead of blocking it, attaches a wholly contained or repeated cut (`cut-redundant-review`) to the cut that removes nothing, reports a connected group of plain overlaps once at its first cut, and names a box whose position or size is non-finite as `cut-geometry-review` instead of skipping it in silence. The broad "interactions between cuts" gap is narrowed to bevelled edges and round-stock notches, not claimed covered; thin webs remain a separate check.
```

- [ ] **Step 4: Complete the delivery notes**

Update `docs/superpowers/notes/2026-11-12-cut-review-followups-notes.md`, which was created in
Task 1 so every task is recorded as it lands. Add the delivery sections above the progress log and
append the Task 4 entry:

```markdown
# Cut-review follow-ups — delivery notes

Date: 2026-11-12
Design: `docs/superpowers/specs/2026-11-12-cut-review-followups-design.md`
Plan: `docs/superpowers/plans/2026-11-12-cut-review-followups.md`

## What changed

`boxGeometryIsFinite` in `cutVolumes.ts` now distinguishes a record that cannot describe a volume
(non-finite position or size) from a box that is merely absent from the solid (size at or below
`MIN_CUT_SIZE_MM`). `boxVolumeOf` delegates to it, so the finiteness rule has one home.

`cutIntersections.ts` reports the first case as `cut-geometry-review`, anchored on the cut, and
excludes the box from the pair pass. It also unions the qualifying pairs into connected components:
plain intersections are reported once per component at its first cut, naming every member; contained
and repeated cuts stay one finding each. Every finding is sorted by the cut it is anchored on, so
`M<n>` references follow cut order.

`manufacturingChecks().unassessed` loses `'Non-finite box cut geometry'` (eight items to seven).
`productionReview` classifies the new code as advisory and names non-finite, overlapping or redundant
box cuts in its policy sentence. No schema or file-format change.

## Why advisory

A non-finite box is a defect, but the blocking `cut-size` code covers the part's cut envelope, and a
designer meets this finding mid-edit. The finding names the part, cut and label, so the reviewer can
act; promoting it to `needs-correction` is a one-line change if such cuts reach packets.

Cluster de-duplication changes the count of a finding, not its meaning. It inherits the stage-1
reasoning: the generator can emit legitimate meetings, so the verdict stays advisory.

## Known limits

- A box at or below `MIN_CUT_SIZE_MM` stays silent. It removes no solid material but is not a
  record defect; reporting it would fire on legitimate rank and ill cuts.
- A containment chain (A contains B contains C) still reports C twice, once inside A and once inside
  B. Collapsing to the outermost container is a separate decision.
- `drilling-overlap-review` remains pairwise per hole range; only box cuts are clustered.
- Bevelled edges, round-stock notches and minimum remaining material remain unassessed. The last is
  stage 2 of the cut-interference design and the next plan.

## Test coverage

- `cutVolumes.test.ts` — the validity predicate, including that a sub-minimum box is valid geometry.
- `cutIntersections.test.ts` — invalid position and size, one finding per invalid box in cut order,
  sub-minimum silence, three-cut cluster, four-cut chain, disjoint clusters, contained cuts kept
  separate, mixed cluster, and anchor ordering.
- `manufacturingChecks.test.ts` — the new code carries `M1`, the cut operation with joint provenance
  and the board target; the unassessed list no longer names the gap.
- `productionReview.test.ts` — `cut-geometry-review` is advisory and the policy sentence names it.

## Verification

Full suite on this Windows host, 2026-11-13:

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts
```

**251 files, 4525 passed, 10 skipped.** `pnpm typecheck`, `pnpm lint` and `pnpm check:file-casing`
all exit 0 (file-casing needs `C:\Program Files\Git\cmd` on `PATH`).

Mutation testing:

| Mutation | Observed failure |
| --- | --- |
| drop the geometry report | the invalid-box tests see no finding |
| report an absent box as invalid | the sub-minimum silence test fails |
| fold redundancies into the cluster | the contained-cuts test loses a finding |
| anchor a cluster on its last member | cluster message and ordering tests fail |
| remove the anchor sort | the ordering test returns pair order |

## Progress log

### Task 1 — Box geometry validity predicate

**Commit:** `feat: expose box geometry validity`

`boxGeometryIsFinite` added; `boxVolumeOf` delegates its finiteness check. Behaviour unchanged for
the drilling pass.

### Task 2 — Invalid box-cut geometry

**Commit:** `feat: report invalid box cut geometry`

Third code added to `CutIntersectionCode`; geometry findings emitted in cut order before the pair
findings; unassessed line removed; advisory classification and policy sentence updated.

### Task 3 — Overlap clusters and ordering

**Commit:** `feat: report an overlap cluster once`

Union-find over qualifying pairs; plain intersections emitted once per component at its first cut;
contained and repeated cuts kept individual; stable sort by anchor index.

### Task 4 — Documentation and verification

**Commit:** `docs: record the cut-review follow-ups`

README, `docs/production-review.md`, `CLAUDE.md`, these notes, the structure HTML and the full
verification.
```

- [ ] **Step 5: Run the full suite**

```bash
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts
```

Expected: **251 test files, 4525 passed, 10 skipped**. If a file count changed, a test file was
created or deleted by mistake; this plan adds no test files.

- [ ] **Step 6: Run typecheck, lint and file casing**

```bash
$env:PATH = "C:\Program Files\Git\cmd;" + $env:PATH; pnpm typecheck; "typecheck exit=$LASTEXITCODE"; pnpm lint; "lint exit=$LASTEXITCODE"; pnpm check:file-casing; "file-casing exit=$LASTEXITCODE"
```

Expected: all three exit 0.

- [ ] **Step 7: Mutation testing**

Back up the two source files first; never use `git checkout` to undo a mutation:

```bash
$d = "C:\Users\bill.ma\AppData\Local\Temp\opencode\cutfollowmut"
New-Item -ItemType Directory -Force -Path $d | Out-Null
Copy-Item src/scene/cutIntersections.ts "$d\cutIntersections.bak"
Copy-Item src/scene/cutVolumes.ts "$d\cutVolumes.bak"
```

Run each mutation, observe the named failure, then restore with
`Copy-Item "$d\cutIntersections.bak" src/scene/cutIntersections.ts -Force` (or `cutVolumes.bak` for
the predicate):

| Mutation | Edit | Must fail |
| --- | --- | --- |
| Drop the geometry report | delete the `else if (!boxGeometryIsFinite(cut)) anchored.push({ anchor: at, issue: geometryIssue(cut) })` line | `reports a non-finite box and still compares the finite boxes` |
| Report absent as invalid | change `else if (!boxGeometryIsFinite(cut))` to `else` | `leaves a sub-minimum box silent and out of the pair pass` |
| Fold redundancies into clusters | replace the classification block (`const firstInSecond` through `else plain.push([i, j])`) with `plain.push([i, j])` | `keeps contained cuts as separate redundancies` |
| Anchor on the last member | change `const anchor = boxes[members[0]]` to `boxes[members[members.length - 1]]` | `reports a mixed cluster once...` and the ordering test |
| Remove the sort | return `anchored.map((entry) => entry.issue)` | `orders geometry, cluster and redundancy findings by cut` |

After the last mutation, restore both files and confirm:

```bash
Select-String -Path src/scene/cutIntersections.ts -Pattern 'anchored.sort|members\[0\]|redundantIssue'
pnpm vitest run src/scene/cutVolumes.test.ts src/scene/cutIntersections.test.ts
```

Expected: the restored lines are present and **33 tests** pass (4 volume + 29 intersection).

- [ ] **Step 8: Regenerate the structure HTML**

```bash
node scripts/update-structure-html.mjs
```

Expected: `No RELEASE_TAG set — regenerated trees only, left version/date untouched.` If the script
reports a version change, do not commit it: this plan sets no release tag.

- [ ] **Step 9: Commit**

```bash
git add README.md docs/production-review.md CLAUDE.md docs/superpowers/notes/2026-11-12-cut-review-followups-notes.md project-structure.html
git commit -m "docs: record the cut-review follow-ups"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| `boxGeometryIsFinite` and `boxVolumeOf` delegation | Task 1 |
| Invalid reporting, one per box, excluded from pairs, silent absent | Task 2 |
| Unassessed list narrows to seven | Task 2 |
| `cut-geometry-review` advisory and policy sentence | Task 2 |
| Overlap graph, clusters, plain-only grouping, two-cut wording | Task 3 |
| Component members named in cut order | Task 3 |
| Anchor-index ordering and stable ties | Task 3 |
| README, review doc, `CLAUDE.md`, notes | Task 4 |
| Full suite, typecheck, lint, casing, mutations | Task 4 |
| Out-of-scope items (sub-minimum, chains, drilling, stage 2) | recorded in notes, no code |

**Placeholder scan:** every step has code, a command or exact prose; no TBD or "similar to".

**Type consistency:** `boxGeometryIsFinite` (Task 1) is the name used in Task 2 and Task 4.
`CutIntersectionCode` gains `cut-geometry-review` in Task 2 and is not renamed. `AnchoredIssue`,
`findRoot`, `union` and `clusterIssue` are defined in Task 3 before use. `at` is the `part.cuts`
index throughout, so geometry, redundancy and cluster anchors share one scale.
