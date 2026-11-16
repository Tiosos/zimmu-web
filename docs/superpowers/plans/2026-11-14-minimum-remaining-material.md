# Minimum Remaining Material (Stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Report a pair of non-intersecting cuts on one board that leave less solid material between them than `MIN_REMAINING_WEB_MM`, as advisory `cut-web-review`, without changing any existing verdict and without enumerating a hole row.

**Architecture:** A new pure module, `src/scene/drillGeometry.ts`, owns the geometry both drilling passes already share — `RowDrill`, `rowDrillOf`, the bisection helpers, `candidateRange` and `segmentDistance` — moved verbatim out of `drillingIntersections.ts`, which keeps only its verdicts. A second new module, `src/scene/cutWebs.ts`, pairs every two cuts on a board in `part.cuts` order and measures the web between them: box × box by the Euclidean gap of three axis intervals, box × drilling by composing the axial gap with the in-plane disc-to-rectangle gap, drilling × drilling by the segment distance less both radii. `manufacturingChecks` runs it after `cutIntersections` and narrows the unassessed list; `productionReview` classifies it advisory.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`, `verbatimModuleSyntax`), Vitest, pnpm. No React, no THREE, no OCCT, no schema or file-format change.

**Spec:** `docs/superpowers/specs/2026-11-14-minimum-remaining-material-design.md`
**Notes:** `docs/superpowers/notes/2026-11-14-minimum-remaining-material-notes.md` — created in Task 1, appended by every task, completed in Task 6.

---

## Environment

- Working directory: `C:\Github Repos\zimmu`.
- Branch: `feat/minimum-remaining-material`, already created from `main`; it carries `e79be20 docs: specify minimum remaining material thin-web check` and merge commit `34fe240`, so it is level with `main`. Do not create another branch and do not commit on `main`.
- The toolchain is green on this host: `pnpm typecheck` and the full suite ran in the session that wrote this plan (251 files, 4527 passed). Task 0 re-confirms the baseline before any code changes. If `node_modules` permissions regress (`TS5033` writing `tsconfig.app.tsbuildinfo`, or `spawn EPERM` from `@tailwindcss/oxide`), stop and repair the ACL before continuing — until that is fixed, every commit fails because the pre-commit hook runs typecheck.
- This Windows host needs `NODE_OPTIONS=--no-experimental-webstorage` for the full suite; without it, Node 26's experimental `localStorage` global fails baseline tests.
- `pnpm check:file-casing` needs `C:\Program Files\Git\cmd` on `PATH`.
- Baseline before this plan (recorded in `docs/superpowers/notes/2026-11-12-cut-review-followups-notes.md`): **251 test files, 4527 passed, 10 skipped.**
- Expected after this plan: **253 test files** (two new test modules). The passed count is the baseline plus the tests this plan adds — Tasks 1 and 2–4 state the exact per-file figures; record the measured suite total in the notes rather than assuming it.

---

## Decisions, and the alternatives they beat

Four decisions carry this plan. Each is a place the spec is silent or wrong, so each is stated here before any code, with the alternative that was rejected.

### D1. The shared drilling geometry moves to its own module — it is not exported from `drillingIntersections.ts`

The spec (§5.3) says to reuse "the existing verified algorithm from `drillingIntersections.ts`". `segmentDistance` is module-private, and so are `RowDrill`, `rowDrillOf`, `candidateRange`, `affectedRange`, `firstIndex`, `lastIndex`, `extentAlong`, `spanOf`, `runAt`, `holeCentreAt`, `planeAxesOf`, `thirdAxis`, `intervalGap` and `maxExactCandidates` — the web pass needs most of that list, not one function.

| Option | Verdict |
| --- | --- |
| Add `export` to fourteen declarations in `drillingIntersections.ts` and import them | Rejected. It makes a module whose subject is *verdicts* the home of the geometry, and leaves `cutWebs.ts` importing a file named after a different question. |
| Copy the geometry into `cutWebs.ts` | Rejected outright. A second statement of "where is hole *k*" is exactly how two passes come to disagree about which volume the exporter removes. The repo states a rule once and reads it from many places; this is that pattern, not an exception to it. |
| **Move the geometry into `src/scene/drillGeometry.ts`; both passes import it** | **Chosen.** `drillingIntersections.ts` keeps only what is about *verdicts* (`holePairVerdict`, `perpendicularOverlap`, `rowPairIssues`, the whole round-stock section, `drillingIntersections`). The move is mechanical and is pinned by the 32 existing tests in `drillingIntersections.test.ts`, which import the public function only and must stay green without a single edit. |

### D2. `rowDrillOf` becomes the one statement of a hole's axial interval, and gains a `null` for an unbuildable row

The spec (§5.2) says the hole has "length `H`, clamped to stock thickness". That clause is already implemented, and it is the whole reason this decision exists:

```ts
const entry = inward ? dims[axes.depth] : 0
const height = Math.min(row.depth, dims[axes.depth])   // drillingIntersections.ts:77
```

A web pass that recomputed the interval from `row.depth` would measure a 30 mm through-hole on an 18 mm board as occupying `[-12, 18]` and so report *no* web against a box recorded beyond the stock face, where the board actually leaves 1 mm. So:

- `cutWebs` reads `axialLo` / `axialHi` from `rowDrillOf` and never from `row.depth`. Task 3 pins this with a mutation (D2's own mutation, the first row of the table in Task 3 Step 5).
- `rowDrillOf` returns `RowDrill | null`. `null` means *these recorded fields cannot describe a lattice of cylinders*: non-positive or non-finite diameter or depth, an unsafe or non-positive count, a non-finite or negative pitch, zero pitch for more than one hole, an unsupported face or row axis, a non-finite start, or non-positive board dimensions.
- That predicate is a **precondition**, not a second verdict. `drillingChecks` remains the only place that *reports* which precondition failed (`drilling-size`, `drilling-array`, `drilling-unassessed`, `drilling-position`) — it needs the distinctions for its four different messages, so it cannot delegate the question. The two agree by construction: every id `drillingChecks` puts in `undefinedVolume` also makes `rowDrillOf` return `null`, which is why the change is invisible to `drillingIntersections` (it never called `rowDrillOf` for such a row).
- The alternative — passing `undefinedVolume` into `cutWebs` the way `drillingIntersections` receives it — was rejected because `manufacturingChecks` has no access to that set: `drillingChecks` builds it internally and returns only issues. Exposing it would change a public signature used by `manufacturingChecks.ts:53` and `machiningSchedule.ts:41` and would leave the 307-line `drillingChecks.test.ts` describing a function that no longer exists in that shape.

### D3. A pair that touches yields to the overlap passes — per *hole* against a box, per *pair* between two rows

The spec's row 4 says a pair that shares material or touches yields, and leaves "pair" undefined. The two cases need different answers, because a drilling row is a family of holes and not one volume:

- **Box × drilling: per hole.** A box can pass through several holes of a row, and the material beside the box wall is a different physical question for each hole. A hole that touches the box is the drilling pass's (`drilling-intersection`, already reported, naming which holes); the hole on the *far* side of the box still has its own web, and suppressing it because its neighbour met the box would hide the one measurement the reviewer needs. So `rowBoxWeb` skips the touching candidates and reports the thinnest of the rest.
- **Drilling × drilling: per pair.** A row pair that crosses produces `drilling-intersection` for the holes that meet, and the holes flanking the crossing leave small webs that are an artefact of the row's *pitch*, not of the design. Reporting them would name one physical meeting twice, once as an intersection and once as a web, on an advisory list whose whole value is that a reviewer can act on every line. So `rowRowWeb` takes the **minimum over every candidate hole pair, including the pairs that touch** — one meeting anywhere in the window drives the minimum to 0 and the pair yields. The test that makes this observable is `yields the whole pair when one hole meets the other row`: two rows where one hole pair touches (so a per-*hole* rule would skip it) and a neighbouring pair leaves 2 mm. A per-hole rule reports the 2 mm; the per-pair rule reports nothing.

The cost is a stated limit, recorded in the notes: for two rows, one touching hole pair suppresses the web verdict for the rest of that row pair.

The alternative — per hole everywhere — would report the pitch artefact above. The other alternative — per pair everywhere — would hide the far side of a box a row passes through, and would fail this plan's own test `is silent when the hole breaks into the dado, which the drilling pass owns` for the wrong reason (it would be silent because a *neighbour* touched, not because the pair met).

### D4. Web thickness prints truncated to two decimals, not rounded

The spec (§6.3) prints the web to two decimal places beside a fixed "3.00 mm minimum". A web of 2.999 mm rounds to `3.00` and produces:

> leaves a web of 3.00 mm with cut "…", thinner than the 3.00 mm minimum

which is a self-contradicting sentence in a document a workshop reads. Rounding **down** (`Math.floor(web * 100) / 100`) guarantees the printed figure is always strictly below the printed threshold, at a cost of at most 0.01 mm of understatement in an advisory message. Task 2 Step 5 pins it.

---

## File structure

| File | Responsibility after this plan |
| --- | --- |
| `src/geom/cutLimits.ts` | Adds `MIN_REMAINING_WEB_MM = 3.0` beside `MIN_CUT_SIZE_MM`. Constants only, still a leaf. |
| `src/scene/drillGeometry.ts` | **New.** A hole row as a lattice of cylinders (`RowDrill`, `rowDrillOf`, `holeSegment`), the bisection helpers (`firstIndex`, `lastIndex`, `affectedRange`), windowing (`candidateRange`, `extentAlong`, `maxExactCandidates`), interval and wording helpers (`intervalGap`, `spanOf`), and `segmentDistance`. Knows nothing about verdicts or findings. |
| `src/scene/drillGeometry.test.ts` | **New.** Pins the axial interval `rowDrillOf` clips, `holeSegment`'s endpoints, and `segmentDistance`'s three branches. |
| `src/scene/drillingIntersections.ts` | Loses the moved declarations and its `faceAxes` import; keeps every verdict and the whole round-stock section. Public API unchanged. |
| `src/scene/cutWebs.ts` | **New.** `cutWebs(part)` → `CutWebIssue[]`: the web between every two cuts on a board, in cut order, anchored on the earlier cut. |
| `src/scene/cutWebs.test.ts` | **New.** The three situations, the tolerance and threshold gates, ordering, and the message format. |
| `src/scene/manufacturingChecks.ts` | Adds `'cut-web-review'` to `ManufacturingCheckCode`, runs `cutWebs` after `cutIntersections`, narrows the unassessed list. |
| `src/scene/productionReview.ts` | Classifies `cut-web-review` advisory; extends the policy sentence. |
| `src/ui/buildReadinessPdf.test.ts`, `src/scene/manufacturingChecks.test.ts`, `src/scene/productionReview.test.ts` | Assert the new code, the new unassessed wording and the new policy sentence. |

No schema change, no file-format change, no new dependency.

---

### Task 0: Confirm a green baseline

Nothing in this plan can be verified until the toolchain runs. Do this first and do not proceed on a red baseline.

**Files:** none.

- [ ] **Step 1: Confirm typecheck runs**

```powershell
$env:PATH = "C:\Program Files\Git\cmd;" + $env:PATH; pnpm typecheck; "typecheck exit=$LASTEXITCODE"
```

Expected: `typecheck exit=0`. If it fails with `TS5033` or `spawn EPERM`, `node_modules` permissions have regressed; repair the ACL before continuing.

- [ ] **Step 2: Confirm the full suite runs and record the baseline**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts
```

