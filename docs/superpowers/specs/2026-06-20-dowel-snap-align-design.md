# Dowel Snap-Align — Sub-project 3: Cap-to-Face Snapping

**Date:** 2026-06-20
**Status:** Approved design

## Context

The dowel (`CylinderPart`) primitive (SP1) and dowel cuts (SP2) are merged. The
face-to-face **snap-align** interaction exists but is **board-only**: `useSnap`
guards out non-board sources (`srcPart.kind !== 'board'`) and
`computeSnapTransform`/`computeFaceCorners` in `snapMath.ts` operate on
`BoardPart`. SP3 extends snapping to dowels.

| Sub-project | Contents | Status |
|---|---|---|
| 1. Dowel primitive + BOM | type, OCCT cylinder, mesh, viewport, BOM | Done |
| 2. Dowel cuts | end cuts, notches, bores | Done |
| **3. Dowel snap-align** | cap-to-face snapping, bidirectional | **This spec** |
| 4. Dowel 2D drawings | circle + rectangle orthographic views | Later cycle |

## Goal

A user can snap a dowel into place by one of its flat **end caps**: pick the cap,
then pick a target face (a board face or another dowel's cap), and the dowel
rotates so its cap seats flush against the target and translates so the cap
center lands at the clicked point. Snapping is **bidirectional** — a board (or
another dowel) can equally snap onto a dowel's cap. All snaps participate in
undo/redo and the existing chained-snap / rotation-flash behaviors.

## Existing snap machinery (what SP3 builds on)

- **`useSnap`** (`src/scene/useSnap.ts`): two-phase state machine — pick source
  face, then target face → `computeSnapTransform` → `onUpdate(srcId, {position,
  rotation}, 'Snap … to …')`. Chains (stays active), flashes on rotation
  (`onRotationSnap`), has a no-move guard, cancels if the source part is deleted.
- **`computeSnapTransform`** (`src/scene/snapMath.ts`, `BoardPart`-only): aligns
  source normal to `-targetNormal`, snaps roll to nearest 90°, positions source
  face center onto **target face center** (via `computeFaceCorners`).
- **`FaceHit`** (`src/scene/types.ts`): `{ partId, faceNormal, faceCenter,
  localFaceNormal, localHitPoint }` — emitted by the Viewport raycaster.

## Approach (chosen)

**Approach A — a separate `computeDowelSnapTransform` + kind-routing in
`useSnap`.** Dowel cap snapping is a *simpler, distinct* algorithm than board
snapping (no roll-snap; positions at the hit point, not the face center; cap
center is on the axis, not a rectangular face). A dedicated pure function keeps
each algorithm focused and independently testable, reuses the proven
normal-alignment quaternion step, and leaves the board path (and its
`computeFaceCorners`) untouched — zero regression risk. (Rejected: branching
inside `computeSnapTransform`, which tangles two algorithms; a unified
"snap-frame" abstraction, which is over-engineering for two kinds.)

Snapping only moves/rotates parts — **no geometry-kernel, `shapeKey`, worker, or
OCCT changes**.

## Design

### 1. `FaceHit` gains a world hit point (`src/scene/types.ts`)

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

- The raycaster already has this (`intersection.point`); it is populated for all
  hits.
- Only the dowel-source snap path consumes `hitPoint`. The board snap continues
  to use `faceCenter` (behavior unchanged).
- Every existing `FaceHit` construction and test fixture gains `hitPoint`
  (mechanical).

### 2. Snap-face validity (`src/scene/snapMath.ts`)

```ts
export function isSnapFace(part: Part, localFaceNormal: Vec3): boolean
```

- `board` → `true` for any of its six axis-aligned faces.
- `cylinder` → `true` only for a **cap** (`|localFaceNormal.z| ≈ 1`, e.g. `> 0.9`);
  `false` for the curved lateral surface.

Pure, unit-tested. Used by `useSnap` to gate both the source and target picks.

### 3. `computeDowelSnapTransform` (`src/scene/snapMath.ts`)

Pure, THREE-typed, browser-free — tested directly like `computeSnapTransform`.

```ts
export function computeDowelSnapTransform(
  sourceFace: FaceHit,
  targetFace: FaceHit,
  sourceDowel: CylinderPart,
  coaxial: boolean,
): { position: Vec3; rotation: Vec3 }
```

1. `Q_current` ← `sourceDowel.rotation` as a quaternion (Euler XYZ, `DEG2RAD`).
2. Source cap normal is **recomputed** here, NOT taken from
   `sourceFace.faceNormal` (which the raycaster may axis-round):
   `localCap = (0, 0, sign(sourceFace.localFaceNormal.z))`;
   `srcWorldNormal = localCap.applyQuaternion(Q_current)`. This keeps the
   transform self-contained and correct for a rotated source dowel.
3. `Q_normal = setFromUnitVectors(srcWorldNormal, negTarget)` where
   `negTarget = -targetFace.faceNormal`. Rotates the cap's outward world normal
   to oppose the target normal, so the cap seats *into* the target and the dowel
   body extends away. (Same quaternion step the board path uses.)
4. `Q_final = Q_normal · Q_current` → `newRotation` (Euler degrees, source's
   `rotationOrder`). **No roll-snap step** — a cylinder is rotationally symmetric
   about its axis.
5. Cap center in local frame: `(0, 0, length)` when `sourceFace.localFaceNormal.z
   > 0` (the `+Z` cap), else `(0, 0, 0)` (the `-Z` cap). The dowel axis passes
   through the local origin with the base at `z = 0` (SP1 convention).
6. Landing: `landing = coaxial ? targetFace.faceCenter : targetFace.hitPoint`.
   `coaxial` is true when the target is a dowel cap (seat coaxially at the cap
   center, for end-to-end joins) and false for a board face (seat at the clicked
   point). `newPosition = landing − (Q_final · capCenterLocal)` seats the cap
   center at `landing`. Independent of the dowel's current position (absolute
   placement).

