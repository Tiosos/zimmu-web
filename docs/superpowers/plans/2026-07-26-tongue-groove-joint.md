# Tongue & Groove Joint (JP7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an edge-to-edge tongue & groove joint — the 7th joint type and 7th viewport gesture mode — where two equal-thickness coplanar boards meet along a long edge, one carrying a full-length groove and the other a centered tongue that seats into it.

**Architecture:** A pure-geometry module (`src/geom/tonguegroove.ts`) computes a groove `BoxCut` on one board and two symmetric shoulder `BoxCut`s (leaving a centered tongue) on the other, plus an edge seat, gated by a validity check — mirroring `fingerjoint.ts`. It plugs into the existing `Joint` framework: the `deriveJoint` dispatcher, the `reconcileJoints` distributor, the `useInteractionMode` coordinator (adding a mode = one gesture hook + one registry entry + a keyboard case + Sidebar props — Viewport untouched), and a `JointsPanel` editor branch. Every cut is an ordinary axis-aligned `BoxCut`, so meshing/STL/STEP/drawings are unchanged.

**Tech Stack:** React 19 + TypeScript (strict), Three.js (world-direction math only), Vitest + happy-dom + @testing-library/react. Package manager: **pnpm**.

---

## Conventions for the implementer

- **Board local frame:** `[0,length] × [0,width] × [0,thickness]` = X (length) × Y (width) × Z (thickness). Thickness is **always** local Z.
- **Long edge:** a length×thickness face — outward normal along ±width — so `grooveEdge`/`tongueEdge ∈ {'+Y','-Y'}` and `faceAxes(edge).depth === 'y'`. Derived axes: `depth='y'` (into board), `u='x'` (length = run), `v='z'` (thickness = narrow, tongue centered here).
- **Run all checks before each commit:** the repo has a pre-commit hook that runs `pnpm typecheck`. Write/Edit of a `*.test.ts` auto-runs that test file; Write/Edit of any `.ts/.tsx` auto-runs Prettier. Still run the commands explicitly as written.
- **Git identity** must be `Claude <noreply@anthropic.com>` (already configured in this clone). Commit on the current feature branch; never on `main`.
- **Single test file:** `pnpm vitest run <path>`. **Full suite:** `pnpm test`. **Types:** `pnpm typecheck`. **Lint:** `pnpm lint`.

---

## Task 1: `TongueGrooveJoint` type + `tonguegroove.ts` geometry (standalone)

The type is added but **not** yet in the `Joint` union (that lands in Task 2), so nothing else in the app changes. The geometry module is self-contained and fully tested here.

**Files:**
- Modify: `src/scene/types.ts` (add interface after `FingerJoint`, ~line 180; do **not** touch the `Joint` union yet)
- Create: `src/geom/tonguegroove.ts`
- Create: `src/geom/tonguegroove.test.ts`

- [ ] **Step 1: Add the `TongueGrooveJoint` interface (not in the union yet)**

In `src/scene/types.ts`, immediately after the `FingerJoint` interface (the one ending `clearance: number // mm — widens each cut slot for fit (default 0)\n}`) and **before** `export type Joint = …`, insert:

```ts
export interface TongueGrooveJoint {
  kind: 'tongue-groove'
  id: string // "joint_<uuid>"
  label: string // "Tongue & groove 1"
  groovePartId: PartId // board carrying the groove — stays put (first click)
  grooveEdge: Face // the long edge (±Y) the groove is cut into
  tonguePartId: PartId // board carrying the centered tongue — auto-seats (second click)
  tongueEdge: Face // the long edge (±Y) the tongue is formed on
  tongueThickness: number // mm — tongue thickness = groove width (before clearance)
  tongueDepth: number // mm — tongue projection = groove depth
  clearance: number // mm — added to groove width for fit (default 0)
}
```

Leave `export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint` unchanged.

- [ ] **Step 2: Write the failing geometry test**

Create `src/geom/tonguegroove.test.ts`:

