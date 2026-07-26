# Interaction-Mode Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the six mutually-exclusive viewport interaction modes (snap, cut, dado, half-lap, mortise-tenon, finger) from parallel booleans with N² cross-cancellation into one `useInteractionMode` coordinator hook that owns a single `activeMode` and a normalized prop bundle — a behavior-preserving refactor.

**Architecture:** A new `src/scene/useInteractionMode.ts` composes the six existing gesture hooks unchanged, derives one `activeMode`, exposes a toggle-aware exclusive `setMode`, and a normalized `{ onFaceClick, onFaceHover, sourceFace, hoveredFace, interactionActive, snapPhase }` bundle plus pass-throughs. `App.tsx` consumes it (six destructures + six handlers collapse); `Viewport`'s ~29 mode props shrink to ~6; `Sidebar` is fed from the coordinator, unchanged.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + @testing-library/react, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-25-interaction-mode-refactor-design.md`

**Commit conventions (every commit):** sign with `-S`; author `Claude <noreply@anthropic.com>` (already configured); end the body with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LZYYj3iGa4yi5RjEfizDJC
```
No model identifier anywhere in commits/code. Branch `claude/next-step-suggestion-i0qjjd`. Run `pnpm typecheck && pnpm lint && pnpm test` before each commit. Local signature verification printing "No signature" / `%G?`=N is a known sandbox false-negative — fine if `git commit -S` exits 0. New commit per task (no `--amend` unless a review asks).

**Overriding success criterion (this is a refactor):** the entire existing test suite must stay green **before and after** with **no changes to existing tests**. Any existing test that needs modifying signals an unintended behavior change — STOP and reconcile. The only new tests are for `useInteractionMode`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/scene/useInteractionMode.ts` | mode coordinator | **Create** — compose 6 hooks, `activeMode`, `setMode`, normalized bundle |
| `src/scene/useInteractionMode.test.ts` | coordinator tests | **Create** |
| `src/App.tsx` | composition | Replace 6 hook destructures + 6 `handleActivate*` with `useInteractionMode`; keyboard/guards/Viewport-props/Sidebar-props rewired |
| `src/render/viewport.tsx` | 3D viewport | Prop interface ~29 mode props → ~6; refs, click/hover routing, highlight, cursor collapsed |

**Unchanged:** the six gesture hooks (`useSnap`, `useAddCut`, `useAddJoint`, `useAddHalfLap`, `useAddMortiseTenon`, `useAddFingerJoint`) and their tests; `src/ui/sidebar.tsx` and `sidebar.test.tsx` (Sidebar keeps its prop shape, fed from the coordinator); all geometry/scene/OCCT.

**The six gesture hooks' return shapes** (verified — used by the coordinator):
- `useSnap` → `{ snapActive, snapPhase, sourceFace, hoveredFace, activateSnap, cancelSnap, onFaceClick, onFaceHover }`
- `useAddCut` → `{ cutActive, lastPlacedCutId, activateCut, cancelCut, onFaceClick, onFaceHover, dowelTool, armDowelTool }`
- `useAddJoint` → `{ jointActive, pendingHousing, statusMessage, hoveredFace, activateJoint, cancelJoint, onFaceClick, onFaceHover }`
- `useAddHalfLap` → `{ halfLapActive, pendingA, statusMessage, hoveredFace, activateHalfLap, cancelHalfLap, onFaceClick, onFaceHover }`
- `useAddMortiseTenon` → `{ mortiseTenonActive, pendingMortise, statusMessage, hoveredFace, activateMortiseTenon, cancelMortiseTenon, onFaceClick, onFaceHover }`
- `useAddFingerJoint` → `{ fingerJointActive, pendingA, statusMessage, hoveredFace, activateFingerJoint, cancelFingerJoint, onFaceClick, onFaceHover }`

---

## Task 1: `useInteractionMode` coordinator + tests (additive)

Nothing consumes the hook yet — it's added and fully unit-tested in isolation, de-risking the Task 2 flip.

