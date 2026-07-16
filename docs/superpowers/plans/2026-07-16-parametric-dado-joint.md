# Parametric Dado Joint (JP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class parametric `Joint` to the scene — a plain through-dado between two boards that materializes a groove on the housing board and drives the housed board's seated placement, staying in sync as dimensions/parameters change.

**Architecture:** A pure geometry module (`src/geom/dado.ts`) computes the groove `BoxCut` and the housed board's seated position. A pure `reconcileJoints(scene)` regenerates those derived outputs. `useScene` routes every joint-affecting mutation through a reconcile-commit helper so undo stays single-entry. A two-click state machine (`useAddJoint`) creates joints; the sidebar edits them. Derived cuts are ordinary tagged `BoxCut`s, so the existing `cuts → OCCT → mesh → drawings → export` pipeline is untouched.

**Tech Stack:** React 19 + TypeScript (strict), Three.js (math only, in pure modules), Vitest + happy-dom + @testing-library/react, OCCT via Comlink worker (never touched here).

**Reference spec:** `docs/superpowers/specs/2026-07-16-parametric-dado-joint-design.md`

**Conventions used throughout:**
- Board local box: `[0,length] × [0,width] × [0,thickness]` → X=length, Y=width, Z=thickness.
- `faceAxes(face)` → `{depth,u,v}` (`'x'|'y'|'z'`); `computeLocalFaceCenter`, `composeWorldMatrix`, `applyMatrixToPoint` already exist.
- A `BoxCut` subtracts a box spanning `[position, position+size]` in local coords.
- Run all three before every commit: `pnpm typecheck && pnpm lint && pnpm test`.

---

## Task 1: Types & scene scaffolding

**Files:**
- Modify: `src/scene/types.ts`
- Modify: `src/scene/useScene.ts` (initial state literal ~line 113-117)
- Modify: `src/scene/useFile.ts` (`FILE_FORMAT_VERSION`, `parseFile`, `newFile`)
- Test: `src/scene/utils.test.ts`

- [ ] **Step 1: Add the join­t types and scene field**

In `src/scene/types.ts`, add `sourceJointId` to `BoxCut` (after the `pairedCutId` line):

```ts
export interface BoxCut {
  kind: 'box'
  id: CutId
  label: string
  face: Face
  position: Vec3
  size: Vec3
  pairedCutId?: string // "{partId}:{cutId}"
  sourceJointId?: string // set on cuts generated & owned by a Joint (read-only in UI)
}
```

Add the joint types just above `export interface Scene` (after `HardwareItem`):

```ts
export interface DadoJoint {
  kind: 'dado'
  id: string // "joint_<uuid>"
  label: string // "Dado 1"
  housingPartId: PartId // board that carries the groove
  housingFace: Face // face the groove is cut into
  housedPartId: PartId // board that seats into the groove
  housedEnd: Face // the housed board's end face that seats in
  offset: number // mm — groove center along the housing face's narrow axis (housing-local)
  depth: number // mm — groove depth into the housing board
  clearance: number // mm — added to groove width (housedThickness + clearance)
}

export type Joint = DadoJoint
```

Add `joints` to `Scene`:

```ts
export interface Scene {
  parts: Part[]
  materials: Record<string, MaterialDef>
  hardware: HardwareItem[]
  joints: Joint[]
}
```

- [ ] **Step 2: Fix the three Scene constructors the new field breaks**

`src/scene/useScene.ts` initial state (~line 113):

```ts
  const [scene, setScene] = useState<Scene>(() => ({
    parts: [makeDefaultBoard()],
    materials: {},
    hardware: [],
    joints: [],
  }))
```

`src/scene/useFile.ts` — bump the version (line 5):

```ts
export const FILE_FORMAT_VERSION = 4
```

`src/scene/useFile.ts` — `parseFile` return, add `joints` default to the `scene` object (in the returned `scene`, alongside `materials`/`hardware` ~line 71-73):

```ts
      materials: (raw.scene.materials as Record<string, MaterialDef> | undefined) ?? {},
      hardware: raw.scene.hardware ?? [],
      joints: raw.scene.joints ?? [],
```

Do **not** add a `Joint` import to `useFile.ts`: `raw.scene.joints` is already typed through `ZimmuFile` → `Scene`, so no new import is needed and an unused one would fail `noUnusedLocals`.

`src/scene/useFile.ts` — `newFile` builds an empty scene (line 252) **and** the dirty-baseline string (line 257). Both must include `joints: []` or the app is permanently "dirty" after New:

```ts
      scene: { parts: [], materials: {}, hardware: [], joints: [] },
```
```ts
    lastSavedSceneRef.current = JSON.stringify({ parts: [], materials: {}, hardware: [], joints: [] })
```

- [ ] **Step 3: Write the failing shapeKey guard test**

`shapeKey` must ignore `sourceJointId` (only geometry-affecting fields belong in the cache key). Add to `src/scene/utils.test.ts`:

```ts
import { shapeKey } from './utils'
import type { BoardPart } from './types'

test('shapeKey ignores sourceJointId (not a geometry field)', () => {
  const base: BoardPart = {
    kind: 'board', id: 'b1', label: 'B', length: 100, width: 50, thickness: 20,
    material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', visible: true,
    cuts: [{ kind: 'box', id: 'c1', label: 'Cut', face: '+Z',
             position: { x: 0, y: 0, z: 10 }, size: { x: 20, y: 20, z: 10 } }],
  }
  const tagged: BoardPart = {
    ...base,
    cuts: [{ ...(base.cuts[0] as import('./types').BoxCut), sourceJointId: 'joint_x' }],
  }
  expect(shapeKey(tagged)).toBe(shapeKey(base))
})
```

- [ ] **Step 4: Run the test — verify it passes (shapeKey already excludes the field)**

Run: `pnpm vitest run src/scene/utils.test.ts`
Expected: PASS. `shapeKey` (src/scene/utils.ts:9-12) serializes only `position`/`size` for box cuts, so `sourceJointId` never enters the key. If it FAILS, do not "fix" shapeKey to add the field — the test encodes the requirement; investigate.

- [ ] **Step 5: Verify the whole project still builds**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS. (Adding a required `joints` field surfaces any other `Scene` literal in tests — if a test fails to compile, add `joints: []` to that literal.)

- [ ] **Step 6: Commit**

```bash
git add src/scene/types.ts src/scene/useScene.ts src/scene/useFile.ts src/scene/utils.test.ts
git commit -m "feat(types): add Joint model, Scene.joints, BoxCut.sourceJointId"
```

---

## Task 2: Pure dado geometry (`src/geom/dado.ts`)

**Files:**
- Create: `src/geom/dado.ts`
- Test: `src/geom/dado.test.ts`

- [ ] **Step 1: Write failing tests for the geometry seam**