```ts
import { test, expect } from 'vitest'
import type { BoardPart, Part, TongueGrooveJoint } from '../scene/types'
import {
  isValidTongueGroove,
  computeGrooveCut,
  computeTongueShoulders,
  computeTongueGrooveSeat,
  deriveTongueGroove,
} from './tonguegroove'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'

// Groove board: 800×150×18 at origin, unrotated. Its +Y long edge (world y=150) carries the groove.
const GROOVE: BoardPart = {
  kind: 'board',
  id: 'G',
  label: 'G',
  length: 800,
  width: 150,
  thickness: 18,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
// Tongue board: same size, unrotated, placed on the +Y side (y=160) with its -Y edge facing the groove.
const TONGUE: BoardPart = {
  ...GROOVE,
  id: 'T',
  label: 'T',
  position: { x: 0, y: 160, z: 0 },
}
const parts: Part[] = [GROOVE, TONGUE]
const joint: TongueGrooveJoint = {
  kind: 'tongue-groove',
  id: 'j1',
  label: 'Tongue & groove 1',
  groovePartId: 'G',
  grooveEdge: '+Y',
  tonguePartId: 'T',
  tongueEdge: '-Y',
  tongueThickness: 6,
  tongueDepth: 8,
  clearance: 0,
}

test('isValidTongueGroove: coplanar equal-thickness facing long edges are valid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', TONGUE, '-Y')).toBe(true)
})
test('isValidTongueGroove: a non-edge face (end +X) is invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+X', TONGUE, '-Y')).toBe(false)
})
test('isValidTongueGroove: a broad face (+Z) is invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', TONGUE, '+Z')).toBe(false)
})
test('isValidTongueGroove: parallel (non-facing) edges are invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', TONGUE, '+Y')).toBe(false)
})
test('isValidTongueGroove: unequal thickness is invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', { ...TONGUE, thickness: 20 }, '-Y')).toBe(false)
})
test('isValidTongueGroove: a non-axis-aligned board is invalid', () => {
  expect(isValidTongueGroove(GROOVE, '+Y', { ...TONGUE, rotation: { x: 0, y: 0, z: 30 } }, '-Y')).toBe(
    false,
  )
})
test('isValidTongueGroove: perpendicular thickness axes (rotated y:90) is invalid', () => {
  // local -Y still → world -Y (facing), but local Z (thickness) → world X, not coplanar with groove.
  expect(isValidTongueGroove(GROOVE, '+Y', { ...TONGUE, rotation: { x: 0, y: 90, z: 0 } }, '-Y')).toBe(
    false,
  )
})

test('computeGrooveCut: centered through groove on the +Y edge', () => {
  const cut = computeGrooveCut(GROOVE, joint)
  expect(cut.face).toBe('+Y')
  expect(cut.size).toEqual({ x: 800, y: 8, z: 6 }) // full length, depth 8, width = tongueThickness
  expect(cut.position).toEqual({ x: 0, y: 142, z: 6 }) // y = 150-8; z = 18/2 - 6/2 (centered)
  expect(cut.id).toBe('cut_j1_groove')
  expect(cut.sourceJointId).toBe('j1')
})
test('computeGrooveCut: clearance widens the groove across thickness only', () => {
  const cut = computeGrooveCut(GROOVE, { ...joint, clearance: 2 })
  expect(cut.size).toEqual({ x: 800, y: 8, z: 8 }) // z width 6+2
  expect(cut.position).toEqual({ x: 0, y: 142, z: 5 }) // recentered: 9 - 8/2
})

test('computeTongueShoulders: two symmetric shoulders leave a centered tongue', () => {
  const cuts = computeTongueShoulders(TONGUE, joint)
  expect(cuts).toHaveLength(2)
  const s0 = cuts.find((c) => c.id === 'cut_j1_shoulder0')!
  const s1 = cuts.find((c) => c.id === 'cut_j1_shoulder1')!
  expect(s0.face).toBe('-Y')
  expect(s0.size).toEqual({ x: 800, y: 8, z: 6 })
  expect(s0.position).toEqual({ x: 0, y: 0, z: 0 }) // -Z shoulder removes z∈[0,6]
  expect(s1.size).toEqual({ x: 800, y: 8, z: 6 })
  expect(s1.position).toEqual({ x: 0, y: 0, z: 12 }) // +Z shoulder removes z∈[12,18]; tongue = z∈[6,12]
})

test('computeTongueGrooveSeat: seats the tongue 8mm into the groove, idempotent', () => {
  const seat = computeTongueGrooveSeat(GROOVE, TONGUE, joint)
  expect(seat.position.x).toBeCloseTo(0, 6)
  expect(seat.position.y).toBeCloseTo(142, 6) // tongue -Y edge lands at the groove bottom (150-8)
  expect(seat.position.z).toBeCloseTo(0, 6)
  const again = computeTongueGrooveSeat(GROOVE, { ...TONGUE, position: seat.position }, joint)
  expect(again.position.y).toBeCloseTo(142, 6)
})

test('deriveTongueGroove: 3 cuts (1 groove + 2 shoulders) split across both boards + a seat', () => {
  const r = deriveTongueGroove(joint, parts)
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(3)
  expect(r!.cuts.filter((c) => c.partId === 'G')).toHaveLength(1)
  expect(r!.cuts.filter((c) => c.partId === 'T')).toHaveLength(2)
  expect(r!.seat!.partId).toBe('T')
})
test('deriveTongueGroove: stale (unequal thickness) returns null', () => {
  expect(deriveTongueGroove(joint, [GROOVE, { ...TONGUE, thickness: 20 }])).toBeNull()
})

test('deriveTongueGroove: rotated tongue board (z:180, anti-parallel length) still closes the joint', () => {
  // rotate 180° about Z: local Z (thickness) preserved → still coplanar; local +Y face → world -Y,
  // so tongueEdge must be '+Y' to face the groove board's +Y edge; local X (length) → world -X.
  const Trot: BoardPart = { ...TONGUE, rotation: { x: 0, y: 0, z: 180 } }
  const jrot: TongueGrooveJoint = { ...joint, tongueEdge: '+Y' }
  expect(isValidTongueGroove(GROOVE, '+Y', Trot, '+Y')).toBe(true)
  const r = deriveTongueGroove(jrot, [GROOVE, Trot])
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(3)
  // The seated tongue-edge face center must land at the groove bottom (world y=142) and the groove
  // thickness mid-plane (world z=9), regardless of the tongue board's rotation.
  const seated: BoardPart = { ...Trot, position: r!.seat!.position }
  const m = composeWorldMatrix(seated)
  // '+Y' local face center of an 800×150×18 board = (400,150,9)
  const [, ey, ez] = applyMatrixToPoint(m, 400, 150, 9)
  expect(ey).toBeCloseTo(142, 6)
  expect(ez).toBeCloseTo(9, 6)
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run src/geom/tonguegroove.test.ts`
Expected: FAIL — `Failed to resolve import "./tonguegroove"` (module not created yet).

- [ ] **Step 4: Write the geometry module**

Create `src/geom/tonguegroove.ts`:

