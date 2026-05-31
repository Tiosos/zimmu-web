# Snap & Align — Design Spec

**Date:** 2026-05-31
**Status:** Approved — v2 (post full-spec L99 review, all suggestions incorporated)
**Scope:** Face-to-face flush snap — translate only, two-click flow, chained snaps

---

## Goal

Let the user snap two boards flush face-to-face in a single gesture: click a source face, click a target face, and the source board translates so its face is coplanar and flush with the target face. Translation only — no rotation. The operation is undoable, labelled in history, and chainable (snap stays active after each snap for rapid alignment of multiple boards).

---

## 1. Architecture

### New files

| File | Role |
|---|---|
| `src/scene/snapMath.ts` | Named exports: `computeSnapDelta`, `computeFaceCorners`. Pure math functions. Uses Three.js math types (Vector3, Matrix4, Euler) for transforms but has no scene mutations, no GPU state, no React. |
| `src/scene/useSnap.ts` | Hook: owns the snap state machine, guards, and history integration. Imports from `snapMath.ts`. |
| `src/scene/useSnap.test.ts` | State machine tests via `renderHook`. |
| `src/scene/snapMath.test.ts` | Pure math tests — no mocks. |

### Modified files

| File | Change |
|---|---|
| `src/scene/types.ts` | Add `FaceHit` interface. |
| `src/scene/useScene.ts` | Extend `onUpdate` signature with optional `historyLabel` parameter. |
| `src/scene/useScene.test.ts` | Add coalesceKey suppression and history label tests. |
| `src/render/viewport.tsx` | Add snap props, LineLoop highlights, rAF-throttled mousemove, `partsRef` pattern, cursor management. |
| `src/ui/sidebar.tsx` | Add phase-aware "Snap faces" button. |
| `src/App.tsx` | Compose `useSnap`, wire F / Escape keyboard shortcuts, pass snap props to Viewport. |

### Dependency direction

```
snapMath.ts ← useSnap.ts ← App.tsx → Viewport
                                    → Sidebar
types.ts    ← useSnap.ts
             ← Viewport
useScene.ts ← App.tsx
```

`Viewport` does not import `useSnap` directly — it receives snap state as props. `useSnap` does not import from `render/` — it is purely reactive state logic.

---

## 2. Data Types

Add to `src/scene/types.ts`:

```typescript
export interface FaceHit {
  partId: PartId
  faceNormal: Vec3       // world-space unit normal, snapped to nearest axis
  faceCenter: Vec3       // world-space face centre
  localFaceNormal: Vec3  // canonical local-space normal; exactly one ±1 component, rest 0
}
```

**`faceNormal`** — world-space. Used in `computeSnapDelta`. Derived by transforming `localFaceNormal` through the part's `matrixWorld`, then re-snapping to the nearest axis in world space (handles small floating-point drift from non-axis-aligned rotations).

**`localFaceNormal`** — local-space. Used in `computeFaceCorners` to determine which two axes form the face plane. Always one of the six canonical unit vectors: `(±1, 0, 0)`, `(0, ±1, 0)`, `(0, 0, ±1)`. Derived first (snap Three.js `intersect.face.normal` to nearest axis in local space), then transformed to produce `faceNormal`.

**`faceCenter`** — world-space. Used in `computeSnapDelta`. Computed from the AABB of the hit face in world space, not from `intersect.point` (which is the exact click point, not the face centre).

---

## 3. Math (`src/scene/snapMath.ts`)

Both functions are named exports. `useSnap.ts` imports both; `snapMath.test.ts` tests both directly through the same import path.

### `computeSnapDelta`

```typescript
export function computeSnapDelta(
  sourceFace: FaceHit,
  targetFace: FaceHit,
): Vec3
```

Translates the source board so its face is coplanar and flush with the target face. The source face moves to lie exactly on the target face plane.

**Formula:**

```
delta = dot(targetFace.faceCenter − sourceFace.faceCenter, targetFace.faceNormal)
        × targetFace.faceNormal
```

