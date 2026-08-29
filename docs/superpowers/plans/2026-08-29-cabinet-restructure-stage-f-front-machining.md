# Cabinet restructure Stage F — front machining

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The machining a front implies — hinge cups in the door, hinge plate screws and drawer slide screws in the carcase — bored at the 32 mm system positions.

**Architecture:** One new pure module owns every figure and every row. It is asked per role, exactly as `carcaseHoleArrays` is, and joins the same `componentCuts` list in `regenerateOne`. Nothing else changes: no new parameter, no file-format bump, no UI.

**Tech Stack:** TypeScript strict, Vitest. One pure module, one wiring line.

**Spec:** `docs/superpowers/specs/2026-08-27-cabinet-assembly-restructure-design.md` (§ Machining)
**Notes:** `docs/superpowers/notes/2026-08-27-cabinet-assembly-restructure-notes.md`
**Preceded by:** Stage A (section tree), B (materials own thickness), C (screw joints), D (section interiors), E (fronts)

---

## Three findings, all verified against the shipped code

### 1. Most of this machining is not on the front

The spec says it in one line and it governs the whole module: **it owns the machining that fronts
imply, which is not the same as machining on fronts.** Of the three families, one lands on the door
and two land on the carcase:

| front kind | bored into the front | bored into the carcase |
|---|---|---|
| `door` | hinge cups, on its back face | hinge plate screws, in the upright on the hinged side |
| `drawer-front` | nothing | slide screws, in **both** flanking uprights |
| `false-front` | nothing | nothing — it is screwed to a drawer box that does not exist yet |
| `panel` | nothing | nothing — it is applied, not hung |

So the module is asked *per role* and answers for a side panel as readily as for a door. Writing it
as "given a front, what does it need" and then hanging the results on the front would put plate
screws on the door.

### 2. A door's board +Z is its back — in both mounts, for opposite reasons

Verified by running `composeWorldMatrix` over the emitted panels of a Base 600:

```
overlay: box y −18..0    board +Z → carcase y = 0     (the back)
inset:   box y 0..18     board +Z → carcase y = 18    (the back)
```

`orientedPanel` puts the board origin on the box's min corner and maps board z → carcase y, so the
*outward* face is board z = 0 in both cases and the back is board +Z. The carcase-space coordinate
differs (0 vs FT) while the board face does not.

A cup bored on the wrong face comes out through the front of the door. **Do not assert the letters
`'+Z'`** — that proves only that the table agrees with itself. Follow the face into carcase space
and require it to point *into* the cabinet (+y), the way `carcaseHoleArrays`' own face test does.

Board `+X` runs the door's height and board `+Y` its width, so a `hinge: 'left'` door is hinged at
board y = 0 and a `hinge: 'right'` one at board y = width.

### 3. A carcase side will carry three unrelated hole-array families

It already carries shelf-pin rows, keyed `holes_{role}_{sectionId}_{r}` — a key Stage D had to widen
after an id naming only the panel let one row silently replace another. Plate screws and slide
screws now join them on the same panel. Every id this module emits needs its own prefix **and**
enough of the front's identity to stay unique when a cabinet has two doors hinged at the same side
of two different bays.

## Figures: stated, not derived

Every number below is a **named constant in this module**, documented as a Blum-style 32 mm-system
value. They are *stated* — read off standard hardware, not computed from anything the app knows —
and the hardware model in a later design supersedes them. No vendor parameter is added now: a
hardware item will carry its own geometry, and a parameter added here would be orphaned then.

| constant | mm | what it is |
|---|---|---|
| `CUP_DIAMETER` | 35 | the boss on a concealed hinge |
| `CUP_DEPTH` | 12.5 | blind — deeper than an 18 mm door can take at 13+ |
| `CUP_EDGE_DISTANCE` | 22.5 | cup centre to the hinged edge |
| `HINGE_END_INSET` | 100 | first and last hinge, from each end of the door |
| `PLATE_SCREW_PITCH` | 32 | the system pitch; two screws per hinge plate |
| `PLATE_SCREW_SETBACK` | 37 | from the panel's front edge — the same 37 the pin rows use |
| `PLATE_SCREW_DIAMETER` | 5 | system screw |
| `PLATE_SCREW_DEPTH` | 12 | blind |
| `SLIDE_SCREW_PITCH` | 32 | a row along the runner |
| `SLIDE_SCREW_SETBACK` | 37 | from the front edge, matching the plate screws |

