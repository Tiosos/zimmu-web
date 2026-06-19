# Rotation Snap — Design Spec

**Date:** 2026-06-14
**Status:** Approved (L99)

## Goal

Extend the existing face-to-face snap so that clicking any two faces on different parts — not just anti-parallel ones — produces a fully aligned result: the source part rotates to face the target and translates to touch it, all in one gesture with a single undo entry.

---

## Architecture

Three files change; one new pure function is added to `snapMath.ts`.

| File | Change |
|---|---|
| `src/scene/snapMath.ts` | Add `computeSnapTransform`; add private `localNormalToFaceString` helper |
| `src/scene/useSnap.ts` | Replace `computeSnapDelta` call with `computeSnapTransform`; remove anti-parallel guards from both handlers; delete now-unused `dot` and `vecLen` helpers |
| `src/render/viewport.tsx` | Apply rotation as well as position to the ghost mesh |

`computeSnapDelta` is **not changed** — its existing tests stay green.

---

## New function: `computeSnapTransform`

### Signature

```ts
export function computeSnapTransform(
  sourceFace: FaceHit,
  targetFace: FaceHit,
  sourcePart: BoardPart,
): { position: Vec3; rotation: Vec3 }
```

Returns absolute world position and Euler-XYZ rotation (in degrees) for the source part after snapping. The caller sets `part.position` and `part.rotation` directly — no delta arithmetic needed.

### Private helper (add to `snapMath.ts`)

`faceAxes` requires a `CutDef['face']` string (e.g. `'+X'`), but `FaceHit.localFaceNormal` is a `Vec3`. Bridge them with:

```ts
function localNormalToFaceString(n: Vec3): CutDef['face'] {
  if (n.x > 0.5) return '+X'
  if (n.x < -0.5) return '-X'
  if (n.y > 0.5) return '+Y'
  if (n.y < -0.5) return '-Y'
  if (n.z > 0.5) return '+Z'
  return '-Z'
}
```

### Full implementation

```ts
export function computeSnapTransform(
  sourceFace: FaceHit,
  targetFace: FaceHit,
  sourcePart: BoardPart,
): { position: Vec3; rotation: Vec3 } {
  // ── Step 1: current world rotation as quaternion ──────────────────────────
  const Q_current = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      sourcePart.rotation.x * DEG2RAD,
      sourcePart.rotation.y * DEG2RAD,
      sourcePart.rotation.z * DEG2RAD,
      sourcePart.rotationOrder,
    ),
  )

  // ── Step 2: minimum rotation to align source normal with -target normal ───
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
  // THREE.js handles the degenerate cases:
  //   srcNormal ≈ negTgt  (dot ≈ +1): identity quaternion — no rotation needed.
  //   srcNormal ≈ -negTgt (dot ≈ -1): 180° flip around an arbitrary perpendicular axis.

  // ── Step 3: snap roll to nearest 90° ─────────────────────────────────────
  // 3a. Rotate source face u-axis to world space using Q_normal × Q_current.
  const { u: uKey } = faceAxes(localNormalToFaceString(sourceFace.localFaceNormal))
  const localU = new THREE.Vector3()
  localU[uKey] = 1
  const worldU = localU.clone().applyQuaternion(
    new THREE.Quaternion().copy(Q_normal).multiply(Q_current),
  )

  // 3b. Project worldU onto the target face plane (remove component along negTgt).
  const projected = worldU.clone().addScaledVector(negTgt, -worldU.dot(negTgt))
  if (projected.lengthSq() < 1e-10) {
    // worldU is parallel to negTgt — pick an arbitrary in-plane reference.
    const fb = Math.abs(negTgt.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0)
    projected.copy(fb).addScaledVector(negTgt, -fb.dot(negTgt))
  }
  projected.normalize()

  // 3c. The two canonical axes of the target face plane are the two world unit
  //     vectors orthogonal to negTgt.  This works because targetFace.faceNormal
  //     is always ±X, ±Y, or ±Z — the raycaster in viewport.tsx snaps it.
  const WORLD = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]
  const planePair = WORLD.filter((a) => Math.abs(a.dot(negTgt)) < 0.01)
  const axis1 = planePair[0] ?? new THREE.Vector3(1, 0, 0)
  const axis2 = planePair[1] ?? new THREE.Vector3(0, 1, 0)

  // 3d. Measure roll angle and snap to nearest multiple of π/2.
  const angle = Math.atan2(projected.dot(axis2), projected.dot(axis1))
  const snapped = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  const Q_roll = new THREE.Quaternion().setFromAxisAngle(negTgt, snapped - angle)

  // 3e. Compose: Q_final = Q_roll × Q_normal × Q_current.
  const Q_final = new THREE.Quaternion()
    .copy(Q_roll)
    .multiply(Q_normal)
    .multiply(Q_current)

  // ── Step 4: convert to Euler XYZ degrees ─────────────────────────────────
  const euler = new THREE.Euler().setFromQuaternion(Q_final, sourcePart.rotationOrder)
  const newRotation: Vec3 = {
    x: euler.x / DEG2RAD,
    y: euler.y / DEG2RAD,
    z: euler.z / DEG2RAD,
  }

  // ── Step 5: find new position ─────────────────────────────────────────────
  // Build a temp part at the ORIGINAL position but the NEW rotation, then find
  // where the source face centre lands in world space.  The required translation
  // is the vector from that point to targetFace.faceCenter.
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

### Degenerate cases

| Situation | Behaviour |
|---|---|
| Faces already anti-parallel (`dot(Ns, Nt) ≈ -1`) | Q_normal ≈ identity; roll snap rounds to 0°; result matches `computeSnapDelta` output |
| Faces parallel same direction (`dot(Ns, Nt) ≈ +1`) | THREE.js `setFromUnitVectors` picks an arbitrary perpendicular axis for the 180° flip; roll snap then picks the cleanest 90° orientation |
| Projected roll vector is zero-length (extremely rare: source u-axis points along negTgt after Q_normal) | Fallback reference vector chosen; snap still produces a valid 90°-aligned result |

---

## `useSnap.ts` changes

### Imports

Replace:
```ts
import { computeSnapDelta } from './snapMath'
```
With:
```ts
import { computeSnapTransform } from './snapMath'
```

### Delete the two now-unused local helpers

Both become unused after the guard removals below. TypeScript strict mode (`noUnusedLocals`) rejects them. Delete both:

```ts
// DELETE:
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