- Projects the centre-to-centre vector onto the target normal to find the gap along that axis.
- Multiplies by the target normal to produce a delta in world space.
- Lateral components (perpendicular to the normal) are zeroed — translation is purely along the target normal.
- If faces are already flush, `dot(...)` = 0 and `delta = (0, 0, 0)` — no-op, no history entry created.

**Parallel-normal guard (in `useSnap.onFaceClick`):**

Before computing the delta, check whether the source and target normals point in the same direction. If `dot(sourceFace.faceNormal, targetFace.faceNormal) > 0`, both faces face the same way and flush-snap is meaningless. Return without calling `onUpdate`. No error is shown; the hover highlight simply does not appear for parallel faces (see §6).

The threshold is strictly `> 0`, not `>= 0`. Perpendicular faces (`dot = 0`) are explicitly **allowed**: snapping a board's side face to another board's end face is geometrically valid and produces a correct L-joint or T-joint. `computeSnapDelta` handles perpendicular normals correctly — the projection onto `nTarget` yields the exact gap along the target axis regardless of `nSource` direction.

### `computeFaceCorners`

```typescript
export function computeFaceCorners(
  face: FaceHit,
  part: Part,
): [Vec3, Vec3, Vec3, Vec3]
```

Returns 4 world-space corner points of the highlighted face in CCW winding order (relative to the face normal). Used by Viewport to build the LineLoop geometry.

Accepts `Part` (not `BoardPart`) and narrows internally:

```typescript
if (part.kind !== 'board')
  throw new Error(`computeFaceCorners: unsupported kind '${part.kind}'`)
```

**Derivation:**

`computeFaceCorners` uses only `face.localFaceNormal` and `part` dimensions — it does **not** use `face.faceCenter`. The local face center is derived analytically (OCCT places the box corner at the local origin, so the face centres are deterministic):

```
localFaceNormal = ( 1, 0, 0) → local center = (length,      width/2,     thickness/2)
localFaceNormal = (-1, 0, 0) → local center = (0,           width/2,     thickness/2)
localFaceNormal = ( 0, 1, 0) → local center = (length/2,    width,       thickness/2)
localFaceNormal = ( 0,-1, 0) → local center = (length/2,    0,           thickness/2)
localFaceNormal = ( 0, 0, 1) → local center = (length/2,    width/2,     thickness)
localFaceNormal = ( 0, 0,-1) → local center = (length/2,    width/2,     0)
```

This avoids `matrixWorld.invert()` entirely (which mutates the matrix in place unless cloned, a common source of bugs).

1. Look up the local face center from the table above.

2. Determine two perpendicular axes spanning the face plane:

```
const n = face.localFaceNormal  // e.g. (0, 0, 1)
const fallback = (|n.x| < 0.9) ? (1, 0, 0) : (0, 1, 0)
const u = normalize(cross(n, fallback))   // tangent
const v = cross(n, u)                     // bitangent
```

3. Compute half-extents for `u` and `v`:

```
// localFaceNormal tells us which two dimensions span the face:
//   (±1,0,0) → halfU = width/2,     halfV = thickness/2
//   (0,±1,0) → halfU = length/2,    halfV = thickness/2
//   (0,0,±1) → halfU = length/2,    halfV = width/2
```

4. Compute 4 local-space corners:

```
corners = [
  localCenter + halfU*u + halfV*v,
  localCenter - halfU*u + halfV*v,
  localCenter - halfU*u - halfV*v,
  localCenter + halfU*u - halfV*v,
]
```

5. Build `matrixWorld` from `part.position` and `part.rotation` (Three.js `Euler` XYZ + `Matrix4.compose`). Apply it to each corner to produce world-space points.

**Winding order invariant:** For each of the 6 canonical normals, the cross product `(corners[1] − corners[0]) × (corners[2] − corners[0])` must point in the same direction as `face.faceNormal`. This is verified in `snapMath.test.ts`.

