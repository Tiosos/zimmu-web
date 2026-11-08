# Drilling Intersection Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the readiness report prove that no drilling operation on a part collides with another
cut, instead of listing "Drilling intersections with other cuts" as unassessed.

**Architecture:** A new pure module, `src/scene/drillingIntersections.ts`, builds nominal part-local
drill and obstacle volumes from the manufacturing records and classifies each hole against each
other cut. `drillingChecks()` calls it after the existing per-cut validation and appends its issues,
so `manufacturingChecks`, the machining schedule and the release review pick them up unchanged. No
geometry kernel, no world transforms, no enumeration of a hole array's `count`.

**Tech Stack:** TypeScript, Vitest, pnpm. Geometry is scalar arithmetic only.

**Spec:** `docs/superpowers/specs/2026-11-01-drilling-intersections-design.md`

## Global Constraints

- Board-local millimetres; board axes are `x = length`, `y = width`, `z = thickness`, material
  `[0,L] × [0,W] × [0,T]`. `BoxCut.position` is the minimum corner.
- Tolerance `1e-6` mm, the same constant `drillingChecks.ts` already uses. Contact, or overlap no
  thicker than the tolerance, is not a finding.
- A box cut with any size `<= 0.1` mm does not exist — the same threshold `makeShape` uses.
- Never allocate or iterate proportionally to a hole array's `count`; a row is answered with
  arithmetic and bisection.
- Findings are deterministic: pairs are visited in `part.cuts` index order (`i < j`).
- New codes: `drilling-intersection` and `drilling-redundant` are blocking, `drilling-overlap-review`
  is advisory. No schema version changes.
- `manufacturingProject()` and `machiningProject()` must stay finding-free.
- Accessibility, React and the DOM are irrelevant to this module: it takes a `ManufacturingPart` and
  returns plain data.
- Full suite on this Windows host:
  `pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts`

## Review Focus

1. **An enormous, off-board hole array** (e.g. `count: 1_000_000_000` with a start far outside the
   board) must return in well under a second. A reasonable person expects the readiness report to
   open, not to hang.
2. **A dado whose edge is tangent to a shelf-pin hole**, or overlaps it by `1e-7` mm, must not block
   release. Floating-point round-trips through component transforms are normal.
3. **A counterbore/stepped coaxial pair** (hinge cup plus through hole) must be allowed, not blocked
   as a duplicate definition.
4. **A dowel that is through-drilled and then trimmed square at one end** must not report the trim as
   a collision. It is an ordinary shop operation, and the `manual-round` fixture is exactly this
   shape.
5. **A drill that already failed `drilling-bounds`** must still be intersected, so fixing the bounds
   error does not silently reveal (or hide) a collision.

---

## Stage 1 — boards

### Task 1: Drill × box intersection

**Files:**

- Create: `src/geom/cutLimits.ts`
- Modify: `src/geom/occt.ts:407`
- Create: `src/scene/drillingIntersections.ts`
- Modify: `src/scene/drillingChecks.ts` (codes, model, wiring)
- Modify: `src/scene/machiningSchedule.ts:40`
- Modify: `src/scene/manufacturingChecks.ts:117-123`
- Create: `src/scene/drillingIntersections.test.ts`
- Modify: `src/scene/drillingChecks.test.ts:167-173`
- Modify: `src/ui/buildReadinessPdf.test.ts:86`

**Interfaces:**

- Consumes: `ManufacturingPart` from `./manufacturingPart`; `faceAxes` from `./snapMath`;
  `HoleArrayCut`, `DowelBoreAxial`, `DowelBoreTransverse` from `./types`.
- Produces:
  - `src/geom/cutLimits.ts`: `export const MIN_CUT_SIZE_MM = 0.1`
  - `src/scene/drillingIntersections.ts`:
    ```ts
    export type DrillingCut = HoleArrayCut | DowelBoreAxial | DowelBoreTransverse
    export type DrillingIntersectionCode =
      | 'drilling-intersection'
      | 'drilling-redundant'
      | 'drilling-overlap-review'
    export interface DrillingIntersectionIssue {
      code: DrillingIntersectionCode
      cut: DrillingCut
      detail: string // message suffix only; drillingChecks adds the `Drilling "<label>" [<id>]: ` prefix
    }
    export function drillingIntersections(
      part: ManufacturingPart,
      undefinedVolume: ReadonlySet<string>, // ids of cuts whose volume is undefined; skip them
    ): DrillingIntersectionIssue[]
    ```
  - `drillingChecks.ts` imports `DrillingCut` from the new module (its local alias is deleted) and
    extends `DrillingCheckCode` with the three new codes.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/drillingIntersections.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { drillingIntersections } from './drillingIntersections'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import type { BoxCut, HoleArrayCut } from './types'

