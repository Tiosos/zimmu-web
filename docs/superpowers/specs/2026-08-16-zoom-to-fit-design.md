# Zoom to Fit — Design Spec

Status: **decided**, not yet implemented (2026-08-16).

## Overview

There is no zoom-to-fit anywhere in the app. The camera is hardcoded to `(250, -200, 150)` looking at
the origin (`viewport.tsx:200`), tuned for the default 200 × 100 × 25 board. This was recorded as
friction during the 2026-08-09 carcase measurement and is unaddressed:

> No zoom-to-fit exists anywhere in the app. […] On first render of a real carcase you are effectively
> inside the cabinet, and twelve mouse-wheel steps still do not frame it.
>
> — `docs/superpowers/notes/2026-08-07-scene-wide-suggestions-notes.md`

"Effectively inside" is literal. An 800 × 600 × 720 base cabinet at the origin spans x ±400, y ±300,
z 0–720. The fixed camera position `(250, -200, 150)` satisfies all three: **the session begins with
the camera inside the cabinet.** The wheel does not rescue it, because OrbitControls dollies toward
`controls.target`, which is also inside the box, and its step is proportional to the current distance,
so the early steps are tiny.

This spec adds a manual command that frames every visible part.

## Decisions

Each was decided explicitly; the rejected option is recorded so a later reader does not relitigate it.

### Manual only — no automatic fitting

`Home` fits. Nothing fits on its own.

Rejected: auto-fit on file open. `useFile` already serializes `camera.position` and `camera.target`
into the `.zimmu` file, and `viewport.tsx:414` restores them on load. Auto-fitting on open would
discard the view the user deliberately saved. Also rejected: continuous re-fit on bounds change —
`scene.parts` changes on every keystroke in a dimension input, so the view would crawl while typing.

### Frames all visible parts

Hidden parts are excluded, consistent with STL/STEP export and the drawing sheets, which all consume
`visibleParts` (`App.tsx:163`).

Unlike those, fit applies the `visible` predicate **inside `fitCamera.ts`** rather than receiving a
pre-filtered array. The reason is the wiring below: the caller is `viewport.tsx`, which receives
`parts={scene.parts}` — every part, not just visible ones (`App.tsx:346`). Filtering at the call site
would put the rule in the one file that has no unit tests. Inside the module it is directly testable.

Rejected: fitting the selection when one exists. It makes one key mean two things depending on
selection state, and the recorded friction is entirely about framing the whole design. Not ruled out
later; it is simply not what was asked for.

### Direction: keep the current bearing, with a guard

The fit slides along the sight line the user is already on and re-targets the bounds centre. Nothing
rotates. The exception is the degenerate case where `position` and `target` coincide, leaving no
bearing to preserve; then the canonical `(250, -200, 150)` direction is used.

That guard is not defensive decoration. `useFile` restores `camera` verbatim from file, so a
hand-edited or corrupted `.zimmu` carrying equal position and target is reachable input, and file
input is a boundary this repo validates at.

Rejected: always snapping to the canonical 3/4 view. It is more predictable, but it throws away the
user's orbit — fitting while inspecting a back corner would spin them to the front.

### Distance: project the eight AABB corners, not a bounding sphere

A sphere fit (`d = r / sin(fov/2)`) is one division and is rotation-invariant, but a sphere around a
long thin board is mostly air. Measured for a 2400 × 100 × 20 board viewed broadside at aspect 1.5:

| | distance | board occupies |
|---|---|---|
| bounding sphere | 3138 mm | 61.5% of viewport width |
| projected corners | 1931 mm | ~95% of viewport width |

The sphere parks the camera 62% further back than necessary. Zimmu is an application about long thin
boards, so this is the common case, not a contrived one. For a boxy carcase the two formulas converge
and the sphere would have been adequate — the board case is what decides it.

### Both FOV axes, always

Fitting to the vertical FOV alone overflows sideways on a wide viewport. The horizontal half-angle is
`atan(aspect · tan(fov/2))` — 31.9°, not 22.5°, at aspect 1.5. Both constraints apply.

### `Home`, and no button

`F` — the conventional fit key — is taken by snap/align. `Home` matches Blender's frame-all, conflicts
with nothing, and spends no single letter, which matters because letters are being consumed steadily
by joint modes (`J`, `L`, `M`, `B`, `T` are gone).