---

## 4. State Machine (`src/scene/useSnap.ts`)

### Interface

```typescript
interface SnapState {
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  activateSnap: () => void
  cancelSnap: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

function useSnap(params: {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void
}): SnapState
```

`onUpdate` always receives a `historyLabel` from useSnap (snap calls are always discrete history entries; coalescing is never appropriate).

### Transitions

```
IDLE ──activateSnap()──────────────────────────────────► ACTIVE-IDLE
     ◄─cancelSnap() / activateSnap() (toggle)──────────
ACTIVE-IDLE ──onFaceClick(hit)─────────────────────────► ACTIVE-SOURCE-PICKED
            ◄─cancelSnap()──────────────────────────────
ACTIVE-SOURCE-PICKED ──onFaceClick(hit, valid target)──► ACTIVE-IDLE (stays active)
                     ──onFaceClick(hit, same-part)──────► ACTIVE-SOURCE-PICKED (no-op)
                     ──onFaceClick(parallel normals)─────► ACTIVE-SOURCE-PICKED (no-op)
                     ◄─cancelSnap()──────────────────────
```

Snap **stays active** after a successful snap (does not return to fully inactive). This enables chained snaps: the user can immediately click another source face without reactivating. The only exits from the active states are explicit cancel (Escape, button click, or toggle).

**Invariant:** `sourceFace !== null` if and only if `snapPhase === 'source-picked'`. Any code path that sets `sourceFace = null` must also set `snapPhase = 'idle'`, and vice versa. This invariant is what makes the `sourceFace!` non-null assertions in the guards safe to write without a runtime null-check.

### Guards in `onFaceClick`

Applied in order before any state mutation or `onUpdate` call:

1. **Not active:** `if (!snapActive) return`
2. **Idle phase — record source:** set `sourceFace`, transition to `source-picked`, return.
3. **Source-picked — same part:** `if (hit.partId === sourceFace!.partId) return`
4. **Source-picked — parallel normals:** `if (dot(sourceFace!.faceNormal, hit.faceNormal) > 0) return`
5. **Zero delta:** compute `delta = computeSnapDelta(sourceFace!, hit)`. If `|delta| < 0.001mm`, skip `onUpdate` (already flush), reset `sourceFace = null`, remain in `active-idle`.
6. **Proceed:** call `onUpdate`, reset `sourceFace = null`, set `snapPhase = 'idle'` (stay active).

### Guards in `onFaceHover`

1. **Not active:** `if (!snapActive) return` → set `hoveredFace = null`
2. **Idle phase:** `if (snapPhase === 'idle') return` → `hoveredFace = null` (no target to preview in idle)
3. **Same part as source:** `if (hit?.partId === sourceFace?.partId) { hoveredFace = null; return }`
4. **Parallel normals:** `if (hit && dot(sourceFace!.faceNormal, hit.faceNormal) > 0) { hoveredFace = null; return }`
5. **Proceed:** set `hoveredFace = hit`

### Source part deletion

```typescript
useEffect(() => {
  if (sourceFace && !parts.find(p => p.id === sourceFace.partId)) {
    cancelSnap()
  }
}, [parts])
```

`cancelSnap` resets all state to: `snapActive = false`, `snapPhase = 'idle'`, `sourceFace = null`, `hoveredFace = null`.

### `activateSnap` toggle

```typescript
function activateSnap() {
  if (snapActive) {
    cancelSnap()
  } else {
    setSnapActive(true)
    setSnapPhase('idle')
  }
}
```

---

## 5. `useScene.onUpdate` — Extended Signature

Modify `onUpdate` in `src/scene/useScene.ts`:

```typescript
onUpdate: (
  id: PartId,
  updater: (p: Part) => Part,
  historyLabel?: string,
) => void
```

When `historyLabel` is provided:
- Use it as the history entry label.
- Set `coalesceKey: undefined` on the history entry (not omit the field — explicitly `undefined`). This prevents coalescing with any adjacent entry regardless of timing.

