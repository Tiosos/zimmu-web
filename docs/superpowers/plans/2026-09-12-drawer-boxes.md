# Drawer Boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a real drawer box behind every drawer front, as a driven child component with its own generator, and re-baseline the slide screw height onto that box.

**Architecture:** A `DrawerComponent` hangs under its carcase, one per drawer-front opening, created and removed by a new pure stage `regenerateDrawers` that runs *before* `regenerateComponents`. Box geometry is stated once in `drawerBoxMetrics` and read by both generators, which is what stops the carcase and the drawer depending on each other's output. Two runner families are supported and their width rules are genuinely different shapes, not one rule with two constants.

**Tech Stack:** TypeScript (strict), React 19, Vitest + happy-dom + @testing-library/react, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-12-drawer-boxes-design.md`
**Notes:** `docs/superpowers/notes/2026-09-12-drawer-boxes-notes.md`

---

## Before you start

Read the spec. Then read these three rules from `CLAUDE.md`, because this plan depends on all of them:

- **Mutation testing.** Every guard you add must be broken deliberately, watched to fail, and
  restored **from a `cp` backup, never `git checkout`**. Grep after applying and again after
  restoring. Predict which tests should fail before running.

  **The per-task mutation steps are not exhaustive.** Tasks 3, 5, 10, 12 and 13 carry no explicit
  mutation step, and that is an omission in this plan rather than permission to skip one. If a task
  adds a rule that could be broken, break it and watch a test fail, whether or not a step says so.
  Task 3's implementer caught this and ran nine mutations on its own initiative; do the same.

  **Some mutations are expected to survive, and that is information rather than failure.** Changing
  a *stated figure* (a clearance, a pitch, a hinge count) kills nothing, because the tests derive
  their expectations from the constant — they pin that the code applies the figure, not that the
  figure is right. Those figures are unfalsifiable by any test in this repo, which is why they carry
  sourcing comments instead. Report such a survivor and say why it survived; do not "fix" it by
  hardcoding the number in the test, which would pin the preset rather than the rule.
- **Overrides in, boxes out.** The generator is a function in one direction. Nothing in this plan
  may make a generator read another generator's emitted parts.
- **`useFile.ts` types `base.params` loosely**, so `tsc` cannot catch a file-format regression.
  Task 6 exists because of this.

Run `pnpm typecheck && pnpm lint && pnpm test` before every commit. A pre-commit hook enforces the
typecheck. **Never use `--no-verify`**; if the hook rejects a commit, the commit is wrong.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/scene/nearestCarcase.ts` | `nearestCarcase(node, byId)` — the one statement of "which cabinet does this belong to", walking ancestors. Read by both BOM consumers. |
| `src/scene/drawerBox.ts` | `RunnerFamily`, `DrawerParams`, `DrawerBoxMetrics`, `drawerBoxMetrics()`, and every stated figure. The single statement of a box's geometry. |
| `src/scene/regenerateDrawers.ts` | Pure `Scene → Scene`. Reconciles drawer components against the section tree, then emits their boards. |

**Modified:**

| File | Change |
|---|---|
| `src/scene/types.ts` | `DrawerComponent`, added to the `Component` union. |
| `src/scene/carcaseRoles.ts` | `carcaseMachining` gains a drawer-params argument; the drawer branch reads `drawerBoxMetrics`. |
| `src/scene/regenerateComponents.ts` | Threads drawer params into `carcaseMachining`. |
| `src/scene/useScene.ts` | `applyPipeline` gains the third stage. |
| `src/scene/useFile.ts` | `FILE_FORMAT_VERSION` 18; parse the new component kind. |
| `src/ui/buildCsv.ts` | `groupParts` uses `nearestCarcase`. |
| `src/scene/carcaseHardware.ts` | Owner resolution uses `nearestCarcase`. |
| `src/ui/SceneTree.tsx` | An icon for the drawer kind. |
| `CLAUDE.md`, `project-structure.html` | Invariants and file trees. |

---

## Task 1: The nearest carcase, stated once

This ships on its own and fixes a defect that exists today for any part under a group component.

**Files:**
- Create: `src/scene/nearestCarcase.ts`
- Test: `src/scene/nearestCarcase.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/nearestCarcase.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nearestCarcase } from './nearestCarcase'
import { componentsById } from './componentTree'
import { CARCASE_PRESETS } from './carcasePresets'
import type { Component, Part } from './types'

const carcase: Component = {
  kind: 'carcase',
  id: 'cmp_cab',
  label: 'Base 600',
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
}

const group: Component = {
  kind: 'group',
  id: 'cmp_grp',
  label: 'Inner',
  parentId: 'cmp_cab',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
}

const partUnder = (parentId: string | null): Part => ({
  kind: 'board',
  id: 'board_1',
  label: 'B',
  length: 100,
  width: 50,
  thickness: 18,
  grain: 'length',
  material: '',
  color: '#888888',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  parentId: parentId as Part['parentId'],
  driven: false,
})

describe('nearestCarcase', () => {
  const byId = componentsById([carcase, group])

  it('finds the carcase when it is the immediate parent', () => {
    expect(nearestCarcase(partUnder('cmp_cab'), byId)?.id).toBe('cmp_cab')
  })

  // The whole point. `ancestorsOf(...)[0]` answers 'cmp_grp' here, which is what both BOM
  // consumers do today and why a nested part is attributed to the wrong thing.
  it('skips a non-carcase ancestor and keeps walking up', () => {
    expect(nearestCarcase(partUnder('cmp_grp'), byId)?.id).toBe('cmp_cab')
  })

  it('is null for a top-level part', () => {
    expect(nearestCarcase(partUnder(null), byId)).toBeNull()
  })

  it('is null when no ancestor is a carcase', () => {
    const orphanGroup: Component = { ...group, id: 'cmp_lone', parentId: null }
    const only = componentsById([orphanGroup])
    expect(nearestCarcase(partUnder('cmp_lone'), only)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm vitest run src/scene/nearestCarcase.test.ts`
Expected: FAIL — `Failed to resolve import "./nearestCarcase"`.

- [ ] **Step 3: Write the implementation**

Create `src/scene/nearestCarcase.ts`:

```ts
import type { CarcaseComponent, Component, ComponentId, Part } from './types'
import { ancestorsOf } from './componentTree'

// Which cabinet a node belongs to, asked once and answered here.
//
// `ancestorsOf(...)[0]` is the *immediate* parent, which is the cabinet only when the part hangs
// directly off it. A part under a group, or under a drawer, answers the wrong component — and the
// cutting list and the hardware BOM were each written with their own version of that mistake.
// Stated once so the two cannot disagree about which cabinet a board was cut for.
export function nearestCarcase(
  node: Part | Component,
  byId: Map<ComponentId, Component>,
): CarcaseComponent | null {
  for (const ancestor of ancestorsOf(node, byId)) {
    if (ancestor.kind === 'carcase') return ancestor
  }
  return null
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm vitest run src/scene/nearestCarcase.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Mutation-test the walk**

Back the file up, break it, confirm the right test fails, restore.

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/nearestCarcase.ts "$SP"/nc.bak
python3 - <<'PY'
import io
p='src/scene/nearestCarcase.ts'
s=io.open(p,encoding='utf-8').read()
old="""  for (const ancestor of ancestorsOf(node, byId)) {
    if (ancestor.kind === 'carcase') return ancestor
  }
  return null"""
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"""  const first = ancestorsOf(node, byId)[0]
  return first !== undefined && first.kind === 'carcase' ? first : null"""))
PY
grep -q "ancestorsOf(node, byId)\[0\]" src/scene/nearestCarcase.ts && echo APPLIED
pnpm vitest run src/scene/nearestCarcase.test.ts
```

Predict before running: exactly one test fails, `skips a non-carcase ancestor and keeps walking up`.
If more or fewer fail, the gap is real — investigate before restoring.

```bash
cp "$SP"/nc.bak src/scene/nearestCarcase.ts
grep -q "for (const ancestor of ancestorsOf" src/scene/nearestCarcase.ts && echo RESTORED
diff "$SP"/nc.bak src/scene/nearestCarcase.ts && echo IDENTICAL
```

- [ ] **Step 6: Run the full checks and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/nearestCarcase.ts src/scene/nearestCarcase.test.ts
git commit -m "feat(scene): state 'which cabinet owns this part' once

ancestorsOf(...)[0] is the immediate parent, which is the cabinet only
when the part hangs straight off it. A part under a group answers the
group. Both BOM consumers carry their own version of that mistake.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 2: Both BOM consumers use it

**Files:**
- Modify: `src/ui/buildCsv.ts:66`
- Modify: `src/scene/carcaseHardware.ts:55`
- Test: `src/ui/buildCsv.test.ts`, `src/scene/carcaseHardware.test.ts`

- [ ] **Step 1: Write the failing test for the cutting list**

Append inside the existing top-level `describe` in `src/ui/buildCsv.test.ts` (add it before the
closing `})` of that block — **do not replace the file**):

```ts
  // A board under a nested component is still cut for its cabinet. groupParts read the immediate
  // parent, so a nested board was labelled with the wrapper's name and, because the label is part
  // of the grouping key, identical boards from two cabinets merged under one meaningless row.
  it('labels a board under a nested component with its cabinet, not the wrapper', () => {
    const cabinet: Component = {
      kind: 'carcase',
      id: 'cmp_cab',
      label: 'Base 600',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params: CARCASE_PRESETS[0].params,
    }
    const wrapper: Component = {
      kind: 'group',
      id: 'cmp_wrap',
      label: 'Wrapper',
      parentId: 'cmp_cab',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
    }
    const nested: Part = {
      kind: 'board',
      id: 'board_nested',
      label: 'Box side',
      length: 400,
      width: 120,
      thickness: 15,
      grain: 'length',
      material: 'Ply',
      color: '#888888',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [],
      visible: true,
      parentId: 'cmp_wrap',
      driven: true,
    }
    const rows = groupParts([nested], {}, [cabinet, wrapper])
    expect(rows).toHaveLength(1)
    expect(rows[0].component).toBe('Base 600')
  })
```

If `Component`, `Part`, or `CARCASE_PRESETS` are not already imported in that file, add them:

```ts
import { CARCASE_PRESETS } from '../scene/carcasePresets'
import type { Component, Part } from '../scene/types'
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/ui/buildCsv.test.ts -t "labels a board under a nested component"`
Expected: FAIL — received `'Wrapper'`, expected `'Base 600'`.

If the row's property is not named `component`, read `groupParts`'s return type and use the real
name. Do not rename the property.

- [ ] **Step 3: Fix the cutting list**

In `src/ui/buildCsv.ts`, replace line 66:

```ts
    const component = ancestorsOf(p, byId)[0]?.label ?? ''
```

with:

```ts
    const component = nearestCarcase(p, byId)?.label ?? ''
```

Update the imports at the top of the file. `ancestorsOf` may now be unused; if `pnpm lint` says so,
remove it from the import — `noUnusedLocals` is on:

```ts
import { componentsById } from '../scene/componentTree'
import { nearestCarcase } from '../scene/nearestCarcase'
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/ui/buildCsv.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Write the failing test for the hardware BOM**

Append inside the `describe('carcaseHardware — screws', ...)` block in
`src/scene/carcaseHardware.test.ts`, or the nearest screw-related block. **Do not replace the file.**

```ts
  // A screw through a board under a nested component still belongs to the cabinet. The owner check
  // read the direct parent, so a nested board's screws fell to Ungrouped.
  it('attributes a nested board’s screws to its cabinet, not to Ungrouped', () => {
    const scene = sceneOf(CARCASE_PRESETS[0].params, 'Base A')
    const wrapper = {
      kind: 'group' as const,
      id: 'cmp_wrap' as ComponentId,
      label: 'Wrapper',
      parentId: 'cmp_1' as ComponentId,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      visible: true,
    }
    // Re-parent one screwed board under the wrapper. Its screws must still land on the cabinet.
    const screwed = scene.parts.find(
      (p) => p.kind === 'board' && p.cuts.some((c) => c.id.endsWith('_clearance')),
    )
    expect(screwed).toBeDefined()
    const moved = {
      ...scene,
      components: [...scene.components, wrapper],
      parts: scene.parts.map((p) => (p.id === screwed!.id ? { ...p, parentId: wrapper.id } : p)),
    }
    const lines = carcaseHardware(moved)
    expect(lines.some((l) => l.cabinetLabel === UNGROUPED_LABEL)).toBe(false)
  })
```

Add `UNGROUPED_LABEL` and `ComponentId` to that file's imports if they are not already there.

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts -t "attributes a nested"`
Expected: FAIL — an `Ungrouped` line exists.

- [ ] **Step 7: Fix the hardware BOM**

In `src/scene/carcaseHardware.ts`, replace line 55:

```ts
    const owner = part.parentId !== null && carcases.has(part.parentId) ? part.parentId : null
```

with:

```ts
    // The nearest carcase ancestor, not the direct parent: a board under a drawer or a group is
    // still cut and screwed for the cabinet above it. Same rule the cutting list reads, stated in
    // one place so the two cannot disagree.
    const owner = nearestCarcase(part, byId)?.id ?? null
```

Add near the top of the file:

```ts
import { componentsById } from './componentTree'
import { nearestCarcase } from './nearestCarcase'
```

and, inside `carcaseHardware` before the part loop:

```ts
  const byId = componentsById(scene.components)
```

If `carcases` becomes unused, `pnpm lint` will say so; it is still used by the `cabinet` lookup, so
check rather than assume.

- [ ] **Step 8: Run everything and watch it pass**

Run: `pnpm vitest run src/scene/carcaseHardware.test.ts src/ui/buildCsv.test.ts`
Expected: PASS. The preset screw totals (32 / 28 / 66) must be **unchanged** — this task moves no
screws, it only re-attributes nested ones.

- [ ] **Step 9: Mutation-test both fixes**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/ui/buildCsv.ts "$SP"/bc.bak && cp src/scene/carcaseHardware.ts "$SP"/ch.bak

# Mutation A: cutting list back to the immediate parent
python3 - <<'PY'
import io
p='src/ui/buildCsv.ts'
s=io.open(p,encoding='utf-8').read()
old="const component = nearestCarcase(p, byId)?.label ?? ''"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"const component = ancestorsOf(p, byId)[0]?.label ?? ''"))
PY
grep -q "ancestorsOf(p, byId)\[0\]" src/ui/buildCsv.ts && echo "A APPLIED"
pnpm vitest run src/ui/buildCsv.test.ts
cp "$SP"/bc.bak src/ui/buildCsv.ts && grep -q "nearestCarcase(p, byId)" src/ui/buildCsv.ts && echo "A RESTORED"

# Mutation B: hardware back to the direct-parent check
python3 - <<'PY'
import io
p='src/scene/carcaseHardware.ts'
s=io.open(p,encoding='utf-8').read()
old="const owner = nearestCarcase(part, byId)?.id ?? null"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"const owner = part.parentId !== null && carcases.has(part.parentId) ? part.parentId : null"))
PY
grep -q "carcases.has(part.parentId)" src/scene/carcaseHardware.ts && echo "B APPLIED"
pnpm vitest run src/scene/carcaseHardware.test.ts
cp "$SP"/ch.bak src/scene/carcaseHardware.ts && grep -q "nearestCarcase(part, byId)" src/scene/carcaseHardware.ts && echo "B RESTORED"
```

Predict: mutation A fails exactly the new cutting-list test; mutation B fails exactly the new
hardware test. Mutation A may need `ancestorsOf` re-imported to compile — if so, that is expected,
restore and note it rather than fighting it.

- [ ] **Step 10: Run the full checks and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/ui/buildCsv.ts src/scene/carcaseHardware.ts src/ui/buildCsv.test.ts src/scene/carcaseHardware.test.ts
git commit -m "fix: attribute a nested board to its cabinet in both BOMs

The cutting list read the immediate parent and the hardware BOM required
a direct carcase parent. A board under a group answered the group in one
and fell to Ungrouped in the other. Both now ask nearestCarcase, so they
agree by construction rather than by coincidence.

No preset figure moves: this re-attributes nested parts and nothing else.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 3: The box metrics, side-mount

`drawerBox.ts` is the single statement of a box's geometry. Both generators read it and neither
reads the other's output — that is what stops the carcase and the drawer forming a cycle.

**Files:**
- Create: `src/scene/drawerBox.ts`
- Test: `src/scene/drawerBox.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/drawerBox.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  BOTTOM_GROOVE_DEPTH,
  BOTTOM_GROOVE_UP,
  BOX_HEIGHT_UNDER_FRONT,
  SIDE_MOUNT_CLEARANCE,
  defaultDrawerParams,
  drawerBoxMetrics,
} from './drawerBox'
import type { Rect } from './sectionTree'

