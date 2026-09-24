# Cabinet placement, stage 3: corners — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-14-cabinet-placement-design.md`
**Notes:** `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md`
**Prior stages:** stage 1 (#48), stage 2 (#49) — both merged.

**Goal:** Ship L-shapes — turn a cabinet from the plan view, inherit a target's rotation on a
corner drop, and flag a blind portion too narrow for the run returning into it.

**Baseline, measured on `f644198` (main, stage 2 merged):** to be taken at Task 0 below, not quoted.

---

## What stage 3 is NOT, measured before planning

The spec's one-line staging reads *"rotation in the plan view, front-face anchors, blind-width
validation"*. Two of those three are **already shipped**, verified by reading the source rather than
the summary:

- **Front-face anchors work today.** `Anchor['face']` has carried `'front' | 'back'` since stage 1
  (`types.ts:243`), `FACE_NORMAL` maps both (`anchor.ts`), `PlacementPanel` offers all four faces,
  and `anchorForDrop` already considers all four. Nothing to add.
- **The meeting-face rule is already pinned by a corner fixture.** The spec calls it "the
  load-bearing claim in this document" and warns that every straight-run fixture passes the broken
  rule. `anchor.test.ts:93` (*lands a turned cabinet against a blind unit front*), `:102` (*the
  turned cabinet then occupies the space the corner arithmetic predicts*) and
  `resolvePlacement.test.ts:170` (a 90°-rotated cabinet front-anchored to a `blind` target) are that
  fixture. **Do not re-add it.**
- **Rotation is already editable** — `PlacementPanel`'s `Rotation Z` field (`PlacementPanel.tsx:72`).

So an L-shape is **buildable today** by typing `90` into Rotation Z and picking a `front` anchor.
Stage 3 makes that ergonomic and catches the one way it goes wrong. Scope is correspondingly
narrow — resist widening it.

**Three things are actually missing:**

1. No way to turn a cabinet **from the plan view**, and turning one naively moves it (below).
2. **Decision 9 is unimplemented.** *"Does drag-anchoring inherit the target's rotation? **Yes**, as
   a UI default only."* `anchorForDrop` does not touch rotation. Without it, dragging a cabinet onto
   a blind unit's front face leaves it un-turned, facing the wrong way — the corner gesture does not
   work.
3. No **blind-width validation**.

---

## The stated assumption on blind width

The spec's rule is arithmetic and contains **no vendor figure**:

> The blind portion must be at least as wide as the return run's cabinets are deep.

What its Risks section calls unverified is not a catalogue number but the *judgement* that bare
contact is enough — whether real practice wants a margin for door swing, a handle, or a minimum
accessible opening.

**Assumption taken, and it is reversible in one number:** the margin is **0**, i.e. the spec's rule
exactly. It is isolated as `BLIND_CLEARANCE` in one module, so a woodworker's answer changes one
constant and the tests that read it, never the rule. This is recorded in the notes and in the PR as
an open question, not as a settled figure.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/scene/blindCorner.ts` | **create** | `BLIND_CLEARANCE`, `blindLeavesOf`, `cornerWarnings` — the whole blind-width rule |
| `src/scene/blindCorner.test.ts` | **create** | Blind-leaf identification, the width comparison, the asymmetric corner |
| `src/scene/turnCabinet.ts` | **create** | `turnedInPlace(c, materials, degrees)` — rotation plus the compensating translation |
| `src/scene/turnCabinet.test.ts` | **create** | Centre preserved, extents swapped, anchored case |
| `src/scene/dragAnchor.ts` | modify | Carry the target's rotation on a drop (decision 9) |
| `src/scene/dragAnchor.test.ts` | modify | Rotation inherited, and only as a default |
| `src/ui/PlanView.tsx` | modify | A turn control on the selected cabinet; warning styling |
| `src/ui/PlanView.test.tsx` | modify | Turn control, warning marks |
| `src/App.tsx` | modify | Wire the turn and apply an inherited rotation |
| `CLAUDE.md`, `project-structure.html`, notes | modify | Invariants, tree, feature row, stage-3 notes |

---

## Task 0: Baseline

- [ ] **Step 1: Confirm the tree is clean and on the merged main**

```bash
cd /home/user/zimmu-web
git fetch origin main
git checkout -B claude/next-suggested-task-z8rzaq origin/main
git log --oneline -1   # expect the stage-2 merge commit
```

- [ ] **Step 2: Measure, do not quote**

```bash
pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -5
```

Record files / passed / skipped. Every later delta is reported against **this** figure. Stage 2
recorded why: `git diff main...HEAD` read 6373 insertions against a stale local `main` where the
true diff was 2521.

---

## Task 1: `turnedInPlace` — a turn that does not fling the cabinet across the room

The spec's named risk, verbatim: *"Rotation is about the local origin, not the centre. A plan-view
'Rotate 90°' swings a cabinet around its front-left-bottom corner. It must be a rotation plus a
compensating translation, or cabinets fly across the room."*

The compensation is stated once, here, and reuses stage 2's `worldBoundsOf` /
`localRotatedBoundsOf` rather than recomposing the transform.

**Files:** create `src/scene/turnCabinet.ts`, `src/scene/turnCabinet.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/turnCabinet.test.ts
import { describe, it, expect } from 'vitest'
import { turnedInPlace } from './turnCabinet'
import { worldBoundsOf } from './carcaseWorldBounds'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent } from './types'

