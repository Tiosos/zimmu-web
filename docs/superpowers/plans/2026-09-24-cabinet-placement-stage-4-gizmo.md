# Cabinet placement, stage 4: the move gizmo — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-14-cabinet-placement-design.md` (surface C)
**Notes:** `docs/superpowers/notes/2026-09-14-cabinet-placement-notes.md`
**Prior stages:** #48 (primitive), #49 (runs + plan view), #50 (corners) — all merged.

**Goal:** Drag the selected cabinet in the 3D viewport, snapping to a neighbour's face, without
breaking orbit.

**Baseline, measured on `f90c1f3` (main, stage 3 merged):** 105 test files, **2051 passed**, 10
skipped. `pnpm typecheck && pnpm lint && pnpm test` all exit 0. Report every delta against **this**
figure, and gate on the real exit code — `pnpm lint; lt=$?` — never a pipe through `tail`, which
reports `tail`'s status and silently masked a lint failure in stage 2.

---

## What the spec gives us, and what it does not

Surface C is **one table row** and **one risk paragraph**. The row:

> `render/viewport.tsx` + `scene/useMoveGizmo.ts` — A move gizmo on the selected cabinet, snapping
> to a neighbour's face.

The risk, verbatim, and it is the whole engineering problem:

> **Surface C was chosen against recommendation.** It is the largest piece of new interaction code,
> it duplicates what the plan view does, and it competes with `OrbitControls` for the same mouse
> drag. Staged last so it cannot block the rest.

**That conflict has no precedent in this codebase, measured before planning.** `interactionActive`
looks like it might gate orbit and does not: it sets the cursor (`viewport.tsx:677`) and routes
face clicks (`:357`, `:382`), nothing more. Every existing gesture — snap, cut, and the five joint
tools — is **click**-based, discriminated from a drag by a 4-pixel threshold in `handleClick`
(`:347`). Orbit is enabled unconditionally, always, and never has to yield. The gizmo is the first
**drag**-based gesture in the app.

## Decisions taken with the user (2026-09-24 session)

| # | Question | Decision |
|---|---|---|
| 1 | Hand-rolled handles, or Three's `TransformControls`? | **`TransformControls`** |
| 2 | Which axes? | **X, Y and Z** *(against recommendation, which was X/Y only)* |

**Decision 1** is a reuse call. `TransformControls.js` ships inside `three@0.184.0` at
`three/examples/jsm/controls/` — the same directory `OrbitControls` is already imported from
(`viewport.tsx:3`), so it is a **zero-dependency** addition. Its `dragging-changed` event is the
standard solution to precisely the risk the spec names:

```ts
gizmo.addEventListener('dragging-changed', (e) => { controls.enabled = !e.value })
```

Orbit is suspended only while a handle is actually held, which is the narrowest possible
suspension. Hand-rolling arrows, raycasts and a drag plane would be ~150 lines re-solving this.

**Verified against the installed source, not from memory** (`node_modules/three/examples/jsm/controls/TransformControls.js`):
`defineProperty` at `:105-131` dispatches `` `${propName}-changed` `` carrying `{ value }`, and
`dragging` is one of those properties (`:225`) — so `dragging-changed` is real and typed as
`{ value: boolean }`. `getHelper()` exists at `:424`; the dispatched events are `change`,
`mouseDown`, `mouseUp` and `objectChange`.

**Decision 2 went against the recommendation**, which was X/Y only on the grounds that placement is
2D — the design excludes a `'top'` anchor side and nothing stacks. The user chose all three axes,
and the reason it composes better than expected is worth stating: for a `left`/`right`/`front`/`back`
face, `anchorForDrop`'s **in-plane `v` axis is z**. So a wall unit dragged beside another wall unit
snaps *flush in height* through the existing rule, with no new arithmetic. Z is not an unsnapped
free axis after all.

---

## The architecture, and one deliberate deviation from the spec