```ts
import * as THREE from 'three'
import type { BoardPart, BoxCut, CutId, Face, Part, Vec3 } from '../scene/types'
import type { TongueGrooveJoint } from '../scene/types'
import type { DeriveResult, DerivedCut } from './dado'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'

const DEG2RAD = Math.PI / 180
type Axis = 'x' | 'y' | 'z'
const EPS = 1e-4
const THICK_EPS = 0.01

const FACE_NORMALS: Record<Face, Vec3> = {
  '+X': { x: 1, y: 0, z: 0 },
  '-X': { x: -1, y: 0, z: 0 },
  '+Y': { x: 0, y: 1, z: 0 },
  '-Y': { x: 0, y: -1, z: 0 },
  '+Z': { x: 0, y: 0, z: 1 },
  '-Z': { x: 0, y: 0, z: -1 },
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
function boardDims(b: BoardPart): Record<Axis, number> {
  return { x: b.length, y: b.width, z: b.thickness }
}
function unitVec(a: Axis): Vec3 {
  return { x: a === 'x' ? 1 : 0, y: a === 'y' ? 1 : 0, z: a === 'z' ? 1 : 0 }
}
function localDirToWorld(part: BoardPart, dir: Vec3): THREE.Vector3 {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      part.rotation.x * DEG2RAD,
      part.rotation.y * DEG2RAD,
      part.rotation.z * DEG2RAD,
      part.rotationOrder,
    ),
  )
  return new THREE.Vector3(dir.x, dir.y, dir.z).applyQuaternion(q)
}
function isAxisAligned(b: BoardPart): boolean {
  const m = composeWorldMatrix(b)
  const cols = [
    [m[0], m[1], m[2]],
    [m[4], m[5], m[6]],
    [m[8], m[9], m[10]],
  ]
  return cols.every((c) => Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])) >= 1 - EPS)
}
function worldPoint(m: Float64Array, p: Vec3): THREE.Vector3 {
  const [x, y, z] = applyMatrixToPoint(m, p.x, p.y, p.z)
  return new THREE.Vector3(x, y, z)
}

export function isValidTongueGroove(
  groove: BoardPart,
  grooveEdge: Face,
  tongue: BoardPart,
  tongueEdge: Face,
): boolean {
  if (!isAxisAligned(groove) || !isAxisAligned(tongue)) return false
  // Both faces must be long edges (their depth axis is width = local Y).
  if (faceAxes(grooveEdge).depth !== 'y' || faceAxes(tongueEdge).depth !== 'y') return false
  // Edges must face each other (anti-parallel world normals).
  const nG = localDirToWorld(groove, FACE_NORMALS[grooveEdge])
  const nT = localDirToWorld(tongue, FACE_NORMALS[tongueEdge])
  if (nG.dot(nT) > -(1 - EPS)) return false
  // Boards must be coplanar: thickness axes parallel (else it's a T-meeting, not a glue-up).
  const zG = localDirToWorld(groove, unitVec('z'))
  const zT = localDirToWorld(tongue, unitVec('z'))
  if (Math.abs(zG.dot(zT)) < 1 - EPS) return false
  // A centered tongue only meets a centered groove when thicknesses match.
  return Math.abs(groove.thickness - tongue.thickness) < THICK_EPS
}

export function computeGrooveCut(groove: BoardPart, joint: TongueGrooveJoint): BoxCut {
  const { depth: depthAx, u: runAx, v: narrowAx } = faceAxes(joint.grooveEdge)
  const dim = boardDims(groove)
  const width = clamp(joint.tongueThickness, 0.1, dim[narrowAx] - 0.1) + joint.clearance
  const depth = clamp(joint.tongueDepth, 0.1, dim[depthAx] - 1)
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[runAx] = dim[runAx] // full length (through groove)
  size[depthAx] = depth
  size[narrowAx] = width
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[runAx] = 0
  position[depthAx] = joint.grooveEdge.startsWith('+') ? dim[depthAx] - depth : 0
  position[narrowAx] = dim[narrowAx] / 2 - width / 2 // centered in thickness
  return {
    kind: 'box',
    id: `cut_${joint.id}_groove` as CutId,
    label: `${joint.label} groove`,
    face: joint.grooveEdge,
    position,
    size,
    sourceJointId: joint.id,
  }
}

export function computeTongueShoulders(tongue: BoardPart, joint: TongueGrooveJoint): BoxCut[] {
  const { depth: depthAx, u: runAx, v: narrowAx } = faceAxes(joint.tongueEdge)
  const dim = boardDims(tongue)
  const t = clamp(joint.tongueThickness, 0.1, dim[narrowAx] - 0.1)
  const shoulder = (dim[narrowAx] - t) / 2
  const depth = clamp(joint.tongueDepth, 0.1, dim[depthAx] - 1)
  const posDepth = joint.tongueEdge.startsWith('+') ? dim[depthAx] - depth : 0
  const mk = (side: 0 | 1): BoxCut => {
    const size: Vec3 = { x: 0, y: 0, z: 0 }
    size[runAx] = dim[runAx]
    size[depthAx] = depth
    size[narrowAx] = shoulder
    const position: Vec3 = { x: 0, y: 0, z: 0 }
    position[runAx] = 0
    position[depthAx] = posDepth
    position[narrowAx] = side === 0 ? 0 : dim[narrowAx] - shoulder
    return {
      kind: 'box',
      id: `cut_${joint.id}_shoulder${side}` as CutId,
      label: `${joint.label} shoulder`,
      face: joint.tongueEdge,
      position,
      size,
      sourceJointId: joint.id,
    }
  }
  return [mk(0), mk(1)]
}

// Seats the tongue board so its tongue enters the groove: tongue edge → groove bottom (along the
// groove edge normal), thickness mid-planes aligned, length preserved. Minimal & idempotent.
export function computeTongueGrooveSeat(
  groove: BoardPart,
  tongue: BoardPart,
  joint: TongueGrooveJoint,
): { position: Vec3 } {
  const mG = composeWorldMatrix(groove)
  const mT = composeWorldMatrix(tongue)
  const depth = clamp(joint.tongueDepth, 0.1, groove.width - 1)

  const nG = localDirToWorld(groove, FACE_NORMALS[joint.grooveEdge]) // groove edge normal (world)
  const tG = localDirToWorld(groove, unitVec('z')) // groove thickness normal (world)

  const gEdgeCenter = worldPoint(mG, computeLocalFaceCenter(FACE_NORMALS[joint.grooveEdge], groove))
  const gCenter = worldPoint(mG, {
    x: groove.length / 2,
    y: groove.width / 2,
    z: groove.thickness / 2,
  })
  const tEdgeCenter = worldPoint(mT, computeLocalFaceCenter(FACE_NORMALS[joint.tongueEdge], tongue))

  const desiredNG = gEdgeCenter.dot(nG) - depth // tongue tip seats to the groove bottom
  const desiredTG = gCenter.dot(tG) // thickness mid-planes coincide

  const desired = tEdgeCenter.clone()
  desired.addScaledVector(nG, desiredNG - tEdgeCenter.dot(nG))
  desired.addScaledVector(tG, desiredTG - tEdgeCenter.dot(tG))
  // The third world axis (the groove's run/length direction) is left untouched → length preserved.

  return {
    position: {
      x: tongue.position.x + (desired.x - tEdgeCenter.x),
      y: tongue.position.y + (desired.y - tEdgeCenter.y),
      z: tongue.position.z + (desired.z - tEdgeCenter.z),
    },
  }
}

export function deriveTongueGroove(joint: TongueGrooveJoint, parts: Part[]): DeriveResult | null {
  const groove = parts.find((p) => p.id === joint.groovePartId)
  const tongue = parts.find((p) => p.id === joint.tonguePartId)
  if (groove?.kind !== 'board' || tongue?.kind !== 'board') return null
  if (!isValidTongueGroove(groove, joint.grooveEdge, tongue, joint.tongueEdge)) return null
  const cuts: DerivedCut[] = [
    { partId: groove.id, cut: computeGrooveCut(groove, joint) },
    ...computeTongueShoulders(tongue, joint).map((cut) => ({ partId: tongue.id, cut })),
  ]
  const seat = {
    partId: tongue.id,
    position: computeTongueGrooveSeat(groove, tongue, joint).position,
  }
  return { cuts, seat }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/geom/tonguegroove.test.ts`
Expected: PASS (all ~14 tests green).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (The `Joint` union is unchanged, so `deriveJoint`'s exhaustive switch still compiles; `TongueGrooveJoint` is an unused-by-app type, which is fine — it's exported and referenced by the new module/test.)

- [ ] **Step 7: Commit**

```bash
git add src/scene/types.ts src/geom/tonguegroove.ts src/geom/tonguegroove.test.ts
git commit -m "feat(geom): tongue & groove joint geometry + TongueGrooveJoint type"
```

---

## Task 2: Wire into the `Joint` union + dispatcher + file format

Extending the union forces three type sites: `deriveJoint` (must return for the new kind), `jointInvolves` (property access), and `JointsPanel` (fallthrough narrows). Handle all three plus the `parseFile` default here so typecheck stays green.

**Files:**
- Modify: `src/scene/types.ts:182` (the `Joint` union)
- Modify: `src/geom/dado.ts:267-278` (`deriveJoint` switch) + import
- Modify: `src/scene/jointInvolves.ts` (explicit arm)
- Modify: `src/scene/useFile.ts:77-79` (parseFile default) + `FILE_FORMAT_VERSION`
- Modify: `src/ui/JointsPanel.tsx` (stub branch to keep the dado fallthrough narrowed)
- Test: `src/geom/dado.test.ts` (dispatch test)

- [ ] **Step 1: Extend the `Joint` union**

In `src/scene/types.ts`, change:

```ts
export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint
```

to:

```ts
export type Joint =
  | DadoJoint
  | HalfLapJoint
  | MortiseTenonJoint
  | FingerJoint
  | TongueGrooveJoint
```

- [ ] **Step 2: Add the `deriveJoint` dispatch arm**

In `src/geom/dado.ts`, add the import near the other joint imports (after line 17 `import { deriveFingerJoint } from './fingerjoint'`):

```ts
import { deriveTongueGroove } from './tonguegroove'
```

Then in the `deriveJoint` switch (currently ending with the `finger` case), add a case:

```ts
    case 'finger':
      return deriveFingerJoint(joint, parts)
    case 'tongue-groove':
      return deriveTongueGroove(joint, parts)
  }
}
```

- [ ] **Step 3: Add the `jointInvolves` arm**

In `src/scene/jointInvolves.ts`, add before the final `return`:

```ts
  if (joint.kind === 'mortise-tenon')
    return joint.mortisePartId === partId || joint.tenonPartId === partId
  if (joint.kind === 'tongue-groove')
    return joint.groovePartId === partId || joint.tonguePartId === partId
  return joint.partAId === partId || joint.partBId === partId
```

- [ ] **Step 4: Bump the file format version + add the parseFile default**

In `src/scene/useFile.ts`, change line 5:

```ts
export const FILE_FORMAT_VERSION = 10
```

Then update the joint-defaulting comment block and add a `tongue-groove` arm as the **first** branch (line ~76-79):

```ts
      // v6→v7: half-lap joints (kind 'halflap'); legacy joints are all dados.
      // v7→v8: mortise-tenon joints (kind 'mortise-tenon').
      // v8→v9: finger joints (kind 'finger').
      // v9→v10: tongue-groove joints (kind 'tongue-groove').
      joints: ((raw.scene.joints ?? []) as unknown as Array<Record<string, unknown>>).map((j) =>
        j.kind === 'tongue-groove'
          ? ({ tongueThickness: 6, tongueDepth: 8, clearance: 0, ...j } as unknown as Joint)
          : j.kind === 'finger'
            ? ({ fingerCount: 0, clearance: 0, ...j } as unknown as Joint)
            : j.kind === 'mortise-tenon'
```

(Leave the rest of the ternary chain — `mortise-tenon`, `halflap`, dado default — unchanged.)

- [ ] **Step 5: Add a stub `tongue-groove` branch to `JointsPanel` (real controls land in Task 6)**

In `src/ui/JointsPanel.tsx`, immediately after the `if (j.kind === 'finger') { … }` block closes (line ~273) and **before** the dado fallthrough (`const isHousing = …`), insert:

```tsx
        if (j.kind === 'tongue-groove') {
          return <div key={j.id} />
        }
```

This keeps the dado fallthrough narrowed to `DadoJoint` so `j.housingPartId` still typechecks.

- [ ] **Step 6: Write the dispatch test**

In `src/geom/dado.test.ts`, add at the end of the file:

```ts
test('deriveJoint dispatches tongue-groove to the tongue-groove deriver', () => {
  const g: BoardPart = {
    ...housing,
    id: 'TG',
    length: 800,
    width: 150,
    thickness: 18,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }
  const t: BoardPart = { ...g, id: 'TT', position: { x: 0, y: 160, z: 0 } }
  const tg: Joint = {
    kind: 'tongue-groove',
    id: 'jtg',
    label: 'Tongue & groove 1',
    groovePartId: 'TG',
    grooveEdge: '+Y',
    tonguePartId: 'TT',
    tongueEdge: '-Y',
    tongueThickness: 6,
    tongueDepth: 8,
    clearance: 0,
  }
  const r = deriveJoint(tg, [g, t])
  expect(r).not.toBeNull()
  expect(r!.cuts).toHaveLength(3)
  expect(r!.seat!.partId).toBe('TT')
})
```

If `BoardPart` or `Joint` are not already imported in `dado.test.ts`, add them to the existing `import type { … } from '../scene/types'` line (check the top of the file — `housing` is a `BoardPart`, so the import likely exists; add `Joint` if missing).

- [ ] **Step 7: Run the affected tests**

Run: `pnpm vitest run src/geom/dado.test.ts src/geom/tonguegroove.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (If lint flags the stub `<div key={j.id} />` as needing something, it will not — it's valid JSX. If it flags an unused import, remove it.)

- [ ] **Step 9: Commit**

```bash
git add src/scene/types.ts src/geom/dado.ts src/scene/jointInvolves.ts src/scene/useFile.ts src/ui/JointsPanel.tsx src/geom/dado.test.ts
git commit -m "feat(joints): dispatch tongue & groove; Joint union += TongueGrooveJoint"
```

---

## Task 3: `onAddTongueGroove` scene creator + kind-aware remove label

**Files:**
- Modify: `src/scene/useScene.ts` (Params interface ~line 98; creator after `onAddFingerJoint` ~line 1003; `onRemoveJoint` label ~line 1024; return object ~line 1133) + imports
- Test: `src/scene/useScene.test.ts` (creator test after the finger test ~line 1753)

- [ ] **Step 1: Ensure the imports exist**

At the top of `src/scene/useScene.ts`, confirm these are imported (add any missing):
- `isValidTongueGroove` from `../geom/tonguegroove`
- `faceAxes` and `localNormalToFaceString` from `./snapMath` (already imported — `onAddFingerJoint` uses both)

Add to the geom imports:

```ts
import { isValidTongueGroove } from '../geom/tonguegroove'
```

- [ ] **Step 2: Declare `onAddTongueGroove` in `UseSceneResult`**

In the result interface, after `onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void` (line 98), add:

```ts
  onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void
  onAddTongueGroove: (grooveHit: FaceHit, tongueHit: FaceHit) => void
```

- [ ] **Step 3: Write the failing scene test**

In `src/scene/useScene.test.ts`, inside the same `describe` block as the finger test, add after the `onAddFingerJoint …` test (after line 1753 `})`):

```ts
  it('onAddTongueGroove creates a tongue-groove joint + cuts on both boards + seat in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [Gb, Tb] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(
        Gb.id,
        (p) => ({
          ...p,
          length: 800,
          width: 150,
          thickness: 18,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        }),
        'g',
      )
      result.current.onUpdate(
        Tb.id,
        (p) => ({
          ...p,
          length: 800,
          width: 150,
          thickness: 18,
          position: { x: 0, y: 160, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        }),
        't',
      )
    })
    await act(async () => {
      result.current.onAddTongueGroove(
        hit(Gb.id, { x: 0, y: 1, z: 0 }), // groove board +Y edge
        hit(Tb.id, { x: 0, y: -1, z: 0 }), // tongue board -Y edge
      )
    })
    expect(result.current.scene.joints).toHaveLength(1)
    expect(result.current.scene.joints[0].kind).toBe('tongue-groove')
    const jointCuts = () =>
      result.current.scene.parts
        .filter((p) => p.kind === 'board')
        .reduce(
          (n, p) =>
            n +
            (p.kind === 'board'
              ? p.cuts.filter((c) => c.kind === 'box' && c.sourceJointId).length
              : 0),
          0,
        )
    expect(jointCuts()).toBe(3) // 1 groove + 2 shoulders

    await act(async () => result.current.undo())
    expect(result.current.scene.joints).toHaveLength(0)
    expect(jointCuts()).toBe(0)
  })
```

(The `hit` helper already exists in this test file — it is used by the finger test above.)

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/useScene.test.ts -t 'onAddTongueGroove'`
Expected: FAIL — `result.current.onAddTongueGroove is not a function`.

- [ ] **Step 5: Implement the creator**

In `src/scene/useScene.ts`, immediately after the `onAddFingerJoint` `useCallback` block ends (line 1003, after its `)`), insert:

```ts
  const onAddTongueGroove = useCallback(
    (grooveHit: FaceHit, tongueHit: FaceHit) => {
      const s = sceneRef.current
      const groove = s.parts.find((p) => p.id === grooveHit.partId)
      const tongue = s.parts.find((p) => p.id === tongueHit.partId)
      if (groove?.kind !== 'board' || tongue?.kind !== 'board' || groove.id === tongue.id) return
      const grooveEdge = localNormalToFaceString(grooveHit.localFaceNormal)
      const tongueEdge = localNormalToFaceString(tongueHit.localFaceNormal)
      if (!isValidTongueGroove(groove, grooveEdge, tongue, tongueEdge)) return
      const n = s.joints.filter((j) => j.kind === 'tongue-groove').length + 1
      const tongueThickness = Math.min(Math.max(3, Math.round(groove.thickness / 3)), groove.thickness - 2)
      const tongueDepth = Math.min(
        Math.max(3, 8),
        Math.floor(Math.min(groove.width, tongue.width) / 2) - 1,
      )
      const joint: Joint = {
        kind: 'tongue-groove',
        id: `joint_${crypto.randomUUID()}`,
        label: `Tongue & groove ${n}`,
        groovePartId: groove.id,
        grooveEdge,
        tonguePartId: tongue.id,
        tongueEdge,
        tongueThickness,
        tongueDepth,
        clearance: 0,
      }
      commitReconciled(
        (prev) => ({ ...prev, joints: [...prev.joints, joint] }),
        'Add tongue & groove',
      )
      setSelectedId(groove.id)
    },
    [commitReconciled],
  )
```

- [ ] **Step 6: Extend the kind-aware remove label**

In `onRemoveJoint` (line ~1024), change:

```ts
      const label =
        joint.kind === 'finger'
          ? 'Remove finger joint'
          : joint.kind === 'mortise-tenon'
```

to:

```ts
      const label =
        joint.kind === 'tongue-groove'
          ? 'Remove tongue & groove'
          : joint.kind === 'finger'
            ? 'Remove finger joint'
            : joint.kind === 'mortise-tenon'
              ? 'Remove mortise & tenon'
              : joint.kind === 'halflap'
                ? 'Remove half-lap'
                : 'Remove dado'
```

(Re-indent the existing `finger`/`mortise-tenon`/`halflap`/dado arms one level deeper so the ternary chain nests correctly; the values are unchanged.)

- [ ] **Step 7: Export `onAddTongueGroove` from the hook**

In the returned object (line ~1133), after `onAddFingerJoint,` add:

```ts
    onAddFingerJoint,
    onAddTongueGroove,
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/useScene.test.ts -t 'onAddTongueGroove'`
Expected: PASS.

- [ ] **Step 9: Typecheck + full scene test**

Run: `pnpm typecheck && pnpm vitest run src/scene/useScene.test.ts`
Expected: no type errors; all scene tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat(scene): onAddTongueGroove + kind-aware remove label"
```

---

## Task 4: `useAddTongueGroove` two-click gesture hook

**Files:**
- Create: `src/scene/useAddTongueGroove.ts`
- Create: `src/scene/useAddTongueGroove.test.ts`

- [ ] **Step 1: Write the failing gesture test**

Create `src/scene/useAddTongueGroove.test.ts`:

```ts
import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useAddTongueGroove } from './useAddTongueGroove'

const groove: Part = {
  kind: 'board',
  id: 'G',
  label: 'G',
  length: 800,
  width: 150,
  thickness: 18,
  material: '',
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
  visible: true,
}
const tongue: Part = { ...groove, id: 'T', position: { x: 0, y: 160, z: 0 } }
const hit = (partId: string, n: { x: number; y: number; z: number }): FaceHit => ({
  partId,
  faceNormal: n,
  faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: n,
  localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 0 },
})

test('two facing long edges create a tongue & groove joint', () => {
  const onAddTongueGroove = vi.fn()
  const { result } = renderHook(() =>
    useAddTongueGroove({ parts: [groove, tongue], onAddTongueGroove }),
  )
  act(() => result.current.activateTongueGroove())
  act(() => result.current.onFaceClick(hit('G', { x: 0, y: 1, z: 0 })))
  expect(onAddTongueGroove).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('T', { x: 0, y: -1, z: 0 })))
  expect(onAddTongueGroove).toHaveBeenCalledTimes(1)
})

test('a second click on the same board does not create a joint', () => {
  const onAddTongueGroove = vi.fn()
  const { result } = renderHook(() =>
    useAddTongueGroove({ parts: [groove, tongue], onAddTongueGroove }),
  )
  act(() => result.current.activateTongueGroove())
  act(() => result.current.onFaceClick(hit('G', { x: 0, y: 1, z: 0 })))
  act(() => result.current.onFaceClick(hit('G', { x: 0, y: 1, z: 0 })))
  expect(onAddTongueGroove).not.toHaveBeenCalled()
  expect(result.current.pendingA).toBeNull()
  expect(result.current.statusMessage).toMatch(/different board/i)
})

