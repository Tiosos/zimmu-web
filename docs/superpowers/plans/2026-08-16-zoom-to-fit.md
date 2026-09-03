# Zoom to Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** **Complete — the feature is shipped and carries a **Done** badge in `project-structure.html`'s roadmap. Step checkboxes in this file were never ticked as the work went; the record of what landed and why is the Notes file named above.**

**Goal:** Add a `Home` key that frames every visible part in the viewport, so a real carcase can be seen without twelve mouse-wheel steps.

**Architecture:** A new pure module `src/scene/fitCamera.ts` computes `{ position, target }` from the parts, the viewport aspect and the current camera. It is React-free and THREE-free, depending only on `composeWorldMatrix` / `applyMatrixToPoint` from `src/geom/transform.ts`, so it is unit-tested directly. `App.tsx` owns the intent (`Home` increments a `fitRequest` nonce); `viewport.tsx` owns the camera mechanics (reads its own `camera.aspect` / `camera.fov`, calls the module, applies the result to OrbitControls).

**Tech Stack:** TypeScript (strict, `noUnusedLocals`, `verbatimModuleSyntax`), React 19, Three.js + OrbitControls, Vitest + happy-dom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-16-zoom-to-fit-design.md`

---

## Background the engineer needs

Three facts drive the whole implementation. Each is easy to get wrong by assumption.

1. **A board's local box is corner-origin, not centred.** Geometry is built by
   `BRepPrimAPI_MakeBox_1(dx, dy, dz)`, which spans `(0,0,0)` to `(dx,dy,dz)`. Confirmed by
   `src/scene/snapMath.ts:43-48`: the `+X` face centre is `x: length`, the `-X` face centre is `x: 0`.
   Assuming `±length/2` offsets every fit by half a board.

2. **A cylinder's local box is *not* the same shape.** `CylinderPart.position` is the base-circle
   centre and the local origin lies on the axis (`src/scene/types.ts:99`), so it is centred in x/y but
   corner-origin in z: `x,y ∈ [-diameter/2, +diameter/2]`, `z ∈ [0, length]`. `Part` is a union of
   `BoardPart | CylinderPart` — both must be handled.

3. **Fitting to the vertical FOV alone overflows sideways.** The horizontal half-angle is
   `atan(aspect · tan(fov/2))`. At aspect 1.5 that is 31.9°, not 22.5°. Both constraints must be
   satisfied and the larger distance wins.

Cuts are deliberately ignored: every cut is subtractive within the part's box, so the box AABB is a
correct outer bound. This is why `Home` works before OCCT has finished building meshes.

Run the full check suite before every commit:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## File Structure

| File | Responsibility |
|---|---|
| `src/scene/fitCamera.ts` | **new.** Pure math: `worldBounds`, `fitDirection`, `fitCameraToParts`, and the three constants. No React, no THREE. |
| `src/scene/fitCamera.test.ts` | **new.** Unit tests for all of the above. |
| `src/render/viewport.tsx` | Accepts a `fitRequest` nonce; on change, calls the module and applies the result to `controls`. |
| `src/App.tsx` | `Home` in the existing keydown handler increments `fitRequest`. |
| `src/App.test.tsx` | Widen the `Viewport` mock to capture props; two tests. |
| `docs/keyboard-shortcuts.md` | Document `Home`. |
| `docs/superpowers/notes/2026-08-16-zoom-to-fit-notes.md` | **new.** Living notes, required by CLAUDE.md. |
| `project-structure.html` | New module row in the `src/scene/` table. |

`worldBounds` and `fitDirection` are exported alongside `fitCameraToParts` so each can be tested in
isolation, following the way `suggestJoints.ts` exports `pairIdsOf` and `groupSuggestions.ts` exports
`orientationArrow`.

---

### Task 1: `worldBounds` — the world AABB of the visible boards

**Files:**
- Create: `src/scene/fitCamera.ts`
- Test: `src/scene/fitCamera.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/fitCamera.test.ts`:

```ts
import { test, expect } from 'vitest'
import type { BoardPart } from './types'
import { worldBounds } from './fitCamera'