Expected: **251 test files, 4527 passed, 10 skipped**. If the figures differ from the notes file's record, stop and report the difference before writing any code — a changed baseline means something landed that this plan does not know about.

---

### Task 1: Extract the shared drilling geometry

A pure move plus two additions (`null` from `rowDrillOf`, and `holeSegment`). No behaviour change: the 32 tests in `drillingIntersections.test.ts` must pass without being touched.

**Files:**
- Create: `src/scene/drillGeometry.ts`
- Create: `src/scene/drillGeometry.test.ts`
- Modify: `src/scene/drillingIntersections.ts`
- Create: `docs/superpowers/notes/2026-11-14-minimum-remaining-material-notes.md`

- [ ] **Step 1: Write the failing test file `src/scene/drillGeometry.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { holeSegment, rowDrillOf, segmentDistance } from './drillGeometry'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import type { HoleArrayCut } from './types'

// The manual board is 560 × 720 × 18 in part-local millimetres: local.x is the length, local.y the
// width, local.z the thickness.
const boardOf = (): ManufacturingBoard => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board')
  scene.parts.forEach((p) => {
    p.cuts = []
  })
  return manufacturingParts(scene.parts, scene.materials, scene.components)[0] as ManufacturingBoard
}

const row = (overrides: Partial<HoleArrayCut> = {}): HoleArrayCut => ({
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

describe('drill geometry', () => {
  it('runs a hole from the +Z face inward, clipped to the stock thickness', () => {
    const drill = rowDrillOf(boardOf(), row())!
    expect(drill.depth).toBe('z')
    expect(drill.run).toBe('x')
    expect(drill.across).toBe('y')
    expect(drill.radius).toBe(2.5)
    expect([drill.axialLo, drill.axialHi]).toEqual([6, 18])
  })

  it('clips a through hole to the stock rather than to its nominal depth', () => {
    // 30 mm of travel on an 18 mm board stops at the back face; it does not reach z = -12.
    const drill = rowDrillOf(boardOf(), row({ depth: 30 }))!
    expect([drill.axialLo, drill.axialHi]).toEqual([0, 18])
  })

  it('runs a hole from a negative face from that face inward', () => {
    const drill = rowDrillOf(boardOf(), row({ face: '-Z', start: { x: 200, y: 380, z: 0 } }))!
    expect([drill.axialLo, drill.axialHi]).toEqual([0, 12])
  })

  it('refuses a row that cannot describe a lattice of cylinders', () => {
    const board = boardOf()
    expect(rowDrillOf(board, row({ diameter: 0 }))).toBeNull()
    expect(rowDrillOf(board, row({ depth: Number.NaN }))).toBeNull()
    expect(rowDrillOf(board, row({ count: 0 }))).toBeNull()
    expect(rowDrillOf(board, row({ count: 2.5 }))).toBeNull()
    expect(rowDrillOf(board, row({ pitch: Number.NaN }))).toBeNull()
    expect(rowDrillOf(board, row({ count: 3, pitch: 0 }))).toBeNull()
    expect(rowDrillOf(board, row({ start: { x: Number.NaN, y: 380, z: 18 } }))).toBeNull()
    // A single hole may legitimately carry a zero pitch.
    expect(rowDrillOf(board, row({ count: 1, pitch: 0 }))).not.toBeNull()
  })

  it('gives a hole a finite centreline segment on its own lattice step', () => {
    const drill = rowDrillOf(boardOf(), row())!
    expect(holeSegment(drill, 0)).toEqual([
      { x: 200, y: 380, z: 6 },
      { x: 200, y: 380, z: 18 },
    ])
    expect(holeSegment(drill, 2)).toEqual([
      { x: 264, y: 380, z: 6 },
      { x: 264, y: 380, z: 18 },
    ])
  })

  it('measures the distance between parallel, skew and degenerate segments', () => {
    const point = (x: number, y: number, z: number) => ({ x, y, z })
    // Parallel, offset in x and overlapping in z.
    expect(
      segmentDistance(point(0, 0, 0), point(0, 0, 10), point(5, 0, 0), point(5, 0, 10)),
    ).toBeCloseTo(5)
    // Parallel, also separated in z: the clamped ends give the diagonal.
    expect(
      segmentDistance(point(0, 0, 0), point(0, 0, 10), point(5, 0, 20), point(5, 0, 30)),
    ).toBeCloseTo(Math.hypot(5, 10))
    // Perpendicular and meeting.
    expect(segmentDistance(point(0, 0, 0), point(10, 0, 0), point(5, -5, 0), point(5, 5, 0))).toBe(
      0,
    )
    // Perpendicular with a 3 mm miss.
    expect(
      segmentDistance(point(0, 0, 0), point(10, 0, 0), point(5, -5, 3), point(5, 5, 3)),
    ).toBeCloseTo(3)
    // Two points.
    expect(segmentDistance(point(0, 0, 0), point(0, 0, 0), point(3, 4, 0), point(3, 4, 0))).toBe(5)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails for the right reason**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/drillGeometry.test.ts
```

Expected: FAIL — `Failed to resolve import "./drillGeometry"`. Nothing else in the repo is red.

- [ ] **Step 3: Create `src/scene/drillGeometry.ts` by moving, not rewriting**

Cut these declarations out of `src/scene/drillingIntersections.ts` **verbatim**, preserving every comment: `tolerance` (line 43), `Axis` (45), `RowDrill` (47–61), `rowDrillOf` (66–93), `intervalGap` (96), `firstIndex` (100–110), `lastIndex` (114–124), `affectedRange` (131–140), `spanOf` (143–147), `runAt` (150), `holeCentreAt` (154–155), `planeAxesOf` (158–159), `thirdAxis` (162–163), `extentAlong` (231–235), `candidateRange` (242–250), `maxExactCandidates` (257), `segmentDistance` (461–500).

The new file's head, with the three changes this task makes to the moved code marked:

```ts
// Geometry shared by every pass that reasons about board drilling: a hole row as a lattice of
// cylinders, the bisection helpers that answer a row by arithmetic rather than by walking it, and
// the distance between two finite centreline segments. It holds no verdict and no finding — the
// intersection pass and the web pass ask the same geometry different questions, and a second copy
// of "where is hole k" is how the two would come to disagree about which volume the exporter
// removes.
import { faceAxes } from './snapMath'
import type { ManufacturingBoard } from './manufacturingPart'
import type { HoleArrayCut, Vec3 } from './types'

export const tolerance = 1e-6 // mm; the same boundary tolerance every cut check applies.

export type Axis = keyof Vec3

export interface RowDrill {
  depth: Axis
  run: Axis
  across: Axis
  count: number
  origin: number // run coordinate of hole 0
  pitch: number
  acrossAt: number // across coordinate, common to every hole
  axialLo: number // axial interval of every hole, entry face inward, clipped to the stock extent
  axialHi: number
  radius: number
  face: HoleArrayCut['face'] // as recorded — the same-face rule for coaxial pairs reads this
  nominalDiameter: number // recorded diameter, unclipped: the identity a coaxial repeat is judged on
  nominalDepth: number // recorded depth, unclipped: through holes clip the axial extent, not this
}

const positive = (n: number) => Number.isFinite(n) && n > 0
const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'] as const

// A row is a family of cylinders on a lattice: hole k (0-based) sits at origin + k * pitch along
// the run axis at the common across coordinate, drilled from the entry face inward. A depth at or
// past the stock extent is a through hole, not an error, so the extent is clipped, never rejected.
//
// `null` means these recorded fields cannot describe a lattice at all — the precondition every
// consumer shares. It is not a verdict: `drillingChecks` stays the only place that reports *which*
// precondition failed, because its four messages distinguish them.
export function rowDrillOf(board: ManufacturingBoard, row: HoleArrayCut): RowDrill | null {
  const dims: Record<Axis, number> = {
    x: board.local.length,
    y: board.local.width,
    z: board.local.thickness,
  }
  if (!positive(dims.x) || !positive(dims.y) || !positive(dims.z)) return null
  if (!positive(row.diameter) || !positive(row.depth)) return null
  if (!Number.isSafeInteger(row.count) || row.count < 1) return null
  if (!Number.isFinite(row.pitch) || row.pitch < 0) return null
  if (row.count > 1 && row.pitch === 0) return null
  if (!(FACES as readonly string[]).includes(row.face)) return null
  if (row.axis !== 'U' && row.axis !== 'V') return null
  if (![row.start.x, row.start.y, row.start.z].every(Number.isFinite)) return null
  const axes = faceAxes(row.face)
  const inward = row.face.startsWith('+')
  const run = row.axis === 'U' ? axes.u : axes.v
  const across = row.axis === 'U' ? axes.v : axes.u
  const entry = inward ? dims[axes.depth] : 0
  const height = Math.min(row.depth, dims[axes.depth])
  return {
    depth: axes.depth,
    run,
    across,
    count: row.count,
    origin: row.start[run],
    pitch: row.pitch,
    acrossAt: row.start[across],
    axialLo: inward ? entry - height : 0,
    axialHi: inward ? entry : height,
    radius: row.diameter / 2,
    face: row.face,
    nominalDiameter: row.diameter,
    nominalDepth: row.depth,
  }
}

// The finite centreline segment of one hole. The run and across coordinates are fixed by the
// lattice; only the depth axis moves, over the interval `rowDrillOf` clipped to the stock — which
// is why nothing else may rebuild that interval from `row.depth`.
export function holeSegment(drill: RowDrill, k: number): [Vec3, Vec3] {
  const at = (axial: number): Vec3 => {
    const point = { x: 0, y: 0, z: 0 }
    point[drill.run] = runAt(drill, k)
    point[drill.across] = drill.acrossAt
    point[drill.depth] = axial
    return point
  }
  return [at(drill.axialLo), at(drill.axialHi)]
}
```

