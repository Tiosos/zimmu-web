# Rotation Snap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend face-to-face snap so clicking any two faces on different parts rotates the source part to face the target and translates it to touch — not just anti-parallel face pairs.

**Architecture:** Add `computeSnapTransform` to `snapMath.ts` (pure function: input faces + source part → new absolute position + rotation in degrees); replace `computeSnapDelta` call in `useSnap.ts` with `computeSnapTransform`, removing the anti-parallel guards; update the ghost mesh in `viewport.tsx` to apply rotation as well as position.

**Tech Stack:** TypeScript strict mode, Three.js quaternion math (already imported in snapMath.ts), Vitest + happy-dom

---

## File Map

| File | Change |
|---|---|
| `src/scene/snapMath.ts` | Add private `localNormalToFaceString` helper; add exported `computeSnapTransform` |
| `src/scene/snapMath.test.ts` | Add `import * as THREE from 'three'`; add `TARGET` fixture; add `expectSnapped` helper; add 3 new test cases for `computeSnapTransform` |
| `src/scene/useSnap.ts` | Replace `computeSnapDelta` import with `computeSnapTransform`; delete `dot` and `vecLen` helpers; remove anti-parallel guard from `onFaceClick`; replace snap logic block; remove anti-parallel guard from `onFaceHover` |
| `src/render/viewport.tsx` | Change import `computeSnapDelta` → `computeSnapTransform` (line 7); replace ghost mesh position block (lines 499–508) to set both position and rotation |

`computeSnapDelta` is **not changed** — its existing tests must stay green.

---

### Task 1: Add `computeSnapTransform` to `snapMath.ts` with tests

