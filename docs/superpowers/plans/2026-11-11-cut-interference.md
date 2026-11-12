# Cut Interference Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report overlapping and redundant box cuts on a board as advisory readiness findings,
without blocking ordinary joinery where one housing meets another.

**Architecture:** A new pure module `cutIntersections.ts` compares part-local box volumes and
returns code/message/operation records. `manufacturingChecks` appends those findings after the
existing drilling findings, and `productionReview` classifies both new codes as advisory. The
volume builder moves to `cutVolumes.ts` so the drilling pass and the new pass share one statement
of what a box cut removes.

**Tech Stack:** TypeScript, Vitest, pnpm. No React, no UI, no file-format change.

**Design:** `docs/superpowers/specs/2026-11-11-cut-interference-design.md`

## Global Constraints

- Board-local millimetres; board axes are `x = length`, `y = width`, `z = thickness`.
  `BoxCut.position` is the minimum corner.
- Tolerance `1e-6` mm, the same constant the drilling checks apply. Contact, edge-touch and overlaps
  no thicker than that are not findings.
- A box cut with any size `<= 0.1` mm is absent from the solid; `makeShape` skips it. The machining
  schedule still lists it, so "absent" means solid-absent, not packet-absent.
- Both new codes are advisory. Never block release for a box overlap; ordinary housings meet.
- Findings are deterministic: pairs are visited in `part.cuts` index order (`i < j`).
- `manufacturingProject()` and `machiningProject()` must stay free of `cut-*` findings.
- No React, DOM, clock, randomness or world transform. The module takes a `ManufacturingPart` and
  returns plain data.
- No file-format or schema-version change.
- Full suite on this Windows host:
  `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts`.
  `pnpm check:file-casing` needs Git on `PATH` (`C:\Program Files\Git\cmd`).

## Review Focus

1. **A dado-rabbet or finger cabinet must not fail release.** The generator emits dozens of
   legitimate housing meetings; an advisory finding is the only safe verdict.
2. **The default butt-screw catalogue must stay finding-free.** It has six boards carrying one box
   cut each and zero overlapping pairs; a finding there is a fixture or threshold defect, not a
   reason to relax.
3. **A non-finite box must not hide a valid pair.** Skipping the undefined box must still compare
   every finite pair on the same board.
4. **An identical cut emitted by two joints is redundant, not a new mistake.** It attaches to the
   later definition and names the earlier one.
5. **A cut finding must never change a bore's `depthMode`.** The schedule keeps calling only
   `drillingChecks`.
6. **Worktop cut-outs are reviewed, not blocked.** Two overlapping cut-outs are a real mistake, but
   the record cannot distinguish them from a legitimate meeting; the message must name both.

---

## Before you start

Start from a feature branch or worktree; never commit on `main` (`CLAUDE.md` Git rules).

Read the design document. Then run the current checks so a failure later is yours, not the
baseline:

```bash
pnpm typecheck
pnpm vitest run src/scene/drillingIntersections.test.ts src/scene/drillingChecks.test.ts src/scene/manufacturingChecks.test.ts src/scene/machiningSchedule.test.ts src/scene/productionReview.test.ts src/ui/buildReadinessPdf.test.ts
```

Expected: typecheck exits 0; every listed test file passes.

The `manufacturingProject()` fixture currently has six boards carrying one box cut each and
**zero** overlapping pairs. `machiningProject()` has one box cut and no pair. If a task below makes
either report a `cut-*` finding, stop and inspect the fixture. Do not weaken the check to
accommodate it.

---

## Task 1: Extract the box-volume builder

**Files:**
- Create: `src/scene/cutVolumes.ts`
- Create: `src/scene/cutVolumes.test.ts`
- Modify: `src/scene/drillingIntersections.ts` (remove the local `boxVolumeOf`, import the shared
  one, remove the now-unused `MIN_CUT_SIZE_MM` and `BoxCut` imports)
- Modify: `src/scene/drillingIntersections.test.ts` (regression: non-finite box is not an obstacle)

**Interfaces:**
- Consumes: `BoxCut`, `Vec3` from `./types`; `MIN_CUT_SIZE_MM` from `../geom/cutLimits`.
- Produces:
  - `src/scene/cutVolumes.ts`: `export interface BoxVolume { min: Vec3; max: Vec3 }`;
    `export function boxVolumeOf(box: BoxCut): BoxVolume | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/cutVolumes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { boxVolumeOf } from './cutVolumes'
import type { BoxCut } from './types'

const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box',
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z',
  position: { x: 10, y: 20, z: 12 },
  size: { x: 60, y: 100, z: 6 },
  ...overrides,
})

describe('box cut volumes', () => {
  it('builds the removed box from position and size', () => {
    expect(boxVolumeOf(box())).toEqual({
      min: { x: 10, y: 20, z: 12 },
      max: { x: 70, y: 120, z: 18 },
    })
  })

  it('treats a box at or below the exporter minimum as absent', () => {
    for (const size of [0, -1, 0.05, 0.1]) {
      expect(boxVolumeOf(box({ size: { x: size, y: 100, z: 6 } }))).toBeNull()
    }
  })

  it('treats a non-finite position or size as absent', () => {
    expect(boxVolumeOf(box({ position: { x: NaN, y: 20, z: 12 } }))).toBeNull()
    expect(boxVolumeOf(box({ size: { x: Infinity, y: 100, z: 6 } }))).toBeNull()
  })
})
```

Then add this regression inside `describe('drilling intersections', …)` in
`src/scene/drillingIntersections.test.ts`:

```ts
  it('skips a non-finite box obstacle instead of reporting a redundancy', () => {
    const board = boardOf()
    board.cuts = [
      hole(),
      box({
        id: 'infinite',
        position: { x: 0, y: 0, z: 0 },
        size: { x: Infinity, y: 720, z: 18 },
      }),
    ]
    expect(drillingIntersections(board, new Set())).toEqual([])
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/cutVolumes.test.ts src/scene/drillingIntersections.test.ts`
Expected: FAIL — `cutVolumes.test.ts` cannot resolve `./cutVolumes`; the new regression in
`drillingIntersections.test.ts` reports a `drilling-redundant` finding for the infinite-size box.