// Asymmetric: 600 wide against ~578 occupied depth, so a quarter turn visibly changes the extents.
const cab = (over: Partial<CarcaseComponent> = {}): CarcaseComponent => ({
  kind: 'carcase',
  id: 'cmp_a',
  label: 'A',
  parentId: null,
  position: { x: 1000, y: 400, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params: CARCASE_PRESETS[0].params,
  ...over,
})

const centre = (c: CarcaseComponent) => {
  const b = worldBoundsOf(c, PRESET_MATERIALS)
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }
}

describe('turnedInPlace', () => {
  it('adds the turn to the cabinet rotation', () => {
    expect(turnedInPlace(cab(), PRESET_MATERIALS, 90).rotation.z).toBe(90)
  })

  it('keeps the footprint centre where it was', () => {
    const before = cab()
    const after = turnedInPlace(before, PRESET_MATERIALS, 90)
    expect(centre(after).x).toBeCloseTo(centre(before).x, 6)
    expect(centre(after).y).toBeCloseTo(centre(before).y, 6)
  })

  // The regression the compensation exists to prevent: rotating about the local origin alone moves
  // the box by most of its own size.
  it('moves the position, because the box turns about its own origin', () => {
    const before = cab()
    const after = turnedInPlace(before, PRESET_MATERIALS, 90)
    expect(after.position).not.toEqual(before.position)
  })

  it('swaps the footprint extents', () => {
    const before = cab()
    const b0 = worldBoundsOf(before, PRESET_MATERIALS)
    const b1 = worldBoundsOf(turnedInPlace(before, PRESET_MATERIALS, 90), PRESET_MATERIALS)
    expect(b1.x1 - b1.x0).toBeCloseTo(b0.y1 - b0.y0, 6)
    expect(b1.y1 - b1.y0).toBeCloseTo(b0.x1 - b0.x0, 6)
  })

  it('wraps at a full turn rather than growing without bound', () => {
    const turned = turnedInPlace(cab({ rotation: { x: 0, y: 0, z: 270 } }), PRESET_MATERIALS, 90)
    expect(turned.rotation.z).toBe(0)
  })

  it('returns to the starting box after four quarter turns', () => {
    const start = cab()
    let c = start
    for (let i = 0; i < 4; i++) c = turnedInPlace(c, PRESET_MATERIALS, 90)
    const a = worldBoundsOf(start, PRESET_MATERIALS)
    const b = worldBoundsOf(c, PRESET_MATERIALS)
    expect(b.x0).toBeCloseTo(a.x0, 6)
    expect(b.y0).toBeCloseTo(a.y0, 6)
  })

  it('leaves the height alone', () => {
    const b0 = worldBoundsOf(cab(), PRESET_MATERIALS)
    const b1 = worldBoundsOf(turnedInPlace(cab(), PRESET_MATERIALS, 90), PRESET_MATERIALS)
    expect(b1.z0).toBeCloseTo(b0.z0, 9)
    expect(b1.z1 - b1.z0).toBeCloseTo(b0.z1 - b0.z0, 9)
  })
})
```

- [ ] **Step 2: Run it, watch it fail** — `pnpm vitest run src/scene/turnCabinet.test.ts`; expect an unresolved import.

- [ ] **Step 3: Write the module**

```ts
// src/scene/turnCabinet.ts
import type { CarcaseComponent, MaterialDef } from './types'
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'

