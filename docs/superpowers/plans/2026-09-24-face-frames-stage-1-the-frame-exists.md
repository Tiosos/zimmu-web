# Face frames, stage 1: a framed cabinet with one opening and a door

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-24-face-frames-design.md`
**Notes:** `docs/superpowers/notes/2026-09-24-face-frames-notes.md`

**Goal:** A framed cabinet with a single opening emits a real face frame, its door mounts to that
frame, and the members reach the cutting list — while a framed cabinet with splits or drawers
declines, and every frameless cabinet is byte-identical to before.

**Architecture:** `faceFrame.ts` states the frame's geometry once as a pure function of the section
tree, the cabinet's front rectangle and the frame parameters. `regenerateFaceFrames` reads it to
emit boards; `frontCells` reads it to size the door. Neither reads the other's output, which is
`drawerBoxMetrics`' shape reused and the reason the frame, the doors and the drawers cannot form a
cycle.

**Tech stack:** TypeScript strict, Vitest + happy-dom, no new dependencies.

---

## Four corrections to the spec, found by reading the code before writing this

Record all four in the notes. Each was written from memory in the spec and is wrong or
needlessly complicated against what the codebase already does.

**1. `isNestable` needs no change at all.**

```ts
export function isNestable(def: MaterialDef): boolean {
  return def.sheet !== undefined && def.sheet.length > 0 && def.sheet.width > 0
}
```

It keys off the **material**, not the part or the role, so a frame material with no `sheet` is
already excluded from the nest. The spec called this "the easiest thing to forget"; the existing
design had already made it impossible to get wrong. Task 10 pins it with a test and adds the
material — no production change.

**2. There is no `frameMode` field.** `frame === undefined` **is** the frameless state — exactly
the rule `CLAUDE.md` already states for anchors: *"`anchor === undefined` is the detached state. No
`driven` flag exists on a carcase: presence or absence already draws the line."* A separate
`frameMode` is a second way to say the same thing and a second way for them to disagree.

**3. The frame's floor is `floorZ`, not a `baseMode` test written here.** `carcaseRoles.ts` already
has it, and the front's `outer` rectangle already reads it at three call sites:

```ts
function floorZ(p: CarcaseParams): number {
  return p.baseMode === 'toe-kick' || p.baseMode === 'ladder' ? p.toeKickHeight : 0
}
```

The first draft of this plan wrote `p.baseMode === 'ladder' ? p.toeKickHeight : 0` — which is
`carcaseZ0`, the *side panel's* extent, not the front's floor — and would have run the frame to the
ground over a toe kick on every `'toe-kick'` cabinet. (It also named a `'plinth'` mode that does not
exist; the modes are `'toe-kick' | 'ladder' | 'legs' | 'none'`.) So **`faceFrameGeometry` takes the
`outer: Rect` as a parameter** rather than computing it, which is `frontCells.ts`' own stated
precedent:

> *"Passed in rather than derived, so this module needs no CarcaseParams and no thickness resolver
> — it is about rectangles."*

That is also what keeps the dependency pointing one way: the carcase reads the frame, so the frame
importing `floorZ` from `carcaseRoles` would be a cycle. Taking the rectangle removes the question.

**4. The frame material is a *slot*, not a field on `FaceFrameParams`.** `materialForRole` is
documented as *"the one place the three slots are told apart"*. A frame material stored on the
parameter bag would be a fourth mechanism beside three slots. It becomes `frameMaterial` on
`MaterialSlots` and on `CarcaseParams`, with the `stile-`/`rail-` families mapped to it.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/scene/faceFrame.ts` | **create** | `FrameMember`, `FrameGeometry`, `faceFrameGeometry` — the whole frame rule, pure |
| `src/scene/faceFrame.test.ts` | **create** | Member rectangles, the opening, and every way it declines |
| `src/scene/types.ts` | modify | `FaceFrameParams`, `frame?`, `frameMaterial`, `'half-overlay'`, `FaceFrameComponent`, the union |
| `src/scene/resolveThickness.ts` | modify | `frameMaterial` slot; `stile-`/`rail-` families map to it |
| `src/scene/grain.ts` | modify | A stile stands, a rail lies — the fatal default forces the answer |
| `src/scene/carcaseRoles.ts` | modify | `validateCarcaseParams`: half-overlay needs a frame; a frame must leave an opening |
| `src/scene/regenerateFaceFrames.ts` | **create** | Pure `Scene → Scene`; one frame per framed carcase |
| `src/scene/regenerateFaceFrames.test.ts` | **create** | Emission, reconciliation, detachment, idempotence |
| `src/scene/frontCells.ts` | modify | `'half-overlay'`; a framed cell measures to the frame opening |
| `src/scene/useScene.ts` | modify | `applyPipeline` becomes five stages |
| `src/scene/useFile.ts` | modify | `FILE_FORMAT_VERSION = 20`; default `frameMaterial`; parse `frame` and the component |
| `src/scene/carcasePresets.ts` | modify | A solid-stock frame material with **no** `sheet` |
| `src/ui/CarcasePanel.tsx` | modify | A Frame section |
| `CLAUDE.md`, `project-structure.html`, notes | modify | Invariants, tree, feature row, stage-1 notes |

---

## Task 0: Baseline

- [ ] **Step 1: Branch from main**

```bash
cd /home/user/zimmu-web
git fetch origin main
git checkout -B claude/next-suggested-task-z8rzaq origin/main
git log --oneline -1
```

- [ ] **Step 2: Measure, do not quote**