- [ ] **Step 3: Create the module**

Create `src/scene/cutVolumes.ts`:

```ts
import { MIN_CUT_SIZE_MM } from '../geom/cutLimits'
import type { BoxCut, Vec3 } from './types'

export interface BoxVolume {
  min: Vec3
  max: Vec3
}

// A box cut removes [position, position + size]. A box with any size at or below the exporter's
// minimum is absent from the solid: makeShape skips it. The machining schedule still lists the
// definition, so "absent" means solid-absent, not packet-absent. A non-finite position or size
// cannot describe a volume, so it is absent for the same reason; makeShape does not skip it.
export function boxVolumeOf(box: BoxCut): BoxVolume | null {
  const { x, y, z } = box.size
  if (![x, y, z].every((n) => Number.isFinite(n) && n > MIN_CUT_SIZE_MM)) return null
  if (![box.position.x, box.position.y, box.position.z].every(Number.isFinite)) return null
  return {
    min: box.position,
    max: { x: box.position.x + x, y: box.position.y + y, z: box.position.z + z },
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/cutVolumes.test.ts src/scene/drillingIntersections.test.ts`
Expected: PASS — 3 tests in `cutVolumes.test.ts`, and every test in `drillingIntersections.test.ts`
including the new regression.

- [ ] **Step 5: Remove the duplicate from the drilling module**

In `src/scene/drillingIntersections.ts`:

1. Delete the local `boxVolumeOf` function (the comment beginning "A box cut removes" through its
   closing brace).
2. Add this import next to the other local imports:

```ts
import { boxVolumeOf } from './cutVolumes'
```

3. Delete `import { MIN_CUT_SIZE_MM } from '../geom/cutLimits'`.
4. Remove `BoxCut` from the `import type { ... } from './types'` list; the deleted function was its
   only use. Leaving it imported fails `noUnusedLocals` and ESLint's `no-unused-vars`.

The board pass still calls `boxVolumeOf`. Behaviour changes only for non-finite box geometry: the
shared builder returns `null` for a non-finite position or size, where the local builder could treat
an infinite-size box as covering everything. The regression test in Step 1 and the delivery notes
pin that change.

- [ ] **Step 6: Run both suites**

Run: `pnpm vitest run src/scene/cutVolumes.test.ts src/scene/drillingIntersections.test.ts`
Expected: PASS — every test in both files.

Run: `pnpm typecheck`
Expected: PASS — no unused `BoxCut` import.

- [ ] **Step 7: Commit**

```bash
git add src/scene/cutVolumes.ts src/scene/cutVolumes.test.ts src/scene/drillingIntersections.ts src/scene/drillingIntersections.test.ts
git commit -m "refactor: state the box-cut volume once"
```

---

## Task 2: Move the operation reference to the manufacturing record

The new module reports a box cut as an operation, so the reference type must accept `kind: 'box'`.
Move it next to the records it describes and widen its kind. This is a type-only change: the
runtime shapes are identical.

**Files:**
- Modify: `src/scene/manufacturingPart.ts` (add the interface; `CutDef` and `DowelCut` are already
  imported at the top)
- Modify: `src/scene/drillingChecks.ts` (remove the local interface; import and re-export it)
- Modify: `src/scene/manufacturingChecks.ts` (import the type from `manufacturingPart`)

**Interfaces:**
- Consumes: `CutDef`, `DowelCut` from `./types` (already imported in `manufacturingPart.ts`).
- Produces: `export interface ManufacturingOperationReference { id: string; label: string;
  kind: CutDef['kind'] | DowelCut['kind']; sourceComponentId: string | null; sourceJointId: string |
  null }` in `manufacturingPart.ts`; `drillingChecks.ts` re-exports it unchanged.

- [ ] **Step 1: Add the shared interface**

In `src/scene/manufacturingPart.ts`, after the `ManufacturingContext` interface, add:

```ts
// Which operation a manufacturing finding is about. Drilling and box cuts both need one, so the
// reference lives with the records rather than with the drilling checks.
export interface ManufacturingOperationReference {
  id: string
  label: string
  kind: CutDef['kind'] | DowelCut['kind']
  sourceComponentId: string | null
  sourceJointId: string | null
}
```

- [ ] **Step 2: Re-export it from the drilling checks**

In `src/scene/drillingChecks.ts`:

1. Replace the import line with:

```ts
import type { ManufacturingOperationReference, ManufacturingPart } from './manufacturingPart'
export type { ManufacturingOperationReference } from './manufacturingPart'
```

2. Delete the local `export interface ManufacturingOperationReference { … }` block. The `add`
   helper and the rest of the file are unchanged.

- [ ] **Step 3: Point the manufacturing checks at the new home**

In `src/scene/manufacturingChecks.ts`, replace:

```ts
import {
  drillingChecks,
  type DrillingCheckCode,
  type ManufacturingOperationReference,
} from './drillingChecks'
```

with:

```ts
import type { ManufacturingOperationReference } from './manufacturingPart'
import { drillingChecks, type DrillingCheckCode } from './drillingChecks'
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm vitest run src/scene/drillingChecks.test.ts src/scene/manufacturingChecks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/manufacturingPart.ts src/scene/drillingChecks.ts src/scene/manufacturingChecks.ts
git commit -m "refactor: share the manufacturing operation reference"
```

---

## Task 3: Create the cut-intersection module with its no-op cases

**Files:**
- Create: `src/scene/cutIntersections.ts`
- Create: `src/scene/cutIntersections.test.ts`