const board = (over: Partial<BoardPart> = {}): BoardPart => ({
  kind: 'board',
  id: 'p1',
  label: 'Board',
  length: 200,
  width: 100,
  thickness: 25,
  material: '',
  color: '#ffffff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  ...over,
})

// The local box runs (0,0,0)..(length,width,thickness) because geometry is built by
// BRepPrimAPI_MakeBox_1. A centred-box assumption puts this at ±half and fails here.
test('a board at the origin spans [0..length] x [0..width] x [0..thickness]', () => {
  const b = worldBounds([board()])
  expect(b).not.toBeNull()
  expect(b!.min).toEqual({ x: 0, y: 0, z: 0 })
  expect(b!.max).toEqual({ x: 200, y: 100, z: 25 })
})

test('bounds cover every part', () => {
  const b = worldBounds([board({ id: 'a' }), board({ id: 'b', position: { x: 500, y: 0, z: 0 } })])
  expect(b!.min.x).toBe(0)
  expect(b!.max.x).toBe(700)
})

test('hidden parts are excluded', () => {
  const b = worldBounds([
    board({ id: 'a' }),
    board({ id: 'b', position: { x: 500, y: 0, z: 0 }, visible: false }),
  ])
  expect(b!.max.x).toBe(200)
})

test('returns null when there is nothing visible', () => {
  expect(worldBounds([])).toBeNull()
  expect(worldBounds([board({ visible: false })])).toBeNull()
})