```bash
pnpm typecheck; echo "tc=$?"
pnpm lint; echo "lint=$?"
pnpm test 2>&1 | tail -5
```

Record files / passed / skipped. Every delta below is reported against **this** figure.

Gate every check on its **real exit code** (`pnpm lint; lt=$?`), never a pipe through `tail` — that
reports `tail`'s status and has silently masked a lint failure in this repo already.

---

## Task 1: `faceFrame.ts` — the frame's geometry, stated once

Takes the cabinet's front rectangle rather than its parameters, for the reason `frontCells` does:
this module is about rectangles. Stiles run the **full height** and rails fit **between** them,
which is how a face frame is actually made and what makes the joint a rail tenoned into a stile.

**Files:** create `src/scene/faceFrame.ts`, `src/scene/faceFrame.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/faceFrame.test.ts
import { describe, it, expect } from 'vitest'
import { faceFrameGeometry } from './faceFrame'
import { splitSection } from './editSection'
import { newSectionId } from './sectionTree'
import type { Rect, Section } from './sectionTree'
import type { FaceFrameParams } from './types'

// Asymmetric on purpose, for the reason panelThickness.test.ts exists: a frame whose stiles and
// rails are the same width survives almost every wrong rule. 44 and 32 differ, and differ from
// every figure in the rectangle below.
const FRAME: FaceFrameParams = {
  stileWidth: 44,
  railWidth: 32,
  midStileWidth: 56,
  midRailWidth: 38,
}

// A base unit above a 100 mm toe kick: z0 is NOT 0, which is what catches a frame that runs to
// the ground over the kick.
const OUTER: Rect = { x0: 0, x1: 600, z0: 100, z1: 720 }

const leaf = (): Section => ({
  id: newSectionId(),
  size: { kind: 'equal' },
  content: { kind: 'leaf' },
})

const rectOf = (g: ReturnType<typeof faceFrameGeometry>, role: string): Rect => {
  expect(g).not.toBeNull()
  const m = g!.members.find((x) => x.role === role)
  expect(m, `no member ${role}`).toBeDefined()
  return m!.rect
}

describe('faceFrameGeometry', () => {
  it('emits four members for a single-opening cabinet', () => {
    const g = faceFrameGeometry(leaf(), OUTER, FRAME)
    expect(g).not.toBeNull()
    expect(g!.members.map((m) => m.role).sort()).toEqual([
      'rail-bottom',
      'rail-top',
      'stile-left',
      'stile-right',
    ])
  })

  it('runs the stiles full height and fits the rails between them', () => {
    const g = faceFrameGeometry(leaf(), OUTER, FRAME)
    const left = rectOf(g, 'stile-left')
    const right = rectOf(g, 'stile-right')
    const top = rectOf(g, 'rail-top')

    expect(left).toEqual({ x0: 0, x1: 44, z0: 100, z1: 720 })
    expect(right).toEqual({ x0: 556, x1: 600, z0: 100, z1: 720 })
    // A rail stops at the stiles; it does not run the cabinet's full width.
    expect(top.x0).toBe(44)
    expect(top.x1).toBe(556)
    expect(top).toEqual({ x0: 44, x1: 556, z0: 688, z1: 720 })
  })

  // The outer rectangle is `floorZ`, which already accounts for the kick. Pinning the floor here
  // catches a frame that computes its own and gets the base mode wrong.
  it('starts at the rectangle it was given, not at zero', () => {
    expect(rectOf(faceFrameGeometry(leaf(), OUTER, FRAME), 'stile-left').z0).toBe(100)
    expect(rectOf(faceFrameGeometry(leaf(), OUTER, FRAME), 'rail-bottom')).toEqual({
      x0: 44,
      x1: 556,
      z0: 100,
      z1: 132,
    })
  })

  it('leaves an opening inside the frame', () => {
    const g = faceFrameGeometry(leaf(), OUTER, FRAME)!
    expect(g.openings.size).toBe(1)
    const rect = [...g.openings.values()][0]
    expect(rect).toEqual({ x0: 44, x1: 556, z0: 132, z1: 688 })
    // The opening meets the members exactly — no gap, no overlap.
    expect(rect.z0).toBe(rectOf(g, 'rail-bottom').z1)
    expect(rect.z1).toBe(rectOf(g, 'rail-top').z0)
    expect(rect.x0).toBe(rectOf(g, 'stile-left').x1)
    expect(rect.x1).toBe(rectOf(g, 'stile-right').x0)
  })

  it('keys the opening by the section it belongs to', () => {
    const root = leaf()
    expect([...faceFrameGeometry(root, OUTER, FRAME)!.openings.keys()]).toEqual([root.id])
  })

  // `frame === undefined` IS frameless, the same rule anchors use for detached.
  it('answers null for a frameless cabinet', () => {
    expect(faceFrameGeometry(leaf(), OUTER, undefined)).toBeNull()
  })

  // Declines rather than guessing, exactly as a drawer with no runner emits no boards.
  it('declines when the stiles leave no opening', () => {
    expect(faceFrameGeometry(leaf(), { ...OUTER, x1: 80 }, FRAME)).toBeNull()
  })

  it('declines when the rails leave no opening', () => {
    expect(faceFrameGeometry(leaf(), { ...OUTER, z1: 150 }, FRAME)).toBeNull()
  })

  it('declines a zero-width member', () => {
    expect(faceFrameGeometry(leaf(), OUTER, { ...FRAME, stileWidth: 0 })).toBeNull()
  })

  // Stage 1 only. Divisions arrive in stage 2; until then a split cabinet is refused rather than
  // given a frame that ignores its own partitions.
  it('declines a cabinet whose tree splits', () => {
    const root = leaf()
    const split = splitSection(root, root.id, 'vertical', 'panel', 2)
    expect(faceFrameGeometry(split, OUTER, FRAME)).toBeNull()
  })

  // Also stage 1 only, and a SEPARATE branch: a drawer is a leaf, so the split guard above does
  // not catch it. Stage 3 sizes a drawer box to the framed opening; until then the cabinet
  // declines rather than emitting a box that passes through a frame nobody measured it against.
  it('declines a leaf wearing a drawer front', () => {
    const root: Section = { ...leaf(), front: { kind: 'drawer-front' } }
    expect(faceFrameGeometry(root, OUTER, FRAME)).toBeNull()
  })

  it('accepts a leaf wearing a door', () => {
    const root: Section = { ...leaf(), front: { kind: 'door', leaves: 1, hinge: 'left' } }
    expect(faceFrameGeometry(root, OUTER, FRAME)).not.toBeNull()
  })

  it('is idempotent', () => {
    const root = leaf()
    expect(faceFrameGeometry(root, OUTER, FRAME)).toEqual(faceFrameGeometry(root, OUTER, FRAME))
  })
})
```