**Interfaces:**
- Consumes: `ManufacturingPart` from `./manufacturingPart`; `BoxCut` from `./types`.
- Produces: `export type CutIntersectionCode = 'cut-intersection-review' | 'cut-redundant-review'`;
  `export interface CutIntersectionIssue { code: CutIntersectionCode; message: string; operation:
  ManufacturingOperationReference }`; `export function cutIntersections(part: ManufacturingPart):
  CutIntersectionIssue[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/cutIntersections.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cutIntersections } from './cutIntersections'
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

const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box',
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z',
  position: { x: 100, y: 100, z: 12 },
  size: { x: 60, y: 200, z: 6 },
  ...overrides,
})

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

describe('cut intersections', () => {
  it('does nothing for a board with no box cuts', () => {
    const board = boardOf()
    board.cuts = [hole()]
    expect(cutIntersections(board)).toEqual([])
  })

  it('does nothing for a single box cut', () => {
    const board = boardOf()
    board.cuts = [box()]
    expect(cutIntersections(board)).toEqual([])
  })

  it('leaves box × drilling to the drilling pass', () => {
    const board = boardOf()
    board.cuts = [box(), hole()]
    expect(cutIntersections(board)).toEqual([])
  })

  it('does nothing for round stock', () => {
    const scene = manufacturingProject()
    const round = scene.parts.find((p) => p.kind === 'cylinder')!
    const record = manufacturingParts([round], scene.materials, scene.components)[0]
    expect(cutIntersections(record)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/cutIntersections.test.ts`
Expected: FAIL — `Failed to resolve import "./cutIntersections"`.

- [ ] **Step 3: Create the module skeleton**

Create `src/scene/cutIntersections.ts`:

```ts
// Overlaps between non-drilling cuts on one board, in part-local millimetres. Drilling is handled
// by drillingIntersections; this module answers only the question the schedule names: do two box
// cuts claim the same material, and does one of them remove nothing at all? Both verdicts are
// advisory because a housing that runs into another housing (or into a toe-kick notch) is ordinary
// joinery, and the recorded geometry cannot tell that from a mistake.
import type {
  ManufacturingOperationReference,
  ManufacturingPart,
} from './manufacturingPart'

export type CutIntersectionCode = 'cut-intersection-review' | 'cut-redundant-review'
export interface CutIntersectionIssue {
  code: CutIntersectionCode
  message: string
  operation: ManufacturingOperationReference
}

export function cutIntersections(part: ManufacturingPart): CutIntersectionIssue[] {
  if (part.kind !== 'board') return []
  return []
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/cutIntersections.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/cutIntersections.ts src/scene/cutIntersections.test.ts
git commit -m "feat: add the cut-intersection seam"
```

---

## Task 4: Report shared box volume

**Files:**
- Modify: `src/scene/cutIntersections.ts`
- Modify: `src/scene/cutIntersections.test.ts`

**Interfaces:**
- Consumes: `boxVolumeOf`, `BoxVolume` from `./cutVolumes`.
- Produces: `sharedExtent`, `operationOf`, `intersectionIssue`; `cutIntersections` now reports
  partial overlaps.

- [ ] **Step 1: Add the failing tests**

Append these tests inside the `describe('cut intersections', …)` block:

```ts
  it('reports two boxes that share material', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'shelf', label: 'Shelf dado' }),
      box({ id: 'bottom', label: 'Bottom dado', position: { x: 130, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board)).toEqual([
      {
        code: 'cut-intersection-review',
        message:
          'Cut "Shelf dado" [shelf]: shares removed material with cut "Bottom dado" [bottom]; verify this is intended.',
        operation: {
          id: 'shelf',
          label: 'Shelf dado',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
    ])
  })

  it.each([
    [0, 0],
    [1e-7, 0],
    [1e-3, 1],
  ] as const)('allows contact within the tolerance and reports a real overlap: %s', (overlap, expected) => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 160 - overlap, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board)).toHaveLength(expected)
  })

  it('allows boxes separated through the thickness in either order', () => {
    const board = boardOf()
    for (const order of ['top-first', 'bottom-first'] as const) {
      const top = box({ id: 'top', position: { x: 100, y: 100, z: 12 } })
      const bottom = box({ id: 'bottom', position: { x: 100, y: 100, z: 0 } })
      board.cuts = order === 'top-first' ? [top, bottom] : [bottom, top]
      expect(cutIntersections(board)).toEqual([])
    }
  })

  it('allows boxes that touch on an edge only', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 160, y: 300, z: 12 } }),
    ]
    expect(cutIntersections(board)).toEqual([])
  })

  it('allows boxes that touch on a corner only', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 160, y: 300, z: 18 } }),
    ]
    expect(cutIntersections(board)).toEqual([])
  })

  it('reports two full-thickness crossing cuts once', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'across', position: { x: 100, y: 0, z: 0 }, size: { x: 20, y: 720, z: 18 } }),
      box({ id: 'along', position: { x: 0, y: 300, z: 0 }, size: { x: 560, y: 20, z: 18 } }),
    ]
    expect(cutIntersections(board)).toHaveLength(1)
  })

  it('reports one finding per overlapping pair in input order', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 150, y: 100, z: 12 } }),
      box({ id: 'c', position: { x: 140, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board).map((i) => i.message)).toEqual([
      'Cut "Shelf dado" [a]: shares removed material with cut "Shelf dado" [b]; verify this is intended.',
      'Cut "Shelf dado" [a]: shares removed material with cut "Shelf dado" [c]; verify this is intended.',
      'Cut "Shelf dado" [b]: shares removed material with cut "Shelf dado" [c]; verify this is intended.',
    ])
  })

  it('skips a non-finite box and still compares the finite boxes', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'broken', position: { x: NaN, y: 100, z: 12 } }),
      box({ id: 'a' }),
      box({ id: 'b', position: { x: 130, y: 100, z: 12 } }),
    ]
    expect(cutIntersections(board).map((i) => i.operation.id)).toEqual(['a'])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/cutIntersections.test.ts`
Expected: FAIL — the overlap tests receive `[]`.

- [ ] **Step 3: Implement the shared-extent rule**

Replace the contents of `src/scene/cutIntersections.ts` with:

```ts
// Overlaps between non-drilling cuts on one board, in part-local millimetres. Drilling is handled
// by drillingIntersections; this module answers only the question the schedule names: do two box
// cuts claim the same material, and does one of them remove nothing at all? Both verdicts are
// advisory because a housing that runs into another housing (or into a toe-kick notch) is ordinary
// joinery, and the recorded geometry cannot tell that from a mistake.
import type {
  ManufacturingOperationReference,
  ManufacturingPart,
} from './manufacturingPart'
import { boxVolumeOf, type BoxVolume } from './cutVolumes'
import type { BoxCut } from './types'

export type CutIntersectionCode = 'cut-intersection-review' | 'cut-redundant-review'
export interface CutIntersectionIssue {
  code: CutIntersectionCode
  message: string
  operation: ManufacturingOperationReference
}

const tolerance = 1e-6 // mm; the same boundary tolerance the drilling checks apply.
const axes = ['x', 'y', 'z'] as const
type Axis = (typeof axes)[number]

// The material two boxes both claim on one axis. A non-positive value means they do not share
// material there; touching at a face, edge or corner is how joinery meets, not an overlap.
function sharedExtent(a: BoxVolume, b: BoxVolume, axis: Axis): number {
  return Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis])
}

function operationOf(cut: BoxCut): ManufacturingOperationReference {
  return {
    id: cut.id,
    label: cut.label,
    kind: 'box',
    sourceComponentId: cut.sourceComponentId ?? null,
    sourceJointId: cut.sourceJointId ?? null,
  }
}

function intersectionIssue(first: BoxCut, second: BoxCut): CutIntersectionIssue {
  return {
    code: 'cut-intersection-review',
    message: `Cut "${first.label}" [${first.id}]: shares removed material with cut "${second.label}" [${second.id}]; verify this is intended.`,
    operation: operationOf(first),
  }
}

export function cutIntersections(part: ManufacturingPart): CutIntersectionIssue[] {
  if (part.kind !== 'board') return []
  const boxes: { cut: BoxCut; volume: BoxVolume }[] = []
  for (const cut of part.cuts) {
    if (cut.kind !== 'box') continue
    const volume = boxVolumeOf(cut)
    if (volume !== null) boxes.push({ cut, volume })
  }
  const issues: CutIntersectionIssue[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const first = boxes[i]
      const second = boxes[j]
      if (axes.some((axis) => sharedExtent(first.volume, second.volume, axis) <= tolerance))
        continue
      issues.push(intersectionIssue(first.cut, second.cut))
    }
  }
  return issues
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/cutIntersections.test.ts`
Expected: PASS — 14 tests (4 no-op + 10 overlap/skip).

- [ ] **Step 5: Commit**

```bash
git add src/scene/cutIntersections.ts src/scene/cutIntersections.test.ts
git commit -m "feat: report overlapping box cuts"
```

---

## Task 5: Report redundant box cuts

**Files:**
- Modify: `src/scene/cutIntersections.ts`
- Modify: `src/scene/cutIntersections.test.ts`

**Interfaces:**
- Produces: `containedBy`, `redundantIssue`, and the precedence order in `cutIntersections`.

- [ ] **Step 1: Add the failing tests**

Append these tests inside the `describe('cut intersections', …)` block:

```ts
  it('reports a box that lies entirely inside another, on the contained cut', () => {
    const board = boardOf()
    board.cuts = [
      box({
        id: 'outer',
        label: 'Sink cut-out',
        position: { x: 0, y: 0, z: 0 },
        size: { x: 200, y: 200, z: 18 },
      }),
      box({
        id: 'inner',
        label: 'Tap hole pocket',
        position: { x: 50, y: 50, z: 0 },
        size: { x: 20, y: 20, z: 18 },
      }),
    ]
    expect(cutIntersections(board)).toEqual([
      {
        code: 'cut-redundant-review',
        message:
          'Cut "Tap hole pocket" [inner]: lies entirely inside cut "Sink cut-out" [outer]; it removes no additional material.',
        operation: {
          id: 'inner',
          label: 'Tap hole pocket',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
    ])
  })

  it('reports an identical repeat on the later cut', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'first', label: 'Pocket' }),
      box({ id: 'second', label: 'Pocket' }),
    ]
    expect(cutIntersections(board)).toEqual([
      {
        code: 'cut-redundant-review',
        message:
          'Cut "Pocket" [second]: repeats cut "Pocket" [first] at the same volume; one of the two can be removed.',
        operation: {
          id: 'second',
          label: 'Pocket',
          kind: 'box',
          sourceComponentId: null,
          sourceJointId: null,
        },
      },
    ])
  })

  it('treats a 1e-7 size difference as an identical pair', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'first', label: 'Pocket' }),
      box({ id: 'second', label: 'Pocket', size: { x: 60 + 1e-7, y: 200, z: 6 } }),
    ]
    expect(cutIntersections(board).map((i) => [i.code, i.operation.id])).toEqual([
      ['cut-redundant-review', 'second'],
    ])
  })

  it('treats a box ending on the other face as contained', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'outer', position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 18 } }),
      box({ id: 'inner', position: { x: 100, y: 0, z: 0 }, size: { x: 100, y: 200, z: 18 } }),
    ]
    expect(cutIntersections(board).map((i) => i.code)).toEqual(['cut-redundant-review'])
  })

  it('reports a box that pokes out beyond the tolerance as an overlap', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'outer', position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 18 } }),
      box({ id: 'inner', position: { x: 100, y: 0, z: 0 }, size: { x: 100.001, y: 200, z: 18 } }),
    ]
    expect(cutIntersections(board).map((i) => i.code)).toEqual(['cut-intersection-review'])
  })

  it('reports a contained pair once, as a redundancy', () => {
    const board = boardOf()
    board.cuts = [
      box({ id: 'outer', position: { x: 0, y: 0, z: 0 }, size: { x: 200, y: 200, z: 18 } }),
      box({ id: 'inner', position: { x: 50, y: 50, z: 0 }, size: { x: 20, y: 20, z: 18 } }),
    ]
    expect(cutIntersections(board).map((i) => i.code)).toEqual(['cut-redundant-review'])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/cutIntersections.test.ts`