The spec names `scene/useMoveGizmo.ts`. **This plan does not create it**, and the reason is
`CLAUDE.md`'s own rule — *no abstractions for single-use code*. There is no gizmo state to hook:
the drag lives in `TransformControls`, the resolution is one call in `App`, and a hook wrapping a
single callback would be a file that exists to match a table row. What there *is* is real
arithmetic, and that goes in a pure module, exactly as stages 2 and 3 put theirs in `dragAnchor.ts`
and `turnCabinet.ts`. Record the deviation in the notes.

**The arithmetic that is genuinely new.** `TransformControls` attaches to an `Object3D` and reports
*its* position. The gizmo must sit at the cabinet's **footprint centre** — dangling it off the
front-left-bottom corner, which is where a cabinet's origin actually is, puts the handles outside
the box and makes a 600 × 578 cabinet look like it is being dragged by a corner it does not have.
So two conversions are needed, and they mirror `turnedInPlace`'s centre logic:

- `gizmoCentreOf(c, materials)` — where the handles go, in the parent frame.
- `positionForCentre(c, materials, centre)` — the `position` that puts the centre there.

| File | Status | Responsibility |
|---|---|---|
| `src/scene/moveGizmo.ts` | **create** | `gizmoCentreOf`, `positionForCentre`, `dropForCentre` — the whole centre↔origin rule, pure |
| `src/scene/moveGizmo.test.ts` | **create** | Round trip, asymmetric box, rotated cabinet, snap reuse |
| `src/render/viewport.tsx` | modify | `TransformControls` on a proxy object; `dragging-changed` → orbit |
| `src/App.tsx` | modify | Pass the selected cabinet down; resolve a drop through `onUpdateComponent` |
| `src/App.test.tsx` | modify | The gizmo target follows the selection |
| `CLAUDE.md`, `project-structure.html`, notes | modify | Invariants, tree, feature row, stage-4 notes |

---

## Task 0: Baseline

- [ ] **Step 1: Branch from the merged main**

```bash
cd /home/user/zimmu-web
git fetch origin main
git checkout -B claude/next-suggested-task-z8rzaq origin/main
git log --oneline -1   # expect f90c1f3, the stage-3 merge
```

- [ ] **Step 2: Measure, do not quote**

```bash
pnpm typecheck; echo "tc=$?"
pnpm lint; echo "lint=$?"
pnpm test 2>&1 | tail -5
```

Expect 105 files / 2051 passed / 10 skipped, all exit 0.

---

## Task 1: `moveGizmo.ts` — where the handles go, and what a drop means