// The SECTION's own rectangle — the clear opening — not the front cell. A 564 mm clear span
// between 18 mm sides, 500 mm above the floor, 200 mm tall.
const rect: Rect = { x0: 18, x1: 582, z0: 500, z1: 700 }

describe('drawerBoxMetrics — side-mount', () => {
  const params = defaultDrawerParams('side-mount')

  it('takes the side clearance off each side of the opening', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 560, frontThickness: 18, inset: false })!
    // Derived from the opening and the constant, not by calling the function under test.
    expect(m.box.x0).toBe(18 + SIDE_MOUNT_CLEARANCE)
    expect(m.box.x1).toBe(582 - SIDE_MOUNT_CLEARANCE)
    expect(m.box.x1 - m.box.x0).toBe(564 - 2 * SIDE_MOUNT_CLEARANCE)
  })

  it('takes its depth from the runner nominal, not from the cabinet depth', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 560, frontThickness: 18, inset: false })!
    // 560 clear picks the 550 nominal; the box is 550 deep, not 560.
    expect(m.box.y1 - m.box.y0).toBe(550)
  })

  it('starts at the carcase face for an overlay front and behind it for an inset one', () => {
    const overlay = drawerBoxMetrics(rect, params, {
      clearDepth: 560,
      frontThickness: 18,
      inset: false,
    })!
    const inset = drawerBoxMetrics(rect, params, {
      clearDepth: 560,
      frontThickness: 18,
      inset: true,
    })!
    expect(overlay.box.y0).toBe(0)
    expect(inset.box.y0).toBe(18)
  })

  it('derives its height from the front when the parameter is null', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 560, frontThickness: 18, inset: false })!
    expect(m.box.z1 - m.box.z0).toBe(200 - BOX_HEIGHT_UNDER_FRONT)
    expect(m.box.z0).toBe(500)
  })

  it('uses an explicit height over the derived one', () => {
    const m = drawerBoxMetrics(
      rect,
      { ...params, boxHeight: 120 },
      { clearDepth: 560, frontThickness: 18, inset: false },
    )!
    expect(m.box.z1 - m.box.z0).toBe(120)
  })

  it('clamps an over-tall explicit height to the opening', () => {
    const m = drawerBoxMetrics(
      rect,
      { ...params, boxHeight: 5000 },
      { clearDepth: 560, frontThickness: 18, inset: false },
    )!
    expect(m.box.z1 - m.box.z0).toBe(200)
  })

  it('puts the runner the parameter’s distance above the box bottom, in carcase space', () => {
    const m = drawerBoxMetrics(
      rect,
      { ...params, runnerOffset: 40 },
      { clearDepth: 560, frontThickness: 18, inset: false },
    )!
    expect(m.runnerZ).toBe(m.box.z0 + 40)
  })

  it('grooves the bottom, and the groove is where the constants say', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 560, frontThickness: 18, inset: false })!
    expect(m.groove).toEqual({ up: BOTTOM_GROOVE_UP, depth: BOTTOM_GROOVE_DEPTH })
  })

  it('declines entirely when no runner fits', () => {
    const m = drawerBoxMetrics(rect, params, { clearDepth: 200, frontThickness: 18, inset: false })
    expect(m).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/drawerBox.test.ts`
Expected: FAIL — `Failed to resolve import "./drawerBox"`.

- [ ] **Step 3: Write the implementation**

Create `src/scene/drawerBox.ts`:

```ts
import type { Rect } from './sectionTree'
import { RUNNER_NOMINALS, runnerKeyFor } from './hardwareCatalogue'

// Which family of runner a drawer is built for. The families are not one rule with two constants:
// side-mount fixes the gap either side of the box, undermount fixes the box's own interior, so
// their outside widths diverge as the side material gets thicker. Collapsing them is the mistake
// this type exists to make impossible.
export type RunnerFamily = 'side-mount' | 'undermount'

// Every figure below is stated, not derived. See the spec's "Stated figures" table for sourcing:
// the undermount numbers come from vendor summaries rather than Blum's printed instructions, and
// SIDE_MOUNT_RUNNER_OFFSET is a convention, not a citation. A wrong figure here produces a
// perfectly self-consistent drawer that does not slide.

// Side-mount ball-bearing runners take 1/2" each side.
export const SIDE_MOUNT_CLEARANCE = 12.7

// Undermount fixes the drawer's INSIDE width: opening minus this, thickness-dependent.
export const UNDERMOUNT_DEDUCTION_THIN = 42
export const UNDERMOUNT_DEDUCTION_THICK = 49
export const UNDERMOUNT_THIN_MAX_THICKNESS = 16

// Unsourced. Model-specific across the side-mount family, which is why it is a parameter with this
// as its default rather than a constant every drawer is stuck with.
export const SIDE_MOUNT_RUNNER_OFFSET = 32

export const BOX_HEIGHT_UNDER_FRONT = 25
export const BOTTOM_GROOVE_UP = 10
export const BOTTOM_GROOVE_DEPTH = 6

export interface DrawerParams {
  family: RunnerFamily
  // null derives it from the front cell. An explicit value lets a shallow box sit behind a tall
  // front, which is ordinary where plumbing or a rail is in the way.
  boxHeight: number | null
  // Side-mount only: how far above the box bottom the runner's screw line sits.
  runnerOffset: number
  material: string
}

export function defaultDrawerParams(family: RunnerFamily): DrawerParams {
  return { family, boxHeight: null, runnerOffset: SIDE_MOUNT_RUNNER_OFFSET, material: '' }
}

export interface BoxExtents {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}

export interface DrawerBoxMetrics {
  // Carcase space, so the machining can read it without converting.
  box: BoxExtents
  // Carcase z of the runner's screw line.
  runnerZ: number
  // null for undermount, where the bottom rests on the runner instead of sitting in a groove.
  groove: { up: number; depth: number } | null
}

export interface DrawerContext {
  clearDepth: number
  frontThickness: number
  inset: boolean
  // Side thickness only matters to undermount, whose rule is on the box's interior.
  sideThickness?: number
}

// The one statement of a drawer box's geometry. The drawer generator reads it to build boards and
// `carcaseMachining` reads it to place slide screws. Neither reads the other's output, which is
// what keeps the generator a function in one direction.
//
// Returns null when the cabinet is too shallow for the smallest runner. That mirrors the rule that
// a door too thin to bore lists no hinge: the generator declines rather than inventing a size, and
// a box beside a missing runner would be a drawer nobody can build.
export function drawerBoxMetrics(
  // The SECTION's own rectangle, from `tree.rects`, never the front cell. `frontCells` expands an
  // overlay front to the material midline, so a Base 600's cell is ~597 wide against a 564 opening
  // — a box sized off the cell would be 33 mm too wide and would not go in the cabinet.
  opening: Rect,
  params: DrawerParams,
  ctx: DrawerContext,
): DrawerBoxMetrics | null {
  const runnerKey = runnerKeyFor(ctx.clearDepth)
  if (runnerKey === null) return null
  const depth = RUNNER_NOMINALS.find((n) => runnerKey === `runner-${n}`)!

  const openingHeight = opening.z1 - opening.z0
  const height = Math.min(
    params.boxHeight ?? openingHeight - BOX_HEIGHT_UNDER_FRONT,
    openingHeight,
  )

  const sideThickness = ctx.sideThickness ?? 0
  const [x0, x1] =
    params.family === 'side-mount'
      ? [opening.x0 + SIDE_MOUNT_CLEARANCE, opening.x1 - SIDE_MOUNT_CLEARANCE]
      : undermountSpan(opening, sideThickness)

  // The applied front occupies y ∈ [−FT, 0] overlay and y ∈ [0, FT] inset, so the box starts where
  // the front stops.
  const y0 = ctx.inset ? ctx.frontThickness : 0

  return {
    box: { x0, x1, y0, y1: y0 + depth, z0: opening.z0, z1: opening.z0 + height },
    runnerZ: opening.z0 + (params.family === 'side-mount' ? params.runnerOffset : 0),
    groove:
      params.family === 'side-mount'
        ? { up: BOTTOM_GROOVE_UP, depth: BOTTOM_GROOVE_DEPTH }
        : null,
  }
}

// Undermount states the drawer's INSIDE width, so the outside width moves with the side material.
// At 16 mm sides the outside clearance works out near 5 mm a side, not the 12.7 mm a side-mount
// needs — which is why this cannot be expressed as a per-side constant.
function undermountSpan(opening: Rect, sideThickness: number): [number, number] {
  const deduction =
    sideThickness <= UNDERMOUNT_THIN_MAX_THICKNESS
      ? UNDERMOUNT_DEDUCTION_THIN
      : UNDERMOUNT_DEDUCTION_THICK
  const inside = opening.x1 - opening.x0 - deduction
  const outside = inside + 2 * sideThickness
  const slack = (opening.x1 - opening.x0 - outside) / 2
  return [opening.x0 + slack, opening.x1 - slack]
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/scene/drawerBox.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/drawerBox.ts src/scene/drawerBox.test.ts
git commit -m "feat(scene): state a drawer box's geometry once

Both generators read drawerBoxMetrics and neither reads the other's
output, which is what stops the carcase and the drawer forming a cycle
through the slide screw height.

Declines when no runner fits, mirroring the rule that a door too thin to
bore lists no hinge.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 4: The undermount width rule

The rule that is easiest to get wrong and hardest to notice, because it is wrong by more as the
sides get thicker. Its own task so the fixture that proves it cannot be "simplified" away.

**Files:**
- Test: `src/scene/drawerBox.test.ts` (append a new `describe`)

- [ ] **Step 1: Write the failing test**

Append to `src/scene/drawerBox.test.ts`, after the existing `describe`. **Do not replace the file.**

```ts
describe('drawerBoxMetrics — undermount', () => {
  const params = defaultDrawerParams('undermount')
  const ctx = (sideThickness: number) => ({
    clearDepth: 560,
    frontThickness: 18,
    inset: false,
    sideThickness,
  })

  // The rule is on the INSIDE width. A 564 opening with 15 mm sides gives 564 − 42 = 522 inside.
  it('fixes the inside width, not the gap either side', () => {
    const m = drawerBoxMetrics(rect, params, ctx(15))!
    const inside = m.box.x1 - m.box.x0 - 2 * 15
    expect(inside).toBe(564 - UNDERMOUNT_DEDUCTION_THIN)
  })

  // Thicker sides take the larger deduction. 564 − 49 = 515 inside.
  it('takes the larger deduction above the thin-material limit', () => {
    const m = drawerBoxMetrics(rect, params, ctx(18))!
    const inside = m.box.x1 - m.box.x0 - 2 * 18
    expect(inside).toBe(564 - UNDERMOUNT_DEDUCTION_THICK)
  })

  // The point of the whole section: undermount is NOT side-mount with a different constant. A
  // per-side rule would give the same outside width at both thicknesses; this one must not.
  it('moves the outside width with the side thickness, unlike a per-side rule', () => {
    const thin = drawerBoxMetrics(rect, params, ctx(12))!
    const thick = drawerBoxMetrics(rect, params, ctx(18))!
    expect(thin.box.x1 - thin.box.x0).not.toBe(thick.box.x1 - thick.box.x0)
  })

  // At 16 mm sides the outside clearance is nowhere near a side-mount's 12.7 mm a side.
  it('leaves a far smaller outside clearance than side-mount does', () => {
    const m = drawerBoxMetrics(rect, params, ctx(16))!
    const perSide = (564 - (m.box.x1 - m.box.x0)) / 2
    expect(perSide).toBeLessThan(SIDE_MOUNT_CLEARANCE / 2)
  })

  it('has no groove and sits the runner at the box bottom', () => {
    const m = drawerBoxMetrics(rect, params, ctx(15))!
    expect(m.groove).toBeNull()
    expect(m.runnerZ).toBe(m.box.z0)
  })
})
```

Extend the import at the top of the file to include the two deduction constants:

```ts
import {
  BOTTOM_GROOVE_DEPTH,
  BOTTOM_GROOVE_UP,
  BOX_HEIGHT_UNDER_FRONT,
  SIDE_MOUNT_CLEARANCE,
  UNDERMOUNT_DEDUCTION_THICK,
  UNDERMOUNT_DEDUCTION_THIN,
  defaultDrawerParams,
  drawerBoxMetrics,
} from './drawerBox'
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run src/scene/drawerBox.test.ts`
Expected: PASS. Task 3 already implemented `undermountSpan`; these tests pin it. If any fail, the
implementation is wrong and must be fixed before continuing — do not weaken the test.

- [ ] **Step 3: Mutation-test the family split**

This is the mutation the whole section exists to kill.

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/drawerBox.ts "$SP"/db.bak

# Mutation: treat undermount as side-mount with a different constant
python3 - <<'PY'
import io
p='src/scene/drawerBox.ts'
s=io.open(p,encoding='utf-8').read()
old="      : undermountSpan(opening, sideThickness)"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"      : [opening.x0 + 5, opening.x1 - 5]"))
PY
grep -q "opening.x0 + 5" src/scene/drawerBox.ts && echo APPLIED
pnpm vitest run src/scene/drawerBox.test.ts
cp "$SP"/db.bak src/scene/drawerBox.ts
grep -q "undermountSpan(opening, sideThickness)" src/scene/drawerBox.ts && echo RESTORED
diff "$SP"/db.bak src/scene/drawerBox.ts && echo IDENTICAL
```

Predict: at least three of the five undermount tests fail, including
`moves the outside width with the side thickness`. A per-side constant makes both thicknesses give
the same outside width, which is exactly what that test forbids.

- [ ] **Step 4: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/drawerBox.test.ts
git commit -m "test(scene): pin the undermount width rule against a per-side one

Undermount fixes the box's interior, so its outside width moves with the
side material. A per-side constant gives the same outside width at every
thickness, which the sweep now forbids. At 16 mm sides the real outside
clearance is near 5 mm, not a side-mount's 12.7 mm.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 4b: Decline a box that will not fit its opening

Found by Task 4's code-quality reviewer and confirmed by arithmetic. `drawerBoxMetrics` declines
when no runner fits the **depth**, but never checks the **width**. Undermount's width rule adds
`2 × sideThickness` back to a fixed interior, so a thick-sided box outgrows its own opening:

| side | deduction | inside | outside | per side |
|---|---|---|---|---|
| 12 | 42 | 522 | 546 | +9.00 |
| 16 | 42 | 522 | 554 | +5.00 |
| 18 | 49 | 515 | 551 | +6.50 |
| **25** | **49** | **515** | **565** | **−0.50** |

A 564 mm opening yielding a 565 mm box. The side-mount block already exercises 25 mm stock, so this
is a thickness the file treats as plausible. Declining on width is the same rule the module already
applies to depth: **the generator declines rather than inventing a size.**

**Files:**
- Modify: `src/scene/drawerBox.ts`
- Test: `src/scene/drawerBox.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the undermount describe block. Derive the thickness from the constants rather than
hardcoding 25, so the test follows the figures:

```ts
  // Undermount adds 2 x sideThickness back to a fixed interior, so thick stock outgrows the
  // opening it is meant to sit in. The module already declines when no runner fits the depth;
  // a box wider than its hole is the same kind of "cannot be built" and gets the same answer.
  it('declines when the box would be wider than the opening', () => {
    const tooThick = Math.ceil(UNDERMOUNT_DEDUCTION_THICK / 2)
    expect(drawerBoxMetrics(rect, defaultDrawerParams('undermount'), { ...baseCtx, sideThickness: tooThick })).toBeNull()
  })

  // The boundary is still buildable: exactly zero slack is a box that fits.
  it('still builds a box with exactly zero slack', () => {
    const exact = UNDERMOUNT_DEDUCTION_THICK / 2
    const m = drawerBoxMetrics(rect, defaultDrawerParams('undermount'), { ...baseCtx, sideThickness: exact })
    expect(m).not.toBeNull()
    expect(m!.box.x1 - m!.box.x0).toBeCloseTo(rect.x1 - rect.x0, 9)
  })
```

**Work the arithmetic before writing this.** Outside width is `inside + 2t` where
`inside = span − deduction`, so outside exceeds the span exactly when `2t > deduction`. At the thick
deduction of 49 that is `t > 24.5`. Confirm against the table above and adjust the two thicknesses
if the constants have moved.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/drawerBox.test.ts -t "wider than the opening"`
Expected: FAIL — a metrics object is returned rather than null.

- [ ] **Step 3: Implement**

In `undermountSpan`, return a signal the caller can decline on rather than a nonsensical span. The
simplest form that keeps the rule in one place is to let it return `null` and have
`drawerBoxMetrics` propagate:

```ts
function undermountSpan(opening: Rect, sideThickness: number): [number, number] | null {
  const deduction =
    sideThickness <= UNDERMOUNT_THIN_MAX_THICKNESS
      ? UNDERMOUNT_DEDUCTION_THIN
      : UNDERMOUNT_DEDUCTION_THICK
  const span = opening.x1 - opening.x0
  const inside = span - deduction
  const outside = inside + 2 * sideThickness
  // Thick stock outgrows the opening: the interior is fixed, so every extra millimetre of side
  // pushes the outside wider. A box wider than its hole cannot be built, and the generator
  // declines rather than inventing a size — the same answer it gives when no runner fits.
  if (outside > span) return null
  const slack = (span - outside) / 2
  return [opening.x0 + slack, opening.x1 - slack]
}
```

and at the call site, where the family branch currently is, handle the null before building the box.
Write that branch so **side-mount is unaffected** — it has no such failure mode.

- [ ] **Step 4: Run and watch both pass**

Run: `pnpm vitest run src/scene/drawerBox.test.ts`
Expected: all tests pass, including every side-mount and undermount test already present. **If any
existing test breaks, the guard is too aggressive** — `>` not `>=`, since zero slack is buildable.

- [ ] **Step 5: Mutation-test the guard**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/drawerBox.ts "$SP"/db4b.bak
python3 - <<'PY2'
import io
p='src/scene/drawerBox.ts'
s=io.open(p,encoding='utf-8').read()
old="  if (outside > span) return null"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"  if (outside > span + 1000) return null"))
PY2
grep -q "span + 1000" src/scene/drawerBox.ts && echo APPLIED
pnpm vitest run src/scene/drawerBox.test.ts
cp "$SP"/db4b.bak src/scene/drawerBox.ts
grep -q "span + 1000" src/scene/drawerBox.ts && echo "RESTORE FAILED" || echo RESTORED
diff "$SP"/db4b.bak src/scene/drawerBox.ts && echo IDENTICAL
```

Predict: only `declines when the box would be wider than the opening` fails. Then run the boundary
mutation `>` → `>=` and predict that only `still builds a box with exactly zero slack` fails. Both
must kill exactly one test; if either kills none, the guard is not pinned.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/drawerBox.ts src/scene/drawerBox.test.ts
git commit -m "fix(scene): decline a drawer box wider than its own opening

Undermount fixes the box's interior and adds the side material back, so
thick stock outgrows the hole: 25 mm sides in a 564 mm opening give a 565
mm box. The module already declines when no runner fits the depth; a box
wider than its opening is the same 'cannot be built' and now gets the
same answer.

Zero slack still builds. Found by a reviewer probing a thickness the
side-mount tests already treat as plausible.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 4c: State the depth a box can actually use, once

An inset box's back lands at `frontThickness + nominal`, so it overruns whenever
`clearDepth − nominal < frontThickness`. Measured against a 564 mm opening:

| clear depth | front | nominal | overlay box | inset box |
|---|---|---|---|---|
| 548 | 18 | 500 | 0–500 | 18–518 |
| **560** | **18** | **550** | 0–550 | **18–568 — 8 mm past the back** |
| 330 | 18 | 300 | 0–300 | 18–318 |

**The fix cannot be local.** The spec ties the box's depth to `runnerKeyFor(clearDepth)` *"so the box
and the quoted runner cannot disagree about length"*, and `carcaseHardware` quotes from the same
call. Shorten the box alone and you build a 500 while the BOM orders a 550.

So the depth available to a box is stated once and read by both, exactly as `clearDepth` itself
already is. **This edits code that shipped in the previous stage**, which is deliberate and was
approved.

**Files:**
- Modify: `src/scene/drawerBox.ts` — **`boxDepth` lives here, NOT in `carcaseRoles.ts`**
- Modify: `src/scene/drawerBox.ts`
- Modify: `src/scene/carcaseHardware.ts`
- Test: `src/scene/drawerBox.test.ts`, `src/scene/carcaseHardware.test.ts`

- [ ] **Step 1: Read before writing**

Read `clearDepth` in `src/scene/carcaseRoles.ts`, `drawerBoxMetrics` in `src/scene/drawerBox.ts`,
and the runner branch of `src/scene/carcaseHardware.ts`. **The hardware module chooses a runner per
drawer bay and must now know that bay's front thickness and whether the cabinet is inset.** Work out
how it can learn that from what it already has before writing anything; it already reads
`frontMount` for hinge keys, so the mount is in reach.

- [ ] **Step 2: Write the failing tests**

Two, one per side of the agreement. In `src/scene/drawerBox.test.ts`:

```ts
  // An inset front eats depth the box cannot use. Its back must stop at or before the back panel.
  it('keeps an inset box inside the cabinet', () => {
    const m = drawerBoxMetrics(rect, defaultDrawerParams('side-mount'), {
      ...baseCtx,
      clearDepth: 560,
      frontThickness: 18,
      inset: true,
    })
    expect(m).not.toBeNull()
    expect(m!.box.y1).toBeLessThanOrEqual(560)
  })
```

In `src/scene/carcaseHardware.test.ts`, a test that the runner quoted for an inset cabinet is the one
the box is actually built to. Write it against whatever fixture helper that file uses for a drawer
bay, and assert the quoted runner key matches the nominal `drawerBoxMetrics` returns for the same
cabinet. **Both sides must be computed independently** — read the quoted key from `carcaseHardware`
and the box depth from `drawerBoxMetrics`, never one from the other.

- [ ] **Step 3: Run both and watch them fail**

Run: `pnpm vitest run src/scene/drawerBox.test.ts src/scene/carcaseHardware.test.ts`
Expected: the box test fails with `568` against `560`. The hardware test fails showing the quote and
the box disagreeing.

- [ ] **Step 4: State the rule once**

In `drawerBox.ts`. **Not** in `carcaseRoles.ts` beside `clearDepth`, which an earlier draft of this
task said: `carcaseMachining` lives in `carcaseRoles.ts` and Task 11 makes it import
`drawerBoxMetrics`, so putting `boxDepth` there would have `drawerBox` importing `carcaseRoles`
importing `drawerBox` — the exact mutual dependency the shared-metrics function exists to prevent.
It also keeps the inset rule next to the `y0 = inset ? frontThickness : 0` line that states the
same fact:

```ts
// The depth a drawer box can actually occupy, which is not the cabinet's clear depth: an inset
// front sits inside the opening and eats its own thickness before the box starts. Stated here
// because two things read it and must agree — the box the generator builds, and the runner the
// hardware list quotes. A box built to one figure beside a runner ordered to another is the exact
// disagreement `clearDepth` was factored out to prevent.
export function boxDepth(clearDepth: number, frontThickness: number, inset: boolean): number {
  return inset ? clearDepth - frontThickness : clearDepth
}
```

Then have **both** `drawerBoxMetrics` and `carcaseHardware`'s runner choice call
`runnerKeyFor(boxDepth(...))` rather than `runnerKeyFor(clearDepth)`.

Check the real name and signature of the hardware module's runner branch before editing it; it was
revised in Task 2.

- [ ] **Step 5: Run everything**

Run: `pnpm test`

**Expect the preset runner figures to move.** A Base 600 is overlay, so its quote should not change;
any inset fixture's may. For each changed expectation, say in the test comment *why* it moved. **Do
not update a figure you have not explained.**

- [ ] **Step 6: Mutation-test the agreement**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/carcaseHardware.ts "$SP"/ch4c.bak
python3 - <<'PY2'
import io
p='src/scene/carcaseHardware.ts'
s=io.open(p,encoding='utf-8').read()
old="boxDepth("
assert s.count(old)>=1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"((x)=>x)(", 1))
PY2
pnpm vitest run src/scene/carcaseHardware.test.ts
cp "$SP"/ch4c.bak src/scene/carcaseHardware.ts
diff "$SP"/ch4c.bak src/scene/carcaseHardware.ts && echo RESTORED
```

That makes the hardware quote ignore the front thickness while the box still honours it. Predict:
the agreement test fails and nothing else. **If it kills nothing, the two sides are not actually
being compared** and the test is decorative.

- [ ] **Step 7: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "fix(scene): state the depth a drawer box can use, and quote the same runner

An inset front sits inside the opening, so the box starts behind it and
its back lands at frontThickness + nominal. At 560 clear with an 18mm
front that is 8mm into the back panel.

Fixing the box alone would build a 500 beside a BOM ordering a 550, which
is what tying both to one call was meant to prevent. So the usable depth
is stated once beside clearDepth and read by the generator and the
hardware quote alike.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 4d: The box is a real box

Five ways the module still returns a geometrically impossible box, enumerated and confirmed by a
previous reviewer. One task, because fixing one member of a family while flagging the rest is
incoherent.

| case | how |
|---|---|
| Side-mount negative width | an opening narrower than 2 × 12.7 |
| Undermount negative *interior* | a 30 mm opening with 12 mm sides: inside −12, outside 12, passes the width guard |
| Negative or zero height | a 20 mm opening derives 20 − 25; an explicit negative `boxHeight` passes straight through |
| Runner above the box top | `runnerOffset` 32 in a box 25 tall |
| Groove above the box top | `BOTTOM_GROOVE_UP` 10 in a box under 10 tall |

**Files:**
- Modify: `src/scene/drawerBox.ts`
- Test: `src/scene/drawerBox.test.ts`

- [ ] **Step 1: Write five failing tests**

One per row, each asserting `drawerBoxMetrics` returns **null**. Derive every input from the module's
own constants rather than hardcoding a number, as the file already does. Give each test a name that
says which impossibility it rejects.

- [ ] **Step 2: Run them and watch all five fail**

Run: `pnpm vitest run src/scene/drawerBox.test.ts`
Expected: five failures, each returning a metrics object where null is wanted.

- [ ] **Step 3: Implement one guard, stated once**

Resist five scattered `if`s. The rule is a single question — *is this a box that can be built?* —
asked after the extents are computed:

```ts
// Every way the arithmetic above can produce a box nobody can build. Asked once, after the extents
// are known, rather than as five guards scattered through the computation: they are one question,
// and a reader checking "can this return nonsense?" should find one place to look.
//
// The generator declines rather than clamping. A clamped box is a box the user did not ask for and
// will not notice, which is worse than no box at all.
```

Write the condition to cover: positive outside width, positive interior width once both side
thicknesses are taken, positive height, the runner inside the box's height, and the groove inside it
too. **Keep the existing depth and width declines** — do not fold them in and change their meaning.

- [ ] **Step 4: Run and watch all five pass, with nothing else broken**

Run: `pnpm test`
**Every pre-existing test must still pass.** If a legitimate box now declines, the guard is too
aggressive — find which term and fix it, do not relax the test.

- [ ] **Step 5: Mutation-test each clause**

Five mutations, one per clause, each removing exactly one term from the condition. Back up with `cp`,
apply, grep, run, restore with `cp`, grep and `diff`. **Never `git checkout`.** Predict before each:
removing a clause should kill exactly the one test that covers it. A clause whose removal kills
nothing is either unreachable or untested — report which.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/drawerBox.ts src/scene/drawerBox.test.ts
git commit -m "fix(scene): decline a box that cannot be built

Five ways the arithmetic produced nonsense: negative widths by two
different routes, a negative height, and a runner or groove above the box
top. One guard rather than five scattered ifs, because they are one
question — can this box be built — and a reader should find one place to
look.

Declines rather than clamps: a clamped box is one the user did not ask
for and will not notice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 5: The DrawerComponent type

**Files:**
- Modify: `src/scene/types.ts:235-247`

- [ ] **Step 1: Add the type**

In `src/scene/types.ts`, after the `CarcaseComponent` interface and before the `Component` union,
add:

```ts
export interface DrawerComponent {
  kind: 'drawer'
  id: ComponentId // "cmp_<uuid>"
  label: string
  parentId: ComponentId | null
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
  // Which opening this drawer fills. Reconciliation is by (parentId, sectionId) and never by
  // index: the v12 divider shim rebuilds section ids on every keystroke, so an index would rebind
  // a drawer to a different bay.
  sectionId: SectionId
  params: DrawerParams
  // No other component carries this. A detached drawer is the user's — no regeneration, no
  // deletion — exactly as a detached part is. Carcases and groups are deliberately left out: a
  // detached carcase has no defined meaning today and inventing one here would be unearned scope.
  driven: boolean
}
```

Change the union:

```ts
export type Component = GroupComponent | CarcaseComponent | DrawerComponent
```

Add to the imports/re-exports at the top of the file, beside the existing section-tree re-export:

```ts
export type { DrawerParams, RunnerFamily } from './drawerBox'
```

and import the type for use in the interface:

```ts
import type { DrawerParams } from './drawerBox'
```

- [ ] **Step 2: Run the typecheck and read every error**

Run: `pnpm typecheck`

Expected: errors wherever a `switch` or conditional over `Component['kind']` is now non-exhaustive.
**Do not suppress any of them.** Each is a place that must decide what a drawer means. Write the
list down before fixing; it is the real surface of this change.

- [ ] **Step 3: Fix each site minimally**

For each error, the drawer behaves like a group unless the spec says otherwise. Specifically:

In `src/ui/SceneTree.tsx:197`, replace:

```tsx
          <span className="text-xs">{component.kind === 'carcase' ? '🗄' : '🗂'}</span>