Expected: FAIL — contained and identical pairs currently report `cut-intersection-review`.

- [ ] **Step 3: Implement containment and the precedence order**

In `src/scene/cutIntersections.ts`, add this helper after `sharedExtent`:

```ts
// A box lies inside another when every face is on or within the other's at the tolerance. The
// boundary is inclusive: a box ending exactly on the container's face is contained.
function containedBy(outer: BoxVolume, inner: BoxVolume): boolean {
  return axes.every(
    (axis) =>
      inner.min[axis] >= outer.min[axis] - tolerance &&
      inner.max[axis] <= outer.max[axis] + tolerance,
  )
}
```

Add these helpers after `intersectionIssue`:

```ts
function redundantIssue(
  inner: BoxCut,
  outer: BoxCut,
  kind: 'inside' | 'repeat',
): CutIntersectionIssue {
  return {
    code: 'cut-redundant-review',
    message:
      kind === 'inside'
        ? `Cut "${inner.label}" [${inner.id}]: lies entirely inside cut "${outer.label}" [${outer.id}]; it removes no additional material.`
        : `Cut "${inner.label}" [${inner.id}]: repeats cut "${outer.label}" [${outer.id}] at the same volume; one of the two can be removed.`,
    operation: operationOf(inner),
  }
}
```

Replace the body of the pair loop's `if` with the precedence order:

```ts
      if (axes.some((axis) => sharedExtent(first.volume, second.volume, axis) <= tolerance))
        continue
      const firstInSecond = containedBy(second.volume, first.volume)
      const secondInFirst = containedBy(first.volume, second.volume)
      if (firstInSecond && secondInFirst)
        issues.push(redundantIssue(second.cut, first.cut, 'repeat'))
      else if (firstInSecond) issues.push(redundantIssue(first.cut, second.cut, 'inside'))
      else if (secondInFirst) issues.push(redundantIssue(second.cut, first.cut, 'inside'))
      else issues.push(intersectionIssue(first.cut, second.cut))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/cutIntersections.test.ts`