// A component's transform is translate(position) ∘ rotate(euler) about its LOCAL ORIGIN, and a
// cabinet's origin is its front-left-bottom corner — not its centre. So turning a cabinet by
// changing `rotation` alone swings it bodily around that corner: a 600 × 578 base unit moves most
// of its own size. Every turn therefore carries a compensating translation, and it is stated here
// rather than in a click handler.
//
// The invariant chosen is "the footprint centre does not move", which is what a plan-view turn
// looks like to a person. An ANCHORED cabinet has its position rewritten by `resolvePlacement`
// anyway, so for one this is harmless rather than wrong; a free-placed cabinet is the case that
// needs it.
export function turnedInPlace(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
  degrees: number,
): CarcaseComponent {
  const before = worldBoundsOf(c, materials)
  // Wrapped, so repeated turns cannot grow the stored number without bound — a rotation of 3600 is
  // the same cabinet and a worse thing to read in a file.
  const z = (((c.rotation.z + degrees) % 360) + 360) % 360
  const turned = { ...c, rotation: { ...c.rotation, z } }

  const local = localRotatedBoundsOf(turned, materials)
  const cx = (before.x0 + before.x1) / 2
  const cy = (before.y0 + before.y1) / 2
  return {
    ...turned,
    position: {
      ...c.position,
      x: cx - (local.x0 + local.x1) / 2,
      y: cy - (local.y0 + local.y1) / 2,
    },
  }
}
```

- [ ] **Step 4: Run it, watch it pass** (7 tests).
- [ ] **Step 5: Commit** — `feat(scene): a turn that keeps the cabinet where it is`

---

## Task 2: the drop inherits the target's rotation (decision 9)

Without this the corner gesture does not work: dragging a cabinet onto a blind unit's **front** face
leaves it at 0°, facing out of the wall instead of along it.

Decision 9 says inherit **as a UI default only** — so `anchorForDrop` reports a *suggested*
rotation and never mutates; `App` applies it only when it makes a difference.

**Files:** modify `src/scene/dragAnchor.ts`, `src/scene/dragAnchor.test.ts`

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe`

```ts
  it('suggests the target rotation on a drop', () => {
    const turned = cab('cmp_t', { rotation: { x: 0, y: 0, z: 90 } })
    const r = anchorForDrop(dragged, { x: W + 3, y: 0, z: 0 }, [turned], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.rotationZ).toBe(90)
  })

  it('suggests the target rotation even when it is zero', () => {
    const r = anchorForDrop(dragged, { x: W + 3, y: 0, z: 0 }, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.rotationZ).toBe(0)
  })

  it('suggests nothing on a free drop', () => {
    const r = anchorForDrop(dragged, { x: 99999, y: 0, z: 0 }, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
  })
```

- [ ] **Step 2: Run, watch fail** (`rotationZ` does not exist).

- [ ] **Step 3: Add it**

In `src/scene/dragAnchor.ts`, widen the anchor arm of `Drop`:

```ts
export type Drop =
  // `rotationZ` is the TARGET's rotation, offered as a UI default — decision 9. It is a
  // suggestion, never part of the anchor: rotation is always the user's, and an anchor derives
  // position only. A corner is a cabinet both turned and anchored, and those stay two facts.
  | { kind: 'anchor'; anchor: Anchor; rotationZ: number }
  | { kind: 'free'; position: Vec3 }
```

Carry the target's rotation alongside the winning candidate — change the `best` accumulator to
`{ anchor, distance, rotationZ }`, setting `rotationZ: t.rotation.z` where the anchor is built, and
return it:

```ts
  return best === undefined
    ? { kind: 'free', position: drop }
    : { kind: 'anchor', anchor: best.anchor, rotationZ: best.rotationZ }
```

- [ ] **Step 4: Run, watch pass.**
- [ ] **Step 5: Commit** — `feat(scene): a corner drop inherits the target's rotation`

---

## Task 3: `cornerWarnings` — the blind-width rule

**The rule.** A **blind leaf** is a leaf section wearing no door: `front === undefined`, or a
`'panel'` or `'false-front'`. (A `'door'` or `'drawer-front'` leaf is the accessible part.) When a
cabinet is **front-anchored** to another — which is how a return run butts into a blind unit — the
target's blind leaves must together be at least as wide as the anchored cabinet is deep, plus
`BLIND_CLEARANCE`. Narrower, and the return run overhangs the accessible opening and the door fouls
it.

**Files:** create `src/scene/blindCorner.ts`, `src/scene/blindCorner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/blindCorner.test.ts
import { describe, it, expect } from 'vitest'
import { BLIND_CLEARANCE, cornerWarnings } from './blindCorner'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import { splitSection } from './editSection'
import { setFrontOn } from './sectionInterior'
import type { Anchor, CarcaseComponent, CarcaseParams, Component } from './types'

const base = CARCASE_PRESETS[0].params

// A blind unit: one carcase split in two, the left leaf wearing a door and the right leaf nothing.
// Deliberately lopsided so the blind leaf's width is not half the cabinet.
function blindParams(width: number): CarcaseParams {
  // Five args: splitSection(root, id, axis, division, count). 'vertical' puts the children side
  // by side; 'panel' makes a real partition between them.
  const split = splitSection(base.section, base.section.id, 'vertical', 'panel', 2)
  const [accessible, blind] = split.content.kind === 'split' ? split.content.children : []
  let tree = setFrontOn(split, accessible.id, { kind: 'door', leaves: 1, hinge: 'left' })
  tree = setFrontOn(tree, blind.id, undefined)
  return { ...base, width, section: tree }
}

const cab = (
  id: string,
  params: CarcaseParams,
  over: Partial<CarcaseComponent> = {},
): CarcaseComponent => ({
  kind: 'carcase',
  id,
  label: id,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  visible: true,
  params,
  ...over,
})

const frontAnchor = (to: string): Anchor => ({
  to,
  face: 'front',
  gap: 0,
  offset: { u: 0, v: 0 },
})

const warn = (cs: Component[]) => cornerWarnings(cs, PRESET_MATERIALS)

describe('cornerWarnings', () => {
  it('says nothing when the blind portion is wide enough', () => {
    // A 1200 blind unit splits to a ~590 blind leaf; a 400-deep return clears it.
    const blind = cab('cmp_blind', blindParams(1200))
    const ret = cab('cmp_ret', { ...base, depth: 400 }, {
      rotation: { x: 0, y: 0, z: 90 },
      anchor: frontAnchor('cmp_blind'),
    })
    expect(warn([blind, ret])).toEqual([])
  })

  it('flags a blind portion narrower than the return depth', () => {
    // A 700 blind unit splits to a ~340 blind leaf; a 560-deep return overhangs it.
    const blind = cab('cmp_blind', blindParams(700))
    const ret = cab('cmp_ret', { ...base, depth: 560 }, {
      rotation: { x: 0, y: 0, z: 90 },
      anchor: frontAnchor('cmp_blind'),
    })
    const w = warn([blind, ret])
    expect(w).toHaveLength(1)
    expect(w[0].cabinetId).toBe('cmp_ret')
    expect(w[0].targetId).toBe('cmp_blind')
    expect(w[0].required).toBeGreaterThan(w[0].available)
  })

  it('ignores a left or right anchor — a straight run has no blind portion', () => {
    const blind = cab('cmp_blind', blindParams(700))
    const ret = cab('cmp_ret', { ...base, depth: 560 }, {
      anchor: { ...frontAnchor('cmp_blind'), face: 'right' },
    })
    expect(warn([blind, ret])).toEqual([])
  })

  it('ignores a free-placed cabinet', () => {
    expect(warn([cab('cmp_blind', blindParams(700)), cab('cmp_ret', base)])).toEqual([])
  })

  // A cabinet whose every leaf wears a door has no blind portion to return into at all.
  it('flags a front anchor onto a cabinet with no blind leaf', () => {
    const allDoors = { ...base, section: setFrontOn(base.section, base.section.id, { kind: 'door', leaves: 1, hinge: 'left' }) }
    const target = cab('cmp_t', allDoors)
    const ret = cab('cmp_ret', { ...base, depth: 560 }, {
      rotation: { x: 0, y: 0, z: 90 },
      anchor: frontAnchor('cmp_t'),
    })
    const w = warn([target, ret])
    expect(w).toHaveLength(1)
    expect(w[0].available).toBe(0)
  })

  it('honours the clearance constant', () => {
    expect(BLIND_CLEARANCE).toBeGreaterThanOrEqual(0)
  })

  it('ignores an anchor naming a component that is not there', () => {
    const ret = cab('cmp_ret', base, { anchor: frontAnchor('cmp_missing') })
    expect(warn([ret])).toEqual([])
  })
})
```