Place `holeSegment` **after** `runAt` and `holeCentreAt` in the file, beside them — it calls `runAt`, which is a `const` arrow and therefore not hoisted.

And `candidateRange` gains the margin the web pass needs, defaulting to the intersection pass's behaviour:

```ts
// Candidate holes for one row against another: holes whose run coordinate lies inside the other
// row's extent along this row's run axis, expanded by the summed radii — and by `margin`, which is
// how the web pass asks for the holes within a further MIN_REMAINING_WEB_MM rather than the holes
// that touch. The expansion is conservative — when the other row's pitch is wider than the
// summed radii, a hole sitting in a gap between the other row's holes enters the window; inside
// the window every pair is classified exactly, so such a hole is only ever examined, never
// falsely reported.
export function candidateRange(row: RowDrill, other: RowDrill, margin = 0): [number, number] | null {
  const extent = extentAlong(other, row.run)
  const expansion = row.radius + other.radius + margin
  return affectedRange(
    row.count,
    (k) => runAt(row, k) >= extent.lo - expansion,
    (k) => runAt(row, k) <= extent.hi + expansion,
  )
}
```

Everything else in the new file is moved byte-for-byte. `runAt`, `firstIndex`, `lastIndex`, `affectedRange`, `spanOf`, `intervalGap`, `planeAxesOf`, `thirdAxis`, `extentAlong`, `maxExactCandidates` and `segmentDistance` must all be `export`ed. `intervalGap` moves rather than being re-derived: `drillingIntersections.ts` still uses it in its box × row branch, and `cutWebs.ts` needs it too, so exporting it from the shared module is what keeps the "zero inside the interval, nearest end outside" rule stated once.

- [ ] **Step 4: Delete the moved declarations from `drillingIntersections.ts` and import them**

Replace its import block with:

```ts
import type { ManufacturingBoard, ManufacturingPart, ManufacturingRoundStock } from './manufacturingPart'
import { boxVolumeOf } from './cutVolumes'
import {
  affectedRange,
  candidateRange,
  holeCentreAt,
  intervalGap,
  maxExactCandidates,
  planeAxesOf,
  rowDrillOf,
  segmentDistance,
  spanOf,
  thirdAxis,
  tolerance,
  type RowDrill,
} from './drillGeometry'
import type { DowelBoreAxial, DowelBoreTransverse, DowelNotch, HoleArrayCut, Vec3 } from './types'
```

Three names are deliberately **absent** from that list, because after the move nothing in `drillingIntersections.ts` uses them:

- `faceAxes` — `rowDrillOf` was its only user.
- `extentAlong` — its only user was `candidateRange`, which moved.
- `runAt` — its only users were `extentAlong`, `holeCentreAt` and `candidateRange`, all of which moved.

`type Axis` is absent for the same reason: every signature that named it moved, so `drillingIntersections.ts` no longer mentions the type. `noUnusedLocals` would reject all four.

Two call sites need the new `null`:

```ts
  const a = rowDrillOf(part, first)
  const b = rowDrillOf(part, second)
  if (a === null || b === null) return []
```

in `rowPairIssues`, and in the box × row branch of `drillingIntersections`:

```ts
      const drill = rowDrillOf(part, row)
      const obstacle = boxVolumeOf(boxCut)
      if (drill === null || obstacle === null) continue
```

No other line of `drillingIntersections.ts` changes.

- [ ] **Step 5: Run the new test and the moved module's own suite**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/drillGeometry.test.ts src/scene/drillingIntersections.test.ts src/scene/drillingChecks.test.ts
```

Expected: PASS — `drillGeometry.test.ts` **6 tests**, `drillingIntersections.test.ts` **32 tests**, `drillingChecks.test.ts` unchanged. The 32 must pass **without any edit to that file**; if one fails, the move changed behaviour and the move is wrong, not the test.

- [ ] **Step 6: Typecheck, then start the notes file**

```powershell
$env:PATH = "C:\Program Files\Git\cmd;" + $env:PATH; pnpm typecheck; "typecheck exit=$LASTEXITCODE"; pnpm lint; "lint exit=$LASTEXITCODE"
```

Expected: both exit 0. If `tsc` names an unused import in `drillingIntersections.ts`, remove exactly that one.

Create `docs/superpowers/notes/2026-11-14-minimum-remaining-material-notes.md`:

```markdown
# Minimum remaining material (stage 2) — delivery notes

Date: 2026-11-14
Design: `docs/superpowers/specs/2026-11-14-minimum-remaining-material-design.md`
Plan: `docs/superpowers/plans/2026-11-14-minimum-remaining-material.md`

## Progress log

### Task 0 — Baseline

Baseline: 251 files, 4527 passed, 10 skipped.

### Task 1 — Shared drill geometry

`src/scene/drillGeometry.ts` now owns `RowDrill`, `rowDrillOf`, the bisection helpers,
`candidateRange`, `maxExactCandidates` and `segmentDistance`, moved verbatim out of
`drillingIntersections.ts`. Two changes: `rowDrillOf` returns `RowDrill | null` for a row that
cannot describe a lattice, and `holeSegment(drill, k)` states a hole's finite centreline once.
`candidateRange` gained a `margin` parameter, defaulting to 0 so the intersection pass is unchanged.
Commit: `refactor: share the drill geometry`.
```

- [ ] **Step 7: Commit**

```powershell
git add src/scene/drillGeometry.ts src/scene/drillGeometry.test.ts src/scene/drillingIntersections.ts docs/superpowers/notes/2026-11-14-minimum-remaining-material-notes.md
git commit -m "refactor: share the drill geometry"
```

---

### Task 2: The threshold constant and box × box webs

**Files:**
- Modify: `src/geom/cutLimits.ts`
- Create: `src/scene/cutWebs.ts`
- Create: `src/scene/cutWebs.test.ts`

- [ ] **Step 1: Add the constant**

Append to `src/geom/cutLimits.ts`:

```ts
// Two cuts that leave less solid material between their walls than this are reviewed as thin webs.
// A web tears out under a router or drill and collapses in handling, but ordinary joinery puts
// features close together on purpose, so the finding is advisory rather than blocking.
export const MIN_REMAINING_WEB_MM = 3.0
```

No test: this module holds constants only and has never had a test file. Its first reader is Task 2 Step 4.

- [ ] **Step 2: Write the failing test file `src/scene/cutWebs.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { cutWebs } from './cutWebs'
import { manufacturingParts, type ManufacturingBoard } from './manufacturingPart'
import { manufacturingProject } from './__fixtures__/manufacturingProject'
import type { BoxCut, MitreCut } from './types'

const boardOf = (): ManufacturingBoard => {
  const scene = manufacturingProject()
  scene.parts = scene.parts.filter((p) => p.id === 'manual-board')
  scene.parts.forEach((p) => {
    p.cuts = []
  })
  return manufacturingParts(scene.parts, scene.materials, scene.components)[0] as ManufacturingBoard
}

// The manual board is 560 × 720 × 18. A default dado occupies x [100, 160], y [100, 300],
// z [12, 18]; `b` starts 2 mm to its right, which is a 2 mm web on x alone.
const box = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  kind: 'box',
  id: 'dado',
  label: 'Shelf dado',
  face: '+Z',
  position: { x: 100, y: 100, z: 12 },
  size: { x: 60, y: 200, z: 6 },
  ...overrides,
})
const other = (overrides: Partial<BoxCut> = {}): BoxCut => ({
  ...box({ id: 'bottom', label: 'Bottom dado', position: { x: 162, y: 100, z: 12 } }),
  ...overrides,
})

const messages = (board: ManufacturingBoard) => cutWebs(board).map((i) => i.message)