Degenerate cases are handled by `setFromUnitVectors`: identity when the cap
already opposes the target; a 180° flip about an arbitrary perpendicular axis
when antiparallel — both correct for a rotationally symmetric dowel.

### 4. Viewport raycaster — emit `FaceHit`s for dowels (`src/render/viewport.tsx`)

**Current state (corrected during review):** `buildFaceHit` returns `null` for
any non-board part:

```ts
const part = currentParts.find((p) => p.id === partId)
if (!part || part.kind !== 'board') return null
```

So the raycaster emits **no** `FaceHit`s for dowels today. Two consequences:
SP3 must *extend* `buildFaceHit` to handle cylinders (not merely add `hitPoint`);
and this retroactively makes **SP2's dowel click-to-seed cuts functional** in the
live app (today `useAddCut`'s cylinder branch never receives a hit). This change
is therefore load-bearing for SP2 as well as SP3, and is the must-verify-live
piece.

Replace the non-board early-return with a `cylinder` branch. The board path
(axis-rounding the local + world normals via `Math.sign` of the dominant
component, then `computeLocalFaceCenter`) is **unchanged**. Dowels do NOT
axis-round — a cap's world normal must stay exact for a rotated dowel, and a
lateral normal is radial. From the local triangle normal `ln`:

- **Cap** (`|ln.z| > 0.9`): `localFaceNormal = (0, 0, sign(ln.z))`;
  `faceNormal = new THREE.Vector3(0,0,sign(ln.z)).transformDirection(mesh.matrixWorld)`
  (exact, normalized — NOT axis-rounded); `faceCenter` =
  `computeDowelLocalFaceCenter(localFaceNormal, part)` applied by
  `mesh.matrixWorld`; `localHitPoint`/`hitPoint` as for boards.
- **Lateral** (otherwise): `localFaceNormal = normalize(ln.x, ln.y, 0)` (the
  radial direction — used by add-cut's `dowelSurfaceFromNormal`; the cut's
  azimuth/position come from `localHitPoint`); `faceNormal =
  ln.transformDirection(mesh.matrixWorld)`; `faceCenter` = the world hit point
  (placeholder — `isSnapFace` rejects lateral faces for snap); `hitPoint =
  intersection.point`.

```ts
export function computeDowelLocalFaceCenter(localFaceNormal: Vec3, dowel: CylinderPart): Vec3
// localFaceNormal.z > 0 → { x: 0, y: 0, z: dowel.length }   (the +Z cap)
// else                  → { x: 0, y: 0, z: 0 }              (the -Z cap)
```

`computeDowelLocalFaceCenter` and `isSnapFace` are pure and unit-tested; the
`buildFaceHit` cylinder branch is integration (THREE + `matrixWorld`), verified
by the live spike. Boards are unchanged aside from `hitPoint` now being
populated.

### 5. Interaction (`src/scene/useSnap.ts`)

- Remove the `srcPart.kind !== 'board'` guard.
- **Source pick:** set the source only if `isSnapFace(srcPart, hit.localFaceNormal)`.
  Clicking a dowel's curved side during snap is ignored (no source set).
- **Target pick:** reject if `!isSnapFace(targetPart, hit.localFaceNormal)`.
- **Route by source kind:** look up the target part (`parts.find(p => p.id ===
  hit.partId)`). `board` source → `computeSnapTransform`; `cylinder` source →
  `computeDowelSnapTransform(srcFace, hit, srcPart, coaxial)` where `coaxial =
  targetPart.kind === 'cylinder'` (a dowel snapping onto a dowel cap seats
  coaxially; onto a board face it seats at the clicked point). The target may be
  any flat face. This delivers the bidirectional behavior: a board snapping onto
  a dowel cap uses the existing board transform with the cap's `faceCenter`; a
  dowel snapping onto a board face or another cap uses the dowel transform.
- Unchanged: the no-move guard, chained snaps, `onRotationSnap` flash, the
  `Snap {src} to {tgt}` history label, and undo/redo via `onUpdate`.

### 6. Testing

- **`snapMath.test.ts`** — `computeDowelSnapTransform`: cap normal ends up
  opposing the target normal; with `coaxial=false` the cap center lands at
  `targetFace.hitPoint`; with `coaxial=true` it lands at `targetFace.faceCenter`;
  `+Z` vs `-Z` cap; a pre-rotated source dowel (verifies the recomputed normal);
  an antiparallel/degenerate target. `isSnapFace`: board any-face true, dowel cap
  true, dowel lateral false. `computeDowelLocalFaceCenter`: `+Z`→`(0,0,length)`,
  `-Z`→`(0,0,0)`.
- **`useSnap.test.ts`** — dowel source cap → board face (`coaxial=false`, asserts
  `onUpdate` with expected position/rotation); dowel source cap → dowel cap
  (`coaxial=true`, seats at target cap center); dowel lateral rejected as source
  and as target; **board source → dowel cap** (bidirectional); chained snap;
  source-deleted cancel.
- Existing board snap tests stay green (zero regression) plus the mechanical
  `hitPoint` fixture additions.
- The `buildFaceHit` cylinder branch is integration (THREE + `matrixWorld`, not
  unit-tested) — matching the existing board path; dowel cap-center math is
  covered via `computeDowelLocalFaceCenter`. The **live spike must verify both**
  dowel snapping AND (now-enabled) SP2 dowel click-to-seed cuts.

### 7. Out of scope (deferred)

- **Lateral / side-lay snapping** (dowel lying tangent on a face) — a distinct
  cylindrical-contact problem.
- **Snapping by a mitred end** — cap detection requires a ±Z local normal, so a
  non-square (cut) end is not a snap source; snapping uses the **nominal** square
  cap and ignores end cuts. Known simplification.
- **2D drawings for dowels** (SP4).
- No geometry-kernel / `shapeKey` / worker / OCCT changes (snap only
  moves/rotates).

## Open decisions resolved with the user

- Snap surface: **cap-to-face only** (lateral excluded).
- Landing point: a dowel cap onto a **board face** seats at the **clicked hit
  point**; a dowel cap onto **another dowel cap** seats **coaxially** at the
  target cap center (end-to-end). Board source keeps face-center behavior.
- Direction: **bidirectional** (dowel→face and face→dowel-cap).
- Architecture: **Approach A** — separate `computeDowelSnapTransform` + kind
  routing; board path untouched.
- No roll-snap for a dowel (rotational symmetry).
- **Review correction:** the raycaster (`buildFaceHit`) currently returns `null`
  for non-board parts — it emits no dowel hits at all. SP3 extends it to dowels,
  which also makes SP2's dowel click-to-seed cuts functional live. The dowel snap
  transform recomputes the source cap normal from the dowel's rotation rather
  than trusting the raycaster's axis-rounded `faceNormal`.