`hingeCount(height)` is a stated table too: **2** up to 900 mm, **3** to 1600, **4** to 2000, **5**
above. `CUP_DEPTH` at 12.5 into an 18 mm door leaves 5.5 mm — thin but standard; a door thinner than
`CUP_DEPTH + 3` should get **no cups at all** rather than a hole through it, and that is a guard, not
a rounding.

> **Before this ships, have someone who builds cabinets read that table.** Every figure is a claim
> about real hardware that no test in this repo can falsify: a wrong `CUP_EDGE_DISTANCE` produces a
> perfectly self-consistent cabinet that does not close.

---

## Commits by green boundary

The gate is a Claude Code `PreToolUse` hook running `pnpm typecheck`; `--no-verify` is inert.
**Never** edit `.claude/settings.json` or `.claude/hooks/`. Mutation-testing discipline — back the
file up and restore from the copy, never `git checkout` mid-group; grep after applying *and* after
restoring — is in `CLAUDE.md` and applies to every check below.

| commit | covers | why it is green |
|---|---|---|
| **A** | `frontMachining.ts` — the figures, `hingeCount`, and the three row builders | new module, no consumer |
| **B** | cups reach the door through `regenerateOne` | adds cuts to one role |
| **C** | plate and slide screws reach the carcase uprights | adds cuts to roles that already carry rows |
| **D** | close-out | |

**B and C are separate on purpose.** B puts bores on the front, C puts them on panels that already
carry two other families. A bore on the wrong panel is this stage's characteristic failure, and
mixing the two would make it ambiguous which half was wrong.

---

## Group A — the module

**Files:**
- Create: `src/scene/frontMachining.ts`
- Create: `src/scene/frontMachining.test.ts`

### A1 — the figures and the hinge count

- [ ] **Step 1: Write the failing test for `hingeCount`**

```ts
import { describe, expect, it } from 'vitest'
import { hingeCount, hingePositions, HINGE_END_INSET } from './frontMachining'

describe('hingeCount', () => {
  // A stated table, not a formula: read off standard hardware guidance. The boundaries are what a
  // test can hold still — a door of exactly 900 takes two, 901 takes three.
  it.each([
    [400, 2],
    [900, 2],
    [901, 3],
    [1600, 3],
    [1601, 4],
    [2000, 4],
    [2001, 5],
  ])('a %i mm door takes %i hinges', (height, expected) => {
    expect(hingeCount(height)).toBe(expected)
  })
})

describe('hingePositions', () => {
  // First and last a fixed inset from each end, the rest evenly spaced — which is what makes the
  // row expressible as one HoleArrayCut with a uniform pitch rather than as n separate cuts.
  it('insets the first and last and spaces the rest evenly', () => {
    const row = hingePositions(1000)
    expect(row.count).toBe(3)
    expect(row.first).toBeCloseTo(HINGE_END_INSET, 9)
    expect(row.first + row.pitch * (row.count - 1)).toBeCloseTo(1000 - HINGE_END_INSET, 9)
  })

  // Two hinges is one pitch, and the arithmetic must not divide by zero on the way there.
  it('handles the two-hinge case', () => {
    const row = hingePositions(600)
    expect(row.count).toBe(2)
    expect(row.pitch).toBeCloseTo(600 - 2 * HINGE_END_INSET, 9)
  })

  // A door shorter than two insets cannot hold the row as stated. Pulling the insets in is the only
  // alternative to boring off the end of the door.
  it('never runs a hinge off the end of a short door', () => {
    for (const height of [120, 180, 200, 250, 400, 900, 2400]) {
      const row = hingePositions(height)
      expect(row.first, `h=${height}`).toBeGreaterThanOrEqual(0)
      expect(row.first + row.pitch * (row.count - 1), `h=${height}`).toBeLessThanOrEqual(height)
      expect(row.pitch, `h=${height}`).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm vitest run src/scene/frontMachining.test.ts`
Expected: FAIL — `Failed to resolve import "./frontMachining"`.

- [ ] **Step 3: Write the figures and the two functions**

`src/scene/frontMachining.ts`, opening with the module comment the spec asks for:

```ts
// The machining a front implies — which is not the same as machining *on* fronts. A hinge cup is
// bored into the door, but the plate screws that carry it are bored into the carcase upright beside
// it, and a drawer's slide screws are bored into two uprights with nothing on the front at all. So
// this module is asked per *role*, like `carcaseHoleArrays`, and answers for a side panel as
// readily as for a door.
//
// Every figure below is a Blum-style 32 mm-system value, **stated rather than derived**: read off
// standard hardware, not computed from anything the app knows. The hardware model in a later design
// supersedes them, which is why no vendor parameter is added here — a hardware item will carry its
// own geometry, and a parameter now would be orphaned then.

export const CUP_DIAMETER = 35
export const CUP_DEPTH = 12.5
export const CUP_EDGE_DISTANCE = 22.5
export const HINGE_END_INSET = 100

export const PLATE_SCREW_PITCH = 32
export const PLATE_SCREW_SETBACK = 37
export const PLATE_SCREW_DIAMETER = 5
export const PLATE_SCREW_DEPTH = 12

export const SLIDE_SCREW_PITCH = 32
export const SLIDE_SCREW_SETBACK = 37

// A stated table, not a formula. Hardware guidance, held still so a test can pin the boundaries.
export function hingeCount(height: number): number {
  if (height <= 900) return 2
  if (height <= 1600) return 3
  if (height <= 2000) return 4
  return 5
}

export interface Row {
  first: number
  pitch: number
  count: number
}

// First and last a fixed inset from each end, the rest evenly spaced — which is what makes the row
// one `HoleArrayCut` with a uniform pitch rather than n separate cuts.
//
// A door shorter than two insets cannot hold that, so the inset shrinks to a quarter of the door
// rather than the row running off its end. That is a guard, not a rounding: a hinge bored past the
// edge is a hole in nothing.
export function hingePositions(height: number): Row {
  const count = hingeCount(height)
  const inset = Math.min(HINGE_END_INSET, height / 4)
  return { first: inset, pitch: (height - 2 * inset) / (count - 1), count }
}
```

- [ ] **Step 4: Run and confirm the tests pass**

- [ ] **Step 5: Mutation check — the short-door guard**

Back up first (`cp src/scene/frontMachining.ts "$SCRATCHPAD"/fm.bak`), then:

```python
p = 'src/scene/frontMachining.ts'
s = open(p).read()
old = "  const inset = Math.min(HINGE_END_INSET, height / 4)"
new = "  const inset = HINGE_END_INSET"
assert old in s, 'MUTATION DID NOT MATCH'
open(p, 'w').write(s.replace(old, new, 1))
```

Grep to confirm it applied. Expected: FAIL on *never runs a hinge off the end of a short door* — a
120 mm door gets a negative pitch. Restore from the backup, grep again.

### A2 — the rows, in board coordinates

Three builders, each returning `HoleArrayCut[]` given the panel and the front. They take a bare
`PanelDims` — length, width, thickness — rather than a `PanelSpec`, so the module needs no generator
import and the tests need no cabinet. The file's only imports are types:

```ts
import type { Face, HoleArrayCut } from './types'
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('cupRow', () => {
  const door = { length: 600, width: 400, thickness: 18 }

  it('bores the back of the door, never the front', () => {
    // Board +Z is the door's back in *both* mounts — `orientedPanel` maps board z to carcase y and
    // puts the origin on the box min corner, so the outward face is board z = 0 whether the box is
    // y ∈ [−FT, 0] or y ∈ [0, FT]. Asserted here as the board face; the carcase-space check that
    // it points into the cabinet lives in the generator test, where a cabinet exists.
    expect(cupRow(door, 'left', 'f-1')!.face).toBe('+Z')
  })

  it('measures the cup centre from the hinged edge', () => {
    expect(cupRow(door, 'left', 'f-1')!.start.y).toBeCloseTo(CUP_EDGE_DISTANCE, 9)
    expect(cupRow(door, 'right', 'f-1')!.start.y).toBeCloseTo(400 - CUP_EDGE_DISTANCE, 9)
  })

  it('runs the row along the door height at the hinge positions', () => {
    const row = cupRow(door, 'left', 'f-1')!
    const expected = hingePositions(600)
    expect(row.axis).toBe('U') // board x, which is the door's height
    expect(row.count).toBe(expected.count)
    expect(row.pitch).toBeCloseTo(expected.pitch, 9)
    expect(row.start.x).toBeCloseTo(expected.first, 9)
  })

  it('is a blind bore, never through', () => {
    const row = cupRow(door, 'left', 'f-1')!
    expect(row.depth).toBe(CUP_DEPTH)
    expect(row.depth).toBeLessThan(door.thickness)
    expect(row.diameter).toBe(CUP_DIAMETER)
  })

  // A cup is 12.5 deep. In a 14 mm door that leaves 1.5 mm of face, which is a hole waiting to
  // burst through — the same reasoning that clamps a screw's pilot depth in `screw.ts`.
  it('bores nothing into a door too thin to take a cup', () => {
    expect(cupRow({ ...door, thickness: 14 }, 'left', 'f-1')).toBeNull()
    expect(cupRow({ ...door, thickness: 16 }, 'left', 'f-1')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run, confirm failure, then implement**

```ts
// The minimum face a cup may leave behind it. A cup 12.5 mm into a 14 mm door leaves 1.5 mm, which
// is a hole waiting to burst through — the same reasoning that clamps a pilot in `screw.ts`.
const MIN_FACE_BEHIND_CUP = 3