- [ ] **Step 2: Run, watch fail.**

- [ ] **Step 3: Write the module**

```ts
// src/scene/blindCorner.ts
import type { CarcaseComponent, Component, ComponentId, MaterialDef } from './types'
import { openingRect, sectionThickness, validateCarcaseParams } from './carcaseRoles'
import { roleThicknessFor, type PartOverrides } from './resolveThickness'
import { resolveSections } from './sectionTree'
import { sectionOpenings } from './sectionInterior'
import { carcaseBounds } from './carcaseBounds'

// How much WIDER than the return run's depth the blind portion has to be.
//
// The spec's rule is bare contact — the blind portion at least as wide as the return cabinets are
// deep — and that rule contains no vendor figure, only arithmetic. Whether real practice wants a
// margin here for door swing, a handle, or a minimum accessible opening is a woodworker's call that
// has NOT been made. Zero is the spec as written, isolated so that answer changes one number.
export const BLIND_CLEARANCE = 0

const NO_OVERRIDES = new Map<string, PartOverrides>()

export interface CornerWarning {
  // The cabinet returning into the corner.
  cabinetId: ComponentId
  // The blind unit it returns into.
  targetId: ComponentId
  // How wide the blind portion has to be, and how wide it is.
  required: number
  available: number
}

// The total width of a cabinet's blind leaves: the ones wearing no door. A 'panel' or
// 'false-front' leaf is blind — it is a dead front over the corner — while 'door' and
// 'drawer-front' are the accessible part. `front === undefined` is a bare opening, also blind.
export function blindWidthOf(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): number | null {
  const thicknessOf = roleThicknessFor(c.params, materials, NO_OVERRIDES)
  // Mid-keystroke parameters are not an error anywhere else in this codebase and are not one here.
  if (validateCarcaseParams(c.params, thicknessOf).length > 0) return null
  const tree = resolveSections(
    c.params.section,
    openingRect(c.params, thicknessOf),
    sectionThickness(thicknessOf),
  )
  let total = 0
  for (const o of sectionOpenings(c.params.section, tree)) {
    const front = o.section.front
    const blind = front === undefined || front.kind === 'panel' || front.kind === 'false-front'
    if (blind) total += o.rect.x1 - o.rect.x0
  }
  return total
}

// Every corner whose blind portion is too narrow for the run returning into it.
//
// Only a FRONT anchor makes a corner: that is how a return run butts into a blind unit, and it is
// the same face that starts a new run in `runs.ts`. A left or right anchor is a straight run, where
// there is no blind portion in play at all.
export function cornerWarnings(
  components: Component[],
  materials: Record<string, MaterialDef>,
): CornerWarning[] {
  const carcases = new Map<ComponentId, CarcaseComponent>()
  for (const c of components) if (c.kind === 'carcase') carcases.set(c.id, c)

  const warnings: CornerWarning[] = []
  for (const c of carcases.values()) {
    const a = c.anchor
    if (a === undefined || a.face !== 'front') continue
    const t = carcases.get(a.to)
    // Honoured on exactly resolvePlacement's terms: a corner the resolver does not build is not a
    // corner to warn about.
    if (t === undefined || t.id === c.id || t.parentId !== c.parentId) continue

    const available = blindWidthOf(t, materials)
    if (available === null) continue

    // The return run's DEPTH is what has to fit, measured on its occupied box in its own frame —
    // not its world footprint, which is the same number seen through whatever rotation put it
    // there, and null when the parameters do not build.
    const thicknessOf = roleThicknessFor(c.params, materials, NO_OVERRIDES)
    if (validateCarcaseParams(c.params, thicknessOf).length > 0) continue
    const own = carcaseBounds(c.params, thicknessOf)
    const required = own.y1 - own.y0 + BLIND_CLEARANCE

    if (available + 1e-6 < required) {
      warnings.push({ cabinetId: c.id, targetId: t.id, required, available })
    }
  }
  return warnings
}
```