Create `src/geom/dado.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import type { BoardPart, DadoJoint } from '../scene/types'
import {
  isValidDadoSeat,
  deriveDadoAxes,
  computeDadoGroove,
  computeDadoSeat,
  defaultDadoDepth,
} from './dado'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'
import { computeLocalFaceCenter } from '../scene/snapMath'

// Housing: flat board, +Z face up, at the origin, unrotated.
const housing: BoardPart = {
  kind: 'board', id: 'H', label: 'Housing', length: 200, width: 100, thickness: 25,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
// Housed: standing vertically via Ry=90 so its local +X end points to world -Z
// (opposes housing +Z → valid seat). Local +Z (thickness) → world +X.
const housed: BoardPart = {
  kind: 'board', id: 'D', label: 'Housed', length: 120, width: 100, thickness: 18,
  material: '', color: '#fff', position: { x: 50, y: 0, z: 30 },
  rotation: { x: 0, y: 90, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const joint: DadoJoint = {
  kind: 'dado', id: 'j1', label: 'Dado 1',
  housingPartId: 'H', housingFace: '+Z', housedPartId: 'D', housedEnd: '+X',
  offset: 50, depth: 8, clearance: 0,
}

test('isValidDadoSeat: perpendicular end opposing the face is valid', () => {
  expect(isValidDadoSeat(housing, '+Z', housed, '+X')).toBe(true)
})

test('isValidDadoSeat: a non-opposing end is invalid', () => {
  const flat: BoardPart = { ...housed, rotation: { x: 0, y: 0, z: 0 } }
  expect(isValidDadoSeat(housing, '+Z', flat, '+X')).toBe(false)
})

test('deriveDadoAxes: narrow axis follows the housed thickness direction', () => {
  // housed thickness (local Z) → world +X → housing u ('x' for +Z face).
  expect(deriveDadoAxes(housing, housed, '+Z')).toEqual({ narrowAx: 'x', runAx: 'y' })
})

test('computeDadoGroove: full-width channel, thickness-wide, depth-deep from the face', () => {
  const cut = computeDadoGroove(housing, housed, joint)
  expect(cut.kind).toBe('box')
  expect(cut.sourceJointId).toBe('j1')
  expect(cut.face).toBe('+Z')
  expect(cut.size).toEqual({ x: 18, y: 100, z: 8 }) // thk+clr, full width, depth
  expect(cut.position).toEqual({ x: 50 - 9, y: 0, z: 25 - 8 }) // centered at offset, flush at +Z
})

test('computeDadoGroove: depth clamps below the housing thickness', () => {
  const deep = computeDadoGroove(housing, housed, { ...joint, depth: 999 })
  expect(deep.size.z).toBe(24) // thickness - 1
})

test('defaultDadoDepth: ~thickness/3, clamped', () => {
  expect(defaultDadoDepth(housing, '+Z')).toBe(8) // round(25/3)=8
})

test('computeDadoSeat: housed end lands on the groove bottom, centered on offset', () => {
  const seat = computeDadoSeat(housing, housed, joint)
  const seated: BoardPart = { ...housed, position: seat.position }
  const endLocal = computeLocalFaceCenter({ x: 1, y: 0, z: 0 }, seated) // +X end center
  const [wx, , wz] = applyMatrixToPoint(
    composeWorldMatrix(seated), endLocal.x, endLocal.y, endLocal.z,
  )
  expect(wz).toBeCloseTo(25 - 8, 6) // groove bottom plane
  expect(wx).toBeCloseTo(50, 6)     // groove center = offset
})

test('computeDadoSeat is idempotent (re-seating a seated board is a no-op)', () => {
  const once = computeDadoSeat(housing, housed, joint)
  const twice = computeDadoSeat(housing, { ...housed, position: once.position }, joint)
  expect(twice.position.x).toBeCloseTo(once.position.x, 6)
  expect(twice.position.y).toBeCloseTo(once.position.y, 6)
  expect(twice.position.z).toBeCloseTo(once.position.z, 6)
})
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `pnpm vitest run src/geom/dado.test.ts`
Expected: FAIL with "Failed to resolve import './dado'" / functions not defined.

- [ ] **Step 3: Implement `src/geom/dado.ts`**

```ts
import * as THREE from 'three'
import type { BoardPart, BoxCut, CutId, DadoJoint, Face, Vec3 } from '../scene/types'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'

const DEG2RAD = Math.PI / 180
type Axis = 'x' | 'y' | 'z'

const FACE_NORMALS: Record<Face, Vec3> = {
  '+X': { x: 1, y: 0, z: 0 },
  '-X': { x: -1, y: 0, z: 0 },
  '+Y': { x: 0, y: 1, z: 0 },
  '-Y': { x: 0, y: -1, z: 0 },
  '+Z': { x: 0, y: 0, z: 1 },
  '-Z': { x: 0, y: 0, z: -1 },
}

function boardDims(p: BoardPart): Record<Axis, number> {
  return { x: p.length, y: p.width, z: p.thickness }
}