// Rotation must go through composeWorldMatrix, not be ignored. A 45° yaw about Z sends the far corner
// of the 200×100 footprint to y ≈ 212; ignoring rotation would leave max.y at 100. (max.x actually
// shrinks to ≈141 under this rotation, so it is the wrong axis to assert on.)
test('rotation is honoured', () => {
  const b = worldBounds([board({ rotation: { x: 0, y: 0, z: 45 } })])
  expect(b!.max.y).toBeGreaterThan(200)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/fitCamera.test.ts`
Expected: FAIL — `Failed to resolve import "./fitCamera"`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/scene/fitCamera.ts`:

```ts
import type { Part, Vec3 } from './types'
import { composeWorldMatrix, applyMatrixToPoint } from '../geom/transform'

export interface Bounds {
  min: Vec3
  max: Vec3
}

function localBox(part: Part): Bounds {
  return {
    min: { x: 0, y: 0, z: 0 },
    max: { x: part.length, y: part.width, z: part.thickness },
  }
}

export function worldBounds(parts: Part[]): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  let found = false

  for (const part of parts) {
    if (!part.visible) continue
    found = true
    const m = composeWorldMatrix(part)
    const { min, max } = localBox(part)
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          const [wx, wy, wz] = applyMatrixToPoint(m, x, y, z)
          if (wx < minX) minX = wx
          if (wy < minY) minY = wy
          if (wz < minZ) minZ = wz
          if (wx > maxX) maxX = wx
          if (wy > maxY) maxY = wy
          if (wz > maxZ) maxZ = wz
        }
      }
    }
  }

  if (!found) return null
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}
```

Note `localBox` currently reads `part.length` / `part.width` / `part.thickness` unconditionally. That
does not typecheck against `CylinderPart`, which has no `width` or `thickness` — Task 2 fixes it. If
`pnpm typecheck` is run now it will fail on that line; that is expected and is the point of Task 2.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/fitCamera.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/fitCamera.ts src/scene/fitCamera.test.ts
git commit -m "feat(scene): worldBounds computes the world AABB of the visible parts"
```

---

### Task 2: Handle the cylinder kind

`Part` is `BoardPart | CylinderPart`. Task 1's `localBox` only describes a board and does not compile
against the union.

**Files:**
- Modify: `src/scene/fitCamera.ts`
- Test: `src/scene/fitCamera.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the type import at the top of `src/scene/fitCamera.test.ts`:

```ts
import type { BoardPart, CylinderPart, Part } from './types'
```

Append to the same file:

```ts
const cylinder = (over: Partial<CylinderPart> = {}): CylinderPart => ({
  kind: 'cylinder',
  id: 'd1',
  label: 'Dowel',
  diameter: 8,
  length: 40,
  material: '',
  color: '#ffffff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
  ...over,
})

// A dowel's local origin lies on its axis at the base circle: centred in x/y, corner-origin in z.
test('a cylinder is centred in x/y and corner-origin in z', () => {
  const b = worldBounds([cylinder()])
  expect(b!.min).toEqual({ x: -4, y: -4, z: 0 })
  expect(b!.max).toEqual({ x: 4, y: 4, z: 40 })
})

// The never guard is what forces a future part kind to be classified deliberately instead of being
// silently measured with board fields. Reaching it requires defeating the type system, which is the point.
test('an unknown part kind throws rather than being silently mismeasured', () => {
  const bogus = { ...board(), kind: 'sphere' } as unknown as Part
  expect(() => worldBounds([bogus])).toThrow(/unhandled part kind/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/fitCamera.test.ts`
Expected: FAIL — two failures. The cylinder is measured with board fields, so `min`/`max` come back
with `NaN` components (`part.width` and `part.thickness` are `undefined` on a cylinder); and the
unknown kind returns `NaN` bounds instead of throwing, because Task 1's `localBox` has no switch.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/fitCamera.ts`, replace the whole `localBox` function with:

```ts
// The local axis-aligned box of a part, in its own coordinates. The two kinds genuinely differ:
// a board is corner-origin on all three axes (BRepPrimAPI_MakeBox_1 spans 0..d, per snapMath.ts:43-48),
// while a cylinder's local origin lies on the axis at the base circle, so it is centred in x/y but
// corner-origin in z.
function localBox(part: Part): Bounds {
  switch (part.kind) {
    case 'board':
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: part.length, y: part.width, z: part.thickness },
      }
    case 'cylinder': {
      const r = part.diameter / 2
      return { min: { x: -r, y: -r, z: 0 }, max: { x: r, y: r, z: part.length } }
    }
    default: {
      const _exhaustive: never = part
      throw new Error(`unhandled part kind: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/fitCamera.test.ts`
Expected: PASS — 7 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass. Typecheck now succeeds because `localBox` narrows on `part.kind`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/fitCamera.ts src/scene/fitCamera.test.ts
git commit -m "feat(scene): worldBounds handles the cylinder part kind"
```

---

### Task 3: `fitDirection` — preserve the bearing, with the degenerate guard

**Files:**
- Modify: `src/scene/fitCamera.ts`
- Test: `src/scene/fitCamera.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the value import at the top of `src/scene/fitCamera.test.ts`:

```ts
import { worldBounds, fitDirection, CANONICAL_DIR } from './fitCamera'
```

Append to the same file:

```ts
test('preserves the current bearing as a unit vector', () => {
  const d = fitDirection({ position: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 } })
  expect(d).toEqual({ x: 0, y: 0, z: 1 })
})

test('the bearing is measured from target to position, not from the origin', () => {
  const d = fitDirection({ position: { x: 100, y: 0, z: 0 }, target: { x: 90, y: 0, z: 0 } })
  expect(d).toEqual({ x: 1, y: 0, z: 0 })
})

// useFile restores camera position and target verbatim from the .zimmu file, so a file carrying
// equal position and target is reachable input. There is no bearing to preserve; use the canonical one.
test('falls back to the canonical bearing when position equals target', () => {
  const d = fitDirection({ position: { x: 5, y: 5, z: 5 }, target: { x: 5, y: 5, z: 5 } })
  const len = Math.hypot(CANONICAL_DIR.x, CANONICAL_DIR.y, CANONICAL_DIR.z)
  expect(d.x).toBeCloseTo(CANONICAL_DIR.x / len, 10)
  expect(d.y).toBeCloseTo(CANONICAL_DIR.y / len, 10)
  expect(d.z).toBeCloseTo(CANONICAL_DIR.z / len, 10)
})

test('the returned bearing is always unit length', () => {
  const d = fitDirection({ position: { x: 3, y: 4, z: 12 }, target: { x: 0, y: 0, z: 0 } })
  expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/fitCamera.test.ts`
Expected: FAIL — `fitDirection` and `CANONICAL_DIR` are not exported, so the import errors.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/fitCamera.ts`, extend the type import to carry `CameraState`:

```ts
import type { CameraState, Part, Vec3 } from './types'
```

Add above `Bounds`:

```ts
// The app's opening view direction (viewport.tsx:200). Used only when the current camera has no
// bearing to preserve.
export const CANONICAL_DIR: Vec3 = { x: 250, y: -200, z: 150 }

const EPS = 1e-9

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const length = (a: Vec3): number => Math.sqrt(dot(a, a))
```

Add only these four. `add` and `cross` arrive in Task 4, which is where they are first used —
`noUnusedLocals` reports unexported module-scope declarations that are never read, so introducing them
early would fail `pnpm typecheck` at Step 5.

Add after `worldBounds`:

```ts
// The unit vector pointing from the target toward the camera — the bearing a fit preserves.
export function fitDirection(current: CameraState): Vec3 {
  const raw = sub(current.position, current.target)
  const l = length(raw)
  if (l > EPS) return scale(raw, 1 / l)
  return scale(CANONICAL_DIR, 1 / length(CANONICAL_DIR))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/fitCamera.test.ts`
Expected: PASS — 11 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass. Every helper added in Step 3 is reachable from `fitDirection`, so `noUnusedLocals`
has nothing to report.

- [ ] **Step 6: Commit**

```bash
git add src/scene/fitCamera.ts src/scene/fitCamera.test.ts
git commit -m "feat(scene): fitDirection preserves the camera bearing, with a degenerate guard"
```

---

### Task 4: `fitCameraToParts` — the distance that frames the bounds

**Files:**
- Modify: `src/scene/fitCamera.ts`
- Test: `src/scene/fitCamera.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the imports at the top of `src/scene/fitCamera.test.ts`:

```ts
import type { BoardPart, CameraState, CylinderPart, Part, Vec3 } from './types'
import {
  worldBounds,
  fitDirection,
  fitCameraToParts,
  CANONICAL_DIR,
  FIT_MARGIN,
  MIN_FIT_DISTANCE,
} from './fitCamera'
```

Append to the same file. The helper below is an **independent containment check**: the production code
solves for a distance, this verifies the resulting camera actually contains every corner, which is a
different computation and so is a real check rather than a restatement.

```ts
const ISO: CameraState = {
  position: { x: 250, y: -200, z: 150 },
  target: { x: 0, y: 0, z: 0 },
}

function cornersOf(min: Vec3, max: Vec3): Vec3[] {
  const out: Vec3[] = []
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) out.push({ x, y, z })
    }
  }
  return out
}