`Home` is a text-editing key, but `App.tsx:185` already returns early when the event target is an
`HTMLInputElement` or `HTMLTextAreaElement`, so it still moves the caret in a dimension field. No new
guard is required.

Rejected for now: a viewport overlay button. It would aid discovery, but `viewport.tsx` renders no
overlay controls today and adding the first one is a larger change than the feature.

### Instant, not animated

Set position and target, call `controls.update()`. An eased tween would have to co-exist with the
`requestAnimationFrame` loop and the 0.08 damping already running in `viewport.tsx`, and it would make
the end state asynchronous, so tests would have to wait rather than assert.

## Architecture

### New module: `src/scene/fitCamera.ts`

Pure, React-free and THREE-free, depending only on `geom/transform.ts`:

```ts
export const FIT_MARGIN = 1.05
export const MIN_FIT_DISTANCE = 1          // mm — keeps position !== target
export const CANONICAL_DIR: Vec3 = { x: 250, y: -200, z: 150 }

export function fitCameraToParts(
  parts: Part[],                            // all parts; hidden ones excluded internally
  aspect: number,
  fovDeg: number,
  current: CameraState,
): CameraState | null                       // null ⇒ nothing to frame; caller no-ops
```

A separate small module rather than more weight in `viewport.tsx`, matching the existing
`snapMath.ts` / `cutFootprint.ts` / `groupSuggestions.ts` pattern. THREE-free specifically, following
`transform.ts`, so it is testable directly rather than through the React tree — which CLAUDE.md's
testing guidance asks for.

`CameraState` is reused as the return type and is **not** widened. It is serialized into the `.zimmu`
file, so adding fields to it would change the file format.

### Algorithm

1. **World AABB** over parts with `visible !== false`. Per part, `composeWorldMatrix(part)`, then eight local corners through
   `applyMatrixToPoint`, accumulating min/max. The two part kinds have genuinely different local
   boxes, and a `never` guard on the switch forces a new kind to be classified deliberately (matching
   `pairIdsOf` and `suggestionFaceRefs`):

   - `board` → `x ∈ [0, length]`, `y ∈ [0, width]`, `z ∈ [0, thickness]`. Corner-origin on all three
     axes, because geometry is built by `BRepPrimAPI_MakeBox_1(dx, dy, dz)`. Confirmed by
     `snapMath.ts:43-48`, where the `+X` face centre is `x: length` and the `-X` face centre is
     `x: 0`. **Assuming a centred box offsets every fit by half a board.**
   - `cylinder` → `x, y ∈ [-diameter/2, +diameter/2]`, `z ∈ [0, length]`. Centred in x/y,
     corner-origin in z, because the local origin lies on the axis at the base circle
     (`types.ts:99`).

   Cuts are ignored. Every cut is subtractive within the part's box, so the box AABB is a correct
   outer bound. Bounds therefore do not depend on OCCT having finished building meshes, and `Home`
   works before geometry loads.

2. **Target** = AABB centre.

3. **Direction** `d = normalize(current.position - current.target)`; if its length is near zero, use
   `normalize(CANONICAL_DIR)`.

4. **Camera basis.** `f = -d`; `r = normalize(cross(f, up))` with `up = (0,0,1)` to match
   `camera.up`; `u = cross(r, f)`. If `f` is parallel to `up` — the user orbited dead top-down — the
   cross product is zero and the basis collapses, so fall back to `up = (0,1,0)`. This is a **second,
   distinct** degeneracy; the step-3 guard does not cover it.

5. **Distance.** With `e = corner - centre`, keeping a corner inside both half-angles requires

   ```
   t ≥ |e·r| / tan(hHalf) + e·d
   t ≥ |e·u| / tan(vHalf) + e·d        where tan(hHalf) = aspect · tan(vHalf)
   ```

   Take the maximum over all eight corners and both constraints, multiply by `FIT_MARGIN`, floor at
   `MIN_FIT_DISTANCE`.

6. **Result** `{ position: centre + d·t, target: centre }`.

### Wiring: App owns intent, viewport owns camera mechanics