const boardOf = (): ManufacturingBoard => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board')
  scene.parts.forEach((p) => {
    p.cuts = []
  })
  return manufacturingParts(scene.parts, scene.materials, scene.components)[0] as ManufacturingBoard
}
const hole = (overrides: Partial<HoleArrayCut> = {}): HoleArrayCut => ({
  kind: 'hole-array',
  id: 'row',
  label: 'Shelf pins',
  face: '+Z',
  axis: 'U',
  start: { x: 200, y: 380, z: 18 },
  pitch: 32,
  count: 5,
  diameter: 5,
  depth: 12,
  ...overrides,
})
const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box' as const,
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z' as const,
  position: { x: 230, y: 330, z: 12 },
  size: { x: 60, y: 100, z: 6 },
  ...overrides,
})

describe('drilling intersections', () => {
  it('reports the contiguous hole range that breaks into a box cut', () => {
    const board = boardOf()
    board.cuts = [hole(), box()]
    expect(drillingIntersections(board, new Set()).map((i) => [i.code, i.detail])).toEqual([
      [
        'drilling-intersection',
        'holes 2–3 of 5 intersect cut "Shelf dado" [dado]; the opening is broken.',
      ],
    ])
  })
  it('ignores tangency and overlap within 1e-6 mm', () => {
    for (const [overlap, expected] of [
      [0, 0],
      [1e-7, 0],
      [1e-3, 1],
    ] as const) {
      const board = boardOf()
      board.cuts = [
        hole({ count: 1, pitch: 0 }),
        box({ position: { x: 202.5 - overlap, y: 330, z: 12 } }),
      ]
      expect(drillingIntersections(board, new Set())).toHaveLength(expected)
    }
  })
  it('treats a box cut with any size at or below 0.1 mm as absent', () => {
    const board = boardOf()
    board.cuts = [
      hole({ count: 1, pitch: 0 }),
      // The thin box must straddle the hole, or the test would pass without the size skip.
      box({ position: { x: 202, y: 379.975, z: 12 }, size: { x: 60, y: 0.05, z: 6 } }),
    ]
    expect(drillingIntersections(board, new Set())).toEqual([])
  })
  it('skips cuts whose volume is undefined', () => {
    const board = boardOf()
    board.cuts = [hole(), box()]
    expect(drillingIntersections(board, new Set(['row']))).toEqual([])
  })
  it('answers a huge row by arithmetic, not by enumerating it', () => {
    const board = boardOf()
    board.cuts = [
      hole({ count: 1_000_000_000, pitch: 32, diameter: 3, start: { x: 0, y: 380, z: 18 } }),
      box(),
    ]
    const issues = drillingIntersections(board, new Set())
    expect(issues).toHaveLength(1)
    expect(issues[0].detail).toBe(
      'holes 9–10 of 1000000000 intersect cut "Shelf dado" [dado]; the opening is broken.',
    )
  })
  it('still intersects a row that is out of bounds', () => {
    const board = boardOf()
    board.cuts = [hole({ count: 1000 }), box()]
    expect(drillingIntersections(board, new Set())).toHaveLength(1)
  })
})
```

In `src/scene/drillingChecks.test.ts`, replace the stale unassessed expectation:

```ts
expect(reportOf(scene).unassessed).toEqual(
  expect.arrayContaining([
    'Manual machining geometry',
    'Drilling intersections with round stock',
    'Machine operation compatibility',
  ]),
)
```

In `src/ui/buildReadinessPdf.test.ts:86`, replace `'Drilling intersections with other cuts'` with
`'Drilling intersections with round stock'`.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts`
Expected: FAIL — `Cannot find module './drillingIntersections'`.

- [ ] **Step 3: Add the shared constant and use it in the exporter**

Create `src/geom/cutLimits.ts`:

```ts
// A box cut thinner than this is treated as absent by the geometry exporter. Checks must agree with
// it, or a readiness finding would describe a cut the packet never manufactures.
export const MIN_CUT_SIZE_MM = 0.1
```

In `src/geom/occt.ts`, import it and change line 407 to:

```ts
if (cut.size.x <= MIN_CUT_SIZE_MM || cut.size.y <= MIN_CUT_SIZE_MM || cut.size.z <= MIN_CUT_SIZE_MM)
  continue
```

- [ ] **Step 4: Implement `drillingIntersections()` for box cuts**

Create `src/scene/drillingIntersections.ts`. It must:

- Iterate pairs `i < j` over `part.cuts`, skipping any cut whose `id` is in `undefinedVolume`.
- Skip `cylinder` parts entirely in this stage (`if (part.kind !== 'board') return []`); Stage 2
  replaces this guard.
- Build a drill family from a `HoleArrayCut`:
  - `axes = faceAxes(cut.face)`; entry plane `entry = cut.face.startsWith('+') ? dims[axes.depth] : 0`;
    inward direction `sign = cut.face.startsWith('+') ? -1 : +1`; `height = min(cut.depth, dims[axes.depth])`.
  - The run axis is `axes.u` for `axis: 'U'`, `axes.v` for `axis: 'V'`; the across axis is the other.
  - Hole `k` (0-based) sits at `start[run] + k * pitch` on that axis, `start[across]` across, its
    cylinder axis along the depth axis from `entry` inward `height`, radius `diameter / 2`.
- Build a box obstacle as `{ min: cut.position, max: position + size }`, skipping it when any size is
  `<= MIN_CUT_SIZE_MM`.
- Test a hole against a box exactly: the axial intervals overlap by more than `1e-6`, **and** the 2D
  distance from the hole centre to the rectangle `[min.u, max.u] × [min.v, max.v]` is
  `< radius - 1e-6`.
- Find the affected index range by bisection, not scanning: the per-index predicate is monotone along
  a straight row because the distance to a convex rectangle is convex. Implement one helper that
  returns the first and last index in `[0, count - 1]` satisfying a monotone predicate, and reuse it
  in every later stage.
- Format the detail with 1-based indices:
  - `count === 1` → `the hole …`
  - one hole → `hole 4 of 12 …`
  - contiguous run → `holes 3–7 of 12 …` (en dash, not a hyphen)
  - the intersection sentence is `… intersect cut "<label>" [<id>]; the opening is broken.`
- Sort the output by the pair's `(i, j)` order and return.

- [ ] **Step 5: Run the module tests**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts`
Expected: PASS (all six tests).

- [ ] **Step 6: Wire the module into `drillingChecks()`**

In `src/scene/drillingChecks.ts`:

- Import `drillingIntersections` and `type DrillingCut`; delete the local `DrillingCut` alias.
- Extend `DrillingCheckCode` with `'drilling-intersection' | 'drilling-redundant' | 'drilling-overlap-review'`.
- Track undefined volumes: `const undefinedVolume = new Set<string>()`, and add `cut.id` on every
  path that `continue`s because the geometry cannot be built — `drilling-size`, `drilling-array`,
  both `drilling-unassessed` paths, the non-finite-entry `drilling-position` path, and the
  non-finite transverse position/azimuth path. Do **not** add ids for `drilling-bounds` or for a
  merely off-face `drilling-position`.
- After the loop, append:

  ```ts
  for (const issue of drillingIntersections(part, undefinedVolume))
    add(issue.cut, issue.code, issue.detail)
  ```

- [ ] **Step 7: Filter the new codes out of the machining schedule's validity set**

In `src/scene/machiningSchedule.ts:40`:

```ts
const invalidDrilling = new Set(
  drillingChecks(p)
    .filter(
      (issue) =>
        issue.code !== 'drilling-intersection' &&
        issue.code !== 'drilling-redundant' &&
        issue.code !== 'drilling-overlap-review',
    )
    .map((issue) => issue.operation.id),
)
```

- [ ] **Step 8: Update the unassessed lists for stage 1**

In `src/scene/manufacturingChecks.ts`, replace `'Drilling intersections with other cuts'` with:

```ts
'Drilling intersections with round stock',
'Drilling intersections with bevelled edges (mitre and angled end cuts)',
'Drilling that breaks into a different part',
'Minimum remaining material between cuts',
```

In `src/scene/machiningSchedule.ts`, replace `'Interactions between cuts'` with
`'Interactions between cuts other than board drilling'`.

- [ ] **Step 9: Run the affected suites**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts src/scene/drillingChecks.test.ts src/scene/manufacturingChecks.test.ts src/scene/machiningSchedule.test.ts src/ui/buildReadinessPdf.test.ts`
Expected: PASS. If `manufacturingProject()` now reports a finding, stop and inspect it: a real
collision is a fixture defect to fix, never a reason to relax the predicate.