**Files:**
- Create: `src/scene/useInteractionMode.ts`, `src/scene/useInteractionMode.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/useInteractionMode.test.ts`:
```ts
import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useInteractionMode } from './useInteractionMode'

const boardA: Part = {
  kind: 'board', id: 'A', label: 'A', length: 200, width: 100, thickness: 25,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const boardB: Part = { ...boardA, id: 'B', rotation: { x: 0, y: 90, z: 0 } }
const hit = (partId: string, n: { x: number; y: number; z: number }): FaceHit => ({
  partId, faceNormal: n, faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: n, localHitPoint: { x: 0, y: 0, z: 0 }, hitPoint: { x: 0, y: 0, z: 0 },
})

const setup = (parts: Part[] = [boardA, boardB]) => {
  const onAddJoint = vi.fn()
  const r = renderHook(() =>
    useInteractionMode({
      parts,
      onUpdate: vi.fn(),
      onSelect: vi.fn(),
      onRotationSnap: vi.fn(),
      onAddJoint,
      onAddHalfLap: vi.fn(),
      onAddMortiseTenon: vi.fn(),
      onAddFingerJoint: vi.fn(),
    }),
  )
  return { ...r, onAddJoint }
}

test('initial mode is none and inactive', () => {
  const { result } = setup()
  expect(result.current.activeMode).toBe('none')
  expect(result.current.interactionActive).toBe(false)
})

test('setMode activates one mode exclusively', () => {
  const { result } = setup()
  act(() => result.current.setMode('snap'))
  expect(result.current.activeMode).toBe('snap')
  expect(result.current.interactionActive).toBe(true)
  act(() => result.current.setMode('cut'))
  expect(result.current.activeMode).toBe('cut') // snap cancelled
})

test('setMode(X) while X active toggles off to none', () => {
  const { result } = setup()
  act(() => result.current.setMode('finger'))
  expect(result.current.activeMode).toBe('finger')
  act(() => result.current.setMode('finger'))
  expect(result.current.activeMode).toBe('none')
})

test("setMode('none') cancels the active mode", () => {
  const { result } = setup()
  act(() => result.current.setMode('mortiseTenon'))
  act(() => result.current.setMode('none'))
  expect(result.current.activeMode).toBe('none')
})

test('onFaceClick routes to the active mode; a two-click dado creates a joint', () => {
  const { result, onAddJoint } = setup()
  act(() => result.current.setMode('dado'))
  act(() => result.current.onFaceClick(hit('A', { x: 0, y: 0, z: 1 }))) // housing +Z
  expect(onAddJoint).not.toHaveBeenCalled()
  expect(result.current.sourceFace).not.toBeNull() // pendingHousing tracked via sourceFace
  act(() => result.current.onFaceClick(hit('B', { x: 1, y: 0, z: 0 }))) // housed +X end (⊥)
  expect(onAddJoint).toHaveBeenCalledTimes(1)
})

test('sourceFace maps to the active mode (snap, second mapping)', () => {
  const { result } = setup()
  act(() => result.current.setMode('snap'))
  act(() => result.current.onFaceClick(hit('A', { x: 0, y: 0, z: 1 })))
  expect(result.current.sourceFace).not.toBeNull() // snap.sourceFace after the first pick
})

test('click is a no-op when no mode is active', () => {
  const { result, onAddJoint } = setup()
  act(() => result.current.onFaceClick(hit('A', { x: 0, y: 0, z: 1 })))
  expect(onAddJoint).not.toHaveBeenCalled()
  expect(result.current.sourceFace).toBeNull()
})
```
Run `pnpm vitest run src/scene/useInteractionMode.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `src/scene/useInteractionMode.ts`**

```ts
import { useCallback } from 'react'
import type { FaceHit, Part, PartId, CutId } from './types'
import { useSnap } from './useSnap'
import { useAddCut } from './useAddCut'
import type { DowelCutTool } from './useAddCut'
import { useAddJoint } from './useAddJoint'
import { useAddHalfLap } from './useAddHalfLap'
import { useAddMortiseTenon } from './useAddMortiseTenon'
import { useAddFingerJoint } from './useAddFingerJoint'

export type InteractionMode =
  | 'none' | 'snap' | 'cut' | 'dado' | 'halflap' | 'mortiseTenon' | 'finger'

export interface UseInteractionModeParams {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  onSelect: (id: PartId | null) => void
  onRotationSnap: (id: PartId) => void
  onAddJoint: (housingHit: FaceHit, housedHit: FaceHit) => void
  onAddHalfLap: (aId: PartId, bId: PartId) => void
  onAddMortiseTenon: (mortiseHit: FaceHit, tenonHit: FaceHit) => void
  onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void
}