// Largest |lateral| / (depth * tan(half-angle)) over every corner. <= 1 means everything is in frame.
function worstOverflow(cam: CameraState, parts: Part[], aspect: number, fovDeg: number): number {
  const b = worldBounds(parts)!
  const d = fitDirection(cam)
  const f = { x: -d.x, y: -d.y, z: -d.z }
  const xp = (a: Vec3, c: Vec3): Vec3 => ({
    x: a.y * c.z - a.z * c.y,
    y: a.z * c.x - a.x * c.z,
    z: a.x * c.y - a.y * c.x,
  })
  let r = xp(f, { x: 0, y: 0, z: 1 })
  if (Math.hypot(r.x, r.y, r.z) < 1e-9) r = xp(f, { x: 0, y: 1, z: 0 })
  const rl = Math.hypot(r.x, r.y, r.z)
  r = { x: r.x / rl, y: r.y / rl, z: r.z / rl }
  const u = xp(r, f)
  const tanV = Math.tan(((fovDeg * Math.PI) / 180) / 2)
  const tanH = aspect * tanV
  let worst = 0
  for (const c of cornersOf(b.min, b.max)) {
    const v = { x: c.x - cam.position.x, y: c.y - cam.position.y, z: c.z - cam.position.z }
    const depth = v.x * f.x + v.y * f.y + v.z * f.z
    const lat = Math.abs(v.x * r.x + v.y * r.y + v.z * r.z)
    const vert = Math.abs(v.x * u.x + v.y * u.y + v.z * u.z)
    worst = Math.max(worst, lat / (depth * tanH), vert / (depth * tanV))
  }
  return worst
}