function unitVec(axis: Axis): Vec3 {
  return { x: axis === 'x' ? 1 : 0, y: axis === 'y' ? 1 : 0, z: axis === 'z' ? 1 : 0 }
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function isValidDadoSeat(
  housing: BoardPart,
  housingFace: Face,
  housed: BoardPart,
  housedEnd: Face,
): boolean {
  const hn = localDirToWorld(housing, FACE_NORMALS[housingFace])
  const en = localDirToWorld(housed, FACE_NORMALS[housedEnd])
  return hn.dot(en) < -0.99
}

export function deriveDadoAxes(
  housing: BoardPart,
  housed: BoardPart,
  housingFace: Face,
): { narrowAx: Axis; runAx: Axis } {
  const { u, v } = faceAxes(housingFace)
  const thicknessWorld = localDirToWorld(housed, unitVec('z'))
  const uWorld = localDirToWorld(housing, unitVec(u))
  const vWorld = localDirToWorld(housing, unitVec(v))
  const alignU = Math.abs(thicknessWorld.dot(uWorld))
  const alignV = Math.abs(thicknessWorld.dot(vWorld))
  return alignU >= alignV ? { narrowAx: u, runAx: v } : { narrowAx: v, runAx: u }
}

export function defaultDadoDepth(housing: BoardPart, housingFace: Face): number {
  const dAx = faceAxes(housingFace).depth
  const dim = boardDims(housing)
  return clamp(Math.round(dim[dAx] / 3), 3, dim[dAx] - 1)
}

export function computeDadoOffset(housing: BoardPart, housed: BoardPart, housingFace: Face): number {
  const { narrowAx } = deriveDadoAxes(housing, housed, housingFace)
  const [cx, cy, cz] = applyMatrixToPoint(
    composeWorldMatrix(housed),
    housed.length / 2,
    housed.width / 2,
    housed.thickness / 2,
  )
  const narrowDir = localDirToWorld(housing, unitVec(narrowAx))
  const raw =
    (cx - housing.position.x) * narrowDir.x +
    (cy - housing.position.y) * narrowDir.y +
    (cz - housing.position.z) * narrowDir.z
  const dim = boardDims(housing)
  const half = housed.thickness / 2
  return clamp(raw, half, dim[narrowAx] - half)
}

export function computeDadoGroove(housing: BoardPart, housed: BoardPart, joint: DadoJoint): BoxCut {
  const { narrowAx, runAx } = deriveDadoAxes(housing, housed, joint.housingFace)
  const dAx = faceAxes(joint.housingFace).depth
  const dim = boardDims(housing)
  const depth = clamp(joint.depth, 0.1, dim[dAx] - 1)
  const width = housed.thickness + joint.clearance
  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[dAx] = depth
  size[narrowAx] = width
  size[runAx] = dim[runAx]
  const offset = clamp(joint.offset, width / 2, dim[narrowAx] - width / 2)
  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[dAx] = joint.housingFace.startsWith('+') ? dim[dAx] - depth : 0
  position[runAx] = 0
  position[narrowAx] = offset - width / 2
  return {
    kind: 'box',
    id: `cut_${joint.id}` as CutId,
    label: joint.label,
    face: joint.housingFace,
    position,
    size,
    sourceJointId: joint.id,
  }
}

export function computeDadoSeat(
  housing: BoardPart,
  housed: BoardPart,
  joint: DadoJoint,
): { position: Vec3 } {
  const { narrowAx } = deriveDadoAxes(housing, housed, joint.housingFace)
  const dAx = faceAxes(joint.housingFace).depth
  const dim = boardDims(housing)
  const depth = clamp(joint.depth, 0.1, dim[dAx] - 1)

  const endLocal = computeLocalFaceCenter(FACE_NORMALS[joint.housedEnd], housed)
  const [ex, ey, ez] = applyMatrixToPoint(
    composeWorldMatrix(housed),
    endLocal.x,
    endLocal.y,
    endLocal.z,
  )
  const endWorld = new THREE.Vector3(ex, ey, ez)

  const gM = composeWorldMatrix(housing)
  const faceCenter = computeLocalFaceCenter(FACE_NORMALS[joint.housingFace], housing)

  const bottomLocal: Vec3 = { ...faceCenter }
  bottomLocal[dAx] = joint.housingFace.startsWith('+') ? dim[dAx] - depth : depth
  const [bx, by, bz] = applyMatrixToPoint(gM, bottomLocal.x, bottomLocal.y, bottomLocal.z)
  const bottomWorld = new THREE.Vector3(bx, by, bz)

  const centerLocal: Vec3 = { ...faceCenter }
  centerLocal[narrowAx] = joint.offset
  const [gx, gy, gz] = applyMatrixToPoint(gM, centerLocal.x, centerLocal.y, centerLocal.z)
  const centerWorld = new THREE.Vector3(gx, gy, gz)

  const faceN = localDirToWorld(housing, FACE_NORMALS[joint.housingFace])
  const narrowDir = localDirToWorld(housing, unitVec(narrowAx))

  const desired = endWorld.clone()
  desired.addScaledVector(faceN, bottomWorld.clone().sub(endWorld).dot(faceN))
  desired.addScaledVector(narrowDir, centerWorld.clone().sub(endWorld).dot(narrowDir))

  return {
    position: {
      x: housed.position.x + (desired.x - endWorld.x),
      y: housed.position.y + (desired.y - endWorld.y),
      z: housed.position.z + (desired.z - endWorld.z),
    },
  }
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `pnpm vitest run src/geom/dado.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Verify project**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/geom/dado.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/geom/dado.ts src/geom/dado.test.ts
git commit -m "feat(geom): pure dado joint geometry & seating math"
```

---

## Task 3: Reconciler (`src/scene/reconcileJoints.ts`)

**Files:**
- Create: `src/scene/reconcileJoints.ts`
- Test: `src/scene/reconcileJoints.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/scene/reconcileJoints.test.ts`:

```ts
import { test, expect } from 'vitest'
import type { BoardPart, DadoJoint, Scene } from './types'
import { reconcileJoints } from './reconcileJoints'

const housing: BoardPart = {
  kind: 'board', id: 'H', label: 'Housing', length: 200, width: 100, thickness: 25,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const housed: BoardPart = {
  kind: 'board', id: 'D', label: 'Housed', length: 120, width: 100, thickness: 18,
  material: '', color: '#fff', position: { x: 50, y: 0, z: 30 },
  rotation: { x: 0, y: 90, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const joint: DadoJoint = {
  kind: 'dado', id: 'j1', label: 'Dado 1',
  housingPartId: 'H', housingFace: '+Z', housedPartId: 'D', housedEnd: '+X',
  offset: 50, depth: 8, clearance: 0,
}
const scene = (): Scene => ({
  parts: [structuredClone(housing), structuredClone(housed)],
  materials: {}, hardware: [], joints: [structuredClone(joint)],
})

test('valid joint materializes a groove on the housing and seats the housed board', () => {
  const out = reconcileJoints(scene())
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  const D = out.parts.find((p) => p.id === 'D') as BoardPart
  expect(H.cuts).toHaveLength(1)
  expect(H.cuts[0].kind === 'box' && H.cuts[0].sourceJointId).toBe('j1')
  expect(D.position.z).toBeCloseTo(17 - 60, 6) // seated; see computeDadoSeat test for the invariant
})

test('reconcile is idempotent', () => {
  const once = reconcileJoints(scene())
  const twice = reconcileJoints(once)
  expect(JSON.stringify(twice.parts)).toBe(JSON.stringify(once.parts))
})

test('orphaned derived cuts (no matching joint) are stripped', () => {
  const s = scene()
  ;(s.parts[0] as BoardPart).cuts = [
    { kind: 'box', id: 'cut_ghost', label: 'Ghost', face: '+Z',
      position: { x: 0, y: 0, z: 20 }, size: { x: 5, y: 5, z: 5 }, sourceJointId: 'gone' },
  ]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  expect(H.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'gone')).toBe(false)
})

test('a stale (off-axis) joint keeps its last-good derived cut', () => {
  const s = reconcileJoints(scene()) // materialize the groove first
  // Rotate the housed board off-axis so the seat is no longer valid.
  const staleScene: Scene = {
    ...s,
    parts: s.parts.map((p) => (p.id === 'D' ? { ...(p as BoardPart), rotation: { x: 0, y: 30, z: 0 } } : p)),
  }
  const out = reconcileJoints(staleScene)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  expect(H.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(true) // preserved
})

test('non-board / preexisting cuts pass through untouched', () => {
  const s = scene()
  ;(s.parts[0] as BoardPart).cuts = [
    { kind: 'box', id: 'c_user', label: 'User', face: '-Z',
      position: { x: 10, y: 10, z: 0 }, size: { x: 10, y: 10, z: 5 } },
  ]
  const out = reconcileJoints(s)
  const H = out.parts.find((p) => p.id === 'H') as BoardPart
  expect(H.cuts.some((c) => c.id === 'c_user')).toBe(true) // kept
  expect(H.cuts.some((c) => c.kind === 'box' && c.sourceJointId === 'j1')).toBe(true) // plus groove
})
```

> Note: the exact `D.position.z` value in the first test mirrors `computeDadoSeat`; if the literal disagrees with the implementation, trust `computeDadoSeat`'s own test (Task 2) and relax this assertion to `expect(H.cuts).toHaveLength(1)` only. The load-bearing assertions are the cut presence, idempotence, orphan-strip, stale-preserve, and pass-through.

- [ ] **Step 2: Run the tests — verify they fail**

Run: `pnpm vitest run src/scene/reconcileJoints.test.ts`
Expected: FAIL with "Failed to resolve import './reconcileJoints'".

- [ ] **Step 3: Implement `src/scene/reconcileJoints.ts`**

```ts
import type { BoardPart, Scene } from './types'
import { isValidDadoSeat, computeDadoGroove, computeDadoSeat } from '../geom/dado'

// Regenerate every derived (joint-owned) cut and seated position from the joints.
// Pure and idempotent: safe to run after any scene mutation and on file load.
export function reconcileJoints(scene: Scene): Scene {
  const jointIds = new Set(scene.joints.map((j) => j.id))

  // 1. Strip derived cuts whose owning joint no longer exists (orphans).
  let parts = scene.parts.map((p) =>
    p.kind === 'board'
      ? {
          ...p,
          cuts: p.cuts.filter(
            (c) =>
              !(c.kind === 'box' && c.sourceJointId !== undefined && !jointIds.has(c.sourceJointId)),
          ),
        }
      : p,
  )

  // 2. For each joint: regenerate if the seat is valid; otherwise preserve last-good.
  for (const joint of scene.joints) {
    const housing = parts.find((p) => p.id === joint.housingPartId)
    const housed = parts.find((p) => p.id === joint.housedPartId)
    if (housing?.kind !== 'board' || housed?.kind !== 'board') continue
    if (!isValidDadoSeat(housing, joint.housingFace, housed, joint.housedEnd)) continue

    const groove = computeDadoGroove(housing, housed, joint)
    const seat = computeDadoSeat(housing, housed, joint)

    parts = parts.map((p): BoardPart | typeof p => {
      if (p.id === joint.housingPartId && p.kind === 'board') {
        const others = p.cuts.filter((c) => !(c.kind === 'box' && c.sourceJointId === joint.id))
        return { ...p, cuts: [...others, groove] }
      }
      if (p.id === joint.housedPartId && p.kind === 'board') {
        return { ...p, position: seat.position }
      }
      return p
    })
  }

  return { ...scene, parts }
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `pnpm vitest run src/scene/reconcileJoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify project**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scene/reconcileJoints.ts src/scene/reconcileJoints.test.ts
git commit -m "feat(scene): reconcileJoints — derive groove cuts & seated positions"
```

---

## Task 4: `useScene` joint methods & wiring

**Files:**
- Modify: `src/scene/snapMath.ts` (export one existing helper)
- Modify: `src/scene/useScene.ts`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Export the local-normal→Face helper from snapMath**

`src/scene/snapMath.ts` line 114 — add `export`:

```ts
export function localNormalToFaceString(n: Vec3): Face {
```

- [ ] **Step 2: Write failing useScene tests**

Add to `src/scene/useScene.test.ts` (follow the existing file's worker-mock + `renderHook`/`act` setup already at the top of that file). These tests assume the mock `buildPart` resolves geometry as the existing tests do.

```ts
import type { FaceHit } from './types'

// A FaceHit carries only the fields onAddJoint reads.
const hit = (partId: string, ln: { x: number; y: number; z: number }): FaceHit => ({
  partId, faceNormal: ln, faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: ln, localHitPoint: { x: 0, y: 0, z: 0 }, hitPoint: { x: 0, y: 0, z: 0 },
})

// Helper: add a housing board + a vertically-standing housed board, return their ids.
async function twoBoards(result: { current: ReturnType<typeof useScene> }) {
  await act(async () => { result.current.onAdd('board') }) // housing
  await act(async () => { result.current.onAdd('board') }) // housed
  const [H, D] = result.current.scene.parts
  await act(async () => {
    result.current.onUpdate(D.id, (p) => ({ ...p, rotation: { x: 0, y: 90, z: 0 } }), 'rot')
  })
  return { Hid: H.id, Did: D.id }
}

test('onAddJoint creates a joint + derived groove in a single undo entry', async () => {
  const { result } = renderHook(() => useScene())
  await waitFor(() => expect(result.current.occtReady).toBe(true))
  const { Hid, Did } = await twoBoards(result)

  await act(async () => {
    result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
  })

  expect(result.current.scene.joints).toHaveLength(1)
  const H = result.current.scene.parts.find((p) => p.id === Hid)!
  expect(H.kind === 'board' && H.cuts.some((c) => c.kind === 'box' && c.sourceJointId)).toBe(true)

  await act(async () => { result.current.undo() })
  expect(result.current.scene.joints).toHaveLength(0)
  const H2 = result.current.scene.parts.find((p) => p.id === Hid)!
  expect(H2.kind === 'board' && H2.cuts.length).toBe(0)
})

test('onRemove of a participating part cascades the joint, single undo restores both', async () => {
  const { result } = renderHook(() => useScene())
  await waitFor(() => expect(result.current.occtReady).toBe(true))
  const { Hid, Did } = await twoBoards(result)
  await act(async () => {
    result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
  })

  await act(async () => { result.current.onRemove(Did) })
  expect(result.current.scene.joints).toHaveLength(0)
  const H = result.current.scene.parts.find((p) => p.id === Hid)!
  expect(H.kind === 'board' && H.cuts.length).toBe(0) // groove gone with the joint

  await act(async () => { result.current.undo() })
  expect(result.current.scene.parts.some((p) => p.id === Did)).toBe(true)
  expect(result.current.scene.joints).toHaveLength(1)
})

test('resizing the housed board re-derives the groove width', async () => {
  const { result } = renderHook(() => useScene())
  await waitFor(() => expect(result.current.occtReady).toBe(true))
  const { Hid, Did } = await twoBoards(result)
  await act(async () => {
    result.current.onAddJoint(hit(Hid, { x: 0, y: 0, z: 1 }), hit(Did, { x: 1, y: 0, z: 0 }))
  })
  const grooveWidth = () => {
    const H = result.current.scene.parts.find((p) => p.id === Hid)!
    const g = H.kind === 'board' ? H.cuts.find((c) => c.kind === 'box' && c.sourceJointId) : undefined
    return g && g.kind === 'box' ? g.size.x : -1
  }
  const before = grooveWidth()
  await act(async () => {
    result.current.onUpdate(Did, (p) => (p.kind === 'board' ? { ...p, thickness: 40 } : p), 'thk')
  })
  expect(grooveWidth()).not.toBe(before)
  expect(grooveWidth()).toBe(40) // clearance 0
})
```

- [ ] **Step 3: Run the tests — verify they fail**

Run: `pnpm vitest run src/scene/useScene.test.ts`
Expected: FAIL ("onAddJoint is not a function").

- [ ] **Step 4: Add imports and the reconcile-commit helper in `useScene.ts`**

Extend the type import (lines 6-15) with `Joint` and `DadoJoint`, and `FaceHit`:

```ts
import type {
  BoardPart, HardwareItem, MaterialDef, Part, PartId, Scene, CutDef, CutId,
  Joint, DadoJoint, FaceHit,
} from './types'
```

Add module imports near the existing `faceAxes` import (line 17):

```ts
import { faceAxes, localNormalToFaceString } from './snapMath'
import { reconcileJoints } from './reconcileJoints'
import { isValidDadoSeat, computeDadoOffset, defaultDadoDepth } from '../geom/dado'
```

Add the helper immediately after `push` is defined (after line 241):

```ts
  const commitReconciled = useCallback(
    (mutate: (s: Scene) => Scene, label: string, coalesceKey?: string) => {
      const before = sceneRef.current
      const after = reconcileJoints(mutate(before))
      setScene(after)
      push({ label, coalesceKey, undo: () => setScene(before), redo: () => setScene(after) })
    },
    [push],
  )
```

- [ ] **Step 5: Add the three joint methods**

Add after `onUnlinkCuts` (after line 831):

```ts
  const onAddJoint = useCallback(
    (housingHit: FaceHit, housedHit: FaceHit) => {
      const s = sceneRef.current
      const housing = s.parts.find((p) => p.id === housingHit.partId)
      const housed = s.parts.find((p) => p.id === housedHit.partId)
      if (housing?.kind !== 'board' || housed?.kind !== 'board' || housing.id === housed.id) return
      const housingFace = localNormalToFaceString(housingHit.localFaceNormal)
      const housedEnd = localNormalToFaceString(housedHit.localFaceNormal)
      if (!isValidDadoSeat(housing, housingFace, housed, housedEnd)) return

      const n = s.joints.filter((j) => j.kind === 'dado').length + 1
      const joint: Joint = {
        kind: 'dado',
        id: `joint_${crypto.randomUUID()}`,
        label: `Dado ${n}`,
        housingPartId: housing.id,
        housingFace,
        housedPartId: housed.id,
        housedEnd,
        offset: computeDadoOffset(housing, housed, housingFace),
        depth: defaultDadoDepth(housing, housingFace),
        clearance: 0,
      }
      commitReconciled((prev) => ({ ...prev, joints: [...prev.joints, joint] }), 'Add dado')
      setSelectedId(housing.id)
    },
    [commitReconciled],
  )

  const onUpdateJoint = useCallback(
    (jointId: string, updater: (j: DadoJoint) => DadoJoint) => {
      if (!sceneRef.current.joints.some((j) => j.id === jointId)) return
      commitReconciled(
        (prev) => ({
          ...prev,
          joints: prev.joints.map((j) => (j.id === jointId ? updater(j) : j)),
        }),
        'Edit dado',
        `joint-${jointId}`,
      )
    },
    [commitReconciled],
  )

  const onRemoveJoint = useCallback(
    (jointId: string) => {
      if (!sceneRef.current.joints.some((j) => j.id === jointId)) return
      commitReconciled(
        (prev) => ({ ...prev, joints: prev.joints.filter((j) => j.id !== jointId) }),
        'Remove dado',
      )
    },
    [commitReconciled],
  )
```

- [ ] **Step 6: Make `onRemove` cascade joints and reconcile**

Replace the whole `onRemove` (lines 330-359) with:

```ts
  const onRemove = useCallback(
    (id: PartId) => {
      const before = sceneRef.current
      const part = before.parts.find((p) => p.id === id)
      if (!part) return
      geometriesRef.current.get(id)?.dispose()
      geometriesRef.current.delete(id)
      prevShapeKeys.current.delete(id)
      buildSeq.current.delete(id)
      setGeometries(new Map(geometriesRef.current))
      const after = reconcileJoints({
        ...before,
        parts: before.parts.filter((p) => p.id !== id),
        joints: before.joints.filter((j) => j.housingPartId !== id && j.housedPartId !== id),
      })
      setScene(after)
      setSelectedId((prev) => (prev === id ? null : prev))
      push({
        label: `Remove ${part.label}`,
        undo: () => {
          setScene(before)
          setSelectedId(id)
        },
        redo: () => {
          setScene(after)
          setSelectedId((prev) => (prev === id ? null : prev))
        },
      })
    },
    [push],
  )
```

- [ ] **Step 7: Make `onUpdate` joint-aware**

Replace the whole `onUpdate` (lines 449-471) with:

```ts
  const onUpdate = useCallback(
    (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => {
      const before = sceneRef.current
      const beforePart = before.parts.find((p) => p.id === id)
      if (!beforePart) return
      const afterPart = updater(beforePart)
      const label = historyLabel ?? `Update ${afterPart.label}`
      const coalesceKey = historyLabel !== undefined ? undefined : `update-${id}`
      const participates = before.joints.some(
        (j) => j.housingPartId === id || j.housedPartId === id,
      )

      if (participates) {
        const after = reconcileJoints({
          ...before,
          parts: before.parts.map((p) => (p.id === id ? afterPart : p)),
        })
        setScene(after)
        push({ label, coalesceKey, undo: () => setScene(before), redo: () => setScene(after) })
        return
      }

      setScene((prev) => ({ ...prev, parts: prev.parts.map((p) => (p.id === id ? afterPart : p)) }))
      push({
        label,
        coalesceKey,
        undo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => (p.id === id ? beforePart : p)),
          })),
        redo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => (p.id === id ? afterPart : p)),
          })),
      })
    },
    [push],
  )