test('a non-facing second edge (parallel end) does not create a joint', () => {
  const onAddTongueGroove = vi.fn()
  const { result } = renderHook(() =>
    useAddTongueGroove({ parts: [groove, tongue], onAddTongueGroove }),
  )
  act(() => result.current.activateTongueGroove())
  act(() => result.current.onFaceClick(hit('G', { x: 0, y: 1, z: 0 })))
  act(() => result.current.onFaceClick(hit('T', { x: 1, y: 0, z: 0 }))) // +X end, not a facing edge
  expect(onAddTongueGroove).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/edge/i)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/useAddTongueGroove.test.ts`
Expected: FAIL — `Failed to resolve import "./useAddTongueGroove"`.

- [ ] **Step 3: Write the gesture hook**

Create `src/scene/useAddTongueGroove.ts`:

```ts
import { useState, useCallback } from 'react'
import type { FaceHit, Part } from './types'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { localNormalToFaceString } from './snapMath'

export interface AddTongueGrooveState {
  tongueGrooveActive: boolean
  pendingA: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateTongueGroove: () => void
  cancelTongueGroove: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddTongueGroove(params: {
  parts: Part[]
  onAddTongueGroove: (grooveHit: FaceHit, tongueHit: FaceHit) => void
}): AddTongueGrooveState {
  const { parts, onAddTongueGroove } = params
  const [tongueGrooveActive, setActive] = useState(false)
  const [pendingA, setPending] = useState<FaceHit | null>(null)
  const [statusMessage, setStatus] = useState<string | null>(null)
  const [hoveredFace, setHovered] = useState<FaceHit | null>(null)

  const activateTongueGroove = useCallback(() => {
    setActive((v) => !v)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])
  const cancelTongueGroove = useCallback(() => {
    setActive(false)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (part?.kind !== 'board') return
      if (pendingA === null) {
        setPending(hit)
        setStatus(null)
        return
      }
      if (hit.partId === pendingA.partId) {
        setStatus('Pick a different board for the tongue edge')
        setPending(null)
        return
      }
      const groove = parts.find((p) => p.id === pendingA.partId)
      if (groove?.kind !== 'board') {
        setPending(null)
        return
      }
      const grooveEdge = localNormalToFaceString(pendingA.localFaceNormal)
      const tongueEdge = localNormalToFaceString(hit.localFaceNormal)
      if (!isValidTongueGroove(groove, grooveEdge, part, tongueEdge)) {
        setStatus('Edges must be facing long edges of equal-thickness boards')
        setPending(null)
        return
      }
      onAddTongueGroove(pendingA, hit)
      setPending(null)
      setActive(false)
      setHovered(null)
    },
    [parts, pendingA, onAddTongueGroove],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHovered(tongueGrooveActive ? hit : null)
    },
    [tongueGrooveActive],
  )

  return {
    tongueGrooveActive,
    pendingA,
    statusMessage,
    hoveredFace,
    activateTongueGroove,
    cancelTongueGroove,
    onFaceClick,
    onFaceHover,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/scene/useAddTongueGroove.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/scene/useAddTongueGroove.ts src/scene/useAddTongueGroove.test.ts
git commit -m "feat(scene): useAddTongueGroove two-click gesture"
```

---

## Task 5: Wire the 7th mode through the coordinator, App, and Sidebar

**Files:**
- Modify: `src/scene/useInteractionMode.ts` (import, `InteractionMode` union, params, compose hook, `activeMode` chain, `setMode`, click/hover switches, `sourceFace`/`hoveredFace` chains, `statuses`)
- Modify: `src/App.tsx` (destructure `onAddTongueGroove`, pass to `useInteractionMode`, keyboard `t` case, Sidebar props)
- Modify: `src/ui/sidebar.tsx` (`SidebarProps` fields, destructure, toggle button)
- Test: `src/scene/useInteractionMode.test.ts` (add `onAddTongueGroove` to setup + a mode test)

- [ ] **Step 1: Extend the coordinator (`useInteractionMode.ts`)**

Add the import after line 9:

```ts
import { useAddTongueGroove } from './useAddTongueGroove'
```

Extend the `InteractionMode` union:

```ts
export type InteractionMode =
  | 'none'
  | 'snap'
  | 'cut'
  | 'dado'
  | 'halflap'
  | 'mortiseTenon'
  | 'finger'
  | 'tongueGroove'
```

Add to `UseInteractionModeParams` (after `onAddFingerJoint`):

```ts
  onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void
  onAddTongueGroove: (grooveHit: FaceHit, tongueHit: FaceHit) => void
```

Add `tongueGroove` to the `statuses` shape in `UseInteractionModeResult`:

```ts
  statuses: {
    dado: string | null
    halflap: string | null
    mortiseTenon: string | null
    finger: string | null
    tongueGroove: string | null
  }
```

Compose the hook (after the `finger` line ~58):

```ts
  const finger = useAddFingerJoint({ parts, onAddFingerJoint: params.onAddFingerJoint })
  const tongueGroove = useAddTongueGroove({
    parts,
    onAddTongueGroove: params.onAddTongueGroove,
  })
```

Extend the `activeMode` chain (append before the final `: 'none'`):

```ts
            : finger.fingerJointActive
              ? 'finger'
              : tongueGroove.tongueGrooveActive
                ? 'tongueGroove'
                : 'none'
```

Destructure its cancel/activate (after the finger destructure ~line 79):

```ts
  const { cancelFingerJoint, activateFingerJoint } = finger
  const { cancelTongueGroove, activateTongueGroove } = tongueGroove
```

Destructure its click/hover (after the finger one ~line 86):

```ts
  const { onFaceClick: fingerClick, onFaceHover: fingerHover } = finger
  const { onFaceClick: tgClick, onFaceHover: tgHover } = tongueGroove
```

In `setMode`, add the cancel + activate lines and the dep array entries:

```ts
      if (mode !== 'finger') cancelFingerJoint()
      if (mode !== 'tongueGroove') cancelTongueGroove()
      if (mode === 'snap') activateSnap()
      else if (mode === 'cut') activateCut()
      else if (mode === 'dado') activateJoint()
      else if (mode === 'halflap') activateHalfLap()
      else if (mode === 'mortiseTenon') activateMortiseTenon()
      else if (mode === 'finger') activateFingerJoint()
      else if (mode === 'tongueGroove') activateTongueGroove()
    },
    [
      cancelSnap,
      cancelCut,
      cancelJoint,
      cancelHalfLap,
      cancelMortiseTenon,
      cancelFingerJoint,
      cancelTongueGroove,
      activateSnap,
      activateCut,
      activateJoint,
      activateHalfLap,
      activateMortiseTenon,
      activateFingerJoint,
      activateTongueGroove,
    ],
  )
```

In the `onFaceClick` switch, add a case and the dep:

```ts
        case 'finger':
          fingerClick(hit)
          break
        case 'tongueGroove':
          tgClick(hit)
          break
      }
    },
    [activeMode, snapClick, cutClick, jointClick, halfLapClick, mtClick, fingerClick, tgClick],
  )
```

In the `onFaceHover` switch, add a case and the dep:

```ts
        case 'finger':
          fingerHover(hit)
          break
        case 'tongueGroove':
          tgHover(hit)
          break
      }
    },
    [activeMode, snapHover, cutHover, jointHover, halfLapHover, mtHover, fingerHover, tgHover],
  )
```

Extend the `sourceFace` chain (append before the final `: null`):

```ts
            : activeMode === 'finger'
              ? finger.pendingA
              : activeMode === 'tongueGroove'
                ? tongueGroove.pendingA
                : null
```

Extend the `hoveredFace` chain likewise:

```ts
            : activeMode === 'finger'
              ? finger.hoveredFace
              : activeMode === 'tongueGroove'
                ? tongueGroove.hoveredFace
                : null
```

Add to the returned `statuses`:

```ts
    statuses: {
      dado: joint.statusMessage,
      halflap: halfLap.statusMessage,
      mortiseTenon: mortiseTenon.statusMessage,
      finger: finger.statusMessage,
      tongueGroove: tongueGroove.statusMessage,
    },
```

- [ ] **Step 2: Update the coordinator test setup + add a mode test**

In `src/scene/useInteractionMode.test.ts`, add `onAddTongueGroove: vi.fn(),` to the `useInteractionMode({ … })` params in `setup` (after `onAddFingerJoint: vi.fn(),`). Then add:

```ts
test('setMode activates tongue-groove exclusively and toggles off', () => {
  const { result } = setup()
  act(() => result.current.setMode('mortiseTenon'))
  act(() => result.current.setMode('tongueGroove'))
  expect(result.current.activeMode).toBe('tongueGroove') // mortiseTenon cancelled
  act(() => result.current.setMode('tongueGroove'))
  expect(result.current.activeMode).toBe('none')
})
```

- [ ] **Step 3: Run the coordinator test to verify it fails then wire App**

Run: `pnpm vitest run src/scene/useInteractionMode.test.ts`
Expected: FAIL first if run before Step 1 is complete; after Step 1 it should PASS. (If Step 1 is already done, this passes now.)

- [ ] **Step 4: Wire `App.tsx`**

Destructure `onAddTongueGroove` from `useScene()` (after `onAddFingerJoint,` ~line 41):

```ts
    onAddFingerJoint,
    onAddTongueGroove,
```

Pass it to `useInteractionMode` (after `onAddFingerJoint,` ~line 73):

```ts
    onAddFingerJoint,
    onAddTongueGroove,
  })
```

Add the keyboard case (after the `b` case block ~line 164, before the `Escape` case):

```ts
        if (e.key.toLowerCase() === 't') {
          e.preventDefault()
          setMode('tongueGroove')
          return
        }