**Files:** create `src/scene/moveGizmo.ts`, `src/scene/moveGizmo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/scene/moveGizmo.test.ts
import { describe, it, expect } from 'vitest'
import { dropForCentre, gizmoCentreOf, positionForCentre } from './moveGizmo'
import { worldBoundsOf } from './carcaseWorldBounds'
import { SNAP_MM } from './dragAnchor'
import { CARCASE_PRESETS, PRESET_MATERIALS } from './carcasePresets'
import type { CarcaseComponent } from './types'

// Asymmetric on purpose: 600 wide against ~578 occupied depth and 870 tall, so a centre computed
// on the wrong axis is visible.
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

describe('gizmoCentreOf', () => {
  it('sits at the centre of the occupied box, not at the origin', () => {
    const c = cab('cmp_a')
    const b = worldBoundsOf(c, PRESET_MATERIALS)
    const centre = gizmoCentreOf(c, PRESET_MATERIALS)
    expect(centre.x).toBeCloseTo((b.x0 + b.x1) / 2, 6)
    expect(centre.y).toBeCloseTo((b.y0 + b.y1) / 2, 6)
    expect(centre.z).toBeCloseTo((b.z0 + b.z1) / 2, 6)
    // The whole point: a cabinet's origin is its front-left-bottom corner, so the centre is not it.
    expect(centre.x).not.toBeCloseTo(c.position.x, 3)
  })

  it('moves with the cabinet', () => {
    const at = gizmoCentreOf(cab('cmp_a', { position: { x: 100, y: 20, z: 5 } }), PRESET_MATERIALS)
    const origin = gizmoCentreOf(cab('cmp_a'), PRESET_MATERIALS)
    expect(at.x).toBeCloseTo(origin.x + 100, 6)
    expect(at.y).toBeCloseTo(origin.y + 20, 6)
    expect(at.z).toBeCloseTo(origin.z + 5, 6)
  })

  // Rotations are stored in DEGREES (composeWorldMatrix multiplies by DEG2RAD). A test written in
  // radians turns a cabinet 1.57° and passes for the wrong reason — stage 2 learned this.
  it('follows a turned cabinet', () => {
    const turned = cab('cmp_a', { rotation: { x: 0, y: 0, z: 90 } })
    const b = worldBoundsOf(turned, PRESET_MATERIALS)
    const centre = gizmoCentreOf(turned, PRESET_MATERIALS)
    expect(centre.x).toBeCloseTo((b.x0 + b.x1) / 2, 6)
    expect(centre.y).toBeCloseTo((b.y0 + b.y1) / 2, 6)
  })
})

describe('positionForCentre', () => {
  it('is the inverse of gizmoCentreOf', () => {
    const c = cab('cmp_a', { position: { x: 137, y: -42, z: 11 } })
    const back = positionForCentre(c, PRESET_MATERIALS, gizmoCentreOf(c, PRESET_MATERIALS))
    expect(back.x).toBeCloseTo(c.position.x, 6)
    expect(back.y).toBeCloseTo(c.position.y, 6)
    expect(back.z).toBeCloseTo(c.position.z, 6)
  })

  it('is the inverse for a turned cabinet too', () => {
    const c = cab('cmp_a', { position: { x: 137, y: -42, z: 11 }, rotation: { x: 0, y: 0, z: 90 } })
    const back = positionForCentre(c, PRESET_MATERIALS, gizmoCentreOf(c, PRESET_MATERIALS))
    expect(back.x).toBeCloseTo(c.position.x, 6)
    expect(back.y).toBeCloseTo(c.position.y, 6)
  })

  it('puts the centre where it was asked to', () => {
    const c = cab('cmp_a')
    const moved = { ...c, position: positionForCentre(c, PRESET_MATERIALS, { x: 900, y: 300, z: 400 }) }
    const centre = gizmoCentreOf(moved, PRESET_MATERIALS)
    expect(centre.x).toBeCloseTo(900, 6)
    expect(centre.y).toBeCloseTo(300, 6)
    expect(centre.z).toBeCloseTo(400, 6)
  })
})

describe('dropForCentre', () => {
  const target = cab('cmp_t')
  const dragged = cab('cmp_d')

  it('anchors when the dragged centre puts the cabinet against a face', () => {
    // The centre that corresponds to sitting exactly against the target's right face.
    const flush = { ...dragged, position: { x: W, y: 0, z: 0 } }
    const centre = gizmoCentreOf(flush, PRESET_MATERIALS)
    const r = dropForCentre(dragged, centre, [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.to).toBe('cmp_t')
    expect(r.anchor.face).toBe('right')
  })

  it('stays free far from every neighbour', () => {
    const far = { ...dragged, position: { x: 99999, y: 0, z: 0 } }
    const r = dropForCentre(dragged, gizmoCentreOf(far, PRESET_MATERIALS), [target], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
  })

  // Decision 2's payoff: z is the in-plane `v` axis for a left/right face, so a height within the
  // snap goes flush through the SAME rule rather than needing one of its own.
  it('snaps a near-flush height to flush', () => {
    const raised = { ...dragged, position: { x: W, y: 0, z: 3 } }
    const r = dropForCentre(dragged, gizmoCentreOf(raised, PRESET_MATERIALS), [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.offset.v).toBe(0)
  })

  it('keeps a deliberate height difference past the snap', () => {
    const high = { ...dragged, position: { x: W, y: 0, z: SNAP_MM + 40 } }
    const r = dropForCentre(dragged, gizmoCentreOf(high, PRESET_MATERIALS), [target], PRESET_MATERIALS)
    expect(r.kind).toBe('anchor')
    if (r.kind !== 'anchor') return
    expect(r.anchor.offset.v).toBeCloseTo(SNAP_MM + 40, 6)
  })

  it('never offers the dragged cabinet itself as a target', () => {
    const c = cab('cmp_d')
    const r = dropForCentre(c, gizmoCentreOf(c, PRESET_MATERIALS), [c], PRESET_MATERIALS)
    expect(r.kind).toBe('free')
  })
})
```