```

with:

```tsx
          <span className="text-xs">
            {component.kind === 'carcase' ? '🗄' : component.kind === 'drawer' ? '🗃' : '🗂'}
          </span>
```

The tree already recurses over `components.filter((c) => c.parentId === component.id)`, so a drawer
appears under its cabinet with no further change.

- [ ] **Step 4: Typecheck and test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean, and the whole suite still passing. No behaviour has changed yet — nothing creates
a drawer.

- [ ] **Step 5: Commit**

```bash
git add src/scene/types.ts src/ui/SceneTree.tsx
git commit -m "feat(scene): a drawer is a component kind

Carries its own params and the section it fills, plus a driven flag no
other component has: a detached drawer is the user's, exactly as a
detached part is. Carcases and groups are left out because a detached
carcase has no defined meaning today.

Nothing creates one yet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 6: File format v18

`useFile.ts` types `base.params` loosely, so `tsc` cannot see a regression here. This task is a
`parseFile` test, not a typecheck.

**Files:**
- Modify: `src/scene/useFile.ts:25`, `src/scene/useFile.ts:227-247`
- Test: `src/scene/useFile.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/useFile.test.ts`, inside the existing `parseFile` describe block. **Do not
replace the file.**

```ts
  // useFile types base.params loosely, so tsc will happily compile a parser that produces a drawer
  // without params. The failure would appear only when the generator dereferences it at runtime.
  it('parses a drawer component with its params intact', () => {
    const file = {
      version: 18,
      scene: {
        parts: [],
        materials: {},
        hardware: [],
        joints: [],
        components: [
          {
            kind: 'drawer',
            id: 'cmp_d1',
            label: 'Drawer 1',
            parentId: 'cmp_cab',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            visible: true,
            sectionId: 'sec_abc',
            driven: true,
            params: {
              family: 'undermount',
              boxHeight: 120,
              runnerOffset: 32,
              material: 'Ply 15',
            },
          },
        ],
      },
    }
    const scene = parseFile(JSON.stringify(file))
    const drawer = scene.components.find((c) => c.id === 'cmp_d1')
    expect(drawer?.kind).toBe('drawer')
    expect(drawer).toMatchObject({
      sectionId: 'sec_abc',
      driven: true,
      params: { family: 'undermount', boxHeight: 120, runnerOffset: 32, material: 'Ply 15' },
    })
  })

  // A drawer whose params did not survive the round trip is the exact failure tsc cannot see.
  it('round-trips a drawer through serialize and parse', () => {
    const scene = parseFile(
      JSON.stringify({
        version: 18,
        scene: {
          parts: [],
          materials: {},
          hardware: [],
          joints: [],
          components: [
            {
              kind: 'drawer',
              id: 'cmp_d1',
              label: 'Drawer 1',
              parentId: null,
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              visible: true,
              sectionId: 'sec_abc',
              driven: true,
              params: { family: 'side-mount', boxHeight: null, runnerOffset: 32, material: '' },
            },
          ],
        },
      }),
    )
    const again = parseFile(serializeFile(scene, 'Test'))
    expect(again.components[0]).toMatchObject({
      kind: 'drawer',
      params: { family: 'side-mount', boxHeight: null },
    })
  })
```