- [ ] **Step 2: Run it, watch it fail** — `pnpm vitest run src/scene/faceFrame.test.ts`; unresolved import.

- [ ] **Step 3: Write the module**

```ts
// src/scene/faceFrame.ts
import type { Rect, Section, SectionId } from './sectionTree'
import type { FaceFrameParams } from './types'

// A stile or a rail, as a rectangle on the cabinet's front face in carcase x/z.
export interface FrameMember {
  role: string
  rect: Rect
}

export interface FrameGeometry {
  members: FrameMember[]
  // The clear opening of each leaf, INSIDE the frame. What a door covers and what a drawer box
  // must pass through — which is why both read this rather than the carcase's own opening.
  openings: Map<SectionId, Rect>
}

// The whole frame rule, stated once.
//
// Takes the cabinet's front rectangle rather than its parameters, the same choice `frontCells`
// makes and for the same reason: this module is about rectangles, so it needs no CarcaseParams,
// no base-mode branch and no thickness resolver. That rectangle is `floorZ`-based and already
// accounts for a toe kick, which is the one figure a second copy here would get wrong — and it
// keeps the dependency pointing one way, since the carcase reads the frame and an import of
// `floorZ` back out of `carcaseRoles` would be a cycle.
//
// Pure: a function of the section tree, that rectangle and the frame parameters, all of which
// exist before any generator runs. Three consumers read it — `regenerateFaceFrames` for the
// boards, `frontCells` for the door, and (from stage 3) `regenerateDrawers` for the box — and none
// reads another's output. That is the only reason the frame, the doors and the drawers do not form
// a cycle, and it is `drawerBoxMetrics`' shape reused.
//
// Null when the frame cannot be built, and the cabinet then emits no frame at all: the same rule
// as a drawer box with no runner, or a door too thin to bore. A frame that half exists is worse
// than one that refuses.
export function faceFrameGeometry(
  root: Section,
  outer: Rect,
  frame: FaceFrameParams | undefined,
): FrameGeometry | null {
  // `frame === undefined` is the frameless state, the way `anchor === undefined` is the detached
  // one: presence or absence already draws the line, so there is no second flag to disagree with.
  if (frame === undefined) return null

  // Stage 1 builds a single-opening cabinet only. A split cabinet is refused rather than given a
  // frame that ignores its own partitions; stage 2 adds the mid members.
  if (root.content.kind === 'split') return null

  // A drawer is a LEAF, so the guard above does not catch it — a separate branch, not a wider
  // condition. Stage 3 sizes a drawer box to the framed opening; until then the cabinet declines
  // rather than emitting a box that passes through a frame nobody measured it against.
  if (root.front?.kind === 'drawer-front') return null

  const { stileWidth, railWidth } = frame
  if (stileWidth <= 0 || railWidth <= 0) return null

  const openX0 = outer.x0 + stileWidth
  const openX1 = outer.x1 - stileWidth
  const openZ0 = outer.z0 + railWidth
  const openZ1 = outer.z1 - railWidth
  if (openX1 <= openX0 || openZ1 <= openZ0) return null

  // Stiles run the full height and the rails fit between them — how a face frame is actually made,
  // and what makes the joint a rail tenoned into a stile rather than the reverse.
  const members: FrameMember[] = [
    { role: 'stile-left', rect: { x0: outer.x0, x1: openX0, z0: outer.z0, z1: outer.z1 } },
    { role: 'stile-right', rect: { x0: openX1, x1: outer.x1, z0: outer.z0, z1: outer.z1 } },
    { role: 'rail-top', rect: { x0: openX0, x1: openX1, z0: openZ1, z1: outer.z1 } },
    { role: 'rail-bottom', rect: { x0: openX0, x1: openX1, z0: outer.z0, z1: openZ0 } },
  ]

  return {
    members,
    openings: new Map([[root.id, { x0: openX0, x1: openX1, z0: openZ0, z1: openZ1 }]]),
  }
}
```

- [ ] **Step 4: Run it, watch it pass** (13 tests).
- [ ] **Step 5: Commit** — `feat(scene): the face frame's geometry, stated once`

---

## Task 2: the model

**Files:** modify `src/scene/types.ts`

- [ ] **Step 1: Add the parameters.** In `CarcaseParams`, beside `frontMaterial`:

```ts
  // Absent IS frameless — the rule anchors already use for detached. A separate `frameMode` would
  // be a second way to say the same thing and a second way for the two to disagree.
  frame?: FaceFrameParams
  // A fourth material slot, not a field on FaceFrameParams: `materialForRole` is the one place the
  // slots are told apart, and a material stored on the parameter bag would be a second mechanism.
  // Every cabinet carries it, framed or not, exactly as every cabinet carries `frontMaterial`.
  frameMaterial: string
```

Widen `frontMount`:

```ts
  // 'half-overlay' is legal ONLY on a framed cabinet, and validation refuses it otherwise rather
  // than quietly treating it as overlay. A door laps its OWN stile by half that stile's width: it
  // never reads a neighbour, so `regenerateComponents` stays a pure function of one cabinet's
  // parameters. Two butted cabinets then read as sharing a stile as a consequence, not a rule.
  frontMount: 'overlay' | 'half-overlay' | 'inset'
```

Add the bag and the component, beside `DrawerComponent`:

```ts
export interface FaceFrameParams {
  stileWidth: number
  railWidth: number
  // A centre stile is customarily wider than an edge one, because two half-overlay doors each
  // cover half of it. Unused until stage 2 adds divisions, but present from v20 so a stage-1 file
  // stays readable by a stage-2 build.
  midStileWidth: number
  midRailWidth: number
}

export interface FaceFrameComponent {
  kind: 'faceFrame'
  id: ComponentId
  label: string
  parentId: ComponentId | null
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
  // Same rule as a drawer: a detached frame is the user's — no regeneration, no deletion. Carcases
  // and groups deliberately lack it, because a detached carcase has no defined meaning.
  driven: boolean
}

export type Component =
  | GroupComponent
  | CarcaseComponent
  | DrawerComponent
  | FaceFrameComponent
```

- [ ] **Step 2: `pnpm typecheck; tc=$?`** — expect a non-zero exit and a list of every `switch` and
  narrowing that does not yet handle `'faceFrame'`, plus every fixture missing `frameMaterial`.
  **That list is the task.** Work it until zero; do not widen a type to silence it.
- [ ] **Step 3: `pnpm test`** — add `frameMaterial: DEFAULT_FRAME_MATERIAL` to `CARCASE_PRESETS` and
  to any fixture the compiler named.
- [ ] **Step 4: Commit** — `feat(scene): the face frame model`

---

## Task 3: the frame material slot

**Files:** modify `src/scene/resolveThickness.ts`, `src/scene/resolveThickness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('resolves a frame member to the frame slot', () => {
    const slots = {
      carcaseMaterial: '18mm Ply',
      backMaterial: '12mm MDF',
      frontMaterial: '18mm Ply',
      frameMaterial: 'Hardwood 20mm',
    }
    expect(materialForRole(slots, new Map(), 'stile-left')).toBe('Hardwood 20mm')
    expect(materialForRole(slots, new Map(), 'rail-top')).toBe('Hardwood 20mm')
    // A family, not a name — the same rule `front-` follows.
    expect(materialForRole(slots, new Map(), 'stile-mid-1')).toBe('Hardwood 20mm')
    // And nothing else moves.
    expect(materialForRole(slots, new Map(), 'left-side')).toBe('18mm Ply')
  })

  it('still lets a part override its frame material', () => {
    const slots = { carcaseMaterial: 'a', backMaterial: 'b', frontMaterial: 'c', frameMaterial: 'd' }
    const overrides = new Map([['stile-left', { material: 'Oak 20mm' }]])
    expect(materialForRole(slots, overrides, 'stile-left')).toBe('Oak 20mm')
  })
```

- [ ] **Step 2: Run, watch fail.**
- [ ] **Step 3: Add the slot and the families.** In `MaterialSlots`, add `frameMaterial: string`. In
  `materialForRole`, beside the `front-` clause:

```ts
  if (role.startsWith('stile-') || role.startsWith('rail-')) return slots.frameMaterial
```

- [ ] **Step 4: Run, watch pass.**
- [ ] **Step 5: Commit** — `feat(scene): a frame member is made of the frame material`

---

## Task 4: grain on a frame member

`grainAxisOf` ends in a **deliberately fatal** throw for an unknown role:

> *"A silent default would give a new role an arbitrary grain and no test would notice."*

So this is not optional polish — without it, the first frame member to reach the cutting list
throws, and the symptom appears in `buildCsv` rather than anywhere near the cause. It is also the
mechanism working as designed: the fatal default is what forces the question to be answered
deliberately.

A stile runs vertically and a rail runs horizontally, and each carries its grain along its own
length — which is the one place in this codebase where "grain runs along the longer dimension"
happens to be right, and `CLAUDE.md` warns never to assume it. State it per family, not per shape.

**Files:** modify `src/scene/grain.ts`, `src/scene/grain.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('runs a stile vertical and a rail horizontal', () => {
    expect(grainAxisOf('stile-left')).toBe('z')
    expect(grainAxisOf('stile-right')).toBe('z')
    expect(grainAxisOf('rail-top')).toBe('x')
    expect(grainAxisOf('rail-bottom')).toBe('x')
  })

  // Families, not names: stage 2's mid members must resolve without touching this table again.
  it('resolves a mid member by family', () => {
    expect(grainAxisOf('stile-mid-1')).toBe('z')
    expect(grainAxisOf('rail-mid-1')).toBe('x')
  })

  // The fatal default must survive: it is what forced this task to exist.
  it('still refuses a role it does not know', () => {
    expect(() => grainAxisOf('gadget-3')).toThrow()
  })
```