export interface UseInteractionModeResult {
  activeMode: InteractionMode
  setMode: (mode: InteractionMode) => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  interactionActive: boolean
  snapPhase: 'idle' | 'source-picked'
  statuses: { dado: string | null; halflap: string | null; mortiseTenon: string | null; finger: string | null }
  lastPlacedCutId: CutId | null
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
}

export function useInteractionMode(params: UseInteractionModeParams): UseInteractionModeResult {
  const { parts, onUpdate, onSelect, onRotationSnap } = params
  const snap = useSnap({ parts, onUpdate, onRotationSnap })
  const cut = useAddCut({ parts, onUpdate, onSelect })
  const joint = useAddJoint({ parts, onAddJoint: params.onAddJoint })
  const halfLap = useAddHalfLap({ parts, onAddHalfLap: params.onAddHalfLap })
  const mortiseTenon = useAddMortiseTenon({ parts, onAddMortiseTenon: params.onAddMortiseTenon })
  const finger = useAddFingerJoint({ parts, onAddFingerJoint: params.onAddFingerJoint })

  const activeMode: InteractionMode = snap.snapActive
    ? 'snap'
    : cut.cutActive
      ? 'cut'
      : joint.jointActive
        ? 'dado'
        : halfLap.halfLapActive
          ? 'halflap'
          : mortiseTenon.mortiseTenonActive
            ? 'mortiseTenon'
            : finger.fingerJointActive
              ? 'finger'
              : 'none'

  const { cancelSnap, activateSnap } = snap
  const { cancelCut, activateCut } = cut
  const { cancelJoint, activateJoint } = joint
  const { cancelHalfLap, activateHalfLap } = halfLap
  const { cancelMortiseTenon, activateMortiseTenon } = mortiseTenon
  const { cancelFingerJoint, activateFingerJoint } = finger

  const setMode = useCallback(
    (mode: InteractionMode) => {
      // Cancel every mode except the target, then toggle the target (no target for 'none').
      // Behaviour-exact vs the old handleActivate<X> (cancel the other five, then toggle X).
      if (mode !== 'snap') cancelSnap()
      if (mode !== 'cut') cancelCut()
      if (mode !== 'dado') cancelJoint()
      if (mode !== 'halflap') cancelHalfLap()
      if (mode !== 'mortiseTenon') cancelMortiseTenon()
      if (mode !== 'finger') cancelFingerJoint()
      if (mode === 'snap') activateSnap()
      else if (mode === 'cut') activateCut()
      else if (mode === 'dado') activateJoint()
      else if (mode === 'halflap') activateHalfLap()
      else if (mode === 'mortiseTenon') activateMortiseTenon()
      else if (mode === 'finger') activateFingerJoint()
    },
    [
      cancelSnap, cancelCut, cancelJoint, cancelHalfLap, cancelMortiseTenon, cancelFingerJoint,
      activateSnap, activateCut, activateJoint, activateHalfLap, activateMortiseTenon, activateFingerJoint,
    ],
  )

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      switch (activeMode) {
        case 'snap': snap.onFaceClick(hit); break
        case 'cut': cut.onFaceClick(hit); break
        case 'dado': joint.onFaceClick(hit); break
        case 'halflap': halfLap.onFaceClick(hit); break
        case 'mortiseTenon': mortiseTenon.onFaceClick(hit); break
        case 'finger': finger.onFaceClick(hit); break
      }
    },
    [activeMode, snap.onFaceClick, cut.onFaceClick, joint.onFaceClick, halfLap.onFaceClick, mortiseTenon.onFaceClick, finger.onFaceClick],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      switch (activeMode) {
        case 'snap': snap.onFaceHover(hit); break
        case 'cut': cut.onFaceHover(hit); break
        case 'dado': joint.onFaceHover(hit); break
        case 'halflap': halfLap.onFaceHover(hit); break
        case 'mortiseTenon': mortiseTenon.onFaceHover(hit); break
        case 'finger': finger.onFaceHover(hit); break
      }
    },
    [activeMode, snap.onFaceHover, cut.onFaceHover, joint.onFaceHover, halfLap.onFaceHover, mortiseTenon.onFaceHover, finger.onFaceHover],
  )

  const sourceFace: FaceHit | null =
    activeMode === 'snap' ? snap.sourceFace
      : activeMode === 'dado' ? joint.pendingHousing
        : activeMode === 'halflap' ? halfLap.pendingA
          : activeMode === 'mortiseTenon' ? mortiseTenon.pendingMortise
            : activeMode === 'finger' ? finger.pendingA
              : null

  const hoveredFace: FaceHit | null =
    activeMode === 'snap' ? snap.hoveredFace
      : activeMode === 'dado' ? joint.hoveredFace
        : activeMode === 'halflap' ? halfLap.hoveredFace
          : activeMode === 'mortiseTenon' ? mortiseTenon.hoveredFace
            : activeMode === 'finger' ? finger.hoveredFace
              : null

  return {
    activeMode,
    setMode,
    onFaceClick,
    onFaceHover,
    sourceFace,
    hoveredFace,
    interactionActive: activeMode !== 'none',
    snapPhase: snap.snapPhase,
    statuses: {
      dado: joint.statusMessage,
      halflap: halfLap.statusMessage,
      mortiseTenon: mortiseTenon.statusMessage,
      finger: finger.statusMessage,
    },
    lastPlacedCutId: cut.lastPlacedCutId,
    dowelTool: cut.dowelTool,
    armDowelTool: cut.armDowelTool,
  }
}
```
IMPORTANT: verify each hook's actual param object and return-field names against the six files while implementing (they're listed in "File Structure" above). If any field name differs (e.g. a hook returns `pending` not `pendingA`), match the real name — typecheck will flag mismatches. Do NOT modify any gesture hook.

Run `pnpm vitest run src/scene/useInteractionMode.test.ts` → PASS (all 7).

- [ ] **Step 3: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS (coordinator tested; nothing else uses it yet).
```bash
git add src/scene/useInteractionMode.ts src/scene/useInteractionMode.test.ts
git commit -S -m "feat(scene): useInteractionMode coordinator hook