**Files:**
- Modify: `src/scene/snapMath.ts`
- Modify: `src/scene/snapMath.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `src/scene/snapMath.test.ts`. Add these changes — do NOT remove any existing code.

First, add the THREE import at line 1 (before all existing imports):

```ts
import * as THREE from 'three'
```

Then add `computeSnapTransform` and `computeSnapDelta` to the existing import line (line 2):

```ts
import {
  computeSnapDelta,
  computeSnapTransform,
  computeFaceCorners,
  computeLocalFaceCenter,
  faceAxes,
  defaultCutSize,
} from './snapMath'
```

After the existing `BOARD` fixture (around line 44), add:

```ts
const TARGET: BoardPart = {
  ...BOARD,
  id: 'b2',
  label: 'Board 2',
  position: { x: 200, y: 0, z: 0 },
}
```

After all existing `describe` blocks, append a new `describe` block:

```ts
describe('computeSnapTransform', () => {
  function expectSnapped(
    result: { position: Vec3; rotation: Vec3 },
    sourceFace: FaceHit,
    targetFaceCenter: Vec3,
    targetFaceNormal: Vec3,
    sourcePart: BoardPart,
  ) {
    // Invariant 1: source face centre coincides with target face centre after transform
    const snappedPart: BoardPart = { ...sourcePart, position: result.position, rotation: result.rotation }
    const corners = computeFaceCorners(sourceFace, snappedPart)
    const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
    const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
    const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4
    expect(cx).toBeCloseTo(targetFaceCenter.x, 3)
    expect(cy).toBeCloseTo(targetFaceCenter.y, 3)
    expect(cz).toBeCloseTo(targetFaceCenter.z, 3)

    // Invariant 2: source face normal is anti-parallel to target face normal after transform
    const DEG2RAD = Math.PI / 180
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        result.rotation.x * DEG2RAD,
        result.rotation.y * DEG2RAD,
        result.rotation.z * DEG2RAD,
        'XYZ',
      ),
    )
    const ln = new THREE.Vector3(
      sourceFace.localFaceNormal.x,
      sourceFace.localFaceNormal.y,
      sourceFace.localFaceNormal.z,
    ).applyQuaternion(q)
    const dotNormals = ln.dot(new THREE.Vector3(targetFaceNormal.x, targetFaceNormal.y, targetFaceNormal.z))
    expect(dotNormals).toBeCloseTo(-1, 3)
  }

  it('90° alignment: source +X to target +Y — rotates -90° around Z, faces flush', () => {
    // BOARD at (0,0,0) 100×50×25mm. +X face centre is at (100, 25, 12.5).
    // Target at (200,0,0), +Y face centre at (250, 50, 12.5).
    // Q_normal rotates +X → -Y (anti-parallel to +Y), which is -90° around Z.
    // After rotation the +X local face maps to world: center at (0,0,0)+rotation applied to (100,25,12.5).
    // At -90° Z: x→y, y→-x. Local centre (100,25,12.5) → world (25,-100,12.5) before translation.
    // newPosition = (0,0,0) + (250,50,12.5) - (25,-100,12.5) = (225,150,0).
    const srcFace: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 1, y: 0, z: 0 },
      localFaceNormal: { x: 1, y: 0, z: 0 },
      faceCenter: { x: 100, y: 25, z: 12.5 },
      localHitPoint: { x: 0, y: 0, z: 0 },
    }
    const tgtFace: FaceHit = {
      partId: 'b2',
      faceNormal: { x: 0, y: 1, z: 0 },
      localFaceNormal: { x: 0, y: 1, z: 0 },
      faceCenter: { x: 250, y: 50, z: 12.5 },
      localHitPoint: { x: 0, y: 0, z: 0 },
    }
    const result = computeSnapTransform(srcFace, tgtFace, BOARD)

    expect(result.rotation.x).toBeCloseTo(0, 3)
    expect(result.rotation.y).toBeCloseTo(0, 3)
    expect(result.rotation.z).toBeCloseTo(-90, 3)

    expect(result.position.x).toBeCloseTo(225, 3)
    expect(result.position.y).toBeCloseTo(150, 3)
    expect(result.position.z).toBeCloseTo(0, 3)

    expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
  })

  it('180° flip: source +Z to target +Z — flips 180°, faces flush', () => {
    // Euler decomposition for a 180° flip is not unique, so only assert geometric invariants.
    const srcFace: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 50, y: 25, z: 25 },
      localHitPoint: { x: 0, y: 0, z: 0 },
    }
    const tgtFace: FaceHit = {
      partId: 'b2',
      faceNormal: { x: 0, y: 0, z: 1 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 50, y: 25, z: 125 },
      localHitPoint: { x: 0, y: 0, z: 0 },
    }
    const result = computeSnapTransform(srcFace, tgtFace, BOARD)
    expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
  })

  it('anti-parallel degenerate: source +Z, target -Z — rotation unchanged, position matches computeSnapDelta', () => {
    // Already anti-parallel: Q_normal ≈ identity, roll snap rounds to 0°, rotation stays (0,0,0).
    // Position shifts by the same delta computeSnapDelta returns: (0,0,75).
    const srcFace: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 50, y: 25, z: 25 },
      localHitPoint: { x: 0, y: 0, z: 0 },
    }
    const tgtFace: FaceHit = {
      partId: 'b2',
      faceNormal: { x: 0, y: 0, z: -1 },
      localFaceNormal: { x: 0, y: 0, z: -1 },
      faceCenter: { x: 50, y: 25, z: 100 },
      localHitPoint: { x: 0, y: 0, z: 0 },
    }
    const result = computeSnapTransform(srcFace, tgtFace, BOARD)

    expect(result.rotation.x).toBeCloseTo(0, 3)
    expect(result.rotation.y).toBeCloseTo(0, 3)
    expect(result.rotation.z).toBeCloseTo(0, 3)

    const delta = computeSnapDelta(srcFace, tgtFace)
    expect(result.position.x).toBeCloseTo(BOARD.position.x + delta.x, 3)
    expect(result.position.y).toBeCloseTo(BOARD.position.y + delta.y, 3)
    expect(result.position.z).toBeCloseTo(BOARD.position.z + delta.z, 3)

    expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
  })
})
```

Note: `TARGET` is declared above but not used in these tests — that's intentional (`TARGET` is available for future tests). TypeScript strict mode will flag unused locals. Remove `TARGET` if it causes a lint error, or use it in one of the tests by replacing `'b2'` partIds with `TARGET.id`.

Actually, `TARGET` is declared but not referenced in any test (the `tgtFace` objects inline their own values). **Remove the `TARGET` declaration** — it will trigger `noUnusedLocals`. The fixture is not needed; face data is inlined in each test.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/scene/snapMath.test.ts 2>&1 | tail -20
```

Expected: TypeScript/import error — `computeSnapTransform` is not exported from `'./snapMath'`.

- [ ] **Step 3: Add stub to `snapMath.ts`**

At the end of `src/scene/snapMath.ts`, append:

```ts
function localNormalToFaceString(n: Vec3): CutDef['face'] {
  if (n.x > 0.5) return '+X'
  if (n.x < -0.5) return '-X'
  if (n.y > 0.5) return '+Y'
  if (n.y < -0.5) return '-Y'
  if (n.z > 0.5) return '+Z'
  return '-Z'
}

export function computeSnapTransform(
  _sourceFace: FaceHit,
  _targetFace: FaceHit,
  _sourcePart: BoardPart,
): { position: Vec3; rotation: Vec3 } {
  throw new Error('computeSnapTransform: not implemented')
}
```

- [ ] **Step 4: Run tests to confirm stub makes them reachable but failing**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/scene/snapMath.test.ts 2>&1 | tail -20
```

Expected: Tests in the `computeSnapTransform` describe block fail with "computeSnapTransform: not implemented". All pre-existing tests still pass.

- [ ] **Step 5: Implement `computeSnapTransform`**

Replace the stub function (keep `localNormalToFaceString` as-is) in `src/scene/snapMath.ts`:

```ts
export function computeSnapTransform(
  sourceFace: FaceHit,
  targetFace: FaceHit,
  sourcePart: BoardPart,
): { position: Vec3; rotation: Vec3 } {
  // Step 1: current world rotation as quaternion
  const Q_current = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      sourcePart.rotation.x * DEG2RAD,
      sourcePart.rotation.y * DEG2RAD,
      sourcePart.rotation.z * DEG2RAD,
      sourcePart.rotationOrder,
    ),
  )

  // Step 2: minimum rotation to align source normal with -target normal
  const srcNormal = new THREE.Vector3(
    sourceFace.faceNormal.x,
    sourceFace.faceNormal.y,
    sourceFace.faceNormal.z,
  )
  const negTgt = new THREE.Vector3(
    -targetFace.faceNormal.x,
    -targetFace.faceNormal.y,
    -targetFace.faceNormal.z,
  )
  const Q_normal = new THREE.Quaternion().setFromUnitVectors(srcNormal, negTgt)
  // THREE handles degenerate cases:
  //   srcNormal ≈ negTgt (dot ≈ +1): identity quaternion
  //   srcNormal ≈ -negTgt (dot ≈ -1): 180° flip around arbitrary perpendicular axis

  // Step 3: snap roll to nearest 90°
  // 3a. Find the source face u-axis in world space after applying Q_normal × Q_current
  const { u: uKey } = faceAxes(localNormalToFaceString(sourceFace.localFaceNormal))
  const localU = new THREE.Vector3()
  localU[uKey] = 1
  const worldU = localU.clone().applyQuaternion(
    new THREE.Quaternion().copy(Q_normal).multiply(Q_current),
  )

  // 3b. Project worldU onto the target face plane
  const projected = worldU.clone().addScaledVector(negTgt, -worldU.dot(negTgt))
  if (projected.lengthSq() < 1e-10) {
    const fb = Math.abs(negTgt.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    projected.copy(fb).addScaledVector(negTgt, -fb.dot(negTgt))
  }
  projected.normalize()

  // 3c. The two canonical axes of the target face plane (always ±X/Y/Z per raycaster)
  const WORLD = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]
  const planePair = WORLD.filter((a) => Math.abs(a.dot(negTgt)) < 0.01)
  const axis1 = planePair[0] ?? new THREE.Vector3(1, 0, 0)
  const axis2 = planePair[1] ?? new THREE.Vector3(0, 1, 0)

  // 3d. Measure roll angle and snap to nearest multiple of π/2
  const angle = Math.atan2(projected.dot(axis2), projected.dot(axis1))
  const snapped = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  const Q_roll = new THREE.Quaternion().setFromAxisAngle(negTgt, snapped - angle)

  // 3e. Compose: Q_final = Q_roll × Q_normal × Q_current
  const Q_final = new THREE.Quaternion().copy(Q_roll).multiply(Q_normal).multiply(Q_current)

  // Step 4: convert to Euler degrees
  const euler = new THREE.Euler().setFromQuaternion(Q_final, sourcePart.rotationOrder)
  const newRotation: Vec3 = {
    x: euler.x / DEG2RAD,
    y: euler.y / DEG2RAD,
    z: euler.z / DEG2RAD,
  }

  // Step 5: find new position — compute where source face centre lands at new rotation,
  // then translate so it coincides with target face centre
  const tempPart: BoardPart = { ...sourcePart, rotation: newRotation }
  const corners = computeFaceCorners(sourceFace, tempPart)
  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
  const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4

  const newPosition: Vec3 = {
    x: sourcePart.position.x + targetFace.faceCenter.x - cx,
    y: sourcePart.position.y + targetFace.faceCenter.y - cy,
    z: sourcePart.position.z + targetFace.faceCenter.z - cz,
  }

  return { position: newPosition, rotation: newRotation }
}
```

- [ ] **Step 6: Run full test suite to verify all tests pass**

```bash
cd /home/user/zimmu-web && pnpm vitest run src/scene/snapMath.test.ts 2>&1 | tail -30
```

Expected: All tests pass including the 3 new `computeSnapTransform` tests and all pre-existing tests. Zero failures.

- [ ] **Step 7: Run typecheck and lint**

```bash
cd /home/user/zimmu-web && pnpm typecheck && pnpm lint
```

Expected: Zero errors. If `noUnusedLocals` errors on `TARGET` in the test file, remove the `TARGET` declaration.

- [ ] **Step 8: Commit**

```bash
cd /home/user/zimmu-web && git add src/scene/snapMath.ts src/scene/snapMath.test.ts && git commit -m "feat(snap): add computeSnapTransform — rotation + position snap math"
```

---

### Task 2: Update `useSnap.ts` to use `computeSnapTransform`

**Files:**
- Modify: `src/scene/useSnap.ts`

- [ ] **Step 1: Open the file and understand the current shape**

Read `src/scene/useSnap.ts`. You'll see:
- Line 2: `import { computeSnapDelta } from './snapMath'` — replace with `computeSnapTransform`
- Lines 16–18: `function dot(...)` — DELETE
- Lines 20–22: `function vecLen(...)` — DELETE
- Line 71: `if (dot(sourceFace!.faceNormal, hit.faceNormal) > 0) return` — DELETE
- Lines 73–96: The `computeSnapDelta` block through `onUpdate(...)` — REPLACE
- Lines 119–122: The `if (hit && dot(...) > 0)` hover guard block — DELETE

The `Vec3` import on line 2 is still used by other types; keep it. The same-part guard (`if (hit.partId === sourceFace!.partId) return`) stays.

- [ ] **Step 2: Apply all changes to `useSnap.ts`**

Make these edits (each is a surgical replacement — do not touch surrounding lines):

**2a. Replace import line 2:**
```ts
// BEFORE:
import { computeSnapDelta } from './snapMath'