- [ ] **Step 10: Commit**

```bash
git add src/geom/cutLimits.ts src/geom/occt.ts src/scene/drillingIntersections.ts src/scene/drillingIntersections.test.ts src/scene/drillingChecks.ts src/scene/drillingChecks.test.ts src/scene/machiningSchedule.ts src/scene/manufacturingChecks.ts src/ui/buildReadinessPdf.test.ts
git commit -m "feat: report drilling that breaks into a box cut"
```

---

### Task 2: Fully voided holes

**Files:**

- Modify: `src/scene/drillingIntersections.ts`
- Modify: `src/scene/drillingIntersections.test.ts`

**Interfaces:**

- Consumes: everything from Task 1.
- Produces: `drilling-redundant` issues; a partly voided, partly clipped row can produce two issues
  for the same pair, redundant first.

- [ ] **Step 1: Write the failing tests**

Append to `drillingIntersections.test.ts`:

```ts
it('reports a hole that lies wholly inside a cut instead of a collision', () => {
  const board = boardOf()
  board.cuts = [
    hole(),
    box({
      id: 'pocket',
      label: 'Pocket',
      position: { x: 250, y: 330, z: 6 },
      size: { x: 32, y: 100, z: 12 },
    }),
  ]
  expect(drillingIntersections(board, new Set()).map((i) => [i.code, i.detail])).toEqual([
    [
      'drilling-redundant',
      'hole 3 of 5 lies entirely inside cut "Pocket" [pocket]; no hole will remain.',
    ],
  ])
})
it('splits a partly voided, partly clipped row into redundant then clipped', () => {
  const board = boardOf()
  board.cuts = [
    hole({ pitch: 20, count: 5, diameter: 10 }),
    box({
      id: 'pocket',
      label: 'Pocket',
      position: { x: 240, y: 330, z: 6 },
      size: { x: 50, y: 100, z: 12 },
    }),
  ]
  expect(drillingIntersections(board, new Set()).map((i) => i.code)).toEqual([
    'drilling-redundant',
    'drilling-intersection',
  ])
})
```

For the second test the pocket spans `x ∈ [240, 290]`. With holes at `x = 200, 220, 240, 260, 280`
and radius 5, hole 3 (`[235, 245]`) crosses the pocket's left edge and is clipped, while holes 4 and
5 are wholly inside. The pair therefore yields `drilling-redundant` then `drilling-intersection`.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts`
Expected: FAIL — the first test reports `drilling-intersection`, the second returns `[]`.

- [ ] **Step 3: Implement the redundant range**

In `drillingIntersections.ts`, for each drill × box pair compute the wholly-inside predicate (the
cylinder's axial interval inside the box's depth interval, and the circle inside the rectangle), find
its contiguous index range with the same bisection helper, emit `drilling-redundant` for that range,
and compute the intersection range only over the remaining indices. Emit the redundant range first.
Detail: `… lies entirely inside cut "<label>" [<id>]; no hole will remain.` with `lie`/`lies`
agreeing with the subject.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/drillingIntersections.ts src/scene/drillingIntersections.test.ts
git commit -m "feat: report holes that a cut removes entirely"
```

---

### Task 3: Drill × drill on boards

**Files:**

- Modify: `src/scene/drillingIntersections.ts`
- Modify: `src/scene/drillingIntersections.test.ts`
- Modify: `src/scene/productionReview.ts:97-98,223`
- Modify: `src/scene/productionReview.test.ts`

**Interfaces:**

- Consumes: Task 1's drill family and bisection helper.
- Produces: `drilling-overlap-review` issues for repeated or two-sided coaxial holes;
  `drilling-intersection` for every other overlapping pair; the advisory mapping in
  `productionReview`.

- [ ] **Step 1: Write the failing tests**

Append to `drillingIntersections.test.ts`:

```ts
const one = (overrides: Partial<HoleArrayCut> = {}) => hole({ count: 1, pitch: 0, ...overrides })

it('allows a stepped coaxial pair and reviews an identical one', () => {
  const stepped = boardOf()
  stepped.cuts = [one(), one({ id: 'cup', label: 'Cup', depth: 8 })]
  expect(drillingIntersections(stepped, new Set())).toEqual([])

  const duplicate = boardOf()
  duplicate.cuts = [one(), one({ id: 'cup', label: 'Cup' })]
  expect(drillingIntersections(duplicate, new Set()).map((i) => [i.code, i.detail])).toEqual([
    [
      'drilling-overlap-review',
      'the hole repeats drilling "Cup" [cup] at the same position and diameter; verify this is intended.',
    ],
  ])
})
it('reviews identical drills from opposite faces and blocks unequal ones that meet', () => {
  const identical = boardOf()
  identical.cuts = [one({ depth: 9 }), one({ id: 'back', label: 'Back', face: '-Z', depth: 9 })]
  expect(drillingIntersections(identical, new Set()).map((i) => i.code)).toEqual([
    'drilling-overlap-review',
  ])

  const meeting = boardOf()
  meeting.cuts = [one({ depth: 12 }), one({ id: 'back', label: 'Back', face: '-Z', depth: 8 })]
  expect(drillingIntersections(meeting, new Set()).map((i) => i.code)).toEqual([
    'drilling-intersection',
  ])
})
it('blocks holes from adjacent faces that meet at a corner', () => {
  const board = boardOf()
  board.cuts = [
    one({ id: 'edge', label: 'Edge', face: '+X', start: { x: 560, y: 4, z: 4 } }),
    one({ id: 'face', label: 'Face', depth: 18, start: { x: 555, y: 4, z: 18 } }),
  ]
  expect(drillingIntersections(board, new Set()).map((i) => i.code)).toEqual([
    'drilling-intersection',
  ])

  const missing = boardOf()
  missing.cuts = [
    one({ id: 'edge', label: 'Edge', face: '+X', start: { x: 560, y: 4, z: 4 } }),
    one({ id: 'face', label: 'Face', depth: 18, start: { x: 540, y: 4, z: 18 } }),
  ]
  expect(drillingIntersections(missing, new Set())).toEqual([])
})
it('reviews crossing rows that share an identical hole position', () => {
  const board = boardOf()
  board.cuts = [
    hole({ id: 'a', label: 'Row A', start: { x: 204, y: 300, z: 18 }, count: 4 }),
    hole({ id: 'b', label: 'Row B', axis: 'V', start: { x: 300, y: 108, z: 18 }, count: 7 }),
  ]
  expect(drillingIntersections(board, new Set()).map((i) => i.detail)).toEqual([
    'hole 4 of 4 repeats drilling "Row B" [b] at the same position and diameter; verify this is intended.',
  ])
})
it('blocks adjacent holes in one row whose openings merge', () => {
  const board = boardOf()
  board.cuts = [hole({ pitch: 4, count: 3, diameter: 5 })]
  expect(drillingIntersections(board, new Set()).map((i) => [i.code, i.detail])).toEqual([
    [
      'drilling-intersection',
      'adjacent holes overlap (pitch 4 mm, diameter 5 mm); the openings merge into a continuous slot.',
    ],
  ])
})
it('answers two huge rows without enumerating either', () => {
  const board = boardOf()
  board.cuts = [
    hole({ id: 'a', label: 'Row A', start: { x: 204, y: 300, z: 18 }, count: 1_000_000_000 }),
    hole({
      id: 'b',
      label: 'Row B',
      axis: 'V',
      start: { x: 300, y: 108, z: 18 },
      count: 1_000_000_000,
    }),
  ]
  expect(drillingIntersections(board, new Set())).toHaveLength(1)
})
```

Add to `productionReview.test.ts`:

```ts
it('treats repeated drilling as advisory and intersections as corrections', () => {
  const input = inputOf()
  input.manufacturing.findings = [
    { reference: 'M1', code: 'drilling-overlap-review', message: 'Repeat', targets: [] },
    { reference: 'M2', code: 'drilling-intersection', message: 'Breaks in', targets: [] },
    { reference: 'M3', code: 'drilling-redundant', message: 'Voided', targets: [] },
  ]
  expect(buildProductionReview(input)).toMatchObject({
    counts: { needsCorrection: 2, advisory: 1 },
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts src/scene/productionReview.test.ts`
Expected: FAIL — drill × drill pairs are ignored, and the review counts the advisory as a correction.

- [ ] **Step 3: Implement drill × drill**

In `drillingIntersections.ts`:

- Two drills are **coaxial** when their axis lines coincide: same depth axis and the same position on
  the two in-plane axes, within `1e-6`.