Check the real names of `parseFile` and `serializeFile` in `src/scene/useFile.ts` before writing
this, and use whatever that file actually exports. If the serializer takes different arguments, use
the call shape the existing tests in this file already use.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/useFile.test.ts -t "drawer"`
Expected: FAIL — the parsed component is missing `sectionId`/`params`, or its kind is wrong.

- [ ] **Step 3: Bump the version**

In `src/scene/useFile.ts`, line 25:

```ts
export const FILE_FORMAT_VERSION = 18
```

- [ ] **Step 4: Parse the kind**

In the `components` mapper (around line 227), the existing code demotes a carcase with no params to
a group. Add the same defensive treatment for a drawer, immediately before the
`if (base.kind === 'carcase')` block:

```ts
      // v17→v18: drawer components. `DrawerComponent` declares `params` and `sectionId` required,
      // so a drawer missing either is a shape the type says cannot exist. Demote rather than
      // fabricate: a group keeps the label, the placement and every child board, and loses only
      // the ability to regenerate.
      if (base.kind === 'drawer' && (base.params === undefined || base.sectionId === undefined)) {
        console.warn(`zimmu: drawer "${base.id}" is incomplete — loaded as a group`)
        return {
          kind: 'group' as const,
          id: base.id,
          label: base.label,
          parentId: base.parentId,
          position: base.position,
          rotation: base.rotation,
          rotationOrder: base.rotationOrder,
          visible: base.visible,
        }
      }
      if (base.kind === 'drawer') {
        return {
          ...base,
          kind: 'drawer' as const,
          // Detached, like every other recovery default in this parser. Reconciliation keeps a
          // drawer only while its opening still wants one, so a drawer that lost this field and
          // names an opening that has since changed would be deleted with its boards. Staleness is
          // recoverable and deletion is not.
          driven: base.driven ?? false,
        } as DrawerComponent
      }
```

Add `DrawerComponent` to the type imports at the top of `useFile.ts`.

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm vitest run src/scene/useFile.test.ts`
Expected: PASS, the whole file.

- [ ] **Step 6: Mutation-test the parser**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/useFile.ts "$SP"/uf.bak
python3 - <<'PY'
import io
p='src/scene/useFile.ts'
s=io.open(p,encoding='utf-8').read()
old="          driven: base.driven ?? false,"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"          driven: base.driven ?? false,\n          params: undefined,"))
PY
grep -q "params: undefined," src/scene/useFile.ts && echo APPLIED
pnpm vitest run src/scene/useFile.test.ts
cp "$SP"/uf.bak src/scene/useFile.ts
grep -q "params: undefined," src/scene/useFile.ts && echo "RESTORE FAILED" || echo RESTORED
```

Predict: both new drawer tests fail. This is the mutation the whole task exists to catch, because
`tsc` stays silent through it.

- [ ] **Step 7: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/useFile.ts src/scene/useFile.test.ts
git commit -m "feat(scene): file format v18 parses drawer components

useFile types base.params loosely, so tsc cannot see a parser that drops
a required field — the failure surfaces only when the generator
dereferences it. Hence a parseFile test rather than a typecheck.

An incomplete drawer demotes to a group, the same treatment a carcase
without params already gets. No migration data is needed: a v17 file with
drawer-front openings simply has no drawers, and regeneration creates
them on load.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 7: Reconcile drawer components

The first pass in this codebase that adds or removes **components**. Reconciliation is by
`(parentId, sectionId)` and never by index.

**A note on the key separator.** Component ids are `cmp_<uuid>` and section ids are `sec_<uuid>`,
so neither can contain a `|`. Use `|` as the separator. The hardware module used an escaped NUL for
the same job and it cost a whole round of defects when the escape was written literally into a plan;
there is no reason to repeat that here.

**Files:**
- Create: `src/scene/regenerateDrawers.ts`
- Test: `src/scene/regenerateDrawers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/regenerateDrawers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { regenerateDrawers } from './regenerateDrawers'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { splitSection } from './editSection'
import { setFrontOn } from './sectionInterior'
import type { CarcaseParams, ComponentId, DrawerComponent, Scene } from './types'

const sceneOf = (params: CarcaseParams): Scene => ({
  parts: [],
  materials: { ...PRESET_MATERIALS },
  hardware: [],
  joints: [],
  components: [
    {
      kind: 'carcase',
      id: 'cmp_1' as ComponentId,
      label: 'Base A',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params,
    },
  ],
})

const drawersOf = (s: Scene): DrawerComponent[] =>
  s.components.filter((c): c is DrawerComponent => c.kind === 'drawer')

const oneDrawer = (): CarcaseParams => {
  const p = CARCASE_PRESETS[0].params
  return { ...p, section: setFrontOn(p.section, p.section.id, { kind: 'drawer-front' }) }
}

// Two bays side by side: left a drawer front, right a door. Two bays are what distinguish
// "the opening that asked" from "the first opening" — a single-bay fixture cannot.
const oneOfTwo = (): CarcaseParams => {
  const p = CARCASE_PRESETS[0].params
  let section = splitSection(p.section, p.section.id, 'vertical', 'panel', 2)
  const kids = section.content.kind === 'split' ? section.content.children : []
  section = setFrontOn(section, kids[0].id, { kind: 'drawer-front' })
  section = setFrontOn(section, kids[1].id, { kind: 'door', leaves: 1, hinge: 'left' })
  return { ...p, section }
}