describe('cut webs', () => {
  it('reports two dados that leave a 2 mm web', () => {
    const board = boardOf()
    board.cuts = [box(), other()]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.00 mm with cut "Bottom dado" [bottom], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('is silent at the threshold and above it', () => {
    for (const gap of [3, 3.5, 40]) {
      const board = boardOf()
      board.cuts = [box(), other({ position: { x: 160 + gap, y: 100, z: 12 } })]
      expect(cutWebs(board)).toEqual([])
    }
  })

  it('is silent for dados that touch, which the overlap pass owns', () => {
    const board = boardOf()
    board.cuts = [box(), other({ position: { x: 160, y: 100, z: 12 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('measures a diagonal web as the three-axis distance', () => {
    const board = boardOf()
    // 2 mm in x and 2 mm in y: sqrt(8) = 2.828…, printed truncated as 2.82.
    board.cuts = [box(), other({ position: { x: 162, y: 302, z: 12 } })]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.82 mm with cut "Bottom dado" [bottom], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('never prints the threshold it says the web is below', () => {
    const board = boardOf()
    // 2.999 mm rounds to 3.00, which would read as "3.00 mm, thinner than the 3.00 mm minimum".
    board.cuts = [box(), other({ position: { x: 162.999, y: 100, z: 12 } })]
    expect(messages(board)[0]).toContain('leaves a web of 2.99 mm')
  })

  it('leaves a box at or below the exporter minimum alone', () => {
    const board = boardOf()
    board.cuts = [box(), other({ size: { x: 0.05, y: 200, z: 6 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('leaves a box with non-finite geometry to the geometry review', () => {
    const board = boardOf()
    board.cuts = [box(), other({ position: { x: Number.NaN, y: 100, z: 12 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('does nothing for round stock', () => {
    const scene = manufacturingProject()
    const round = scene.parts.find((p) => p.kind === 'cylinder')!
    expect(cutWebs(manufacturingParts([round], scene.materials, scene.components)[0])).toEqual([])
  })

  it('does nothing for a bevelled edge, which stays unassessed', () => {
    const board = boardOf()
    const mitre: MitreCut = { kind: 'mitre', id: 'bevel', label: 'Bevel', end: '+X', axis: 'Z', angle: 45 }
    board.cuts = [box(), mitre]
    expect(cutWebs(board)).toEqual([])
  })

  it('anchors each finding on the earlier cut and orders by it', () => {
    const board = boardOf()
    // 'toe' is far from 'dado' in y, so the only two thin pairs are toe×third and dado×third.
    // Walking (i, j) order therefore emits toe's finding before dado's, and both anchor on the
    // cut that comes first in `cuts`.
    board.cuts = [
      box({ id: 'toe', label: 'Toe notch', position: { x: 100, y: 100, z: 12 } }),
      box({ id: 'dado', label: 'Shelf dado', position: { x: 100, y: 400, z: 12 } }),
      box({ id: 'third', label: 'Third dado', position: { x: 162, y: 250, z: 12 } }),
    ]
    expect(cutWebs(board).map((i) => i.operation.id)).toEqual(['toe', 'dado'])
  })

  it('carries the anchor cut operation, with its component and joint provenance', () => {
    const board = boardOf()
    board.cuts = [
      box({ sourceJointId: 'joint-a', sourceComponentId: 'component-a' }),
      other(),
    ]
    expect(cutWebs(board)[0].operation).toEqual({
      id: 'dado',
      label: 'Shelf dado',
      kind: 'box',
      sourceComponentId: 'component-a',
      sourceJointId: 'joint-a',
    })
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/cutWebs.test.ts
```

Expected: FAIL — `Failed to resolve import "./cutWebs"`.

- [ ] **Step 4: Write `src/scene/cutWebs.ts` with the box × box case only**

```ts
// Findings for two cuts on one board that leave too little solid material between them, in
// part-local millimetres, ordered by cut. A web thinner than MIN_REMAINING_WEB_MM tears out under a
// router or drill and collapses in edge-banding or transport, but ordinary joinery puts features
// close together on purpose — a hinge cup beside a door groove, a runner pilot hole beside a bottom
// rebate — so the verdict is advisory and never blocks an export. A pair that touches or shares
// material belongs to cutIntersections or drillingIntersections, which name the meeting itself;
// this module reports only what is left between two volumes that do not meet.
import { MIN_REMAINING_WEB_MM } from '../geom/cutLimits'
import type {
  ManufacturingOperationReference,
  ManufacturingPart,
} from './manufacturingPart'
import { boxVolumeOf, type BoxVolume } from './cutVolumes'
import { tolerance } from './drillGeometry'
import type { CutDef } from './types'

export type CutWebCode = 'cut-web-review'
export interface CutWebIssue {
  code: CutWebCode
  message: string
  operation: ManufacturingOperationReference
}

const axes = ['x', 'y', 'z'] as const

// Two decimals, truncated rather than rounded: a web of 2.999 mm would otherwise print
// "3.00 mm … thinner than the 3.00 mm minimum", a sentence that contradicts itself in a document
// a workshop reads. The cost is at most 0.01 mm of understatement in an advisory message.
const webText = (web: number) => (Math.floor(web * 100) / 100).toFixed(2)

function operationOf(cut: CutDef): ManufacturingOperationReference {
  return {
    id: cut.id,
    label: cut.label,
    kind: cut.kind,
    sourceComponentId: cut.sourceComponentId ?? null,
    sourceJointId: cut.kind === 'mitre' ? null : (cut.sourceJointId ?? null),
  }
}

// The material two boxes leave between them: each axis contributes its gap — zero where the two
// intervals overlap — and the three compose as a Euclidean distance.
function boxBoxWeb(a: BoxVolume, b: BoxVolume): number {
  let total = 0
  for (const axis of axes) {
    const gap = Math.max(
      0,
      Math.max(a.min[axis], b.min[axis]) - Math.min(a.max[axis], b.max[axis]),
    )
    total += gap * gap
  }
  return Math.sqrt(total)
}

// The web a pair leaves, or null when the pair is not this module's to report: a bevelled edge is
// unassessed, a cut whose volume cannot be built is the geometry review's, and a box at or below
// the exporter's minimum is absent from the solid.
function pairWeb(first: CutDef, second: CutDef): number | null {
  if (first.kind === 'mitre' || second.kind === 'mitre') return null
  if (first.kind !== 'box' || second.kind !== 'box') return null
  const a = boxVolumeOf(first)
  const b = boxVolumeOf(second)
  return a === null || b === null ? null : boxBoxWeb(a, b)
}

// Pairs are walked in (i, j) order and appended as they come, so the output is already ordered by
// the earlier cut — the order `manufacturingChecks` turns into positional M<n> references.
export function cutWebs(part: ManufacturingPart): CutWebIssue[] {
  if (part.kind !== 'board') return []
  const issues: CutWebIssue[] = []
  const cuts = part.cuts
  for (let i = 0; i < cuts.length; i++) {
    for (let j = i + 1; j < cuts.length; j++) {
      const first = cuts[i]
      const second = cuts[j]
      const web = pairWeb(first, second)
      // The lower gate is the tolerance, not zero: a pair closer than that is a meeting, and the
      // overlap passes have already reported it with a better message.
      if (web === null || !(web > tolerance && web < MIN_REMAINING_WEB_MM)) continue
      issues.push({
        code: 'cut-web-review',
        message: `${first.kind === 'hole-array' ? 'Drilling' : 'Cut'} "${first.label}" [${first.id}]: leaves a web of ${webText(web)} mm with ${
          second.kind === 'hole-array' ? 'drilling' : 'cut'
        } "${second.label}" [${second.id}], thinner than the ${MIN_REMAINING_WEB_MM.toFixed(2)} mm minimum; verify this is intended.`,
        operation: operationOf(first),
      })
    }
  }
  return issues
}
```

`ManufacturingBoard` is deliberately **not** imported yet: nothing in Task 2 needs it, and `noUnusedLocals` would reject the import. Task 3 adds it with `pairWeb`'s new `part` parameter.

- [ ] **Step 5: Run it and confirm it passes**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/cutWebs.test.ts
```

Expected: PASS — **11 tests**.

- [ ] **Step 6: Mutation check — the two gates and the truncation**

Back up the file first; never use `git checkout` to undo a mutation.

```powershell
$d = "C:\Users\bill.ma\AppData\Local\Temp\opencode\cutwebsmut"
New-Item -ItemType Directory -Force -Path $d | Out-Null
Copy-Item src/scene/cutWebs.ts "$d\cutWebs.bak"
```

| Mutation | Edit | Must fail |
| --- | --- | --- |
| Round instead of truncate | `Math.floor(web * 100)` → `Math.round(web * 100)` | `never prints the threshold it says the web is below` |
| Drop the lower gate | `web > tolerance && web < MIN_REMAINING_WEB_MM` → `web < MIN_REMAINING_WEB_MM` | `is silent for dados that touch…` |
| Drop the upper gate | `web < MIN_REMAINING_WEB_MM` → `web < 300` | `is silent at the threshold and above it` |
| Measure one axis only | `total += gap * gap` → `total = Math.max(total, gap * gap)` | `measures a diagonal web as the three-axis distance` |
| Anchor on the later cut | `operationOf(first)` → `operationOf(second)` | `anchors each finding on the earlier cut…` |

Restore with `Copy-Item "$d\cutWebs.bak" src/scene/cutWebs.ts -Force` after each row, then confirm **11 tests** pass again.

- [ ] **Step 7: Commit**

```powershell
git add src/geom/cutLimits.ts src/scene/cutWebs.ts src/scene/cutWebs.test.ts
git commit -m "feat: review the web between two box cuts"
```

---

### Task 3: Box × drilling webs

**Files:**
- Modify: `src/scene/cutWebs.ts`
- Modify: `src/scene/cutWebs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('cut webs', ...)` block of `src/scene/cutWebs.test.ts` — and, above the `describe`, the `hole()` helper and the `HoleArrayCut` type import it needs, since Task 3 is the first place they are used:

```ts
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
```

and extend the type import on the file's fourth line to `import type { BoxCut, HoleArrayCut, MitreCut } from './types'`.

Then append these tests:

```ts
  it('reports a hole that leaves a 2 mm web beside a dado', () => {
    const board = boardOf()
    // The dado ends at x = 195.5; the first hole is centred at x = 200 with radius 2.5, so its wall
    // is 2 mm from the dado's.
    board.cuts = [box({ position: { x: 175.5, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }), hole()]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.00 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('measures a blind hole against a shallow groove in depth', () => {
    const board = boardOf()
    // The hole is drilled 3 mm from the +Z face, so it occupies z [15, 18]; the groove stops at
    // z = 12.5, leaving 2.5 mm of solid material between them.
    board.cuts = [
      box({ position: { x: 190, y: 350, z: 6.5 }, size: { x: 20, y: 60, z: 6 } }),
      hole({ depth: 3 }),
    ]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.50 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('measures a through hole from the stock face, not from its nominal depth', () => {
    const board = boardOf()
    // 30 mm of travel on an 18 mm board stops at the back face. A box recorded beyond that face
    // therefore leaves 1 mm, not the 12 mm an unclipped depth would claim (which would report a
    // meeting and silence the pair entirely).
    board.cuts = [
      box({ position: { x: 190, y: 350, z: -5 }, size: { x: 20, y: 60, z: 4 } }),
      hole({ depth: 30 }),
    ]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 1.00 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('names the drilling first when the row comes first', () => {
    const board = boardOf()
    board.cuts = [hole(), box({ position: { x: 175.5, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } })]
    expect(messages(board)).toEqual([
      'Drilling "Shelf pins" [row]: leaves a web of 2.00 mm with cut "Shelf dado" [dado], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('is silent when the hole breaks into the dado, which the drilling pass owns', () => {
    const board = boardOf()
    board.cuts = [box({ position: { x: 190, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }), hole()]
    expect(cutWebs(board)).toEqual([])
  })

  it('is silent for a row that cannot describe holes', () => {
    const board = boardOf()
    board.cuts = [
      box({ position: { x: 175.5, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }),
      hole({ diameter: 0 }),
    ]
    expect(cutWebs(board)).toEqual([])
  })

  it('still measures the hole beyond a hole that meets the box', () => {
    const board = boardOf()
    // The box occupies x [190, 210]. Hole 0 sits at x = 200, inside it; hole 1 sits at x = 214.5,
    // so its wall is 214.5 - 210 - 2.5 = 2 mm from the box's. The pair must be reported even
    // though its neighbour meets the box — the touching hole belongs to the drilling pass, but
    // the far hole's web is this pass's, and yielding the whole pair would hide it.
    board.cuts = [
      box({ position: { x: 190, y: 350, z: 12 }, size: { x: 20, y: 60, z: 6 } }),
      hole({ start: { x: 200, y: 380, z: 18 }, pitch: 14.5, count: 2 }),
    ]
    expect(messages(board)).toEqual([
      'Cut "Shelf dado" [dado]: leaves a web of 2.00 mm with drilling "Shelf pins" [row], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })
```

- [ ] **Step 2: Run them and confirm they fail**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/cutWebs.test.ts
```

Expected: FAIL — the seven new tests find no findings (the pair is not a box × box, so `pairWeb` returns `null`). The 11 existing tests still pass.

- [ ] **Step 3: Add the box × drilling measurement**

In `src/scene/cutWebs.ts`, **replace** the single-line `import { tolerance } from './drillGeometry'` with:

```ts
import {
  holeCentreAt,
  intervalGap,
  planeAxesOf,
  rowDrillOf,
  tolerance,
  type RowDrill,
} from './drillGeometry'
```

`intervalGap` is **imported, not redefined**: it is already exported from `drillGeometry.ts` in Task 1, and it is the same "zero inside the interval, nearest end outside" rule the intersection pass reads. A second copy here would be the fourth statement of a two-line rule.

and add, above `pairWeb`:

```ts
// The web one hole leaves with a box. The axial gap and the in-plane gap between the hole's disc
// and the box's rectangle are independent — the cylinder and the box are both prisms on the same
// axis — so they compose as a Euclidean distance. Both terms are zero where the volumes overlap,
// which is the overlap passes' case, not this one.
function holeBoxWeb(drill: RowDrill, k: number, box: BoxVolume): number {
  const [u, v] = planeAxesOf(drill)
  // The hole's axial interval is `[axialLo, axialHi]`, clipped to the stock by `rowDrillOf`. The
  // box is either wholly below it or wholly above it, never both, so the larger of the two
  // one-sided gaps is the interval-to-interval distance.
  const axialGap = Math.max(
    0,
    drill.axialLo - box.max[drill.depth],
    box.min[drill.depth] - drill.axialHi,
  )
  const gapU = intervalGap(holeCentreAt(drill, k, u), box.min[u], box.max[u])
  const gapV = intervalGap(holeCentreAt(drill, k, v), box.min[v], box.max[v])
  const planeGap = Math.max(0, Math.hypot(gapU, gapV) - drill.radius)
  return Math.hypot(axialGap, planeGap)
}

// The two holes flanking a box along the row's run axis, clamped into the row. Web thickness is
// monotone in the distance from the box — the axial and across terms do not move with the hole
// index — so the nearest hole on each side is the thinnest web that side can leave, and two
// evaluations answer the pair whatever the row's count. A row of a billion holes costs the same
// as a row of five.
function flankingHoles(drill: RowDrill, box: BoxVolume): number[] {
  if (drill.count === 1) return [0]
  const last = drill.count - 1
  const clamp = (k: number) => Math.min(last, Math.max(0, k))
  const lo = box.min[drill.run]
  const hi = box.max[drill.run]
  const left = clamp(Math.ceil((lo - drill.origin) / drill.pitch) - 1)
  const right = clamp(Math.floor((hi - drill.origin) / drill.pitch) + 1)
  return left === right ? [left] : [left, right]
}

// The thinnest web the row leaves with the box, over the holes that do not touch it, or null when
// every candidate touches. A pair that touches is a meeting the drilling pass has already named.
function rowBoxWeb(drill: RowDrill, box: BoxVolume): number | null {
  let best: number | null = null
  for (const k of flankingHoles(drill, box)) {
    const web = holeBoxWeb(drill, k, box)
    if (!(web > tolerance)) continue
    best = best === null ? web : Math.min(best, web)
  }
  return best
}
```

and extend `pairWeb`:

```ts
function pairWeb(part: ManufacturingBoard, first: CutDef, second: CutDef): number | null {
  if (first.kind === 'mitre' || second.kind === 'mitre') return null
  if (first.kind === 'box' && second.kind === 'box') {
    const a = boxVolumeOf(first)
    const b = boxVolumeOf(second)
    return a === null || b === null ? null : boxBoxWeb(a, b)
  }
  const boxCut = first.kind === 'box' ? first : second.kind === 'box' ? second : null
  const row = first.kind === 'hole-array' ? first : second.kind === 'hole-array' ? second : null
  if (boxCut === null || row === null) return null
  const volume = boxVolumeOf(boxCut)
  const drill = rowDrillOf(part, row)
  return volume === null || drill === null ? null : rowBoxWeb(drill, volume)
}
```

`pairWeb` now needs the part, so the call site becomes `pairWeb(part, first, second)`, and the `ManufacturingBoard` type is added to the import from `./manufacturingPart` in this same step.

- [ ] **Step 4: Run the tests and confirm they pass**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/cutWebs.test.ts
```

Expected: PASS — **18 tests**.

- [ ] **Step 5: Mutation check — the flank, the clamp and the plane term**

Back up `src/scene/cutWebs.ts` again (same directory, `cutWebs.bak`), restore after each row.

| Mutation | Edit | Must fail |
| --- | --- | --- |
| Rebuild the axial interval from `row.depth` | in `holeBoxWeb`, replace `drill.axialLo`/`drill.axialHi` with `drill.axialHi - drill.nominalDepth` and `drill.axialHi` | `measures a through hole from the stock face…` |
| Evaluate only the left flank | `return left === right ? [left] : [left, right]` → `return [left]` | `still measures the hole beyond a hole that meets the box` |
| Drop the radius from the plane gap | `Math.hypot(gapU, gapV) - drill.radius` → `Math.hypot(gapU, gapV)` | `reports a hole that leaves a 2 mm web beside a dado` |
| Drop the axial term | `Math.hypot(axialGap, planeGap)` → `planeGap` | `measures a blind hole against a shallow groove in depth` |
| Yield the whole pair when one hole touches | in `rowBoxWeb`, replace the per-hole `if (!(web > tolerance)) continue` with `if (!(web > tolerance)) return null` | `still measures the hole beyond a hole that meets the box` |

The first row is the mutation the whole `drillGeometry` extraction exists to make impossible: it is the reason `rowDrillOf` is shared rather than re-derived. The last row is the one that distinguishes D3's per-hole rule from a per-pair rule, and it is the reason that test exists.

The left-flank row is attributed to `still measures the hole beyond a hole that meets the box` and **not** to `reports a hole that leaves a 2 mm web beside a dado`, because in the latter the box ends before the row starts: `left` and `right` both clamp to hole 0, so `return [left]` is the same list and the mutation survives. Only a test whose box *straddles* the row — so the two flanks are different holes — can catch it.

- [ ] **Step 6: Commit**

```powershell
git add src/scene/cutWebs.ts src/scene/cutWebs.test.ts
git commit -m "feat: review the web between a box cut and a drilling row"
```

---

### Task 4: Drilling × drilling webs

**Files:**
- Modify: `src/scene/cutWebs.ts`
- Modify: `src/scene/cutWebs.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe` block:

```ts
  it('reports two parallel rows that leave a 2 mm wall', () => {
    const board = boardOf()
    // Both rows run along x with radius 2.5 and their centres 7 mm apart across y, so the walls
    // are 7 - 5 = 2 mm apart.
    board.cuts = [hole(), hole({ id: 'row-b', label: 'Shelf pins B', start: { x: 200, y: 387, z: 18 } })]
    expect(messages(board)).toEqual([
      'Drilling "Shelf pins" [row]: leaves a web of 2.00 mm with drilling "Shelf pins B" [row-b], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('reports two perpendicular rows whose nearest holes are outside the summed radii', () => {
    const board = boardOf()
    // Row A's holes advance along x at y = 380 and are bored along z, so hole 4's centreline runs
    // from (328, 380, 6) to (328, 380, 18). Row B is bored along y with 340 mm of travel from
    // y = 720, so its axial interval is y [380, 720]; its single hole sits at x = 334, z = 10. The
    // nearest points are (328, 380, 10) and (334, 380, 10) — 6 mm apart — so the walls are 1 mm
    // apart.
    //
    // The pair is deliberately just outside the summed radii (5 mm) and just inside the web
    // threshold (3 mm beyond it), which is the only place the `margin` argument to `candidateRange`
    // decides the answer: with margin 0 the window around x = 334 is [329, 339] and hole 4 at
    // x = 328 is not in it, so the pair is never examined and nothing is reported.
    board.cuts = [
      hole(),
      hole({
        id: 'fixing',
        label: 'Fixing dowel',
        face: '+Y',
        axis: 'U',
        start: { x: 334, y: 720, z: 10 },
        pitch: 0,
        count: 1,
        depth: 340,
      }),
    ]
    expect(messages(board)).toEqual([
      'Drilling "Shelf pins" [row]: leaves a web of 1.00 mm with drilling "Fixing dowel" [fixing], thinner than the 3.00 mm minimum; verify this is intended.',
    ])
  })

  it('is silent for two rows that meet, which the drilling pass owns', () => {
    const board = boardOf()
    board.cuts = [hole(), hole({ id: 'row-b', label: 'Shelf pins B', start: { x: 200, y: 385, z: 18 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('yields the whole pair when one hole meets the other row', () => {
    const board = boardOf()
    // Row B is bored along y from y = 720 down to y = 380, so its centrelines reach row A's plane.
    // Its hole 0 sits at x = 329, one millimetre from row A's hole 4 at x = 328: the two meet, and
    // the drilling pass names that meeting. Its hole 1 sits at x = 334, six millimetres away, which
    // leaves a 1 mm web. A per-*hole* rule would skip the touching pair and report the 1 mm; the
    // per-pair rule collapses the whole pair to a meeting and reports nothing, because the 1 mm is
    // a pitch artefact of the crossing rather than a design decision.
    board.cuts = [
      hole(),
      hole({
        id: 'fixing',
        label: 'Fixing dowel',
        face: '+Y',
        axis: 'U',
        start: { x: 329, y: 720, z: 10 },
        pitch: 5,
        count: 2,
        depth: 340,
      }),
    ]
    expect(cutWebs(board)).toEqual([])
  })

  it('is silent for rows that are further apart than the minimum', () => {
    const board = boardOf()
    board.cuts = [hole(), hole({ id: 'row-b', label: 'Shelf pins B', start: { x: 200, y: 400, z: 18 } })]
    expect(cutWebs(board)).toEqual([])
  })

  it('never pairs a hole with the rest of its own row', () => {
    const board = boardOf()
    // Pitch 7 with diameter 5 leaves a 2 mm wall between adjacent holes — inside the threshold, so
    // an implementation that expanded a row into one cut per hole would report it. A row is one
    // cut and is paired only against other cuts; the walls between its own holes are
    // `drilling-intersection`'s business (pitch against diameter), never a web.
    board.cuts = [hole({ pitch: 7, count: 5 })]
    expect(cutWebs(board)).toEqual([])
  })

  it('answers a huge row by arithmetic, not by enumerating it', () => {
    const board = boardOf()
    // Two parallel rows of a billion holes each, 7 mm apart across y. Every hole pair leaves a
    // 2 mm web, and both candidate windows are a billion holes wide, so the cap is reached: the
    // window's first pair is reported instead. Without the cap this test would enumerate 10^18
    // pairs and never finish — which is what the mutation table's last row checks.
    board.cuts = [
      hole({ count: 1_000_000_000, pitch: 32, start: { x: 0, y: 380, z: 18 } }),
      hole({
        id: 'row-b',
        label: 'Shelf pins B',
        count: 1_000_000_000,
        pitch: 32,
        start: { x: 0, y: 387, z: 18 },
      }),
    ]
    expect(cutWebs(board).map((i) => i.operation.id)).toEqual(['row'])
  })
```

- [ ] **Step 2: Run them and confirm they fail**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/cutWebs.test.ts
```

Expected: FAIL — the seven new tests find no findings. The 18 existing tests still pass. The huge-row test must **not** time out: if it does, an implementation has enumerated the row and that is the defect this step exists to catch.

- [ ] **Step 3: Add the drilling × drilling measurement**

In `src/scene/cutWebs.ts`, extend the import from `./drillGeometry` with `candidateRange`, `holeSegment`, `maxExactCandidates` and `segmentDistance`, then add above `pairWeb`:

```ts
// Two holes: the shortest distance between their centreline segments, less both radii. A cylinder
// is not a capsule — its ends are flat discs — so the capsule distance is the smaller of the two.
// The report may therefore be a fraction thicker than reality and never misses a web, which is the
// right direction for an advisory verdict.
function holeHoleWeb(a: RowDrill, ka: number, b: RowDrill, kb: number): number {
  const [a0, a1] = holeSegment(a, ka)
  const [b0, b1] = holeSegment(b, kb)
  return Math.max(0, segmentDistance(a0, a1, b0, b1) - (a.radius + b.radius))
}

// The thinnest web two rows leave. The candidate windows are bounded by geometry on both sides —
// never by `count` — and expanded by MIN_REMAINING_WEB_MM so a pair that is close but not touching
// enters them. Past the cap the window's first pair is reported instead: conservative, and
// unreachable by real cabinet drilling, where a window is hundreds of holes at millimetre spacing.
//
// Every candidate pair is measured, touching ones included. A pair that touches drives the minimum
// to 0 and yields the whole row pair to the drilling pass, which has already named the meeting —
// the webs beside a crossing are a pitch artefact, not a design decision. The 0 is returned as-is;
// `cutWebs`'s single tolerance gate is what silences it, so there is no second gate here to drift
// out of step with that one.
function rowRowWeb(a: RowDrill, b: RowDrill): number | null {
  const windowA = candidateRange(a, b, MIN_REMAINING_WEB_MM)
  const windowB = candidateRange(b, a, MIN_REMAINING_WEB_MM)
  if (windowA === null || windowB === null) return null
  const [firstA, lastA] = windowA
  const [firstB, lastB] = windowB
  if (lastA - firstA + 1 > maxExactCandidates || lastB - firstB + 1 > maxExactCandidates)
    return holeHoleWeb(a, firstA, b, firstB)
  let best = Number.POSITIVE_INFINITY
  for (let ka = firstA; ka <= lastA; ka++)
    for (let kb = firstB; kb <= lastB; kb++) best = Math.min(best, holeHoleWeb(a, ka, b, kb))
  return best
}
```

and insert into `pairWeb` — **before** the `const boxCut = …` / `const row = …` extraction, not after it. Task 3's `pairWeb` returns `null` at `if (boxCut === null || row === null) return null`, and a hole × hole pair has neither, so a branch appended at the tail is unreachable and the new tests would still fail:

```ts
  if (first.kind === 'hole-array' && second.kind === 'hole-array') {
    const a = rowDrillOf(part, first)
    const b = rowDrillOf(part, second)
    return a === null || b === null ? null : rowRowWeb(a, b)
  }
```

`pairWeb` after this step reads, in order: the mitre guard, the box × box branch, the hole-array × hole-array branch, then the box × drilling branch and its `null` guard.

- [ ] **Step 4: Run the tests and confirm they pass**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/cutWebs.test.ts
```

Expected: PASS — **25 tests**.

- [ ] **Step 5: Mutation check — the radii, the margin and the window**

| Mutation | Edit | Must fail |
| --- | --- | --- |
| Compare centre lines, not surfaces | `segmentDistance(...) - (a.radius + b.radius)` → `segmentDistance(...)` | `reports two parallel rows that leave a 2 mm wall` |
| Forget the web margin | `candidateRange(a, b, MIN_REMAINING_WEB_MM)` → `candidateRange(a, b)` | `reports two perpendicular rows whose nearest holes are outside the summed radii` |
| Skip touching pairs instead of yielding the pair | in the loop, `best = Math.min(best, holeHoleWeb(a, ka, b, kb))` → `{ const w = holeHoleWeb(a, ka, b, kb); if (w > tolerance) best = Math.min(best, w) }` | `yields the whole pair when one hole meets the other row` |
| Enumerate the whole row | replace `candidateRange(...)` windows with `[0, a.count - 1]` | `answers a huge row by arithmetic, not by enumerating it` (times out) |

There is deliberately no "report a meeting" row here: `rowRowWeb` returns a bare number and `cutWebs`'s single `web > tolerance` gate silences a meeting. That gate is already pinned by Task 2's `is silent for dados that touch, which the overlap pass owns` mutation, so a second gate inside `rowRowWeb` would be a second statement of the same rule — one that no test could distinguish and that could drift out of step.

- [ ] **Step 6: Commit**

```powershell
git add src/scene/cutWebs.ts src/scene/cutWebs.test.ts
git commit -m "feat: review the web between two drilling rows"
```

---

### Task 5: Wire the check into readiness, the review and the PDF

**Files:**
- Modify: `src/scene/manufacturingChecks.ts`
- Modify: `src/scene/manufacturingChecks.test.ts`
- Modify: `src/scene/productionReview.ts`
- Modify: `src/scene/productionReview.test.ts`
- Modify: `src/ui/buildReadinessPdf.test.ts`

- [ ] **Step 1: Write the failing integration test**

In `src/scene/manufacturingChecks.test.ts`, add after the existing `reports invalid box geometry with the cut operation and drops the unassessed gap` test:

```ts
  it('reports a thin web with the cut operation, the board target and the narrowed unassessed list', () => {
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
        position: { x: 162, y: 100, z: 12 },
        size: { x: 60, y: 200, z: 6 },
      },
    ]
    const report = reportOf(scene)
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({
      reference: 'M1',
      code: 'cut-web-review',
      message:
        'Cut "Shelf dado" [shelf]: leaves a web of 2.00 mm with cut "Bottom dado" [bottom], thinner than the 3.00 mm minimum; verify this is intended.',
      operation: {
        id: 'shelf',
        label: 'Shelf dado',
        kind: 'box',
        sourceComponentId: null,
        sourceJointId: 'joint-shelf',
      },
      targets: [{ id: board.id, label: board.label, cabinetId: null, parentId: null }],
    })
    expect(report.unassessed).toContain('Minimum remaining material on round stock')
    expect(report.unassessed).not.toContain('Minimum remaining material between cuts')
    expect(report.unassessed).toHaveLength(7)
  })
```

In `src/scene/productionReview.test.ts`, replace the test `treats non-finite, overlapping and redundant cuts as advisory` with:

```ts
  it('treats non-finite, overlapping, redundant and thin-web cuts as advisory', () => {
    const input = inputOf()
    input.manufacturing.findings = [
      { reference: 'M1', code: 'cut-intersection-review', message: 'Overlap', targets: [] },
      { reference: 'M2', code: 'cut-redundant-review', message: 'Redundant', targets: [] },
      { reference: 'M3', code: 'cut-geometry-review', message: 'Invalid', targets: [] },
      { reference: 'M4', code: 'cut-web-review', message: 'Thin web', targets: [] },
      { reference: 'M5', code: 'cut-size', message: 'Invalid', targets: [] },
    ]
    const review = buildProductionReview(input)
    expect(review.counts).toMatchObject({ needsCorrection: 1, advisory: 4 })
    expect(review.classification).toContain(
      'box cuts that are non-finite, overlapping, redundant or leave a thin web',
    )
  })
```

In `src/ui/buildReadinessPdf.test.ts`, inside the **second** test (`prints captured drilling cut and source ownership alongside the stable part target`), add after the existing `Cut interactions involving bevelled edges or round-stock notches` assertion at line 86:

```ts
    expect(text).toContain('Minimum remaining material on round stock')
    expect(text).not.toContain('Minimum remaining material between cuts')
```

That is where the unassessed wording is already pinned, so the new item is asserted beside the item it was split from.

- [ ] **Step 2: Run them and confirm they fail**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/manufacturingChecks.test.ts src/scene/productionReview.test.ts src/ui/buildReadinessPdf.test.ts
```

Expected: FAIL — `'cut-web-review'` is not assignable to `ManufacturingCheckCode` (a type error), the unassessed list still names the old gap, and the policy sentence still ends at "redundant".

- [ ] **Step 3: Wire `cutWebs` into `manufacturingChecks.ts`**

Three edits:

```ts
import { cutIntersections, type CutIntersectionCode } from './cutIntersections'
import { cutWebs, type CutWebCode } from './cutWebs'
```

```ts
export type ManufacturingCheckCode =
  | DrillingCheckCode
  | CutIntersectionCode
  | CutWebCode
```

```ts
    for (const issue of cutIntersections(p)) add(issue.code, issue.message, [p], issue.operation)
    for (const issue of cutWebs(p)) add(issue.code, issue.message, [p], issue.operation)
```

and in the returned `unassessed` array, replace the third item:

```ts
      'Minimum remaining material on round stock',
```

The list stays at seven items: the gap it named is now assessed for boards, and the one that remains is round stock.

- [ ] **Step 4: Classify it in `productionReview.ts`**

Add `f.code === 'cut-web-review'` to the advisory chain (after `f.code === 'cut-geometry-review'`), and replace the `classification` sentence:

```ts
    classification:
      'Invalid part, stock and cut-envelope definitions, missing parts and output mismatches need correction. Labels, joinery reminders, angled insertion, repeated or meeting drilling, and box cuts that are non-finite, overlapping, redundant or leave a thin web are advisory. Skipped checks, assessment limits and unverified installation are unassessed.',
```

- [ ] **Step 5: Run the three suites and confirm they pass**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/manufacturingChecks.test.ts src/scene/productionReview.test.ts src/ui/buildReadinessPdf.test.ts src/scene/cutWebs.test.ts src/scene/drillGeometry.test.ts
```

Expected: PASS. `manufacturingChecks.test.ts` gains one test; `productionReview.test.ts` keeps nine.

- [ ] **Step 6: Confirm the fixtures stay finding-free**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run src/scene/machiningSchedule.test.ts src/scene/productionReadiness.test.ts src/scene/productionReview.test.ts src/ui/buildReadinessPdf.test.ts
```

Expected: PASS, no new failures. If a **generated cabinet** now reports `cut-web-review` — a shelf-pin row 3 mm from a housing is geometrically possible — **stop and report it**. The spec (§8.2) requires the representative projects to stay finding-free; a real cabinet tripping the check is a finding about the threshold, not a test to relax, and widening `MIN_REMAINING_WEB_MM` or exempting joint-owned cuts is a design decision, not an implementation step.

- [ ] **Step 7: Commit**

```powershell
git add src/scene/manufacturingChecks.ts src/scene/manufacturingChecks.test.ts src/scene/productionReview.ts src/scene/productionReview.test.ts src/ui/buildReadinessPdf.test.ts
git commit -m "feat: report thin webs in manufacturing readiness"
```

---

### Task 6: Documentation, notes and full verification

**Files:**
- Modify: `README.md:45-48`
- Modify: `docs/production-review.md:8`
- Modify: `CLAUDE.md:379`
- Modify: `docs/superpowers/notes/2026-11-14-minimum-remaining-material-notes.md`
- Regenerate: `project-structure.html`

- [ ] **Step 1: Update the README readiness paragraph**

In `README.md`, replace the last sentence of the readiness bullet (the one beginning `Overlapping or redundant board box cuts are reviewed as advisory`) with:

```markdown
Overlapping or redundant board box cuts are reviewed as advisory, and a connected group of overlaps
is reported once at its first cut; a box cut with non-finite geometry is reported as advisory instead
of being silently skipped. Two cuts that leave less than `MIN_REMAINING_WEB_MM` (3 mm) of solid
material between them are reported as advisory thin webs, for two boxes, a box and a drilling row,
and two drilling rows alike. Cut interactions involving bevelled edges or round-stock notches,
minimum remaining material on round stock, manual machining geometry and machine compatibility
remain unassessed.
```

- [ ] **Step 2: Update the review policy doc**

In `docs/production-review.md`, extend the Advisory bullet:

```markdown
- **Advisory:** empty/duplicate part labels, repeated or meeting drilling, joinery reminders, angled shelf insertion, non-finite box-cut geometry, overlapping or redundant cuts, and webs of solid material thinner than 3 mm between two non-touching cuts. IDs remain authoritative; recorded joints do not certify geometry.
```

- [ ] **Step 3: Extend the `CLAUDE.md` invariant**

Replace the final clause of the box-cut invariant (currently `The broad "interactions between cuts" gap is narrowed to bevelled edges and round-stock notches, not claimed covered; thin webs remain a separate check.`) with:

```markdown
    The broad "interactions between cuts" gap is narrowed to bevelled edges and round-stock notches, not claimed covered. A thin web is its own check: `cutWebs.ts` measures the solid material between two cuts that do **not** meet — box × box by the Euclidean gap of three axis intervals, box × drilling by composing the axial gap with the in-plane disc-to-rectangle gap, drilling × drilling by the segment distance less both radii — and reports `cut-web-review` below `MIN_REMAINING_WEB_MM`. It reads `rowDrillOf`'s clipped `axialLo`/`axialHi` and never `row.depth`, because a 30 mm through-hole on an 18 mm board stops at the back face; rebuilding that interval is how the web pass would measure a volume the exporter never removes. A pair closer than the tolerance is the overlap passes' finding, not this one.
```

- [ ] **Step 4: Complete the delivery notes**

Update `docs/superpowers/notes/2026-11-14-minimum-remaining-material-notes.md`: add these sections above the progress log, and append a Task 2–6 entry to it.

```markdown
## What changed

`src/geom/cutLimits.ts` gains `MIN_REMAINING_WEB_MM = 3.0`.

`src/scene/drillGeometry.ts` (new) owns the drill geometry both passes share: `RowDrill`,
`rowDrillOf`, `holeSegment`, the bisection helpers, `candidateRange` (now with a `margin`) and
`segmentDistance`, moved out of `drillingIntersections.ts`. `rowDrillOf` returns `null` for a row
that cannot describe a lattice — a precondition, not a verdict; `drillingChecks` still reports which
one failed.

`src/scene/cutWebs.ts` (new) reports `cut-web-review` for two cuts on one board that leave less than
the threshold between them. `manufacturingChecks` runs it after `cutIntersections`, so `M<n>`
references stay in cut order, and `unassessed` narrows to `'Minimum remaining material on round
stock'` (still seven items). `productionReview` classifies the code advisory and names thin webs in
its policy sentence. No schema or file-format change.

## Why advisory

The model cannot know grain density, fastener length or screw gauge, and legitimate joinery puts
features close together on purpose — a hinge cup beside a door groove, a runner pilot hole beside a
bottom rebate. The finding names both cuts and the measured web so a reviewer can act; promoting it
to `needs-correction` is a one-line change if thin webs reach packets.

## Known limits

- Round stock is unassessed; the unassessed item says so.
- Bevelled edges (mitre and angled end cuts) are skipped entirely.
- A pair whose closest approach is within 1e-6 mm is silent as a *pair*: one touching hole pair
  suppresses the web verdict for the rest of that row pair. Per-hole yielding was rejected because
  it reports two codes for one physical meeting.
- The cylinder-to-capsule substitution under-reports by the end-cap geometry: a capsule contains the
  cylinder, so the distance between two capsules is no greater than the distance between the two
  solids, and the printed web is no thicker than the real one. The error is a fraction of a
  millimetre and always in the conservative direction.
- Box × drilling evaluates the two holes flanking the box, relying on web thickness being monotone
  in the distance from it. A flanking hole that touches the box silences that side; its outward
  neighbour would have to be within the same 3 mm for a web to be missed, which needs a pitch
  smaller than about 6 mm.
- Drilling × drilling is capped at `maxExactCandidates` per window; past the cap the window's first
  pair is reported instead. Real cabinet drilling never reaches it.

## Test coverage

- `drillGeometry.test.ts` — the clipped axial interval (blind, through, negative face), the `null`
  preconditions, `holeSegment` endpoints, and `segmentDistance`'s parallel, skew, perpendicular and
  degenerate branches.
- `cutWebs.test.ts` — box × box (thin, threshold boundary, touching, diagonal, truncation,
  sub-minimum, non-finite), box × drilling (plane, axial, stock clamp, either order, meeting,
  unbuildable row, a touching hole that must not silence its neighbour), drilling × drilling
  (parallel, perpendicular, meeting, a meeting that must silence the whole pair, too far, own row,
  huge row), ordering and operation provenance.
- `manufacturingChecks.test.ts` — `cut-web-review` carries `M1`, the cut operation with joint
  provenance and the board target; the unassessed list narrows.
- `productionReview.test.ts` — the new code is advisory and the policy sentence names it.
- `buildReadinessPdf.test.ts` — the new unassessed wording renders.

## Verification

Full suite on this Windows host, 2026-11-14: **253 files, <measured> passed, 10 skipped.**
`pnpm typecheck`, `pnpm lint` and `pnpm check:file-casing` all exit 0.

Mutation testing:

| Mutation | Observed failure |
| --- | --- |
| round the web instead of truncating | the 2.999 mm display test |
| drop the lower threshold gate | the touching-dados test |
| drop the upper threshold gate | the at-threshold test |
| measure one axis only | the diagonal test |
| anchor on the later cut | the ordering test |
| rebuild the axial interval from `row.depth` | the through-hole stock-clamp test |
| evaluate only the left flank | the far-hole-beyond-a-touching-hole test |
| drop the radius from the plane gap | the box × drilling plane test |
| drop the axial term | the blind-hole-over-groove test |
| compare centrelines, not surfaces | the parallel-rows test |
| skip touching pairs instead of yielding the pair | the meeting-drives-the-minimum test |
| forget the web margin in the window | the perpendicular-rows test |
| enumerate the whole row | the huge-row test (times out) |

## Progress log

### Task 2 — Threshold and box × box

`MIN_REMAINING_WEB_MM`; `cutWebs` with box × box, the two gates, the truncating formatter and
anchor ordering. Commit: `feat: review the web between two box cuts`.

### Task 3 — Box × drilling

`holeBoxWeb` composes the axial gap with the in-plane disc-to-rectangle gap; `flankingHoles` answers
a row of any count in two evaluations. Commit: `feat: review the web between a box cut and a
drilling row`.

### Task 4 — Drilling × drilling

`holeHoleWeb` is the segment distance less both radii; `rowRowWeb` windows by `candidateRange` with
the web margin and caps at `maxExactCandidates`. Commit: `feat: review the web between two drilling
rows`.

### Task 5 — Readiness, review and PDF

Code added to `ManufacturingCheckCode`, run after `cutIntersections`, unassessed narrowed, advisory
classification and policy sentence. Commit: `feat: report thin webs in manufacturing readiness`.

### Task 6 — Documentation and verification

README, `docs/production-review.md`, `CLAUDE.md`, these notes, the structure HTML, the full suite
and the mutation table. Commit: `docs: record the minimum remaining material`.
```

- [ ] **Step 5: Run the full suite**

```powershell
$env:NODE_OPTIONS='--no-experimental-webstorage'; pnpm vitest run --maxWorkers=4 --testTimeout=15000 --exclude server/catalogue/http.test.ts
```

Expected: **253 test files** (the baseline's 251 plus `drillGeometry.test.ts` and `cutWebs.test.ts`), 10 skipped, and no failures. Record the measured passed count in the notes — do not write a number this run did not produce.

- [ ] **Step 6: Run typecheck, lint and file casing**

```powershell
$env:PATH = "C:\Program Files\Git\cmd;" + $env:PATH; pnpm typecheck; "typecheck exit=$LASTEXITCODE"; pnpm lint; "lint exit=$LASTEXITCODE"; pnpm check:file-casing; "file-casing exit=$LASTEXITCODE"
```

Expected: all three exit 0.

- [ ] **Step 7: Mutation testing**

Back up the two source files; never use `git checkout` to undo a mutation.

```powershell
$d = "C:\Users\bill.ma\AppData\Local\Temp\opencode\cutwebmut"
New-Item -ItemType Directory -Force -Path $d | Out-Null
Copy-Item src/scene/cutWebs.ts "$d\cutWebs.bak"
Copy-Item src/scene/drillGeometry.ts "$d\drillGeometry.bak"
```

Run the rows recorded in the notes' mutation table, restoring with
`Copy-Item "$d\cutWebs.bak" src/scene/cutWebs.ts -Force` after each. After the last mutation, restore
both and confirm:

```powershell
Select-String -Path src/scene/cutWebs.ts -Pattern 'Math.floor|tolerance && web <|flankingHoles|segmentDistance'
pnpm vitest run src/scene/cutWebs.test.ts src/scene/drillGeometry.test.ts
```

Expected: the restored lines are present and **31 tests** pass (25 + 6).

- [ ] **Step 8: Regenerate the structure HTML**

```powershell
node scripts/update-structure-html.mjs
```

Expected: `No RELEASE_TAG set — regenerated trees only, left version/date untouched.` If the script reports a version change, do not commit it: this plan sets no release tag.

- [ ] **Step 9: Commit**

```powershell
git add README.md docs/production-review.md CLAUDE.md docs/superpowers/notes/2026-11-14-minimum-remaining-material-notes.md project-structure.html
git commit -m "docs: record the minimum remaining material"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §2 rows 1–3: box × box, box × drilling, drilling × drilling | Tasks 2, 3, 4 |
| §2 row 4: a touching pair yields | Tasks 2–4, one gate per case (D3) |
| §2 row 5: non-finite or sub-minimum cuts excluded | Task 2 (`boxVolumeOf`), Task 3 (`rowDrillOf`) |
| §2 row 6: bevelled edges unassessed | Task 2 (`pairWeb`'s mitre guard) |
| §2 row 7: round stock unassessed | Task 2 (`part.kind` guard), Task 5 (unassessed wording) |
| §2 row 8: holes within one row | Task 4 (`never pairs a hole with the rest of its own row`, `yields the whole pair when one hole meets the other row`) |
| §3: `MIN_REMAINING_WEB_MM = 3.0`, tolerance gate, strict inequalities | Task 2 Steps 1, 4, 6 |
| §4: file structure | Tasks 1–2 |
| §5.1: box × box formula | Task 2 `boxBoxWeb` |
| §5.2: box × drilling formula, clamped axial interval | Task 3, with D2's mutation |
| §5.3: drilling × drilling, `segmentDistance` reuse | Task 1 (move), Task 4 (use) |
| §6.1–6.3: interface, anchoring, ordering, messages | Task 2 Step 4, tests in Tasks 2–4 |
| §7.1: run after `cutIntersections` | Task 5 Step 3 |
| §7.2: unassessed narrows, list stays at 7 | Task 5 Steps 1, 3 |
| §7.3: advisory classification and policy sentence | Task 5 Step 4 |
| §8: unit tests, fixture safety, integration, PDF | Tasks 2–5, Task 5 Step 6 |
| §9: non-goals recorded, no code | Notes' *Known limits* |

**Placeholder scan:** every step has code, a command or exact prose. The one figure this plan does not invent is the full-suite passed count, which Task 6 Step 5 measures and Step 4 writes; that is deliberate — a plan that guesses a test count hides a missing test.

**Type consistency:** `RowDrill`, `rowDrillOf`, `holeSegment`, `candidateRange(row, other, margin?)`, `segmentDistance`, `tolerance`, `maxExactCandidates` and `Axis` are defined in Task 1 and used unchanged in Tasks 3–4. `CutWebCode` is `'cut-web-review'` everywhere it appears. `CutWebIssue.operation` is `ManufacturingOperationReference`, the same type `cutIntersections` and `drillingChecks` use, so `manufacturingChecks`'s `add` takes all three without a cast. `pairWeb` gains its `part` parameter in Task 3, and its single call site is updated in the same step.

**Two seams that are not obvious from the diff, and are therefore called out in the code comments:**

1. `rowDrillOf`'s `null` is a *precondition*, not a verdict, and `drillingChecks` remains the only reporter. If a later change makes `drillingChecks` delegate its validity question to `rowDrillOf`, its four distinct messages collapse into one — that is the change to refuse.
2. `flankingHoles` relies on monotonicity, which holds because neither the axial term nor the across term varies with the hole index. A future change that lets a row's across coordinate vary would break it silently, so the reasoning is written beside the function rather than inferred.