When `historyLabel` is not provided:
- Existing behaviour: use `coalesceKey` derived from `id` and current timestamp for coalescence.

---

## 6. Visual Feedback

### Updated `ViewportProps`

```typescript
interface ViewportProps {
  parts: Part[]
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
  // snap additions:
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}
```

**Click routing:** in the click handler, if `snapActive`, call `onFaceClick` with the hit face (or ignore the click if no face was hit). If `!snapActive`, call `onPartClick` with the hit part id (or `null` on miss). The two callbacks are mutually exclusive on any single click — never call both.

**Hover routing:** the rAF callback only fires `onFaceHover` when `snapActive`. When `!snapActive`, `lastMouseRef` is still updated but the rAF callback returns early via `snapActiveRef.current`, so no unnecessary raycasts occur.

### Face hit detection in Viewport

On each raycast hit:

1. Get `intersect.face.normal` — Three.js local-space normal from the geometry.
2. Snap to nearest axis in local space: find the component with largest absolute value, round to ±1, zero the rest. This is `localFaceNormal`.
3. Transform to world space: create a `THREE.Vector3` from `localFaceNormal`, apply `mesh.matrixWorld` as a direction (use `transformDirection`, not `applyMatrix4` — direction, not position), snap result to nearest axis in world space. This is `faceNormal`.
4. Compute `faceCenter`: derive the local face center analytically from `localFaceNormal` and part dimensions using the same table as `computeFaceCorners` (OCCT box corner at local origin). Apply `mesh.matrixWorld` as a position (`applyMatrix4`) to get the world-space center. Do **not** iterate geometry vertices — the OCCT tessellation layout is not stable enough to rely on.

### LineLoop highlights

Two persistent `THREE.LineLoop` refs in Viewport: `sourceHighlight` and `hoverHighlight`. Both are added to the Three.js scene on mount and removed on unmount.

**Material properties (both):**

```typescript
new THREE.LineBasicMaterial({
  depthTest: false,    // draw on top of existing LineSegments edges — no z-fighting
  transparent: true,
  linewidth: 1,        // WebGL limitation: linewidth > 1 requires LineSegments2
})
sourceHighlight.renderOrder = 1
hoverHighlight.renderOrder = 1
```

`depthTest: false` is specifically for z-fighting with the existing `EdgesGeometry` LineSegments, which share 4 co-planar edge segments with the highlight. It is **not** intended to show highlights through occluding geometry. Occluded faces will not have highlights visible from the camera that cannot see them — this is correct behaviour (the raycast cannot hit an occluded face through an occluder).

**Colors:**

| Highlight | Color | Hex |
|---|---|---|
| Source face | Yellow | `0xfbbf24` |
| Hover (target candidate) | Blue | `0x60a5fa` |

Yellow distinguishes the source highlight from the existing selection highlight (orange-tinted emissive mesh). A part that is both `selectedId` and the snap source will show both the emissive selection glow and the yellow LineLoop simultaneously — no Three.js conflict exists and both are intentionally visible.

**Normal offset:** 1.0mm in the `faceNormal` direction applied to all 4 corners before building the geometry. This lifts the LineLoop off the face polygon to prevent z-fighting with the face surface itself. (z-fighting with existing `LineSegments` is handled by `depthTest: false` + `renderOrder`.)

### Highlight update effect

```typescript
useEffect(() => {
  updateHighlight(sourceHighlight.current, snapActive ? sourceFace : null, parts, 0xfbbf24)
  updateHighlight(hoverHighlight.current, snapActive ? hoveredFace : null, parts, 0x60a5fa)
}, [snapActive, sourceFace, hoveredFace, parts])
```