- [ ] **Step 2: Run it, watch it fail** — `pnpm vitest run src/scene/moveGizmo.test.ts`; unresolved import.

- [ ] **Step 3: Write the module**

```ts
// src/scene/moveGizmo.ts
import type { CarcaseComponent, MaterialDef, Vec3 } from './types'
import { localRotatedBoundsOf, worldBoundsOf } from './carcaseWorldBounds'
import { anchorForDrop, type Drop } from './dragAnchor'

// Where a move gizmo's handles belong: the centre of the cabinet's occupied box.
//
// NOT its `position`, which is the front-left-bottom corner — a cabinet's origin is a corner, so
// handles placed there hang off the box rather than on it. The same reason `turnedInPlace`
// preserves the centre: the centre is what a person sees as "the cabinet".
export function gizmoCentreOf(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
): Vec3 {
  const b = worldBoundsOf(c, materials)
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 }
}

// The inverse: the `position` that puts this cabinet's centre at `centre`. Reads the LOCAL rotated
// box — the untranslated one — because the translation is exactly what is being solved for.
export function positionForCentre(
  c: CarcaseComponent,
  materials: Record<string, MaterialDef>,
  centre: Vec3,
): Vec3 {
  const local = localRotatedBoundsOf(c, materials)
  return {
    x: centre.x - (local.x0 + local.x1) / 2,
    y: centre.y - (local.y0 + local.y1) / 2,
    z: centre.z - (local.z0 + local.z1) / 2,
  }
}

// What a gizmo drag means, in anchor terms. The gizmo reports a CENTRE; `anchorForDrop` wants an
// ORIGIN, so the conversion happens here and the snapping rule itself is not touched — the plan
// view and the gizmo resolve a drop through exactly the same arithmetic, which is what keeps a
// cabinet dragged in 3D landing where the same cabinet dragged in plan would.
export function dropForCentre(
  dragged: CarcaseComponent,
  centre: Vec3,
  candidates: CarcaseComponent[],
  materials: Record<string, MaterialDef>,
): Drop {
  return anchorForDrop(dragged, positionForCentre(dragged, materials, centre), candidates, materials)
}
```

- [ ] **Step 4: Run it, watch it pass** (11 tests).
- [ ] **Step 5: Commit** — `feat(scene): where a move gizmo sits, and what its drag means`

---

## Task 2: the viewport carries a gizmo

**Files:** modify `src/render/viewport.tsx`

This is the untestable half by design: happy-dom has no WebGL, and `viewport.tsx` has **no unit
test at all today** — `App.test.tsx` mocks the whole module (`vi.mock('./render/viewport')`). So
this task's correctness rests on the arithmetic already being proved in Task 1 and on the e2e
suite; keep the code here to wiring only, and put no arithmetic in it.

- [ ] **Step 1: Add the props**

In `ViewportProps` and the destructure:

```ts
  // The cabinet the gizmo attaches to, already resolved by App — the viewport renders PARTS and
  // has no notion of which component is a cabinet.
  gizmoTarget: { id: ComponentId; centre: Vec3 } | null
  onGizmoDrop: (id: ComponentId, centre: Vec3) => void
```

- [ ] **Step 2: Build the gizmo in the mount-once effect**

Import beside the existing OrbitControls import (`viewport.tsx:3`):

```ts
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
```

Inside the mount-once effect, after `controls` exists:

```ts
    // A proxy the gizmo attaches to. TransformControls needs an Object3D and the viewport has no
    // object for a COMPONENT — it renders parts. The proxy carries no geometry; only its position
    // is read.
    const proxy = new THREE.Object3D()
    proxy.visible = false
    scene.add(proxy)
    proxyRef.current = proxy

    // `mode` defaults to 'translate' and `space` to 'world' (verified in the installed
    // TransformControls.js at :167 and :206), so neither is set here — and X, Y and Z are all shown
    // by default, which is decision 2. Z is not a free axis: for a left/right/front/back face it is
    // `anchorForDrop`'s in-plane `v`, so a height within SNAP_MM goes flush through the same rule.
    const gizmo = new TransformControls(camera, renderer.domElement)
    gizmoRef.current = gizmo

    // THE conflict the spec names, and its whole fix. Orbit is suspended only while a handle is
    // actually held — the narrowest suspension there is, and it is why this stage does not need a
    // mode flag the way the click-based gestures do.
    const onDragging = (e: { value: boolean }) => {
      controls.enabled = !e.value
      draggingRef.current = e.value
    }
    gizmo.addEventListener('dragging-changed', onDragging)

    const onMouseUpGizmo = () => {
      const t = gizmoTargetRef.current
      const p = proxyRef.current
      if (t === null || p === null) return
      onGizmoDropRef.current(t.id, { x: p.position.x, y: p.position.y, z: p.position.z })
    }
    gizmo.addEventListener('mouseUp', onMouseUpGizmo)

    // r160+ ships the gizmo's own helper object; adding the controls directly is deprecated.
    scene.add(gizmo.getHelper())
```

Declare the refs beside the others (`viewport.tsx:83-103`):

```ts
  const gizmoRef = useRef<TransformControls | null>(null)
  const proxyRef = useRef<THREE.Object3D | null>(null)
  const draggingRef = useRef(false)
  const gizmoTargetRef = useRef(gizmoTarget)
  const onGizmoDropRef = useRef(onGizmoDrop)
```

In the effect's cleanup, beside `controls.dispose()` (`:429`):

```ts
      gizmo.removeEventListener('dragging-changed', onDragging)
      gizmo.removeEventListener('mouseUp', onMouseUpGizmo)
      scene.remove(gizmo.getHelper())
      gizmo.dispose()
```

- [ ] **Step 3: Attach and detach as the selection changes**

A separate effect, keeping the mount-once one mount-once:

```ts
  useEffect(() => {
    gizmoTargetRef.current = gizmoTarget
    onGizmoDropRef.current = onGizmoDrop
    const gizmo = gizmoRef.current
    const proxy = proxyRef.current
    if (gizmo === null || proxy === null) return
    if (gizmoTarget === null) {
      gizmo.detach()
      return
    }
    // Never move the proxy mid-drag: the scene re-renders on every committed drop, and yanking the
    // proxy back to the resolved centre while a handle is held fights the pointer.
    if (!draggingRef.current) {
      proxy.position.set(gizmoTarget.centre.x, gizmoTarget.centre.y, gizmoTarget.centre.z)
    }
    gizmo.attach(proxy)
  }, [gizmoTarget, onGizmoDrop])
```

- [ ] **Step 4: Keep a gizmo drag from deselecting**

`handleClick` (`:345`) already ignores anything that moved more than 4 px, so an ordinary drag
cannot deselect. A gizmo drag that ends within 4 px still would, so guard it:

```ts
    const handleClick = (e: MouseEvent) => {
      if (draggingRef.current) return
      if (!mouseDown.current) return
```

- [ ] **Step 5: `pnpm typecheck; tc=$?` and `pnpm lint; lt=$?`, both 0.** If the `TransformControls`
  types complain about the event payload, type the handler parameter rather than casting the
  control — no `any`, which `CLAUDE.md` forbids outright.
- [ ] **Step 6: Commit** — `feat(render): a move gizmo that yields the drag to orbit`

---