const distanceOf = (c: CameraState): number =>
  Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z)

test('returns null when there is nothing to frame', () => {
  expect(fitCameraToParts([], 1.5, 45, ISO)).toBeNull()
  expect(fitCameraToParts([board({ visible: false })], 1.5, 45, ISO)).toBeNull()
})

test('targets the centre of the bounds', () => {
  const parts = [board({ id: 'a' }), board({ id: 'b', position: { x: 500, y: 0, z: 0 } })]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  expect(cam.target).toEqual({ x: 350, y: 50, z: 12.5 })
})

test('keeps the current bearing', () => {
  const parts = [board()]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  const before = fitDirection(ISO)
  const after = fitDirection(cam)
  expect(after.x).toBeCloseTo(before.x, 10)
  expect(after.y).toBeCloseTo(before.y, 10)
  expect(after.z).toBeCloseTo(before.z, 10)
})

// The property that makes the result correct rather than merely plausible.
test('every corner is inside the frustum after fitting', () => {
  const parts = [board({ length: 2400, width: 100, thickness: 20 })]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  expect(worstOverflow(cam, parts, 1.5, 45)).toBeLessThanOrEqual(1)
})

// Without this, a distance of 1e6 would pass the previous test. Together they pin the fit as tight.
test('the fit is tight — pulling in past the margin overflows', () => {
  const parts = [board({ length: 2400, width: 100, thickness: 20 })]
  const cam = fitCameraToParts(parts, 1.5, 45, ISO)!
  const d = fitDirection(cam)
  const closer = distanceOf(cam) / FIT_MARGIN - 1
  const pulled: CameraState = {
    position: {
      x: cam.target.x + d.x * closer,
      y: cam.target.y + d.y * closer,
      z: cam.target.z + d.z * closer,
    },
    target: cam.target,
  }
  expect(worstOverflow(pulled, parts, 1.5, 45)).toBeGreaterThan(1)
})

// A wide, short scene on a wide viewport is limited by the horizontal half-angle, not the vertical.
test('the horizontal FOV constrains a wide scene', () => {
  const parts = [board({ length: 2400, width: 100, thickness: 20 })]
  const wide = fitCameraToParts(parts, 3, 45, ISO)!
  const narrow = fitCameraToParts(parts, 0.5, 45, ISO)!
  expect(distanceOf(wide)).toBeLessThan(distanceOf(narrow))
  expect(worstOverflow(wide, parts, 3, 45)).toBeLessThanOrEqual(1)
  expect(worstOverflow(narrow, parts, 0.5, 45)).toBeLessThanOrEqual(1)
})

// Orbiting dead top-down makes f parallel to up, collapsing cross(f, up) to zero. This is a second,
// distinct degeneracy — the fitDirection guard does not cover it.
test('a top-down bearing still produces a finite camera', () => {
  const topDown: CameraState = { position: { x: 0, y: 0, z: 500 }, target: { x: 0, y: 0, z: 0 } }
  const parts = [board()]
  const cam = fitCameraToParts(parts, 1.5, 45, topDown)!
  expect(Number.isFinite(cam.position.x)).toBe(true)
  expect(Number.isFinite(cam.position.y)).toBe(true)
  expect(Number.isFinite(cam.position.z)).toBe(true)
  expect(worstOverflow(cam, parts, 1.5, 45)).toBeLessThanOrEqual(1)
})

// A part mid-edit at 0 mm gives a degenerate AABB; without a floor the camera would land on the
// target and leave OrbitControls with a zero-length offset.
test('zero-extent bounds floor at MIN_FIT_DISTANCE', () => {
  const cam = fitCameraToParts([board({ length: 0, width: 0, thickness: 0 })], 1.5, 45, ISO)!
  expect(distanceOf(cam)).toBeCloseTo(MIN_FIT_DISTANCE, 10)
})