- [ ] **Step 2: Run, watch fail** — the first two throw, the third already passes.
- [ ] **Step 3: Add the families**, beside the `front-` clause and above the fatal default:

```ts
  // A frame member carries its grain along its own length: a stile stands, a rail lies. Families
  // rather than names, so stage 2's mid members need no new entry here.
  if (role.startsWith('stile-')) return 'z'
  if (role.startsWith('rail-')) return 'x'
```

- [ ] **Step 4: Run, watch pass.**
- [ ] **Step 5: Commit** — `feat(scene): a stile stands and a rail lies`

---

## Task 5: validation refuses what it cannot build

**Files:** modify `src/scene/carcaseRoles.ts`, `src/scene/carcaseRoles.test.ts`

- [ ] **Step 1: Write the failing tests** — append to the validation describe

```ts
  const FRAME = { stileWidth: 44, railWidth: 32, midStileWidth: 56, midRailWidth: 38 }

  it('refuses half-overlay on a frameless cabinet', () => {
    expect(
      validateCarcaseParams({ ...base, frame: undefined, frontMount: 'half-overlay' }, thicknessOf),
    ).toContain('Half-overlay needs a face frame')
  })

  it('allows half-overlay on a framed cabinet', () => {
    expect(
      validateCarcaseParams({ ...base, frame: FRAME, frontMount: 'half-overlay' }, thicknessOf),
    ).toEqual([])
  })

  it('refuses a framed cabinet whose stiles leave no opening', () => {
    expect(validateCarcaseParams({ ...base, width: 80, frame: FRAME }, thicknessOf)).toContain(
      'The face frame leaves no opening',
    )
  })

  it('says nothing about frames on a frameless cabinet', () => {
    expect(validateCarcaseParams({ ...base, width: 80, frame: undefined }, thicknessOf)).not.toContain(
      'The face frame leaves no opening',
    )
  })
```

- [ ] **Step 2: Run, watch fail.**
- [ ] **Step 3: Add the rules** in `validateCarcaseParams`, using the module's own `floorZ` so the
  check and the geometry agree about where the frame starts:

```ts
  if (p.frontMount === 'half-overlay' && p.frame === undefined) {
    errors.push('Half-overlay needs a face frame')
  }
  if (p.frame !== undefined) {
    const { stileWidth, railWidth } = p.frame
    if (stileWidth <= 0 || railWidth <= 0) {
      errors.push('Frame members must be wider than zero')
    } else if (
      p.width - 2 * stileWidth <= 0 ||
      p.height - floorZ(p) - 2 * railWidth <= 0
    ) {
      errors.push('The face frame leaves no opening')
    }
  }
```

- [ ] **Step 4: Run, watch pass.**
- [ ] **Step 5: Commit** — `feat(scene): a framed cabinet refuses what it cannot build`

---

## Task 6: `regenerateFaceFrames`

Reconciliation is **by `parentId`** — one frame per carcase — where a drawer reconciles by
`(parentId, sectionId)` because there is one per opening. Driven and detached alike satisfy the
carcase, so a detached frame is returned by identity rather than having a driven one built beside
it; that is the bug `regenerateDrawers`' own notes record as "two boxes in one bay".

**Files:** create `src/scene/regenerateFaceFrames.ts`, `src/scene/regenerateFaceFrames.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/regenerateFaceFrames.test.ts
import { describe, it, expect } from 'vitest'
import { regenerateFaceFrames } from './regenerateFaceFrames'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent, FaceFrameComponent, Scene } from './types'

const FRAME = { stileWidth: 44, railWidth: 32, midStileWidth: 56, midRailWidth: 38 }

const cab = (id: string, framed: boolean): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: { ...CARCASE_PRESETS[0].params, frame: framed ? FRAME : undefined },
})

const sceneOf = (components: Scene['components']): Scene => ({
  parts: [],
  materials: PRESET_MATERIALS,
  hardware: [],
  joints: [],
  components,
})

const frames = (s: Scene) =>
  s.components.filter((c): c is FaceFrameComponent => c.kind === 'faceFrame')

const roles = (s: Scene) =>
  s.parts
    .filter((p) => p.kind === 'board' && p.role !== undefined)
    .map((p) => p.role!)
    .filter((r) => r.startsWith('stile-') || r.startsWith('rail-'))
    .sort()

describe('regenerateFaceFrames', () => {
  it('gives a framed cabinet exactly one frame', () => {
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a', true)]))
    expect(frames(out)).toHaveLength(1)
    expect(frames(out)[0].parentId).toBe('cmp_a')
  })

  it('gives a frameless cabinet none', () => {
    expect(frames(regenerateFaceFrames(sceneOf([cab('cmp_a', false)])))).toHaveLength(0)
  })

  it('emits the frame boards', () => {
    expect(roles(regenerateFaceFrames(sceneOf([cab('cmp_a', true)])))).toEqual([
      'rail-bottom',
      'rail-top',
      'stile-left',
      'stile-right',
    ])
  })

  it('gives each cabinet its own frame', () => {
    const out = regenerateFaceFrames(sceneOf([cab('cmp_a', true), cab('cmp_b', true)]))
    expect(frames(out).map((f) => f.parentId).sort()).toEqual(['cmp_a', 'cmp_b'])
  })

  it('removes the frame when the cabinet turns frameless', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a', true)]))
    const unframed = regenerateFaceFrames({
      ...framed,
      components: framed.components.map((c) => (c.kind === 'carcase' ? cab('cmp_a', false) : c)),
    })
    expect(frames(unframed)).toHaveLength(0)
    expect(roles(unframed)).toEqual([])
  })

  // A detached frame is the user's, exactly as a detached drawer is.
  it('keeps a detached frame when the cabinet turns frameless', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a', true)]))
    const detached = {
      ...framed,
      components: framed.components.map((c) =>
        c.kind === 'faceFrame'
          ? { ...c, driven: false }
          : c.kind === 'carcase'
            ? cab('cmp_a', false)
            : c,
      ),
    }
    expect(frames(regenerateFaceFrames(detached))).toHaveLength(1)
  })

  it('does not build a second frame beside a detached one', () => {
    const framed = regenerateFaceFrames(sceneOf([cab('cmp_a', true)]))
    const detached = {
      ...framed,
      components: framed.components.map((c) =>
        c.kind === 'faceFrame' ? { ...c, driven: false } : c,
      ),
    }
    expect(frames(regenerateFaceFrames(detached))).toHaveLength(1)
  })

  it('is idempotent', () => {
    const once = regenerateFaceFrames(sceneOf([cab('cmp_a', true)]))
    const twice = regenerateFaceFrames(once)
    expect(frames(twice)).toHaveLength(1)
    expect(twice.parts.length).toBe(once.parts.length)
  })

  it('leaves a scene with no cabinets alone', () => {
    const empty = sceneOf([])
    expect(regenerateFaceFrames(empty)).toBe(empty)
  })
})
```