## Task 3: App resolves the drop

**Files:** modify `src/App.tsx`, `src/App.test.tsx`

- [ ] **Step 1: Write the failing test** — in `App.test.tsx`, in the describe that owns
  `viewportShowing` and the selection helpers

The viewport is mocked there, so assert on the **prop** rather than on any 3D behaviour; extend the
existing `viewportSpy` (`App.test.tsx:86`) with a `gizmoTarget` field and record it in the mock.

```tsx
  it('gives the gizmo the selected cabinet and nothing else', async () => {
    const select = await mount()
    await select({ kind: 'component', id: cabinet.id })
    expect(viewportSpy.gizmoTarget?.id).toBe(cabinet.id)
    await select(null)
    expect(viewportSpy.gizmoTarget).toBeNull()
  })
```

- [ ] **Step 2: Run, watch fail** (`gizmoTarget` is undefined).

- [ ] **Step 3: Wire `App`**

```tsx
import { dropForCentre, gizmoCentreOf } from './scene/moveGizmo'
```

Beside the other derived values:

```tsx
  // Only a cabinet gets a gizmo: an anchor lives on a carcase and nothing else has a placement to
  // edit. `selectedCarcase` is already the open-cabinet rule; reusing it keeps one answer to
  // "which cabinet is being worked on".
  const gizmoTarget = useMemo(
    () =>
      selectedCarcase === null
        ? null
        : { id: selectedCarcase.id, centre: gizmoCentreOf(selectedCarcase, scene.materials) },
    [selectedCarcase, scene.materials],
  )
```

Pass both props to `<Viewport …>`:

```tsx
          gizmoTarget={gizmoTarget}
          onGizmoDrop={(id, centre) => {
            const dragged = scene.components.find((c) => c.id === id)
            if (dragged === undefined || dragged.kind !== 'carcase') return
            const others = scene.components.filter(
              (c): c is CarcaseComponent => c.kind === 'carcase' && c.id !== id,
            )
            const drop = dropForCentre(dragged, centre, others, scene.materials)
            // Through onUpdateComponent like every other edit, so a gizmo drag lands in undo/redo
            // and the four-stage pipeline re-resolves anchored neighbours in the same commit —
            // exactly as the plan view's drop does.
            onUpdateComponent(id, (c) =>
              c.kind !== 'carcase'
                ? c
                : drop.kind === 'anchor'
                  ? { ...c, anchor: drop.anchor }
                  : { ...c, anchor: undefined, position: drop.position },
            )
          }}
```

Note the gizmo drop does **not** apply `drop.rotationZ`. Decision 9's rotation inheritance is a
*plan-view* default for a drag that crosses into a corner; a 3D gizmo drag that silently span the
cabinet under the pointer would be a surprise, and rotation is always the user's.

- [ ] **Step 4: Run `pnpm vitest run src/App.test.tsx`.**
- [ ] **Step 5: Commit** — `feat(ui): a gizmo drag lands as an anchor`

---

## Task 4: Mutation testing

`cp` the file first, restore from the copy, **never `git checkout`**; grep after applying and after
restoring; predict before running. A run reporting **`Tests  no tests`** is a broken mutation, not a
survivor — stage 3 recorded that one.

```bash
S="$(mktemp -d)"; cp src/scene/moveGizmo.ts "$S/"
```

| # | Mutation | Predicted |
|---|---|---|
| 1 | `gizmoCentreOf`: return `c.position` | *sits at the centre of the occupied box* |
| 2 | `gizmoCentreOf`: use `b.x0` in place of the x midpoint | *sits at the centre…*, *puts the centre where asked* |
| 3 | `positionForCentre`: use `worldBoundsOf` instead of `localRotatedBoundsOf` | *is the inverse of gizmoCentreOf* |
| 4 | `positionForCentre`: drop the z term (return `centre.z`) | *is the inverse…*, *puts the centre where asked* |
| 5 | `dropForCentre`: pass `centre` straight to `anchorForDrop` | *anchors when the dragged centre puts the cabinet against a face* |