// AFTER:
import { computeSnapTransform } from './snapMath'
```

**2b. Delete `dot` helper (lines 16–18):**
```ts
// DELETE these lines entirely:
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}
```

**2c. Delete `vecLen` helper (lines 20–22):**
```ts
// DELETE these lines entirely:
function vecLen(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}
```

**2d. Delete anti-parallel guard from `onFaceClick` (the line after the same-part guard):**
```ts
// DELETE:
if (dot(sourceFace!.faceNormal, hit.faceNormal) > 0) return
```

**2e. Replace the snap logic block in `onFaceClick`.**

Find and replace from `const delta = computeSnapDelta(...)` through the end of `onUpdate(...)`:

```ts
// REMOVE this entire block:
const delta = computeSnapDelta(sourceFace!, hit)
if (vecLen(delta) < 0.001) {
  // Already flush — reset to idle without a history entry
  setSourceFace(null)
  setSnapPhase('idle')
  return
}

const src = sourceFace!
const sourceLabel = parts.find((p) => p.id === src.partId)?.label ?? src.partId
const targetLabel = parts.find((p) => p.id === hit.partId)?.label ?? hit.partId

onUpdate(
  src.partId,
  (p) => ({
    ...p,
    position: {
      x: p.position.x + delta.x,
      y: p.position.y + delta.y,
      z: p.position.z + delta.z,
    },
  }),
  `Snap ${sourceLabel} to ${targetLabel}`,
)
```

Replace with:

```ts
const srcFace = sourceFace!
const srcPart = parts.find((p) => p.id === srcFace.partId)
if (!srcPart || srcPart.kind !== 'board') return
const { position, rotation } = computeSnapTransform(srcFace, hit, srcPart)

