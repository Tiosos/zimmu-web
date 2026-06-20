# Dowel Snap-Align (SP3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing face-to-face snap-align interaction so a dowel (`CylinderPart`) can be snapped into place by one of its flat end caps, bidirectionally (a dowel onto a board face or another dowel's cap, or a board onto a dowel's cap).

**Architecture:** Approach A from the spec — a dedicated pure `computeDowelSnapTransform` in `snapMath.ts` plus kind-routing in `useSnap`; the board path (`computeSnapTransform`, `computeFaceCorners`) is untouched (zero regression). The viewport raycaster's `buildFaceHit` is extended from board-only to also emit `FaceHit`s for dowel caps and lateral surfaces (this also makes SP2's dowel click-to-seed cuts work live). No geometry-kernel / `shapeKey` / worker / OCCT changes — snapping only moves/rotates parts.

**Tech Stack:** React 19, TypeScript (strict), Three.js (math only in `snapMath`; `Mesh`/`matrixWorld` in the viewport), Vitest + happy-dom + @testing-library/react.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/scene/types.ts` | `FaceHit` interface | Add `hitPoint: Vec3` |
| `src/scene/snapMath.ts` | Pure snap math | Add `isSnapFace`, `computeDowelLocalFaceCenter`, `computeDowelSnapTransform` |
| `src/scene/snapMath.test.ts` | Pure-math tests | Add tests for the three new functions + `hitPoint` in fixtures |
| `src/render/viewport.tsx` | Raycaster `FaceHit` emission | Replace non-board early-return with a cylinder branch; add `hitPoint` to board path |
| `src/scene/useSnap.ts` | Snap state machine | Drop board-only guard; gate by `isSnapFace`; route by source kind with `coaxial` flag |
| `src/scene/useSnap.test.ts` | Interaction tests | Add dowel-source, board→dowel, lateral-rejection tests; extend the `snapMath` mock + fixtures |
| `src/scene/useAddCut.test.ts` | Add-cut tests | Add `hitPoint` to FaceHit fixtures (mechanical, to satisfy typecheck) |
| `docs/superpowers/notes/2026-06-20-dowel-snap-align-notes.md` | Living implementation notes | Create |

**Key types already in the codebase (do not redefine):**

```ts
// src/scene/types.ts
export interface Vec3 { x: number; y: number; z: number }
export interface CylinderPart {
  kind: 'cylinder'; id: PartId; label: string
  diameter: number; length: number        // length = extent along local +Z
  material: string; color: string
  position: Vec3                           // base-circle center; local origin lies on the axis (base at z=0)
  rotation: Vec3; rotationOrder: 'XYZ'
  cuts: DowelCut[]; visible: boolean
}
export type Part = BoardPart | CylinderPart
```

---

## Task 1: Add `hitPoint` to `FaceHit` and populate it everywhere

**Files:**
- Modify: `src/scene/types.ts:130-136`
- Modify: `src/render/viewport.tsx:140` (board return path)
- Modify: `src/scene/snapMath.test.ts` (helper builders + inline FaceHit literals)
- Modify: `src/scene/useSnap.test.ts:49-62` (fixtures + mock)
- Modify: `src/scene/useAddCut.test.ts` (FaceHit fixtures)

This is a mechanical type-widening task. `FaceHit.hitPoint` is **required** (not optional), so `pnpm typecheck` will flag every object literal that is missing it — use that as the completion check.

- [ ] **Step 1: Add the field to the interface**

In `src/scene/types.ts`, change the `FaceHit` interface:

```ts
export interface FaceHit {
  partId: PartId
  faceNormal: Vec3
  faceCenter: Vec3
  localFaceNormal: Vec3
  localHitPoint: Vec3
  hitPoint: Vec3 // world-space ray intersection point
}
```

- [ ] **Step 2: Run typecheck to enumerate every construction site that now fails**

Run: `pnpm typecheck`
Expected: FAIL — TS2741 "Property 'hitPoint' is missing" at `src/render/viewport.tsx:140` and at each FaceHit literal in the three test files. This is the to-do list for the next steps.

- [ ] **Step 3: Populate `hitPoint` in the viewport board path**

In `src/render/viewport.tsx`, the board path currently ends:

```ts
    const lhp = intersection.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert())
    const localHitPoint = { x: lhp.x, y: lhp.y, z: lhp.z }
    return { partId, faceNormal, faceCenter, localFaceNormal, localHitPoint }
```

Change the last two lines to add `hitPoint` from the world-space intersection point:

```ts
    const lhp = intersection.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert())
    const localHitPoint = { x: lhp.x, y: lhp.y, z: lhp.z }
    const hitPoint = { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z }
    return { partId, faceNormal, faceCenter, localFaceNormal, localHitPoint, hitPoint }