```

- [ ] **Step 8: Guard derived cuts as read-only, strip on duplicate, reconcile on load**

`onUpdateCut` — after `const beforeA = part.cuts.find(...)` / `if (!beforeA) return` (line 478), add:

```ts
      if (beforeA.kind === 'box' && beforeA.sourceJointId) return // derived cut — edit via the joint
```

`onRemoveCut` — after `if (!removedCut) return` (line 632), add:

```ts
      if (removedCut.kind === 'box' && removedCut.sourceJointId) return // derived cut — remove the joint
```

`onLinkCuts` — after the `if (cutA.kind !== 'box' || cutB.kind !== 'box') return` line (line 711), add:

```ts
      if (cutA.sourceJointId || cutB.sourceJointId) return // derived cuts can't be paired
```

`onDuplicate` — in the board clone's `cuts` mapping (lines 376-380), drop derived cuts before cloning:

```ts
          cuts: orig.cuts
            .filter((c) => !(c.kind === 'box' && c.sourceJointId))
            .map((c) =>
              c.kind === 'box'
                ? { ...c, id: `cut_${crypto.randomUUID()}` as CutId, pairedCutId: undefined }
                : { ...c, id: `cut_${crypto.randomUUID()}` as CutId },
            ),
```

`replaceScene` — change `setScene(next)` (line 873) to reconcile on load:

```ts
    setScene(reconcileJoints(next))