<trailers per Commit conventions>"
```

---

## Task 2: Adopt the coordinator in App + normalize Viewport (the flip)

One atomic, behavior-preserving rewire: App consumes `useInteractionMode`; Viewport's prop interface and internals collapse to the normalized bundle; Sidebar is fed from the coordinator. **This is an integration task — no new tests.** The gate is: `pnpm typecheck && pnpm lint && pnpm test` all green with **zero changes to existing test files** (a broken existing test = a real behavior change; stop and fix the code, not the test). Read the whole current mode wiring in both files before editing.

**Files:**
- Modify: `src/App.tsx`, `src/render/viewport.tsx`

### `src/render/viewport.tsx` — normalize

- [ ] **Step 1: Replace the mode prop interface**

In the `ViewportProps` interface, **remove** all per-mode mode props: `snapActive`, `cutActive`, `jointActive`, `halfLapActive`, `mortiseTenonActive`, `fingerJointActive`; the six `onFaceClick<Mode>` and `onFaceHover<Mode>` (i.e. `onFaceClick`/`onFaceHover` for snap plus `onFaceClickCut`/`onFaceHoverCut`/`onFaceClickJoint`/`onFaceHoverJoint`/`onFaceClickHalfLap`/`onFaceHoverHalfLap`/`onFaceClickMortiseTenon`/`onFaceHoverMortiseTenon`/`onFaceClickFingerJoint`/`onFaceHoverFingerJoint`); the pending/hovered faces `sourceFace`, `hoveredFace`, `jointHoveredFace`, `halfLapPendingFace`, `halfLapHoveredFace`, `mortiseTenonPendingFace`, `mortiseTenonHoveredFace`, `fingerJointPendingFace`, `fingerJointHoveredFace`. Keep `snapPhase`. **Add** the normalized set:
```ts
  interactionActive: boolean
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  snapPhase: 'idle' | 'source-picked'
```
(Net: `interactionActive`, `onFaceClick`, `onFaceHover`, `sourceFace`, `hoveredFace`, `snapPhase`.) Update the component's destructured props list to match.

- [ ] **Step 2: Collapse the refs**

Remove the per-mode refs: `snapActiveRef`, `cutActiveRef`, `jointActiveRef`, `halfLapActiveRef`, `mortiseTenonActiveRef`, `fingerJointActiveRef`, and all six `onFaceClick<Mode>Ref` / `onFaceHover<Mode>Ref`. Add:
```ts
  const interactionActiveRef = useRef(interactionActive)
  const onFaceClickRef = useRef(onFaceClick)
  const onFaceHoverRef = useRef(onFaceHover)