`App.tsx` adds `Home` to its existing keydown handler and increments a `fitRequest` nonce passed to
`Viewport`. The viewport's effect on that nonce reads its own `camera.aspect` and `camera.fov`, calls
`fitCameraToParts` with the `parts` prop it already holds, and applies the result to `controls`. A
`null` result leaves the camera untouched.

A nonce rather than a boolean, because two consecutive `Home` presses must both fire and a boolean
would not change on the second.

The alternative — App computing the fit and pushing it through the existing `loadedCamera` prop — was
rejected because `aspect` is a viewport-owned fact derived from `mount.clientWidth/clientHeight`.
Publishing it upward so App could learn something it otherwise has no use for is inversion, and it
would additionally require renaming `loadedCamera`, whose current name honestly means "came from a
file". Under this wiring that prop is untouched.

## Edge cases

| Case | Behaviour |
|---|---|
| No visible parts | Returns `null`; `Home` does nothing rather than jumping somewhere arbitrary. |
| `position === target` | No bearing to preserve → `CANONICAL_DIR`. |
| Orbited dead top-down | `f ∥ up` collapses the basis → fall back to `up = (0,1,0)`. |
| Zero-extent bounds | A part mid-edit at 0 mm gives `t = 0`, which would put position on target and leave OrbitControls with a zero-length offset. Floored at `MIN_FIT_DISTANCE`. |
| Non-finite aspect | A zero-height mount yields `NaN`/`Infinity`; treated as `1`. |

## Testing

TDD, per repo convention — each test written and watched to fail first.

`src/scene/fitCamera.test.ts`, pure and mock-free:

- targets the AABB centre of two separated boards
- excludes parts with `visible: false`, and returns `null` when every part is hidden
- **board local box is corner-origin** — an unrotated board at the origin yields
  `[0..length] × [0..width] × [0..thickness]`; this is the test that catches a centred-box assumption
- cylinder local box is centred in x/y and corner-origin in z
- rotation is honoured — a 45°-rotated board yields a larger AABB than unrotated
- preserves the current bearing
- `position === target` falls back to the canonical bearing
- a top-down direction still produces a finite result via the alternate up
- **every corner projects inside both half-angles after fitting** — the property that makes the result
  correct rather than merely plausible
- **shrinking the distance below `FIT_MARGIN` pushes at least one corner outside** — without this,
  a distance of 10⁶ passes the previous test; together they pin the fit as tight
- at `aspect = 3` a wide, short scene is driven by the horizontal constraint, not the vertical
- zero-extent bounds floor at `MIN_FIT_DISTANCE`
- `never` guard on part kind

`src/App.test.tsx`: the Viewport mock is currently `Viewport: () => null` and must be widened to
capture props. Two tests — `Home` with parts present signals a fit; `Home` with focus in an input does
not.

`viewport.tsx` itself is not unit-tested (WebGL under happy-dom); its share is ~10 lines of plumbing
that mirror the existing camera-restore effect. Browser verification covers it.

## Files

| File | Change |
|---|---|
| `src/scene/fitCamera.ts` | **new** — `fitCameraToParts`, `FIT_MARGIN`, `MIN_FIT_DISTANCE`, `CANONICAL_DIR` |
| `src/scene/fitCamera.test.ts` | **new** |
| `src/render/viewport.tsx` | execute the fit on `fitRequest` |
| `src/App.tsx` | `Home` in the existing keydown handler; pass the `fitRequest` nonce |
| `src/App.test.tsx` | widen the Viewport mock; two tests |
| `docs/keyboard-shortcuts.md` | add `Home` to the non-modifier table |
| `docs/superpowers/notes/2026-08-16-zoom-to-fit-notes.md` | **new** — living notes, per CLAUDE.md |
| `project-structure.html` | new module row in the `src/scene/` table |

## Non-goals

- **Animated transition.** Instant, per the decision above.
- **Fit to selection.** One command, one meaning.
- **Auto-fit on load or on first part.** Would fight the per-file camera restore.
- **Adjusting the camera far plane.** It is 10 000 mm ≈ 10 m, comfortably past any furniture scene.
- **Rescaling the grid.** `GridHelper(400, 20)` is fixed, so fitting a 2.4 m carcase leaves the grid a
  small patch under one corner. Cosmetic, pre-existing, and a separate decision — but fit is what will
  make it obvious.