describe('regenerateDrawers — component reconciliation', () => {
  it('creates one drawer per drawer-front opening', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0].parentId).toBe('cmp_1')
  })

  it('creates none for a cabinet with no drawer front', () => {
    expect(drawersOf(regenerateDrawers(sceneOf(CARCASE_PRESETS[0].params)))).toHaveLength(0)
  })

  it('names the opening that asked, not the first one', () => {
    const params = oneOfTwo()
    const kids = params.section.content.kind === 'split' ? params.section.content.children : []
    const out = regenerateDrawers(sceneOf(params))
    expect(drawersOf(out)).toHaveLength(1)
    expect(drawersOf(out)[0].sectionId).toBe(kids[0].id)
  })

  it('is idempotent: a second pass creates no second drawer', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const twice = regenerateDrawers(once)
    expect(drawersOf(twice)).toHaveLength(1)
    expect(drawersOf(twice)[0].id).toBe(drawersOf(once)[0].id)
  })

  it('removes a drawer whose opening stopped wearing a drawer front', () => {
    const withDrawer = regenerateDrawers(sceneOf(oneDrawer()))
    expect(drawersOf(withDrawer)).toHaveLength(1)
    const p = CARCASE_PRESETS[0].params
    const asDoor = {
      ...p,
      section: setFrontOn(p.section, p.section.id, {
        kind: 'door' as const,
        leaves: 1 as const,
        hinge: 'left' as const,
      }),
    }
    const changed = {
      ...withDrawer,
      components: withDrawer.components.map((c) =>
        c.kind === 'carcase' ? { ...c, params: asDoor } : c,
      ),
    }
    expect(drawersOf(regenerateDrawers(changed))).toHaveLength(0)
  })

  // A detached drawer is the user's. The component-level mirror of the detached-part rule.
  it('keeps a detached drawer even when its opening is gone', () => {
    const withDrawer = regenerateDrawers(sceneOf(oneDrawer()))
    const detached = {
      ...withDrawer,
      components: withDrawer.components.map((c) =>
        c.kind === 'drawer' ? { ...c, driven: false } : c,
      ),
    }
    const p = CARCASE_PRESETS[0].params
    const noFront = { ...p, section: { ...p.section, front: undefined } }
    const changed = {
      ...detached,
      components: detached.components.map((c) =>
        c.kind === 'carcase' ? { ...c, params: noFront } : c,
      ),
    }
    expect(drawersOf(regenerateDrawers(changed))).toHaveLength(1)
  })

  it('returns the same scene object when nothing changed', () => {
    const once = regenerateDrawers(sceneOf(CARCASE_PRESETS[0].params))
    expect(regenerateDrawers(once)).toBe(once)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/regenerateDrawers.test.ts`
Expected: FAIL — `Failed to resolve import "./regenerateDrawers"`.

- [ ] **Step 3: Write the implementation**

**Superseded in one place by Task 7b:** the snippet below keys `existing` over driven drawers only,
which gives a detached drawer's opening a second, driven drawer beside it. The shipped rule keys
over *all* drawers — a detached one satisfies its opening and comes back by identity — and releases
`sectionId` to `null` on a detached drawer whose opening is gone. Read `src/scene/regenerateDrawers.ts`
rather than this snippet for that line.

Create `src/scene/regenerateDrawers.ts`:

```ts
import type { CarcaseComponent, Component, DrawerComponent, Scene } from './types'
import { defaultDrawerParams } from './drawerBox'
import { resolveSections } from './sectionTree'
import { sectionOpenings } from './sectionInterior'
import { openingRect, sectionThickness } from './carcaseRoles'
import { overridesOf, roleThicknessFor } from './resolveThickness'

const keyOf = (cabinetId: string | null, sectionId: string): string => `${cabinetId}|${sectionId}`

// Which openings of a cabinet wear a drawer front, in the order `sectionOpenings` states — bottom
// left first, up a column before across.
function drawerOpeningsOf(cabinet: CarcaseComponent, scene: Scene): string[] {
  const p = cabinet.params
  const thicknessOf = roleThicknessFor(p, scene.materials, overridesOf(scene.parts, cabinet.id))
  const tree = resolveSections(p.section, openingRect(p, thicknessOf), sectionThickness(thicknessOf))
  return sectionOpenings(p.section, tree)
    .filter((o) => o.front?.kind === 'drawer-front')
    .map((o) => o.sectionId)
}

// Stage one of the regeneration pipeline, and the only pass that adds or removes components.
//
// It runs BEFORE `regenerateComponents` because the carcase's slide machining reads drawer
// *parameters*, while the drawer reads nothing the carcase *emits* — its inputs are the section
// tree, the drawer params and the materials, all of which exist before the carcase pass. Run the
// other way round, the first pass after an opening becomes a drawer front bores no slide screws
// and the second does: convergence over two passes rather than idempotence in one.
export function regenerateDrawers(scene: Scene): Scene {
  const carcases = scene.components.filter((c): c is CarcaseComponent => c.kind === 'carcase')
  if (carcases.length === 0) return scene

  // Keyed by (cabinet, section) and never by index: the v12 divider shim rebuilds section ids on
  // every keystroke, so an index would rebind a drawer to a different bay.
  const existing = new Map<string, DrawerComponent>()
  for (const c of scene.components) {
    if (c.kind === 'drawer' && c.driven) existing.set(keyOf(c.parentId, c.sectionId), c)
  }

  const kept: DrawerComponent[] = []
  const wanted = new Set<string>()

  for (const cabinet of carcases) {
    for (const sectionId of drawerOpeningsOf(cabinet, scene)) {
      const key = keyOf(cabinet.id, sectionId)
      wanted.add(key)
      const found = existing.get(key)
      kept.push(
        found ?? {
          kind: 'drawer',
          id: `cmp_${crypto.randomUUID()}`,
          label: 'Drawer',
          parentId: cabinet.id,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
          sectionId,
          params: defaultDrawerParams('side-mount'),
          driven: true,
        },
      )
    }
  }

  // A detached drawer is the user's: no regeneration and no deletion, exactly as a detached part is
  // preserved when its role disappears.
  const others: Component[] = scene.components.filter(
    (c) => c.kind !== 'drawer' || !c.driven,
  )

  const next: Component[] = [...others, ...kept]
  const unchanged =
    next.length === scene.components.length && next.every((c) => scene.components.includes(c))
  return unchanged ? scene : { ...scene, components: next }
}
```

Before writing this, **check two things against the code rather than trusting the plan**:

1. `sectionOpenings`'s real return shape. The filter above reads `o.front?.kind`. If the field is
   named differently, use the real name. Do not add a second way to ask what a section wears.
2. Whether `openingRect` and `sectionThickness` are exported from `carcaseRoles.ts`. If not, export
   them — `carcaseMachining` already uses them exactly this way, so this makes an existing seam
   reusable rather than inventing one.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/scene/regenerateDrawers.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Mutation-test the reconciliation key and the detach rule**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/regenerateDrawers.ts "$SP"/rd.bak

echo "=== Mutation A: reconcile by cabinet alone ==="
python3 - <<'PY'
import io
p='src/scene/regenerateDrawers.ts'
s=io.open(p,encoding='utf-8').read()
old="const keyOf = (cabinetId: string | null, sectionId: string): string => `${cabinetId}|${sectionId}`"
assert s.count(old)==1
new="const keyOf = (cabinetId: string | null, _sectionId: string): string => `${cabinetId}`"
io.open(p,'w',encoding='utf-8').write(s.replace(old,new))
PY
grep -q "_sectionId" src/scene/regenerateDrawers.ts && echo "A APPLIED"
pnpm vitest run src/scene/regenerateDrawers.test.ts
cp "$SP"/rd.bak src/scene/regenerateDrawers.ts && echo "A RESTORED"

echo "=== Mutation B: drop the detach exemption ==="
python3 - <<'PY'
import io
p='src/scene/regenerateDrawers.ts'
s=io.open(p,encoding='utf-8').read()
old="    (c) => c.kind !== 'drawer' || !c.driven,"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"    (c) => c.kind !== 'drawer',"))
PY
pnpm vitest run src/scene/regenerateDrawers.test.ts
cp "$SP"/rd.bak src/scene/regenerateDrawers.ts
diff "$SP"/rd.bak src/scene/regenerateDrawers.ts && echo "B RESTORED, IDENTICAL"
```

Predict before running: mutation A fails the idempotence test and possibly the two-bay test.
Mutation B fails `keeps a detached drawer even when its opening is gone` and nothing else. **If
mutation A fails nothing, the two-bay fixture is not doing its job** — a single-drawer cabinet
cannot tell the two keys apart, so add a second drawer-front opening before continuing.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/regenerateDrawers.ts src/scene/regenerateDrawers.test.ts
git commit -m "feat(scene): reconcile one drawer per drawer-front opening

The first pass in this codebase that adds or removes components. Keyed by
cabinet and section id, never by index: the v12 divider shim rebuilds
section ids on every keystroke and an index would rebind a drawer to a
different bay.

A detached drawer survives its opening, the component-level mirror of the
detached-part rule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 8: Emit the five boards

**Files:**
- Modify: `src/scene/regenerateDrawers.ts`
- Test: `src/scene/regenerateDrawers.test.ts` (append a new `describe`)

- [ ] **Step 1: Write the failing test**

Append to `src/scene/regenerateDrawers.test.ts`. **Do not replace the file.**

```ts
import { SIDE_MOUNT_CLEARANCE, BOTTOM_GROOVE_DEPTH } from './drawerBox'
import type { BoardPart } from './types'

const boardsOf = (s: Scene, drawerId: string): BoardPart[] =>
  s.parts.filter((p): p is BoardPart => p.kind === 'board' && p.parentId === drawerId)

describe('regenerateDrawers — the boards', () => {
  it('emits five boards, one per role', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const roles = boardsOf(out, drawer.id)
      .map((b) => b.role)
      .sort()
    expect(roles).toEqual([
      'box-back',
      'box-bottom',
      'box-front',
      'box-left',
      'box-right',
    ])
  })

  it('parents every board to the drawer, not to the cabinet', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    expect(boardsOf(out, drawer.id)).toHaveLength(5)
    expect(out.parts.filter((p) => p.parentId === 'cmp_1')).toHaveLength(0)
  })

  it('runs the sides the full depth and fits the front and back between them', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const boards = boardsOf(out, drawer.id)
    const left = boards.find((b) => b.role === 'box-left')!
    const front = boards.find((b) => b.role === 'box-front')!
    const t = left.thickness
    // A 564 mm clear opening takes the side clearance off each side; the front then sits between
    // the two sides. Both expectations are built from the fixture's own numbers, not from the
    // function under test.
    expect(front.length).toBeCloseTo(564 - 2 * SIDE_MOUNT_CLEARANCE - 2 * t, 6)
    // Base 600 is 560 deep with a 12 mm captured back, so 548 clear, which picks the 500 nominal.
    expect(left.length).toBe(500)
  })

  it('grooves all four sides for the bottom, and only for side-mount', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const grooved = boardsOf(out, drawer.id).filter((b) =>
      b.cuts.some((c) => c.id.startsWith('groove_')),
    )
    expect(grooved).toHaveLength(4)
    expect(grooved.every((b) => b.role !== 'box-bottom')).toBe(true)
  })

  it('sizes the bottom from the groove rather than from a sixth number', () => {
    const out = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(out)[0]
    const boards = boardsOf(out, drawer.id)
    const bottom = boards.find((b) => b.role === 'box-bottom')!
    const left = boards.find((b) => b.role === 'box-left')!
    const front = boards.find((b) => b.role === 'box-front')!
    // Inside width plus twice the groove depth, derived here from the other boards rather than by
    // calling the function under test.
    expect(bottom.width).toBeCloseTo(front.length + 2 * BOTTOM_GROOVE_DEPTH, 6)
    expect(bottom.length).toBeCloseTo(left.length - 2 * front.thickness + 2 * BOTTOM_GROOVE_DEPTH, 6)
  })

  it('emits no boards at all when the cabinet is too shallow for a runner', () => {
    const shallow = { ...oneDrawer(), depth: 200 }
    const out = regenerateDrawers(sceneOf(shallow))
    const drawer = drawersOf(out)[0]
    expect(drawer).toBeDefined()
    expect(boardsOf(out, drawer.id)).toHaveLength(0)
  })

  it('leaves a detached board alone', () => {
    const once = regenerateDrawers(sceneOf(oneDrawer()))
    const drawer = drawersOf(once)[0]
    const detached = {
      ...once,
      parts: once.parts.map((p) =>
        p.parentId === drawer.id && p.role === 'box-left'
          ? { ...p, driven: false, length: 999 }
          : p,
      ),
    }
    const again = regenerateDrawers(detached)
    const left = boardsOf(again, drawer.id).find((b) => b.role === 'box-left')!
    expect(left.length).toBe(999)
  })
})
```

**On the 564 and the 500 above — these were measured, not assumed.** Base 600 is 600 wide with 18 mm
sides, so the opening is 564 clear. It is 560 deep with a 12 mm captured back, so `clearDepth` is
**548**, which picks the **500** nominal, not 550. An earlier draft of this plan said 550 and was
wrong. **Re-measure before writing the test** and fix the number if a preset has changed; never
weaken the assertion into something that cannot fail.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/regenerateDrawers.test.ts`
Expected: FAIL — no boards are emitted yet.

- [ ] **Step 3: Extend the implementation**

In `src/scene/regenerateDrawers.ts`, after the component reconciliation, emit each drawer's boards.
Add these imports:

```ts
import type { BoardPart, BoxCut, Part } from './types'
import { drawerBoxMetrics, type DrawerBoxMetrics } from './drawerBox'
import { clearDepth } from './carcaseRoles'
import { frontCells } from './frontCells'
import { PART_COLORS } from './palette'
```

and this emission, modelled on `regenerateOne`'s reconcile-by-role-key loop so a detached board is
preserved the same way:

```ts
const BOX_ROLES = ['box-left', 'box-right', 'box-front', 'box-back', 'box-bottom'] as const

interface BoxBoard {
  role: (typeof BOX_ROLES)[number]
  label: string
  length: number
  width: number
  thickness: number
  cuts: BoxCut[]
}

// The five boards a box is, derived from the one statement of its geometry. The bottom's size
// follows the groove rather than being a sixth number that can drift out of step with it.
function boxBoards(m: DrawerBoxMetrics, t: number): BoxBoard[] {
  const outerWidth = m.box.x1 - m.box.x0
  const depth = m.box.y1 - m.box.y0
  const height = m.box.z1 - m.box.z0
  const insideWidth = outerWidth - 2 * t
  const insideDepth = depth - 2 * t
  const grooveAdd = m.groove === null ? 0 : 2 * m.groove.depth

  const groove = (length: number): BoxCut[] =>
    m.groove === null
      ? []
      : [
          {
            kind: 'box',
            id: `groove_bottom`,
            label: 'Bottom groove',
            position: { x: 0, y: m.groove.up, z: -t / 2 },
            size: { x: length, y: m.groove.depth, z: 2 * t },
          },
        ]

  return [
    { role: 'box-left', label: 'Box side L', length: depth, width: height, thickness: t, cuts: groove(depth) },
    { role: 'box-right', label: 'Box side R', length: depth, width: height, thickness: t, cuts: groove(depth) },
    { role: 'box-front', label: 'Box front', length: insideWidth, width: height, thickness: t, cuts: groove(insideWidth) },
    { role: 'box-back', label: 'Box back', length: insideWidth, width: height, thickness: t, cuts: groove(insideWidth) },
    {
      role: 'box-bottom',
      label: 'Box bottom',
      length: insideDepth + grooveAdd,
      width: insideWidth + grooveAdd,
      thickness: t,
      cuts: [],
    },
  ]
}
```

Then, inside `regenerateDrawers`, after `kept` is built, produce the parts. Reuse the existing
`byRole` reconcile shape from `regenerateOne` so a detached board survives:

**`kept` holds detached drawers as well as driven ones** (Task 7b: a detached drawer satisfies its
opening and is returned by identity, exactly as `regenerateOne` returns a detached part). So this
loop must skip a drawer that is not `driven` before it touches anything — otherwise it regenerates
the boards of the very drawer `driven: false` was added to leave alone, and the per-board
`detachedBoards` rule below would not save them: a detached drawer's boards are ordinarily driven.
Skipping leaves that drawer's parts untouched in `parts`, which is what preservation means here.

```ts
  let parts = scene.parts
  for (const drawer of kept) {
    // A detached drawer is the user's — its boards are not re-derived, whatever their own flags say.
    if (!drawer.driven) continue
    const cabinet = carcases.find((c) => c.id === drawer.parentId)
    if (cabinet === undefined) continue
    const metrics = metricsFor(cabinet, drawer, scene)

    const mine = parts.filter((p) => p.parentId === drawer.id)
    const others = parts.filter((p) => p.parentId !== drawer.id)
    const byRole = new Map<string, Part>()
    for (const p of mine) if (p.role !== undefined) byRole.set(p.role, p)

    // A detached board is the user's: kept, and never regenerated.
    const detachedBoards = mine.filter((p) => !p.driven)

    if (metrics === null) {
      // Too shallow for the smallest runner. The generator declines rather than inventing a size,
      // exactly as a door too thin to bore lists no hinge.
      parts = [...others, ...detachedBoards]
      continue
    }

    const thickness = boxThicknessFor(drawer, scene)
    const generated: Part[] = boxBoards(metrics, thickness).flatMap((b) => {
      const existing = byRole.get(b.role)
      if (existing !== undefined && !existing.driven) return []
      const board: BoardPart = {
        kind: 'board',
        id: existing?.id ?? `board_${crypto.randomUUID()}`,
        label: existing?.label ?? b.label,
        length: b.length,
        width: b.width,
        thickness: b.thickness,
        grain: 'length',
        material: drawer.params.material,
        color: existing?.kind === 'board' ? existing.color : PART_COLORS[0],
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        cuts: b.cuts,
        visible: true,
        parentId: drawer.id,
        driven: true,
        role: b.role,
      }
      return [board]
    })

    parts = [...others, ...detachedBoards, ...generated]
  }
```

You must write two small helpers this references, `metricsFor` and `boxThicknessFor`:

```ts
// The drawer's own opening rectangle, taken from the same `frontCells` the carcase reads. Reading
// the cells rather than the emitted front is what keeps this stage independent of the carcase pass.
function metricsFor(
  cabinet: CarcaseComponent,
  drawer: DrawerComponent,
  scene: Scene,
): DrawerBoxMetrics | null {
  const p = cabinet.params
  const thicknessOf = roleThicknessFor(p, scene.materials, overridesOf(scene.parts, cabinet.id))
  const tree = resolveSections(p.section, openingRect(p, thicknessOf), sectionThickness(thicknessOf))
  const cells = frontCells(p.section, tree, {
    outer: { x0: 0, x1: p.width, z0: 0, z1: p.height },
    mount: p.frontMount,
    reveal: p.frontReveal,
  })
  const cell = cells.find((c) => c.sectionId === drawer.sectionId)
  if (cell === undefined) return null
  // The SECTION's rect, not the cell's. An overlay cell reaches the material midline, so it is
  // wider than the opening the box has to fit inside.
  const opening = tree.rects.get(drawer.sectionId)
  if (opening === undefined) return null
  const frontThickness = thicknessOf(`front-${cell.sectionId}-${cell.leaf}`)
  const backThickness = thicknessOf('back')
  return drawerBoxMetrics(opening, drawer.params, {
    clearDepth: clearDepth(p, backThickness),
    frontThickness,
    inset: p.frontMount === 'inset',
    sideThickness: boxThicknessFor(drawer, scene),
  })
}

function boxThicknessFor(drawer: DrawerComponent, scene: Scene): number {
  return scene.materials[drawer.params.material]?.thickness ?? 15
}
```

**Check `frontCells`'s `outer` argument against `carcaseMachining`'s call** before writing this. That
call uses `z0: floorZ(p)`, not `0`. Use whatever the carcase uses; a toe-kick cabinet's cells start
above the floor and a mismatch here puts every box 100 mm out.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/scene/regenerateDrawers.test.ts`
Expected: PASS. If the bottom-size test fails by exactly a groove depth, the `grooveAdd` term is on
the wrong side; fix the code, not the test.

- [ ] **Step 5: Mutation-test the decline path and the bottom size**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/regenerateDrawers.ts "$SP"/rd2.bak

echo "=== Mutation A: emit a box even when no runner fits ==="
python3 - <<'PY'
import io
p='src/scene/regenerateDrawers.ts'
s=io.open(p,encoding='utf-8').read()
old="    if (metrics === null) {"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"    if (false) {"))
PY
pnpm vitest run src/scene/regenerateDrawers.test.ts
cp "$SP"/rd2.bak src/scene/regenerateDrawers.ts

echo "=== Mutation B: bottom ignores the groove ==="
python3 - <<'PY'
import io
p='src/scene/regenerateDrawers.ts'
s=io.open(p,encoding='utf-8').read()
old="  const grooveAdd = m.groove === null ? 0 : 2 * m.groove.depth"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"  const grooveAdd = 0"))
PY
pnpm vitest run src/scene/regenerateDrawers.test.ts
cp "$SP"/rd2.bak src/scene/regenerateDrawers.ts
diff "$SP"/rd2.bak src/scene/regenerateDrawers.ts && echo "RESTORED, IDENTICAL"
```

Predict: mutation A fails `emits no boards at all when the cabinet is too shallow`. Mutation B fails
`sizes the bottom from the groove`. Mutation A may not compile under `noUnusedLocals`; if so, that
is an acceptable outcome — record it and restore.

- [ ] **Step 5b: The joinery checklist cannot call a drawer-internal touch a contact**

Found during the Task 5 review, before any board existed to hit it. `declaredContact` in
`src/scene/jointChecklist.ts:111` reads:

```ts
if (parent === undefined || parent.kind !== 'carcase') return false
```

so a pair whose shared parent is a **drawer** can never be classified `contact`, whatever it
touches. Measured with two abutting `box-` boards under a drawer component and no joint between
them: the pair lands in `unresolved` with state `no-offer`, and `contact` is empty. Under a carcase
the same shape produces contact rows — the suite's own fixtures produce 5, 9 and 14.

The screwed pairs are unaffected: the recorded-joint branch runs **before** `declaredContact`, so
sides-to-front/back read `jointed`. The exposed pairs are the ones with no joint — the **bottom
against the four walls it sits in the groove of** — which is four `no-offer` rows per drawer on the
"no joint available" list, forever, in a cabinet that is correctly built.

Decide and implement here, because this is the step that first creates the boards:

1. State a `drawerContactPairs(params, thicknessOf)` beside `carcaseContactPairs` naming the pairs
   a correct box leaves unjointed, and widen the `parent.kind !== 'carcase'` guard to dispatch on
   the kind rather than reject it. Preferred: it is the same shape as the carcase rule, and it
   keeps "a contact the generator does not name is an unjoined pair on the checklist forever" true
   for both component kinds.
2. Or emit a joint for the bottom-in-groove pairs, if Task 9's undermount bottom makes that the
   honest description. Then no contact table is needed and the guard can stay as it is.

Whichever is chosen, the test is a count off the emitted boards: `contact` and `unresolved` lengths
for one side-mount drawer, asserted as numbers. Mutation-test by reverting the guard and watching
that count move.

**Also decide, in the same step:** `sharedComponent` groups a row under `ancestorsOf(a, byId)[0]`,
the *immediate* parent, so drawer rows form their own checklist group labelled with the drawer's
label rather than the cabinet's. That is **not** automatically the `nearestCarcase` defect Task 1
fixed for the two BOM consumers — a drawer's joinery listed under the drawer may well be what a
user wants, unlike a cutting-list row where cross-cabinet merging is the whole point. State the
choice; do not let it default silently.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/regenerateDrawers.ts src/scene/regenerateDrawers.test.ts
git commit -m "feat(scene): a drawer emits its five boards

Sides, front, back and a bottom whose size follows the groove rather than
being a sixth number that can drift. Boards hang off the drawer, not the
cabinet, which is what the nearest-carcase rule in Task 1 exists to
resolve downstream.

Declines entirely when no runner fits, rather than emitting a box beside
a runner the hardware list does not quote.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 8b: Place the boards, and derive their grain

Added after Task 8 shipped: no task in the plan ever gave a drawer board a position, so all five sat
at `{0,0,0}` — five coincident boards in a cabinet corner, and a pile for Task 12's drawing baseline
to measure. Placement is not a line bolted onto Task 8, because the mapping that places a board also
decides which of its dimensions is the length, and that contradicts two of Task 8's assertions.

**Files:**
- Modify: `src/scene/regenerateDrawers.ts`
- Modify: `src/scene/grain.ts`
- Modify: `src/scene/regenerateDrawers.test.ts`

**The two decisions:**

1. **Place the boards through `orientedPanel`.** It is the codebase's one carcase-box-to-board
   mapping, and `GRAIN_IN_PLANE` in `grain.ts` is the stated contract of it. A second mapping for
   drawer boards would be free to disagree with the one every carcase panel goes through.
2. **Grain runs along each board's horizontal run** — the sides front-to-back, the front and back
   left-to-right, the bottom across.

**What `orientedPanel` gives, measured:**

| role | thickness axis | length | width |
| --- | --- | --- | --- |
| `box-left` / `box-right` | `x` | box depth | box height |
| `box-front` / `box-back` | `y` | box height | inside width |
| `box-bottom` | `z` | inside width + 2·groove | inside depth + 2·groove |

**The grain, derived not tabulated** — `grainFieldFor(thicknessAxis, grainAxisOf(role))`, exactly as
`carcaseRoles.ts` derives a panel's:

| role | grain axis (carcase) | board field |
| --- | --- | --- |
| `box-left` / `box-right` | `y` | `length` |
| `box-front` / `box-back` | `x` | `width` |
| `box-bottom` | `x` | `length` |

Task 8's hardcoded `grain: 'length'` on all five is therefore wrong for the front and back. The five
box roles go into `grainAxisOf`, which is deliberately fatal on a role it has no convention for.

**Steps:**

1. Add the five box roles to `grainAxisOf` in `src/scene/grain.ts` — `box-left`/`box-right` → `'y'`,
   `box-front`/`box-back`/`box-bottom` → `'x'`.
   → verify: `pnpm vitest run src/scene/grain.test.ts`; the sweep's role-coverage test walks
   `carcaseBoxes` roles only, so it is unaffected, and the `'plinth'` throw test still passes.
2. Rewrite `boxBoards` in `src/scene/regenerateDrawers.ts` to build each board's **carcase box** and
   run it through `orientedPanel`. The four walls are one list carrying `role`, `label`, `box`,
   `thicknessAxis` and `minSide`; the bottom is built beside them at
   `z ∈ [box.z0 + groove.up, … + t]`, its x and y extents reaching one groove depth into all four
   walls. `BoxBoard` carries a `PanelSpec` and a derived `Grain` instead of three loose numbers.
   → verify: `pnpm typecheck`.
3. Follow the groove into the new board axes. The slot's *height above the box floor* is board **y**
   on a side (thickness on `x`) and board **x** on a front or back (thickness on `y`), and the face
   it is cut into is board `+Z` on the min-side wall (left, front) and `-Z` on the one facing it
   (right, back) — `orientedPanel` puts a board's origin on its box's min corner, so a min-side wall
   meets the box interior at board `z = t`. A single face for all four puts two grooves on the
   outside of the box.
   → verify: the groove tests below.
4. In `reconcileBoards`, read `b.panel.length` / `.width` / `.thickness` / `.position` / `.rotation`
   / `.rotationOrder` and `b.grain`.
   → verify: `pnpm vitest run src/scene/regenerateDrawers.test.ts`.

**Task 8 assertions that change** (state the new figure, never weaken the test):

- `front.length === insideWidth` → `front.width === insideWidth`, plus
  `front.length === left.width` (the box height).
- `bottom.length === insideDepth + 2·groove` and `bottom.width === insideWidth + 2·groove` → the two
  swap. `left.length === 500` is already consistent and stays.

**Tests to add:**

- *places the five boards as one box* — every board's carcase AABB read back through
  `resolveWorldMatrix` + `applyMatrixToPoint`, then asserted as **relations**: the sides one inside
  width apart, the front and back one inside depth apart and spanning exactly the gap between the
  sides, all four walls on one floor, the bottom one groove depth into each wall and `up` above the
  floor. Two absolute figures (`left.min.x`, `left.min.z`) pin the box to its opening rather than to
  the origin. This is the test that would have caught the pile.
- *cuts every groove in the wall that faces the box* — the groove's AABB is flush with the wall's
  inner face and only `BOTTOM_GROOVE_DEPTH` across.
- *puts all four grooves at one height, across the whole span of their wall*.
- *derives each board's grain field* and *runs every board's grain along its own horizontal run* —
  the field per role, and the carcase axis behind it.

**Not changed:** `shapeKey()` encodes dimensions and cuts, never placement — the Viewport applies
position and rotation directly — so it needs no update. Confirmed by reading it, not assumed.

**Verify:** `pnpm typecheck && pnpm lint && pnpm test`.

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc
```

