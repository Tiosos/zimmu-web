# Half-Lap Joint (JP4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a half-lap joint — the first joint *type* beyond the dado family — where two equal-thickness, coplanar, overlapping boards each lose the complementary half of their thickness over the shared footprint so they nest flush.

**Architecture:** New pure `src/geom/halflap.ts` derives the overlap (AABB intersection of the two boards' world footprints) and emits one `BoxCut` per board. `deriveJoint` becomes a `switch (joint.kind)` dispatcher; `DeriveResult.seat` becomes optional (a half-lap repositions nothing). A two-click `useAddHalfLap` gesture + a 4th exclusive viewport mode create it; `JointsPanel` branches on `kind`.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + happy-dom, THREE-free geometry in `transform.ts`/`halflap.ts`, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-21-half-lap-joint-design.md`

**Commit conventions (every commit):** sign with `-S`; author `Claude <noreply@anthropic.com>` (already configured); end the body with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LZYYj3iGa4yi5RjEfizDJC
```
No model identifier anywhere in commits/code. Develop on branch `claude/next-step-suggestion-i0qjjd`. Run `pnpm typecheck && pnpm lint && pnpm test` before each commit (pre-commit hook runs typecheck). Local signature verification printing "No signature" is a known sandbox false-negative — fine if `git commit -S` exits 0. Make NEW commits per task (no `--amend` unless a review asks).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/geom/transform.ts` | matrix math | Add `applyInverseToPoint` (rigid inverse) |
| `src/geom/halflap.ts` | half-lap geometry | **Create** — validity, overlap, complementary-half cuts |
| `src/scene/types.ts` | canonical types | `HalfLapJoint`; `Joint = DadoJoint | HalfLapJoint` |
| `src/geom/dado.ts` | dado geometry + dispatch | `DeriveResult.seat` optional; `deriveJoint` → dispatcher + `deriveDadoJoint` |
| `src/scene/reconcileJoints.ts` | distributor | Guard the seat application |
| `src/scene/jointInvolves.ts` | joint↔part membership | **Create** — kind-aware helper |
| `src/scene/useFile.ts` | file format | `FILE_FORMAT_VERSION` `6 → 7`; `parseFile` kind-branch |
| `src/scene/useScene.ts` | scene state | `jointInvolves` filters; `onUpdateJoint` signature; `onAddHalfLap` |
| `src/scene/useAddHalfLap.ts` | gesture | **Create** — two-click state machine |
| `src/App.tsx` | composition | 4th exclusive mode: compose hook, mutual-exclusion, shortcut, Viewport/Sidebar props |
| `src/render/viewport.tsx` | canvas + raycaster | Half-lap mode props + click/hover routing (raycaster unchanged) |
| `src/ui/sidebar.tsx` | sidebar shell | `onUpdateJoint` prop typing; half-lap mode button props |
| `src/ui/JointsPanel.tsx` | joint editor | Kind-branch; half-lap `Split`/`Clear` controls |

**Unchanged:** `computeDado*`/`computeRabbet`/`computeNotch`, `useAddJoint.ts`, `snapMath.ts`, `occt.*`, `mesh.ts`, STL/STEP export, `drawing.ts`.

---

## Task 1: Half-lap geometry + `HalfLapJoint` type + optional seat

Self-contained geometry, defined against `HalfLapJoint` **before** it enters the `Joint` union (so nothing else breaks yet). Also makes `DeriveResult.seat` optional (backward-compatible; dados still return a seat) so `deriveHalfLap` can omit it.

**Files:**
- Modify: `src/geom/transform.ts` (add `applyInverseToPoint`)
- Modify: `src/scene/types.ts` (add `HalfLapJoint`, exported; do **not** change `Joint` yet)
- Modify: `src/geom/dado.ts:20` (`DeriveResult.seat` optional)
- Modify: `src/scene/reconcileJoints.ts:42-44` (guard)
- Create: `src/geom/halflap.ts`, `src/geom/halflap.test.ts`
- Test: `src/geom/transform.test.ts` (parity for the inverse)

- [ ] **Step 1: Add `HalfLapJoint` to types (not in the union yet)**

In `src/scene/types.ts`, after the `DadoJoint` interface (ends ~line 141) and **before** `export type Joint = DadoJoint`:

```ts
export interface HalfLapJoint {
  kind: 'halflap'
  id: string // "joint_<uuid>"
  label: string // "Half-lap 1"
  partAId: PartId // the two lapping boards — A/B is just an ordering
  partBId: PartId
  split: number // 0..1 — fraction of thickness board A keeps (default 0.5 = true half-lap)
  clearance: number // mm added to each notch's thickness-depth for fit (default 0)
}
```

Leave `export type Joint = DadoJoint` unchanged in this task.

- [ ] **Step 2: Write the failing inverse-parity test**

In `src/geom/transform.test.ts`, add:

```ts
test('applyInverseToPoint undoes applyMatrixToPoint for a rotated, translated board', () => {
  const b: BoardPart = {
    kind: 'board', id: 'b', label: 'B', length: 100, width: 50, thickness: 20,
    material: '', color: '#fff', position: { x: 12, y: -7, z: 3 },
    rotation: { x: 10, y: 20, z: 30 }, rotationOrder: 'XYZ', cuts: [], visible: true,
  }
  const m = composeWorldMatrix(b)
  const [wx, wy, wz] = applyMatrixToPoint(m, 40, 15, 8)
  const [lx, ly, lz] = applyInverseToPoint(m, wx, wy, wz)
  expect(lx).toBeCloseTo(40, 6)
  expect(ly).toBeCloseTo(15, 6)
  expect(lz).toBeCloseTo(8, 6)
})
```

Ensure the imports at the top of the file include `applyInverseToPoint` and (if not present) `BoardPart`. Run `pnpm vitest run src/geom/transform.test.ts -t "applyInverseToPoint"` → FAIL (not exported).

- [ ] **Step 3: Implement `applyInverseToPoint`**

In `src/geom/transform.ts`, append:

```ts
// Apply the inverse of a rigid (rotation + translation, unit-scale) column-major matrix to a
// point. Since scale is 1, the rotation block is orthonormal ⇒ inverse rotation = transpose:
// local = Rᵀ · (world − t).
export function applyInverseToPoint(
  m: Float64Array,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const dx = x - m[12]
  const dy = y - m[13]
  const dz = z - m[14]
  return [
    m[0] * dx + m[1] * dy + m[2] * dz,
    m[4] * dx + m[5] * dy + m[6] * dz,
    m[8] * dx + m[9] * dy + m[10] * dz,
  ]
}
```

Run the test → PASS.

- [ ] **Step 4: Make `DeriveResult.seat` optional + guard the reconciler**

`src/geom/dado.ts:20`:
```ts
export type DeriveResult = { cuts: DerivedCut[]; seat?: { partId: PartId; position: Vec3 } }
```

`src/scene/reconcileJoints.ts` — replace the seat application (currently lines 42-44):
```ts
    const seat = result.seat
    if (seat) {
      parts = parts.map((p) => (p.id === seat.partId ? { ...p, position: seat.position } : p))
    }
```

Run `pnpm typecheck` → clean (dado's `deriveDadoJoint`/`deriveJoint` still returns a seat, which satisfies the optional).

- [ ] **Step 5: Write the failing `halflap.ts` tests**

Create `src/geom/halflap.test.ts`. Fixtures: two coplanar boards whose footprints overlap on `x∈[80,120]`, `y∈[0,40]`, both `z∈[0,20]`; plus a `Rz=90` board for the AABB/stack test.

```ts
import { test, expect } from 'vitest'
import type { BoardPart, HalfLapJoint, Part } from '../scene/types'
import { isValidHalfLap, stackAxis, worldAabb, deriveHalfLap } from './halflap'

const A: BoardPart = {
  kind: 'board', id: 'A', label: 'A', length: 200, width: 40, thickness: 20,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const B: BoardPart = {
  ...A, id: 'B', label: 'B', length: 40, width: 200, position: { x: 80, y: -80, z: 0 },
}
const parts: Part[] = [A, B]
const joint: HalfLapJoint = {
  kind: 'halflap', id: 'j1', label: 'Half-lap 1', partAId: 'A', partBId: 'B', split: 0.5, clearance: 0,
}

test('stackAxis / worldAabb for an axis-aligned board', () => {
  expect(stackAxis(A)).toBe('z')
  expect(worldAabb(A)).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 200, y: 40, z: 20 } })
})

test('worldAabb / stackAxis for a Rz=90 board', () => {
  const C: BoardPart = { ...A, id: 'C', rotation: { x: 0, y: 0, z: 90 } }
  expect(stackAxis(C)).toBe('z')
  const bb = worldAabb(C)
  expect(bb.min.x).toBeCloseTo(-40, 6)
  expect(bb.max.x).toBeCloseTo(0, 6)
  expect(bb.min.y).toBeCloseTo(0, 6)
  expect(bb.max.y).toBeCloseTo(200, 6)
})

test('isValidHalfLap: coplanar equal-thickness overlapping boards are valid', () => {
  expect(isValidHalfLap(A, B)).toBe(true)
})

test('isValidHalfLap: a z-offset (non-coplanar) board is invalid', () => {
  expect(isValidHalfLap(A, { ...B, position: { x: 80, y: -80, z: 5 } })).toBe(false)
})

test('isValidHalfLap: unequal thickness is invalid', () => {
  expect(isValidHalfLap(A, { ...B, thickness: 25 })).toBe(false)
})

test('isValidHalfLap: disjoint footprints are invalid', () => {
  expect(isValidHalfLap(A, { ...B, position: { x: 400, y: -80, z: 0 } })).toBe(false)
})

test('deriveHalfLap: complementary corner cuts, one per board, no seat', () => {
  const r = deriveHalfLap(joint, parts)
  expect(r).not.toBeNull()
  expect(r!.seat).toBeUndefined()
  expect(r!.cuts).toHaveLength(2)
  const cutA = r!.cuts.find((c) => c.partId === 'A')!.cut
  const cutB = r!.cuts.find((c) => c.partId === 'B')!.cut
  // A keeps low [0,10], removes high [10,20] over the overlap footprint (world = local for A):
  expect(cutA.id).toBe('cut_j1_lapA')
  expect(cutA.position).toEqual({ x: 80, y: 0, z: 10 })
  expect(cutA.size).toEqual({ x: 40, y: 40, z: 10 })
  expect(cutA.sourceJointId).toBe('j1')
  // B keeps high [10,20], removes low [0,10]; B local = world − (80,−80,0):
  expect(cutB.id).toBe('cut_j1_lapB')
  expect(cutB.position).toEqual({ x: 0, y: 80, z: 0 })
  expect(cutB.size).toEqual({ x: 40, y: 40, z: 10 })
})

test('deriveHalfLap: split shifts the shared plane', () => {
  const r = deriveHalfLap({ ...joint, split: 0.25 }, parts)!
  const cutA = r.cuts.find((c) => c.partId === 'A')!.cut
  expect(cutA.position.z).toBeCloseTo(5, 6) // mid = 0.25*20
  expect(cutA.size.z).toBeCloseTo(15, 6) // 20 − 5
})

test('deriveHalfLap: stale (non-coplanar) returns null', () => {
  expect(deriveHalfLap(joint, [A, { ...B, position: { x: 80, y: -80, z: 5 } }])).toBeNull()
})
```

Run `pnpm vitest run src/geom/halflap.test.ts` → FAIL (module missing).

- [ ] **Step 6: Implement `src/geom/halflap.ts`**

```ts
import type { BoardPart, BoxCut, CutId, HalfLapJoint, Part, Vec3 } from '../scene/types'
import type { DeriveResult } from './dado'
import { applyInverseToPoint, applyMatrixToPoint, composeWorldMatrix } from './transform'

type Axis = 'x' | 'y' | 'z'
const AXES: Axis[] = ['x', 'y', 'z']
const EPS = 1e-4

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function boardDims(b: BoardPart): Record<Axis, number> {
  return { x: b.length, y: b.width, z: b.thickness }
}

// Axis-aligned world bounding box from the 8 local corners (exact for axis-aligned boards).
export function worldAabb(b: BoardPart): { min: Vec3; max: Vec3 } {
  const m = composeWorldMatrix(b)
  const d = boardDims(b)
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity }
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const cx of [0, d.x]) {
    for (const cy of [0, d.y]) {
      for (const cz of [0, d.z]) {
        const [wx, wy, wz] = applyMatrixToPoint(m, cx, cy, cz)
        if (wx < min.x) min.x = wx
        if (wx > max.x) max.x = wx
        if (wy < min.y) min.y = wy
        if (wy > max.y) max.y = wy
        if (wz < min.z) min.z = wz
        if (wz > max.z) max.z = wz
      }
    }
  }
  return { min, max }
}

// World axis the board's thickness (local +Z) lies along = the 3rd column of the world matrix.
export function stackAxis(b: BoardPart): Axis {
  const m = composeWorldMatrix(b)
  const ax = Math.abs(m[8])
  const ay = Math.abs(m[9])
  const az = Math.abs(m[10])
  if (az >= ax && az >= ay) return 'z'
  if (ay >= ax) return 'y'
  return 'x'
}

export function isValidHalfLap(a: BoardPart, b: BoardPart): boolean {
  const s = stackAxis(a)
  if (stackAxis(b) !== s) return false
  const A = worldAabb(a)
  const B = worldAabb(b)
  if (Math.abs(A.min[s] - B.min[s]) > EPS || Math.abs(A.max[s] - B.max[s]) > EPS) return false
  for (const ax of AXES) {
    if (ax === s) continue
    const lo = Math.max(A.min[ax], B.min[ax])
    const hi = Math.min(A.max[ax], B.max[ax])
    if (hi - lo <= EPS) return false
  }
  return true
}

// Convert a world AABB [wmin,wmax] into a local BoxCut on `b` (exact for axis-aligned boards).
function worldBoxToLocalCut(
  b: BoardPart,
  wmin: Vec3,
  wmax: Vec3,
  id: CutId,
  label: string,
  jointId: string,
): BoxCut {
  const m = composeWorldMatrix(b)
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity }
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const px of [wmin.x, wmax.x]) {
    for (const py of [wmin.y, wmax.y]) {
      for (const pz of [wmin.z, wmax.z]) {
        const [lx, ly, lz] = applyInverseToPoint(m, px, py, pz)
        if (lx < min.x) min.x = lx
        if (lx > max.x) max.x = lx
        if (ly < min.y) min.y = ly
        if (ly > max.y) max.y = ly
        if (lz < min.z) min.z = lz
        if (lz > max.z) max.z = lz
      }
    }
  }
  return {
    kind: 'box',
    id,
    label,
    face: '+Z', // cosmetic; geometry lives in position/size
    position: { x: min.x, y: min.y, z: min.z },
    size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
    sourceJointId: jointId,
  }
}

export function deriveHalfLap(joint: HalfLapJoint, parts: Part[]): DeriveResult | null {
  const a = parts.find((p) => p.id === joint.partAId)
  const b = parts.find((p) => p.id === joint.partBId)
  if (a?.kind !== 'board' || b?.kind !== 'board') return null
  if (!isValidHalfLap(a, b)) return null

  const s = stackAxis(a)
  const A = worldAabb(a)
  const B = worldAabb(b)
  const s0 = A.min[s]
  const s1 = A.max[s]
  const mid = s0 + clamp(joint.split, 0.05, 0.95) * (s1 - s0)
  const c = Math.max(0, joint.clearance)

  const lo: Vec3 = { x: 0, y: 0, z: 0 }
  const hi: Vec3 = { x: 0, y: 0, z: 0 }
  for (const ax of AXES) {
    lo[ax] = ax === s ? s0 : Math.max(A.min[ax], B.min[ax])
    hi[ax] = ax === s ? s1 : Math.min(A.max[ax], B.max[ax])
  }

  // A keeps the low half [s0, mid]; removes the high half [mid − c, s1].
  const aMin: Vec3 = { ...lo }
  const aMax: Vec3 = { ...hi }
  aMin[s] = mid - c
  aMax[s] = s1
  // B keeps the high half [mid, s1]; removes the low half [s0, mid + c].
  const bMin: Vec3 = { ...lo }
  const bMax: Vec3 = { ...hi }
  bMin[s] = s0
  bMax[s] = mid + c

  const cutA = worldBoxToLocalCut(a, aMin, aMax, `cut_${joint.id}_lapA` as CutId, `${joint.label} lap`, joint.id)
  const cutB = worldBoxToLocalCut(b, bMin, bMax, `cut_${joint.id}_lapB` as CutId, `${joint.label} lap`, joint.id)
  return { cuts: [{ partId: a.id, cut: cutA }, { partId: b.id, cut: cutB }] }
}
```

Run `pnpm vitest run src/geom/halflap.test.ts` → PASS (all).

- [ ] **Step 7: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS (halflap tested; dado/reconciler tests still green — optional seat is backward-compatible).

```bash
git add src/geom/transform.ts src/geom/transform.test.ts src/geom/halflap.ts src/geom/halflap.test.ts \
  src/scene/types.ts src/geom/dado.ts src/scene/reconcileJoints.ts
git commit -S -m "feat(geom): half-lap geometry + optional DeriveResult.seat

<trailers per Commit conventions>"
```

---

## Task 2: Polymorphism flip — `Joint` union, `deriveJoint` dispatch, consumer fixes

Flip the union and fix every consumer so typecheck stays green. `onUpdateJoint` needs only a signature change: its call sites spread-and-write (`(jt) => ({ ...jt, field })`) and never read a dado-only field off `jt`, so a plain `(j: Joint) => Joint` type-checks all existing calls unchanged.

**Files:**
- Modify: `src/scene/types.ts` (union)
- Modify: `src/geom/dado.ts:266` (dispatch + `deriveDadoJoint`)
- Create: `src/scene/jointInvolves.ts` (+ `.test.ts`)
- Modify: `src/scene/useScene.ts:94,364,482,915,922` (filters, `onUpdateJoint` signature + label)
- Modify: `src/ui/sidebar.tsx:61,504` (prop typing)
- Modify: `src/ui/JointsPanel.tsx:58,62` + map body (typing + narrow)
- Modify: `src/scene/useFile.ts:5,73-84` (version + kind-branch)

- [ ] **Step 1: Flip the union**

`src/scene/types.ts` — change `export type Joint = DadoJoint` to:
```ts
export type Joint = DadoJoint | HalfLapJoint
```

Run `pnpm typecheck` → FAIL in several files (dado.ts, useScene.ts, JointsPanel.tsx). Expected; the next steps fix them.

- [ ] **Step 2: `deriveJoint` dispatch + `deriveDadoJoint` extraction**

In `src/geom/dado.ts`: rename the existing `export function deriveJoint(joint: Joint, parts: Part[])` to `function deriveDadoJoint(joint: DadoJoint, parts: Part[]): DeriveResult | null` (keep its body byte-for-byte), and add a new exported dispatcher plus the half-lap import.

Add near the top imports:
```ts
import { deriveHalfLap } from './halflap'
```
Replace the function signature line `export function deriveJoint(joint: Joint, parts: Part[]): DeriveResult | null {` with `function deriveDadoJoint(joint: DadoJoint, parts: Part[]): DeriveResult | null {`, and immediately **before** it add:
```ts
export function deriveJoint(joint: Joint, parts: Part[]): DeriveResult | null {
  switch (joint.kind) {
    case 'dado':
      return deriveDadoJoint(joint, parts)
    case 'halflap':
      return deriveHalfLap(joint, parts)
  }
}

```
(`halflap.ts` type-imports `DeriveResult` from `dado.ts`; `dado.ts` imports the `deriveHalfLap` value from `halflap.ts` — one-directional, no runtime cycle.)

- [ ] **Step 3: Write the failing `jointInvolves` test**

Create `src/scene/jointInvolves.test.ts`:
```ts
import { test, expect } from 'vitest'
import type { DadoJoint, HalfLapJoint } from './types'
import { jointInvolves } from './jointInvolves'

const dado: DadoJoint = {
  kind: 'dado', id: 'd', label: 'D', housingPartId: 'H', housingFace: '+Z', housedPartId: 'W',
  housedEnd: '+X', offset: 0, depth: 8, clearance: 0, profile: 'plain', tongueThickness: 8,
  rabbetFace: '+Z', stopStart: 0, stopEnd: 0,
}
const lap: HalfLapJoint = {
  kind: 'halflap', id: 'l', label: 'L', partAId: 'A', partBId: 'B', split: 0.5, clearance: 0,
}

test('jointInvolves: dado matches housing/housed', () => {
  expect(jointInvolves(dado, 'H')).toBe(true)
  expect(jointInvolves(dado, 'W')).toBe(true)
  expect(jointInvolves(dado, 'X')).toBe(false)
})

test('jointInvolves: half-lap matches partA/partB', () => {
  expect(jointInvolves(lap, 'A')).toBe(true)
  expect(jointInvolves(lap, 'B')).toBe(true)
  expect(jointInvolves(lap, 'X')).toBe(false)
})
```
Run → FAIL (module missing).

- [ ] **Step 4: Implement `jointInvolves`**

Create `src/scene/jointInvolves.ts`:
```ts
import type { Joint, PartId } from './types'

export function jointInvolves(joint: Joint, partId: PartId): boolean {
  return joint.kind === 'dado'
    ? joint.housingPartId === partId || joint.housedPartId === partId
    : joint.partAId === partId || joint.partBId === partId
}
```
Run the test → PASS.

- [ ] **Step 5: Fix `useScene` filters + `onUpdateJoint` signature**

In `src/scene/useScene.ts`:
- Add import: `import { jointInvolves } from './jointInvolves'`.
- Line ~364: replace `joints: before.joints.filter((j) => j.housingPartId !== id && j.housedPartId !== id),` with:
  ```ts
        joints: before.joints.filter((j) => !jointInvolves(j, id)),
  ```
- Lines ~481-483: replace the `participates` predicate:
  ```ts
      const participates = before.joints.some((j) => jointInvolves(j, id))
  ```
- Line ~94 (in `UseSceneResult`): change `onUpdateJoint: (jointId: string, updater: (j: DadoJoint) => DadoJoint) => void` to:
  ```ts
  onUpdateJoint: (jointId: string, updater: (j: Joint) => Joint) => void
  ```
- Lines ~915/922 (the `onUpdateJoint` implementation): change the parameter type and label:
  ```ts
    (jointId: string, updater: (j: Joint) => Joint) => {
      if (!sceneRef.current.joints.some((j) => j.id === jointId)) return
      commitReconciled(
        (prev) => ({
          ...prev,
          joints: prev.joints.map((j) => (j.id === jointId ? updater(j) : j)),
        }),
        'Edit joint',
        `joint-${jointId}`,
      )
    },
  ```
  Ensure `Joint` is imported in `useScene.ts` (it already imports from `./types`; add `Joint` to that import if absent).

- [ ] **Step 6: Fix `sidebar.tsx` prop typing**

In `src/ui/sidebar.tsx`, both prop-interface declarations (lines ~61 and ~504) currently read `onUpdateJoint: (jointId: string, updater: (j: DadoJoint) => DadoJoint) => void`. Change **both** to:
```ts
  onUpdateJoint: (jointId: string, updater: (j: Joint) => Joint) => void
```
Add `Joint` to the type import from `../scene/types` (and remove `DadoJoint` from that import only if it becomes unused).

- [ ] **Step 7: Narrow `JointsPanel` (minimal — half-lap controls come in Task 6)**

In `src/ui/JointsPanel.tsx`:
- Add import: `import { jointInvolves } from '../scene/jointInvolves'`.
- Line ~58 (prop type): change to `onUpdateJoint: (jointId: string, updater: (j: Joint) => Joint) => void`. Add `Joint` to the type import.
- Line ~62 (filter): replace `(j) => j.housingPartId === part.id || j.housedPartId === part.id,` with:
  ```ts
    (j) => jointInvolves(j, part.id),
  ```
- As the **first line** of the `joints.map((j: Joint) => {` callback body (before `const isHousing = ...`), add:
  ```ts
        if (j.kind !== 'dado') return null
  ```
  (Half-laps render no panel row yet; Task 6 replaces this with the real half-lap branch. The `j.kind !== 'dado'` guard narrows `j` to `DadoJoint` for the rest of the callback, so all existing `j.housingPartId`/`j.profile`/etc. accesses type-check unchanged.)

- [ ] **Step 8: `parseFile` kind-branch + version bump**

In `src/scene/useFile.ts`:
- Line 5: `export const FILE_FORMAT_VERSION = 7`.
- Lines ~73-84 (the joint-defaulting `.map`): branch on `j.kind` so half-laps aren't given dado defaults:
  ```ts
      // v4→v5: profile (+ tongueThickness/rabbetFace). v5→v6: stopStart/stopEnd.
      // v6→v7: half-lap joints (kind 'halflap'); legacy joints are all dados.
      joints: ((raw.scene.joints ?? []) as unknown as Array<Record<string, unknown>>).map((j) =>
        j.kind === 'halflap'
          ? ({ split: 0.5, clearance: 0, ...j } as unknown as Joint)
          : ({
              profile: 'plain' as const,
              tongueThickness: 6,
              rabbetFace: '+Z' as const,
              stopStart: 0,
              stopEnd: 0,
              ...j,
            } as unknown as Joint),
      ),
  ```

- [ ] **Step 9: Write a dispatch test**

In `src/geom/dado.test.ts`, add (near the `deriveJoint` tests):
```ts
test('deriveJoint dispatches half-laps to the half-lap deriver (no seat)', () => {
  const la: BoardPart = { ...housing, id: 'LA', length: 200, width: 40, thickness: 20, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
  const lb: BoardPart = { ...la, id: 'LB', length: 40, width: 200, position: { x: 80, y: -80, z: 0 } }
  const lap = { kind: 'halflap' as const, id: 'jl', label: 'Half-lap 1', partAId: 'LA', partBId: 'LB', split: 0.5, clearance: 0 }
  const r = deriveJoint(lap, [la, lb])
  expect(r).not.toBeNull()
  expect(r!.seat).toBeUndefined()
  expect(r!.cuts.map((c) => c.partId).sort()).toEqual(['LA', 'LB'])
})
```
(`housing` is the existing dado fixture; we override its dims/placement for the lap boards.)

- [ ] **Step 10: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS — all consumers compile under the union; existing dado tests + new jointInvolves/dispatch tests green.

```bash
git add src/scene/types.ts src/geom/dado.ts src/geom/dado.test.ts src/scene/jointInvolves.ts \
  src/scene/jointInvolves.test.ts src/scene/useScene.ts src/ui/sidebar.tsx src/ui/JointsPanel.tsx \
  src/scene/useFile.ts
git commit -S -m "feat(joints): make deriveJoint polymorphic; Joint = DadoJoint | HalfLapJoint

<trailers per Commit conventions>"
```

---

## Task 3: `onAddHalfLap` in `useScene`

Add the creation method (mirrors `onAddJoint`): construct a `HalfLapJoint`, append, reconcile, one undo entry.

**Files:**
- Modify: `src/scene/useScene.ts` (`UseSceneResult` type + `onAddHalfLap` + return object)
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scene/useScene.test.ts`, in the `useScene — joints` describe, after the existing tests. It builds two coplanar overlapping boards and adds a half-lap. Reuse the block's `asBoard`; add a small helper inline:

```ts
  it('onAddHalfLap creates a half-lap + two lap cuts in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [P, Q] = result.current.scene.parts
    // Force them coplanar + fully overlapping so the half-lap is valid (not stale),
    // independent of onAdd's default placement.
    await act(async () => {
      result.current.onUpdate(P.id, (p) => ({ ...p, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }), 'posP')
      result.current.onUpdate(Q.id, (p) => ({ ...p, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }), 'posQ')
    })
    await act(async () => {
      result.current.onAddHalfLap(P.id, Q.id)
    })
    expect(result.current.scene.joints).toHaveLength(1)
    expect(result.current.scene.joints[0].kind).toBe('halflap')
    const lapCuts = () =>
      result.current.scene.parts.filter(
        (p) => p.kind === 'board' && p.cuts.some((c) => c.kind === 'box' && c.sourceJointId),
      ).length
    expect(lapCuts()).toBe(2) // one lap cut on each board

    await act(async () => result.current.undo())
    expect(result.current.scene.joints).toHaveLength(0)
    expect(lapCuts()).toBe(0)
  })
```
Run `pnpm vitest run src/scene/useScene.test.ts -t "onAddHalfLap"` → FAIL (not a function).

- [ ] **Step 2: Add `onAddHalfLap` to the result type**

In `src/scene/useScene.ts` `UseSceneResult`, after `onAddJoint`:
```ts
  onAddHalfLap: (aId: PartId, bId: PartId) => void
```

- [ ] **Step 3: Implement `onAddHalfLap`**

In `src/scene/useScene.ts`, after the `onAddJoint` `useCallback` (ends ~line 912):
```ts
  const onAddHalfLap = useCallback(
    (aId: PartId, bId: PartId) => {
      const s = sceneRef.current
      const a = s.parts.find((p) => p.id === aId)
      const b = s.parts.find((p) => p.id === bId)
      if (a?.kind !== 'board' || b?.kind !== 'board' || a.id === b.id) return
      const n = s.joints.filter((j) => j.kind === 'halflap').length + 1
      const joint: Joint = {
        kind: 'halflap',
        id: `joint_${crypto.randomUUID()}`,
        label: `Half-lap ${n}`,
        partAId: a.id,
        partBId: b.id,
        split: 0.5,
        clearance: 0,
      }
      commitReconciled((prev) => ({ ...prev, joints: [...prev.joints, joint] }), 'Add half-lap')
      setSelectedId(a.id)
    },
    [commitReconciled],
  )
```
Add `onAddHalfLap` to the returned object (near `onAddJoint`, ~line 1030).

- [ ] **Step 4: Run + commit**

Run: `pnpm vitest run src/scene/useScene.test.ts` then `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -S -m "feat(scene): onAddHalfLap creates a half-lap joint in one undo entry

<trailers per Commit conventions>"
```

---

## Task 4: `useAddHalfLap` two-click gesture

Mirror `useAddJoint`: collect two `FaceHit`s on **different** boards, then call `onAddHalfLap`.

**Files:**
- Create: `src/scene/useAddHalfLap.ts`, `src/scene/useAddHalfLap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/useAddHalfLap.test.ts`:
```ts
import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useAddHalfLap } from './useAddHalfLap'