```

Pass Sidebar props (after `fingerJointStatus={mode.statuses.finger}` ~line 339):

```tsx
          fingerJointStatus={mode.statuses.finger}
          tongueGrooveActive={mode.activeMode === 'tongueGroove'}
          onTongueGrooveToggle={() => mode.setMode('tongueGroove')}
          tongueGrooveStatus={mode.statuses.tongueGroove}
```

- [ ] **Step 5: Extend `SidebarProps` + destructure + add the toggle button**

In `src/ui/sidebar.tsx`, add to `SidebarProps` (after `fingerJointStatus: string | null` ~line 74):

```ts
  fingerJointStatus: string | null
  tongueGrooveActive: boolean
  onTongueGrooveToggle: () => void
  tongueGrooveStatus: string | null
```

Add to the destructured params (after `fingerJointStatus,` ~line 830):

```ts
  fingerJointStatus,
  tongueGrooveActive,
  onTongueGrooveToggle,
  tongueGrooveStatus,
```

Add the toggle button after the Finger joint `</Button>` (line ~913, before the closing `</div>` of the mode-buttons block):

```tsx
          <Button
            variant={tongueGrooveActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onTongueGrooveToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${tongueGrooveActive ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{tongueGrooveActive ? 'Tongue & groove' : 'Add Tongue & groove'}</span>
            {tongueGrooveActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {tongueGrooveStatus ?? 'Click groove edge, then tongue edge · Esc to cancel'}
              </span>
            )}
          </Button>
```

- [ ] **Step 6: Update the Sidebar test props factory**

In `src/ui/sidebar.test.tsx`, add to the `props()` default factory (after `fingerJointStatus: null,` ~line 96):

```ts
    fingerJointStatus: null,
    tongueGrooveActive: false,
    onTongueGrooveToggle: vi.fn(),
    tongueGrooveStatus: null,
```

- [ ] **Step 7: Typecheck, lint, and run the affected tests**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/scene/useInteractionMode.test.ts src/ui/sidebar.test.tsx`
Expected: no type/lint errors; tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/scene/useInteractionMode.ts src/scene/useInteractionMode.test.ts src/App.tsx src/ui/sidebar.tsx src/ui/sidebar.test.tsx
git commit -m "feat(ui): wire tongue & groove add-mode (coordinator/App/Sidebar)"
```

---

## Task 6: `JointsPanel` tongue-groove editor branch (replace the Task 2 stub)

**Files:**
- Modify: `src/ui/JointsPanel.tsx` (import + replace the stub branch)
- Test: `src/ui/sidebar.test.tsx` (panel test)

- [ ] **Step 1: Write the failing panel test**

In `src/ui/sidebar.test.tsx`, add after the finger-joint `describe` block (after line 749 `})`):

```tsx
describe('Sidebar joints panel — tongue & groove', () => {
  afterEach(() => cleanup())

  const tgScene = () => ({
    parts: [
      makeBoard({ length: 800, width: 150, thickness: 18 }),
      makeBoard({
        id: 'board_t2',
        label: 'Board 2',
        length: 800,
        width: 150,
        thickness: 18,
        position: { x: 0, y: 160, z: 0 },
      }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'tongue-groove' as const,
        id: 'jtg',
        label: 'Tongue & groove 1',
        groovePartId: 'board_t1',
        grooveEdge: '+Y' as const,
        tonguePartId: 'board_t2',
        tongueEdge: '-Y' as const,
        tongueThickness: 6,
        tongueDepth: 8,
        clearance: 0,
      },
    ],
  })

  it('shows Thk / Depth / Clear controls for the groove board', () => {
    render(<Sidebar {...props({ scene: tgScene(), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Thk')).toBeTruthy()
    expect(screen.getByText('Depth')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('shows the read-only hint on the tongue board', () => {
    render(<Sidebar {...props({ scene: tgScene(), selectedId: 'board_t2' })} />)
    expect(screen.getByText(/Edit from/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/ui/sidebar.test.tsx -t 'tongue & groove'`
Expected: FAIL — `Thk`/`Depth`/`Clear` not found (the stub renders an empty div).

- [ ] **Step 3: Replace the stub branch with the real editor**

In `src/ui/JointsPanel.tsx`, add the import after line 3:

```ts
import { isValidTongueGroove } from '../geom/tonguegroove'
```

Replace the stub inserted in Task 2:

```tsx
        if (j.kind === 'tongue-groove') {
          return <div key={j.id} />
        }
```

with:

```tsx
        if (j.kind === 'tongue-groove') {
          const isGroove = j.groovePartId === part.id
          const groove = scene.parts.find((p) => p.id === j.groovePartId)
          const tongue = scene.parts.find((p) => p.id === j.tonguePartId)
          const stale =
            groove?.kind === 'board' && tongue?.kind === 'board'
              ? !isValidTongueGroove(groove, j.grooveEdge, tongue, j.tongueEdge)
              : true
          return (
            <div key={j.id} className="border-t border-border/30 pt-1 pb-1">
              <div className="flex items-center gap-1 py-0.5">
                <span className="flex-1 text-[11px] text-foreground">{j.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {isGroove ? 'groove' : 'tongue'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remove joint"
                  className="h-5 w-5 text-destructive hover:text-destructive"
                  onClick={() => onRemoveJoint(j.id)}
                >
                  ✕
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground pb-0.5">
                {isGroove ? '→' : '←'} {partLabel(scene, isGroove ? j.tonguePartId : j.groovePartId)}
              </p>
              {stale && (
                <p className="text-[10px] text-destructive-foreground pb-1">
                  Joint stale — edges must be facing long edges of equal-thickness boards
                </p>
              )}
              {isGroove ? (
                <>
                  <JointNumInput
                    label="Thk"
                    value={j.tongueThickness}
                    suffix="mm"
                    onCommit={(v) =>
                      onUpdateJoint(j.id, (jt) => ({ ...jt, tongueThickness: Math.max(0.1, v) }))
                    }
                  />
                  <JointNumInput
                    label="Depth"
                    value={j.tongueDepth}
                    suffix="mm"
                    onCommit={(v) =>
                      onUpdateJoint(j.id, (jt) => ({ ...jt, tongueDepth: Math.max(0.1, v) }))
                    }
                  />
                  <JointNumInput
                    label="Clear"
                    value={j.clearance}
                    suffix="mm"
                    onCommit={(v) =>
                      onUpdateJoint(j.id, (jt) => ({ ...jt, clearance: Math.max(0, v) }))
                    }
                  />
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground pb-0.5">
                  Edit from {partLabel(scene, j.groovePartId)}.
                </p>
              )}
            </div>
          )
        }
```

- [ ] **Step 4: Run the panel test to verify it passes**

Run: `pnpm vitest run src/ui/sidebar.test.tsx -t 'tongue & groove'`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/JointsPanel.tsx src/ui/sidebar.test.tsx
git commit -m "feat(ui): tongue & groove controls in JointsPanel"
```

---

## Task 7: Documentation + full verification + push

**Files:**
- Create: `docs/superpowers/notes/2026-07-26-tongue-groove-joint-notes.md`
- Modify: `docs/keyboard-shortcuts.md`
- Modify: `README.md`
- Modify: `project-structure.html`

- [ ] **Step 1: Write the implementation notes**

Create `docs/superpowers/notes/2026-07-26-tongue-groove-joint-notes.md`:

```markdown
# Tongue & Groove Joint (JP7) — Implementation Notes

**Date:** 2026-07-26

- Seventh joint type; first **edge-to-edge** joint (all prior joints meet at an end or corner). Two
  equal-thickness coplanar boards meet along a long edge (±Y); one gets a full-length centered groove,
  the other a centered tongue that seats into it. `Joint` union += `TongueGrooveJoint`.
- `tonguegroove.ts` is self-contained (type-only import of `DeriveResult`/`DerivedCut` from `dado.ts`;
  `dado.ts` runtime-imports `deriveTongueGroove` back — no cycle). The gesture/scene/panel import the
  runtime `isValidTongueGroove` directly: create gate === derive gate (carrying forward the JP5/JP6
  "no dead joints" fix).
- **Geometry is near-total reuse:** the groove is a `computeDadoGroove`-shaped box (centered in
  thickness, through-length); the centered tongue is **two** symmetric `computeRabbet`-shaped shoulder
  cuts (vs. the rabbeted dado's single asymmetric rabbet). The seat is a fixed-axis special case of
  `computeDadoSeat` (depth=Y, narrow=Z, run=X): tongue tip → groove bottom, thickness mid-planes
  aligned, length preserved; minimal and idempotent (re-derive doesn't drift the tongue board).
- **Extra validity gate discovered during planning:** anti-parallel ±Y edges + axis-aligned do NOT
  imply the boards are coplanar — a tongue board rotated `y:90` presents a facing −Y edge but its
  thickness runs along world X (a T-meeting, not a glue-up), so a centered tongue wouldn't align with
  the centered groove. `isValidTongueGroove` therefore also requires the two thickness axes to be
  parallel (`|zG·zT| > 1−EPS`). A test covers the `y:90` rejection.
- **Clearance is groove-only** (widens the groove across thickness; the tongue keeps its nominal
  thickness), matching the dado convention. Default `clearance = 0`; defaults seed `tongueThickness ≈
  thickness/3`, `tongueDepth ≈ 8 mm` (clamped to half the narrower board's width).
- 7th exclusive viewport mode via the post-refactor `useInteractionMode` coordinator: **new gesture
  hook + one registry entry + a keyboard case + Sidebar props/button. Viewport needs zero changes** —
  exactly the runway the interaction-mode refactor (2026-07-25) built. **Shortcut is `T`.**
- `FILE_FORMAT_VERSION` 9 → 10 (adds `tongue-groove`; inert backfill defaults in `parseFile`).
- No OCCT/mesh/export/drawing change — ordinary `BoxCut`s. Interactive 3D verification is a human step
  (OCCT WASM doesn't boot headless).
```

- [ ] **Step 2: Update the keyboard shortcuts doc**

In `docs/keyboard-shortcuts.md`, add a row after the `B` row in the "Non-modifier" table:

```markdown
| `B` | Activate box / finger joint mode | Click one board's end, then the perpendicular equal-width end of another |
| `T` | Activate tongue & groove joint mode | Click one board's long edge, then the facing long edge of another |
```

- [ ] **Step 3: Update the README**

In `README.md`, add a bullet after the "Box / finger joint mode (`B`)" bullet:

```markdown
- **Tongue & groove joint mode** (`T`) — click one board's long edge then the facing long edge of a coplanar, equal-thickness board to create an edge-to-edge tongue & groove; a full-length groove is cut into the first board and a matching centered tongue on the second, which auto-seats into the groove and stays in sync as dimensions change. Adjust **Thk**, **Depth**, and **Clear** in the sidebar to size the tongue and its fit.
```

- [ ] **Step 4: Update project-structure.html**

In `project-structure.html`, find where `fingerjoint.ts` is listed under `src/geom/` and add a sibling entry for `tonguegroove.ts` (mirror the existing markup for `fingerjoint.ts` — same element/indentation, description e.g. "tongue & groove joint geometry (groove + centered tongue + edge seat)"). Likewise find `useAddFingerJoint.ts` under `src/scene/` and add a sibling `useAddTongueGroove.ts` entry. Search the file for the string `fingerjoint` to locate both anchors; copy the surrounding tag structure verbatim and change only the filename and description.

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: typecheck clean, lint clean, **all** test files pass (the 5 new/changed test files plus every pre-existing test unchanged and green).

- [ ] **Step 6: Build**

Run: `pnpm build`
Expected: `tsc + vite build` completes; `dist/` produced with no errors.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/notes/2026-07-26-tongue-groove-joint-notes.md docs/keyboard-shortcuts.md README.md project-structure.html
git commit -m "docs(joints): tongue & groove notes + keyboard/README/structure updates"
```

- [ ] **Step 8: Push the branch**

```bash
git push -u origin claude/next-slice-suggestion-3ymkqz
```

(Retry with exponential backoff — 2s, 4s, 8s, 16s — only on network failure.)

---

## Self-Review (author's check against the spec)

**Spec coverage:**
- Data model (`TongueGrooveJoint`, union) → T1 (interface), T2 (union). ✓
- File format 9→10 + `jointInvolves` arm → T2. ✓
- `computeGrooveCut` / `computeTongueShoulders` / `computeTongueGrooveSeat` / `deriveTongueGroove` / `isValidTongueGroove` → T1. ✓
- `deriveJoint` dispatch → T2. ✓
- `onAddTongueGroove` + kind-aware remove label → T3. ✓
- `useAddTongueGroove` gesture → T4. ✓
- 7th mode (coordinator + keyboard `t` + Sidebar props/button) → T5. ✓
- `JointsPanel` branch → T6 (stub in T2 to keep types green, real in T6). ✓
- Docs (notes, keyboard, README, project-structure) → T7. ✓
- Tests: geom (T1), dispatch (T2), scene (T3), gesture (T4), coordinator (T5), panel (T6). ✓
- Reference + rotated (world-parity) fixtures → T1. ✓

**Deviation from spec, intentional:** the spec's validity had 4 conditions; planning added a 5th — **thickness axes parallel** — because anti-parallel ±Y edges alone don't force coplanarity (the `y:90` counterexample). This strengthens the "equal-thickness coplanar edge joint" the spec calls for; recorded in the notes (T7) and covered by a test (T1).

**Placeholder scan:** none — every code step shows complete code; every command has expected output.

**Type consistency:** exported names used consistently across tasks — `isValidTongueGroove`, `computeGrooveCut`, `computeTongueShoulders`, `computeTongueGrooveSeat`, `deriveTongueGroove` (T1) are the exact names imported in T2/T3/T4/T6; hook exports `tongueGrooveActive`/`pendingA`/`statusMessage`/`hoveredFace`/`activateTongueGroove`/`cancelTongueGroove`/`onFaceClick`/`onFaceHover` (T4) match the coordinator's usage (T5); `InteractionMode` value `'tongueGroove'` and Sidebar props `tongueGrooveActive`/`onTongueGrooveToggle`/`tongueGrooveStatus` are consistent across T5. ✓
```