test('a non-finite aspect is treated as 1', () => {
  const parts = [board()]
  const nan = fitCameraToParts(parts, Number.NaN, 45, ISO)!
  const one = fitCameraToParts(parts, 1, 45, ISO)!
  expect(nan.position.x).toBeCloseTo(one.position.x, 10)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/fitCamera.test.ts`
Expected: FAIL — `fitCameraToParts`, `FIT_MARGIN` and `MIN_FIT_DISTANCE` are not exported, so the
import errors.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/fitCamera.ts`, add beside `CANONICAL_DIR`:

```ts
// Breathing room so the design is not flush against the viewport edge.
export const FIT_MARGIN = 1.05

// Floor on the camera-to-target distance. A part mid-edit at 0 mm gives a degenerate AABB, and a
// zero distance would put the camera on the target, leaving OrbitControls with a zero-length offset.
export const MIN_FIT_DISTANCE = 1

const DEG2RAD = Math.PI / 180
```

Add the two remaining vector helpers beside the four from Task 3:

```ts
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
```

Append to the end of the file:

```ts
// The right vector for a view direction. cross(f, +Z) collapses when the camera looks straight down
// or straight up, which is reachable by orbiting; +Y is a valid substitute there because f is then
// parallel to Z.
function rightVector(f: Vec3): Vec3 {
  const primary = cross(f, { x: 0, y: 0, z: 1 })
  const l = length(primary)
  if (l > EPS) return scale(primary, 1 / l)
  const fallback = cross(f, { x: 0, y: 1, z: 0 })
  return scale(fallback, 1 / length(fallback))
}

export function fitCameraToParts(
  parts: Part[],
  aspect: number,
  fovDeg: number,
  current: CameraState,
): CameraState | null {
  const bounds = worldBounds(parts)
  if (bounds === null) return null

  const centre: Vec3 = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }

  const d = fitDirection(current)
  const f = scale(d, -1)
  const r = rightVector(f)
  const u = cross(r, f)

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const tanV = Math.tan((fovDeg * DEG2RAD) / 2)
  const tanH = safeAspect * tanV

  // For a corner offset e from the centre, a camera at centre + d·t sees it at depth (t - e·d) with
  // lateral offset e·r. Keeping |e·r| <= depth·tanH rearranges to the bound below; same for e·u.
  let t = 0
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const e = sub({ x, y, z }, centre)
        const along = dot(e, d)
        t = Math.max(t, Math.abs(dot(e, r)) / tanH + along, Math.abs(dot(e, u)) / tanV + along)
      }
    }
  }

  const distance = Math.max(t * FIT_MARGIN, MIN_FIT_DISTANCE)
  return { position: add(centre, scale(d, distance)), target: centre }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/fitCamera.test.ts`
Expected: PASS — 20 passed.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass; test count up by 20.

- [ ] **Step 6: Commit**

```bash
git add src/scene/fitCamera.ts src/scene/fitCamera.test.ts
git commit -m "feat(scene): fitCameraToParts frames the visible parts against both FOV axes"
```

---

### Task 5: Apply the fit in the viewport

The viewport owns `camera.aspect` and `camera.fov`, so it performs the fit. It already holds the
`parts` prop and refs to the camera and controls.

**Files:**
- Modify: `src/render/viewport.tsx`

- [ ] **Step 1: Add the prop**

In the props interface, immediately after `loadedCamera: CameraState | null` (line 21), add:

```tsx
  fitRequest: number
```

In the component's destructured parameter list, add `fitRequest,` immediately after `loadedCamera,`
(line 54).

- [ ] **Step 2: Add the import**

Add to the imports at the top of the file:

```tsx
import { fitCameraToParts } from '../scene/fitCamera'
```

- [ ] **Step 3: Add the effect**

Insert immediately after the camera-restore effect that ends at line 425 (`}, [loadedCamera])`):

```tsx
  // Frame every visible part. Deliberately keyed on fitRequest alone: parts, camera and controls are
  // read at fire time, and re-running whenever they change would move the camera unbidden. The nonce
  // is a counter rather than a boolean so a second Home press fires again.
  useEffect(() => {
    if (fitRequest === 0) return
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const next = fitCameraToParts(parts, camera.aspect, camera.fov, {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    })
    if (!next) return
    camera.position.set(next.position.x, next.position.y, next.position.z)
    controls.target.set(next.target.x, next.target.y, next.target.z)
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest])
```

- [ ] **Step 4: Verify it does not yet compile**

Run: `pnpm typecheck`
Expected: FAIL — `App.tsx` does not yet pass `fitRequest`, so the `<Viewport>` element errors with
"Property 'fitRequest' is missing". Task 6 supplies it. Do not commit yet; Tasks 5 and 6 land
together in Task 6's commit.

---

### Task 6: Bind `Home` in App

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/App.test.tsx`, replace the Viewport mock at lines 78-80:

```tsx
vi.mock('./render/viewport', () => ({
  Viewport: () => null,
}))
```

with a version that captures the prop. `vi.hoisted` is required — `vi.mock` is hoisted above the
imports, so a plain `let` referenced inside the factory would throw "Cannot access before
initialization":

```tsx
const viewportSpy = vi.hoisted(() => ({ fitRequest: 0 }))

vi.mock('./render/viewport', () => ({
  Viewport: (props: { fitRequest: number }) => {
    viewportSpy.fitRequest = props.fitRequest
    return null
  },
}))
```

Append these tests inside the existing `describe('App keyboard shortcuts', ...)` block:

```tsx
  it('Home requests a camera fit', async () => {
    render(<App />)
    await act(async () => {})
    const before = viewportSpy.fitRequest
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(viewportSpy.fitRequest).toBe(before + 1)
  })

  it('Home inside a text input does not request a fit', async () => {
    render(<App />)
    await act(async () => {})
    const before = viewportSpy.fitRequest
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(viewportSpy.fitRequest).toBe(before)
    input.remove()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/App.test.tsx -t "Home"`
Expected: FAIL — `expected 0 to be 1`. The key is not bound yet.

- [ ] **Step 3: Write the minimal implementation**

In `src/App.tsx`, add the state next to `loadedCamera` (line 136):

```tsx
  const [fitRequest, setFitRequest] = useState(0)
```

In the keydown handler's non-modifier branch, add immediately before the `if (e.key === 'Escape')`
check at line 225:

```tsx
        if (e.key === 'Home') {
          e.preventDefault()
          setFitRequest((n) => n + 1)
          return
        }
```

Pass the prop to `Viewport`, immediately after `loadedCamera={loadedCamera}` (line 351):

```tsx
          fitRequest={fitRequest}
```

The keydown effect's dependency array needs no change: `setFitRequest` is a `useState` setter, whose
identity React guarantees to be stable and which `react-hooks/exhaustive-deps` does not require.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/App.test.tsx`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass. Typecheck now succeeds because `fitRequest` is supplied.

- [ ] **Step 6: Commit**

```bash
git add src/render/viewport.tsx src/App.tsx src/App.test.tsx
git commit -m "feat(ui): Home frames every visible part in the viewport"
```

---

### Task 7: Verify in the browser

The unit tests use synthetic fixtures and never construct a real camera. This confirms the wiring
against the live app, and checks the two claims in the spec that were arithmetic rather than
observation.

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Open `http://localhost:5173` in Chrome. Wait for the OCCT WASM to boot — `+ Board` becomes enabled.

- [ ] **Step 2: Reproduce the problem**

Click `+ Board`. Select it and set Length `800`, Width `600`, Thickness `720` — a stand-in for the
carcase bounding box, which is what the framing actually depends on.

Expected: the board fills or overruns the viewport, and you are looking at it from inside or nearly
inside. This is the spec's "the session begins with the camera inside the cabinet", confirmed rather
than inferred. **If it looks comfortably framed instead, the spec's premise is wrong — record that in
the notes rather than proceeding as if it held.**

- [ ] **Step 3: Fit**

Press `Home`.

Expected: the whole box is in frame with a small margin, seen from the same direction as before —
nothing rotates.

- [ ] **Step 4: Check the bearing is preserved**

Orbit to a different angle, then press `Home` again.

Expected: the framing tightens but the viewing angle is unchanged.

- [ ] **Step 5: Check the long-board case**

Set Length `2400`, Width `100`, Thickness `20`. Press `Home`.

Expected: the board spans most of the viewport width. If it occupies roughly two thirds, the
horizontal constraint is not being applied and Task 4's `tanH` is wrong.

- [ ] **Step 6: Check the guards**

Press `H` to hide the only part, then press `Home`.
Expected: the camera does not move — `fitCameraToParts` returned `null`.

Click into a dimension field, put the caret mid-number, and press `Home`.
Expected: the caret jumps to the start of the field and the camera does not move.

- [ ] **Step 7: Record the result**

Create `docs/superpowers/notes/2026-08-16-zoom-to-fit-notes.md`:

```markdown
# Zoom to Fit — Implementation Notes

Living notes for `docs/superpowers/specs/2026-08-16-zoom-to-fit-design.md`.

## 2026-08-16 — shipped

- `Home` frames every visible part. The math is a pure module, `src/scene/fitCamera.ts`; `App.tsx`
  owns the intent and `viewport.tsx` owns the camera mechanics, because `camera.aspect` is a
  viewport-owned fact derived from the mount's client size.
- **The corner-origin box is the trap.** A board's local box is `(0,0,0)..(length,width,thickness)`,
  not centred — `BRepPrimAPI_MakeBox_1` spans `0..d`. A cylinder is different again: centred in x/y,
  corner-origin in z. There is a dedicated test for each, because a centred-box assumption offsets
  every fit by half a part and still looks approximately right.
- **Two distinct degeneracies, not one.** `position === target` leaves no bearing to preserve, and a
  dead top-down bearing collapses `cross(f, up)`. The second is not covered by a guard for the first,
  and is the easier one to miss because orbiting reaches it.
- **The tightness test earns its place.** "Every corner is inside the frustum" passes for any absurdly
  large distance; it is only meaningful paired with "pulling in past the margin overflows".

## Verified in the browser

<!-- Replace with what was actually observed in Task 7, including anything that differed from the spec. -->
```

Fill in the "Verified in the browser" section with what actually happened. If any step differed from
its expectation, record the difference rather than the expectation.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/notes/2026-08-16-zoom-to-fit-notes.md
git commit -m "docs: record zoom-to-fit implementation notes"
```

---

### Task 8: Update the reference docs

**Files:**
- Modify: `docs/keyboard-shortcuts.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Document the shortcut**

In `docs/keyboard-shortcuts.md`, add this row to the "Non-modifier" table, immediately after the
`Escape` row:

```markdown
| `Home` | Frame all visible parts | Keeps the current view direction; no-op when nothing is visible |
```

- [ ] **Step 2: Add the module to the structure reference**

Run: `grep -n "snapMath.ts" project-structure.html`
Expected: a hit inside the `src/scene/` table.

Insert this row immediately after the `snapMath.ts` row:

```html
          <tr><td><code>fitCamera.ts</code></td><td>Pure camera framing for the <code>Home</code> key: <code>worldBounds</code> builds the world AABB of the visible parts, <code>fitDirection</code> preserves the current bearing, and <code>fitCameraToParts</code> solves the distance that satisfies both FOV half-angles.</td></tr>
```

- [ ] **Step 3: Verify**

Run: `grep -n "fitCamera" project-structure.html`
Expected: one match.

- [ ] **Step 4: Run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/keyboard-shortcuts.md project-structure.html
git commit -m "docs: document the Home fit shortcut and the fitCamera module"
```

---

## Done when

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all pass
- [ ] `Home` frames every visible part, keeping the current view direction
- [ ] A 2400 mm board spans most of the viewport width, not two thirds of it
- [ ] `Home` is a no-op when nothing is visible, and moves the caret rather than the camera inside an input
- [ ] Hidden parts are excluded from the bounds
- [ ] Both degeneracies are guarded: `position === target`, and a dead top-down bearing
- [ ] `docs/keyboard-shortcuts.md`, the notes file and `project-structure.html` are updated