- [ ] **Step 2: Run, watch fail.**
- [ ] **Step 3: Write the pass.** Follow `regenerateDrawers.ts` closely — it is the precedent for a
  component-emitting pass, including how it claims existing components by key, how it builds boards
  through `orientedPanel`, and how it returns the scene by identity when nothing changed. For each
  carcase: resolve `thicknessOf` via `roleThicknessFor`, build the front rectangle the same way
  `carcaseRoles` does (`{ x0: 0, x1: p.width, z0: floorZ(p), z1: p.height }`), call
  `faceFrameGeometry(p.section, outer, p.frame)`, and extrude each member by
  `thicknessOf(member.role)` at `y ∈ [−frameThickness, 0]` — in front of the carcase, exactly as an
  overlay front is.
- [ ] **Step 4: Run, watch pass** (9 tests).
- [ ] **Step 5: Commit** — `feat(scene): a framed cabinet grows a frame`

---

## Task 7: the pipeline becomes five stages

**Files:** modify `src/scene/useScene.ts`, `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test** — the invariant that makes "opt-in" verifiable

```ts
  it('leaves a frameless cabinet byte-identical', () => {
    const before = applyPipeline(sceneWithFramelessCabinet())
    const after = applyPipeline(before)
    expect(after.parts).toEqual(before.parts)
    expect(after.components).toEqual(before.components)
  })
```

- [ ] **Step 2: Change `applyPipeline`**

```ts
export function applyPipeline(scene: Scene): Scene {
  return reconcileJoints(
    regenerateComponents(regenerateDrawers(regenerateFaceFrames(resolvePlacement(scene)))),
  )
}
```

Frames lead drawers for the reason drawers lead carcases: **the frame reads nothing either emits.**
Its inputs are the section tree, the cabinet's front rectangle and the frame parameters.

- [ ] **Step 3: Run the full suite** — `pnpm test`. A frameless scene must be unchanged.
- [ ] **Step 4: Commit** — `feat(scene): the pipeline gains a fourth generator`

---

## Task 8: the door mounts to the frame

`FrontGeometry.mount` is currently `'overlay' | 'inset'` and must widen. The reveal rule stays
stated **once** in this module: a framed cell measures its reveal to the frame opening exactly as a
frameless one measures to the carcase.

**Files:** modify `src/scene/frontCells.ts`, `src/scene/frontCells.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  // Frame opening from Task 1's fixture: a 600 × 720 cabinet on a 100 kick, 44 stiles, 32 rails.
  const FRAMED = { x0: 44, x1: 556, z0: 132, z1: 688 }

  it('sizes a framed overlay door to the frame opening, not the carcase', () => {
    const cell = onlyCell({ mount: 'overlay', reveal: 3, frameOpening: FRAMED, stileWidth: 44 })
    // The door laps onto the frame, so it is WIDER than the opening and narrower than the cabinet.
    expect(cell.rect.x0).toBeLessThan(FRAMED.x0)
    expect(cell.rect.x1).toBeGreaterThan(FRAMED.x1)
    expect(cell.rect.x0).toBeGreaterThan(0)
    expect(cell.rect.x1).toBeLessThan(600)
  })

  it('sits a framed inset door inside the frame opening', () => {
    const cell = onlyCell({ mount: 'inset', reveal: 3, frameOpening: FRAMED, stileWidth: 44 })
    expect(cell.rect.x0).toBe(FRAMED.x0 + 3)
    expect(cell.rect.x1).toBe(FRAMED.x1 - 3)
  })

  it('laps a half-overlay door onto half its stile', () => {
    const cell = onlyCell({ mount: 'half-overlay', reveal: 3, frameOpening: FRAMED, stileWidth: 44 })
    // Half the stile, less half a reveal — the lap is measured, not assumed.
    expect(FRAMED.x0 - cell.rect.x0).toBeCloseTo(44 / 2 - 1.5, 6)
    expect(cell.rect.x1 - FRAMED.x1).toBeCloseTo(44 / 2 - 1.5, 6)
  })

  // The frameless path must not move. This is the same assertion the existing suite already makes;
  // repeated here so a framed branch that leaked into the default fails in this file.
  it('leaves a frameless cell alone', () => {
    const cell = onlyCell({ mount: 'overlay', reveal: 3 })
    expect(cell.rect.x0).toBe(1.5)
    expect(cell.rect.x1).toBe(598.5)
  })