- Apply the precedence of the spec's "One verdict per hole":
  1. coaxial, same face, same diameter and depth → review (a repeat), detail
     `… repeats drilling "<label>" [<id>] at the same position and diameter; verify this is intended.`
  2. coaxial, same face, different diameter or depth → allow (a counterbore or stepped hole).
  3. coaxial, opposite faces, same diameter and depth, volumes meet → review; different diameter or
     depth, volumes overlap → block, detail
     `… breaks into drilling "<label>" [<id>]; the opening is broken.`
  4. non-coaxial, volumes overlap → block with the same detail.
  5. otherwise → allow.
- Cylinder × cylinder with parallel axes: axial intervals overlap by more than `1e-6` and the centre
  distance is `< r1 + r2 - 1e-6`. Perpendicular axes: use the exact two-circle feasibility from the
  spec, maximised at the clamped coordinates. Do not use a bounding-box approximation.
- A row against another row: the candidate index range on one row is the set of its holes within
  `r1 + r2` of the other row's line; the predicate per index is monotone, so bisection gives the
  range. Never iterate the other row.
- A row against itself: adjacent holes overlap exactly when `pitch < diameter`. Emit one issue for
  the operation with the row message above. Do this only when `count > 1`; `drilling-array` already
  rejects `pitch <= 0`.

- [ ] **Step 4: Map the advisory code**

In `src/scene/productionReview.ts:97-98`, extend the condition:

```ts
category:
  f.code === 'label-empty' ||
  f.code === 'label-duplicate' ||
  f.code === 'drilling-overlap-review'
    ? 'advisory'
    : 'needs-correction',
```

Update the policy sentence at line 223 to name repeated or meeting drilling as advisory.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts src/scene/productionReview.test.ts src/scene/drillingChecks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scene/drillingIntersections.ts src/scene/drillingIntersections.test.ts src/scene/productionReview.ts src/scene/productionReview.test.ts
git commit -m "feat: detect intersecting and repeated drilling on boards"
```

---

### Task 4: Stage 1 integration and notes

**Files:**

- Modify: `src/scene/drillingChecks.test.ts` (finding-level assertions)
- Modify: `src/scene/manufacturingChecks.test.ts`
- Modify: `src/ui/ManufacturingReadiness.test.tsx`
- Create: `docs/superpowers/notes/2026-11-02-drilling-intersections-notes.md`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces: end-to-end proof that a collision reaches the release record with the operation
  reference and the right severity.

- [ ] **Step 1: Write the failing integration tests**

In `drillingChecks.test.ts`, add:

```ts
it('carries drilling intersections into the manufacturing record with their operation', () => {
  const scene = sceneOf()
  boardOf(scene).cuts = [
    hole({ start: { x: 200, y: 380, z: 18 }, count: 5 }),
    {
      kind: 'box',
      id: 'dado',
      label: 'Shelf dado',
      face: '+Z',
      position: { x: 230, y: 330, z: 12 },
      size: { x: 60, y: 100, z: 6 },
    },
  ]
  const finding = reportOf(scene).findings.find((f) => f.code === 'drilling-intersection')!
  expect(finding.operation).toMatchObject({ id: 'row-1', kind: 'hole-array' })
  expect(finding.targets.map((t) => t.id)).toEqual(['manual-board'])
})
it('keeps an out-of-bounds drill intersected as well as out of bounds', () => {
  const scene = sceneOf()
  boardOf(scene).cuts = [
    hole({ start: { x: 200, y: 380, z: 18 }, count: 1000 }),
    {
      kind: 'box',
      id: 'dado',
      label: 'Shelf dado',
      face: '+Z',
      position: { x: 230, y: 330, z: 12 },
      size: { x: 60, y: 100, z: 6 },
    },
  ]
  expect(drillingOf(scene).map((f) => f.code)).toEqual(['drilling-bounds', 'drilling-intersection'])
})
```

- [ ] **Step 2: Run them to confirm they fail or expose ordering**

Run: `pnpm vitest run src/scene/drillingChecks.test.ts`
Expected: PASS after Task 3 if the wiring is correct; if the order differs, the assertion names the
actual order — reconcile with the implementation, not by weakening the test.

- [ ] **Step 3: Update the suite's stale counts and text**

Run `pnpm vitest run src/scene/manufacturingChecks.test.ts src/ui/ManufacturingReadiness.test.tsx src/ui/buildReadinessPdf.test.ts`
and update only assertions that name the removed unassessed string or a shifted finding count.
Record each change in the notes.

- [ ] **Step 4: Write the notes**

Create `docs/superpowers/notes/2026-11-02-drilling-intersections-notes.md` with: the staged
delivery, the three codes and their severities, the bisection approach, the known limits (skew
transverse pairs, thin webs, bevels, cross-part), and the fixture change from Stage 2.

- [ ] **Step 5: Run the full suite**

Run: `pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts`
Expected: PASS. Record the file/test counts in the notes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: cover drilling intersections end to end"
```