- [ ] **Step 4: Run, watch pass.** If a fixture's arithmetic is off, **fix the fixture against a
  measured figure**, never loosen the assertion — print `blindWidthOf` for the fixture and use the
  real number.
- [ ] **Step 5: Commit** — `feat(scene): flag a blind corner too narrow to return into`

---

## Task 4: the plan view turns a cabinet and shows the warning

**Files:** modify `src/ui/PlanView.tsx`, `src/ui/PlanView.test.tsx`, `src/App.tsx`

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe`

```tsx
  it('offers a turn control for the selected cabinet only', () => {
    draw(twoInARun(), 'cmp_b')
    expect(screen.getByRole('button', { name: /rotate/i })).toBeTruthy()
  })

  it('offers no turn control when nothing is selected', () => {
    draw(twoInARun())
    expect(screen.queryByRole('button', { name: /rotate/i })).toBeNull()
  })

  it('asks to turn the selected cabinet', async () => {
    const onTurn = vi.fn()
    render(
      <PlanView
        scene={twoInARun()}
        selectedId="cmp_b"
        onSelect={vi.fn()}
        onDrop={vi.fn()}
        onTurn={onTurn}
        warnings={[]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /rotate/i }))
    expect(onTurn).toHaveBeenCalledWith('cmp_b')
  })

  it('marks a cabinet the corner check warns about', () => {
    render(
      <PlanView
        scene={twoInARun()}
        selectedId={null}
        onSelect={vi.fn()}
        onDrop={vi.fn()}
        onTurn={vi.fn()}
        warnings={[{ cabinetId: 'cmp_b', targetId: 'cmp_a', required: 560, available: 340 }]}
      />,
    )
    expect(screen.getByTestId('plan-cabinet-cmp_b').getAttribute('data-warned')).toBe('true')
    expect(screen.getByTestId('plan-cabinet-cmp_a').getAttribute('data-warned')).toBe('false')
  })
