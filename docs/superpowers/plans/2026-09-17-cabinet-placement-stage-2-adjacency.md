# Cabinet placement, stage 2: adjacency — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-14-cabinet-placement-design.md`
**Notes:** `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md` (shared with stage 1 — one notes file per topic)
**Stage 1 plan:** `docs/superpowers/plans/2026-09-14-cabinet-placement-stage-1-primitive.md`

**Goal:** Ship straight runs — derive runs from anchor chains, and give the job a plan view from
above where dragging a cabinet near a neighbour's side is what stores the anchor.

**Architecture:** Three pure modules and one interactive SVG. `carcaseWorldBounds.ts` states the
rotate-then-translate composition once so `resolvePlacement` and the plan view cannot disagree about
where a cabinet is. `runs.ts` derives runs from the anchor graph restricted to left/right links.
`dragAnchor.ts` inverts `anchoredPosition` to answer *what anchor would put the cabinet here*, as a
pure function with no DOM in it. `ui/PlanView.tsx` is the only piece that touches pointers, and it
follows `SectionElevation`'s precedent exactly: one interactive SVG over a coordinate flip written
in exactly one function.

**Tech stack:** React 19 + TypeScript strict, Vitest + happy-dom + @testing-library/react, inline
SVG (no canvas, no drag library).

**Baseline, measured on `a4bebd4` (main, with stage 1 merged):** 99 test files, **1988 passed**, 10
skipped. `pnpm typecheck && pnpm lint && pnpm test` all exit 0. Re-measure at the branch tip and
report the delta against *this* figure, taken from this branch's own merge-base — never against a
number quoted from memory, which is the mistake the driven-hardware spec recorded and stage 1
repeated.

---

## Decisions taken with the user (2026-09-17 session)

| # | Question | Decision |
|---|---|---|
| 1 | Stage 1 is unmerged — what does stage 2 build on? | **Merge PR #48 first**, branch from the updated `main` |
| 2 | What counts as one run? | **Left/right chains only** — a front/back anchor starts a new run |
| 3 | Where does the plan view live? | **Main pane, toggled** — viewport hidden via `display`, never unmounted |

Decision 2 is the load-bearing one. A kitchen run is one straight line against one wall, so an
L-shape is **two** runs meeting at a corner — which is precisely the pair stage 3's blind-width
check has to compare. Defining a run as "everything joined together" would leave stage 3 with one
run and nothing to check it against.

Decision 3 follows the invariant already in `CLAUDE.md`: *the viewport is hidden, never unmounted*.
`App` toggles `display` on the viewport wrapper; a plan view that replaced the viewport in the tree
would tear down the renderer, the camera and every mesh on each toggle.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/scene/carcaseWorldBounds.ts` | **create** | `worldBoundsOf(c, materials)` — the one statement of a cabinet's occupied box in its parent's frame |
| `src/scene/carcaseWorldBounds.test.ts` | **create** | Rotation + translation composition, and that it equals what `resolvePlacement` resolves |
| `src/scene/resolvePlacement.ts` | modify | Drop its private `boundsOf`; call `worldBoundsOf` |
| `src/scene/runs.ts` | **create** | `Run`, `runsOf(components)` — runs derived from left/right anchor links |
| `src/scene/runs.test.ts` | **create** | Chain order, face restriction, branch and cycle totality |
| `src/scene/dragAnchor.ts` | **create** | `SNAP_MM`, `anchorForDrop(...)` — inverts `anchoredPosition`; pure, no DOM |
| `src/scene/dragAnchor.test.ts` | **create** | Snap in/out, face choice, offset derivation, round-trip against `anchoredPosition` |
| `src/ui/PlanView.tsx` | **create** | The job from above: footprints, runs, selection, drag |
| `src/ui/PlanView.test.tsx` | **create** | Render, selection, and that a drop applies what `anchorForDrop` returned |
| `src/ui/FileMenu.tsx` | modify | The `3D | Plan` toggle |
| `src/App.tsx` | modify | Owns `mainView`, renders `PlanView`, applies drops through `onUpdateComponent` |
| `CLAUDE.md` | modify | The stage's invariants |
| `project-structure.html` | modify | Source tree + feature row |
| `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md` | modify | Stage 2 entries |

---

## Task 1: `worldBoundsOf` — one statement of where a cabinet is

`resolvePlacement.ts` composes `carcaseBounds` → `rotatedBounds` → `translatedBounds` inline. The
plan view needs the identical composition to draw a footprint. Two copies is how the drawing and the
resolution come to disagree, so it is extracted before either needs it — the same reason
`nearestCarcase.ts` exists.

**Files:**
- Create: `src/scene/carcaseWorldBounds.ts`
- Create: `src/scene/carcaseWorldBounds.test.ts`
- Modify: `src/scene/resolvePlacement.ts` (delete its private `boundsOf`, import the new one)

- [ ] **Step 1: Write the failing test**

```tsx
// src/scene/carcaseWorldBounds.test.ts
import { describe, it, expect } from 'vitest'
import { worldBoundsOf } from './carcaseWorldBounds'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent } from './types'

const cab = (over: Partial<CarcaseComponent> = {}): CarcaseComponent => ({
  kind: 'carcase',
  id: 'cmp_a',
  label: 'A',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
  ...over,
})