```
Keep `snapPhaseRef` (still used by snap). In the ref-sync effect (the parameterless `useLayoutEffect`/effect that assigns `xRef.current = x` each render), remove the deleted refs' assignments and add `interactionActiveRef.current = interactionActive; onFaceClickRef.current = onFaceClick; onFaceHoverRef.current = onFaceHover`. (`sourceFace`/`hoveredFace` are read as effect deps below, not via refs.)

- [ ] **Step 3: Collapse the click dispatch**

In the mousedown handler, replace the entire ordered `if (fingerJointActiveRef.current) {…} else if (mortiseTenonActiveRef.current) {…} else if (halfLapActiveRef.current) {…} else if (jointActiveRef.current) {…} else if (cutActiveRef.current) {…} else if (snapActiveRef.current) {…} else { /* normal selection */ }` chain with:
```ts
      if (interactionActiveRef.current) {
        if (hits.length > 0) {
          const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current)
          if (faceHit) onFaceClickRef.current(faceHit)
        }
        // in-mode: a miss is ignored (no deselect), matching every old mode-branch
      } else {
        // UNCHANGED normal-mode selection — keep exactly as-is:
        if (hits.length > 0) {
          const hit = hits[0].object as THREE.Mesh
          for (const [id, m] of meshes.current) {
            if (m === hit) {
              onClickRef.current(id)
              return
            }
          }
        }
        onClickRef.current(null)
      }
```
(The `else` block is the current normal-selection branch verbatim — copy it from the existing code; do not alter it.)

- [ ] **Step 4: Collapse the hover guard + dispatch**

In the mousemove RAF callback, replace the six-boolean early-return guard with:
```ts
        if (!interactionActiveRef.current) return
```
and replace both six-way hover dispatch chains (the `hits.length > 0` branch and the `else` null branch) with a single call each:
```ts
        if (hits.length > 0) {
          const hit = buildFaceHit(hits[0], meshes.current, partsRef.current)
          onFaceHoverRef.current(hit)
        } else {
          onFaceHoverRef.current(null)
        }
```

- [ ] **Step 5: Collapse the highlight + cursor effects**

Read the current highlight effect (the one that computes the source-face and hover-face highlight meshes via the six-way ternary chains like `mortiseTenonActive ? mortiseTenonPendingFace : … : snapActive ? sourceFace : null`). Replace the source-highlight source with the prop `sourceFace` and the hover-highlight source with the prop `hoveredFace` directly (they already carry the active mode's value). Reduce the effect's deps to `[sourceFace, hoveredFace, snapPhase, /* whatever non-mode deps it already had, e.g. geometries/meshes */]`, dropping every removed per-mode dep. Preserve any `snapPhase`-dependent styling exactly (see the spec's snapPhase note). In the cursor effect, replace the `snapActive || cutActive || … || fingerJointActive` condition (and its deps) with `interactionActive`.

- [ ] **Step 6: Verify Viewport compiles in isolation of App**

Run `pnpm typecheck` → it will FAIL only at the `<Viewport …>` call site in `App.tsx` (props changed) — expected; fixed in Step 7. No other Viewport-internal type errors should remain. (If Viewport itself has internal type errors, fix them before proceeding.)

### `src/App.tsx` — adopt the coordinator

- [ ] **Step 7: Replace the six hook destructures + six handlers**

Remove the imports of `useSnap`, `useAddCut`, `useAddJoint`, `useAddHalfLap`, `useAddMortiseTenon`, `useAddFingerJoint` and add `import { useInteractionMode } from './scene/useInteractionMode'`. Remove the six `const { … } = useSnap(...)` … `= useAddFingerJoint(...)` destructure blocks and the six `handleActivateCut/Snap/Joint/HalfLap/MortiseTenon/FingerJoint` `useCallback`s. In their place (keeping `handleRotationSnap` above it), add:
```ts
  const mode = useInteractionMode({
    parts: scene.parts,
    onUpdate,
    onSelect,
    onRotationSnap: handleRotationSnap,
    onAddJoint,
    onAddHalfLap,
    onAddMortiseTenon,
    onAddFingerJoint,
  })