```

Update the shared `draw` helper to pass the two new props (`onTurn: vi.fn()`, `warnings: []`) so the
existing nine tests keep compiling.

- [ ] **Step 2: Run, watch fail.**

- [ ] **Step 3: Extend `PlanView`**

Add to the props type and destructure: `onTurn: (id: ComponentId) => void` and
`warnings: readonly CornerWarning[]` (import the type from `../scene/blindCorner`).

Build a lookup before the return, beside `runs`:

```tsx
  const warned = useMemo(
    () => new Set(warnings.map((w) => w.cabinetId)),
    [warnings],
  )
```

On each footprint `<rect>`, add `data-warned={warned.has(c.id)}` and fold the warning into the
class (a warned cabinet reads as warned whether or not it is selected):

```tsx
                className={
                  warned.has(c.id)
                    ? 'fill-destructive/25 stroke-destructive cursor-pointer'
                    : isSelected
                      ? 'fill-primary/25 stroke-primary cursor-pointer'
                      : 'fill-background stroke-border cursor-pointer hover:fill-accent'
                }
```

Render the turn control outside the SVG, so it is a real button rather than SVG text — the pane
already wraps the `<svg>` in a `<div className="flex-1 min-w-0 flex flex-col …">`:

```tsx
      {selectedId !== null && (
        <div className="p-1.5">
          <Button size="sm" variant="outline" onClick={() => onTurn(selectedId)}>
            Rotate 90°
          </Button>
        </div>
      )}
```

Import `Button` from `@/components/ui/button`, as `PlacementPanel` does.

- [ ] **Step 4: Wire `App`**

Import `turnedInPlace` and `cornerWarnings`, compute the warnings beside the other derived scene
values, and pass both props:

```tsx
  const warnings = useMemo(
    () => cornerWarnings(scene.components, scene.materials),
    [scene.components, scene.materials],
  )
```

```tsx
            onTurn={(id) =>
              onUpdateComponent(id, (c) =>
                c.kind !== 'carcase' ? c : turnedInPlace(c, scene.materials, 90),
              )
            }
            warnings={warnings}
```

And apply the inherited rotation in the existing `onDrop`, which now also carries `rotationZ`:

```tsx
              onUpdateComponent(id, (c) =>
                c.kind !== 'carcase'
                  ? c
                  : drop.kind === 'anchor'
                    ? { ...c, anchor: drop.anchor, rotation: { ...c.rotation, z: drop.rotationZ } }
                    : { ...c, anchor: undefined, position: drop.position },
              )
