# Interaction-Mode Refactor — Design Spec

**Date:** 2026-07-25
**Status:** approved (brainstorm) → ready for implementation plan

## Overview

Collapse the six mutually-exclusive viewport interaction modes (snap, cut, dado, half-lap,
mortise-tenon, finger) from a set of parallel booleans with N² cross-cancellation into a single
coordinator hook, `useInteractionMode`, that owns one `activeMode` and exposes a normalized bundle
of props. **Purely a structural refactor — no user-facing behavior changes.** Every existing test
must stay green before and after; the six gesture hooks and their tests are untouched.

**Why.** Each mode currently self-owns an `active` boolean; `App.tsx` enforces exclusivity via six
`handleActivate*` handlers that each cancel the other five (30 cancel-calls today, growing by 2N+1
per mode), and `Viewport` carries ~29 per-mode props (per mode: `<mode>Active`,
`onFaceClick<Mode>`, `onFaceHover<Mode>`, and pending/hover faces) mirrored into ~18 refs, ordered
routing branches, a six-way highlight ternary, and the cursor condition. Adding the JP6 finger mode
took ~84 lines of Viewport churn alone. After this refactor, adding a 7th mode requires **zero
Viewport changes** and a single registry entry in the coordinator.

## Goals

- A new `useInteractionMode` hook composing the six existing gesture hooks unchanged, owning a
  single derived `activeMode` and a toggle-aware, exclusive `setMode`.
- `Viewport` reduced to a mode-agnostic prop interface (~29 mode props → ~6).
- `App.tsx` reduced to consuming the coordinator (the six destructures + six handlers collapse).
- Identical runtime behavior (verified by the full existing suite staying green + a new coordinator
  unit test).

## Non-Goals

- No change to the six gesture hooks (`useSnap`, `useAddCut`, `useAddJoint`, `useAddHalfLap`,
  `useAddMortiseTenon`, `useAddFingerJoint`) or their tests. They keep self-owning their `active`
  state; the coordinator composes and coordinates them.