const board = (id: string): Part => ({
  kind: 'board', id, label: id, length: 100, width: 100, thickness: 20,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
})
const hit = (partId: string): FaceHit => ({
  partId, faceNormal: { x: 0, y: 0, z: 1 }, faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: { x: 0, y: 0, z: 1 }, localHitPoint: { x: 0, y: 0, z: 0 }, hitPoint: { x: 0, y: 0, z: 0 },
})

test('two clicks on different boards create a half-lap', () => {
  const onAddHalfLap = vi.fn()
  const parts = [board('A'), board('B')]
  const { result } = renderHook(() => useAddHalfLap({ parts, onAddHalfLap }))
  act(() => result.current.activateHalfLap())
  act(() => result.current.onFaceClick(hit('A')))
  expect(onAddHalfLap).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('B')))
  expect(onAddHalfLap).toHaveBeenCalledWith('A', 'B')
})

test('a second click on the same board does not create a half-lap', () => {
  const onAddHalfLap = vi.fn()
  const parts = [board('A'), board('B')]
  const { result } = renderHook(() => useAddHalfLap({ parts, onAddHalfLap }))
  act(() => result.current.activateHalfLap())
  act(() => result.current.onFaceClick(hit('A')))
  act(() => result.current.onFaceClick(hit('A')))
  expect(onAddHalfLap).not.toHaveBeenCalled()
})
```
Run → FAIL (module missing).

- [ ] **Step 2: Implement `useAddHalfLap`**

Create `src/scene/useAddHalfLap.ts`:
```ts
import { useState, useCallback } from 'react'
import type { FaceHit, Part } from './types'