```

- [ ] **Step 9: Expose the new methods on `UseSceneResult`**

Add to the interface (after `onUnlinkCuts`, line 87):

```ts
  onAddJoint: (housingHit: FaceHit, housedHit: FaceHit) => void
  onUpdateJoint: (jointId: string, updater: (j: DadoJoint) => DadoJoint) => void
  onRemoveJoint: (jointId: string) => void
```

Add to the returned object (near `onUnlinkCuts`, line 921):

```ts
    onAddJoint,
    onUpdateJoint,
    onRemoveJoint,
```

- [ ] **Step 10: Run the tests — verify they pass**

Run: `pnpm vitest run src/scene/useScene.test.ts`
Expected: PASS (existing + 3 new tests).

- [ ] **Step 11: Verify project**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/scene/snapMath.ts src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat(scene): joint CRUD, reconcile-commit, cascade delete, read-only derived cuts"
```

---

## Task 5: `useAddJoint` state machine

**Files:**
- Create: `src/scene/useAddJoint.ts`
- Test: `src/scene/useAddJoint.test.ts`

- [ ] **Step 1: Write failing tests (validity mocked, so the state machine is isolated)**

Create `src/scene/useAddJoint.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { BoardPart, FaceHit } from './types'

let mockValid = true
vi.mock('../geom/dado', () => ({ isValidDadoSeat: () => mockValid }))
import { useAddJoint } from './useAddJoint'

const board = (id: string): BoardPart => ({
  kind: 'board', id, label: id, length: 100, width: 50, thickness: 20,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
})
const hit = (partId: string): FaceHit => ({
  partId, faceNormal: { x: 0, y: 0, z: 1 }, faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: { x: 0, y: 0, z: 1 }, localHitPoint: { x: 0, y: 0, z: 0 },
  hitPoint: { x: 0, y: 0, z: 0 },
})
const parts = [board('A'), board('B')]

beforeEach(() => { mockValid = true })

test('first click stores the housing; second valid click calls onAddJoint', () => {
  const onAddJoint = vi.fn()
  const { result } = renderHook(() => useAddJoint({ parts, onAddJoint }))
  act(() => result.current.activateJoint())
  act(() => result.current.onFaceClick(hit('A')))
  expect(result.current.pendingHousing?.partId).toBe('A')
  expect(onAddJoint).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('B')))
  expect(onAddJoint).toHaveBeenCalledTimes(1)
  expect(result.current.pendingHousing).toBeNull()
})

test('clicking the same part twice is rejected with a message', () => {
  const onAddJoint = vi.fn()
  const { result } = renderHook(() => useAddJoint({ parts, onAddJoint }))
  act(() => result.current.activateJoint())
  act(() => result.current.onFaceClick(hit('A')))
  act(() => result.current.onFaceClick(hit('A')))
  expect(onAddJoint).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/different part/i)
  expect(result.current.pendingHousing).toBeNull()
})

test('an invalid seat is rejected with a message', () => {
  mockValid = false
  const onAddJoint = vi.fn()
  const { result } = renderHook(() => useAddJoint({ parts, onAddJoint }))
  act(() => result.current.activateJoint())
  act(() => result.current.onFaceClick(hit('A')))
  act(() => result.current.onFaceClick(hit('B')))
  expect(onAddJoint).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/perpendicular/i)
})
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `pnpm vitest run src/scene/useAddJoint.test.ts`
Expected: FAIL ("Failed to resolve import './useAddJoint'").

- [ ] **Step 3: Implement `src/scene/useAddJoint.ts`**

```ts
import { useState, useCallback } from 'react'
import type { FaceHit, Part } from './types'
import { isValidDadoSeat } from '../geom/dado'
import { localNormalToFaceString } from './snapMath'