---

## Task 9: The undermount box

No groove, a notched back, and a locating hole. The family that needs geometry the other does not.

> **Amended 2026-09-13, during implementation. The steps below are kept verbatim; these three
> decisions override them where they disagree.** Notes:
> `docs/superpowers/notes/2026-09-12-drawer-boxes-notes.md`, entry of the same date.
>
> **1. The undermount box IS grooved — sides and front — and only the back is notched.** "No groove,
> the bottom rests on the runner" is wrong: a TANDEM box is grooved in the sides and the front, the
> bottom is captured on three sides, and the runner carries it from underneath. So `grooveOf(...)`
> applies to `box-left`, `box-right` and `box-front` in BOTH families, and `box-back` alone takes
> notches and locating holes instead. Consequences:
> - `DrawerBoxMetrics.groove` stops being nullable — the family no longer reaches it. Step 4's
>   `boxBoards` signature change still happens, but the family decides *which walls* are grooved,
>   not *whether*.
> - Step 1's test *grooves nothing* becomes *grooves the sides and front, and notches the back*:
>   three grooved roles, one notched.
> - Step 1's test *sizes the bottom to the box interior with nothing added* is wrong twice over. The
>   bottom takes a groove depth on **three** edges, not four and not none: `length` (carcase x) is
>   `insideWidth + 2 × BOTTOM_GROOVE_DEPTH`, `width` (carcase y) is `insideDepth + 1 ×`. Its
>   assertion `bottom.width ≈ front.length` compares a depth against a height and does not survive
>   Task 8b at all — see decision 4 below.
> - The guard clause `box.z1 <= box.z0` in `drawerBoxMetrics` becomes fully covered by the groove
>   clause and is a mutation no test kills. It is kept, and both it and the test that used to
>   isolate it say so.
>
> **2. The notch figures got one research attempt.** A search reached a distributor's summary of
> Blum's 563H installation drawing and corroborated all four: 12.7 × 35 mm notch, ⌀6 × 10 mm hook
> bore. The printed instructions themselves were blocked by the egress proxy. The plan's unexplained
> `+ 10` for the hole's height above the notch became `UNDERMOUNT_HOLE_ABOVE_NOTCH = 7`, carrying
> the caveat that the drawing's 7 and 11 are not distinguishable from the summaries reached.
>
> **3. The joinery checklist is out of scope**, deferred past Task 14. `jointChecklist.ts` untouched.
>
> **4. Three axis and convention fixes Task 8b forces on step 4's `backNotches`,** all measured:
> - `box-back` has thickness on y, so board x is the box HEIGHT and board y the span across it. The
>   plan's `size` has the two swapped: it must be `{ x: NOTCH_HEIGHT, y: NOTCH_WIDTH }`.
> - The locating hole's face is derived from the wall's `minSide` — `box-back` sits at the box's max
>   y, so its inner face is board `-Z` — never hardcoded `'-Y'`. `innerFaceOf` states it once for the
>   groove and the bore together.
> - The through-cut overshoot is the codebase's `position.z = -t/2`, `size.z = 2t`, not `-1` / `100`.

> **Amended again 2026-09-13 — Task 9b, the undermount back sits on its bottom.** The user decided
> the open choice Task 9 left: **the bottom runs the box's full depth and the back stands on top of
> it**, the way a TANDEM box is assembled and what gives the back a face to be screwed down to. Two
> extents move, and only for `undermount`:
> - the bottom's rear edge goes from the back's inner face to the box's full depth, gaining the
>   back's thickness — on a Base 600 with 15 mm sides its width is **476 → 491**;
> - the back's bottom edge rises from the box floor to the bottom's upper face, so its length (the
>   box height, on a thickness-on-y panel) is **559 → 534**.
>
> The back is therefore shorter by `BOTTOM_GROOVE_UP + t` = **25 mm**, not by the bottom's thickness
> alone: the bottom still sits in its groove rather than on the box floor. The second decision taken
> with it is that **both families keep the one 10 mm groove height** — no second figure — which
> Task 9 already did.
>
> Side-mount is unchanged and that is now a real difference between the families, asserted as a
> difference rather than per family. The three groove allowances on the bottom (both sides and the
> front) are untouched and still right; only the fourth edge changed, and it gains a wall thickness
> rather than a groove depth. `shapeKey()` needs no change — the dimensions it encodes moved, the
> function did not.
>
> **Left open:** the notches are placed from the back's own bottom edge, so in carcase space they
> rose 25 mm with it. See the notes entry for why that is flagged rather than resolved.

> **Amended again 2026-09-13 — Task 9c, the locking cut-outs belong to the bottom.** The user
> decided what Task 9b left open: **the two cut-outs move to the BOTTOM board's rear corners, and
> the back keeps only its ⌀6 locating bore.** The locking device is fixed to the runner at the box
> floor, so once the back stands on a full-depth bottom it is the bottom, not the back, that lies
> between the device and the box. Nothing about side-mount changes — it has neither a cut-out nor a
> bore.
>
> **The cited figure is reinterpreted, not re-sourced.** The 1/2″ × 1-3/8″ rectangle is the same
> rectangle; which board wears it decides what its two extents mean. `UNDERMOUNT_NOTCH_HEIGHT` →
> **`UNDERMOUNT_CUTOUT_DEPTH`** (12.7), now a depth measured IN from the bottom's rear edge rather
> than a height up the back; `UNDERMOUNT_NOTCH_WIDTH` → **`UNDERMOUNT_CUTOUT_WIDTH`** (35), still a
> width across the box. `UNDERMOUNT_HOLE_ABOVE_NOTCH` → **`UNDERMOUNT_HOLE_ABOVE_BOTTOM`** (7),
> measured from the back's own bottom edge — which stands on the bottom's upper face, the plane the
> device is presented at now the cut-out is in the bottom. The cut ids follow: `notch_{i}` →
> `cutout_{i}`, and `locate_{i}` is unchanged.
>
> On a Base 600 with 15 mm box stock (box floor at carcase z = 118, bottom at z 128–143), in carcase
> millimetres:
>
> | | before (9b) | after (9c) |
> | --- | --- | --- |
> | cut-out board | `box-back` | `box-bottom` |
> | cut-out 0, across (x) | 39 → 74 | 33 → 68 |
> | cut-out 1, across (x) | 526 → 561 | 532 → 567 |
> | cut-out, 12.7 mm extent | z 143 → 155.7 (a height) | y 487.3 → 500 (a depth in from the rear) |
> | cut-out, through-thickness | y, through the back | z, through the bottom |
> | bore | (56.5, 485, 162.7) | (50.5, 485, 150) |
>
> **The bore moved across the box as well as down it.** The bottom reaches a groove depth further
> out on each side than the back spans, so the two boards are prepared from ONE statement of where
> the device sits — `deviceX`, in carcase x — rather than each measuring from its own board's end.
> Measured from the back's own end the bore would land 6 mm off a ⌀6 hole: a complete miss.
>
> `box-bottom`'s dimensions do **not** change. A corner cut-out removes material; it does not resize
> the board. `shapeKey()` needs no change either — both kinds of cut were already encoded.

**Files:**
- Modify: `src/scene/regenerateDrawers.ts`
- Modify: `src/scene/drawerBox.ts`
- Test: `src/scene/regenerateDrawers.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/regenerateDrawers.test.ts`. **Do not replace the file.**

```ts
describe('regenerateDrawers — the undermount box', () => {
  const undermountDrawer = (s: Scene): Scene => ({
    ...s,
    components: s.components.map((c) =>
      c.kind === 'drawer' ? { ...c, params: { ...c.params, family: 'undermount' as const } } : c,
    ),
  })

  const built = () => {
    const first = regenerateDrawers(sceneOf(oneDrawer()))
    return regenerateDrawers(undermountDrawer(first))
  }

  it('grooves nothing', () => {
    const out = built()
    const drawer = drawersOf(out)[0]
    const grooved = boardsOf(out, drawer.id).filter((b) =>
      b.cuts.some((c) => c.id.startsWith('groove_')),
    )
    expect(grooved).toHaveLength(0)
  })

  it('notches the back for the locking device, and only the back', () => {
    const out = built()
    const drawer = drawersOf(out)[0]
    const notched = boardsOf(out, drawer.id).filter((b) =>
      b.cuts.some((c) => c.id.startsWith('notch_')),
    )
    expect(notched.map((b) => b.role)).toEqual(['box-back'])
    // Two locking devices, one at each end of the back.
    expect(notched[0].cuts.filter((c) => c.id.startsWith('notch_'))).toHaveLength(2)
  })

  it('bores a locating hole above each notch', () => {
    const out = built()
    const drawer = drawersOf(out)[0]
    const back = boardsOf(out, drawer.id).find((b) => b.role === 'box-back')!
    expect(back.cuts.filter((c) => c.kind === 'hole-array')).toHaveLength(2)
  })

  it('still emits five boards', () => {
    const out = built()
    expect(boardsOf(out, drawersOf(out)[0].id)).toHaveLength(5)
  })

  // The bottom is not grooved in, so it is not enlarged by a groove depth either.
  it('sizes the bottom to the box interior with nothing added', () => {
    const out = built()
    const drawer = drawersOf(out)[0]
    const boards = boardsOf(out, drawer.id)
    const bottom = boards.find((b) => b.role === 'box-bottom')!
    const front = boards.find((b) => b.role === 'box-front')!
    expect(bottom.width).toBeCloseTo(front.length, 6)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/regenerateDrawers.test.ts -t "undermount box"`
Expected: FAIL — the back carries no notches.

- [ ] **Step 3: Add the undermount figures**

In `src/scene/drawerBox.ts`, beside the other stated constants:

```ts
// Blum TANDEM locking-device cut-out, one at each end of the drawer back, plus a locating hole
// above each. Sourced from vendor summaries rather than Blum's printed instructions — see the
// spec's sourcing warning. Confirm before cutting.
export const UNDERMOUNT_NOTCH_HEIGHT = 12.7
export const UNDERMOUNT_NOTCH_WIDTH = 35
export const UNDERMOUNT_HOLE_DIAMETER = 6
export const UNDERMOUNT_HOLE_DEPTH = 10
```

- [ ] **Step 4: Emit them**

In `src/scene/regenerateDrawers.ts`, extend `boxBoards` so the back carries the notches and holes
for the undermount family. Change the signature to take the family, and replace the `box-back`
entry:

```ts
function boxBoards(m: DrawerBoxMetrics, t: number, family: RunnerFamily): BoxBoard[] {
```

```ts
    {
      role: 'box-back',
      label: 'Box back',
      length: insideWidth,
      width: height,
      thickness: t,
      cuts: family === 'undermount' ? backNotches(insideWidth) : groove(insideWidth),
    },
```

and add:

```ts
// A locking-device notch at each end of the back, with a locating hole above it. The notch is a box
// cut and the hole is a single-hole array, both of which the generator already emits and shapeKey
// already encodes — no new cut kind is needed for either.
function backNotches(insideWidth: number): CutDef[] {
  return [0, 1].flatMap((i) => {
    const x = i === 0 ? 0 : insideWidth - UNDERMOUNT_NOTCH_WIDTH
    return [
      {
        kind: 'box' as const,
        id: `notch_${i}`,
        label: 'Runner notch',
        position: { x, y: 0, z: -1 },
        size: { x: UNDERMOUNT_NOTCH_WIDTH, y: UNDERMOUNT_NOTCH_HEIGHT, z: 100 },
      },
      {
        kind: 'hole-array' as const,
        id: `locate_${i}`,
        label: 'Runner locating hole',
        face: '-Y' as const,
        axis: 'U' as const,
        start: { x: x + UNDERMOUNT_NOTCH_WIDTH / 2, y: UNDERMOUNT_NOTCH_HEIGHT + 10, z: 0 },
        pitch: 32,
        count: 1,
        diameter: UNDERMOUNT_HOLE_DIAMETER,
        depth: UNDERMOUNT_HOLE_DEPTH,
      },
    ]
  })
}
```

Widen `BoxBoard['cuts']` from `BoxCut[]` to `CutDef[]` and update the imports. Pass the family
through at the call site: `boxBoards(metrics, thickness, drawer.params.family)`.

**Check `CutDef`, `BoxCut` and `HoleArrayCut` in `src/scene/types.ts` before writing this**, and use
the real field names. The `face` and `axis` values above follow `slideScrewRow`'s shape; if the box
back's outward normal is not `-Y` in board axes, use the one the generator actually uses elsewhere
for a face bored from outside.

- [ ] **Step 5: Run it and watch it pass**

Run: `pnpm vitest run src/scene/regenerateDrawers.test.ts`
Expected: PASS, every describe in the file.

- [ ] **Step 6: Mutation-test the family split in the emission**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/regenerateDrawers.ts "$SP"/rd3.bak
python3 - <<'PY'
import io
p='src/scene/regenerateDrawers.ts'
s=io.open(p,encoding='utf-8').read()
old="      cuts: family === 'undermount' ? backNotches(insideWidth) : groove(insideWidth),"
assert s.count(old)==1
io.open(p,'w',encoding='utf-8').write(s.replace(old,"      cuts: groove(insideWidth),"))
PY
pnpm vitest run src/scene/regenerateDrawers.test.ts
cp "$SP"/rd3.bak src/scene/regenerateDrawers.ts
diff "$SP"/rd3.bak src/scene/regenerateDrawers.ts && echo RESTORED
```

Predict: the three undermount tests about notches, holes and grooves fail; the side-mount block
stays green. If the side-mount block also fails, the two families are sharing state they should not.

- [ ] **Step 7: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/drawerBox.ts src/scene/regenerateDrawers.ts src/scene/regenerateDrawers.test.ts
git commit -m "feat(scene): the undermount box, notched back and all

No groove: the bottom rests on the runner. Two locking-device notches and
a locating hole above each, both expressible as cuts the generator
already emits, so shapeKey needs no change.

Every figure here is from a vendor summary rather than Blum's printed
instructions. Confirm before cutting.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 10: Three stages in the pipeline

**Files:**
- Modify: `src/scene/useScene.ts:60-62`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/scene/useScene.test.ts`, in whichever describe covers the pipeline. **Do not replace
the file.**