---

## Stage 2 — round stock

### Task 5: Round-stock bores, notches and the finished extent

**Files:**

- Modify: `src/scene/drillingIntersections.ts`
- Modify: `src/scene/drillingIntersections.test.ts`
- Modify: `src/scene/__fixtures__/machiningProject.ts:55`
- Modify: `src/scene/machiningSchedule.test.ts` (fixture-shape assertions only, if any)

**Interfaces:**

- Consumes: Task 1's bisection helper and issue type.
- Produces: round-stock verdicts (rows 19–24); the `part.kind !== 'board'` guard is removed.

- [ ] **Step 1: Write the failing tests**

Add to `drillingIntersections.test.ts` (extend the imports with
`type { DowelBoreAxial, DowelBoreTransverse, DowelEndCut } from './types'` and
`type { ManufacturingRoundStock } from './manufacturingPart'`):

```ts
const roundOf = (): ManufacturingRoundStock => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-round')
  return manufacturingParts(
    scene.parts,
    scene.materials,
    scene.components,
  )[0] as ManufacturingRoundStock
}
const axial = (overrides: Partial<DowelBoreAxial> = {}): DowelBoreAxial => ({
  kind: 'bore-axial',
  id: 'axial',
  label: 'Axial',
  end: '-Z',
  diameter: 3,
  depth: 500,
  ...overrides,
})
const cross = (overrides: Partial<DowelBoreTransverse> = {}): DowelBoreTransverse => ({
  kind: 'bore-transverse',
  id: 'cross',
  label: 'Cross',
  position: 100,
  azimuth: 90,
  diameter: 3,
  depth: 2,
  ...overrides,
})
const trim = (overrides: Partial<DowelEndCut> = {}): DowelEndCut => ({
  kind: 'end',
  id: 'trim',
  label: 'Trim',
  end: '+Z',
  offset: 10,
  angle: 0,
  azimuth: 0,
  ...overrides,
})

it('does not treat a square end trim as a collision', () => {
  const round = roundOf()
  round.cuts = [trim(), axial()]
  expect(drillingIntersections(round, new Set())).toEqual([])
})
it('measures a bore from the trimmed cap', () => {
  const round = roundOf()
  // The finished cap is at z = 490. The bore therefore stops at 490 and clears the transverse
  // bore at 495; measured from the untrimmed cap it would reach 500 and collide.
  round.cuts = [trim(), axial({ end: '+Z', depth: 50 }), cross({ position: 495, depth: 4 })]
  expect(drillingIntersections(round, new Set())).toEqual([])
})
it('blocks an axial bore that breaks into a transverse bore', () => {
  const round = roundOf()
  round.cuts = [axial(), cross({ depth: 4 })]
  expect(drillingIntersections(round, new Set()).map((i) => i.code)).toEqual([
    'drilling-intersection',
  ])
})
it('blocks two transverse bores that intersect', () => {
  const round = roundOf()
  round.cuts = [cross(), cross({ id: 'cross2', label: 'Cross 2', azimuth: 0 })]
  expect(drillingIntersections(round, new Set()).map((i) => i.code)).toEqual([
    'drilling-intersection',
  ])
})
it('blocks a bore that breaks into a notch', () => {
  const round = roundOf()
  round.cuts = [
    cross({ position: 50, azimuth: 0, depth: 4 }),
    { kind: 'notch', id: 'notch', label: 'Notch', position: 50, width: 10, depth: 2, azimuth: 0 },
  ]
  expect(drillingIntersections(round, new Set()).map((i) => i.code)).toEqual([
    'drilling-intersection',
  ])
})
it('reviews opposite-end axial bores that meet', () => {
  const round = roundOf()
  round.cuts = [axial({ depth: 260 }), axial({ id: 'back', label: 'Back', end: '+Z', depth: 260 })]
  expect(drillingIntersections(round, new Set()).map((i) => i.code)).toEqual([
    'drilling-overlap-review',
  ])
})
it('leaves an angled end cut unassessed', () => {
  const round = roundOf()
  round.cuts = [trim({ angle: 45 }), axial()]
  expect(drillingIntersections(round, new Set())).toEqual([])
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts`
Expected: FAIL — every round-stock test returns `[]`.