```

Write `onlyCell` as a local helper in that file building a one-leaf tree **whose leaf carries a
`front`** (a section with none emits no cell at all) and a `FrontGeometry`,
following the existing helpers there rather than inventing a second style.

- [ ] **Step 2: Run, watch fail.**
- [ ] **Step 3: Extend `FrontGeometry`** and branch on it:

```ts
export interface FrontGeometry {
  outer: Rect
  mount: 'overlay' | 'half-overlay' | 'inset'
  reveal: number
  // Present on a framed cabinet. A framed cell measures to the frame's opening rather than to the
  // carcase, which is the whole of what a face frame changes about a front. Keyed by section, so
  // stage 2's divisions need no new field. `stileWidth` is what a half-overlay door laps onto.
  frameOpenings?: Map<SectionId, Rect>
  stileWidth?: number
}
```

In the leaf branch, when `g.frameOpenings?.get(section.id)` is present, measure from that rectangle
instead of `sides`/`rect`, and give back the reveal by mount: overlay reaches the frame's outer
edge less half a reveal, `'half-overlay'` laps `stileWidth / 2` less half a reveal, and inset gives
back a full reveal on every side. Leave the frameless path untouched.

- [ ] **Step 4: Run, watch pass.**
- [ ] **Step 5: Commit** — `feat(scene): a door on a framed cabinet mounts to the frame`

---

## Task 9: file format v20

**Files:** modify `src/scene/useFile.ts`, `src/scene/useFile.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
  it('gives a v19 cabinet a frame material and no frame', () => {
    const scene = parseFile(v19FileJson())
    for (const c of scene.components) {
      if (c.kind !== 'carcase') continue
      expect(c.params.frame).toBeUndefined()
      expect(typeof c.params.frameMaterial).toBe('string')
      expect(c.params.frameMaterial.length).toBeGreaterThan(0)
    }
  })

  it('round-trips a framed cabinet and its frame component', () => {
    const back = parseFile(serializeScene(sceneWithFramedCabinet()))
    const cab = back.components.find((c) => c.kind === 'carcase')
    expect(cab?.kind === 'carcase' && cab.params.frame?.stileWidth).toBe(44)
    expect(cab?.kind === 'carcase' && cab.params.frame?.midStileWidth).toBe(56)
    expect(back.components.some((c) => c.kind === 'faceFrame')).toBe(true)
  })

  it('round-trips half-overlay', () => {
    const scene = sceneWithFramedCabinet('half-overlay')
    const cab = parseFile(serializeScene(scene)).components.find((c) => c.kind === 'carcase')
    expect(cab?.kind === 'carcase' && cab.params.frontMount).toBe('half-overlay')
  })
```

**This task is why those tests are not optional.** `useFile.ts` types `base.params` loosely, so
`tsc` **cannot** see a file-format regression here: the parser will compile while producing objects
that lack `frameMaterial`, and the failure appears only when `materialForRole` dereferences it at
runtime and `roleThicknessFor` throws its deliberately-fatal error. `CLAUDE.md` states this
explicitly, and this slice adds exactly such a field.

- [ ] **Step 2: Run, watch fail.**
- [ ] **Step 3: Bump and parse.** `FILE_FORMAT_VERSION = 20`; default `frameMaterial` to
  `DEFAULT_FRAME_MATERIAL` when absent; parse `frame` and the `faceFrame` component kind. Nothing
  defaults `frame` — absent already means frameless, which is why a v19 file needs no conversion
  for it.
- [ ] **Step 4: Run, watch pass.**
- [ ] **Step 5: Commit** — `feat(scene): file format v20 carries the face frame`

---

## Task 10: the frame is solid stock, and the nest already knows

**Files:** modify `src/scene/carcasePresets.ts`, `src/ui/buildCsv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('keeps frame members out of the nest', () => {
    // isNestable keys off the MATERIAL, not the role: solid stock has no `sheet`, so a stile is
    // excluded with no special-casing anywhere. This pins that property rather than a code path.
    expect(isNestable(PRESET_MATERIALS[DEFAULT_FRAME_MATERIAL])).toBe(false)
    expect(isNestable(PRESET_MATERIALS[DEFAULT_CARCASE_MATERIAL])).toBe(true)
  })