```

- [ ] **Step 4: Add `hitPoint` to the two FaceHit builders in `snapMath.test.ts`**

In `src/scene/snapMath.test.ts`, the `face()` helper (lines 22-28) — add `hitPoint` mirroring `faceCenter`:

```ts
  return {
    partId,
    faceCenter: { x: cx, y: cy, z: cz },
    faceNormal: { x: nx, y: ny, z: nz },
    localFaceNormal: { x: nx, y: ny, z: nz },
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: cx, y: cy, z: cz },
  }
```

And the `makeFace()` helper (lines 50-56):

```ts
  return {
    partId: 'b1',
    faceNormal: { x: nx, y: ny, z: nz },
    faceCenter: { x: 0, y: 0, z: 0 },
    localFaceNormal: { x: nx, y: ny, z: nz },
    localHitPoint: { x: 0, y: 0, z: 0 },
    hitPoint: { x: 0, y: 0, z: 0 },
  }
```

- [ ] **Step 5: Add `hitPoint` to the inline FaceHit literals in `snapMath.test.ts`**

Several tests build FaceHit objects inline (around lines 213, 242, 268, 428, 435). For each inline literal, add `hitPoint` equal to its `faceCenter` (value is irrelevant to those tests; this just satisfies the type). Re-run `pnpm typecheck` after editing to confirm none remain in this file.

- [ ] **Step 6: Add `hitPoint` to `useSnap.test.ts` fixtures**

In `src/scene/useSnap.test.ts`, `faceOnA` (lines 49-55) and `faceOnB` (lines 56-62) — add `hitPoint` equal to each fixture's `faceCenter`:

```ts
const faceOnA: FaceHit = {
  partId: 'a',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 50, y: 25, z: 25 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 50, y: 25, z: 25 },
}
const faceOnB: FaceHit = {
  partId: 'b',
  faceNormal: { x: 0, y: 0, z: -1 },
  faceCenter: { x: 50, y: 25, z: 200 },
  localFaceNormal: { x: 0, y: 0, z: -1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 50, y: 25, z: 200 },
}
```

- [ ] **Step 7: Add `hitPoint` to `useAddCut.test.ts` fixtures**

In `src/scene/useAddCut.test.ts`, add `hitPoint` (mirroring `faceCenter`, or `{x:0,y:0,z:0}` if no faceCenter is set) to each of the FaceHit literals flagged by typecheck.

- [ ] **Step 8: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no remaining `hitPoint` errors).

- [ ] **Step 9: Verify existing tests still pass (zero regression)**

Run: `pnpm test`
Expected: PASS — all existing suites green. No behavioral change yet.

- [ ] **Step 10: Commit**

```bash
git add src/scene/types.ts src/render/viewport.tsx src/scene/snapMath.test.ts src/scene/useSnap.test.ts src/scene/useAddCut.test.ts
git commit -m "feat(snap): add world hitPoint to FaceHit"
```

---

## Task 2: `isSnapFace` — gate which faces can participate in snapping

**Files:**
- Modify: `src/scene/snapMath.ts` (add export; import `Part` is already imported)
- Test: `src/scene/snapMath.test.ts`

A board snaps by any of its six axis-aligned faces; a dowel snaps **only by a cap** (`|localFaceNormal.z| > 0.9`), never by its curved lateral surface.

- [ ] **Step 1: Write the failing tests**

Append to `src/scene/snapMath.test.ts`. First add `isSnapFace` to the existing import from `./snapMath` (top of file), and import `Part`/`CylinderPart` types as needed (`Part` may already be importable — add `CylinderPart` to the `import type` from `./types`). Then:

```ts
describe('isSnapFace', () => {
  const dowel: CylinderPart = {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 10,
    length: 100,
    material: '',
    color: '#c19a6b',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
  }

  it('board: any axis-aligned face is snappable', () => {
    expect(isSnapFace(BOARD, { x: 1, y: 0, z: 0 })).toBe(true)
    expect(isSnapFace(BOARD, { x: 0, y: -1, z: 0 })).toBe(true)
    expect(isSnapFace(BOARD, { x: 0, y: 0, z: 1 })).toBe(true)
  })

  it('dowel: a cap (±Z local normal) is snappable', () => {
    expect(isSnapFace(dowel, { x: 0, y: 0, z: 1 })).toBe(true)
    expect(isSnapFace(dowel, { x: 0, y: 0, z: -1 })).toBe(true)
  })

  it('dowel: a lateral (radial) face is not snappable', () => {
    expect(isSnapFace(dowel, { x: 1, y: 0, z: 0 })).toBe(false)
    expect(isSnapFace(dowel, { x: 0.707, y: 0.707, z: 0 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/snapMath.test.ts -t isSnapFace`
Expected: FAIL — `isSnapFace is not a function` (import error / undefined).

- [ ] **Step 3: Implement `isSnapFace`**

Add to `src/scene/snapMath.ts` (after `computeLocalFaceCenter`, before `halfExtent`):

```ts
export function isSnapFace(part: Part, localFaceNormal: Vec3): boolean {
  if (part.kind === 'board') return true
  return Math.abs(localFaceNormal.z) > 0.9
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/snapMath.test.ts -t isSnapFace`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/snapMath.ts src/scene/snapMath.test.ts
git commit -m "feat(snap): add isSnapFace face-validity gate"
```

---

## Task 3: `computeDowelLocalFaceCenter` — local cap-center of a dowel

**Files:**
- Modify: `src/scene/snapMath.ts`
- Test: `src/scene/snapMath.test.ts`

A dowel's local origin is on the axis with the base at `z = 0` and the far cap at `z = length` (SP1 convention). The `+Z` cap center is `(0, 0, length)`; the `-Z` cap center is `(0, 0, 0)`.

- [ ] **Step 1: Write the failing tests**

Add `computeDowelLocalFaceCenter` to the `./snapMath` import. Append to `snapMath.test.ts`:

```ts
describe('computeDowelLocalFaceCenter', () => {
  const dowel: CylinderPart = {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 10,
    length: 100,
    material: '',
    color: '#c19a6b',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
  }

  it('+Z cap center is (0, 0, length)', () => {
    expectVec3(computeDowelLocalFaceCenter({ x: 0, y: 0, z: 1 }, dowel), 0, 0, 100)
  })

  it('-Z cap center is (0, 0, 0)', () => {
    expectVec3(computeDowelLocalFaceCenter({ x: 0, y: 0, z: -1 }, dowel), 0, 0, 0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/snapMath.test.ts -t computeDowelLocalFaceCenter`
Expected: FAIL — `computeDowelLocalFaceCenter is not a function`.

- [ ] **Step 3: Implement `computeDowelLocalFaceCenter`**

Add to `src/scene/snapMath.ts`. Import `CylinderPart` in the existing `import type` from `./types`:

```ts
export function computeDowelLocalFaceCenter(localFaceNormal: Vec3, dowel: CylinderPart): Vec3 {
  return localFaceNormal.z > 0 ? { x: 0, y: 0, z: dowel.length } : { x: 0, y: 0, z: 0 }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/snapMath.test.ts -t computeDowelLocalFaceCenter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/snapMath.ts src/scene/snapMath.test.ts
git commit -m "feat(snap): add computeDowelLocalFaceCenter helper"
```

---

## Task 4: `computeDowelSnapTransform` — the dowel snap algorithm

**Files:**
- Modify: `src/scene/snapMath.ts`
- Test: `src/scene/snapMath.test.ts`

Pure, THREE-typed, browser-free (THREE math runs in happy-dom). Aligns the source cap's outward world normal to oppose the target normal (`setFromUnitVectors`), no roll-snap (rotational symmetry), then seats the cap center at the landing point: `targetFace.faceCenter` when `coaxial` (cap-to-cap), else `targetFace.hitPoint` (cap-to-board-face). The source cap world normal is **recomputed** from the dowel's rotation rather than trusting `sourceFace.faceNormal`.

- [ ] **Step 1: Write the failing tests**

Add `computeDowelSnapTransform` to the `./snapMath` import. Append to `snapMath.test.ts`:

```ts
describe('computeDowelSnapTransform', () => {
  const DOWEL: CylinderPart = {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 10,
    length: 100,
    material: '',
    color: '#c19a6b',
    position: { x: 0, y: 0, z: 0 }, // base at origin, +Z cap at (0,0,100)
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
  }

  // helper: build a cap FaceHit for the source dowel
  function capFace(partId: string, lz: 1 | -1, worldNormal: Vec3): FaceHit {
    return {
      partId,
      faceNormal: worldNormal,
      faceCenter: { x: 0, y: 0, z: 0 },
      localFaceNormal: { x: 0, y: 0, z: lz },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 0, y: 0, z: 0 },
    }
  }

  it('cap-to-board-face (coaxial=false): +Z cap seats at the clicked hitPoint, opposing target normal', () => {
    // Source +Z cap currently points +Z (world). Target is a board face pointing +Z,
    // clicked at (10, 20, 50).
    const source = capFace('d1', 1, { x: 0, y: 0, z: 1 })
    const target: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 999, y: 999, z: 50 }, // deliberately != hitPoint to prove we use hitPoint
      localFaceNormal: { x: 0, y: 0, z: 1 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 10, y: 20, z: 50 },
    }
    const { position, rotation } = computeDowelSnapTransform(source, target, DOWEL, false)

    // After the transform, the cap's outward normal must oppose the target normal (point -Z).
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
        'XYZ',
      ),
    )
    const capNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(capNormal.z).toBeCloseTo(-1, 5)

    // The +Z cap center, placed by (position + q*(0,0,length)), must land on the hitPoint.
    const capLocal = new THREE.Vector3(0, 0, DOWEL.length).applyQuaternion(q)
    expectVec3(
      { x: position.x + capLocal.x, y: position.y + capLocal.y, z: position.z + capLocal.z },
      10,
      20,
      50,
    )
  })

  it('cap-to-cap (coaxial=true): cap seats at target faceCenter, not hitPoint', () => {
    const source = capFace('d1', 1, { x: 0, y: 0, z: 1 })
    const target: FaceHit = {
      partId: 'd2',
      faceNormal: { x: 0, y: 0, z: -1 }, // a -Z cap of another dowel
      faceCenter: { x: 5, y: 6, z: 200 },
      localFaceNormal: { x: 0, y: 0, z: -1 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 1, y: 2, z: 200 }, // != faceCenter to prove we use faceCenter
    }
    const { position, rotation } = computeDowelSnapTransform(source, target, DOWEL, true)
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
        'XYZ',
      ),
    )
    const capLocal = new THREE.Vector3(0, 0, DOWEL.length).applyQuaternion(q)
    expectVec3(
      { x: position.x + capLocal.x, y: position.y + capLocal.y, z: position.z + capLocal.z },
      5,
      6,
      200,
    )
  })

  it('-Z cap source: seats the (0,0,0) cap at the hitPoint', () => {
    const source = capFace('d1', -1, { x: 0, y: 0, z: -1 })
    const target: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 0, z: 1 },
      faceCenter: { x: 0, y: 0, z: 0 },
      localFaceNormal: { x: 0, y: 0, z: 1 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 7, y: 8, z: 30 },
    }
    const { position, rotation } = computeDowelSnapTransform(source, target, DOWEL, false)
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
        'XYZ',
      ),
    )
    // -Z cap center is local (0,0,0), so it lands exactly at `position`.
    const capLocal = new THREE.Vector3(0, 0, 0).applyQuaternion(q)
    expectVec3(
      { x: position.x + capLocal.x, y: position.y + capLocal.y, z: position.z + capLocal.z },
      7,
      8,
      30,
    )
    // The -Z cap outward normal must oppose target +Z (point -Z... wait: it must seat into
    // the target, so the cap normal points -Z? No: cap normal must oppose target normal).
    const capNormal = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
    expect(capNormal.z).toBeCloseTo(-1, 5)
  })

  it('pre-rotated source: recomputes the cap normal from the dowel rotation', () => {
    // Dowel rotated 90° about X → its local +Z axis points to world -Y.
    const rotated: CylinderPart = { ...DOWEL, rotation: { x: 90, y: 0, z: 0 } }
    // sourceFace.faceNormal is deliberately WRONG (stale/axis-rounded) to prove it is ignored.
    const source = capFace('d1', 1, { x: 1, y: 0, z: 0 })
    const target: FaceHit = {
      partId: 'b1',
      faceNormal: { x: 0, y: 1, z: 0 },
      faceCenter: { x: 0, y: 0, z: 0 },
      localFaceNormal: { x: 0, y: 1, z: 0 },
      localHitPoint: { x: 0, y: 0, z: 0 },
      hitPoint: { x: 0, y: 100, z: 0 },
    }
    const { rotation } = computeDowelSnapTransform(source, target, rotated, false)
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
        'XYZ',
      ),
    )
    // Cap +Z must end up opposing target +Y → pointing -Y.
    const capNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    expect(capNormal.y).toBeCloseTo(-1, 5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/snapMath.test.ts -t computeDowelSnapTransform`
Expected: FAIL — `computeDowelSnapTransform is not a function`.

- [ ] **Step 3: Implement `computeDowelSnapTransform`**

Add to `src/scene/snapMath.ts` (after `computeSnapTransform`). `DEG2RAD` and the THREE import already exist at the top of the file:

```ts
export function computeDowelSnapTransform(
  sourceFace: FaceHit,
  targetFace: FaceHit,
  sourceDowel: CylinderPart,
  coaxial: boolean,
): { position: Vec3; rotation: Vec3 } {
  // Current world rotation as a quaternion
  const Q_current = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      sourceDowel.rotation.x * DEG2RAD,
      sourceDowel.rotation.y * DEG2RAD,
      sourceDowel.rotation.z * DEG2RAD,
      sourceDowel.rotationOrder,
    ),
  )

  // Recompute the cap's outward world normal from the dowel rotation (do NOT trust
  // sourceFace.faceNormal, which the raycaster may have axis-rounded).
  const capSign = Math.sign(sourceFace.localFaceNormal.z) || 1
  const srcWorldNormal = new THREE.Vector3(0, 0, capSign).applyQuaternion(Q_current)

  // Minimum rotation to make the cap normal oppose the target normal.
  const negTgt = new THREE.Vector3(
    -targetFace.faceNormal.x,
    -targetFace.faceNormal.y,
    -targetFace.faceNormal.z,
  )
  const Q_normal = new THREE.Quaternion().setFromUnitVectors(srcWorldNormal, negTgt)

  // No roll-snap — a cylinder is rotationally symmetric about its axis.
  const Q_final = new THREE.Quaternion().copy(Q_normal).multiply(Q_current)

  const euler = new THREE.Euler().setFromQuaternion(Q_final, sourceDowel.rotationOrder)
  const newRotation: Vec3 = {
    x: euler.x / DEG2RAD,
    y: euler.y / DEG2RAD,
    z: euler.z / DEG2RAD,
  }

  // Cap center in the local frame: +Z cap is at (0,0,length), -Z cap at (0,0,0).
  const capLocal = computeDowelLocalFaceCenter(sourceFace.localFaceNormal, sourceDowel)
  const capWorldOffset = new THREE.Vector3(capLocal.x, capLocal.y, capLocal.z).applyQuaternion(
    Q_final,
  )

  // Landing point: target face center (coaxial cap-to-cap) or the clicked hit point.
  const landing = coaxial ? targetFace.faceCenter : targetFace.hitPoint
  const newPosition: Vec3 = {
    x: landing.x - capWorldOffset.x,
    y: landing.y - capWorldOffset.y,
    z: landing.z - capWorldOffset.z,
  }

  return { position: newPosition, rotation: newRotation }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/snapMath.test.ts -t computeDowelSnapTransform`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Run the whole snapMath suite (regression)**

Run: `pnpm vitest run src/scene/snapMath.test.ts`
Expected: PASS — including all pre-existing board tests.

- [ ] **Step 6: Commit**

```bash
git add src/scene/snapMath.ts src/scene/snapMath.test.ts
git commit -m "feat(snap): add computeDowelSnapTransform"
```

---

## Task 5: Viewport raycaster — emit `FaceHit`s for dowels

**Files:**
- Modify: `src/render/viewport.tsx:104-141` (replace the non-board early-return with a cylinder branch)

This is integration code (Three.js `Mesh` + `matrixWorld`); it is not unit-tested (matching the existing board path). It is verified by typecheck/lint here and by the live spike in Task 7. **Important:** this is the change that makes both dowel snapping AND SP2's dowel click-to-seed cuts work in the live app.

- [ ] **Step 1: Ensure `computeDowelLocalFaceCenter` is imported in the viewport**

In `src/render/viewport.tsx`, the import from `'../scene/snapMath'` currently brings in `computeLocalFaceCenter`. Add `computeDowelLocalFaceCenter`:

```ts
import { computeLocalFaceCenter, computeDowelLocalFaceCenter } from '../scene/snapMath'
```

(If the existing import path/name differs, match it — the key is to also import `computeDowelLocalFaceCenter`.)

- [ ] **Step 2: Replace the non-board early-return with a cylinder branch**

In `buildFaceHit`, the current guard is:

```ts
    const part = currentParts.find((p) => p.id === partId)
    if (!part || part.kind !== 'board') return null
```

Replace the `if (!part ...)` line with a null-check plus a cylinder branch placed **before** the existing board code (the board code from `// Snap hit normal to nearest axis...` onward stays exactly as is, now reached only when `part.kind === 'board'`):

```ts
    const part = currentParts.find((p) => p.id === partId)
    if (!part) return null

    if (part.kind === 'cylinder') {
      const ln = intersection.face.normal
      const isCap = Math.abs(ln.z) > 0.9
      const lhp = intersection.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert())
      const localHitPoint = { x: lhp.x, y: lhp.y, z: lhp.z }
      const hitPoint = { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z }

      if (isCap) {
        const sign = Math.sign(ln.z)
        const localFaceNormal = { x: 0, y: 0, z: sign }
        const wn = new THREE.Vector3(0, 0, sign).transformDirection(mesh.matrixWorld)
        const faceNormal = { x: wn.x, y: wn.y, z: wn.z }
        const lc = computeDowelLocalFaceCenter(localFaceNormal, part)
        const wc = new THREE.Vector3(lc.x, lc.y, lc.z).applyMatrix4(mesh.matrixWorld)
        const faceCenter = { x: wc.x, y: wc.y, z: wc.z }
        return { partId, faceNormal, faceCenter, localFaceNormal, localHitPoint, hitPoint }
      }

      // Lateral (curved) surface: radial normal; faceCenter is a placeholder
      // (isSnapFace rejects lateral faces for snapping; add-cut uses localHitPoint).
      const radial = new THREE.Vector3(ln.x, ln.y, 0).normalize()
      const localFaceNormal = { x: radial.x, y: radial.y, z: 0 }
      const wn = new THREE.Vector3(ln.x, ln.y, ln.z).transformDirection(mesh.matrixWorld)
      const faceNormal = { x: wn.x, y: wn.y, z: wn.z }
      return { partId, faceNormal, faceCenter: hitPoint, localFaceNormal, localHitPoint, hitPoint }
    }

    // Snap hit normal to nearest axis in local space
    const ln = intersection.face.normal
```

> Note: the board branch already declares `const ln = intersection.face.normal`. Keep exactly one such declaration in the board path — the snippet above ends by re-introducing it as the first line of the unchanged board code. Do not leave a duplicate `const ln` in the same scope; the cylinder branch returns before reaching it, so the board-path `const ln` is fine.

- [ ] **Step 3: Verify typecheck and lint pass**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (TypeScript narrows `part` to `CylinderPart` inside the `kind === 'cylinder'` block, so `computeDowelLocalFaceCenter(localFaceNormal, part)` typechecks.)

- [ ] **Step 4: Verify all tests still pass**

Run: `pnpm test`
Expected: PASS (no unit tests cover `buildFaceHit`; this confirms no collateral breakage).

- [ ] **Step 5: Commit**

```bash
git add src/render/viewport.tsx
git commit -m "feat(snap): emit FaceHits for dowel caps and lateral surfaces"
```

---

## Task 6: `useSnap` — drop board-only guard, gate by `isSnapFace`, route by kind

**Files:**
- Modify: `src/scene/useSnap.ts:1-3` (imports), `:52-101` (`onFaceClick`)
- Test: `src/scene/useSnap.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/scene/useSnap.test.ts`, first extend the `snapMath` mock (lines 6-13) so the hook can import the new functions. Add a dowel part fixture and dowel/board cap FaceHits, then the new tests.

Replace the mock block with:

```ts
vi.mock('./snapMath', () => ({
  computeSnapTransform: () => ({
    position: { x: 0, y: 0, z: 100 },
    rotation: { x: 0, y: 0, z: 0 },
  }),
  computeDowelSnapTransform: vi.fn((_src, _tgt, _dowel, coaxial: boolean) => ({
    position: { x: coaxial ? 1 : 2, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  })),
  isSnapFace: (part: Part, lfn: { z: number }) =>
    part.kind === 'board' ? true : Math.abs(lfn.z) > 0.9,
  computeFaceCorners: vi.fn(),
  computeLocalFaceCenter: vi.fn(),
}))
```

Add after the existing `partB` fixture:

```ts
const dowelD: Part = {
  kind: 'cylinder',
  id: 'd',
  label: 'Dowel D',
  diameter: 10,
  length: 100,
  material: '',
  color: '#c19a6b',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}

// +Z cap of dowel D
const capOnD: FaceHit = {
  partId: 'd',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 0, y: 0, z: 100 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 100 },
}

// lateral (curved) face of dowel D — radial local normal, z ≈ 0
const lateralOnD: FaceHit = {
  partId: 'd',
  faceNormal: { x: 1, y: 0, z: 0 },
  faceCenter: { x: 5, y: 0, z: 50 },
  localFaceNormal: { x: 1, y: 0, z: 0 },
  localHitPoint: { x: 5, y: 0, z: 50 },
  hitPoint: { x: 5, y: 0, z: 50 },
}
```

Add these tests inside the `describe('useSnap', ...)` block:

```ts
it('dowel source cap → board face: routes to computeDowelSnapTransform with coaxial=false', () => {
  const { result } = renderHook(() => useSnap({ parts: [dowelD, partB], onUpdate }))
  act(() => result.current.activateSnap())
  act(() => result.current.onFaceClick(capOnD)) // source = dowel cap
  act(() => result.current.onFaceClick(faceOnB)) // target = board face (not a cap)
  expect(onUpdate).toHaveBeenCalledTimes(1)
  const updater = (onUpdate as ReturnType<typeof vi.fn>).mock.calls[0][1] as (p: Part) => Part
  const updated = updater(dowelD)
  expect(updated.position).toEqual({ x: 2, y: 0, z: 0 }) // coaxial=false branch
})

it('dowel source cap → dowel cap: routes with coaxial=true', () => {
  const dowelE: Part = { ...dowelD, id: 'e', position: { x: 0, y: 0, z: 300 } }
  const capOnE: FaceHit = { ...capOnD, partId: 'e', faceNormal: { x: 0, y: 0, z: -1 }, localFaceNormal: { x: 0, y: 0, z: -1 } }
  const { result } = renderHook(() => useSnap({ parts: [dowelD, dowelE], onUpdate }))
  act(() => result.current.activateSnap())
  act(() => result.current.onFaceClick(capOnD))
  act(() => result.current.onFaceClick(capOnE))
  expect(onUpdate).toHaveBeenCalledTimes(1)
  const updater = (onUpdate as ReturnType<typeof vi.fn>).mock.calls[0][1] as (p: Part) => Part
  expect(updater(dowelD).position).toEqual({ x: 1, y: 0, z: 0 }) // coaxial=true branch
})

it('board source → dowel cap: bidirectional, uses board transform', () => {
  const { result } = renderHook(() => useSnap({ parts: [partA, dowelD] }))
  // re-create with onUpdate
  const r2 = renderHook(() => useSnap({ parts: [partA, dowelD], onUpdate }))
  act(() => r2.result.current.activateSnap())
  act(() => r2.result.current.onFaceClick(faceOnA)) // source = board face
  act(() => r2.result.current.onFaceClick(capOnD)) // target = dowel cap
  expect(onUpdate).toHaveBeenCalledTimes(1)
  const updater = (onUpdate as ReturnType<typeof vi.fn>).mock.calls[0][1] as (p: Part) => Part
  expect(updater(partA).position).toEqual({ x: 0, y: 0, z: 100 }) // computeSnapTransform mock
  void result
})

it('dowel lateral face is rejected as a source (no source set)', () => {
  const { result } = renderHook(() => useSnap({ parts: [dowelD, partB], onUpdate }))
  act(() => result.current.activateSnap())
  act(() => result.current.onFaceClick(lateralOnD)) // lateral → not a snap face
  expect(result.current.snapPhase).toBe('idle')
  expect(result.current.sourceFace).toBeNull()
})

it('dowel lateral face is rejected as a target (no snap applied)', () => {
  const { result } = renderHook(() => useSnap({ parts: [dowelD, partB], onUpdate }))
  act(() => result.current.activateSnap())
  act(() => result.current.onFaceClick(faceOnB)) // source = board face (valid)
  act(() => result.current.onFaceClick(lateralOnD)) // target lateral → rejected
  expect(onUpdate).not.toHaveBeenCalled()
})
```

> The `Part` type is already imported in `useSnap.test.ts`. Remove the stray `const { result } = renderHook(...)` / `void result` scaffolding if your editor flags unused — the intent is one active hook per test; simplify to a single `renderHook` call as in the other tests.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/scene/useSnap.test.ts`
Expected: FAIL — the dowel-source test fails the old `srcPart.kind !== 'board'` guard (no `onUpdate`); lateral-source still sets a source (guard not yet present).

- [ ] **Step 3: Update imports in `useSnap.ts`**

```ts
import { computeSnapTransform, computeDowelSnapTransform, isSnapFace } from './snapMath'
```

- [ ] **Step 4: Add the source-pick face gate**

In `onFaceClick`, the idle branch currently is:

```ts
      if (snapPhase === 'idle') {
        setSourceFace(hit)
        setSnapPhase('source-picked')
        return
      }
```

Replace with a gate that ignores non-snap faces:

```ts
      if (snapPhase === 'idle') {
        const part = parts.find((p) => p.id === hit.partId)
        if (!part || !isSnapFace(part, hit.localFaceNormal)) return
        setSourceFace(hit)
        setSnapPhase('source-picked')
        return
      }
```

- [ ] **Step 5: Replace the board-only guard with target-gating + kind routing**

The current `source-picked` body is:

```ts
      // source-picked: apply guards then snap
      if (hit.partId === sourceFace!.partId) return

      const srcFace = sourceFace!
      const srcPart = parts.find((p) => p.id === srcFace.partId)
      if (!srcPart || srcPart.kind !== 'board') return
      const { position, rotation } = computeSnapTransform(srcFace, hit, srcPart)
```

Replace it with:

```ts
      // source-picked: apply guards then snap
      if (hit.partId === sourceFace!.partId) return

      const srcFace = sourceFace!
      const srcPart = parts.find((p) => p.id === srcFace.partId)
      const targetPart = parts.find((p) => p.id === hit.partId)
      if (!srcPart || !targetPart) return
      if (!isSnapFace(targetPart, hit.localFaceNormal)) return

      const { position, rotation } =
        srcPart.kind === 'cylinder'
          ? computeDowelSnapTransform(srcFace, hit, srcPart, targetPart.kind === 'cylinder')
          : computeSnapTransform(srcFace, hit, srcPart)
```

Everything after this (the `noMove` guard, `onUpdate`, `rotationChanged`/`onRotationSnap`, chained-snap reset) is unchanged.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/scene/useSnap.test.ts`
Expected: PASS — new dowel/board/lateral tests green, and all pre-existing board snap tests still green.

- [ ] **Step 7: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/scene/useSnap.ts src/scene/useSnap.test.ts
git commit -m "feat(snap): route dowel cap snapping in useSnap"
```

---

## Task 7: Full verification + live spike + implementation notes

**Files:**
- Create: `docs/superpowers/notes/2026-06-20-dowel-snap-align-notes.md`

- [ ] **Step 1: Run the full check suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS — all three clean. (Required before every commit per CLAUDE.md.)

- [ ] **Step 2: Live spike (manual, load-bearing)**

Run: `pnpm dev`, open http://localhost:5173 in Chrome/Edge, and verify:

1. **Dowel cap → board face:** add a board and a dowel; activate Snap; click a dowel cap (source), then click a board face. The dowel rotates so its clicked cap seats flush against the board face and its cap center lands at the clicked point; the body extends away from the board.
2. **Dowel cap → dowel cap (coaxial):** add two dowels; snap one dowel's cap onto the other's cap. They join end-to-end, coaxially (cap center on cap center), not at an off-axis click point.
3. **Board → dowel cap (bidirectional):** snap a board face onto a dowel cap; the board seats on the cap (existing board behavior, target = cap face center).
4. **Lateral rejection:** clicking a dowel's curved side during Snap does nothing (not selectable as source or target).
5. **Undo/redo:** each snap is one undo step; redo reapplies it.
6. **SP2 regression-fix check:** with Snap inactive, use the add-cut interaction on a dowel — clicking a dowel cap and lateral surface now seeds a cut (previously inert because `buildFaceHit` returned `null` for dowels).

- [ ] **Step 3: Write the implementation notes**

Create `docs/superpowers/notes/2026-06-20-dowel-snap-align-notes.md` capturing decisions and surprises. Minimum content:

```markdown
# Dowel Snap-Align (SP3) — Implementation Notes

- 2026-06-20: `buildFaceHit` returned `null` for all non-board parts, so the
  raycaster emitted no dowel `FaceHit`s. SP3 extends it to cylinders. Side effect:
  this also enabled SP2's dowel click-to-seed cuts, which were inert before.
- `computeDowelSnapTransform` recomputes the cap's world normal from the dowel's
  rotation (`Q_current · (0,0,±1)`) rather than trusting `sourceFace.faceNormal`,
  because a rotated dowel's cap normal must stay exact and the raycaster's board
  path axis-rounds. The dowel path therefore does NOT axis-round cap normals.
- Landing point: `coaxial` (cap-to-cap) seats at `targetFace.faceCenter`;
  otherwise at `targetFace.hitPoint`. `coaxial = targetPart.kind === 'cylinder'`,
  decided in `useSnap`.
- No roll-snap for dowels (rotational symmetry) — `Q_final = Q_normal · Q_current`.
- Deferred: lateral/side-lay snapping; snapping by a mitred (cut) end uses the
  nominal square cap; 2D dowel drawings (SP4).
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-06-20-dowel-snap-align-notes.md
git commit -m "docs: dowel snap-align (SP3) implementation notes"
```

- [ ] **Step 5: Push the branch**

```bash
git push -u origin claude/funny-cray-7uy6qp
```

(Retry on network error with exponential backoff: 2s, 4s, 8s, 16s.)

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §1 `FaceHit.hitPoint` → Task 1 ✓
- §2 `isSnapFace` → Task 2 ✓
- §3 `computeDowelSnapTransform` (recomputed normal, coaxial landing, no roll-snap) → Task 4 ✓ (`computeDowelLocalFaceCenter` it depends on → Task 3 ✓)
- §4 viewport `buildFaceHit` cylinder branch (cap + lateral, exact normals) → Task 5 ✓
- §5 `useSnap` (drop guard, gate by `isSnapFace`, route by kind + coaxial) → Task 6 ✓
- §6 testing (snapMath unit tests + useSnap interaction tests + live spike) → Tasks 2–4, 6, 7 ✓
- §7 out-of-scope items → none implemented; deferred ✓

**Type consistency:** `computeDowelSnapTransform(sourceFace, targetFace, sourceDowel, coaxial)`, `isSnapFace(part, localFaceNormal)`, `computeDowelLocalFaceCenter(localFaceNormal, dowel)` — signatures identical across the snapMath impl (Tasks 2–4), the viewport import (Task 5), and the useSnap call site + mock (Task 6). `hitPoint: Vec3` field name consistent across Task 1 and all consumers.

**Placeholder scan:** no TBD/TODO/"handle edge cases"; every code step shows complete code; commands have expected output.