const noMove =
  Math.abs(position.x - srcPart.position.x) < 0.001 &&
  Math.abs(position.y - srcPart.position.y) < 0.001 &&
  Math.abs(position.z - srcPart.position.z) < 0.001 &&
  Math.abs(rotation.x - srcPart.rotation.x) < 0.001 &&
  Math.abs(rotation.y - srcPart.rotation.y) < 0.001 &&
  Math.abs(rotation.z - srcPart.rotation.z) < 0.001
if (noMove) {
  setSourceFace(null)
  setSnapPhase('idle')
  return
}

const sourceLabel = parts.find((p) => p.id === srcFace.partId)?.label ?? srcFace.partId
const targetLabel = parts.find((p) => p.id === hit.partId)?.label ?? hit.partId
onUpdate(srcFace.partId, (p) => ({ ...p, position, rotation }), `Snap ${sourceLabel} to ${targetLabel}`)
```

**2f. Delete anti-parallel guard from `onFaceHover`.**

Find and delete this block (it's near the end of `onFaceHover`):

```ts
// DELETE:
if (hit && dot(sourceFace!.faceNormal, hit.faceNormal) > 0) {
  setHoveredFace(null)
  return
}
```

The remaining `setHoveredFace(hit)` call stays.

- [ ] **Step 3: Run typecheck and all tests**

```bash
cd /home/user/zimmu-web && pnpm typecheck && pnpm test
```

Expected: Zero TypeScript errors. All tests pass (snapMath.test.ts has no new failures; useSnap has no test file so this just confirms snapMath tests still pass).

- [ ] **Step 4: Commit**

```bash
cd /home/user/zimmu-web && git add src/scene/useSnap.ts && git commit -m "feat(snap): replace computeSnapDelta with computeSnapTransform in useSnap"
```

---

### Task 3: Apply rotation to ghost mesh in `viewport.tsx`

**Files:**
- Modify: `src/render/viewport.tsx`

- [ ] **Step 1: Update the import on line 7**

```ts
// BEFORE (line 7):
import { computeFaceCorners, computeLocalFaceCenter, computeSnapDelta } from '../scene/snapMath'

// AFTER:
import { computeFaceCorners, computeLocalFaceCenter, computeSnapTransform } from '../scene/snapMath'
```

- [ ] **Step 2: Replace the ghost mesh position + rotation block**

Find this block (~lines 499–508 in the ghost mesh `useEffect`):

```ts
const delta = computeSnapDelta(sourceFace, hoveredFace)
const deg2rad = Math.PI / 180
ghost.geometry = geo
ghost.position.set(src.position.x + delta.x, src.position.y + delta.y, src.position.z + delta.z)
ghost.rotation.set(
  src.rotation.x * deg2rad,
  src.rotation.y * deg2rad,
  src.rotation.z * deg2rad,
  src.rotationOrder,
)
```

Replace with:

```ts
const { position, rotation } = computeSnapTransform(sourceFace, hoveredFace, src)
ghost.geometry = geo
ghost.position.set(position.x, position.y, position.z)
ghost.setRotationFromEuler(
  new THREE.Euler(
    rotation.x * THREE.MathUtils.DEG2RAD,
    rotation.y * THREE.MathUtils.DEG2RAD,
    rotation.z * THREE.MathUtils.DEG2RAD,
    src.rotationOrder,
  ),
)
```

Note: `src` is already narrowed to `BoardPart` at this point by the `if (!src || src.kind !== 'board')` guard a few lines above. `computeSnapTransform` is pure (no OCCT, no async) so calling it on every hover frame is safe.

- [ ] **Step 3: Run typecheck**

```bash
cd /home/user/zimmu-web && pnpm typecheck && pnpm lint
```

Expected: Zero errors. The `computeSnapDelta` import is fully removed; `computeSnapTransform` is used in the ghost mesh effect.

- [ ] **Step 4: Run the full test suite one final time**

```bash
cd /home/user/zimmu-web && pnpm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/user/zimmu-web && git add src/render/viewport.tsx && git commit -m "feat(snap): apply rotation to ghost mesh preview via computeSnapTransform"
```

---

## Done

After all three tasks:
- `computeSnapDelta` still exists and its tests are green (unused in snap flow but kept for potential future use)
- `computeSnapTransform` has 3 passing tests covering the 90° rotate, 180° flip, and anti-parallel degenerate cases
- Snap now works for any two faces on different parts (no anti-parallel requirement)
- Ghost mesh shows the rotated preview on hover
- One undo entry per snap (history label unchanged: `Snap A to B`)
