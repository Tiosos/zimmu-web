# Rotation Snap — Design Spec

**Date:** 2026-06-14
**Status:** Approved

## Goal

Extend the existing face-to-face snap so that clicking any two faces on different parts — not just anti-parallel ones — produces a fully aligned result: the source part rotates to face the target and translates to touch it, all in one gesture with a single undo entry.

---

## Architecture

Three files change; one new pure function is added to `snapMath.ts`.

| File | Change |
|---|---|
| `src/scene/snapMath.ts` | Add `computeSnapTransform` |
| `src/scene/useSnap.ts` | Use `computeSnapTransform`; relax anti-parallel guard |
| `src/render/viewport.tsx` | Apply rotation as well as position to the ghost mesh |

`computeSnapDelta` is **not changed** — it remains for backward compatibility and its existing tests stay green.

---

## New function: `computeSnapTransform`

```ts
export function computeSnapTransform(
  sourceFace: FaceHit,
  targetFace: FaceHit,
  sourcePart: BoardPart,
): { position: Vec3; rotation: Vec3 }
```

Returns absolute world position and Euler-XYZ rotation (degrees) for the source part after snapping. The caller sets `part.position` and `part.rotation` directly.

### Step 1 — Align the normal (minimum rotation)

Compute **Q_normal**: the quaternion that rotates `sourceFace.faceNormal` to `-targetFace.faceNormal` via `THREE.Quaternion.setFromUnitVectors`. This is the minimum-angle rotation with no roll component.

Degenerate inputs:
- **Already anti-parallel** (`dot ≈ -1`): `setFromUnitVectors` returns identity. Falls through to roll snap, which rounds to 0° — identical to current `computeSnapDelta` behaviour.
- **Parallel same direction** (`dot ≈ +1`): `setFromUnitVectors` picks an arbitrary perpendicular axis for the 180° flip. Roll snap then chooses the cleanest 90° orientation.

### Step 2 — Snap the roll to the nearest 90°

After Q_normal, the source part still has a free degree of rotation around `-targetFace.faceNormal` (the roll). To resolve it:

1. Determine the source face's `u`-axis from `faceAxes(sourceFace.localFaceNormal)`.
2. Rotate it to world space using **Q_combined = Q_normal × Q_current** (where Q_current is built from `sourcePart.rotation` and `rotationOrder`).
3. Project the result onto the target face plane (remove the component along `-targetFace.faceNormal`).
4. Determine the target face's `u`-axis and `v`-axis in world space (from `faceAxes(targetFace.localFaceNormal)` transformed by the target part's world matrix — not needed if we use the known axis directions; since faces are axis-aligned in local space and parts can be rotated, derive target face axes from `targetFace.faceNormal` by building the same matrix from the target part).

    > **Simplification:** The viewport raycaster (`buildFaceHit` in `viewport.tsx`) snaps all face normals to the nearest world axis before storing them on `FaceHit`. So `targetFace.faceNormal` is always exactly ±X, ±Y, or ±Z. Therefore the two canonical edge axes of the target face in world space are simply the two standard world axes (`X`, `Y`, `Z`) that are orthogonal to `targetFace.faceNormal` — no target-part matrix needed.

5. Compute the angle from the projected source `u`-axis to the nearest of the four 90° positions (0°, 90°, 180°, 270° around `-targetFace.faceNormal`).
6. Build **Q_roll** from angle and axis `-targetFace.faceNormal`.
7. **Q_final = Q_roll × Q_normal × Q_current**.

### Step 3 — Compute new position

1. Convert Q_final to Euler-XYZ degrees → `newRotation: Vec3`.
2. Build a temporary `BoardPart` with `newRotation` and call `computeFaceCorners(sourceFace.localFaceNormal, tempPart)` to get the four rotated face corners in world space.
3. `newSourceFaceCenter` = average of the four corners.
4. `delta = targetFaceCenter − newSourceFaceCenter`, where `targetFaceCenter = targetFace.faceCenter`.
5. `newPosition = sourcePart.position + delta`.

**Return:** `{ position: newPosition, rotation: newRotation }`.

---

## `useSnap.ts` changes

### Remove anti-parallel guard — in both handlers

The guard appears in TWO places and must be removed from both:

**`onFaceClick`** (line 71) — remove:
```ts
if (dot(sourceFace!.faceNormal, hit.faceNormal) > 0) return
```

**`onFaceHover`** (line 119) — remove:
```ts
if (hit && dot(sourceFace!.faceNormal, hit.faceNormal) > 0) {
  setHoveredFace(null)
  return
}
```

The only remaining guard in both handlers is the same-part check (`hit.partId === sourceFace.partId`).

### Apply rotation + position in one update

`useSnap` already receives `parts: Part[]` — no prop change needed. Replace:

```ts
const delta = computeSnapDelta(sourceFace!, hit)
if (vecLen(delta) < 0.001) {
  // Already flush — reset to idle without a history entry
  setSourceFace(null)
  setSnapPhase('idle')
  return
}
onUpdate(src.partId, (p) => ({ ...p, position: { ... } }), `Snap ...`)
```

With:

```ts
const srcPart = parts.find((p) => p.id === sourceFace!.partId)
if (!srcPart || srcPart.kind !== 'board') return
const { position, rotation } = computeSnapTransform(sourceFace!, hit, srcPart)
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
onUpdate(sourceFace!.partId, (p) => ({ ...p, position, rotation }), `Snap ${sourceLabel} to ${targetLabel}`)
```

The `noMove` check replaces the old `vecLen(delta) < 0.001` check and correctly handles the case where only rotation changes (zero translation, non-zero rotation).

**Undo:** Single history entry (`'Snap X to Y'`) reverts both position and rotation together.

---

## `viewport.tsx` — ghost mesh

The ghost mesh `useEffect` currently sets only `ghost.position`. Update it to also set rotation:

```ts
const { position, rotation } = computeSnapTransform(sourceFace, hoveredFace, src)
ghost.position.set(position.x, position.y, position.z)
ghost.setRotationFromEuler(
  new THREE.Euler(
    THREE.MathUtils.degToRad(rotation.x),
    THREE.MathUtils.degToRad(rotation.y),
    THREE.MathUtils.degToRad(rotation.z),
    src.rotationOrder,
  ),
)
ghost.visible = true
```

`computeSnapTransform` is called every hover frame when `snapPhase === 'source-picked'` and `hoveredFace` is non-null. The function is pure and cheap (no OCCT calls), so per-frame invocation is fine.

---

## Tests (`src/scene/snapMath.test.ts`)

Three new test cases for `computeSnapTransform`:

| Case | Source face | Target face | Expected result |
|---|---|---|---|
| **90° alignment** | +X face on an axis-aligned part | +Y face on another part | Source rotates 90° around Z; faces flush |
| **180° flip** | +Z face | +Z face (same direction, opposite sides) | Source flips 180°; faces flush |
| **Anti-parallel (degenerate)** | +Z face | -Z face (already opposed) | Rotation unchanged; position matches `computeSnapDelta` output |

Each test: call `computeSnapTransform`, construct a temporary part at the returned position/rotation, verify the source face center now coincides with the target face center (within floating-point tolerance), and verify the normals are anti-parallel.

---

## Out of scope

- Roll disambiguation beyond nearest 90° (free-angle roll matching)
- Rotation snap for non-board part kinds
- Any changes to the STEP/STL export pipeline (rotation is already encoded in `composeWorldMatrix`)
- Undo coalescing changes (existing coalesce-by-label logic handles this correctly)