Expected: PASS — 20 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/cutIntersections.ts src/scene/cutIntersections.test.ts
git commit -m "feat: report redundant box cuts"
```

---

## Task 6: Wire the findings into the manufacturing record

**Files:**
- Modify: `src/scene/manufacturingChecks.ts`
- Modify: `src/scene/manufacturingChecks.test.ts`

**Interfaces:**
- Consumes: `cutIntersections`, `CutIntersectionCode`.
- Produces: `ManufacturingCheckCode` includes both codes; `manufacturingChecks` appends cut findings
  after drilling findings for the same part.

- [ ] **Step 1: Add the failing integration tests**

Add `import { machiningProject } from './__fixtures__/machiningProject'` to the test imports, then
append these tests inside the `describe('shared record manufacturing checks', …)` block in
`src/scene/manufacturingChecks.test.ts`:

```ts
  it('reports an overlapping box pair with its operation provenance', () => {
    const scene = sceneOf()
    const board = boardOf(scene)
    board.cuts = [
      {
        kind: 'box',
        id: 'shelf',
        label: 'Shelf dado',
        face: '+Z',
        position: { x: 100, y: 100, z: 12 },
        size: { x: 60, y: 200, z: 6 },
        sourceJointId: 'joint-shelf',
      },
      {
        kind: 'box',
        id: 'bottom',
        label: 'Bottom dado',
        face: '+Z',
        position: { x: 130, y: 100, z: 12 },
        size: { x: 60, y: 200, z: 6 },
        sourceComponentId: 'component-bottom',
      },
    ]
    const report = reportOf(scene)
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({
      code: 'cut-intersection-review',
      message:
        'Cut "Shelf dado" [shelf]: shares removed material with cut "Bottom dado" [bottom]; verify this is intended.',
      operation: {
        id: 'shelf',
        label: 'Shelf dado',
        kind: 'box',
        sourceComponentId: null,
        sourceJointId: 'joint-shelf',
      },
      targets: [{ id: board.id, label: board.label, cabinetId: null, parentId: null }],
    })
  })

  it('appends cut findings after drilling findings for the same part', () => {
    const scene = sceneOf()
    const board = boardOf(scene)
    board.cuts = [
      {
        kind: 'box',
        id: 'shelf',
        label: 'Shelf dado',
        face: '+Z',
        position: { x: 230, y: 330, z: 12 },
        size: { x: 60, y: 100, z: 6 },
      },
      {
        kind: 'box',
        id: 'bottom',
        label: 'Bottom dado',
        face: '+Z',
        position: { x: 230, y: 400, z: 12 },
        size: { x: 60, y: 100, z: 6 },
      },
      {
        kind: 'hole-array',
        id: 'pins',
        label: 'Shelf pins',
        face: '+Z',
        axis: 'U',
        start: { x: 200, y: 380, z: 18 },
        pitch: 32,
        count: 3,
        diameter: 5,
        depth: 12,
      },
    ]
    expect(reportOf(scene).findings.map((f) => f.code)).toEqual([
      'drilling-intersection',
      'cut-intersection-review',
    ])
  })

  it('keeps cut findings independent of visibility, placement and material rates', () => {
    const scene = sceneOf()
    const board = boardOf(scene)
    board.cuts = [
      {
        kind: 'box',
        id: 'a',
        label: 'A',
        face: '+Z',
        position: { x: 100, y: 100, z: 12 },
        size: { x: 60, y: 200, z: 6 },
      },
      {
        kind: 'box',
        id: 'b',
        label: 'B',
        face: '+Z',
        position: { x: 130, y: 100, z: 12 },
        size: { x: 60, y: 200, z: 6 },
      },
    ]
    const before = reportOf(scene)
    scene.parts.forEach((p) => {
      p.visible = false
      p.position.x += 1000
    })
    scene.materials['18mm Ply'].costPerM2 = 999
    expect(reportOf(scene)).toEqual(before)
  })

  it('reports no cut interference in the representative fixtures', () => {
    for (const scene of [manufacturingProject(), machiningProject()]) {
      const report = manufacturingChecks(
        manufacturingParts(scene.parts, scene.materials, scene.components),
      )
      expect(report.findings.filter((f) => f.code.startsWith('cut-'))).toEqual([])
    }
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/manufacturingChecks.test.ts`
Expected: FAIL — the two overlap tests report no cut findings, and `cut-intersection-review` is not
in `ManufacturingCheckCode`. The independence and fixture tests are guards and may already pass.

- [ ] **Step 3: Wire the module in**

In `src/scene/manufacturingChecks.ts`:

1. Add the import:

```ts
import { cutIntersections, type CutIntersectionCode } from './cutIntersections'
```

2. Add `CutIntersectionCode` to the union:

```ts
export type ManufacturingCheckCode =
  | DrillingCheckCode
  | CutIntersectionCode
  | 'stock-unresolved'
  | 'stock-thickness'
  | 'stock-use'
  | 'sheet-size'
  | 'part-size'
  | 'thickness-mismatch'
  | 'edge-stock'
  | 'cut-size'
  | 'label-empty'
  | 'label-duplicate'
```

3. Immediately after the `drillingChecks` loop, add:

```ts
    for (const issue of cutIntersections(p)) add(issue.code, issue.message, [p], issue.operation)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/manufacturingChecks.test.ts`
Expected: PASS — all tests, including the four new ones (provenance, ordering, independence, and the
finding-free representative fixtures).

- [ ] **Step 5: Commit**

```bash
git add src/scene/manufacturingChecks.ts src/scene/manufacturingChecks.test.ts
git commit -m "feat: surface cut overlaps in readiness"
```

---

## Task 7: Classify both codes as advisory

**Files:**
- Modify: `src/scene/productionReview.ts`
- Modify: `src/scene/productionReview.test.ts`

**Interfaces:**
- Consumes: `ManufacturingFinding['code']`.
- Produces: advisory mapping for both new codes; updated `classification` sentence.

- [ ] **Step 1: Add the failing test**

Append this test inside the `describe('production packet review', …)` block in
`src/scene/productionReview.test.ts`:

```ts
  it('treats overlapping and redundant cuts as advisory', () => {
    const input = inputOf()
    input.manufacturing.findings = [
      { reference: 'M1', code: 'cut-intersection-review', message: 'Overlap', targets: [] },
      { reference: 'M2', code: 'cut-redundant-review', message: 'Redundant', targets: [] },
      { reference: 'M3', code: 'cut-size', message: 'Invalid', targets: [] },
    ]
    const review = buildProductionReview(input)
    expect(review.counts).toMatchObject({ needsCorrection: 1, advisory: 2 })
    expect(review.classification).toContain('overlapping or redundant cuts')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/productionReview.test.ts`
Expected: FAIL — the two new codes are classified as `needs-correction`, and the classification
sentence does not name them.

- [ ] **Step 3: Add the advisory condition and policy sentence**

In `src/scene/productionReview.ts`, change the manufacturing category condition to:

```ts
      category:
        f.code === 'label-empty' ||
        f.code === 'label-duplicate' ||
        f.code === 'drilling-overlap-review' ||
        f.code === 'cut-intersection-review' ||
        f.code === 'cut-redundant-review'
          ? 'advisory'
          : 'needs-correction',
```

Change the `classification` sentence to:

```ts
      'Invalid manufacturing definitions, missing parts and output mismatches need correction. Labels, joinery reminders, angled insertion, repeated or meeting drilling, and overlapping or redundant cuts are advisory. Skipped checks, assessment limits and unverified installation are unassessed.',
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/productionReview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/productionReview.ts src/scene/productionReview.test.ts
git commit -m "feat: classify cut overlaps as advisory"
```

---

## Task 8: Narrow the unassessed lists and update the docs

Stage 1 assesses board box × box. The broad "interactions other than drilling" line is replaced by
the interactions that remain: bevelled edges and round-stock notches. The minimum-web line stays
until stage 2, and the non-finite box record gap is named explicitly.

**Files:**
- Modify: `src/scene/manufacturingChecks.ts`
- Modify: `src/scene/machiningSchedule.ts`
- Modify: `src/scene/manufacturingChecks.test.ts`
- Modify: `src/scene/drillingChecks.test.ts`
- Modify: `src/scene/machiningSchedule.test.ts`
- Modify: `src/ui/buildReadinessPdf.test.ts`
- Modify: `README.md`
- Modify: `docs/production-review.md`

**Interfaces:**
- Consumes: the old and new unassessed strings.
- Produces: narrowed interaction lists, the new non-finite line, and updated docs.

- [ ] **Step 1: Update the source strings**

In `src/scene/manufacturingChecks.ts`, replace:

```ts
      'Drilling intersections with bevelled edges (mitre and angled end cuts)',
```

with:

```ts
      'Cut interactions involving bevelled edges or round-stock notches',
```

In the same array, after `'Drilling that breaks into a different part'`, add:

```ts
      'Non-finite box cut geometry',
```

In `src/scene/machiningSchedule.ts`, replace:

```ts
      'Interactions between cuts other than drilling',
```

with:

```ts
      'Cut interactions involving bevelled edges or round-stock notches',
```

- [ ] **Step 2: Update every assertion that names the old strings**

`src/scene/manufacturingChecks.test.ts` — replace the old expectation with:

```ts
    expect(before.unassessed).toContain(
      'Cut interactions involving bevelled edges or round-stock notches',
    )
    expect(before.unassessed).toContain('Non-finite box cut geometry')
    expect(before.unassessed).not.toContain(
      'Drilling intersections with bevelled edges (mitre and angled end cuts)',
    )
```

`src/scene/drillingChecks.test.ts` — replace the old string with:

```ts
        'Cut interactions involving bevelled edges or round-stock notches',
```

and add the absence assertion after the `arrayContaining` block:

```ts
    expect(reportOf(scene).unassessed).not.toContain(
      'Drilling intersections with bevelled edges (mitre and angled end cuts)',
    )
```

`src/ui/buildReadinessPdf.test.ts` — replace the old string with:

```ts
    expect(text).toContain('Cut interactions involving bevelled edges or round-stock notches')
    expect(text).not.toContain('Drilling intersections with bevelled edges (mitre and angled end cuts)')
```

`src/scene/machiningSchedule.test.ts` — replace the old expectation with:

```ts
    expect(schedule.unassessed).toContain(
      'Cut interactions involving bevelled edges or round-stock notches',
    )
    expect(schedule.unassessed).not.toContain('Interactions between cuts other than drilling')
```

Then append this guard inside the same `describe` block:

```ts
  it('keeps a colliding but valid bore depth mode when cut interference also exists', () => {
    const scene = machiningProject()
    const p = scene.parts[0] as BoardPart
    p.cuts = [
      {
        kind: 'box',
        id: 'dado',
        label: 'Dado',
        face: '+Z',
        position: { x: 0, y: 0, z: 12 },
        size: { x: 30, y: 30, z: 6 },
      },
      {
        kind: 'box',
        id: 'dado-2',
        label: 'Dado 2',
        face: '+Z',
        position: { x: 20, y: 0, z: 12 },
        size: { x: 30, y: 30, z: 6 },
      },
      {
        kind: 'hole-array',
        id: 'row',
        label: 'Row',
        face: '+Z',
        axis: 'U',
        start: { x: 10, y: 10, z: 18 },
        pitch: 0,
        count: 1,
        diameter: 5,
        depth: 12,
      },
    ]
    expect(scheduleOf(scene).entries.find((e) => e.operation.id === 'row')).toMatchObject({
      depthMode: 'blind',
    })
  })
```

- [ ] **Step 3: Update the README**

In `README.md`, replace the final sentence of the readiness bullet:

> Intersections with other cuts, manual machining geometry and machine compatibility remain unassessed.

with:

> Overlapping or redundant board box cuts are reviewed as advisory; cut interactions involving
> bevelled edges or round-stock notches, non-finite box geometry, minimum remaining material, manual
> machining geometry and machine compatibility remain unassessed.

In `docs/production-review.md`, add overlapping or redundant cuts — and the existing repeated or
meeting drilling — to the **Advisory** list:

```markdown
- **Advisory:** empty/duplicate part labels, repeated or meeting drilling, joinery reminders, angled
  shelf insertion, and overlapping or redundant cuts. IDs remain authoritative; recorded joints do
  not certify geometry.
```

- [ ] **Step 4: Run the affected suites**

Run:

```bash
pnpm vitest run src/scene/manufacturingChecks.test.ts src/scene/drillingChecks.test.ts src/scene/machiningSchedule.test.ts src/ui/buildReadinessPdf.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/manufacturingChecks.ts src/scene/machiningSchedule.ts src/scene/manufacturingChecks.test.ts src/scene/drillingChecks.test.ts src/scene/machiningSchedule.test.ts src/ui/buildReadinessPdf.test.ts README.md docs/production-review.md
git commit -m "docs: name the cut interactions that remain unassessed"
```

---

## Task 9: Full verification, notes and the invariant

**Files:**
- Create: `docs/superpowers/notes/2026-11-11-cut-interference-notes.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the full check suite**

Run:

```bash
pnpm typecheck
pnpm lint
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts
pnpm check:file-casing
```

Expected: all four exit 0, and the suite reports **249 files, 4484 passed, 10 skipped** plus the new
tests added by this plan. `NODE_OPTIONS=--no-experimental-webstorage` is required on this Windows
host: without it, Node 26's experimental `localStorage` global fails 138 baseline tests with
`TypeError: Cannot read properties of undefined (reading 'clear')`. CI runs Node 22 and can use bare
`pnpm test`.

`pnpm check:file-casing` needs Git on `PATH`; if it reports `spawnSync git ENOENT`, prepend
`C:\Program Files\Git\cmd` to `PATH` for that command.

Record the exact counts from this run for the notes.

- [ ] **Step 2: Write the delivery notes**

Create `docs/superpowers/notes/2026-11-11-cut-interference-notes.md` with these sections and
content:

```markdown
# Cut interference checks — notes

Design: `docs/superpowers/specs/2026-11-11-cut-interference-design.md`
Plan: `docs/superpowers/plans/2026-11-11-cut-interference.md`

## What changed

`src/scene/cutVolumes.ts` is the one statement of what a box cut removes; `boxVolumeOf` moved
there from `drillingIntersections.ts`, and both passes now import it. `src/scene/cutIntersections.ts`
compares every pair of box cuts on a board and reports two new advisory codes:

| Code                      | Severity | Meaning                                                               |
| ------------------------- | -------- | --------------------------------------------------------------------- |
| `cut-intersection-review` | advisory | two boxes share removed material                                      |
| `cut-redundant-review`    | advisory | one box lies wholly inside another, or repeats it at the same volume  |

`manufacturingChecks()` appends these after the drilling findings for the same part, so `M<n>`
references stay positional. `productionReview` classifies both as advisory and the policy sentence
names "overlapping or redundant cuts". No schema version changes.

## Why advisory, not blocking

The generator can run one housing into another when a housing joint method is selected: a back-panel
groove into the bottom housing, a shelf housing into the toe-kick notch, two joint housings into each
other at a corner. `sourceJointId` says which joint emitted a cut, not whether the meeting was
intended, so a blocking verdict would fail ordinary cabinets. The precedent is
`drilling-overlap-review`.

## Known limits

- Bevelled edges (mitre and angled end cuts) are still unassessed, for box cuts as for drilling.
- Round-stock notch × notch is still unassessed.
- Minimum remaining material between cuts is stage 2; it is still named in the list.
- A cluster of three mutually overlapping boxes produces three findings, one per pair.
- A box with non-finite geometry is skipped; no per-cut box validity check exists, so the gap is
  named as `'Non-finite box cut geometry'` in the manufacturing unassessed list.

## Test coverage

- `src/scene/cutVolumes.test.ts` — the volume, the exporter minimum, non-finite geometry.
- `src/scene/drillingIntersections.test.ts` — the non-finite-box regression for the shared builder.
- `src/scene/cutIntersections.test.ts` — no-op cases, partial overlap, tolerance, thickness
  separation, edge/corner contact, through-cuts, containment, identical repeats, precedence,
  clusters, order.
- `src/scene/manufacturingChecks.test.ts` — operation provenance, targets, drilling-before-cut
  ordering, independence from visibility/placement/material rates, the finding-free representative
  fixtures, and the narrowed unassessed list.
- `src/scene/productionReview.test.ts` — both codes advisory, classification sentence.
- `src/scene/machiningSchedule.test.ts` — the narrowed unassessed list; `depthMode` untouched.
- `src/ui/buildReadinessPdf.test.ts` — the new unassessed line in the PDF, and the old line's absence.

## Verification

<!-- FILL IN: full-suite counts from step 1, e.g. "N files, N passed, N skipped" -->

## Behaviour change to record

`boxVolumeOf` now rejects a non-finite position or size, where the local builder in
`drillingIntersections` could treat an infinite-size box as covering everything. That box is no
longer a drilling obstacle, so the old `drilling-redundant` finding for it disappears. The
regression in `drillingIntersections.test.ts` pins this.
```

Fill in the `## Verification` placeholder from step 1 before committing.

- [ ] **Step 3: Record the invariant**

In `CLAUDE.md`, after the invariant that begins "**A joint-owned cut may be a box **or** a hole
array.**", add:

```markdown
- **Box cuts may meet on purpose; their overlap is advisory.** A back-panel groove runs into the
  bottom housing, a shelf housing runs into the toe-kick notch, and two joint housings meet at a
  corner. `sourceJointId` says which joint emitted a cut but not whether the meeting was intended,
  so `cutIntersections.ts` reviews every shared box volume (`cut-intersection-review`) instead of
  blocking it, and attaches a wholly contained or repeated cut (`cut-redundant-review`) to the cut
  that removes nothing. The broad "interactions between cuts" gap is narrowed to bevelled edges and
  round-stock notches, not claimed covered; thin webs remain a separate check.
```

- [ ] **Step 4: Mutation-test the new guards**

`CLAUDE.md` requires each guard to be shown capable of failing. Back the file up first, never
`git checkout`. Apply each mutation with `edit`, confirm the predicted failure, then restore from the
copy and re-run green.

| Mutation                                             | File                       | Must fail                                    |
| ---------------------------------------------------- | -------------------------- | -------------------------------------------- |
| `sharedExtent` returns `null` on contact (`<= 0`)     | `cutIntersections.ts`      | the tolerance-`1e-6` overlap test             |
| containment `<=` → `<` on one bound                  | `cutIntersections.ts`      | the box-ending-on-the-face containment test   |
| visit `j < i` instead of pairs once, or report both  | `cutIntersections.ts`      | precedence and identical-pair tests           |
| skip the `i < j` order and report from `j`           | `cutIntersections.ts`      | identity/order test                           |
| `Number.isFinite` → `true` in `boxVolumeOf`          | `cutVolumes.ts`            | the non-finite test in both files             |
| drop the `MIN_CUT_SIZE_MM` exclusion                 | `cutVolumes.ts`            | the exporter-minimum test                     |

Expected each time: an `AssertionError` naming the rule, not a compile error or `no tests`.

- [ ] **Step 5: Re-run the checks**

Run:

```bash
pnpm typecheck
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts
```

Expected: PASS — the same counts recorded in step 1.

- [ ] **Step 6: Regenerate the structure HTML**

The plan adds tracked files (`cutVolumes.ts`, `cutIntersections.ts`, their tests, the notes), and
`CLAUDE.md` requires `project-structure.html` to be regenerated when the tree changes.

```bash
node scripts/update-structure-html.mjs
```

Expected: file trees and test count update; the hand-written prose needs no change.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/notes/2026-11-11-cut-interference-notes.md CLAUDE.md project-structure.html
git commit -m "docs: record the cut-interference delivery"
```

---

## Self-review

- **Spec coverage:** rows 1–14 map to Tasks 3–6; row 15–20 are stage 2 and explicitly out of this
  plan; rows 21–23 are named in the unassessed text; reporting choices 24–30 map to Tasks 4–7;
  integration points all have a task; the unassessed lists, `docs/production-review.md` and the README
  have Task 8; mutation testing, the invariant and the structure HTML have Task 9.
- **Design-required cases are in the plan:** the non-finite box is skipped while finite partners are
  still compared (Task 4), a `1e-7`-different pair is still redundant (Task 5), corner contact and
  thickness separation in both orders (Task 4), independence from visibility/placement/grain/material
  rates and finding-free representative fixtures (Task 6), the colliding-but-valid `depthMode` guard
  (Task 8), and absence assertions for every replaced string in the schedule, drilling and PDF tests
  (Task 8).
- **Expected counts:** `cutIntersections.test.ts` is 14 tests after Task 4 and 20 after Task 5;
  `cutVolumes.test.ts` is 3 tests. Failure expectations name the predicted failing test, not a bare
  "FAIL".
- **Placeholders:** one deliberate one — the `## Verification` counts line in the notes, filled from
  Task 9 step 1 before the final commit. Nothing else is unfilled.
- **Type consistency:** `CutIntersectionIssue` carries `code`, `message`, `operation`;
  `ManufacturingOperationReference` is imported from `manufacturingPart` everywhere after Task 2;
  `boxVolumeOf` returns `BoxVolume | null` and both callers handle the null.
- **Unassessed gap:** the manufacturing list names `'Non-finite box cut geometry'`, because this pass
  skips a non-finite box while `makeShape` does not; the design and Task 8 agree.
- **Test counts in the notes:** Task 9 expects 249 files / 4484 passed / 10 skipped at baseline, plus
  the new tests; the notes record the actual run, not the baseline.