// DELETE:
function vecLen(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}
```

The `Vec3` import is still used (parameter types), so leave it.

### Remove anti-parallel guard from `onFaceClick`

Remove line 71 (present in the `// source-picked: apply guards then snap` block):
```ts
// DELETE:
if (dot(sourceFace!.faceNormal, hit.faceNormal) > 0) return
```

The same-part guard on line 70 stays:
```ts
if (hit.partId === sourceFace!.partId) return  // keep
```

### Replace snap logic in `onFaceClick`

Replace the block from the `const delta = ...` line through the `onUpdate(...)` call:

```ts
// REMOVE:
const delta = computeSnapDelta(sourceFace!, hit)
if (vecLen(delta) < 0.001) {
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
// ADD:
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

The `noMove` check replaces `vecLen(delta) < 0.001` and correctly handles pure-rotation snaps (zero translation, non-zero rotation) that the old check would have silently discarded.

### Remove anti-parallel guard from `onFaceHover`

Remove this block (lines 119–122):
```ts
// DELETE:
if (hit && dot(sourceFace!.faceNormal, hit.faceNormal) > 0) {
  setHoveredFace(null)
  return
}
```

After this removal the hover handler accepts any face from a different part — including non-anti-parallel ones — and the ghost mesh will show the rotated preview for them.

### `useCallback` dependency arrays

`onFaceClick` deps: remove `computeSnapDelta` was never in the deps array (it's a stable import), so no change needed. The deps array `[snapActive, snapPhase, sourceFace, parts, onUpdate]` stays identical.

---

## `viewport.tsx` — ghost mesh rotation

The ghost mesh `useEffect` (currently ~line 474) uses `computeSnapDelta` to position the ghost. Replace with `computeSnapTransform` and also set the ghost rotation.

```ts
// BEFORE (in the useEffect body):
import { computeSnapDelta } from '../scene/snapMath'
// ...
const delta = computeSnapDelta(sourceFace, hoveredFace)
ghost.position.set(
  src.position.x + delta.x,
  src.position.y + delta.y,
  src.position.z + delta.z,
)
ghost.visible = true
```

```ts
// AFTER:
import { computeSnapTransform } from '../scene/snapMath'
// ...
const { position, rotation } = computeSnapTransform(sourceFace, hoveredFace, src)
ghost.position.set(position.x, position.y, position.z)
ghost.setRotationFromEuler(
  new THREE.Euler(
    rotation.x * THREE.MathUtils.DEG2RAD,
    rotation.y * THREE.MathUtils.DEG2RAD,
    rotation.z * THREE.MathUtils.DEG2RAD,
    src.rotationOrder,
  ),
)
ghost.visible = true
```

`computeSnapTransform` is pure (no OCCT calls, no allocations beyond THREE temporaries) so calling it on every hover frame is fine.

---

## Tests (`src/scene/snapMath.test.ts`)

Use the existing `BOARD` fixture (100×50×25mm at position 0,0,0, rotation 0,0,0) and the existing `face()` / `makeFace()` helpers. Add a second board for the target:

```ts
const TARGET: BoardPart = {
  ...BOARD,
  id: 'b2',
  label: 'Board 2',
  position: { x: 200, y: 0, z: 0 },
}
```

### Geometric invariant helper

Every test verifies the same two properties — factor them out:

```ts
function expectSnapped(
  result: { position: Vec3; rotation: Vec3 },
  sourceFace: FaceHit,
  targetFaceCenter: Vec3,
  targetFaceNormal: Vec3,
  sourcePart: BoardPart,
) {
  // 1. Source face centre coincides with target face centre after transform.
  const snappedPart: BoardPart = { ...sourcePart, position: result.position, rotation: result.rotation }
  const corners = computeFaceCorners(sourceFace, snappedPart)
  const cx = (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4
  const cy = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4
  const cz = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) / 4
  expect(cx).toBeCloseTo(targetFaceCenter.x, 3)
  expect(cy).toBeCloseTo(targetFaceCenter.y, 3)
  expect(cz).toBeCloseTo(targetFaceCenter.z, 3)

  // 2. Source face normal is anti-parallel to target face normal after transform.
  //    The world normal equals Q_final applied to localFaceNormal.
  //    Verify via dot product of the returned rotation applied to sourceFace.faceNormal.
  //    Simpler: verify dot(returned_normal, targetFaceNormal) ≈ -1.
  //    We derive returned_normal by rotating sourceFace.faceNormal with newRotation.
  const DEG2RAD = Math.PI / 180
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      result.rotation.x * DEG2RAD,
      result.rotation.y * DEG2RAD,
      result.rotation.z * DEG2RAD,
      'XYZ',
    ),
  )
  // Compute original local-to-world normal rotation from sourcePart
  const q0 = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      sourcePart.rotation.x * DEG2RAD,
      sourcePart.rotation.y * DEG2RAD,
      sourcePart.rotation.z * DEG2RAD,
      'XYZ',
    ),
  )
  // New world normal = q * q0^-1 * sourceFace.faceNormal... simpler:
  // The returned rotation IS the new world rotation, so world normal = q * localFaceNormal
  const ln = new THREE.Vector3(
    sourceFace.localFaceNormal.x,
    sourceFace.localFaceNormal.y,
    sourceFace.localFaceNormal.z,
  ).applyQuaternion(q)
  const dotNormals = ln.dot(new THREE.Vector3(targetFaceNormal.x, targetFaceNormal.y, targetFaceNormal.z))
  expect(dotNormals).toBeCloseTo(-1, 3)
}
```

### Test case 1: 90° alignment — source +X face, target +Y face

```ts
it('90° alignment: source +X to target +Y — rotates -90° around Z, faces flush', () => {
  // Source: BOARD at (0,0,0), +X face (normal {1,0,0}, center {100,25,12.5})
  // Target: board at (200,0,0), +Y face (normal {0,1,0}, center {250,50,12.5})
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

  // Rotation: -90° around Z (source +X aligns with target -Y direction = anti-parallel to +Y)
  expect(result.rotation.x).toBeCloseTo(0, 3)
  expect(result.rotation.y).toBeCloseTo(0, 3)
  expect(result.rotation.z).toBeCloseTo(-90, 3)

  // Position: faces flush at (250, 50, 12.5)
  // At rotation -90° around Z, the +X face centre (local 100,25,12.5) maps to world (25,-100,12.5).
  // newPosition = (0,0,0) + (250,50,12.5) - (25,-100,12.5) = (225, 150, 0)
  expect(result.position.x).toBeCloseTo(225, 3)
  expect(result.position.y).toBeCloseTo(150, 3)
  expect(result.position.z).toBeCloseTo(0, 3)

  expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
})
```

### Test case 2: 180° flip — source +Z, target +Z (same direction)

```ts
it('180° flip: source +Z to target +Z — flips 180°, faces flush', () => {
  // Source: BOARD at (0,0,0), +Z face (center {50,25,25})
  // Target: board at (0,0,100), +Z face (center {50,25,125})
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

  // Don't assert exact Euler angles — 180° decompositions are not unique.
  // Assert only the geometric invariants:
  expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
})
```

### Test case 3: Anti-parallel degenerate — already opposed, matches `computeSnapDelta`

```ts
it('anti-parallel degenerate: source +Z, target -Z — matches computeSnapDelta output', () => {
  // Source: BOARD at (0,0,0), +Z face (center {50,25,25})
  // Target: board at (0,0,100), -Z face (center {50,25,100})
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

  // Rotation unchanged (already anti-parallel)
  expect(result.rotation.x).toBeCloseTo(0, 3)
  expect(result.rotation.y).toBeCloseTo(0, 3)
  expect(result.rotation.z).toBeCloseTo(0, 3)

  // Position matches computeSnapDelta: delta = (0,0,75), so newPosition = (0,0,75)
  const delta = computeSnapDelta(srcFace, tgtFace)
  expect(result.position.x).toBeCloseTo(BOARD.position.x + delta.x, 3)
  expect(result.position.y).toBeCloseTo(BOARD.position.y + delta.y, 3)
  expect(result.position.z).toBeCloseTo(BOARD.position.z + delta.z, 3)

  expectSnapped(result, srcFace, tgtFace.faceCenter, tgtFace.faceNormal, BOARD)
})
```

---

## Out of scope

- Roll disambiguation beyond nearest 90° (free-angle roll matching)
- Rotation snap for non-board part kinds
- Any changes to the STEP/STL export pipeline (rotation is already encoded in `composeWorldMatrix`)
- Undo coalescing changes (existing coalesce-by-label logic handles this correctly)
- The `expectSnapped` helper imports `THREE` — this is already available in `snapMath.test.ts` indirectly through the functions under test; import it explicitly if needed (`import * as THREE from 'three'`)