```
(`onUpdate`, `onSelect`, `onAddJoint`, `onAddHalfLap`, `onAddMortiseTenon`, `onAddFingerJoint` are already destructured from `useScene()`.)

- [ ] **Step 8: Rewire the keyboard effect**

In the non-modifier keydown block, change each activation case to call `mode.setMode(...)`:
- `c` → `mode.setMode('cut')`; `f` → `mode.setMode('snap')`; `j` → `mode.setMode('dado')`; `l` → `mode.setMode('halflap')`; `m` → `mode.setMode('mortiseTenon')`; `b` → `mode.setMode('finger')` (keep each case's `e.preventDefault()` + `return`).
- Escape handler → `mode.setMode('none')`. **First confirm** the current Escape handler does nothing beyond cancelling modes; if it has other behavior (e.g. clearing selection), keep that alongside `mode.setMode('none')`.
- The `h` guard and the `Delete`/`Backspace` guard: replace their `!snapActive && !cutActive && … && !fingerJointActive` conditions with `!mode.interactionActive`.
- Update the effect's dependency array: remove the deleted `handleActivate*`/`*Active`/`cancel*` names and add `mode.setMode` and `mode.interactionActive` (NOT `mode` — the object is a fresh literal each render). Keep any non-mode deps already present.

- [ ] **Step 9: Rewire the `<Viewport>` props**

Replace the ~29 removed mode props on `<Viewport …>` with the six normalized ones:
```tsx
        interactionActive={mode.interactionActive}
        onFaceClick={mode.onFaceClick}
        onFaceHover={mode.onFaceHover}
        sourceFace={mode.sourceFace}
        hoveredFace={mode.hoveredFace}
        snapPhase={mode.snapPhase}
```
(Leave all non-mode Viewport props — parts, geometries, selection, camera, etc. — untouched.)

- [ ] **Step 10: Rewire the `<Sidebar>` props (unchanged Sidebar interface, fed from `mode`)**

Keep every existing `<Sidebar …>` mode prop name, sourcing each from `mode`:
```tsx
        snapActive={mode.activeMode === 'snap'}
        snapPhase={mode.snapPhase}
        onSnapToggle={() => mode.setMode('snap')}
        cutActive={mode.activeMode === 'cut'}
        onCutToggle={() => mode.setMode('cut')}
        dowelTool={mode.dowelTool}
        armDowelTool={mode.armDowelTool}
        jointActive={mode.activeMode === 'dado'}
        onJointToggle={() => mode.setMode('dado')}
        jointStatus={mode.statuses.dado}
        halfLapActive={mode.activeMode === 'halflap'}
        onHalfLapToggle={() => mode.setMode('halflap')}
        halfLapStatus={mode.statuses.halflap}
        mortiseTenonActive={mode.activeMode === 'mortiseTenon'}
        onMortiseTenonToggle={() => mode.setMode('mortiseTenon')}
        mortiseTenonStatus={mode.statuses.mortiseTenon}
        fingerJointActive={mode.activeMode === 'finger'}
        onFingerJointToggle={() => mode.setMode('finger')}
        fingerJointStatus={mode.statuses.finger}
```
(Match the exact prop names the current `<Sidebar>` call uses — read them first. If App references `lastPlacedCutId` anywhere else, e.g. a flash effect, source it from `mode.lastPlacedCutId`.)

- [ ] **Step 11: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS with **no existing test modified**. If any existing test fails, a behavior changed — diagnose and fix the code (not the test). Then:
```bash
git add src/App.tsx src/render/viewport.tsx
git commit -S -m "refactor(ui): route interaction modes through useInteractionMode

<trailers per Commit conventions>"
```

---

## Task 3: Documentation & final verification

**Files:**
- Create: `docs/superpowers/notes/2026-07-25-interaction-mode-refactor-notes.md`
- Modify: `CLAUDE.md` (architecture section, one line), `project-structure.html`

- [ ] **Step 1: Write the implementation notes**

Create `docs/superpowers/notes/2026-07-25-interaction-mode-refactor-notes.md`:
```markdown
# Interaction-Mode Refactor — Implementation Notes