- [ ] **Step 3: Implement round-stock volumes**

In `drillingIntersections.ts`:

- Replace the board guard with a `part.kind === 'cylinder'` branch.
- Compute the finished axial extent from the square end cuts:
  `offsetPlus = max(offset of angle === 0 cuts with end '+Z')`,
  `offsetMinus = max(offset of angle === 0 cuts with end '-Z')`; the extent is
  `[offsetMinus, length - offsetPlus]`. A bore's entry cap is the finished cap for its `end`.
  If the extent is empty or reversed, return no issues for that part.
- `bore-axial`: cylinder along `z` at the axis, from the finished cap inward
  `min(depth, extent length)`.
- `bore-transverse`: a cylinder of radius `diameter / 2` whose axis is the radial segment at
  `azimuth` and `position`, from the stock surface inward `min(depth, diameter)`.
- `notch`: a rotated slab — radial coordinate at `azimuth` `>= R - depth`, over
  `z ∈ [position - width/2, position + width/2]` — tested as the conjunction of the two linear
  constraints, using the cylinder-range formula in the spec.
- Apply the round-stock precedence from the spec: same-end coaxial identical → review; same-end
  stepped → allow; opposite-end overlapping → review; axial × transverse, transverse × transverse,
  bore × notch → block. Angled end cuts and `mitre`-style removals are not obstacles.
- Transverse × transverse uses the finite-segment minimum distance, which may over-report; keep the
  comment that says so.

- [ ] **Step 4: Fix the `machiningProject` fixture**

In `src/scene/__fixtures__/machiningProject.ts:55`, change the transverse bore's `depth: 4` to
`depth: 2` so it stops 0.5 mm short of the axial bore wall.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/scene/drillingIntersections.test.ts src/scene/machiningSchedule.test.ts src/ui/buildMachiningCsv.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scene/drillingIntersections.ts src/scene/drillingIntersections.test.ts src/scene/__fixtures__/machiningProject.ts
git commit -m "feat: detect intersecting drilling on round stock"
```

---

### Task 6: Stage 2 unassessed lists and close-out

**Files:**

- Modify: `src/scene/manufacturingChecks.ts:117-123`
- Modify: `src/scene/machiningSchedule.ts:104-108`
- Modify: `src/scene/machiningSchedule.test.ts:54`
- Modify: `docs/superpowers/notes/2026-11-02-drilling-intersections-notes.md`

**Interfaces:**

- Consumes: Task 5.
- Produces: the final unassessed lists and a green full suite.

- [ ] **Step 1: Update the lists**

Remove `'Drilling intersections with round stock'` from `manufacturingChecks`, leaving the seven
items in the spec's stage-2 list. Change the schedule's
`'Interactions between cuts other than board drilling'` to `'Interactions between cuts other than drilling'`.

- [ ] **Step 2: Update the assertions**

In `src/scene/machiningSchedule.test.ts:54`, keep the `Machine compatibility and tool access`
assertion and add:

```ts
expect(schedule.unassessed).toContain('Interactions between cuts other than drilling')
expect(schedule.unassessed).not.toContain('Interactions between cuts other than board drilling')
```

Add the equivalent assertion for the manufacturing list in `manufacturingChecks.test.ts`:
`expect(report.unassessed).toContain('Drilling intersections with bevelled edges (mitre and angled end cuts)')`
and `not.toContain('Drilling intersections with round stock')`.

- [ ] **Step 3: Run the full suite**

Run: `pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts`
Expected: PASS. Update the counts in the notes.

- [ ] **Step 4: Run the lint, typecheck and file-casing guard**

Run: `pnpm lint`, then `pnpm typecheck`, then `pnpm check:file-casing`
Expected: no errors, no case collisions.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete drilling intersection coverage"
```

---

## Self-review notes

- Every behaviour row 1–24 has a task and a named test; rows 17, 18 and 25 are asserted as
  unassessed (Tasks 5 and 6); row 28 is explicitly out of scope in the spec.
- The stale strings `'Drilling intersections with other cuts'` and `'Interactions between cuts'` are
  each replaced exactly once, in Tasks 1 and 6.
- `drilling-overlap-review` is the only code needing `productionReview` work; the other two inherit
  `needs-correction`.
- The only fixture value changed anywhere is `machiningProject.ts`'s transverse depth, and no test
  asserts it.