- [ ] **Step 1: Run each, record predicted vs actual. A smaller-than-predicted count is a finding.**
- [ ] **Step 2: Restore and grep to confirm; `git diff --stat` should show only test files changed.**
- [ ] **Step 3: `pnpm typecheck; pnpm lint; pnpm test` — all exit 0.**

---

## Task 5: Docs

- [ ] **Step 1: `CLAUDE.md` source tree**, under `src/scene/`:

```
│   ├── moveGizmo.ts     gizmoCentreOf / positionForCentre / dropForCentre — where a move gizmo's
│   │                    handles sit and what its drag means. The centre↔origin conversion, stated
│   │                    once, so the gizmo and the plan view resolve a drop identically
```

- [ ] **Step 2: `CLAUDE.md` invariants**:

```
- **A gizmo drag yields the drag to orbit, and only while a handle is held.** `TransformControls`'s
  `dragging-changed` sets `controls.enabled`, which is the narrowest possible suspension and the
  reason the gizmo needs no mode flag. Every other gesture in this app is CLICK-based — snap, cut
  and the five joint tools are all discriminated from a drag by `handleClick`'s 4-pixel threshold —
  so `interactionActive` gates the cursor and face routing and has never had to touch orbit. The
  gizmo is the first drag gesture, and a drag that ends inside those 4 pixels would otherwise
  deselect the cabinet it just moved.
- **A gizmo sits on the box, not on the origin.** A cabinet's `position` is its front-left-bottom
  corner, so handles placed there hang off the cabinet rather than on it. `gizmoCentreOf` and
  `positionForCentre` are inverses about the **occupied** box, the same centre `turnedInPlace`
  preserves. `positionForCentre` reads `localRotatedBoundsOf`, never `worldBoundsOf` — the
  translation is the very thing being solved for, and using the translated box makes the round trip
  drift by the cabinet's own position.
- **A gizmo drop and a plan-view drop are the same rule.** `dropForCentre` converts centre → origin
  and hands off to `anchorForDrop`; it adds no snapping arithmetic of its own, which is what makes a
  cabinet dragged in 3D land where the same cabinet dragged in plan would. It does **not** apply the
  drop's suggested `rotationZ`: that is a plan-view default for a corner drag, and a 3D drag that
  silently span the cabinet under the pointer would be a surprise.
```

- [ ] **Step 3:** `node scripts/update-structure-html.mjs`, then add a feature row beside the
  placement ones in the same shape as its neighbours.

- [ ] **Step 4: Notes** — a dated stage-4 entry covering: the two decisions and that **Z went
  against the recommendation**, plus why it composed better than expected (z *is* the in-plane `v`);
  the deliberate deviation from the spec's `useMoveGizmo.ts` filename and the `CLAUDE.md` rule that
  drove it; that `viewport.tsx` has no unit test and is mocked wholesale in `App.test.tsx`, so this
  stage's evidence is Task 1's arithmetic plus e2e; the mutation table with every survivor; the
  measured delta against 2051; and what this plan got wrong.

- [ ] **Step 5: Commit** — `docs: the move gizmo, and the drag it yields`

---

## Task 6: Verify and push

- [ ] `pnpm typecheck; tc=$?` → 0
- [ ] `pnpm lint; lt=$?` → 0
- [ ] `pnpm test` → 0; record files/passed/skipped and the delta against 105 / 2051 / 10
- [ ] `git push -u origin claude/next-suggested-task-z8rzaq`

---

## Not in this stage

This completes the placement design. Still excluded by the design itself: a `'top'` anchor side,
walls as objects, filler strips, per-run operations beyond what a chain gives for free.

Two judgement figures remain unverified and both are one-line changes: `SNAP_MM = 60`, which the
gizmo now also reads, and `BLIND_CLEARANCE = 0`. The gizmo makes `SNAP_MM` more visible than the
plan view did — it is worth feeling in the running app before either figure is called settled.