export interface PanelDims {
  length: number
  width: number
  thickness: number
}

// The cup row on a door's back face. Board +X runs the door's height and board +Y its width, so a
// left-hinged door is hinged at board y = 0 and a right-hinged one at board y = width.
export function cupRow(
  panel: PanelDims,
  hinge: 'left' | 'right',
  frontRole: string,
): HoleArrayCut | null {
  if (panel.thickness < CUP_DEPTH + MIN_FACE_BEHIND_CUP) return null
  const row = hingePositions(panel.length)
  return {
    kind: 'hole-array',
    id: `cups_${frontRole}`,
    label: 'Hinge cups',
    face: '+Z',
    axis: 'U',
    start: {
      x: row.first,
      y: hinge === 'left' ? CUP_EDGE_DISTANCE : panel.width - CUP_EDGE_DISTANCE,
      z: panel.thickness,
    },
    pitch: row.pitch,
    count: row.count,
    diameter: CUP_DIAMETER,
    depth: CUP_DEPTH,
  }
}
```

`start.z` is `panel.thickness` because OCCT drills *from* `start` into the panel and `+Z` drills in
−z; that is the convention `carcaseHoleArrays` already follows for its `+Z` rows.

- [ ] **Step 3: Write the two carcase-side builders and their tests**

`plateScrewRows(panel, face, cupHeights, frontRole)` returns one two-hole row per hinge, and
`slideScrewRow(panel, face, height, frontRole)` returns one row along the depth. Both take the
*board* face the upright presents to the opening — `carcaseRoles.ts` already computes that as
`BOUND_FACE[side]`, and Group C passes it in rather than re-deriving it here.

An upright's board frame is `orientedPanel(box, 'x')`: board x runs the carcase depth, board y the
height. So both families run along **board x** (`axis: 'U'`) at a board y taken from the height, and
the setback is a board-x offset from the front edge.

```ts
export function plateScrewRows(
  panel: PanelDims,
  face: Face,
  cupHeights: number[],
  frontRole: string,
): HoleArrayCut[] {
  return cupHeights.map((y, i) => ({
    kind: 'hole-array',
    id: `plate_${frontRole}_${i}`,
    label: `Hinge plate ${i + 1}`,
    face,
    axis: 'U',
    start: { x: PLATE_SCREW_SETBACK, y, z: face === '+Z' ? panel.thickness : 0 },
    pitch: PLATE_SCREW_PITCH,
    count: 2,
    diameter: PLATE_SCREW_DIAMETER,
    depth: Math.min(PLATE_SCREW_DEPTH, (panel.thickness * 2) / 3),
  }))
}
```

and its sibling for a drawer, one row rather than one per hinge:

```ts
// A runner is screwed along the panel at one height. `count` follows the depth rather than being
// stated: a 560 mm cabinet takes more screws than a 300 mm one, and the row must not run off the
// back edge.
export function slideScrewRow(
  panel: PanelDims,
  face: Face,
  height: number,
  frontRole: string,
): HoleArrayCut {
  const runnable = panel.length - SLIDE_SCREW_SETBACK
  return {
    kind: 'hole-array',
    id: `slide_${frontRole}`,
    label: 'Drawer slide',
    face,
    axis: 'U',
    start: { x: SLIDE_SCREW_SETBACK, y: height, z: face === '+Z' ? panel.thickness : 0 },
    pitch: SLIDE_SCREW_PITCH,
    count: Math.max(2, Math.floor(runnable / SLIDE_SCREW_PITCH)),
    diameter: PLATE_SCREW_DIAMETER,
    depth: Math.min(PLATE_SCREW_DEPTH, (panel.thickness * 2) / 3),
  }
}
```

- [ ] **Step 4: Test both carcase-side builders**

```ts
describe('plateScrewRows', () => {
  const side = { length: 560, width: 720, thickness: 18 }

  it('gives each hinge its own two-screw row', () => {
    const rows = plateScrewRows(side, '+Z', [100, 400, 700], 'f-1')
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(r.count).toBe(2)
    expect(rows.map((r) => r.start.y)).toEqual([100, 400, 700])
  })

  // Three unrelated hole-array families share a carcase side. Stage D had to widen a key after one
  // row silently replaced another; this is the same guard one family further out.
  it('gives every row a distinct id', () => {
    const ids = plateScrewRows(side, '+Z', [100, 400, 700], 'f-1').map((r) => r.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('never bores through the panel', () => {
    for (const thickness of [12, 16, 18, 25]) {
      const [row] = plateScrewRows({ ...side, thickness }, '+Z', [100], 'f-1')
      expect(row.depth, `t=${thickness}`).toBeLessThan(thickness)
      expect(row.depth, `t=${thickness}`).toBeGreaterThan(0)
    }
  })

  // The row starts on the face OCCT drills from, which is the far side of the board for '+Z' and
  // the near side for '-Z' — the convention `carcaseHoleArrays` already follows.
  it('starts the row on the face it drills through', () => {
    expect(plateScrewRows(side, '+Z', [100], 'f-1')[0].start.z).toBe(18)
    expect(plateScrewRows(side, '-Z', [100], 'f-1')[0].start.z).toBe(0)
  })
})

describe('slideScrewRow', () => {
  it('runs along the depth from the front setback, and stays on the panel', () => {
    for (const length of [250, 300, 400, 560, 700]) {
      const row = slideScrewRow({ length, width: 720, thickness: 18 }, '+Z', 300, 'f-1')
      const last = row.start.x + row.pitch * (row.count - 1)
      expect(row.start.x, `d=${length}`).toBeCloseTo(SLIDE_SCREW_SETBACK, 9)
      expect(last, `d=${length}`).toBeLessThanOrEqual(length)
      expect(row.count, `d=${length}`).toBeGreaterThanOrEqual(2)
    }
  })
})
```

- [ ] **Step 5: Mutation check — the blind depth**

Substitute `depth: Math.min(PLATE_SCREW_DEPTH, (panel.thickness * 2) / 3),` →
`depth: PLATE_SCREW_DEPTH,` (twice: `plateScrewRows` and `slideScrewRow`, so assert a count of 2
rather than 1 in the replace). Expected: FAIL on *never bores through the panel* at thickness 12.
Restore from the backup and grep both sites.

- [ ] **Acceptance:** the full suite passes with its count unchanged apart from your additions. Nothing consumes this yet.

## Group B — cups reach the door

**Files:**
- Modify: `src/scene/carcaseRoles.ts` (a `carcaseMachining` entry point)
- Modify: `src/scene/regenerateComponents.ts` (one line in `componentCuts`)
- Test: `src/scene/carcaseRoles.test.ts`

### B1 — the entry point

`carcaseMachining(p, thicknessOf, kindOf, role)` mirrors `carcaseHoleArrays` exactly — same four
arguments, same "empty for a carcase that does not build" guard, same `carcaseRoles(...)` lookup for
the panel. It needs `kindOf` for the same reason `carcaseHoleArrays` does: an upright's position
depends on the joinery that seats it.

For a `front-` role it returns the cup row, if the cell's spec is a door and the panel is thick
enough. For everything else in Group B it returns `[]`.

- [ ] **Step 1: Add the test-file wrapper**

`carcaseRoles.test.ts` binds a thickness resolver and a joint-kind resolver for every entry point, so
the tests read as being about the layout. `carcaseMachining` needs the same two-argument wrapper
beside the others, or every call below is missing two arguments:

```ts
const carcaseMachining = (p: CarcaseParams, role: string) =>
  machiningOf(p, tOf(p), jointKindFor([], ''), role)
```

with `carcaseMachining as machiningOf` added to the import from `./carcaseRoles`, matching how
`carcaseHoleArrays as holeArraysOf` is already brought in.

- [ ] **Step 2: Write the failing tests in `carcaseRoles.test.ts`**

```ts
describe('front machining', () => {
  const DOOR = { kind: 'door', leaves: 1, hinge: 'left' } as const
  const doored = (over: Partial<CarcaseParams> = {}): CarcaseParams => ({
    ...base,
    ...over,
    section: { ...sec([], 0), front: DOOR },
  })
  const frontRole = (p: CarcaseParams) =>
    carcaseBoxes(p).find((b) => b.role.startsWith('front-'))!.role

  it('bores a cup row into the door and nothing into a bare opening', () => {
    const p = doored()
    expect(carcaseMachining(p, frontRole(p))).toHaveLength(1)
    const bare = { ...base, section: sec([], 0) }
    expect(carcaseBoxes(bare).filter((b) => b.role.startsWith('front-'))).toEqual([])
  })

  it('bores no cups into a drawer front, a false front or a panel', () => {
    for (const kind of ['drawer-front', 'false-front', 'panel'] as const) {
      const p: CarcaseParams = { ...base, section: { ...sec([], 0), front: { kind } } }
      expect(carcaseMachining(p, frontRole(p)), kind).toEqual([])
    }
  })

  // The self-check, the same shape as the pin-row face test: asserting the letters '+Z' would only
  // prove the table matches itself. The cup must open *into* the cabinet, and it must do so in both
  // mounts — where the board face is the same and the carcase-space coordinate is not.
  it.each(['overlay', 'inset'] as const)('opens the cup into the cabinet (%s)', (frontMount) => {
    const p = doored({ frontMount })
    const role = frontRole(p)
    const panel = carcaseRoles(p).find((r) => r.role === role)!.panel
    const [cup] = carcaseMachining(p, role)
    const dir = faceDirInCarcase(panel, cup.face)
    expect(dir.y).toBeGreaterThan(0) // into the cabinet, never out through the front
  })

  it('hinges a two-leaf pair at opposite edges', () => {
    const pair: CarcaseParams = {
      ...base,
      section: { ...sec([], 0), front: { kind: 'door', leaves: 2, hinge: 'left' } },
    }
    const roles = carcaseBoxes(pair)
      .filter((b) => b.role.startsWith('front-'))
      .map((b) => b.role)
    const [l, r] = roles.map((role) => {
      const panel = carcaseRoles(pair).find((x) => x.role === role)!.panel
      return { panel, cup: carcaseMachining(pair, role)[0] }
    })
    // One cup row near board y = 0, the other near board y = width: opposite edges of their leaves.
    expect(l.cup.start.y).toBeCloseTo(CUP_EDGE_DISTANCE, 9)
    expect(r.cup.start.y).toBeCloseTo(r.panel.width - CUP_EDGE_DISTANCE, 9)
  })
})
```

- [ ] **Step 3: Run, confirm failure, implement, run again**

- [ ] **Step 4: Wire it into `regenerateOne`**

```ts
    const componentCuts = [
      ...carcaseCuts(component.params, thicknessOf, r.role),
      ...carcaseHoleArrays(component.params, thicknessOf, kindOf, r.role),
      ...carcaseMachining(component.params, thicknessOf, kindOf, r.role),
    ].map((c) => ({ ...c, sourceComponentId: component.id }))
```

- [ ] **Step 5: A regeneration test in `regenerateComponents.test.ts`**

The cups must be component-owned and re-derived rather than accumulated, exactly as the pin rows
are — the same test the shelf-pin rows have, over the cup row.

- [ ] **Step 6: Mutation check — the wrong face**

Substitute, in `frontMachining.ts`, `    face: '+Z',` → `    face: '-Z',` inside `cupRow` — and
because `start.z` follows the face, `z: panel.thickness,` → `z: 0,` with it, or the mutation is
merely a hole in mid-air rather than a hole in the wrong face.

Expected: FAIL on *opens the cup into the cabinet* for **both** mounts. If only one fails, the test
is reading something mount-specific and must be fixed before you continue — that asymmetry is the
whole trap finding 2 describes. Restore from the backup, grep both substitutions.

- [ ] **Step 7: Full suite, e2e, commit**

Expect the shop-drawing tests to see new circles on the door's Face view. `drawing.test.ts` derives
its circles from the part's own cuts, so it should follow without editing; if a count moves, read it
before changing it.

## Group C — plate and slide screws reach the carcase

**Files:**
- Modify: `src/scene/carcaseRoles.ts`
- Test: `src/scene/carcaseRoles.test.ts`

`carcaseMachining` now answers for an upright too: which fronts does this panel flank, and what do
they need from it?

`boundsOf(sectionId)` gives the section's left and right bounds and `boundRole` turns a bound into a
role — both already used by `carcaseHoleArrays`, and both must be reused rather than copied.

- A **door**: plate screws in the upright on the hinged side only.
- A **drawer front**: slide screws in both flanking uprights.
- A two-leaf door: two leaves hinged at opposite edges, so *both* uprights take plate screws — one
  set each.

- [ ] **Step 1: Hoist `toCarcase` to module scope**

`carcaseRoles.test.ts:1604` defines `toCarcase` **inside** `describe('carcaseHoleArrays')`, so a
sibling block cannot reach it. The height-agreement test below needs it, and so will every later
test that compares two panels in carcase space. Move it up beside `faceDirInCarcase` at line 988 —
it is a pure helper over a `PanelSpec` with no dependency on that block:

```ts
function toCarcase(panel: PanelSpec, v: Vec3): Vec3 {
  const [x, y, z] = applyMatrixToPoint(composeWorldMatrix(boardOf(panel)), v.x, v.y, v.z)
  return { x, y, z }
}
```

`boardOf` is already at module scope (line 963), so only `toCarcase` moves. Run the suite after the
move and before writing anything new — a hoist that changed behaviour is a hoist that was wrong.

- [ ] **Step 2: Write the failing tests**

```ts
  // The mirror of the Stage D pin-row test, and the same defect it guards: a row bored into the
  // upright a door is not hinged on is a row of holes nothing will ever use.
  it('bores plate screws into the hinged side only', () => {
    const p = doored()
    expect(carcaseMachining(p, 'left-side').length).toBeGreaterThan(0)
    expect(carcaseMachining(p, 'right-side')).toEqual([])

    const other = doored({ section: { ...sec([], 0), front: { kind: 'door', leaves: 1, hinge: 'right' } } })
    expect(carcaseMachining(other, 'left-side')).toEqual([])
    expect(carcaseMachining(other, 'right-side').length).toBeGreaterThan(0)
  })

  it('bores slide screws into both uprights of a drawer section', () => {
    const p: CarcaseParams = { ...base, section: { ...sec([], 0), front: { kind: 'drawer-front' } } }
    expect(carcaseMachining(p, 'left-side')).toHaveLength(1)
    expect(carcaseMachining(p, 'right-side')).toHaveLength(1)
  })

  // A partition between a door bay and a drawer bay takes both families, on opposite faces — the
  // same inversion Stage D made for pin rows, one family further out.
  it('gives a partition the machining of each bay it flanks, on that bay’s face', () => {
    const divided: CarcaseParams = { ...base, section: sec([0.5], 0) }
    if (divided.section.content.kind !== 'split') throw new Error('fixture is not a split')
    const [leftBay, rightBay] = divided.section.content.children
    const p: CarcaseParams = {
      ...divided,
      section: {
        ...divided.section,
        content: {
          ...divided.section.content,
          children: [
            { ...leftBay, front: { kind: 'door', leaves: 1, hinge: 'right' } as const },
            { ...rightBay, front: { kind: 'drawer-front' } as const },
          ],
        },
      },
    }
    const partition = partitionRole(p)
    const rows = carcaseMachining(p, partition)
    // A plate row for the door on its left, a slide row for the drawer on its right.
    expect(rows.filter((c) => c.id.startsWith('plate_')).length).toBeGreaterThan(0)
    expect(rows.filter((c) => c.id.startsWith('slide_'))).toHaveLength(1)
    // …and the two families face opposite ways out of the same panel.
    const faces = new Set(rows.map((c) => c.face))
    expect(faces.size).toBe(2)
  })

  // Stage D widened a hole-array id after one row silently replaced another on the same panel. A
  // side now carries three unrelated families; this is the test that says so.
  it('never collides an id with the pin rows on the same panel', () => {
    const p = doored()
    for (const role of ['left-side', 'right-side']) {
      const ids = [
        ...carcaseHoleArrays(p, role).map((c) => c.id),
        ...carcaseMachining(p, role).map((c) => c.id),
      ]
      expect(new Set(ids).size, role).toBe(ids.length)
    }
  })

  // Swept, like the pin-row containment test: the interesting failures are a shallow cabinet whose
  // slide row runs off the back and a short door whose plate screws run off the top.
  it('puts every screw inside the panel it bores', () => {
    for (const depth of [250, 400, 560, 700]) {
      for (const height of [400, 720, 1200, 2100]) {
        const p = doored({ depth, height })
        for (const role of ['left-side', 'right-side']) {
          const panel = carcaseRoles(p).find((r) => r.role === role)!.panel
          for (const c of carcaseMachining(p, role)) {
            const where = `d=${depth} h=${height} ${role} ${c.id}`
            const last = c.start.x + c.pitch * (c.count - 1)
            expect(c.start.x, where).toBeGreaterThanOrEqual(0)
            expect(last, where).toBeLessThanOrEqual(panel.length)
            expect(c.start.y, where).toBeGreaterThanOrEqual(0)
            expect(c.start.y, where).toBeLessThanOrEqual(panel.width)
            expect(c.depth, where).toBeLessThan(panel.thickness)
          }
        }
      }
    }
  })

  // A plate screw carries the hinge whose cup is at that height. Two rows at different heights is a
  // door that will not hang. Compared in *carcase* space, exactly as the partition-pin test compares
  // a divider's pin heights against a side's — the two panels have different board frames and
  // different origins, so a board-space comparison would prove nothing.
  it('puts the plate screws at the same heights as the cups they carry', () => {
    const p = doored()
    const panelOf = (role: string) => carcaseRoles(p).find((r) => r.role === role)!.panel
    const doorRole = frontRole(p)

    const [cup] = carcaseMachining(p, doorRole)
    const door = panelOf(doorRole)
    const cupHeights = Array.from({ length: cup.count }, (_, i) =>
      toCarcase(door, { ...cup.start, x: cup.start.x + cup.pitch * i }).z,
    ).map((z) => z.toFixed(6))

    const side = panelOf('left-side')
    const plateHeights = carcaseMachining(p, 'left-side')
      .filter((c) => c.id.startsWith('plate_'))
      .map((c) => toCarcase(side, c.start).z.toFixed(6))

    expect(plateHeights).toHaveLength(cup.count)
    expect(plateHeights.sort()).toEqual(cupHeights.sort())
  })
```

- [ ] **Step 3: Implement, run, and mutation-check the hinge side**

Substitute the hinge-side test in `carcaseMachining` — whatever compares the cell's `hinge` against
the side this role bounds — for a constant `true`, so both uprights take plate screws. Expected:
FAIL on *bores plate screws into the hinged side only*, in both the left-hinged and right-hinged
halves of that test. Restore from the backup and grep.

- [ ] **Step 4: Mutation check — the cup/plate height agreement**

Substitute, in whatever `carcaseMachining` passes as `cupHeights`, the array `heights` for
`heights.map((h) => h + 10)`. Expected: FAIL on *puts the plate screws at the same heights as the
cups they carry*. This is the check that the two families are derived from **one** figure rather
than from two that happen to agree today — the same defect the Stage E contact rule had, where two
things that must match were asked separately. Restore from the backup and grep.

## Group D — close the stage

- [ ] `pnpm typecheck && pnpm lint && pnpm test`, exit codes read directly, **never piped through `tail`/`head`**
- [ ] `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:e2e` → 17 passed. Do **not** run `playwright install`. No part count moves — this stage adds cuts, not boards — so a moved count is a bug, not a re-baseline.
- [ ] Add a live-kernel assertion to `e2e/geom-kernel.spec.ts`: a ⌀35 cup is the largest bore the app makes, and the only one whose diameter is a meaningful fraction of the panel it goes into. The existing hole-array spec proves the kernel drills a pin row in the right place; extend it to prove a cup does too, and that a 12.5 mm blind bore leaves material behind it.
- [ ] `CLAUDE.md`: `frontMachining.ts` in the tree, and an invariant that the module owns the machining fronts *imply* — two of its three families land on the carcase, not the front.
- [ ] `node scripts/update-structure-html.mjs`, then the hand-written prose: the `src/scene/` table, the Features row, and the invariants table. The page was audited to Stage E; keep it there.
- [ ] Notes: the board +Z finding; the figures being stated rather than derived and needing a woodworker's eye; anything the ⌀35 bore turns up in the live kernel.

## Acceptance

- [ ] A door has a cup row on its **back**, verified by following the face into carcase space in **both** mounts
- [ ] Cups sit at the hinge positions, blind, and a door too thin for one gets none
- [ ] Plate screws land in the upright on the **hinged side only**, at the heights of the cups they carry
- [ ] A drawer front puts slide screws in **both** flanking uprights and nothing on itself
- [ ] A false front and a panel are machined nowhere
- [ ] No id collides with the pin rows already on the same panel
- [ ] Every bore lies inside its panel and short of its far face, across a swept range
- [ ] Every mutation check above was run and reported

## What Stage F deliberately does not do

- **No hardware BOM entries.** A hinge is a `HardwareItem` with a count and a cost; this stage bores
  the holes it needs and adds no items. Linking the two is the hardware model's job.
- **No drawer boxes.** A drawer front still has no box behind it, so the slide height comes off the
  front's own centreline. When boxes land, that height is expected to move — the spec says so, and
  the constant is named so there is one place for it to move.
- **No hinge or slide *parameters*.** Every figure is a constant. A vendor parameter added now would
  be orphaned by the hardware model that supersedes it.
- **No opening angle, no overlay adjustment, no cranking.** A cup is a cylinder; which hinge goes in
  it is a hardware question.