```

- [ ] **Step 5: Run `pnpm vitest run src/ui/PlanView.test.tsx src/App.test.tsx`.**
- [ ] **Step 6: Commit** — `feat(ui): turn a cabinet in the plan view, and flag a tight corner`

---

## Task 5: Mutation testing

Back up with `cp` first; **never `git checkout`**. Grep after applying and after restoring. Predict
before running; a smaller-than-predicted failure count is a finding, not a pass.

```bash
S="$(mktemp -d)"
cp src/scene/turnCabinet.ts "$S/"; cp src/scene/blindCorner.ts "$S/"; cp src/scene/dragAnchor.ts "$S/"
```

| # | Mutation | Predicted |
|---|---|---|
| 1 | `turnCabinet`: drop the compensating translation (return `turned`) | *keeps the footprint centre* |
| 2 | `turnCabinet`: compensate with `before` min instead of centre | *keeps the footprint centre* |
| 3 | `turnCabinet`: drop the `% 360` wrap | *wraps at a full turn* |
| 4 | `blindCorner`: accept `'panel'` as accessible (drop it from the blind test) | *flags a blind portion narrower…* |
| 5 | `blindCorner`: warn on every face, not just `front` | *ignores a left or right anchor* |
| 6 | `blindCorner`: compare against the target's depth, not the anchored cabinet's | *flags a blind portion narrower…* |
| 7 | `blindCorner`: flip the comparison to `>` | *says nothing when wide enough* |
| 8 | `dragAnchor`: report `rotationZ: 0` always | *suggests the target rotation on a drop* |

- [ ] **Step 1: Run each, record predicted vs actual.**
- [ ] **Step 2: Restore from the backups and grep to confirm each restore.**
- [ ] **Step 3: `pnpm typecheck && pnpm lint && pnpm test` green.**

---

## Task 6: Docs

- [ ] **Step 1: `CLAUDE.md` source tree** — add under `src/scene/`:

```
│   ├── turnCabinet.ts   turnedInPlace(c, materials, degrees) — a turn plus the compensating
│   │                    translation, so a cabinet turns about its footprint centre rather than
│   │                    flying off around its own origin
│   ├── blindCorner.ts   BLIND_CLEARANCE + blindWidthOf + cornerWarnings — the blind portion must
│   │                    be at least as wide as the run returning into it is deep
```

- [ ] **Step 2: `CLAUDE.md` invariants** — add:

```
- **A turn is a rotation plus a translation.** A component rotates about its LOCAL ORIGIN, and a
  cabinet's origin is its front-left-bottom corner, so changing `rotation.z` alone swings a 600 ×
  578 base unit most of its own size across the room. `turnedInPlace` states the compensation once
  and preserves the **footprint centre**, which is what a plan-view turn looks like to a person. An
  anchored cabinet has its position rewritten by `resolvePlacement` anyway, so the free-placed one
  is the case that needs it. The turn wraps at 360°: a stored rotation of 3600 is the same cabinet
  and a worse thing to read in a file.
- **Only a front anchor makes a corner, and the blind portion is what the return run eats.** A blind
  leaf is one wearing no door — `front === undefined`, `'panel'` or `'false-front'` — and
  `cornerWarnings` requires the blind leaves to be at least as wide as the anchored cabinet is deep.
  The depth is read off the return cabinet's own `carcaseBounds`, never its world footprint, which
  is the same number seen through whatever rotation put it there. `BLIND_CLEARANCE` is **0** — the
  spec's rule exactly — and is isolated because whether bare contact is enough is a woodworker's
  call that has not been made, not a figure anyone has checked.
- **A drop suggests a rotation; it never sets one.** `anchorForDrop` reports the target's
  `rotationZ` as a UI default (decision 9) and keeps it out of `Anchor` entirely: an anchor derives
  position only, and a corner is a cabinet both turned *and* anchored — two facts, not one.
```

- [ ] **Step 3:** `node scripts/update-structure-html.mjs`, then extend the placement feature row's
  description to mention corners, or add a row for them in the same shape as its neighbours.

- [ ] **Step 4: Notes** — append a dated stage-3 entry to
  `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md` covering: that two of the three
  staged items were already shipped and how that was established (read the source, not the
  summary); the `BLIND_CLEARANCE = 0` assumption and that it is open; the mutation table with
  predicted vs actual and every survivor; the measured test delta against Task 0's baseline; and
  what this plan got wrong.

- [ ] **Step 5: Commit** — `docs: corners, the turn rule, and the blind-width check`

---

## Task 7: Verify and push

- [ ] `pnpm typecheck` → exit 0 (gate on the command, **never** through a pipe to `tail` — a
      pipeline reports `tail`'s status and silently masked a lint failure in stage 2).
- [ ] `pnpm lint` → exit 0
- [ ] `pnpm test` → exit 0; record files/passed/skipped and the delta against Task 0.
- [ ] `git push -u origin claude/next-suggested-task-z8rzaq`

---

## Not in this stage

Stage 4 (the viewport move gizmo) remains. Still excluded by the design itself: a `'top'` anchor
side, walls as objects, filler strips, and per-run operations beyond what a chain gives for free.

`SNAP_MM = 60` remains a judgement figure that has never been felt in the running app, and
`BLIND_CLEARANCE = 0` is an open woodworking question rather than a settled one. Both are one-line
changes when someone has an answer.