export interface AddJointState {
  jointActive: boolean
  pendingHousing: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateJoint: () => void
  cancelJoint: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddJoint(params: {
  parts: Part[]
  onAddJoint: (housingHit: FaceHit, housedHit: FaceHit) => void
}): AddJointState {
  const { parts, onAddJoint } = params
  const [jointActive, setJointActive] = useState(false)
  const [pendingHousing, setPendingHousing] = useState<FaceHit | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [hoveredFace, setHoveredFace] = useState<FaceHit | null>(null)

  const activateJoint = useCallback(() => {
    setJointActive((v) => !v)
    setPendingHousing(null)
    setStatusMessage(null)
    setHoveredFace(null)
  }, [])

  const cancelJoint = useCallback(() => {
    setJointActive(false)
    setPendingHousing(null)
    setStatusMessage(null)
    setHoveredFace(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (part?.kind !== 'board') return

      if (pendingHousing === null) {
        setPendingHousing(hit)
        setStatusMessage(null)
        return
      }

      if (hit.partId === pendingHousing.partId) {
        setStatusMessage('Pick a different part for the housed board')
        setPendingHousing(null)
        return
      }
      const housing = parts.find((p) => p.id === pendingHousing.partId)
      if (housing?.kind !== 'board') {
        setPendingHousing(null)
        return
      }
      const housingFace = localNormalToFaceString(pendingHousing.localFaceNormal)
      const housedEnd = localNormalToFaceString(hit.localFaceNormal)
      if (!isValidDadoSeat(housing, housingFace, part, housedEnd)) {
        setStatusMessage('Housed board must be perpendicular to the housing face')
        setPendingHousing(null)
        return
      }

      onAddJoint(pendingHousing, hit)
      setPendingHousing(null)
      setJointActive(false)
      setHoveredFace(null)
    },
    [parts, pendingHousing, onAddJoint],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHoveredFace(jointActive ? hit : null)
    },
    [jointActive],
  )

  return {
    jointActive,
    pendingHousing,
    statusMessage,
    hoveredFace,
    activateJoint,
    cancelJoint,
    onFaceClick,
    onFaceHover,
  }
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `pnpm vitest run src/scene/useAddJoint.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify project**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scene/useAddJoint.ts src/scene/useAddJoint.test.ts
git commit -m "feat(scene): useAddJoint two-click creation state machine"
```

---

## Task 6: App + Viewport wiring

**Files:**
- Modify: `src/render/viewport.tsx`
- Modify: `src/App.tsx`

No new unit tests — this is Three.js/DOM glue (per the repo convention, test the geom seam, not Three internals). Verification is typecheck + lint + build + a manual smoke.

- [ ] **Step 1: Add joint props to the Viewport**

`src/render/viewport.tsx` — extend `ViewportProps` (after the cut props, line 27-29):

```ts
  jointActive: boolean
  onFaceClickJoint: (hit: FaceHit) => void
  onFaceHoverJoint: (hit: FaceHit | null) => void
  jointHousingFace: FaceHit | null
  jointHoveredFace: FaceHit | null
```

Destructure them in the component params (after `onFaceHoverCut`, line 48):

```ts
  jointActive,
  onFaceClickJoint,
  onFaceHoverJoint,
  jointHousingFace,
  jointHoveredFace,
```

Add refs (after `onFaceHoverCutRef`, line 67):

```ts
  const jointActiveRef = useRef(jointActive)
  const onFaceClickJointRef = useRef(onFaceClickJoint)
  const onFaceHoverJointRef = useRef(onFaceHoverJoint)
```

Sync them in the `useLayoutEffect` (after `onFaceHoverCutRef.current = ...`, line 85):

```ts
    jointActiveRef.current = jointActive
    onFaceClickJointRef.current = onFaceClickJoint
    onFaceHoverJointRef.current = onFaceHoverJoint
```

- [ ] **Step 2: Route clicks and hovers to joint mode**

In `handleClick` (line 327), add a joint branch as the **first** condition:

```ts
      if (jointActiveRef.current) {
        if (hits.length > 0) {
          const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current)
          if (faceHit) onFaceClickJointRef.current(faceHit)
        }
      } else if (cutActiveRef.current) {
```

(i.e. change the existing `if (cutActiveRef.current)` to `} else if (cutActiveRef.current)` chained after the new joint block.)

In `handleMouseMove` (line 357), extend the early-out and the hover dispatch:

```ts
        if (!snapActiveRef.current && !cutActiveRef.current && !jointActiveRef.current) return
```

and in the hit/miss dispatch (lines 367-374) add joint first:

```ts
        if (hits.length > 0) {
          const hit = buildFaceHit(hits[0], meshes.current, partsRef.current)
          if (jointActiveRef.current) onFaceHoverJointRef.current(hit)
          else if (cutActiveRef.current) onFaceHoverCutRef.current(hit)
          else onFaceHoverRef.current(hit)
        } else {
          if (jointActiveRef.current) onFaceHoverJointRef.current(null)
          else if (cutActiveRef.current) onFaceHoverCutRef.current(null)
          else onFaceHoverRef.current(null)
        }
```

- [ ] **Step 3: Highlight the pending housing + hovered faces; joint crosshair**

Replace the two `updateHighlight` calls in the highlight effect (lines 540-545) with joint-aware sources:

```ts
    updateHighlight(
      sourceHighlightRef.current,
      snapActive ? sourceFace : jointActive ? jointHousingFace : null,
      0xfbbf24,
    )
    updateHighlight(
      hoverHighlightRef.current,
      jointActive ? jointHoveredFace : snapActive || cutActive ? hoveredFace : null,
      0x60a5fa,
    )
```

Extend that effect's dependency array (line 546) to include the joint inputs:

```ts
  }, [snapActive, cutActive, jointActive, sourceFace, hoveredFace, jointHousingFace, jointHoveredFace, parts])
```

Update the cursor effect (lines 581-588) to include joint mode:

```ts
    mount.style.cursor = snapActive || cutActive || jointActive ? 'crosshair' : ''
```
```ts
  }, [snapActive, cutActive, jointActive])
```

- [ ] **Step 4: Wire `useAddJoint` into App and add the `J` shortcut**

`src/App.tsx` — import (after line 5):

```ts
import { useAddJoint } from './scene/useAddJoint'
```

Destructure the new scene methods from `useScene()` (add to the destructure, near `onUnlinkCuts`, line 37):

```ts
    onAddJoint,
    onUpdateJoint,
    onRemoveJoint,
```

Instantiate the hook (after the `useAddCut` block, line 80):

```ts
  const {
    jointActive,
    pendingHousing,
    statusMessage: jointStatus,
    hoveredFace: jointHoveredFace,
    activateJoint,
    cancelJoint,
    onFaceClick: onFaceClickJoint,
    onFaceHover: onFaceHoverJoint,
  } = useAddJoint({ parts: scene.parts, onAddJoint })
```

Make the three modes mutually exclusive. Replace `handleActivateCut`/`handleActivateSnap` (lines 133-140) with versions that also cancel joint, and add `handleActivateJoint`:

```ts
  const handleActivateCut = useCallback(() => {
    cancelSnap()
    cancelJoint()
    activateCut()
  }, [cancelSnap, cancelJoint, activateCut])
  const handleActivateSnap = useCallback(() => {
    cancelCut()
    cancelJoint()
    activateSnap()
  }, [cancelCut, cancelJoint, activateSnap])
  const handleActivateJoint = useCallback(() => {
    cancelCut()
    cancelSnap()
    activateJoint()
  }, [cancelCut, cancelSnap, activateJoint])
```

In the keydown handler, add a `J` shortcut next to `f`/`c` (after the `c` block, line 158) and extend `Escape` (line 160):

```ts
        if (e.key.toLowerCase() === 'j') {
          e.preventDefault()
          handleActivateJoint()
          return
        }
```
```ts
        if (e.key === 'Escape') {
          if (cutActive) cancelCut()
          if (snapActive) cancelSnap()
          if (jointActive) cancelJoint()
          return
        }
```

Also guard `H`/`Delete` while joint mode is active (lines 165, 172) by adding `&& !jointActive`:

```ts
          if (selectedId && !snapActive && !cutActive && !jointActive) {
```

(apply to both the `h` and the `Delete`/`Backspace` conditions.)

Add `handleActivateJoint`, `cancelJoint`, `jointActive` to the effect's dependency array (lines 220-237).

- [ ] **Step 5: Pass joint props to Viewport and Sidebar**

Viewport JSX (after `onFaceHoverCut`, line 299):

```tsx
          jointActive={jointActive}
          onFaceClickJoint={onFaceClickJoint}
          onFaceHoverJoint={onFaceHoverJoint}
          jointHousingFace={pendingHousing}
          jointHoveredFace={jointHoveredFace}
```

Sidebar JSX (after `armDowelTool`, line 327) — these props are consumed in Task 7:

```tsx
          joints={scene.joints}
          onUpdateJoint={onUpdateJoint}
          onRemoveJoint={onRemoveJoint}
          jointActive={jointActive}
          onJointToggle={handleActivateJoint}
          jointStatus={jointStatus}
```

- [ ] **Step 6: Verify (typecheck will fail until Task 7 adds the Sidebar props — that's expected)**

Run: `pnpm typecheck`
Expected: errors only about unknown Sidebar props (`joints`, `onUpdateJoint`, …). Those are resolved in Task 7. If any *other* error appears (e.g. in viewport.tsx or App logic), fix it now.

- [ ] **Step 7: Commit**

```bash
git add src/render/viewport.tsx src/App.tsx
git commit -m "feat(app): wire joint mode — J shortcut, two-click gesture, viewport highlights"
```

---

## Task 7: Sidebar — Joints panel & read-only derived cuts

**Files:**
- Create: `src/ui/JointsPanel.tsx`
- Modify: `src/ui/sidebar.tsx`

- [ ] **Step 1: Create the JointsPanel component**

`src/ui/JointsPanel.tsx`:

```tsx
import type { BoardPart, DadoJoint, Joint, Part, PartId, Scene } from '../scene/types'
import { isValidDadoSeat } from '../geom/dado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedCallback } from './useDebouncedCallback'

function JointNumInput({
  label,
  value,
  onCommit,
  suffix,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  suffix: string
}) {
  const debounced = useDebouncedCallback(onCommit, 150)
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <Label className="w-10 shrink-0 text-right">{label}</Label>
      <Input
        type="number"
        step="any"
        defaultValue={String(value)}
        key={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (isFinite(v)) debounced(v)
        }}
        className="flex-1 min-w-0"
      />
      <span className="text-[11px] text-muted-foreground shrink-0 w-8">{suffix}</span>
    </div>
  )
}

function partLabel(scene: Scene, id: PartId): string {
  return scene.parts.find((p) => p.id === id)?.label ?? '(deleted)'
}

export function JointsPanel({
  part,
  scene,
  onUpdateJoint,
  onRemoveJoint,
}: {
  part: Part
  scene: Scene
  onUpdateJoint: (jointId: string, updater: (j: DadoJoint) => DadoJoint) => void
  onRemoveJoint: (jointId: string) => void
}) {
  const joints = scene.joints.filter(
    (j) => j.housingPartId === part.id || j.housedPartId === part.id,
  )
  if (joints.length === 0) return null

  return (
    <>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground py-1.5">▾ Joints</p>
      {joints.map((j: Joint) => {
        const isHousing = j.housingPartId === part.id
        const housing = scene.parts.find((p) => p.id === j.housingPartId)
        const housed = scene.parts.find((p) => p.id === j.housedPartId)
        const stale =
          housing?.kind === 'board' && housed?.kind === 'board'
            ? !isValidDadoSeat(housing as BoardPart, j.housingFace, housed as BoardPart, j.housedEnd)
            : true
        return (
          <div key={j.id} className="border-t border-border/30 pt-1 pb-1">
            <div className="flex items-center gap-1 py-0.5">
              <span className="flex-1 text-[11px] text-foreground">{j.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {isHousing ? 'housing' : 'housed'}
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
              {isHousing ? '↔' : '→'} {isHousing ? partLabel(scene, j.housedPartId) : partLabel(scene, j.housingPartId)}
            </p>
            {stale && (
              <p className="text-[10px] text-destructive-foreground pb-1">
                Joint stale — housed board is no longer perpendicular
              </p>
            )}
            {isHousing ? (
              <>
                <JointNumInput
                  label="Depth"
                  value={j.depth}
                  suffix="mm"
                  onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, depth: Math.max(0.1, v) }))}
                />
                <JointNumInput
                  label="Clear"
                  value={j.clearance}
                  suffix="mm"
                  onCommit={(v) =>
                    onUpdateJoint(j.id, (jt) => ({ ...jt, clearance: Math.max(0, v) }))
                  }
                />
                <JointNumInput
                  label="Offset"
                  value={j.offset}
                  suffix="mm"
                  onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, offset: v }))}
                />
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground pb-0.5">
                Edit depth / clearance / offset from {partLabel(scene, j.housingPartId)}.
              </p>
            )}
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Add the joint props to `SidebarProps` and thread them**

`src/ui/sidebar.tsx` — extend the type imports (line 2-11):

```ts
import type {
  BoxCut, CutDef, CutId, CylinderPart, DadoJoint, Joint, MitreCut, Part, PartId, Scene,
} from '../scene/types'
```

Add to `SidebarProps` (after `armDowelTool`, line 58):

```ts
  joints: Joint[]
  onUpdateJoint: (jointId: string, updater: (j: DadoJoint) => DadoJoint) => void
  onRemoveJoint: (jointId: string) => void
  jointActive: boolean
  onJointToggle: () => void
  jointStatus: string | null
```

Import the panel (after the `DowelCutsPanel` import, line 13):

```ts
import { JointsPanel } from './JointsPanel'
```

- [ ] **Step 3: Add the "Add Dado" mode button**

In the `Sidebar` destructure (after `armDowelTool`, line 781) add:

```ts
  onUpdateJoint,
  onRemoveJoint,
  jointActive,
  onJointToggle,
  jointStatus,
```

In the mode-buttons block (after the Snap button, before the closing `</div>` at line 813) add:

```tsx
          <Button
            variant={jointActive ? 'secondary' : 'outline'}
            size="sm"
            onClick={onJointToggle}
            className={`w-full text-xs h-auto py-1.5 flex flex-col gap-0.5 ${jointActive ? 'border-amber-700/50 text-amber-300' : 'text-muted-foreground'}`}
          >
            <span>{jointActive ? 'Dado joint' : 'Add Dado'}</span>
            {jointActive && (
              <span className="text-[10px] text-muted-foreground font-normal">
                {jointStatus ?? 'Click housing face, then housed end · Esc to cancel'}
              </span>
            )}
          </Button>
```

- [ ] **Step 4: Render JointsPanel + make derived cut rows read-only**

Pass the joint props into `EditPanel` (in the `<EditPanel ... />` JSX, after `armDowelTool={armDowelTool}`, line 927):

```tsx
            onUpdateJoint={onUpdateJoint}
            onRemoveJoint={onRemoveJoint}
```

Add them to `EditPanel`'s prop type (after `armDowelTool: (...)`, line 494) and destructure (after `armDowelTool`, line 480):

```ts
  onUpdateJoint: (jointId: string, updater: (j: DadoJoint) => DadoJoint) => void
  onRemoveJoint: (jointId: string) => void
```
```ts
  onUpdateJoint,
  onRemoveJoint,
```

In `EditPanel`'s board cuts map (lines 712-735), skip derived cuts in the normal editor and render a read-only row instead. Replace the `.map(...)` body's `CutRow` branch selection with:

```tsx
            part.cuts.map((cut) =>
              cut.kind === 'mitre' ? (
                <MitreRow
                  key={cut.id}
                  cut={cut}
                  partId={part.id}
                  onUpdateCut={onUpdateCut}
                  onRemoveCut={onRemoveCut}
                  defaultOpen={cut.id === lastPlacedCutId}
                />
              ) : cut.sourceJointId ? (
                <div
                  key={cut.id}
                  className="border-t border-border/30 py-1 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground/70"
                >
                  <span className="flex-1">{cut.label} (joint)</span>
                  <span className="font-mono text-[10px] text-border">{cut.face}</span>
                </div>
              ) : (
                <CutRow
                  key={cut.id}
                  cut={cut}
                  partId={part.id}
                  scene={scene}
                  onUpdateCut={onUpdateCut}
                  onRemoveCut={onRemoveCut}
                  onLinkCuts={onLinkCuts}
                  onUnlinkCuts={onUnlinkCuts}
                  defaultOpen={cut.id === lastPlacedCutId}
                />
              ),
            )
```

Render the panel just before the linked-hardware block (before line 740, `{linkedHardware.length > 0 && (`):

```tsx
      <JointsPanel
        part={part}
        scene={scene}
        onUpdateJoint={onUpdateJoint}
        onRemoveJoint={onRemoveJoint}
      />

```

- [ ] **Step 5: Verify project (typecheck should now be clean)**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 6: Manual smoke test**

Run: `pnpm dev`, open the app. Add two boards. Select the second, set Rotation Y = 90 and move it so its end sits over the first board's top face. Press `J`, click the first board's top face, then the second board's end. Verify: a groove appears in the first board, the second board seats into it, both are in one undo (`Ctrl+Z` removes the joint + groove). Select the housing board → the Joints panel shows Depth/Clearance/Offset; changing Depth updates the groove live. Delete the housed board → the groove disappears; undo restores both.

- [ ] **Step 7: Commit**

```bash
git add src/ui/JointsPanel.tsx src/ui/sidebar.tsx
git commit -m "feat(ui): joints sidebar panel, Add Dado mode button, read-only derived cuts"
```

---

## Task 8: Documentation

**Files:**
- Modify: `docs/keyboard-shortcuts.md`
- Modify: `README.md`
- Modify: `project-structure.html`
- Create: `docs/superpowers/notes/2026-07-16-parametric-dado-joint-notes.md`

- [ ] **Step 1: Add the `J` shortcut**

In `docs/keyboard-shortcuts.md`, add to the Non-modifier table (after the `C` row):

```markdown
| `J` | Activate dado joint mode | Click housing face, then housed board's end |
```

And update the `Escape`, `H`, and `Delete` rows' Notes to read "Suppressed in snap/cut/joint mode".

- [ ] **Step 2: Update the README feature list**

In `README.md`, under "Parts & editing", add a bullet after the Cut-mode bullet:

```markdown
- **Dado joint mode** (`J`) — click a housing face then a housed board's end to create a parametric through-dado; the groove is generated on the housing and the housed board is seated into it, staying in sync as dimensions change
```

- [ ] **Step 3: Update project-structure.html**

In `project-structure.html`, add `src/geom/dado.ts`, `src/scene/reconcileJoints.ts`, `src/scene/useAddJoint.ts`, and `src/ui/JointsPanel.tsx` to the source-tree listing with one-line descriptions, and note `Scene.joints` + `BoxCut.sourceJointId` in the data-model section (mirror the existing entry style around the `pairedCutId` line ~619).

- [ ] **Step 4: Write the implementation notes**

Create `docs/superpowers/notes/2026-07-16-parametric-dado-joint-notes.md` capturing: (a) the spec's stale "FILE_FORMAT_VERSION 2→3" — it was already 3, bumped to 4 here; (b) the reconcile-commit + whole-scene-snapshot approach and why joint-participating `onUpdate` leaves the fast path for non-joint parts; (c) the "stale preserves last-good" decision; (d) the axis-aligned/perpendicular v1 boundary; (e) any surprises found during implementation.

- [ ] **Step 5: Final full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS (all four).

- [ ] **Step 6: Commit**

```bash
git add docs/ README.md project-structure.html
git commit -m "docs: dado joint — shortcuts, README, structure, implementation notes"
```

---

## Self-review checklist (author ran before handing off)

- **Spec coverage:** Data model (T1) · geometry/placement (T2) · reconciler incl. stale/orphan (T3) · joint CRUD + cascade + read-only guards + duplicate-strip + load-reconcile (T4) · two-click gesture (T5) · App/Viewport wiring + `J` + mode exclusion (T6) · sidebar panel + read-only rows + stale banner (T7) · docs (T8). All spec sections mapped.
- **Type consistency:** `computeDadoGroove(housing, housed, joint)` / `computeDadoSeat(housing, housed, joint)` / `deriveDadoAxes(housing, housed, housingFace)` used identically in T2/T3. `onAddJoint(FaceHit, FaceHit)`, `onUpdateJoint(string, updater)`, `onRemoveJoint(string)` consistent across T4/T6/T7. `localNormalToFaceString` exported in T4-S1, consumed in T4 & T5.
- **Known cross-task dependency:** T6 leaves `pnpm typecheck` failing on unknown Sidebar props by design; T7 closes it. Flagged in T6-S6. Run T6 and T7 back-to-back.
- **File-format note:** spec said 2→3; actual is 3→4 (already at 3). Corrected in T1 and recorded in T8 notes.