```ts
  // Drawers run FIRST. The carcase's slide machining reads drawer parameters, while the drawer
  // reads nothing the carcase emits. Run the other way round, the first pass after an opening
  // becomes a drawer front bores no slide screws and the second does — convergence over two passes
  // rather than idempotence in one.
  it('settles a new drawer front in a single pass', () => {
    const base = CARCASE_PRESETS[0].params
    const params = { ...base, section: setFrontOn(base.section, base.section.id, { kind: 'drawer-front' }) }
    const scene: Scene = {
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [
        {
          kind: 'carcase',
          id: 'cmp_1' as ComponentId,
          label: 'Base A',
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
          params,
        },
      ],
    }
    const once = applyPipeline(scene)
    const twice = applyPipeline(once)
    const slidesIn = (s: Scene) =>
      s.parts.filter(
        (p) => p.kind === 'board' && p.cuts.some((c) => c.id.startsWith('slide_')),
      ).length
    // The first pass must already have bored them. If this is 0 and the second is not, the stages
    // are in the wrong order.
    expect(slidesIn(once)).toBeGreaterThan(0)
    expect(slidesIn(twice)).toBe(slidesIn(once))
  })
```

`applyPipeline` is module-private today. Export it for the test rather than reaching through a hook:

```ts
export function applyPipeline(scene: Scene): Scene {
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/scene/useScene.test.ts -t "settles a new drawer front"`
Expected: FAIL — no slide cuts at all, because nothing creates a drawer yet in the pipeline.

- [ ] **Step 3: Add the stage**

In `src/scene/useScene.ts`, replace:

```ts
function applyPipeline(scene: Scene): Scene {
  return reconcileJoints(regenerateComponents(scene))
}
```

with:

```ts
// Three stages, in this order, always. Drawers lead because the carcase's slide machining reads
// drawer *parameters* while the drawer reads nothing the carcase *emits* — its inputs are the
// section tree, the drawer params and the materials, all of which exist before the carcase pass.
// Reversed, a new drawer front would need two passes to settle: the first would bore no slide
// screws and the second would. All three stages are pure and idempotent.
export function applyPipeline(scene: Scene): Scene {
  return reconcileJoints(regenerateComponents(regenerateDrawers(scene)))
}
```

Add the import:

```ts
import { regenerateDrawers } from './regenerateDrawers'
```

- [ ] **Step 4: Run it**

Run: `pnpm vitest run src/scene/useScene.test.ts`
Expected: the idempotence half passes. The `slidesIn(once) > 0` half **still fails**, because
`carcaseMachining` does not yet read the box. That is expected and is Task 11's job. Mark this step
done only once you have confirmed the failure is that specific assertion and no other.

- [ ] **Step 5: Commit the stage**

```bash
pnpm typecheck && pnpm lint
pnpm vitest run src/scene/regenerateDrawers.test.ts src/scene/drawerBox.test.ts
git add src/scene/useScene.ts
git commit -m "feat(scene): the regeneration pipeline gains a third stage

regenerateDrawers, then regenerateComponents, then reconcileJoints.
Drawers lead because the carcase reads drawer parameters while the drawer
reads nothing the carcase emits. Reversed, a new drawer front needs two
passes to settle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

**Note:** this commit leaves one test failing on purpose, and the pre-commit hook only runs the
typecheck, so it will pass. Task 11 closes it. If you would rather not commit red, fold Tasks 10 and
11 into one commit — say so in the message rather than leaving it unexplained.

---

## Task 11: Re-baseline the slide screw height

The reason this whole stage exists. **Shipped machining positions move here.** Measure what moves;
do not assert that nothing does.

**Files:**
- Modify: `src/scene/carcaseRoles.ts:1057-1062`, `:1121-1128`
- Modify: `src/scene/regenerateComponents.ts:70`
- Test: `src/scene/carcaseRoles.test.ts`

- [ ] **Step 1: Measure the current behaviour before changing it**

Write a scratch test, run it, record the numbers, then delete it. Do not skip this: the plan's
expected values below are predictions, and this project's repeated lesson is that predictions are
the things that turn out wrong.

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cat > src/scene/__slidebaseline.test.ts <<'EOF'
import { describe, it } from 'vitest'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { regenerateComponents } from './regenerateComponents'
import { setFrontOn } from './sectionInterior'
import type { ComponentId, Scene } from './types'

describe('baseline', () => {
  it('records every slide row the presets bore today', () => {
    const rows: string[] = []
    for (const preset of CARCASE_PRESETS) {
      const params = {
        ...preset.params,
        section: setFrontOn(preset.params.section, preset.params.section.id, {
          kind: 'drawer-front' as const,
        }),
      }
      const scene: Scene = {
        parts: [],
        materials: { ...PRESET_MATERIALS },
        hardware: [],
        joints: [],
        components: [
          {
            kind: 'carcase',
            id: 'cmp_1' as ComponentId,
            label: preset.name,
            parentId: null,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            rotationOrder: 'XYZ',
            visible: true,
            params,
          },
        ],
      }
      for (const p of regenerateComponents(scene).parts) {
        if (p.kind !== 'board') continue
        for (const c of p.cuts) {
          if (c.kind === 'hole-array' && c.id.startsWith('slide_')) {
            rows.push(`${preset.name} ${p.role} ${c.id} y=${c.start.y} count=${c.count}`)
          }
        }
      }
    }
    throw new Error('BASELINE\n' + rows.join('\n'))
  })
})
EOF
pnpm vitest run src/scene/__slidebaseline.test.ts 2>&1 | sed -n '/BASELINE/,/^$/p' | tee "$SP"/slide-baseline.txt
rm src/scene/__slidebaseline.test.ts
```

Record the contents of `$SP/slide-baseline.txt` in the notes file when you reach Task 14. These are
the numbers that are about to move.

- [ ] **Step 2: Write the failing test**

Append to `src/scene/carcaseRoles.test.ts`. **Do not replace the file.**

```ts
describe('carcaseMachining — the slide row follows the box', () => {
  const drawerParams = defaultDrawerParams('side-mount')

  const machiningFor = (role: string, params: CarcaseParams, offset: number) => {
    const thicknessOf = roleThicknessFor(params, PRESET_MATERIALS, {})
    const kindOf = jointKindFor([], 'cmp_1' as ComponentId)
    return carcaseMachining(params, thicknessOf, kindOf, role, () => ({
      ...drawerParams,
      runnerOffset: offset,
    }))
  }

  const drawerCabinet = (): CarcaseParams => {
    const p = CARCASE_PRESETS[0].params
    return { ...p, section: setFrontOn(p.section, p.section.id, { kind: 'drawer-front' }) }
  }

  // The point of the whole stage: the row moves with the box, not with the front's centreline.
  it('moves the slide row when the runner offset moves', () => {
    const params = drawerCabinet()
    const low = machiningFor('left-side', params, 20).find((c) => c.id.startsWith('slide_'))!
    const high = machiningFor('left-side', params, 60).find((c) => c.id.startsWith('slide_'))!
    expect(high.start.y - low.start.y).toBeCloseTo(40, 6)
  })

  it('bores nothing for a cabinet too shallow for a runner', () => {
    const shallow = { ...drawerCabinet(), depth: 200 }
    expect(machiningFor('left-side', shallow, 32).filter((c) => c.id.startsWith('slide_'))).toEqual(
      [],
    )
  })

  it('still bores both uprights of the bay', () => {
    const params = drawerCabinet()
    const left = machiningFor('left-side', params, 32).filter((c) => c.id.startsWith('slide_'))
    const right = machiningFor('right-side', params, 32).filter((c) => c.id.startsWith('slide_'))
    expect(left).toHaveLength(1)
    expect(right).toHaveLength(1)
  })
})
```