describe('worldBoundsOf', () => {
  it('is the cabinet occupied box when it sits at the origin unrotated', () => {
    const b = worldBoundsOf(cab(), PRESET_MATERIALS)
    expect(b.x0).toBe(0)
    expect(b.x1).toBe(CARCASE_PRESETS[0].params.width)
    expect(b.z0).toBe(0)
  })

  it('translates by the component position', () => {
    const at = worldBoundsOf(cab({ position: { x: 100, y: 20, z: 5 } }), PRESET_MATERIALS)
    const origin = worldBoundsOf(cab(), PRESET_MATERIALS)
    expect(at.x0).toBeCloseTo(origin.x0 + 100, 9)
    expect(at.x1).toBeCloseTo(origin.x1 + 100, 9)
    expect(at.y0).toBeCloseTo(origin.y0 + 20, 9)
    expect(at.z0).toBeCloseTo(origin.z0 + 5, 9)
  })

  // The asymmetric case: a 90° turn must swap the x and y EXTENTS, which a square-footprint
  // fixture could never show. Base 600 is 600 wide and ~560 deep, so the two differ.
  it('swaps the footprint extents on a quarter turn', () => {
    const flat = worldBoundsOf(cab(), PRESET_MATERIALS)
    const turned = worldBoundsOf(cab({ rotation: { x: 0, y: 0, z: Math.PI / 2 } }), PRESET_MATERIALS)
    expect(turned.x1 - turned.x0).toBeCloseTo(flat.y1 - flat.y0, 6)
    expect(turned.y1 - turned.y0).toBeCloseTo(flat.x1 - flat.x0, 6)
  })

  it('leaves the height alone on a quarter turn about z', () => {
    const flat = worldBoundsOf(cab(), PRESET_MATERIALS)
    const turned = worldBoundsOf(cab({ rotation: { x: 0, y: 0, z: Math.PI / 2 } }), PRESET_MATERIALS)
    expect(turned.z1 - turned.z0).toBeCloseTo(flat.z1 - flat.z0, 9)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/carcaseWorldBounds.test.ts`
Expected: FAIL — `Failed to resolve import "./carcaseWorldBounds"`.

- [ ] **Step 3: Write the module**

```ts
// src/scene/carcaseWorldBounds.ts
import type { CarcaseComponent, MaterialDef } from './types'
import { carcaseBounds, type Bounds3 } from './carcaseBounds'
import { rotatedBounds, translatedBounds } from './anchor'
import { roleThicknessFor, type PartOverrides } from './resolveThickness'

// Slots only. Overrides live on emitted parts and placement runs before they exist; see
// carcaseBounds for why reading them would make the pipeline a fixed-point iteration.
const NO_OVERRIDES = new Map<string, PartOverrides>()

// Where a cabinet's occupied box actually is, in its parent's frame: the cabinet's own bounds,
// rotated about its local origin, then translated by its position.
//
// Stated here rather than inline in `resolvePlacement` because the plan view draws the same box and
// `dragAnchor` measures against it. Three copies of a rotate-then-translate composition is how a
// cabinet comes to be drawn somewhere other than where it resolves.
export function worldBoundsOf(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): Bounds3 {
  const own = carcaseBounds(c.params, roleThicknessFor(c.params, materials, NO_OVERRIDES))
  return translatedBounds(rotatedBounds(own, c.rotation), c.position)
}

// The same box before translation — what `anchoredPosition` wants for the cabinet being placed,
// whose position is the very thing being solved for.
export function localRotatedBoundsOf(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): Bounds3 {
  const own = carcaseBounds(c.params, roleThicknessFor(c.params, materials, NO_OVERRIDES))
  return rotatedBounds(own, c.rotation)
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/scene/carcaseWorldBounds.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Point `resolvePlacement` at it**

In `src/scene/resolvePlacement.ts`: delete the local `NO_OVERRIDES` const and the `boundsOf`
function, drop the now-unused `carcaseBounds`, `roleThicknessFor` and `PartOverrides` imports
(`noUnusedLocals` will reject them), and import the two new helpers:

```ts
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'
```

Then rewrite the two call sites inside `positionOf`:

```ts
    const targetWorld = translatedBounds(
      localRotatedBoundsOf(target, scene.materials),
      positionOf(target),
    )
    const own = localRotatedBoundsOf(c, scene.materials)
```

`rotatedBounds` is no longer called directly here; keep `translatedBounds` imported from `./anchor`.
Note the target's world box is **not** `worldBoundsOf(target, …)` — it must be translated by the
*resolved* position, which is what the recursion is computing, not by `target.position`, which is
stale until the recursion writes it. Getting that wrong is a whole chain resolving against stale
positions, and it is caught by the existing `resolvePlacement` chain tests.

- [ ] **Step 6: Run the placement suites**

Run: `pnpm vitest run src/scene/resolvePlacement.test.ts src/scene/anchor.test.ts src/scene/carcaseBounds.test.ts src/scene/carcaseWorldBounds.test.ts`
Expected: PASS, all four files green, no change in counts except the +4 new.

- [ ] **Step 7: Commit**

```bash
git add src/scene/carcaseWorldBounds.ts src/scene/carcaseWorldBounds.test.ts src/scene/resolvePlacement.ts
git commit -m "refactor(scene): a cabinet's world box is stated once"
```

---

## Task 2: `runsOf` — runs derived from left/right links

**The rule, stated once:** a run is a maximal set of cabinets connected by **honoured left/right
anchors**, listed in geometric order. An anchor is honoured on the same terms `resolvePlacement`
honours it — a live carcase, not itself, same `parentId` — because a run made of anchors the
resolver ignores is a run that does not exist on screen.

Connectivity is **undirected**: `L` anchored to `T`'s left face and `R` anchored to `T`'s right face
is one run of three, not two runs of two. Direction says who moves when `T` moves; it does not say
what is in the line.

Order is **geometric, not topological** — the same choice `sectionOpenings` makes and for the same
reason. Sort by `x0`, then `y0`, of each member's world box, so a run assembled right-to-left and
one assembled left-to-right list the same cabinets in the same order. A walk from an endpoint would
be rotation-free but would have no defined answer when a user anchors three cabinets to one target;
sorting is total, which is the property `editSection.ts` insists on.

**Files:**
- Create: `src/scene/runs.ts`
- Create: `src/scene/runs.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/scene/runs.test.ts
import { describe, it, expect } from 'vitest'
import { runsOf } from './runs'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { resolvePlacement } from './resolvePlacement'
import type { Anchor, CarcaseComponent, Component, Scene } from './types'

// Asymmetric on purpose, for the reason panelThickness.test.ts exists: a run of identical Base
// 600s survives almost every wrong rule. These differ in width AND depth.
const widths = { a: 600, b: 450, c: 800, d: 300 }
const depths = { a: 560, b: 500, c: 600, d: 400 }

const cab = (
  id: 'a' | 'b' | 'c' | 'd',
  anchor?: Anchor,
): CarcaseComponent => ({
  kind: 'carcase',
  id: `cmp_${id}`,
  label: id.toUpperCase(),
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: { ...CARCASE_PRESETS[0].params, width: widths[id], depth: depths[id] },
  ...(anchor === undefined ? {} : { anchor }),
})

const to = (id: string, face: Anchor['face']): Anchor => ({
  to: `cmp_${id}`,
  face,
  gap: 0,
  offset: { u: 0, v: 0 },
})

const sceneOf = (components: Component[]): Scene =>
  resolvePlacement({
    parts: [],
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
    components,
  })

const runIds = (s: Scene) => runsOf(s.components, s.materials).map((r) => r.members)

describe('runsOf', () => {
  it('puts a right-anchored chain in one run, in geometric order', () => {
    const s = sceneOf([cab('a'), cab('b', to('a', 'right')), cab('c', to('b', 'right'))])
    expect(runIds(s)).toEqual([['cmp_a', 'cmp_b', 'cmp_c']])
  })

  it('reads a run the same whichever end it was built from', () => {
    // B anchored to A's LEFT, so B lands to the left of A: geometric order is B then A.
    const s = sceneOf([cab('a'), cab('b', to('a', 'left'))])
    expect(runIds(s)).toEqual([['cmp_b', 'cmp_a']])
  })

  it('joins a target with a neighbour on each side into one run of three', () => {
    const s = sceneOf([cab('a'), cab('b', to('a', 'left')), cab('c', to('a', 'right'))])
    expect(runIds(s)).toEqual([['cmp_b', 'cmp_a', 'cmp_c']])
  })

  it('starts a new run at a front anchor', () => {
    const s = sceneOf([cab('a'), cab('b', to('a', 'right')), cab('c', to('b', 'front'))])
    expect(runIds(s)).toEqual([['cmp_a', 'cmp_b'], ['cmp_c']])
  })

  it('gives a free-placed cabinet a run of its own', () => {
    const s = sceneOf([cab('a'), cab('b')])
    expect(runIds(s)).toHaveLength(2)
  })

  it('ignores an anchor naming a component that is not there', () => {
    const s = sceneOf([cab('a', to('missing', 'right'))])
    expect(runIds(s)).toEqual([['cmp_a']])
  })

  it('ignores an anchor across a parent boundary', () => {
    const outside: CarcaseComponent = { ...cab('b', to('a', 'right')), parentId: 'cmp_group' }
    const s = sceneOf([cab('a'), outside])
    expect(runIds(s)).toEqual([['cmp_a'], ['cmp_b']])
  })

  it('terminates on a cycle rather than looping forever', () => {
    // resolvePlacement detaches both members of a 2-cycle, so what reaches runsOf is two free
    // cabinets — but runsOf must be total on the raw input too, which this asserts directly.
    const raw = [cab('a', to('b', 'right')), cab('b', to('a', 'right'))]
    expect(runsOf(raw, PRESET_MATERIALS).flatMap((r) => r.members).sort()).toEqual([
      'cmp_a',
      'cmp_b',
    ])
  })

  it('lists every carcase exactly once across all runs', () => {
    const s = sceneOf([cab('a'), cab('b', to('a', 'right')), cab('c'), cab('d', to('c', 'left'))])
    const all = runIds(s).flat()
    expect(all).toHaveLength(4)
    expect(new Set(all).size).toBe(4)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/runs.test.ts`
Expected: FAIL — `Failed to resolve import "./runs"`.

- [ ] **Step 3: Write the module**

```ts
// src/scene/runs.ts
import type { CarcaseComponent, Component, ComponentId, MaterialDef } from './types'
import { worldBoundsOf } from './carcaseWorldBounds'

export interface Run {
  // Every cabinet in the run, in geometric order: left to right, then front to back.
  members: ComponentId[]
}

// A run is a straight line of cabinets against one wall, so only a LEFT or RIGHT anchor continues
// one. A front or back anchor is how a return run meets a corner — it starts a new run, which is
// what gives stage 3's blind-width check two runs to compare rather than one L-shaped one.
const CONTINUES_A_RUN = new Set<string>(['left', 'right'])

export function runsOf(components: Component[], materials: Record<string, MaterialDef>): Run[] {
  const carcases = new Map<ComponentId, CarcaseComponent>()
  for (const c of components) if (c.kind === 'carcase') carcases.set(c.id, c)

  // Undirected: direction says who moves when the target moves, not what is in the line. A cabinet
  // on each side of one target is one run of three.
  const neighbours = new Map<ComponentId, Set<ComponentId>>()
  for (const id of carcases.keys()) neighbours.set(id, new Set())
  for (const c of carcases.values()) {
    const a = c.anchor
    if (a === undefined || !CONTINUES_A_RUN.has(a.face)) continue
    const t = carcases.get(a.to)
    // Honoured on exactly resolvePlacement's terms. A run built from anchors the resolver ignores
    // is a run that is not on screen.
    if (t === undefined || t.id === c.id || t.parentId !== c.parentId) continue
    neighbours.get(c.id)?.add(t.id)
    neighbours.get(t.id)?.add(c.id)
  }

  // Geometric order, the same choice sectionOpenings makes: a run assembled right-to-left and one
  // assembled left-to-right must read identically, which topological order cannot promise.
  const origin = new Map<ComponentId, { x: number; y: number }>()
  for (const c of carcases.values()) {
    const b = worldBoundsOf(c, materials)
    origin.set(c.id, { x: b.x0, y: b.y0 })
  }
  const before = (l: ComponentId, r: ComponentId): number => {
    const a = origin.get(l)
    const b = origin.get(r)
    if (a === undefined || b === undefined) return 0
    return a.x !== b.x ? a.x - b.x : a.y - b.y
  }

  const seen = new Set<ComponentId>()
  const runs: Run[] = []
  // Iterating `components` rather than the map keeps run ORDER stable against the scene's own
  // component order, the way the hardware BOM's rows are.
  for (const c of components) {
    if (c.kind !== 'carcase' || seen.has(c.id)) continue
    const members: ComponentId[] = []
    const stack = [c.id]
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || seen.has(id)) continue
      seen.add(id)
      members.push(id)
      for (const n of neighbours.get(id) ?? []) if (!seen.has(n)) stack.push(n)
    }
    runs.push({ members: members.sort(before) })
  }
  return runs
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/scene/runs.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/runs.ts src/scene/runs.test.ts
git commit -m "feat(scene): runs derived from left and right anchor links"
```

---

## Task 3: `dragAnchor` — what anchor would put the cabinet here

The gesture that places a cabinet is the gesture that stores the relationship, so the drop has to
answer a question in anchor terms. That answer is arithmetic, and arithmetic does not belong in a
pointer handler: it lives here, pure, and the plan view calls it.

**The rule.** For a proposed world position, consider every honoured target and each of its four
faces. Invert `anchoredPosition` for `gap = 0`: the face fixes the dragged cabinet's coordinate on
the face's normal axis, and the two in-plane offsets are read straight off the proposed position. If
the normal-axis distance is within `SNAP_MM`, the face is a candidate; the nearest candidate wins.
In-plane offsets **snap to flush** when they are themselves within `SNAP_MM` of zero, because
front-flush and floor-flush is decision 7's default and the overwhelmingly common case — but they
otherwise keep exactly what the user dragged, so a deliberate reveal survives the drop.

**Files:**
- Create: `src/scene/dragAnchor.ts`
- Create: `src/scene/dragAnchor.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/scene/dragAnchor.test.ts
import { describe, it, expect } from 'vitest'
import { SNAP_MM, anchorForDrop } from './dragAnchor'
import { anchoredPosition } from './anchor'
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent } from './types'

const cab = (id: string, over: Partial<CarcaseComponent> = {}): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
  ...over,
})

const W = CARCASE_PRESETS[0].params.width
const target = cab('cmp_t')
const dragged = cab('cmp_d')

describe('anchorForDrop', () => {
  it('anchors to the right face when dropped just past it', () => {
    const drop = { x: W + 3, y: 0, z: 0 }
    const r = anchorForDrop(dragged, drop, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.to).toBe('cmp_t')
    expect(r.anchor.face).toBe('right')
  })

  it('anchors to the left face when dropped just short of it', () => {
    const drop = { x: -W - 4, y: 0, z: 0 }
    const r = anchorForDrop(dragged, drop, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.face).toBe('left')
  })

  it('stays free when dropped beyond the snap distance', () => {
    const drop = { x: W + SNAP_MM + 1, y: 0, z: 0 }
    const r = anchorForDrop(dragged, drop, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
    if (r.kind !== 'free') return
    expect(r.position).toEqual(drop)
  })

  // The round trip is the real assertion: whatever anchor comes back, feeding it to
  // anchoredPosition must land the cabinet where the drop asked, to within the snap it applied.
  it('returns an anchor that resolves back to the drop position', () => {
    const drop = { x: W + 2, y: 0, z: 0 }
    const r = anchorForDrop(dragged, drop, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    const back = anchoredPosition(
      r.anchor,
      worldBoundsOf(target, PRESET_MATERIALS),
      localRotatedBoundsOf(dragged, PRESET_MATERIALS),
    )
    expect(back.x).toBeCloseTo(W, 6)
    expect(back.y).toBeCloseTo(0, 6)
  })

  it('snaps a near-flush depth offset to flush', () => {
    const drop = { x: W + 2, y: 3, z: 0 }
    const r = anchorForDrop(dragged, drop, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.offset.u).toBe(0)
  })

  it('keeps a deliberate offset that is past the snap', () => {
    const drop = { x: W + 2, y: SNAP_MM + 40, z: 0 }
    const r = anchorForDrop(dragged, drop, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.offset.u).toBeCloseTo(SNAP_MM + 40, 6)
  })

  it('never anchors a cabinet to itself', () => {
    const r = anchorForDrop(dragged, { x: 2, y: 0, z: 0 }, [dragged], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
  })

  it('ignores a candidate in another parent frame', () => {
    const elsewhere = cab('cmp_t', { parentId: 'cmp_group' })
    const r = anchorForDrop(dragged, { x: W + 2, y: 0, z: 0 }, [elsewhere], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
  })

  it('takes the nearer of two candidate faces', () => {
    const right = cab('cmp_r', { position: { x: W, y: 0, z: 0 } })
    // Dropped 2 mm short of cmp_r's left face and 1 mm past cmp_t's right face — both within the
    // snap, and the second is nearer.
    const r = anchorForDrop(dragged, { x: W + 1, y: 0, z: 0 }, [target, right], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.to).toBe('cmp_t')
    expect(r.anchor.face).toBe('right')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/dragAnchor.test.ts`
Expected: FAIL — `Failed to resolve import "./dragAnchor"`.

- [ ] **Step 3: Write the module**

```ts
// src/scene/dragAnchor.ts
import type { Anchor, CarcaseComponent, MaterialDef, Vec3 } from './types'
import type { Bounds3 } from './carcaseBounds'
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'

// How near a face a drop has to land before it becomes a relationship rather than a position.
// One figure, used for the normal axis and for the flush-offset snap alike.
export const SNAP_MM = 60

type Axis = 'x' | 'y' | 'z'

// The same table anchor.ts states; imported rather than re-derived would be better, but it is not
// exported there and widening that module's surface for this is the larger change. If a third
// reader appears, export it from anchor.ts and delete this.
const FACE_NORMAL: Record<Anchor['face'], { axis: Axis; positive: boolean }> = {
  left: { axis: 'x', positive: false },
  right: { axis: 'x', positive: true },
  front: { axis: 'y', positive: false },
  back: { axis: 'y', positive: true },
}

const IN_PLANE: Record<Axis, [Axis, Axis]> = {
  x: ['y', 'z'],
  y: ['x', 'z'],
  z: ['x', 'y'],
}

const lo = (b: Bounds3, a: Axis): number => (a === 'x' ? b.x0 : a === 'y' ? b.y0 : b.z0)
const hi = (b: Bounds3, a: Axis): number => (a === 'x' ? b.x1 : a === 'y' ? b.y1 : b.z1)

export type Drop =
  | { kind: 'anchor'; anchor: Anchor }
  | { kind: 'free'; position: Vec3 }

// Flush is decision 7's default and the common case, so a near-flush drag becomes exactly flush.
// Past the snap the dragged figure survives untouched, which is what lets a deliberate reveal be
// dragged in rather than typed.
const flush = (v: number): number => (Math.abs(v) <= SNAP_MM ? 0 : v)

// What anchor, if any, would put `dragged` at `drop`.
//
// Inverts `anchoredPosition` at gap 0: the face fixes the dragged cabinet on the normal axis, and
// the two in-plane offsets are read off the drop. Candidates are ranked by how far the drop is from
// the face on that normal axis alone — the in-plane axes are where the user is free to slide, so
// counting them would let a cabinet dragged far along a face lose to a nearer but wrong one.
export function anchorForDrop(
  dragged: CarcaseComponent,
  drop: Vec3,
  candidates: CarcaseComponent[],
  materials: Record<string, MaterialDef>,
): Drop {
  const own = localRotatedBoundsOf(dragged, materials)

  let best: { anchor: Anchor; distance: number } | undefined
  for (const t of candidates) {
    // Exactly resolvePlacement's honouring rule: offering a target it would silently undo is
    // offering a relationship that does not survive the next pipeline run.
    if (t.id === dragged.id || t.parentId !== dragged.parentId) continue
    const target = worldBoundsOf(t, materials)

    for (const face of ['left', 'right', 'front', 'back'] as const) {
      const { axis, positive } = FACE_NORMAL[face]
      const [u, v] = IN_PLANE[axis]
      const snapped = positive
        ? hi(target, axis) - lo(own, axis)
        : lo(target, axis) - hi(own, axis)
      const distance = Math.abs(drop[axis] - snapped)
      if (distance > SNAP_MM) continue
      if (best !== undefined && distance >= best.distance) continue
      best = {
        distance,
        anchor: {
          to: t.id,
          face,
          gap: 0,
          offset: {
            u: flush(drop[u] + lo(own, u) - lo(target, u)),
            v: flush(drop[v] + lo(own, v) - lo(target, v)),
          },
        },
      }
    }
  }

  return best === undefined ? { kind: 'free', position: drop } : { kind: 'anchor', anchor: best.anchor }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/scene/dragAnchor.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/dragAnchor.ts src/scene/dragAnchor.test.ts
git commit -m "feat(scene): a drop answers in anchor terms"
```

---

## Task 4: `PlanView` renders the job from above

**Files:**
- Create: `src/ui/PlanView.tsx`
- Create: `src/ui/PlanView.test.tsx`

The coordinate flip: world x runs right and world y runs from the cabinet fronts backwards, but a
plan seen from above puts *back* at the top of the screen. SVG y runs down. So screen y is
`yMax − worldY`, and — exactly as `SectionElevation`'s `toSvg` does for z — that subtraction is
written in **one** function. Two copies would eventually disagree, and a job flipped front-to-back
looks entirely plausible until one cabinet is deeper than its neighbour.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/PlanView.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanView } from './PlanView'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { resolvePlacement } from '../scene/resolvePlacement'
import type { Anchor, CarcaseComponent, Component, Scene } from '../scene/types'

const cab = (id: string, width: number, depth: number, anchor?: Anchor): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: { ...CARCASE_PRESETS[0].params, width, depth },
  ...(anchor === undefined ? {} : { anchor }),
})

const sceneOf = (components: Component[]): Scene =>
  resolvePlacement({
    parts: [],
    materials: PRESET_MATERIALS,
    hardware: [],
    joints: [],
    components,
  })

// Deliberately lopsided: a 450 beside a 600 is what makes an upside-down or mirrored plan visible.
const twoInARun = () =>
  sceneOf([
    cab('cmp_a', 600, 560),
    cab('cmp_b', 450, 500, { to: 'cmp_a', face: 'right', gap: 0, offset: { u: 0, v: 0 } }),
  ])

const draw = (scene: Scene, selected: string | null = null, onSelect = vi.fn(), onDrop = vi.fn()) => {
  render(
    <PlanView
      scene={scene}
      selectedId={selected}
      onSelect={onSelect}
      onDrop={onDrop}
    />,
  )
  return { onSelect, onDrop }
}

describe('PlanView', () => {
  afterEach(cleanup)

  it('draws one footprint per cabinet', () => {
    draw(twoInARun())
    expect(screen.getAllByTestId(/^plan-cabinet-/)).toHaveLength(2)
  })

  it('selects the cabinet a footprint stands for', async () => {
    const { onSelect } = draw(twoInARun())
    await userEvent.click(screen.getByTestId('plan-cabinet-cmp_b'))
    expect(onSelect).toHaveBeenCalledWith('cmp_b')
  })

  it('marks the selected footprint and no other', () => {
    draw(twoInARun(), 'cmp_b')
    const marked = screen
      .getAllByTestId(/^plan-cabinet-/)
      .filter((c) => c.getAttribute('data-selected') === 'true')
    expect(marked).toHaveLength(1)
    expect(marked[0].getAttribute('data-testid')).toBe('plan-cabinet-cmp_b')
  })

  it('sizes a footprint by width across and depth down', () => {
    draw(twoInARun())
    const a = screen.getByTestId('plan-cabinet-cmp_a')
    expect(Number(a.getAttribute('width'))).toBeCloseTo(600, 6)
    // Base 600 has an applied back, so the occupied depth exceeds the nominal 560.
    expect(Number(a.getAttribute('height'))).toBeGreaterThan(560)
  })

  it('puts the right-anchored neighbour to the right on screen', () => {
    draw(twoInARun())
    const a = screen.getByTestId('plan-cabinet-cmp_a')
    const b = screen.getByTestId('plan-cabinet-cmp_b')
    expect(Number(b.getAttribute('x'))).toBeGreaterThan(Number(a.getAttribute('x')))
  })

  // The flip, pinned on an ASYMMETRIC pair: a deeper cabinet's front edge is the same line as a
  // shallower one's when both are front-flush, so it must reach FURTHER UP the screen, not down.
  it('draws a deeper cabinet reaching further up the screen', () => {
    draw(twoInARun())
    const a = screen.getByTestId('plan-cabinet-cmp_a') // 560 deep
    const b = screen.getByTestId('plan-cabinet-cmp_b') // 500 deep
    expect(Number(a.getAttribute('y'))).toBeLessThan(Number(b.getAttribute('y')))
  })

  it('groups a run under one label', () => {
    draw(twoInARun())
    expect(screen.getAllByTestId(/^plan-run-/)).toHaveLength(1)
  })

  it('draws a run per free-placed cabinet', () => {
    draw(sceneOf([cab('cmp_a', 600, 560), cab('cmp_b', 450, 500)]))
    expect(screen.getAllByTestId(/^plan-run-/)).toHaveLength(2)
  })

  it('says so when the job has no cabinets', () => {
    draw(sceneOf([]))
    expect(screen.getByText(/no cabinets/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/ui/PlanView.test.tsx`
Expected: FAIL — `Failed to resolve import "./PlanView"`.

- [ ] **Step 3: Write the component**

```tsx
// src/ui/PlanView.tsx
import { useMemo } from 'react'
import type { CarcaseComponent, ComponentId, Scene, Vec3 } from '../scene/types'
import { worldBoundsOf } from '../scene/carcaseWorldBounds'
import { runsOf } from '../scene/runs'

// The whole job seen from above. The second interactive SVG in the codebase, and it follows the
// first (`SectionElevation`) deliberately: React elements rather than an SVG string, because every
// footprint needs a pointer handler.
//
// World y runs from the cabinet fronts backwards and SVG y runs down, so a plan seen from above
// subtracts. That happens in `toSvg` and nowhere else — the same rule, and the same reason, as
// SectionElevation's z flip.

const PADDING = 200

export function PlanView({
  scene,
  selectedId,
  onSelect,
  onDrop,
}: {
  scene: Scene
  selectedId: ComponentId | null
  onSelect: (id: ComponentId) => void
  onDrop: (id: ComponentId, position: Vec3) => void
}) {
  const carcases = useMemo(
    () => scene.components.filter((c): c is CarcaseComponent => c.kind === 'carcase'),
    [scene.components],
  )

  const boxes = useMemo(
    () => carcases.map((c) => ({ c, b: worldBoundsOf(c, scene.materials) })),
    [carcases, scene.materials],
  )

  const runs = useMemo(() => runsOf(scene.components, scene.materials), [scene.components, scene.materials])

  if (boxes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[11px] text-muted-foreground">
          This job has no cabinets yet, so there is no plan to draw.
        </p>
      </div>
    )
  }

  const xMin = Math.min(...boxes.map(({ b }) => b.x0))
  const xMax = Math.max(...boxes.map(({ b }) => b.x1))
  const yMin = Math.min(...boxes.map(({ b }) => b.y0))
  const yMax = Math.max(...boxes.map(({ b }) => b.y1))

  // The one place world space becomes screen space. World y is measured back from the fronts and
  // SVG y down from the top, so the far edge is subtracted rather than scaled.
  const toSvg = (x0: number, y0: number, y1: number) => ({
    x: x0 - xMin + PADDING,
    y: yMax - y1 + PADDING,
    height: y1 - y0,
  })

  const width = xMax - xMin + PADDING * 2
  const height = yMax - yMin + PADDING * 2

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-muted/30">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Plan view"
        className="w-full h-full max-h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {runs.map((run, i) => {
          const mine = boxes.filter(({ c }) => run.members.includes(c.id))
          if (mine.length === 0) return null
          const rx0 = Math.min(...mine.map(({ b }) => b.x0))
          const rx1 = Math.max(...mine.map(({ b }) => b.x1))
          const ry0 = Math.min(...mine.map(({ b }) => b.y0))
          const ry1 = Math.max(...mine.map(({ b }) => b.y1))
          const { x, y, height: h } = toSvg(rx0, ry0, ry1)
          return (
            <rect
              key={run.members.join('-')}
              data-testid={`plan-run-${i}`}
              x={x - 20}
              y={y - 20}
              width={rx1 - rx0 + 40}
              height={h + 40}
              className="fill-none stroke-muted-foreground/40"
              strokeWidth={4}
              strokeDasharray="16 12"
            />
          )
        })}

        {boxes.map(({ c, b }) => {
          const { x, y, height: h } = toSvg(b.x0, b.y0, b.y1)
          const isSelected = c.id === selectedId
          const anchored = c.anchor !== undefined
          return (
            <g key={c.id}>
              <rect
                data-testid={`plan-cabinet-${c.id}`}
                data-selected={isSelected}
                data-anchored={anchored}
                x={x}
                y={y}
                width={b.x1 - b.x0}
                height={h}
                className={
                  isSelected
                    ? 'fill-primary/25 stroke-primary cursor-pointer'
                    : 'fill-background stroke-border cursor-pointer hover:fill-accent'
                }
                strokeWidth={isSelected ? 8 : 3}
                onClick={() => onSelect(c.id)}
              />
              {/* pointer-events-none keeps the label from swallowing the click that selects the
                  footprint it sits on — the same trap SectionElevation's cell numbers hit. */}
              <text
                x={x + (b.x1 - b.x0) / 2}
                y={y + h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground pointer-events-none"
                fontSize={Math.min(b.x1 - b.x0, h) / 5}
              >
                {c.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
```

`onDrop` is declared now and wired in Task 5, so `App` gets one stable prop shape across both tasks.
`noUnusedParameters` is on for function parameters, not destructured props, so this compiles — if
lint objects, keep the prop and add the handler in Task 5 rather than removing it here.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/ui/PlanView.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/PlanView.tsx src/ui/PlanView.test.tsx
git commit -m "feat(ui): the job seen from above"
```

---

## Task 5: drag a footprint, drop an anchor

Pointer handling in an SVG under happy-dom is the one part of this stage a unit test cannot see
honestly: happy-dom reports a zero-sized `getBoundingClientRect`, so screen-to-world arithmetic is
degenerate there. The design answer is that **no arithmetic that matters lives in the handler** —
`anchorForDrop` already owns it and is tested directly against real millimetres. The handler's own
job is only to convert pointer deltas to world millimetres and hand them over, and the test mocks
the rect so that conversion is exercised at a known scale.

**Files:**
- Modify: `src/ui/PlanView.tsx`
- Modify: `src/ui/PlanView.test.tsx`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe`

```tsx
  it('applies the anchor a drop lands on', async () => {
    const scene = twoInARun()
    const onDrop = vi.fn()
    render(
      <PlanView scene={scene} selectedId={null} onSelect={vi.fn()} onDrop={onDrop} />,
    )
    const svg = screen.getByRole('img', { name: 'Plan view' })
    // happy-dom gives every element a zero rect, so the component cannot know its own scale.
    // Pin one: 1 client pixel == 1 mm.
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 1450, height: 1000, top: 0, left: 0, right: 1450, bottom: 1000,
      toJSON: () => ({}),
    } as DOMRect)

    const b = screen.getByTestId('plan-cabinet-cmp_b')
    b.dispatchEvent(new PointerEvent('pointerdown', { clientX: 700, clientY: 100, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 100, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 900, clientY: 100, bubbles: true }))

    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop.mock.calls[0][0]).toBe('cmp_b')
  })

  it('does not report a drop for a click that never moved', async () => {
    const scene = twoInARun()
    const onDrop = vi.fn()
    const onSelect = vi.fn()
    render(<PlanView scene={scene} selectedId={null} onSelect={onSelect} onDrop={onDrop} />)
    const b = screen.getByTestId('plan-cabinet-cmp_b')
    b.dispatchEvent(new PointerEvent('pointerdown', { clientX: 700, clientY: 100, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 700, clientY: 100, bubbles: true }))
    expect(onDrop).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/ui/PlanView.test.tsx -t "applies the anchor"`
Expected: FAIL — `onDrop` called 0 times.

- [ ] **Step 3: Add the drag**

Add to the imports in `src/ui/PlanView.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
```

Add a ref for the SVG and drag state, immediately before the `if (boxes.length === 0)` guard — note
hooks must run unconditionally, so they go **above** that early return:

```tsx
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: ComponentId; from: Vec3; dx: number; dy: number } | null>(
    null,
  )
  const dragRef = useRef(drag)
  dragRef.current = drag

  // Pointer deltas are in client pixels; everything else here is millimetres. The viewBox maps
  // `width` mm across `rect.width` px, so one pixel is `width / rect.width` mm — and the y delta
  // flips sign on the way back out, for the same reason `toSvg` subtracts.
  useEffect(() => {
    if (drag === null) return
    const scale = () => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (rect === undefined || rect.width === 0) return 0
      return spanRef.current / rect.width
    }
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (d === null) return
      const mm = scale()
      setDrag({ ...d, dx: (e.clientX - d.from.x) * mm, dy: -(e.clientY - d.from.y) * mm })
    }
    const up = () => {
      const d = dragRef.current
      setDrag(null)
      if (d === null || (d.dx === 0 && d.dy === 0)) return
      const c = carcases.find((k) => k.id === d.id)
      if (c === undefined) return
      onDrop(d.id, { x: c.position.x + d.dx, y: c.position.y + d.dy, z: c.position.z })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [drag, carcases, onDrop])
```

`spanRef` carries the viewBox width across the effect without re-subscribing on every geometry
change; declare it beside `svgRef` and assign it where `width` is computed:

```tsx
  const spanRef = useRef(1)
```

and after `const width = xMax - xMin + PADDING * 2`:

```tsx
  spanRef.current = width
```

Put `ref={svgRef}` on the `<svg>` element, and on each footprint `<rect>` replace the bare
`onClick` with both handlers:

```tsx
                onClick={() => onSelect(c.id)}
                onPointerDown={(e) =>
                  setDrag({
                    id: c.id,
                    from: { x: e.clientX, y: e.clientY, z: 0 },
                    dx: 0,
                    dy: 0,
                  })
                }
```

Finally, offset the dragged footprint while the drag is live so the user sees it follow — add to the
`const { x, y, height: h } = toSvg(...)` destructure site:

```tsx
          const live = drag !== null && drag.id === c.id
          const ox = live ? drag.dx : 0
          const oy = live ? -drag.dy : 0
```

and use `x={x + ox}` / `y={y + oy}` on the rect and `x={x + ox + …}` / `y={y + oy + …}` on the text.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/ui/PlanView.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/PlanView.tsx src/ui/PlanView.test.tsx
git commit -m "feat(ui): drag a cabinet in the plan view"
```

---

## Task 6: App wires the drop to the scene, and the toggle to the pane

**Files:**
- Modify: `src/ui/FileMenu.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to the App-level test file:

```tsx
  it('shows the plan view without unmounting the viewport', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /plan/i }))
    expect(screen.getByRole('img', { name: 'Plan view' })).toBeTruthy()
    // The canvas is hidden, never torn down — the same rule the cabinet tabs follow.
    expect(document.querySelector('canvas')).toBeTruthy()
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/App.test.tsx -t "plan view"`
Expected: FAIL — no button named `plan`.

- [ ] **Step 3: Add the toggle to `FileMenu`**

Add two props to the `FileMenu` signature and its prop type:

```tsx
  mainView: 'model' | 'plan'
  onMainViewChange: (v: 'model' | 'plan') => void
```

and render the pair beside the existing buttons:

```tsx
      <Button
        size="sm"
        variant={mainView === 'model' ? 'secondary' : 'ghost'}
        onClick={() => onMainViewChange('model')}
      >
        3D
      </Button>
      <Button
        size="sm"
        variant={mainView === 'plan' ? 'secondary' : 'ghost'}
        onClick={() => onMainViewChange('plan')}
      >
        Plan
      </Button>
```

- [ ] **Step 4: Hold the state and apply the drop in `App`**

Add the state beside the other view state:

```tsx
  const [mainView, setMainView] = useState<'model' | 'plan'>('model')
```

Pass `mainView={mainView}` and `onMainViewChange={setMainView}` to `<FileMenu …>`.

Extend the viewport wrapper's `display` so the plan view replaces it visually without unmounting it:

```tsx
            display:
              mainView === 'plan'
                ? 'none'
                : selectedCarcase === null || cabinetTab === '3d'
                  ? 'flex'
                  : 'none',
```

Render the plan view beside it, and resolve the drop through the same `onUpdateComponent` every
other edit uses — so it lands in undo/redo like anything else:

```tsx
        {mainView === 'plan' && (
          <PlanView
            scene={scene}
            selectedId={selection?.kind === 'component' ? selection.id : null}
            onSelect={(id) => onSelect({ kind: 'component', id })}
            onDrop={(id, position) => {
              const dragged = scene.components.find((c) => c.id === id)
              if (dragged === undefined || dragged.kind !== 'carcase') return
              const others = scene.components.filter(
                (c): c is CarcaseComponent => c.kind === 'carcase' && c.id !== id,
              )
              const drop = anchorForDrop(dragged, position, others, scene.materials)
              // The updater is handed the `Component` UNION, so it must narrow before touching
              // `anchor` — only `CarcaseComponent` carries one, and `GroupComponent` would not
              // typecheck. The outer `dragged.kind` check does not narrow `c`, which is a
              // different value.
              onUpdateComponent(id, (c) =>
                c.kind !== 'carcase'
                  ? c
                  : drop.kind === 'anchor'
                    ? { ...c, anchor: drop.anchor }
                    : { ...c, anchor: undefined, position: drop.position },
              )
            }}
          />
        )}
```

Import `PlanView`, `anchorForDrop` and the `CarcaseComponent` type at the top of `App.tsx`. Both
shapes above are the real ones, read off the source rather than assumed:
`Selection` is `{ kind: 'component'; id: ComponentId }` among its three arms (`types.ts:290-297`),
and `onUpdateComponent` is `(id: ComponentId, updater: (c: Component) => Component) => void`
(`useScene.ts:155`, `:1344`). Routing the drop through it is what puts a drag in undo/redo and runs
the four-stage pipeline, so a dropped cabinet's neighbours re-resolve in the same commit.

- [ ] **Step 5: Run the App tests**

Run: `pnpm vitest run src/App.test.tsx`
Expected: PASS, including the new one.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/ui/FileMenu.tsx src/App.test.tsx
git commit -m "feat(ui): a plan view beside the model, and a drop that anchors"
```

---

## Task 7: Mutation testing

Every guard above is evidence only if it can fail. Back the file up with `cp` **first** — never
`git checkout` to undo a mutation, because the tree carries uncommitted work; grep after applying
and again after restoring, because a replacement that matched nothing looks exactly like a
surviving mutation.

```bash
S="$(mktemp -d)"
cp src/scene/runs.ts "$S/runs.bak"
cp src/scene/dragAnchor.ts "$S/dragAnchor.bak"
cp src/ui/PlanView.tsx "$S/PlanView.bak"
```

Predict which tests fail **before** running each. A gap between prediction and result is the finding.

| # | Mutation | Should fail |
|---|---|---|
| 1 | `runs.ts`: put `'front'`/`'back'` into `CONTINUES_A_RUN` | *starts a new run at a front anchor* |
| 2 | `runs.ts`: make the graph directed (drop the `neighbours.get(t.id)?.add(c.id)` line) | *joins a target with a neighbour on each side* |
| 3 | `runs.ts`: drop the `t.parentId !== c.parentId` clause | *ignores an anchor across a parent boundary* |
| 4 | `runs.ts`: return members unsorted | *reads a run the same whichever end it was built from* |
| 5 | `dragAnchor.ts`: `SNAP_MM` → 5 | *anchors to the right face*, *…left face*, and the round trip |
| 6 | `dragAnchor.ts`: drop the `flush()` wrapper on `offset.u` | *snaps a near-flush depth offset to flush* |
| 7 | `dragAnchor.ts`: make `flush()` clamp always (`=> 0`) | *keeps a deliberate offset that is past the snap* |
| 8 | `dragAnchor.ts`: rank by total distance instead of the normal axis | *takes the nearer of two candidate faces* |
| 9 | `dragAnchor.ts`: drop the `t.id === dragged.id` clause | *never anchors a cabinet to itself* |
| 10 | `PlanView.tsx`: `toSvg` returns `y0 - yMin` instead of `yMax - y1` | *draws a deeper cabinet reaching further up the screen* |
| 11 | `PlanView.tsx`: remove `pointer-events-none` from the label | nothing in unit tests — happy-dom loads no stylesheet. **Expected survivor**; record it |

- [ ] **Step 1: Run each mutation, record predicted vs. actual**
- [ ] **Step 2: Restore every file from the backup copies and grep to confirm**

```bash
cp "$S/runs.bak" src/scene/runs.ts
cp "$S/dragAnchor.bak" src/scene/dragAnchor.ts
cp "$S/PlanView.bak" src/ui/PlanView.tsx
grep -n "CONTINUES_A_RUN = new Set" src/scene/runs.ts
grep -n "SNAP_MM = 60" src/scene/dragAnchor.ts
grep -n "yMax - y1" src/ui/PlanView.tsx
```

- [ ] **Step 3: Full suite green after restore**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: exit 0, test count = 1988 + the new tests.

---

## Task 8: Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `project-structure.html`
- Modify: `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md`

- [ ] **Step 1: Add the source-tree entries to `CLAUDE.md`** under `src/scene/` and `src/ui/`:

```
│   ├── carcaseWorldBounds.ts  worldBoundsOf / localRotatedBoundsOf — where a cabinet's occupied
│   │                    box actually is. The one statement of rotate-then-translate, read by
│   │                    resolvePlacement, runs.ts, dragAnchor.ts and the plan view
│   ├── runs.ts          runsOf(components, materials) → Run[] — maximal chains joined by left/right
│   │                    anchors, in geometric order. A front/back anchor starts a new run
│   ├── dragAnchor.ts    SNAP_MM + anchorForDrop — what anchor would put the cabinet here. Inverts
│   │                    anchoredPosition; pure, no DOM
```

```
│   ├── PlanView.tsx     The job from above as interactive SVG: a footprint per cabinet, a dashed
│   │                    outline per run, drag to move or to anchor. The second interactive SVG,
│   │                    following SectionElevation's precedent
```

- [ ] **Step 2: Add the invariants to `CLAUDE.md`'s Key Invariants list**

```
- **A run is a straight line, so only a left or right anchor continues one.** `runsOf` builds an
  **undirected** graph over honoured left/right links — a cabinet on each side of one target is one
  run of three, because direction says who moves when the target moves, not what is in the line —
  and orders members **geometrically** (`x0`, then `y0`), the same choice `sectionOpenings` makes so
  a run assembled from either end reads the same. A front or back anchor starts a new run, which is
  what leaves stage 3's blind-width check two runs to compare rather than one L-shaped one. An
  anchor is honoured on exactly `resolvePlacement`'s terms; a run built from anchors the resolver
  ignores is a run that is not on screen.
- **World y runs back and SVG y runs down, and that flip happens in one function.** `toSvg` in
  `PlanView.tsx` is the only place `yMax - y1` is written — the same rule as `SectionElevation`'s
  `H - z1`, for the same reason. A job flipped front-to-back looks entirely plausible until one
  cabinet is deeper than its neighbour, which is why the test that pins it compares a 560-deep
  cabinet against a 500-deep one rather than two of a kind.
- **A drop answers in anchor terms, and the arithmetic is not in the handler.** `anchorForDrop`
  inverts `anchoredPosition` at `gap = 0` and is a pure function of millimetres, so it is tested
  against real figures rather than through a pointer gesture happy-dom cannot measure — it reports a
  zero-sized `getBoundingClientRect`, so any screen-to-world arithmetic in a handler is untestable
  there. Candidates rank by distance on the **face's normal axis alone**: the in-plane axes are
  where the user is free to slide, so counting them lets a cabinet dragged far along the right face
  lose to a nearer but wrong one. In-plane offsets snap to flush within `SNAP_MM` and otherwise keep
  what was dragged, so decision 7's default is cheap and a deliberate reveal still survives a drop.
```

- [ ] **Step 3: Regenerate the structure HTML and add the feature row**

```bash
node scripts/update-structure-html.mjs
```

Then add a row beside the placement one, in the same shape as its neighbours:

```html
          <tr>
            <td><strong>Runs and the plan view</strong><br><span style="color:var(--muted);font-size:12px">Runs derived from left/right anchor links — undirected, geometrically ordered — and the whole job drawn from above, where dragging a cabinet near a neighbour's side is the gesture that stores the anchor</span></td>
            <td><span class="badge badge-green">Done</span></td>
            <td><code>scene/runs.ts</code>, <code>scene/dragAnchor.ts</code>, <code>scene/carcaseWorldBounds.ts</code>, <code>ui/PlanView.tsx</code></td>
          </tr>
```

- [ ] **Step 4: Append the stage-2 entries to the notes file**

Date-stamped, and covering at minimum: the two decisions taken with the user and why; the
prediction-vs-actual table from Task 7 including every survivor and why it was kept; the measured
test delta against the `a4bebd4` baseline; and anything the plan got wrong, which is the most
valuable part of the entry.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md project-structure.html docs/
git commit -m "docs: runs, the plan view, and the drop rule"
```

---

## Task 9: Verification, and push

- [ ] **Step 1:** `pnpm typecheck` → exit 0
- [ ] **Step 2:** `pnpm lint` → exit 0
- [ ] **Step 3:** `pnpm test` → exit 0; record files/passed/skipped
- [ ] **Step 4:** Record the delta against the measured baseline (99 files, 1988 passed, 10 skipped on `a4bebd4`)
- [ ] **Step 5:** `git push -u origin claude/next-suggested-task-z8rzaq`

---

## Not in this stage

Stage 3 (corners: rotation in the plan view, front-face anchors, blind-width validation) and stage 4
(the viewport move gizmo) are designed and unbuilt. Also still excluded by the design itself: a
`'top'` anchor side, walls as objects, filler strips, and per-run operations beyond what a chain
gives for free.

The **blind-corner dimensions in the spec remain unverified** — reasoned from geometry, not read off
a catalogue, the same class of claim as the hinge table and the TANDEM figures. Stage 3 is where
that matters; carrying the caveat forward here so it is not lost between stages.