**Date:** 2026-07-25

- Behavior-preserving refactor: the six exclusive viewport modes (snap, cut, dado, half-lap,
  mortise-tenon, finger) now route through one `useInteractionMode` coordinator hook instead of six
  parallel booleans with N² cross-cancellation.
- `useInteractionMode` composes the six gesture hooks unchanged, derives one `activeMode`, and
  exposes a toggle-aware exclusive `setMode` (cancel the others, toggle the target — behaviour-exact
  vs the old `handleActivate<X>`), plus a normalized `{ onFaceClick, onFaceHover, sourceFace,
  hoveredFace, interactionActive, snapPhase }` bundle and pass-throughs (`statuses`,
  `lastPlacedCutId`, `dowelTool`, `armDowelTool`).
- `Viewport` went from ~29 per-mode props to 6; its click routing keeps the normal-mode `else`
  selection branch (deselect-on-miss) — only the six mode-branches collapsed. `snapPhase` is kept
  distinct (Viewport + Sidebar both read it), not derived away from `sourceFace`.
- `Sidebar` keeps its prop shape, fed from the coordinator (`snapActive={activeMode==='snap'}`, …) —
  its tests were untouched.
- Adding a 7th mode is now: new gesture hook + one registry entry in `useInteractionMode` + a
  keyboard case + Sidebar props/button. **Viewport needs zero changes.**
- Success criterion was the entire existing suite green with no existing-test changes; the only new
  tests are `useInteractionMode.test.ts`.
```

- [ ] **Step 2: Update `CLAUDE.md`** — in the `src/scene/` architecture list, add a line for
  `useInteractionMode.ts` next to the `useAdd*`/`useSnap` entries (e.g. "`useInteractionMode.ts`
  Coordinator composing the six gesture hooks into one `activeMode` + normalized viewport bundle").
  Match the surrounding bullet style; one line, no restructuring.

- [ ] **Step 3: Update `project-structure.html`** — add a `useInteractionMode.ts` row in the
  hand-written `src/scene/` table (next to `useAddFingerJoint.ts`), matching the existing row markup.
  Leave the `<!-- AUTOGEN:src-tree -->` region untouched.

- [ ] **Step 4: Full verification suite + build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS — typecheck clean, lint clean, all tests green (the full pre-refactor count plus the 7 new coordinator tests; no existing test removed/changed), `tsc + vite build` succeeds (the pre-existing >500 kB chunk advisory + opencascade Node-shim externalization warnings are expected). Paste the final test summary + build result.

- [ ] **Step 5: Commit + push**

```bash
git add docs/superpowers/notes/2026-07-25-interaction-mode-refactor-notes.md CLAUDE.md project-structure.html
git commit -S -m "docs: interaction-mode refactor notes + structure updates

<trailers per Commit conventions>"
git push -u origin claude/next-step-suggestion-i0qjjd
```
(Retry push up to 4× with exponential backoff on network error. No PR.)

---

## Verification checklist (whole refactor)

- [ ] `useInteractionMode`: exclusive `setMode`, toggle-off to `'none'`, `setMode('none')`, click routing (dado two-click creates), `sourceFace` mapping for ≥2 modes, no-op when `'none'`.
- [ ] `Viewport`: ~29 mode props → 6; click keeps the normal `else` selection branch (deselect-on-miss) while mode-branches never deselect; hover guard/dispatch single-path; highlight uses `sourceFace`/`hoveredFace`; cursor keyed on `interactionActive`; `snapPhase` preserved.
- [ ] `App`: six hook destructures + six `handleActivate*` gone; keyboard cases call `mode.setMode`; Escape/`h`/Delete use `mode.interactionActive` (+ any non-mode Escape behavior preserved); keydown deps on `mode.setMode`/`mode.interactionActive`.
- [ ] `Sidebar` + `sidebar.test.tsx` unchanged; fed from `mode`.
- [ ] The six gesture hooks and their tests unchanged.
- [ ] `pnpm typecheck && lint && test && build` all green, **no existing test modified**.
```