```

- [ ] **Step 2: Run, watch fail** (no such material).
- [ ] **Step 3: Add the material.** Export `DEFAULT_FRAME_MATERIAL = 'Hardwood 20mm'`, add it to
  `PRESET_MATERIALS` with a `thickness` of 20 and a `costPerM2`, and **no `sheet` key**. Set
  `frameMaterial: DEFAULT_FRAME_MATERIAL` on every preset. Leave `frame` undefined on all of them —
  the presets stay frameless, which is what makes this slice opt-in.
- [ ] **Step 4: Run, watch pass.**
- [ ] **Step 5: Commit** — `feat(scene): a frame is solid stock, so the nest leaves it alone`

---

## Task 11: the Frame section in the parameter panel

**Files:** modify `src/ui/CarcasePanel.tsx`, `src/ui/CarcasePanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('offers the frame fields only on a framed cabinet', () => {
    const { unmount } = renderPanel({ frame: undefined })
    expect(screen.queryByLabelText('Stile width')).toBeNull()
    unmount()
    renderPanel({ frame: { stileWidth: 44, railWidth: 32, midStileWidth: 56, midRailWidth: 38 } })
    expect(screen.getByLabelText('Stile width')).toBeTruthy()
  })

  it('turns a frame on with default members rather than zeroes', () => {
    const onChange = vi.fn()
    renderPanel({ frame: undefined }, onChange)
    fireEvent.click(screen.getByLabelText('Face frame'))
    const next = onChange.mock.calls[0][0]
    expect(next.frame.stileWidth).toBeGreaterThan(0)
    expect(next.frame.railWidth).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: Run, watch fail.**
- [ ] **Step 3: Add a collapsible Frame section** — a checkbox that sets or clears `frame`, then
  stile width, rail width and the frame material select. Follow the existing collapsible sections in
  that file rather than a new pattern. Toggling it **on** writes `DEFAULT_FRAME`, never an empty
  bag: a frame of zeroes declines, so the user would tick the box and see nothing happen.
- [ ] **Step 4: Run, watch pass.**
- [ ] **Step 5: Commit** — `feat(ui): edit a cabinet's face frame`

---

## Task 12: Mutation testing

`cp` each file to `$SCRATCHPAD` first and restore **from that copy**; **never `git checkout`** —
mid-task the file carries uncommitted work, and that has cost a whole group's edits before. Grep
after applying **and** after restoring. Predict before running. A run reporting **`Tests  no
tests`** is a **broken mutation, not a survivor** — and check the replacement did not also hit a
longer expression, which is exactly how that has happened twice in this repo.

| # | Mutation | Predicted to fail |
|---|---|---|
| 1 | `faceFrame`: rails span `outer.x0 … outer.x1` | *fits the rails between them* |
| 2 | `faceFrame`: stiles run `openZ0 … openZ1` | *runs the stiles full height* |
| 3 | `faceFrame`: members start at `0` instead of `outer.z0` | *starts at the rectangle it was given* |
| 4 | `faceFrame`: drop the `content.kind === 'split'` guard | *declines a cabinet whose tree splits* |
| 5 | `faceFrame`: drop the `frame === undefined` guard | *answers null for a frameless cabinet* |
| 6 | `faceFrame`: opening ignores the rails (`z0: outer.z0`) | *leaves an opening inside the frame* |
| 7 | `faceFrame`: `<=` → `<` in the opening guards | *declines when the stiles leave no opening* |
| 8 | `faceFrame`: drop the `drawer-front` guard | *declines a leaf wearing a drawer front* |
| 9 | `grain`: `stile-` returns `'x'` | *runs a stile vertical and a rail horizontal* |
| 10 | `resolveThickness`: `stile-` family falls through to carcase | *resolves a frame member to the frame slot* |
| 11 | `regenerateFaceFrames`: rebuild a detached frame | *keeps a detached frame* + *does not build a second* |
| 12 | `frontCells`: framed branch uses `sides`/`rect` | *sizes a framed overlay door to the frame opening* |
| 13 | `frontCells`: half-overlay laps the whole stile | *laps a half-overlay door onto half its stile* |
| 14 | `useFile`: drop the `frameMaterial` default | *gives a v19 cabinet a frame material* |

- [ ] **Step 1: Run each, record predicted vs actual.** A smaller-than-predicted count is a finding,
  not a pass — that is what revealed a rule reading a flag instead of its geometry once already.
- [ ] **Step 2: Restore, grep, and confirm `git diff --stat` shows only test files changed.**

---

## Task 13: Docs

- [ ] **Step 1: `CLAUDE.md` source tree** — add `faceFrame.ts` and `regenerateFaceFrames.ts` beside
  their neighbours, in the same two-line style.
- [ ] **Step 2: `CLAUDE.md` invariants** — add the frame rules, and **correct the two this slice
  makes stale**:
  - *"The regeneration pipeline order is fixed, and it is four stages"* → **five**
  - *"`regenerateDrawers` is the only one that adds or removes **components**"* → no longer true
- [ ] **Step 3:** `node scripts/update-structure-html.mjs`, then add a feature row to the
  hand-written prose.
- [ ] **Step 4: Notes** — append a stage-1 entry covering: **all four corrections at the top of this
  plan** (each was a spec or plan claim the code contradicted); the mutation table with every
  survivor; the measured test delta against Task 0; and what this plan itself got wrong.
- [ ] **Step 5: Commit** — `docs: the face frame, and the two invariants it makes stale`

---

## Task 14: Verify and push

- [ ] `pnpm typecheck; tc=$?` → 0
- [ ] `pnpm lint; lt=$?` → 0
- [ ] `pnpm test` → 0; record the delta against Task 0
- [ ] Run the **full e2e suite locally** before pushing — a new component kind reaches the viewport,
      the scene tree and the cutting list, and several specs sample canvas hues. The gizmo stage
      learned this the expensive way; the browser is at
      `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- [ ] `git push -u origin claude/next-suggested-task-z8rzaq`

---

## Not in this stage

Stage 2 (divisions and half-overlay across a split), stage 3 (drawers sized to the framed opening)
and stage 4 (face-frame hinges) follow. A framed cabinet with splits or drawers **declines** until
they land, rather than emitting something that looks buildable. `midStileWidth` and `midRailWidth`
are carried in the file from v20 but read by nothing until stage 2.

The stated figures remain unverified and want a woodworker rather than a green suite: the default
stile and rail widths, the half-overlay lap, and — from stage 4 — face-frame hinge geometry. They
are the same class as `SNAP_MM` and `BLIND_CLEARANCE` from the placement stages, and are listed
together in the notes for that reason.