`updateHighlight(loop, face, parts, color)`:
- If `face === null`: set `loop.visible = false`; **no geometry change** (geometry is reused on the next selection; disposing on every hide adds unnecessary allocation churn).
- If `face !== null`: find the part by `face.partId` in `parts`; call `computeFaceCorners`; build new `BufferGeometry` from 4 offset corners; **call `loop.geometry.dispose()` before assignment**; assign new geometry; set `loop.material.color.setHex(color)`; set `loop.visible = true`.

There is no separate `clearHighlight` function — `updateHighlight(loop, null, ...)` is the single hide path. This keeps the "visible=false" logic in one place.

On Viewport unmount: call `loop.geometry.dispose()` for both LineLoops.

### `partsRef` — stale closure safety

```typescript
const partsRef = useRef<Part[]>(parts)
useLayoutEffect(() => { partsRef.current = parts }, [parts])
```

All Viewport event handlers (mousemove, click) read `partsRef.current` for part lookups. This prevents stale closures where a handler captures an old `parts` array from a prior render.

### rAF-throttled mousemove

```typescript
const rafIdRef = useRef<number>(0)
const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

function onMouseMove(e: MouseEvent) {
  lastMouseRef.current = { x: e.clientX, y: e.clientY }
  cancelAnimationFrame(rafIdRef.current)
  rafIdRef.current = requestAnimationFrame(() => {
    if (!snapActiveRef.current) return
    // raycast using lastMouseRef.current
    // call onFaceHover with result or null
  })
}
```

`snapActiveRef` is a ref synced to `snapActive` prop via `useLayoutEffect` — the same pattern as `partsRef` — to avoid a stale closure inside the rAF callback:

```typescript
const snapActiveRef = useRef(snapActive)
useLayoutEffect(() => { snapActiveRef.current = snapActive }, [snapActive])
```

Without this ref, `snapActive` captured inside the rAF closure would be stale (always the value from the render that registered the listener). Adding `snapActive` to the event-listener effect's dep array would re-register the listener on every toggle, which is also wrong.

Cleanup in the event-listener useEffect:

```typescript
return () => {
  element.removeEventListener('mousemove', onMouseMove)
  cancelAnimationFrame(rafIdRef.current)
}
```

### Cursor