export interface AddHalfLapState {
  halfLapActive: boolean
  pendingA: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateHalfLap: () => void
  cancelHalfLap: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddHalfLap(params: {
  parts: Part[]
  onAddHalfLap: (aId: string, bId: string) => void
}): AddHalfLapState {
  const { parts, onAddHalfLap } = params
  const [halfLapActive, setHalfLapActive] = useState(false)
  const [pendingA, setPendingA] = useState<FaceHit | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [hoveredFace, setHoveredFace] = useState<FaceHit | null>(null)

  const activateHalfLap = useCallback(() => {
    setHalfLapActive((v) => !v)
    setPendingA(null)
    setStatusMessage(null)
    setHoveredFace(null)
  }, [])

  const cancelHalfLap = useCallback(() => {
    setHalfLapActive(false)
    setPendingA(null)
    setStatusMessage(null)
    setHoveredFace(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (part?.kind !== 'board') return
      if (pendingA === null) {
        setPendingA(hit)
        setStatusMessage(null)
        return
      }
      if (hit.partId === pendingA.partId) {
        setStatusMessage('Pick a different board for the second half of the lap')
        setPendingA(null)
        return
      }
      onAddHalfLap(pendingA.partId, hit.partId)
      setPendingA(null)
      setHalfLapActive(false)
      setHoveredFace(null)
    },
    [parts, pendingA, onAddHalfLap],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHoveredFace(halfLapActive ? hit : null)
    },
    [halfLapActive],
  )

  return {
    halfLapActive,
    pendingA,
    statusMessage,
    hoveredFace,
    activateHalfLap,
    cancelHalfLap,
    onFaceClick,
    onFaceHover,
  }
}
```
Run the test → PASS.

- [ ] **Step 3: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/scene/useAddHalfLap.ts src/scene/useAddHalfLap.test.ts
git commit -S -m "feat(scene): useAddHalfLap two-click gesture

<trailers per Commit conventions>"
```

---

## Task 5: App + Viewport + Sidebar — the 4th exclusive mode

Wire the gesture into the App's mutual-exclusion mode set (snap/cut/joint → +half-lap), add a shortcut + a Sidebar toolbar button, and route face clicks/hovers through the Viewport.

**Files:**
- Modify: `src/App.tsx` (compose hook, `handleActivateHalfLap`, mutual-exclusion, Escape/guards, shortcut `l`, Viewport + Sidebar props)
- Modify: `src/render/viewport.tsx` (half-lap props + refs + click/hover routing + cursor/effect guards)
- Modify: `src/ui/sidebar.tsx` (half-lap button props + render, mirroring the joint button)

> This is an integration task with no new logic — every edit mirrors the existing `joint` mode. There are no unit tests for wiring; verification is typecheck + lint + the full suite staying green (the gesture/scene logic is already covered by Tasks 3-4). Manual 3D verification is a human step (OCCT WASM doesn't boot headless).

- [ ] **Step 1: Compose the hook in `App.tsx`**

After the `useAddJoint({ ... })` destructure (~line 95):
```ts
  const {
    halfLapActive,
    statusMessage: halfLapStatus,
    hoveredFace: halfLapHoveredFace,
    activateHalfLap,
    cancelHalfLap,
    onFaceClick: onFaceClickHalfLap,
    onFaceHover: onFaceHoverHalfLap,
  } = useAddHalfLap({ parts: scene.parts, onAddHalfLap })
```
Add the import: `import { useAddHalfLap } from './scene/useAddHalfLap'` and destructure `onAddHalfLap` from `useScene()` alongside `onAddJoint` (~line 40).

- [ ] **Step 2: Mutual exclusion**

Update the three existing `handleActivate*` (lines ~148-162) to also `cancelHalfLap()`, and add a fourth:
```ts
  const handleActivateCut = useCallback(() => {
    cancelSnap()
    cancelJoint()
    cancelHalfLap()
    activateCut()
  }, [cancelSnap, cancelJoint, cancelHalfLap, activateCut])
  const handleActivateSnap = useCallback(() => {
    cancelCut()
    cancelJoint()
    cancelHalfLap()
    activateSnap()
  }, [cancelCut, cancelJoint, cancelHalfLap, activateSnap])
  const handleActivateJoint = useCallback(() => {
    cancelCut()
    cancelSnap()
    cancelHalfLap()
    activateJoint()
  }, [cancelCut, cancelSnap, cancelHalfLap, activateJoint])
  const handleActivateHalfLap = useCallback(() => {
    cancelCut()
    cancelSnap()
    cancelJoint()
    activateHalfLap()
  }, [cancelCut, cancelSnap, cancelJoint, activateHalfLap])
```

- [ ] **Step 3: Keyboard shortcut + Escape/guards**

In the non-modifier keydown block (~line 170), add a case (place after the `j` case ~line 185):
```ts
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault()
          handleActivateHalfLap()
          return
        }
```
In the `Escape` handler (~line 189) add: `if (halfLapActive) cancelHalfLap()`.
In the `h` (visibility, ~line 193) and `Delete/Backspace` (~line 200) guards, extend the condition `!snapActive && !cutActive && !jointActive` to also include `&& !halfLapActive`.
Add `handleActivateHalfLap`, `cancelHalfLap`, `halfLapActive` to the effect's dependency array (~line 248).

- [ ] **Step 4: Viewport props + routing**

In `src/render/viewport.tsx`:
- Props interface (after `jointHoveredFace`, ~line 34):
  ```ts
  halfLapActive: boolean
  onFaceClickHalfLap: (hit: FaceHit) => void
  onFaceHoverHalfLap: (hit: FaceHit | null) => void
  halfLapPendingFace: FaceHit | null
  halfLapHoveredFace: FaceHit | null
  ```
- Destructure them (~line 58) and add refs mirroring the joint refs:
  ```ts
  const halfLapActiveRef = useRef(halfLapActive)
  const onFaceClickHalfLapRef = useRef(onFaceClickHalfLap)
  const onFaceHoverHalfLapRef = useRef(onFaceHoverHalfLap)
  ```
- In the ref-sync effect (~line 99): `halfLapActiveRef.current = halfLapActive; onFaceClickHalfLapRef.current = onFaceClickHalfLap; onFaceHoverHalfLapRef.current = onFaceHoverHalfLap`.
- Click dispatch (~line 343): add a **first** branch before `if (jointActiveRef.current)`:
  ```ts
      if (halfLapActiveRef.current) {
        if (hits.length > 0) {
          const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current)
          if (faceHit) onFaceClickHalfLapRef.current(faceHit)
        }
      } else if (jointActiveRef.current) {
  ```
- Hover guard (~line 378): extend `if (!snapActiveRef.current && !cutActiveRef.current && !jointActiveRef.current) return` to also `&& !halfLapActiveRef.current`.
- Hover dispatch (~lines 388-397): add half-lap as the first branch:
  ```ts
          if (halfLapActiveRef.current) onFaceHoverHalfLapRef.current(hit)
          else if (jointActiveRef.current) onFaceHoverJointRef.current(hit)
          else if (cutActiveRef.current) onFaceHoverCutRef.current(hit)
          else onFaceHoverRef.current(hit)
  ```
  (and the same for the `null` branch).
- Highlight effect (~lines 563-572): include the half-lap pending/hovered faces:
  ```ts
    updateHighlight(
      sourceHighlightRef.current,
      snapActive ? sourceFace : jointActive ? jointHousingFace : halfLapActive ? halfLapPendingFace : null,
      0xfbbf24,
    )
    updateHighlight(
      hoverHighlightRef.current,
      halfLapActive ? halfLapHoveredFace : jointActive ? jointHoveredFace : snapActive || cutActive ? hoveredFace : null,
      0x60a5fa,
    )
  ```
  Add `halfLapActive`, `halfLapPendingFace`, `halfLapHoveredFace` to that effect's deps (~line 573) and to the cursor effect condition + deps (~lines 620-624): `snapActive || cutActive || jointActive || halfLapActive`.

- [ ] **Step 5: Pass Viewport + Sidebar props in `App.tsx`**

In the `<Viewport ... />` (~line 315), after the joint props:
```tsx
          halfLapActive={halfLapActive}
          onFaceClickHalfLap={onFaceClickHalfLap}
          onFaceHoverHalfLap={onFaceHoverHalfLap}
          halfLapPendingFace={halfLapPendingFace}
          halfLapHoveredFace={halfLapHoveredFace}
```
where `halfLapPendingFace` comes from the hook — add `pendingA: halfLapPendingFace` to the Step 1 destructure (`pendingA` renamed). In the `<Sidebar ... />` (~line 338), after the joint props:
```tsx
          halfLapActive={halfLapActive}
          onHalfLapToggle={handleActivateHalfLap}
          halfLapStatus={halfLapStatus}
```

- [ ] **Step 6: Sidebar button (mirror the joint toggle)**

In `src/ui/sidebar.tsx`: add to the shell's prop interface (near `jointActive`/`onJointToggle`/`jointStatus`, ~line where those are declared):
```ts
  halfLapActive: boolean
  onHalfLapToggle: () => void
  halfLapStatus: string | null
```
Destructure them and render a button immediately after the existing joint-mode button, mirroring its markup exactly but labelled "Half-lap" (and showing `halfLapStatus` where `jointStatus` is shown). Use the same active-state styling keyed on `halfLapActive`.

- [ ] **Step 7: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS. (No new unit tests — wiring is verified by green typecheck + the Tasks 3-4 logic tests. Note in the commit that interactive 3D verification is a human step.)
```bash
git add src/App.tsx src/render/viewport.tsx src/ui/sidebar.tsx
git commit -S -m "feat(ui): wire half-lap add-mode (App/Viewport/Sidebar)

<trailers per Commit conventions>"
```

---

## Task 6: `JointsPanel` half-lap controls

Replace Task 2's `if (j.kind !== 'dado') return null` stub with a real half-lap branch: `Split` + `Clear` inputs, a stale check via `isValidHalfLap`, rendered on both boards.

**Files:**
- Modify: `src/ui/JointsPanel.tsx`
- Test: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/ui/sidebar.test.tsx`, add a describe (mirror the `Sidebar joints panel — rabbeted` block). The half-lap fixture needs two coplanar overlapping boards:
```ts
describe('Sidebar joints panel — half-lap', () => {
  afterEach(() => cleanup())

  const lapScene = () => ({
    parts: [
      makeBoard(),
      makeBoard({ id: 'board_t2', label: 'Board 2', length: 40, width: 200, position: { x: 40, y: -80, z: 0 } }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'halflap' as const,
        id: 'jl',
        label: 'Half-lap 1',
        partAId: 'board_t1',
        partBId: 'board_t2',
        split: 0.5,
        clearance: 0,
      },
    ],
  })

  it('shows Split / Clear inputs for a board in a half-lap', () => {
    render(<Sidebar {...props({ scene: lapScene(), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Split')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('shows the half-lap controls on the OTHER board too (symmetric)', () => {
    render(<Sidebar {...props({ scene: lapScene(), selectedId: 'board_t2' })} />)
    expect(screen.getByText('Split')).toBeTruthy()
  })
})
```
(Check `makeBoard`'s default dims/id in this file — it returns id `board_t1`; ensure `makeBoard()` default is coplanar with board_t2. If `makeBoard`'s default thickness ≠ 20, set both boards' thickness equal in the fixture so `isValidHalfLap` passes — but the panel renders controls regardless of stale state, so exact validity is not required for these render tests.)
Run `pnpm vitest run src/ui/sidebar.test.tsx -t "half-lap"` → FAIL.

- [ ] **Step 2: Implement the half-lap branch**

In `src/ui/JointsPanel.tsx`, add import: `import { isValidHalfLap } from '../geom/halflap'`. Replace the Task 2 stub `if (j.kind !== 'dado') return null` with a kind split. Extract the existing dado body into the `j.kind === 'dado'` case, and add the half-lap case. Concretely, restructure the map callback:

```tsx
      {joints.map((j: Joint) => {
        if (j.kind === 'halflap') {
          const a = scene.parts.find((p) => p.id === j.partAId)
          const b = scene.parts.find((p) => p.id === j.partBId)
          const stale =
            a?.kind === 'board' && b?.kind === 'board' ? !isValidHalfLap(a, b) : true
          const other = j.partAId === part.id ? j.partBId : j.partAId
          return (
            <div key={j.id} className="border-t border-border/30 pt-1 pb-1">
              <div className="flex items-center gap-1 py-0.5">
                <span className="flex-1 text-[11px] text-foreground">{j.label}</span>
                <span className="text-[10px] text-muted-foreground">half-lap</span>
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
              <p className="text-[10px] text-muted-foreground pb-0.5">↔ {partLabel(scene, other)}</p>
              {stale && (
                <p className="text-[10px] text-destructive-foreground pb-1">
                  Joint stale — boards must be coplanar, equal-thickness, and overlapping
                </p>
              )}
              <JointNumInput
                label="Split"
                value={j.split}
                suffix=""
                onCommit={(v) =>
                  onUpdateJoint(j.id, (jt) => ({ ...jt, split: Math.min(Math.max(0.05, v), 0.95) }))
                }
              />
              <JointNumInput
                label="Clear"
                value={j.clearance}
                suffix="mm"
                onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, clearance: Math.max(0, v) }))}
              />
            </div>
          )
        }
        // dado branch (unchanged from before):
        const isHousing = j.housingPartId === part.id
        // ...the entire existing dado rendering body...
      })}
```
Keep the existing dado body verbatim after the half-lap `if` block (it already relied on `j` being a dado; the `if (j.kind === 'halflap') return ...` above narrows `j` to `DadoJoint` for the remainder, so no other change is needed — remove the Task 2 `if (j.kind !== 'dado') return null` line).

- [ ] **Step 3: Run + commit**

Run: `pnpm vitest run src/ui/sidebar.test.tsx` then `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/ui/JointsPanel.tsx src/ui/sidebar.test.tsx
git commit -S -m "feat(ui): half-lap Split/Clear controls in JointsPanel

<trailers per Commit conventions>"
```

---

## Task 7: Documentation & final verification

**Files:**
- Create: `docs/superpowers/notes/2026-07-21-half-lap-joint-notes.md`
- Modify: `README.md`, `project-structure.html`

- [ ] **Step 1: Write the implementation notes**

Create `docs/superpowers/notes/2026-07-21-half-lap-joint-notes.md`:
```markdown
# Half-Lap Joint (JP4) — Implementation Notes

**Date:** 2026-07-21

- First joint TYPE beyond the dado family. `Joint = DadoJoint | HalfLapJoint`; `deriveJoint` is now a
  `switch (joint.kind)` dispatcher (`deriveDadoJoint` + `deriveHalfLap`).
- `DeriveResult.seat` is now optional — a half-lap repositions nothing. `reconcileJoints` guards the
  seat application. This was the one necessary change to the otherwise-untouched reconciler.
- Geometry (`halflap.ts`) is self-contained and THREE-free: `worldAabb` (8 transformed corners),
  `stackAxis` (3rd matrix column), AABB-overlap, and `worldBoxToLocalCut` via the new rigid inverse
  `applyInverseToPoint` in `transform.ts` (Rᵀ·(p−t); valid because scale is 1).
- Validity = same stack axis + coincident thickness ranges (⟺ coplanar AND equal thickness) +
  overlapping footprint. Else stale (preserve last-good), like the dado.
- A keeps the low half, B the high half; `split` (clamped 0.05–0.95) sets the shared plane; `clearance`
  deepens each notch (mid-plane allowance, default 0). Both cuts are ordinary `BoxCut`s — no
  OCCT/mesh/export/drawing change.
- `onUpdateJoint` widened to `(j: Joint) => Joint`: its call sites only spread-and-write, so no dado
  call site changed. `jointInvolves` (kind-aware) replaced the housing/housed membership checks in
  `useScene` and `JointsPanel`.
- New two-click `useAddHalfLap` gesture + a 4th exclusive viewport mode (shortcut `l`), mirroring the
  dado add-mode wiring across `App`/`Viewport`/`Sidebar`.
- Interactive 3D smoke test is a human step (OCCT WASM doesn't boot headless).
```

- [ ] **Step 2: Update `README.md`**

Search `README.md` for the joint feature bullet (the dado line with "Profile: rabbeted … Stop A/B"). Append a sentence introducing the half-lap mode (shortcut `l`; two boards each notched to half thickness at the overlap). Match the existing style. If no such bullet exists, add a short "Half-lap joints" line near the joints content; do not invent an unrelated section.

- [ ] **Step 3: Update `project-structure.html`**

Add `halflap.ts` (half-lap geometry) next to the `dado.ts` entry in the `src/geom/` listing, and `useAddHalfLap.ts` next to `useAddJoint.ts` in `src/scene/`. Match the surrounding markup. If the tree isn't itemized to that depth, add a minimal style-matching mention; otherwise skip and note it in your report.

- [ ] **Step 4: Full verification suite + build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS — typecheck clean, lint clean, all tests green (every dado JP1-JP3 test intact), `tsc + vite build` succeeds.

- [ ] **Step 5: Commit + push**

```bash
git add docs/superpowers/notes/2026-07-21-half-lap-joint-notes.md README.md project-structure.html
git commit -S -m "docs(joints): half-lap notes + README/structure updates

<trailers per Commit conventions>"
git push -u origin claude/next-step-suggestion-i0qjjd
```
(Retry push up to 4× with exponential backoff on network error. No PR.)

---

## Verification checklist (whole feature)

- [ ] `applyInverseToPoint` round-trips `applyMatrixToPoint` for a rotated/translated board.
- [ ] `halflap.ts`: validity (coplanar/equal-thickness/overlap), overlap footprint, complementary halves, `split`, stale → null, rotated-board AABB.
- [ ] `deriveJoint` dispatches dado vs half-lap; half-lap returns no seat.
- [ ] `DeriveResult.seat` optional; `reconcileJoints` guard; dado seat behavior intact.
- [ ] `Joint` union: every consumer compiles; `jointInvolves` replaces membership checks in useScene + panel.
- [ ] `onUpdateJoint` widened with zero dado call-site churn.
- [ ] `onAddHalfLap` (one undo) + `useAddHalfLap` (two-click, different boards).
- [ ] App/Viewport/Sidebar: 4th exclusive mode, shortcut `l`, mutual exclusion, click/hover routing.
- [ ] `JointsPanel`: half-lap Split/Clear on both boards; dado panel unaffected.
- [ ] File format 7; v≤6 files load (dado-only) unchanged.
- [ ] `pnpm typecheck && lint && test && build` all green.
```