Check the real role names for the side panels before writing this. If they are not `left-side` and
`right-side`, use whatever `carcaseRoles` emits.

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run src/scene/carcaseRoles.test.ts -t "slide row follows the box"`
Expected: FAIL — `carcaseMachining` takes four arguments, not five.

- [ ] **Step 4: Grow the signature**

In `src/scene/carcaseRoles.ts`, change the signature at line 1057:

```ts
export function carcaseMachining(
  p: CarcaseParams,
  thicknessOf: RoleThickness,
  kindOf: RoleJointKind,
  role: string,
  // Drawer parameters by section id. The carcase reads the drawer's *parameters*, never its
  // emitted boards — which is what keeps this a function in one direction. Returns null for an
  // opening with no drawer, in which case no slide row is bored.
  drawerFor: (sectionId: SectionId) => DrawerParams | null,
): HoleArrayCut[] {
```

Replace the drawer branch at line 1121:

```ts
    if (cell.spec.kind === 'drawer-front') {
      // The runner mounts to the box side, and the screws in the upright follow it. Read through
      // `drawerBoxMetrics`, the one statement of the box's geometry, so the box and the screws that
      // carry it cannot drift apart. The old rule took the front's centreline because there was no
      // box to measure from.
      const params = drawerFor(cell.sectionId)
      if (params === null) continue
      // `tree` is already in scope in carcaseMachining. The section rect, not the cell.
      const openingRectForCell = tree.rects.get(cell.sectionId)
      if (openingRectForCell === undefined) continue
      const metrics = drawerBoxMetrics(openingRectForCell, params, {
        clearDepth: clearDepth(p, thicknessOf('back')),
        frontThickness: thicknessOf(frontRole),
        inset: p.frontMount === 'inset',
        sideThickness: params.boxHeight === null ? 15 : 15,
      })
      if (metrics === null) continue
      cuts.push(slideScrewRow(panel, face, metrics.runnerZ - panel.position.z, frontRole))
    }
```

The `sideThickness` above is a placeholder value and **must not ship**: read the drawer's material
thickness the same way `regenerateDrawers` does, by looking the material up in `scene.materials`. If
`carcaseMachining` has no access to materials, pass the resolved side thickness in alongside the
params rather than guessing — change `drawerFor` to return `{ params, sideThickness }`.

Add the imports for `drawerBoxMetrics`, `DrawerParams` and `clearDepth` if not already present.

- [ ] **Step 5: Thread it from the caller**

In `src/scene/regenerateComponents.ts`, line 70, replace:

```ts
      ...carcaseMachining(component.params, thicknessOf, kindOf, r.role),
```

with:

```ts
      ...carcaseMachining(component.params, thicknessOf, kindOf, r.role, drawerFor),
```

and build `drawerFor` once near the top of `regenerateOne`, from the scene's drawer components:

```ts
  // The drawer's parameters, never its boards. Reading the emitted boards here would make the
  // carcase depend on the drawer's output and the pass would stop being a function.
  const drawersBySection = new Map<SectionId, DrawerParams>()
  for (const c of byId.values()) {
    if (c.kind === 'drawer' && c.parentId === component.id) {
      drawersBySection.set(c.sectionId, c.params)
    }
  }
  const drawerFor = (sectionId: SectionId): DrawerParams | null =>
    drawersBySection.get(sectionId) ?? null
```

`regenerateOne` receives `byId`, so no new argument is needed. Confirm that `byId` actually contains
every component — it is built by `componentsById(scene.components)` in `regenerateComponents`, so it
should, but check rather than assume.

- [ ] **Step 6: Run everything and read what broke**

Run: `pnpm test`

Expected: the new tests pass, **and some existing assertions about slide rows now fail**. That is
the re-baseline. For each failure, compare against `$SP/slide-baseline.txt`:

- If the row moved because it now follows the box, update the expected value and say so in the test
  comment.
- If the row disappeared, find out why before changing anything. A missing row is a different bug
  from a moved one.

**Do not update an expectation you have not explained.** Write the explanation into the test.

- [ ] **Step 7: Mutation-test the new rule**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cp src/scene/carcaseRoles.ts "$SP"/cr.bak
python3 - <<'PY'
import io
p='src/scene/carcaseRoles.ts'
s=io.open(p,encoding='utf-8').read()
old="      cuts.push(slideScrewRow(panel, face, metrics.runnerZ - panel.position.z, frontRole))"
assert s.count(old)==1
new="      cuts.push(slideScrewRow(panel, face, (cell.rect.z0 + cell.rect.z1) / 2 - panel.position.z, frontRole))"
io.open(p,'w',encoding='utf-8').write(s.replace(old,new))
PY
grep -q "cell.rect.z0 + cell.rect.z1" src/scene/carcaseRoles.ts && echo APPLIED
pnpm vitest run src/scene/carcaseRoles.test.ts
cp "$SP"/cr.bak src/scene/carcaseRoles.ts
diff "$SP"/cr.bak src/scene/carcaseRoles.ts && echo RESTORED
```

This mutation restores the old centreline rule. Predict: `moves the slide row when the runner offset
moves` fails, because the centreline ignores the offset entirely. **If that test passes under this
mutation, the re-baseline has not actually happened** and the rest of this task is theatre.

- [ ] **Step 8: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/scene/carcaseRoles.ts src/scene/regenerateComponents.ts src/scene/carcaseRoles.test.ts src/scene/useScene.test.ts
git commit -m "feat(scene): the slide row follows the box, not the front

The reason this stage exists. carcaseRoles carried a comment at the line
where the height was derived saying the figure was expected to move; it
moves here. The row is read through drawerBoxMetrics so the box and the
screws that carry it cannot drift apart.

carcaseMachining grows an argument: the drawer's PARAMETERS, never its
emitted boards, which is what keeps the pass a function in one direction.

Shipped machining positions move. The old values were measured before the
change and the updated expectations each carry the reason they moved.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 12: Measure what the shop drawings do

`descendantIds` is recursive, so boxes enter the projections whether or not anyone plans for it.
This task measures the change rather than asserting there isn't one.

**Files:**
- Test: `src/ui/CabinetProjection.test.tsx`

- [ ] **Step 1: Measure**

```bash
SP=/tmp/claude-0/-home-user-zimmu-web/5419b177-78dc-5fa6-b611-692cd703d4b1/scratchpad
cat > src/geom/__projbaseline.test.ts <<'EOF'
import { describe, it } from 'vitest'
import { buildAssemblyViews } from './assembly'
import { componentsById } from '../scene/componentTree'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { setFrontOn } from '../scene/sectionInterior'
import { regenerateDrawers } from '../scene/regenerateDrawers'
import { regenerateComponents } from '../scene/regenerateComponents'
import type { CarcaseComponent, ComponentId, Scene } from '../scene/types'

describe('projection baseline', () => {
  it('counts parts carrying a visible edge in each view, with and without the box', () => {
    const base = CARCASE_PRESETS[0].params
    const params = {
      ...base,
      section: setFrontOn(base.section, base.section.id, { kind: 'drawer-front' as const }),
    }
    const cabinet: CarcaseComponent = {
      kind: 'carcase',
      id: 'cmp_1' as ComponentId,
      label: 'Base A',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params,
    }
    const seed: Scene = {
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [cabinet],
    }
    const full = regenerateComponents(regenerateDrawers(seed))
    const byId = componentsById(full.components)
    const carcaseOnly = full.parts.filter((p) => p.parentId === cabinet.id)

    const count = (parts: typeof full.parts) =>
      buildAssemblyViews(parts, byId, cabinet, full.materials).map(
        (v) => v.parts.filter((p) => p.visible.length > 0).length,
      )

    throw new Error(
      'PROJECTION BASELINE\n' +
        `carcase only: ${JSON.stringify(count(carcaseOnly))}\n` +
        `with boxes:   ${JSON.stringify(count(full.parts))}`,
    )
  })
})
EOF
pnpm vitest run src/geom/__projbaseline.test.ts 2>&1 | sed -n '/PROJECTION BASELINE/,/^$/p' | tee "$SP"/proj-baseline.txt
rm src/geom/__projbaseline.test.ts
```

**Read `AssemblyView`'s real shape first.** The `v.parts.filter((p) => p.visible.length > 0)` above
assumes a `parts` array whose members carry a `visible` span list. If the shape differs, adapt the
counting expression — the point is a count per view, not this exact expression.

- [ ] **Step 2: Write a test that compares the two, computing both**

The measurement above tells you what to expect. The test itself must not depend on a number copied
from it — it computes both counts and compares them, so it stays true if a preset changes.

Append to `src/ui/CabinetProjection.test.tsx`:

```tsx
// descendantIds is recursive, so a drawer's boards reach the projections without anyone adding
// them. Wanted in Top and End, which are sections through the cabinet, and hidden in Front where
// the applied front covers the box.
//
// Both counts are computed here from the same scene, so this stays true if a preset changes. An
// assertion against a number copied out of a baseline run would pin the preset, not the rule.
describe('CabinetProjection — the drawer box in the views', () => {
  const build = () => {
    const base = CARCASE_PRESETS[0].params
    const params = {
      ...base,
      section: setFrontOn(base.section, base.section.id, { kind: 'drawer-front' as const }),
    }
    const cabinet: CarcaseComponent = {
      kind: 'carcase',
      id: 'cmp_1' as ComponentId,
      label: 'Base A',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      visible: true,
      params,
    }
    const full = regenerateComponents(
      regenerateDrawers({
        parts: [],
        materials: { ...PRESET_MATERIALS },
        hardware: [],
        joints: [],
        components: [cabinet],
      }),
    )
    const byId = componentsById(full.components)
    const drawerIds = new Set(
      full.components.filter((c) => c.kind === 'drawer').map((c) => c.id),
    )
    const carcaseOnly = full.parts.filter((p) => !drawerIds.has(p.parentId ?? ''))
    const drawn = (parts: typeof full.parts) =>
      buildAssemblyViews(parts, byId, cabinet, full.materials).map(
        (v) => v.parts.filter((p) => p.visible.length > 0).length,
      )
    return { without: drawn(carcaseOnly), with: drawn(full.parts) }
  }

  it('adds the box to the section views', () => {
    const { without, with: withBoxes } = build()
    // Views are [Front, Top, End]. Top and End cut through the cabinet, so they gain the box.
    expect(withBoxes[1]).toBeGreaterThan(without[1])
    expect(withBoxes[2]).toBeGreaterThan(without[2])
  })

  it('leaves the elevation alone, because the front covers the box', () => {
    const { without, with: withBoxes } = build()
    expect(withBoxes[0]).toBe(without[0])
  })

  // The fixture must actually contain a box, or both tests above pass for the wrong reason.
  it('is testing a cabinet that really has one', () => {
    const base = CARCASE_PRESETS[0].params
    const params = {
      ...base,
      section: setFrontOn(base.section, base.section.id, { kind: 'drawer-front' as const }),
    }
    const full = regenerateDrawers({
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [
        {
          kind: 'carcase',
          id: 'cmp_1' as ComponentId,
          label: 'Base A',
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          visible: true,
          params,
        },
      ],
    })
    expect(full.components.some((c) => c.kind === 'drawer')).toBe(true)
    expect(full.parts.filter((p) => p.role?.startsWith('box-'))).toHaveLength(5)
  })
})
```

Add whatever imports this file does not already have: `buildAssemblyViews`, `componentsById`,
`regenerateDrawers`, `regenerateComponents`, `setFrontOn`, `CARCASE_PRESETS`, `PRESET_MATERIALS`,
and the `CarcaseComponent` / `ComponentId` types.

**If `leaves the elevation alone` fails, that is a finding, not a test to weaken.** It would mean the
box is drawing through its own front. Record it in the notes and raise it before continuing.

**Compare the result against `$SP/proj-baseline.txt`.** The measured numbers and the test's own
comparison must tell the same story. If they disagree, one of the two is measuring the wrong thing.

- [ ] **Step 3: Run, then commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/ui/CabinetProjection.test.tsx
git commit -m "test(ui): pin what the drawer box does to the shop drawings

descendantIds is recursive, so boxes reach the projections with nobody
adding them. Counts measured before and after rather than assumed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 13: The drawer's parameters in the UI

A drawer with parameters nobody can edit is the same defect the hardware library shipped with:
fields that round-trip empty because no UI can set them.

**Files:**
- Modify: `src/ui/CarcasePanel.tsx`
- Test: `src/ui/CarcasePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/ui/CarcasePanel.test.tsx`. **Do not replace the file.**

```tsx
describe('CarcasePanel — drawer parameters', () => {
  it('offers the runner family for an opening wearing a drawer front', () => {
    renderPanel(
      carcase({ section: { ...sec([], 0), front: { kind: 'drawer-front' } } }),
    )
    expect(screen.getByLabelText('Runner family')).toBeTruthy()
  })

  it('reports a runner family change', () => {
    const onUpdateComponent = vi.fn()
    renderPanel(
      carcase({ section: { ...sec([], 0), front: { kind: 'drawer-front' } } }),
      { onUpdateComponent },
    )
    fireEvent.change(screen.getByLabelText('Runner family'), { target: { value: 'undermount' } })
    expect(onUpdateComponent).toHaveBeenCalled()
  })

  it('offers nothing for an opening wearing a door', () => {
    renderPanel(
      carcase({
        section: { ...sec([], 0), front: { kind: 'door', leaves: 1, hinge: 'left' } },
      }),
    )
    expect(screen.queryByLabelText('Runner family')).toBeNull()
  })
})
```

Use the file's existing `renderPanel`, `carcase` and `sec` helpers with their real signatures. If
`renderPanel` does not take a second options argument, extend it rather than inlining a second
`render` — a second way to mount the panel is how two tests come to disagree about its props.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx -t "drawer parameters"`
Expected: FAIL — no such label.

- [ ] **Step 3: Add the controls**

`CarcasePanel` already renders a front-kind select at line 118 and writes it at line 243. Add, in the
same collapsible section and only when the selected opening's front is a drawer front, three
controls bound to the drawer component for that section:

```tsx
{selectedFront?.kind === 'drawer-front' && selectedDrawer !== null && (
  <>
    <Label htmlFor="runner-family">Runner family</Label>
    <select
      id="runner-family"
      aria-label="Runner family"
      value={selectedDrawer.params.family}
      onChange={(e) =>
        onUpdateComponent(selectedDrawer.id, (c) =>
          c.kind === 'drawer'
            ? { ...c, params: { ...c.params, family: e.target.value as RunnerFamily } }
            : c,
        )
      }
    >
      <option value="side-mount">Side mount</option>
      <option value="undermount">Undermount</option>
    </select>

    <DimInput
      label="Box height"
      value={selectedDrawer.params.boxHeight ?? 0}
      min={0}
      onCommit={(v) =>
        onUpdateComponent(selectedDrawer.id, (c) =>
          c.kind === 'drawer'
            ? { ...c, params: { ...c.params, boxHeight: v === 0 ? null : v } }
            : c,
        )
      }
    />

    {selectedDrawer.params.family === 'side-mount' && (
      <DimInput
        label="Runner height above box bottom"
        value={selectedDrawer.params.runnerOffset}
        min={0}
        onCommit={(v) =>
          onUpdateComponent(selectedDrawer.id, (c) =>
            c.kind === 'drawer'
              ? { ...c, params: { ...c.params, runnerOffset: v } }
              : c,
          )
        }
      />
    )}
  </>
)}
```

`selectedDrawer` is the drawer whose `parentId` is this cabinet and whose `sectionId` is the
selected opening. Derive it from the props the panel already receives; **do not add a second way to
pick an opening** — the panel reads `selectedSectionId` and the project rules are explicit that a
second selection which can disagree with the elevation's is a defect, not a convenience.

Check `DimInput`'s real props before using it. If it takes `label` differently, follow the file's
existing usage.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm vitest run src/ui/CarcasePanel.test.tsx`
Expected: PASS, the whole file.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/ui/CarcasePanel.tsx src/ui/CarcasePanel.test.tsx
git commit -m "feat(ui): edit a drawer's runner family, box height and offset

Parameters nobody can set are the defect the hardware library shipped
with: fields that round-trip empty forever. The runner offset only
appears for side-mount, where it means something.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Task 14: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `project-structure.html`
- Modify: `docs/superpowers/notes/2026-09-12-drawer-boxes-notes.md`
- Modify: `docs/superpowers/specs/2026-09-12-drawer-boxes-design.md`

- [ ] **Step 1: Rewrite the pipeline invariant**

In `CLAUDE.md`, replace the bullet beginning **"The regeneration pipeline order is fixed"** with:

```markdown
- **The regeneration pipeline order is fixed, and it is three stages.** `regenerateDrawers(scene)`,
  then `regenerateComponents(scene)`, then `reconcileJoints(scene)`, always, via `applyPipeline` in
  `useScene.ts`. Drawers lead because the carcase's slide machining reads drawer *parameters* while
  the drawer reads nothing the carcase *emits* — its inputs are the section tree, the drawer params
  and the materials, all of which exist before the carcase pass. Reversed, a new drawer front needs
  two passes to settle: the first bores no slide screws and the second does. All three stages are
  pure and idempotent, and `regenerateDrawers` is the only one that adds or removes **components**.
```

- [ ] **Step 2: Add the new invariants**

Append to the Key Invariants list in `CLAUDE.md`:

```markdown
- **A drawer's geometry is stated once and read by two generators.** `drawerBoxMetrics` in
  `drawerBox.ts` is a pure function of the front cell rect, the drawer's params and the materials.
  `regenerateDrawers` reads it to build boards; `carcaseMachining` reads it to place slide screws.
  Neither reads the other's output, which is the only reason the carcase and the drawer do not form
  a cycle through the runner height. A second copy of that height is how the box and the screws that
  carry it come to disagree.
- **The two runner families are not one rule with two constants.** Side-mount fixes the gap either
  side of the box (12.7 mm); undermount fixes the box's *interior* (opening − 42 mm at ≤ 16 mm
  sides, − 49 mm above), so its outside width moves with the side material. At 16 mm sides the
  undermount outside clearance is near 5 mm a side. Collapsing them into a per-side constant
  produces boxes that are wrong only for thick-sided drawers, which is the hardest kind of wrong to
  notice. Undermount also has no groove and needs a notched back; side-mount has a grooved bottom
  and a plain one.
- **A drawer box declines rather than guessing.** When `runnerKeyFor` finds no runner for the clear
  depth, the hardware list omits the runner *and* the drawer emits no boards. Same rule as a door
  too thin to bore listing no hinge.
- **`driven` on a component means what it means on a part.** Only `DrawerComponent` carries it. A
  detached drawer is the user's: no regeneration, no deletion. Carcases and groups deliberately do
  not have it, because a detached carcase has no defined meaning.
- **Which cabinet owns a part is `nearestCarcase`, never the immediate parent.** `ancestorsOf(...)[0]`
  is the direct parent, which is the cabinet only when the part hangs straight off it. A board under
  a drawer or a group answers the wrong thing. The cutting list and the hardware BOM each shipped
  their own version of that mistake; both now ask one function.
```

- [ ] **Step 3: Update the file tree and the IndexedDB line**

Add to the `src/scene/` tree in `CLAUDE.md`:

```
│   ├── drawerBox.ts     RunnerFamily, DrawerParams and drawerBoxMetrics — the one statement of a
│   │                    drawer box's geometry, read by both generators so neither reads the other's
│   │                    output. Every stated figure lives here
│   ├── regenerateDrawers.ts  Pure Scene → Scene; the only pass that adds or removes components.
│   │                    Reconciles one drawer per drawer-front opening, then emits its five boards
│   ├── nearestCarcase.ts  nearestCarcase(node, byId) — which cabinet a part belongs to, asked by
│   │                    the cutting list and the hardware BOM and stated once
```

Update the `FILE_FORMAT_VERSION` invariant to say 18, adding: `v18 added the drawer component`.

- [ ] **Step 4: Regenerate and hand-edit the structure page**

```bash
node scripts/update-structure-html.mjs
```

Then by hand, add the three new modules to the prose tree, add a **Done** roadmap row
`Drawer boxes`, and correct the technology table's IndexedDB entry, which still reads `(v2)` and has
been wrong since the settings store landed.

- [ ] **Step 4b: The two docs the sweep has been missing**

`README.md:38`, `README.md:135`, `joinery_3d_software_plan.md:25`, `:323`, `:744` and `:791` all
still read `FILE_FORMAT_VERSION = 12`. That staleness predates this stage — it has survived v13
through v17 — but this step is where the version is restated, and a sweep that corrects `CLAUDE.md`
and `project-structure.html` while the README goes on claiming 12 is a sweep that leaves the repo's
front door wrong. Set all six to 18.

`joinery_3d_software_plan.md:886` is **not** one of them: it records `FILE_FORMAT_VERSION = 1` as
the Phase 0 value, which is history and correct as written. Leave it.

Do **not** run Prettier over either file. The hooks format only `.ts/.tsx/.js/.jsx/.css`, and a
Prettier pass over a `.md` here has already once rewritten 428 untouched lines.

- [ ] **Step 5: Record the measurements**

Append to `docs/superpowers/notes/2026-09-12-drawer-boxes-notes.md` a `## 2026-09-12 — shipped`
entry containing, as **measured figures and not predictions**:

- the slide-row baseline from Task 11 Step 1, and which rows moved
- the projection counts from Task 12 Step 1
- the real before-and-after test totals and file counts, taken by running the suite on **this
  branch's own merge-base** (`git merge-base origin/main HEAD`) in a scratch worktree and on the
  branch tip. **Not on `origin/main`**: the hardware stage baselined against whatever `main` was at
  measuring time, which by then carried two test files the branch had never had, so its recorded
  delta compares two different trees. Both its numbers were measured and it was still wrong.
- every mutation that was run, what you predicted, and what actually failed
- anything in this plan that turned out to be wrong, stated plainly

That last item is the most valuable part of the entry. This plan contains predictions about code it
cannot see; some of them will be wrong, and the record of which ones is what makes the next plan
better.

- [ ] **Step 6: Close the spec**

Set the spec's `**Status:**` line to `Complete.` with the real figures.

- [ ] **Step 7: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm test
PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx playwright test
pnpm build
```

Record the real numbers. Do not carry a figure forward from an earlier run: the hardware stage's
documentation pass reported a mid-branch count as the baseline and understated its own coverage by a
factor of six.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: the drawer box's invariants, and close the stage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01P9f2w97VWLpfZvQzZH6TPc"
```

---

## Plan self-review

Run against the spec after the plan is written, before execution starts.

**Spec coverage.** Every section of the spec maps to a task:

| Spec section | Task |
|---|---|
| `nearestCarcase`, both BOM consumers | 1, 2 |
| `drawerBoxMetrics`, stated figures, decline path | 3, 4 |
| `DrawerComponent`, `driven` | 5 |
| File format v18, `parseFile` test | 6 |
| Component reconciliation, detach | 7 |
| Five boards, groove, bottom sizing | 8 |
| Two runner families, notch, locating hole | 4, 9 |
| Three-stage pipeline, ordering | 10 |
| Slide height re-baseline | 11 |
| Shop drawings measured | 12 |
| Parameters reachable in the UI | 13 |
| Invariants, structure page, notes, spec status | 14 |

**Known gaps in this plan, stated rather than hidden.**

- **Task 11 Step 4 contains a `sideThickness` value that must not ship.** It is marked in the task.
  The implementer has to resolve the drawer's material thickness properly, and the task says how.
  It is called out rather than guessed because `carcaseMachining` has no access to `scene.materials`
  today and the right fix depends on what the signature change looks like in practice.
- **Several tasks say "check X against the code before writing this."** Those are not hedges. They
  are the places where this plan is predicting an API it could not read at writing time:
  `sectionOpenings`'s return shape, `frontCells`'s `outer` argument, `AssemblyView`'s part shape,
  `DimInput`'s props, and the side-panel role names. Every one of them is a place a previous plan in
  this repo got something wrong by inferring instead of opening the file.
- **The undermount figures are unverified.** The spec says so and the constants carry the warning in
  a comment. They are not falsifiable by any test here.

**Type consistency.** `DrawerParams`, `RunnerFamily`, `DrawerBoxMetrics`, `drawerBoxMetrics`,
`defaultDrawerParams`, `nearestCarcase`, `regenerateDrawers`, `boxBoards` and the five `box-*` role
keys are spelled identically in every task that mentions them. The `box-*` keys appear in Tasks 8,
9, 12 and 14 and match.