Apply `cursor: 'crosshair'` to the DOM element that has `onMouseMove` / `onClick` attached (the renderer's wrapper div, not the `<canvas>` directly — confirm during implementation which element owns the events). Reset to `cursor: ''` when `snapActive` becomes false. Reset in unmount cleanup to prevent a stuck crosshair after navigation.

### Sidebar button

Location: top of the sidebar, above the parts list. Always visible (not dependent on `selectedId`).

| State | Primary label | Subtitle |
|---|---|---|
| `!snapActive` | `Snap faces` | _(none)_ |
| `snapActive && snapPhase === 'idle'` | `Snapping` | `Click a face · Esc to cancel` |
| `snapActive && snapPhase === 'source-picked'` | `Snapping` | `Click target face · Esc to cancel` |

Clicking the button always calls `activateSnap()` (which toggles — cancels if already active).

### Keyboard shortcuts

In `App.tsx` keyboard handler:

| Key | Action |
|---|---|
| `f` / `F` | `activateSnap()` (toggle) |
| `Escape` | If `snapActive`: `cancelSnap()`. Else: existing escape behaviour (deselect). |

`Escape` cancel takes priority over deselect when snap is active.

---

## 7. File Structure

```
src/
├── scene/
│   ├── types.ts        + FaceHit interface
│   ├── useScene.ts     + historyLabel param in onUpdate
│   ├── useScene.test.ts + coalesceKey suppression + label tests
│   ├── snapMath.ts     new — computeSnapDelta, computeFaceCorners
│   ├── snapMath.test.ts new
│   ├── useSnap.ts      new — state machine hook
│   └── useSnap.test.ts new
├── render/
│   └── viewport.tsx    + snap props, LineLoops, rAF throttle, partsRef, cursor
├── ui/
│   └── sidebar.tsx     + Snap faces button with phase-aware labels
└── App.tsx             + useSnap, F/Escape shortcuts, snap props
```

---

## 8. Testing

### `src/scene/snapMath.test.ts` — pure math, no mocks

**`computeSnapDelta`**

Note: `computeSnapDelta` is a pure math function and does not apply the parallel-normal guard — that guard lives in `useSnap.onFaceClick`. The test cases below use realistic (anti-parallel) normals for the primary case, then document the raw formula behaviour for other inputs.

| Scenario | sourceFace | targetFace | Expected delta |
|---|---|---|---|
| Anti-parallel, 100mm apart (realistic) | center `(0,0,0)`, nSource `(0,0,1)` | center `(0,0,100)`, nTarget `(0,0,-1)` | `(0,0,-100)` — source moves 100mm in −Z so its top face meets the target's bottom face |
| Already flush | centers equal, any anti-parallel normals | — | `(0,0,0)` |
| Past flush (overlap) | center `(0,0,10)` | center `(0,0,0)`, nTarget `(0,0,1)` | `(0,0,-10)` |
| Lateral offset (ignored) | center `(50,30,0)` | center `(0,0,100)`, nTarget `(0,0,-1)` | `(0,0,-100)` — lateral components drop out |
| X-axis faces | centers 75mm apart in X | nTarget `(-1,0,0)` | `(75,0,0)` |
| Parallel normals (raw math, no guard) | center `(0,0,0)`, nSource `(0,0,1)` | center `(0,0,100)`, nTarget `(0,0,1)` | `(0,0,100)` — formula works but guard in `onFaceClick` prevents this path in production |

**`computeFaceCorners`**

For each of the 6 canonical local normals (`±1,0,0`, `0,±1,0`, `0,0,±1`) with a 100×50×25mm board at identity transform:

- Returns exactly 4 points.
- All 4 points lie in the correct face plane: `dot(corners[i] − faceCenter, faceNormal) ≈ 0` (within 1e-6).
- Correct corners: each point matches one of the expected 4 face corners (distance from face centre equals expected half-extents).
- CCW winding: `cross(corners[1] − corners[0], corners[2] − corners[0])` points in the same direction as `faceNormal`.
- No bowtie: all 4 corners are distinct; no two share the same position.

Repeat with a non-identity transform (position `(10,20,30)`, rotation `(0,0,45°)`) to verify `matrixWorld` application. Three.js `Vector3` / `Matrix4` / `Euler` are pure JS — no browser mock required.

Assert `computeFaceCorners` throws with a clear message for a hypothetical `part.kind !== 'board'`.

### `src/scene/useSnap.test.ts` — hook state machine

Uses `renderHook` from `@testing-library/react`. `onUpdate` is `vi.fn()`.

**Initial state:**
```typescript
expect(result.current.snapActive).toBe(false)
expect(result.current.snapPhase).toBe('idle')
expect(result.current.sourceFace).toBeNull()
expect(result.current.hoveredFace).toBeNull()
```

**`activateSnap()`:**
- Call once → `snapActive = true`, `snapPhase = 'idle'`
- Call twice (toggle) → `snapActive = false`, `snapPhase = 'idle'`, `sourceFace = null`, `hoveredFace = null`

**`cancelSnap()` — full postcondition check:**
- From idle-active: all four fields reset to initial values (listed explicitly)
- From source-picked: all four fields reset to initial values

**`onFaceHover` — idle phase:**
- Call with any hit while in idle phase → `hoveredFace` remains `null`

**`onFaceClick` — idle phase:**
- Click face on part A → `sourceFace = faceA`, `snapPhase = 'source-picked'`, `onUpdate` not called

**`onFaceClick` — source-picked, valid target:**
- Click face on part B (different part, anti-parallel normals):
  - `onUpdate` called exactly once
  - Capture updater: `const updater = vi.mocked(onUpdate).mock.calls[0][1]`; assert `updater(partB).position` equals `{...partB.position, z: expectedZ}`
  - Capture label: `const label = vi.mocked(onUpdate).mock.calls[0][2]`; assert `label === \`Snap ${sourcePartLabel} to ${targetPartLabel}\``
  - After snap: `snapPhase = 'idle'`, `sourceFace = null`, `hoveredFace = null`, `snapActive = true` (stays active)

**`onFaceClick` — same-part guard:**
- `sourceFace.partId = 'A'`; click face on part A → `onUpdate` not called, `snapPhase` unchanged

**`onFaceHover` — same-part guard:**
- During source-picked, hover face on source part → `hoveredFace = null`

**`onFaceHover` — parallel normals guard:**
- During source-picked, hover face with parallel normal → `hoveredFace = null`

**Source part deletion:**
```typescript
const { result, rerender } = renderHook(
  ({ parts }) => useSnap({ parts, onUpdate }),
  { initialProps: { parts: [partA, partB] } }
)
act(() => result.current.activateSnap())
act(() => result.current.onFaceClick(faceOnA))
// snapPhase = 'source-picked', sourceFace = faceOnA
rerender({ parts: [partB] })
expect(result.current.snapActive).toBe(false)
expect(result.current.sourceFace).toBeNull()
expect(result.current.hoveredFace).toBeNull()
expect(result.current.snapPhase).toBe('idle')
```

### `src/scene/useScene.test.ts` — coalesceKey suppression

Add a new test block: "snap onUpdate suppresses coalescing."

`useScene` does not expose a `history` array publicly — label content is already verified in `useSnap.test.ts` (via `vi.mocked(onUpdate).mock.calls[0][2]`). The `useScene` test verifies only the observable behaviour: two `onUpdate` calls with `historyLabel` create two distinct history entries rather than one coalesced entry.

```typescript
// Perform two updates with a historyLabel
const pos0 = result.current.scene.parts[0].position
act(() => result.current.onUpdate('part-a', p => ({ ...p, position: { ...p.position, z: 50 } }), 'Snap A to B'))
const pos1 = result.current.scene.parts[0].position  // { z: 50 }
act(() => result.current.onUpdate('part-a', p => ({ ...p, position: { ...p.position, z: 100 } }), 'Snap A to B'))

// Two undos required — no coalescing
act(() => result.current.undo())
expect(result.current.scene.parts[0].position.z).toBe(pos1.z)  // intermediate

act(() => result.current.undo())
expect(result.current.scene.parts[0].position.z).toBe(pos0.z)  // original
```

If coalescing had occurred, the first `undo()` would jump straight to `pos0`, skipping `pos1`.

### `snapMath.ts` module contract

- All exports are named (`export function computeSnapDelta`, `export function computeFaceCorners`)
- No default export
- `useSnap.ts` imports both functions from `./snapMath` — the same code path tested in `snapMath.test.ts`
- Three.js matrix math (`Vector3`, `Matrix4`, `Euler`) runs in Node/happy-dom without mocks — document this assertion in a comment above the Three.js import in `snapMath.ts`

---

## 9. Out of Scope

| Feature | Reason deferred |
|---|---|
| Rotation to align non-parallel face normals | Requires quaternion UX design; flush-only covers 80% of joinery use cases |
| Multi-face snap (snap + maintain prior constraint) | Constraint solver; out of scope for this milestone |
| Snap preview (ghost of translated board before click) | Requires a separate ghost mesh; adds complexity; two-click flow is sufficient |
| Snap to non-board shapes | No other shapes exist yet; `computeFaceCorners` throws for unknown kinds |
| Undo history label in sidebar UI | Undo/redo UI already exists; label is accessible via Ctrl+Z tooltip in future |
| Touch / pointer events | Snap is mouse-only; CAD tools are desktop-primary; document as explicit scope decision |
| Snap grid / snapping to specific distances | Separate feature; this spec is face-flush only |
| Visual distinction of "already flush" faces | Hover highlight suppression for already-flush faces requires per-hover delta computation; not worth the complexity |