- No change to `Sidebar`'s prop interface or `sidebar.test.tsx`. `App` feeds Sidebar's existing
  per-mode props from the coordinator. (Collapsing Sidebar's props was considered and deferred —
  lower payoff, and it would churn the valuable joints-panel tests' `props()` factory.)
- No new interaction mode, no keyboard-shortcut changes, no visual change.
- No change to geometry, OCCT, export, or file format.

## Architecture

### `useInteractionMode` (`src/scene/useInteractionMode.ts`)

Composes the six gesture hooks (passing through the same `parts` + scene callbacks App passes them
today) and returns a single API. It adds **no new state of its own** — `activeMode` is derived from
the hooks' existing booleans, and `setMode` drives the hooks' existing `activate`/`cancel`.

```ts
export type InteractionMode =
  | 'none' | 'snap' | 'cut' | 'dado' | 'halflap' | 'mortiseTenon' | 'finger'

export interface UseInteractionModeResult {
  activeMode: InteractionMode
  setMode: (mode: InteractionMode) => void

  // Normalized Viewport bundle (the active mode's values; inert when 'none'):
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  interactionActive: boolean // activeMode !== 'none'
  snapPhase: 'idle' | 'source-picked' // snap needs it distinctly (Viewport + Sidebar)

  // Pass-throughs App/Sidebar still need:
  statuses: { dado: string | null; halflap: string | null; mortiseTenon: string | null; finger: string | null }
  lastPlacedCutId: CutId | null
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
}
```

**`activeMode` derivation** — a plain expression over the composed booleans (exactly one is true at
a time, enforced by `setMode`):
```ts
const activeMode: InteractionMode =
  snap.snapActive ? 'snap'
  : cut.cutActive ? 'cut'
  : joint.jointActive ? 'dado'
  : halfLap.halfLapActive ? 'halflap'
  : mortiseTenon.mortiseTenonActive ? 'mortiseTenon'
  : fingerJoint.fingerJointActive ? 'finger'
  : 'none'
```

**`setMode(mode)`** — toggle-aware and exclusive, preserving today's exact behavior (each hook's
`activate` toggles; today's `handleActivate<X>` cancels the other five then toggles X). Implemented
over a stable registry of the hooks' `activate`/`cancel` functions:
```ts
// cancel every mode except the target, then toggle the target (no-op target for 'none')
const setMode = useCallback((mode: InteractionMode) => {
  if (mode !== 'snap') snap.cancelSnap()
  if (mode !== 'cut') cut.cancelCut()
  if (mode !== 'dado') joint.cancelJoint()
  if (mode !== 'halflap') halfLap.cancelHalfLap()
  if (mode !== 'mortiseTenon') mortiseTenon.cancelMortiseTenon()
  if (mode !== 'finger') fingerJoint.cancelFingerJoint()
  if (mode === 'snap') snap.activateSnap()
  else if (mode === 'cut') cut.activateCut()
  else if (mode === 'dado') joint.activateJoint()
  else if (mode === 'halflap') halfLap.activateHalfLap()
  else if (mode === 'mortiseTenon') mortiseTenon.activateMortiseTenon()
  else if (mode === 'finger') fingerJoint.activateFingerJoint()
}, [/* the stable activate/cancel fns */])
```
This is behavior-exact:
- `setMode('finger')` when idle → cancels others (already off) + toggles finger on. Same as `handleActivateFingerJoint`.
- `setMode('finger')` when finger active → cancels others (off) + toggles finger **off** → `activeMode` becomes `'none'` (today's click-again-to-deactivate).
- `setMode('finger')` when snap active → cancels snap (+ others) + toggles finger on. Same switch behavior.
- `setMode('none')` → cancels all (Escape's behavior).

**Normalized bundle** — routed by `activeMode`:
- `onFaceClick` / `onFaceHover` dispatch to the active mode's handler (each hook exposes both); a
  no-op when `'none'`.
- `sourceFace` = the active mode's pending/source face: snap `sourceFace`, dado `pendingHousing`,
  halflap `pendingA`, mortiseTenon `pendingMortise`, finger `pendingA`; `null` for cut and `none`.
- `hoveredFace` = the active mode's highlight-hover face: snap `hoveredFace`, dado/halflap/mt/finger
  their `hoveredFace`; `null` for cut (cut exposes no highlight-hover face today) and `none`.
- `interactionActive` = `activeMode !== 'none'`.
- `snapPhase` = `snap.snapPhase` (passed through unchanged — see the snapPhase note below).

The dispatchers are `useCallback`s keyed on `activeMode` + the (stable) sub-handlers, so they change
only when the mode changes; `Viewport` syncs them into refs exactly as it does today.

### `Viewport` (`src/render/viewport.tsx`)

Prop interface reduced to the mode-agnostic bundle:

```ts
interactionActive: boolean
onFaceClick: (hit: FaceHit) => void
onFaceHover: (hit: FaceHit | null) => void
sourceFace: FaceHit | null
hoveredFace: FaceHit | null
snapPhase: 'idle' | 'source-picked'
```

Removed: `snapActive`, `cutActive`, `jointActive`, `halfLapActive`, `mortiseTenonActive`,
`fingerJointActive`, all six `onFaceClick<Mode>` / `onFaceHover<Mode>`, and the four
`<mode>PendingFace`/`<mode>HoveredFace` (the snap `sourceFace`/`hoveredFace`/`snapPhase` names are
retained, now fed from the normalized bundle). Correspondingly:
- The ~18 mode refs → ~5 (`interactionActiveRef`, `onFaceClickRef`, `onFaceHoverRef`,
  `sourceFaceRef`… as needed) synced in the existing ref-sync effect.
- Click dispatch: `if (interactionActiveRef.current) { const faceHit = buildFaceHit(...); if
  (faceHit) onFaceClickRef.current(faceHit) }` — one path replaces the six ordered branches.
- Hover early-return guard: `if (!interactionActiveRef.current) return`.
- Hover dispatch: `onFaceHoverRef.current(faceHit /* or null */)` — one path.
- Highlight effect: one source highlight (`sourceFace`) + one hover highlight (`hoveredFace`),
  replacing the six-way ternary; deps shrink accordingly.
- Cursor effect: keyed on `interactionActive` instead of the six-boolean OR.

**Behavior parity requirement:** the routing/highlight/cursor must produce identical results to the
current six-branch code for every mode. Because only one mode is ever active, the single normalized
path is equivalent to today's "check each active ref in order."

### `App.tsx`

The six hook destructures, the `activeMode` derivation (none today — inline booleans), and the six
`handleActivate*` handlers collapse into:
```ts
const mode = useInteractionMode({ parts: scene.parts, onUpdate, onSelect, onRotationSnap: handleRotationSnap, onAddJoint, onAddHalfLap, onAddMortiseTenon, onAddFingerJoint })
```
- **Keyboard** (`c`/`f`/`j`/`l`/`m`/`b`): each case calls `mode.setMode('<x>')`. Escape →
  `mode.setMode('none')`. The `h` and `Delete`/`Backspace` guards check `!mode.interactionActive`.
  The keydown effect's deps reduce to `[mode]` (its `setMode`/`interactionActive` are stable/tracked).
- **`<Viewport>`** receives the six normalized props from `mode`.
- **`<Sidebar>`** keeps its current prop shape, fed from `mode`:
  `snapActive={mode.activeMode === 'snap'}`, `onSnapToggle={() => mode.setMode('snap')}`,
  `snapPhase={mode.snapPhase}`, `cutActive={mode.activeMode === 'cut'}`,
  `onCutToggle={() => mode.setMode('cut')}`, `dowelTool={mode.dowelTool}`,
  `armDowelTool={mode.armDowelTool}`, `jointActive={mode.activeMode === 'dado'}`,
  `onJointToggle={() => mode.setMode('dado')}`, `jointStatus={mode.statuses.dado}`, and the
  analogous trios for half-lap / mortise-tenon / finger.

## The `snapPhase` note (correctness-critical)

`snapPhase` (`'idle' | 'source-picked'`) is consumed by BOTH `Viewport` (ref-synced) and `Sidebar`
(status text), distinct from `sourceFace`. The coordinator therefore **passes `snapPhase` through
unchanged** and both consumers keep receiving it. The implementer must confirm the exact read sites
of `snapPhase` in `viewport.tsx` and `sidebar.tsx` and preserve them — do **not** try to derive it
away from `sourceFace`, even though `sourceFace != null` correlates with `'source-picked'` today.

## Testing Strategy

- **New `src/scene/useInteractionMode.test.ts`** (renderHook with the real gesture hooks + `vi.fn()`
  callbacks — the gesture hooks are OCCT-free pure state machines):
  - Initial `activeMode === 'none'`, `interactionActive === false`.
  - `setMode('snap')` → `activeMode === 'snap'`, `interactionActive === true`.
  - `setMode('cut')` while snap active → `activeMode === 'cut'` (snap cancelled; exclusivity).
  - `setMode('finger')` twice → back to `'none'` (toggle-off preserved).
  - `setMode('none')` from any mode → `'none'` (Escape path).
  - `onFaceClick`/`onFaceHover` route to the active mode's handler (e.g. activate dado, click a
    housing then a housed end → `onAddJoint` called once); no-op when `'none'`.
  - `sourceFace` reflects the active mode's pending face (e.g. after the first dado click).
- **The entire existing suite stays green** — this is the primary safety net for the App/Viewport
  flip. No behavior change means no existing test changes.
- Interactive 3D verification (that highlighting/cursor/routing look identical) is a human step.

## Task Breakdown (for `writing-plans`)

1. **T1** — Create `useInteractionMode` (composition + derived `activeMode` + toggle-aware `setMode`
   + normalized bundle + pass-throughs) and its unit test. **Additive** — nothing consumes it yet;
   the hook is fully tested in isolation. Suite green.
2. **T2** — The flip: adopt `useInteractionMode` in `App.tsx` (remove the six destructures + six
   handlers), normalize `Viewport`'s prop interface + internals, wire `<Viewport>` to the normalized
   bundle, and feed `<Sidebar>`'s existing props from `mode`. Suite green (behavior identical) +
   typecheck/lint clean. This is one atomic change because App, Viewport, and the coordinator are
   tightly coupled (normalizing Viewport requires App to feed normalized props).
3. **T3** — Docs (`docs/superpowers/notes/…`, and note the pattern in `project-structure.html` /
   `CLAUDE.md`'s architecture section if warranted) + full verify + `pnpm build` + push.

## Key Invariants & Risks

- **Behavior-preserving:** the sole success criterion is the existing suite green before *and* after,
  plus the new coordinator test. Any test that needs changing signals an unintended behavior change —
  stop and reconcile.
- **Toggle semantics:** `setMode(X)` on the already-active X must deactivate (→ `'none'`), matching
  today's click-again behavior. Covered by the coordinator test.
- **`snapPhase` preserved** (see the dedicated note) — the one place a naive normalization could
  regress snap.
- **`activeMode` single-truth:** it's derived, so it can never disagree with the hooks; `setMode` is
  the only writer and enforces exclusivity, so at most one boolean is ever true.
- **Ref-sync completeness in Viewport:** the new normalized refs must be assigned every render in the
  existing sync effect (the same discipline that the per-mode refs used).
- **Risk — the App/Viewport flip (T2) is one large coupled change.** Mitigation: T1's isolated unit
  test proves the coordinator's logic first; T2 is then a mechanical rewire verified by the full
  suite, which already covers the gesture behaviors end-to-end.
- **No `activeMode` enum leakage into the gesture hooks** — they keep their own booleans; the
  coordinator is the only place that knows the mode set. This keeps the hooks independently testable
  and the refactor reversible.
