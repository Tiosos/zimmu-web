# Box / Finger Joint (JP6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a box / finger joint — an interlocking right-angle corner where two equal-width boards meet end-to-end, each end cut into a comb of `N` fingers that mesh with the other's gaps, one board auto-seating to assemble the corner.

**Architecture:** New pure `src/geom/fingerjoint.ts` (self-contained, no runtime import from `dado.ts`) computes complementary finger slots on **both** boards (removal by **world** segment parity via a `flip` flag) + a 3-axis flush corner seat. `deriveJoint` gains a `finger` case; a two-click `useAddFingerJoint` gesture + a 6th exclusive viewport mode (`f`) create it; `JointsPanel` gains a `finger` branch. All cuts are ordinary `BoxCut`s — no OCCT/mesh/export change.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + happy-dom, THREE for the seat vector math (as in `mortisetenon.ts`), pnpm.

**Spec:** `docs/superpowers/specs/2026-07-24-box-finger-joint-design.md`

**Commit conventions (every commit):** sign with `-S`; author `Claude <noreply@anthropic.com>` (already configured); end the body with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LZYYj3iGa4yi5RjEfizDJC
```
No model identifier anywhere in commits/code. Branch `claude/next-step-suggestion-i0qjjd`. Run `pnpm typecheck && pnpm lint && pnpm test` before each commit. Local signature verification printing "No signature" / `%G?`=N is a known sandbox false-negative — fine if `git commit -S` exits 0. New commit per task (no `--amend` unless a review asks).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/geom/fingerjoint.ts` | finger-joint geometry | **Create** — validity, finger cuts, corner seat, derive |
| `src/scene/types.ts` | canonical types | `FingerJoint`; extend `Joint` union |
| `src/geom/dado.ts` | dado geom + dispatch | `deriveJoint` `finger` case + import |
| `src/scene/jointInvolves.ts` | joint↔part membership | `finger` arm |
| `src/scene/useFile.ts` | file format | `FILE_FORMAT_VERSION` `8 → 9`; `parseFile` `finger` arm |
| `src/scene/useScene.ts` | scene state | `onAddFingerJoint`; `onRemoveJoint` label arm |
| `src/scene/useAddFingerJoint.ts` | gesture | **Create** — two-click state machine |
| `src/App.tsx` / `src/render/viewport.tsx` / `src/ui/sidebar.tsx` | composition | 6th exclusive mode (`f`) |
| `src/ui/JointsPanel.tsx` | joint editor | `finger` controls branch |

**Unchanged:** `reconcileJoints.ts` (scatters multi-board cuts + applies one seat already), `mortisetenon.ts`/`halflap.ts`/`computeDado*`, `useAddJoint.ts`/`useAddHalfLap.ts`/`useAddMortiseTenon.ts`, `occt.*`, `mesh.ts`, STL/STEP export, `drawing.ts`, `utils.ts` (`shapeKey` unaffected).

**The reference fixture** (used across the geometry tests): board **A** `200 × 80 × 18` at origin, unrotated, `endA = '+X'` (→ `seatAx='x'`, `fingerAxis='y'` width 80, thickness world Z); board **B** `200 × 80 × 18`, rotation `{ x:0, y:90, z:0 }`, `endB = '+X'`. Under `Ry=90`: B's local X → world −Z (length runs along world Z), local Y → world Y (its `fingerAxis` parallel to A's → **non-flip**), local Z → world X (thickness). With `fingerCount=4, clearance=0` (`seg=20`): A removes world-odd segments 1,3; B removes world-even 0,2; each cut is depth = the mating board's thickness (18) along the length, full thickness. The seat lands B at `position = (182, 0, 200)` (hand-verified below, and idempotent).

---

## Task 1: Finger-joint geometry + `FingerJoint` type (standalone)

Define the type and build all geometry against it **before** it enters the `Joint` union (so nothing else breaks yet). `fingerjoint.ts` is self-contained: it must not import any runtime value from `dado.ts`.

**Files:**
- Modify: `src/scene/types.ts` (add `FingerJoint`; **do not** change `Joint` yet)
- Create: `src/geom/fingerjoint.ts`, `src/geom/fingerjoint.test.ts`

- [ ] **Step 1: Add `FingerJoint` to types (not in the union yet)**

In `src/scene/types.ts`, after `MortiseTenonJoint` and **before** `export type Joint = …`:
```ts
export interface FingerJoint {
  kind: 'finger'
  id: string // "joint_<uuid>"
  label: string // "Finger joint 1"
  partAId: PartId // lead board — keeps EVEN world-segments; stays put
  endA: Face // A's joined end (a non-thickness end)
  partBId: PartId // mating board — keeps ODD world-segments; auto-seats into the corner
  endB: Face // B's joined end
  fingerCount: number // N — the shared joint width split into N equal segments
  clearance: number // mm — widens each cut slot for fit (default 0)
}
```
Leave `export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint` unchanged in this task.

- [ ] **Step 2: Write the failing geometry tests**

Create `src/geom/fingerjoint.test.ts`:
```ts
import { test, expect } from 'vitest'
import type { BoardPart, FingerJoint, Part } from '../scene/types'
import {
  isValidFingerJoint,
  computeFingerCuts,
  computeFingerSeat,
  deriveFingerJoint,
} from './fingerjoint'

const A: BoardPart = {
  kind: 'board', id: 'A', label: 'A', length: 200, width: 80, thickness: 18,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const B: BoardPart = {
  kind: 'board', id: 'B', label: 'B', length: 200, width: 80, thickness: 18,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 90, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const parts: Part[] = [A, B]
const joint: FingerJoint = {
  kind: 'finger', id: 'j1', label: 'Finger joint 1',
  partAId: 'A', endA: '+X', partBId: 'B', endB: '+X', fingerCount: 4, clearance: 0,
}

test('isValidFingerJoint: axis-aligned equal-width right-angle corner is valid', () => {
  expect(isValidFingerJoint(A, '+X', B, '+X')).toBe(true)
})
test('isValidFingerJoint: a non-axis-aligned board is invalid', () => {
  expect(isValidFingerJoint(A, '+X', { ...B, rotation: { x: 0, y: 45, z: 0 } }, '+X')).toBe(false)
})
test('isValidFingerJoint: a thickness (z) end is invalid', () => {
  expect(isValidFingerJoint(A, '+X', B, '+Z')).toBe(false)
})
test('isValidFingerJoint: parallel (non-perpendicular) ends are invalid', () => {
  // Flat B, +X end points world +X, same as A's +X → not a 90° corner.
  expect(isValidFingerJoint(A, '+X', { ...B, rotation: { x: 0, y: 0, z: 0 } }, '+X')).toBe(false)
})
test('isValidFingerJoint: unequal joint widths are invalid', () => {
  expect(isValidFingerJoint(A, '+X', { ...B, width: 60 }, '+X')).toBe(false)
})

test('computeFingerCuts: A removes world-odd segments (1,3) full-depth full-thickness', () => {
  const cuts = computeFingerCuts(A, '+X', joint, B.thickness, 1, false)
  expect(cuts).toHaveLength(2)
  const by = (i: number) => cuts.find((c) => c.id === `cut_j1_finger${i}`)!
  expect(by(1).position).toEqual({ x: 182, y: 20, z: 0 })
  expect(by(1).size).toEqual({ x: 18, y: 20, z: 18 })
  expect(by(3).position).toEqual({ x: 182, y: 60, z: 0 })
  expect(by(3).size).toEqual({ x: 18, y: 20, z: 18 })
  expect(by(1).sourceJointId).toBe('j1')
})
test('computeFingerCuts: B removes world-even segments (0,2), depth = A thickness', () => {
  const cuts = computeFingerCuts(B, '+X', joint, A.thickness, 0, false)
  expect(cuts).toHaveLength(2)
  const ids = cuts.map((c) => c.id).sort()
  expect(ids).toEqual(['cut_j1_finger0', 'cut_j1_finger2'])
})
test('computeFingerCuts: flip reverses B parity to stay complementary in world', () => {
  // flip=true, removeParity=0 → remove i where (N-1-i) even → local {1,3}, NOT {0,2}.
  const cuts = computeFingerCuts(B, '+X', joint, A.thickness, 0, true)
  expect(cuts.map((c) => c.id).sort()).toEqual(['cut_j1_finger1', 'cut_j1_finger3'])
})
test('computeFingerCuts: clearance widens interior slot edges', () => {
  const cuts = computeFingerCuts(A, '+X', { ...joint, clearance: 2 }, B.thickness, 1, false)
  const f1 = cuts.find((c) => c.id === 'cut_j1_finger1')!
  // segment 1 = [20,40] widened by 1 each side → [19,41]
  expect(f1.position.y).toBe(19)
  expect(f1.size.y).toBe(22)
})
test('computeFingerCuts: N < 2 yields no cuts (defensive)', () => {
  expect(computeFingerCuts(A, '+X', { ...joint, fingerCount: 1 }, 18, 1, false)).toHaveLength(0)
})

test('computeFingerSeat: seats B into a flush corner at (182,0,200), idempotent', () => {
  const seat = computeFingerSeat(A, B, joint)
  expect(seat.position.x).toBeCloseTo(182, 6)
  expect(seat.position.y).toBeCloseTo(0, 6)
  expect(seat.position.z).toBeCloseTo(200, 6)
  // Idempotent: re-seating from the seated pose does not drift.
  const again = computeFingerSeat(A, { ...B, position: seat.position }, joint)
  expect(again.position.x).toBeCloseTo(182, 6)
  expect(again.position.y).toBeCloseTo(0, 6)
  expect(again.position.z).toBeCloseTo(200, 6)
})

test('deriveFingerJoint: 4 cuts split across both boards + a seat on B', () => {
  const r = deriveFingerJoint(joint, parts)
  expect(r).not.toBeNull()
  expect(r!.seat!.partId).toBe('B')
  expect(r!.cuts).toHaveLength(4)
  expect(r!.cuts.filter((c) => c.partId === 'A')).toHaveLength(2)
  expect(r!.cuts.filter((c) => c.partId === 'B')).toHaveLength(2)
})
test('deriveFingerJoint: A and B cover complementary world-Y bands (interlock)', () => {
  // A keeps even world-segments; B keeps odd. Removed slots on A vs B must be disjoint
  // in world space and jointly cover the full width. Since this fixture is non-flip and
  // both fingerAxes are local y, world-Y intervals equal local-Y intervals.
  const r = deriveFingerJoint(joint, parts)!
  const aSlots = r.cuts.filter((c) => c.partId === 'A').map((c) => c.cut.position.y).sort()
  const bSlots = r.cuts.filter((c) => c.partId === 'B').map((c) => c.cut.position.y).sort()
  expect(aSlots).toEqual([20, 60]) // A removes segments 1,3
  expect(bSlots).toEqual([0, 40]) // B removes segments 0,2 → complementary
})
test('deriveFingerJoint: unequal thickness → asymmetric slot depths', () => {
  const a2: BoardPart = { ...A, thickness: 12 }
  const b2: BoardPart = { ...B, thickness: 24 }
  const r = deriveFingerJoint(joint, [a2, b2])!
  const aCut = r.cuts.find((c) => c.partId === 'A')!.cut
  const bCut = r.cuts.find((c) => c.partId === 'B')!.cut
  expect(aCut.size.x).toBe(24) // A slot depth = B thickness
  expect(bCut.size.x).toBe(12) // B slot depth = A thickness
})
test('deriveFingerJoint: stale (non-axis-aligned) returns null', () => {
  expect(deriveFingerJoint(joint, [A, { ...B, rotation: { x: 0, y: 45, z: 0 } }])).toBeNull()
})
```
Run `pnpm vitest run src/geom/fingerjoint.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/geom/fingerjoint.ts`**

```ts
import * as THREE from 'three'
import type { BoardPart, BoxCut, CutId, Face, Part, Vec3 } from '../scene/types'
import type { FingerJoint } from '../scene/types'
import type { DeriveResult, DerivedCut } from './dado'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'

const DEG2RAD = Math.PI / 180
type Axis = 'x' | 'y' | 'z'
const EPS = 1e-4
const WIDTH_EPS = 0.01

const FACE_NORMALS: Record<Face, Vec3> = {
  '+X': { x: 1, y: 0, z: 0 }, '-X': { x: -1, y: 0, z: 0 },
  '+Y': { x: 0, y: 1, z: 0 }, '-Y': { x: 0, y: -1, z: 0 },
  '+Z': { x: 0, y: 0, z: 1 }, '-Z': { x: 0, y: 0, z: -1 },
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
      part.rotation.x * DEG2RAD, part.rotation.y * DEG2RAD, part.rotation.z * DEG2RAD, part.rotationOrder,
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
// The non-thickness in-plane axis of an end face — the finger (shared-edge) direction.
function fingerAxisOf(end: Face): Axis {
  return faceAxes(end).depth === 'x' ? 'y' : 'x'
}
function worldPoint(m: Float64Array, p: Vec3): THREE.Vector3 {
  const [x, y, z] = applyMatrixToPoint(m, p.x, p.y, p.z)
  return new THREE.Vector3(x, y, z)
}

export function isValidFingerJoint(a: BoardPart, endA: Face, b: BoardPart, endB: Face): boolean {
  if (!isAxisAligned(a) || !isAxisAligned(b)) return false
  if (faceAxes(endA).depth === 'z' || faceAxes(endB).depth === 'z') return false
  const nA = localDirToWorld(a, FACE_NORMALS[endA])
  const nB = localDirToWorld(b, FACE_NORMALS[endB])
  if (Math.abs(nA.dot(nB)) > EPS) return false // ends must be perpendicular (90° corner)
  const fA = localDirToWorld(a, unitVec(fingerAxisOf(endA)))
  const fB = localDirToWorld(b, unitVec(fingerAxisOf(endB)))
  if (Math.abs(fA.dot(fB)) < 1 - EPS) return false // finger axes must be parallel (shared edge)
  return Math.abs(boardDims(a)[fingerAxisOf(endA)] - boardDims(b)[fingerAxisOf(endB)]) < WIDTH_EPS
}

export function computeFingerCuts(
  board: BoardPart, end: Face, joint: FingerJoint,
  matingThickness: number, removeParity: 0 | 1, flip: boolean,
): BoxCut[] {
  const N = joint.fingerCount
  if (N < 2) return []
  const dim = boardDims(board)
  const seatAx = faceAxes(end).depth
  const fingerAx = fingerAxisOf(end)
  const W = dim[fingerAx]
  const seg = W / N
  const depth = clamp(matingThickness, 0.1, dim[seatAx])
  const s0 = end.startsWith('+') ? dim[seatAx] - depth : 0
  const half = joint.clearance / 2

  const cuts: BoxCut[] = []
  for (let i = 0; i < N; i++) {
    const worldIndex = flip ? N - 1 - i : i
    if (worldIndex % 2 !== removeParity) continue
    const lo = clamp(i * seg - half, 0, W)
    const hi = clamp((i + 1) * seg + half, 0, W)
    const position: Vec3 = { x: 0, y: 0, z: 0 }
    const size: Vec3 = { x: 0, y: 0, z: 0 }
    position[seatAx] = s0
    size[seatAx] = depth
    position[fingerAx] = lo
    size[fingerAx] = hi - lo
    position.z = 0
    size.z = dim.z
    cuts.push({
      kind: 'box',
      id: `cut_${joint.id}_finger${i}` as CutId,
      label: `${joint.label} finger`,
      face: end,
      position,
      size,
      sourceJointId: joint.id,
    })
  }
  return cuts
}

// Seats B so its end-region interpenetrates A's to a flush right-angle corner. Three world-plane
// alignments in A's orthonormal frame; the corner side (which of A's thickness faces) is picked
// nearest B's current end, so the move is minimal and idempotent once seated.
export function computeFingerSeat(a: BoardPart, b: BoardPart, joint: FingerJoint): { position: Vec3 } {
  const mA = composeWorldMatrix(a)
  const mB = composeWorldMatrix(b)
  const Tb = b.thickness

  const nA = localDirToWorld(a, FACE_NORMALS[joint.endA]) // A's end normal
  const fA = localDirToWorld(a, unitVec(fingerAxisOf(joint.endA))) // A's width
  const tA = localDirToWorld(a, unitVec('z')) // A's thickness normal

  const aEndCenter = worldPoint(mA, computeLocalFaceCenter(FACE_NORMALS[joint.endA], a))
  const aCenter = worldPoint(mA, { x: a.length / 2, y: a.width / 2, z: a.thickness / 2 })
  const aFaceLo = worldPoint(mA, computeLocalFaceCenter(FACE_NORMALS['-Z'], a))
  const aFaceHi = worldPoint(mA, computeLocalFaceCenter(FACE_NORMALS['+Z'], a))
  const endWorldB = worldPoint(mB, computeLocalFaceCenter(FACE_NORMALS[joint.endB], b))

  const desiredNA = aEndCenter.dot(nA) - Tb / 2 // B's end-center sits half a thickness inside A's end plane
  const desiredFA = aCenter.dot(fA) // width-center aligned
  const curT = endWorldB.dot(tA)
  const loT = aFaceLo.dot(tA)
  const hiT = aFaceHi.dot(tA)
  const desiredTA = Math.abs(curT - loT) <= Math.abs(curT - hiT) ? loT : hiT // nearest outer face

  const desired = endWorldB.clone()
  desired.addScaledVector(nA, desiredNA - endWorldB.dot(nA))
  desired.addScaledVector(fA, desiredFA - endWorldB.dot(fA))
  desired.addScaledVector(tA, desiredTA - endWorldB.dot(tA))

  return {
    position: {
      x: b.position.x + (desired.x - endWorldB.x),
      y: b.position.y + (desired.y - endWorldB.y),
      z: b.position.z + (desired.z - endWorldB.z),
    },
  }
}

export function deriveFingerJoint(joint: FingerJoint, parts: Part[]): DeriveResult | null {
  const a = parts.find((p) => p.id === joint.partAId)
  const b = parts.find((p) => p.id === joint.partBId)
  if (a?.kind !== 'board' || b?.kind !== 'board') return null
  if (!isValidFingerJoint(a, joint.endA, b, joint.endB)) return null
  const fA = localDirToWorld(a, unitVec(fingerAxisOf(joint.endA)))
  const fB = localDirToWorld(b, unitVec(fingerAxisOf(joint.endB)))
  const flip = fA.dot(fB) < 0
  const cuts: DerivedCut[] = [
    ...computeFingerCuts(a, joint.endA, joint, b.thickness, 1, false).map((cut) => ({ partId: a.id, cut })),
    ...computeFingerCuts(b, joint.endB, joint, a.thickness, 0, flip).map((cut) => ({ partId: b.id, cut })),
  ]
  const seat = { partId: b.id, position: computeFingerSeat(a, b, joint).position }
  return { cuts, seat }
}
```
Run `pnpm vitest run src/geom/fingerjoint.test.ts` → PASS (all).

- [ ] **Step 4: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS (finger geom tested; nothing else references it yet).
```bash
git add src/scene/types.ts src/geom/fingerjoint.ts src/geom/fingerjoint.test.ts
git commit -S -m "feat(geom): box & finger joint geometry + FingerJoint type

<trailers per Commit conventions>"
```

---

## Task 2: Union flip — dispatch, `jointInvolves`, `parseFile`, panel stub

Add `FingerJoint` to the union and fix every consumer so typecheck stays green. `onUpdateJoint` is already `(j: Joint) => Joint`, so no signature change.

**Files:**
- Modify: `src/scene/types.ts` (union)
- Modify: `src/geom/dado.ts` (`deriveJoint` case + import)
- Modify: `src/scene/jointInvolves.ts` (arm)
- Modify: `src/scene/useFile.ts` (version + `parseFile` arm)
- Modify: `src/ui/JointsPanel.tsx` (stub)
- Test: `src/geom/dado.test.ts` (dispatch test)

- [ ] **Step 1: Flip the union**

`src/scene/types.ts` — change to:
```ts
export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint
```
Run `pnpm typecheck` → FAIL in `dado.ts` (deriveJoint switch not exhaustive) and `JointsPanel.tsx` (narrowing). Expected.

- [ ] **Step 2: `deriveJoint` case**

In `src/geom/dado.ts`, add the import near the top (next to the `deriveMortiseTenon` import):
```ts
import { deriveFingerJoint } from './fingerjoint'
```
In the `deriveJoint` dispatcher, add a case:
```ts
    case 'finger':
      return deriveFingerJoint(joint, parts)
```
(`fingerjoint.ts` type-imports `DeriveResult`/`DerivedCut` from `dado.ts`; `dado.ts` imports the `deriveFingerJoint` value — one-directional, no runtime cycle.)

- [ ] **Step 3: `jointInvolves` arm**

`src/scene/jointInvolves.ts` — extend to handle all four kinds:
```ts
import type { Joint, PartId } from './types'

export function jointInvolves(joint: Joint, partId: PartId): boolean {
  if (joint.kind === 'dado') return joint.housingPartId === partId || joint.housedPartId === partId
  if (joint.kind === 'halflap') return joint.partAId === partId || joint.partBId === partId
  if (joint.kind === 'mortise-tenon') return joint.mortisePartId === partId || joint.tenonPartId === partId
  return joint.partAId === partId || joint.partBId === partId
}
```

- [ ] **Step 4: `parseFile` arm + version bump**

In `src/scene/useFile.ts`: `export const FILE_FORMAT_VERSION = 9`. Add a `v8→v9: finger joints` note beside the existing version comments. In the joint-defaulting `.map`, add a `finger` arm to the kind ternary (before the `mortise-tenon` arm):
```ts
      joints: ((raw.scene.joints ?? []) as unknown as Array<Record<string, unknown>>).map((j) =>
        j.kind === 'finger'
          ? ({ fingerCount: 0, clearance: 0, ...j } as unknown as Joint)
          : j.kind === 'mortise-tenon'
            ? ({ tenonLength: 0, tenonThickness: 0, tenonWidth: 0, clearance: 0, through: false, offsetU: 0, offsetV: 0, ...j } as unknown as Joint)
            : j.kind === 'halflap'
              ? ({ split: 0.5, clearance: 0, ...j } as unknown as Joint)
              : ({ kind: 'dado' as const, profile: 'plain' as const, tongueThickness: 6, rabbetFace: '+Z' as const, stopStart: 0, stopEnd: 0, ...j } as unknown as Joint),
      ),
```
(The finger defaults are inert backfill — real v9 finger joints carry every field via `...j`.)

- [ ] **Step 5: JointsPanel stub**

In `src/ui/JointsPanel.tsx`, the map callback has `if (j.kind === 'mortise-tenon') { … }` then the dado body. Add, immediately after the mortise-tenon branch's closing `}` and before the dado code:
```tsx
        if (j.kind === 'finger') return null
```
(Renders nothing yet — Task 6 fills it in. The guard narrows `j` for the dado body.)

- [ ] **Step 6: Dispatch test**

In `src/geom/dado.test.ts`, add near the other `deriveJoint` dispatch tests:
```ts
test('deriveJoint dispatches a finger joint to the finger deriver', () => {
  const a: BoardPart = { ...housing, id: 'FA', length: 200, width: 80, thickness: 18, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
  const b: BoardPart = { ...housing, id: 'FB', length: 200, width: 80, thickness: 18, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 } }
  const fj = { kind: 'finger' as const, id: 'jf', label: 'Finger joint 1', partAId: 'FA', endA: '+X' as const, partBId: 'FB', endB: '+X' as const, fingerCount: 4, clearance: 0 }
  const r = deriveJoint(fj, [a, b])
  expect(r).not.toBeNull()
  expect(r!.seat!.partId).toBe('FB')
  expect(r!.cuts).toHaveLength(4)
})
```
(`housing`, `BoardPart`, `deriveJoint` are already available in that file.)

- [ ] **Step 7: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/scene/types.ts src/geom/dado.ts src/geom/dado.test.ts src/scene/jointInvolves.ts src/scene/useFile.ts src/ui/JointsPanel.tsx
git commit -S -m "feat(joints): dispatch finger joint; Joint union += FingerJoint

<trailers per Commit conventions>"
```

---

## Task 3: `onAddFingerJoint` + kind-aware remove label

**Files:**
- Modify: `src/scene/useScene.ts`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scene/useScene.test.ts`, in the `useScene — joints` describe, after the existing tests:
```ts
  it('onAddFingerJoint creates a finger joint + cuts on both boards + seat in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [Ab, Bb] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(Ab.id, (p) => ({ ...p, length: 200, width: 80, thickness: 18, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }), 'a')
      result.current.onUpdate(Bb.id, (p) => ({ ...p, length: 200, width: 80, thickness: 18, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 } }), 'b')
    })
    await act(async () => {
      result.current.onAddFingerJoint(hit(Ab.id, { x: 1, y: 0, z: 0 }), hit(Bb.id, { x: 1, y: 0, z: 0 }))
    })
    expect(result.current.scene.joints).toHaveLength(1)
    expect(result.current.scene.joints[0].kind).toBe('finger')
    const jointCuts = () =>
      result.current.scene.parts
        .filter((p) => p.kind === 'board')
        .reduce((n, p) => n + (p.kind === 'board' ? p.cuts.filter((c) => c.kind === 'box' && c.sourceJointId).length : 0), 0)
    expect(jointCuts()).toBeGreaterThanOrEqual(2) // fingers on both boards

    await act(async () => result.current.undo())
    expect(result.current.scene.joints).toHaveLength(0)
    expect(jointCuts()).toBe(0)
  })
```
(`hit` and the `useScene — joints` helpers already exist in this file.) Run `pnpm vitest run src/scene/useScene.test.ts -t "onAddFingerJoint"` → FAIL (not a function).

- [ ] **Step 2: Add to the result type + imports**

In `src/scene/useScene.ts`: add `import { isValidFingerJoint } from '../geom/fingerjoint'`. Also ensure `faceAxes` is imported from `./snapMath` — `localNormalToFaceString` is already imported from there, so widen that import to `import { faceAxes, localNormalToFaceString } from './snapMath'` (adjust to whatever else it already pulls in; do not duplicate). In `UseSceneResult`, after `onAddMortiseTenon`:
```ts
  onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void
```

- [ ] **Step 3: Implement `onAddFingerJoint` + label arm**

After the `onAddMortiseTenon` `useCallback`, add:
```ts
  const onAddFingerJoint = useCallback(
    (hitA: FaceHit, hitB: FaceHit) => {
      const s = sceneRef.current
      const a = s.parts.find((p) => p.id === hitA.partId)
      const b = s.parts.find((p) => p.id === hitB.partId)
      if (a?.kind !== 'board' || b?.kind !== 'board' || a.id === b.id) return
      const endA = localNormalToFaceString(hitA.localFaceNormal)
      const endB = localNormalToFaceString(hitB.localFaceNormal)
      if (!isValidFingerJoint(a, endA, b, endB)) return
      const n = s.joints.filter((j) => j.kind === 'finger').length + 1
      const widthA = faceAxes(endA).depth === 'x' ? a.width : a.length
      const fingerCount = Math.min(15, Math.max(3, Math.round(widthA / (2 * a.thickness))))
      const joint: Joint = {
        kind: 'finger',
        id: `joint_${crypto.randomUUID()}`,
        label: `Finger joint ${n}`,
        partAId: a.id,
        endA,
        partBId: b.id,
        endB,
        fingerCount,
        clearance: 0,
      }
      commitReconciled((prev) => ({ ...prev, joints: [...prev.joints, joint] }), 'Add finger joint')
      setSelectedId(a.id)
    },
    [commitReconciled],
  )
```
Ensure `faceAxes` is imported in `useScene.ts` (it is used above; if not already imported, add `import { faceAxes } from './snapMath'` — check first, `snapMath` helpers are already imported there). Add `onAddFingerJoint` to the returned object (near `onAddMortiseTenon`). Extend `onRemoveJoint`'s kind-aware label (currently `joint.kind === 'mortise-tenon' ? 'Remove mortise & tenon' : joint.kind === 'halflap' ? 'Remove half-lap' : 'Remove dado'`) to:
```ts
      const label =
        joint.kind === 'finger'
          ? 'Remove finger joint'
          : joint.kind === 'mortise-tenon'
            ? 'Remove mortise & tenon'
            : joint.kind === 'halflap'
              ? 'Remove half-lap'
              : 'Remove dado'
```

- [ ] **Step 4: Run + commit**

Run: `pnpm vitest run src/scene/useScene.test.ts` then `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -S -m "feat(scene): onAddFingerJoint + kind-aware remove label

<trailers per Commit conventions>"
```

---

## Task 4: `useAddFingerJoint` two-click gesture

Mirror `useAddMortiseTenon` (which validates a seat then calls the scene method). The create gate uses `isValidFingerJoint` — the same check `deriveFingerJoint` uses — so no dead joints (the JP5 holistic-review lesson).

**Files:**
- Create: `src/scene/useAddFingerJoint.ts`, `src/scene/useAddFingerJoint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/useAddFingerJoint.test.ts`:
```ts
import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useAddFingerJoint } from './useAddFingerJoint'

const a: Part = {
  kind: 'board', id: 'A', label: 'A', length: 200, width: 80, thickness: 18,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const b: Part = { ...a, id: 'B', rotation: { x: 0, y: 90, z: 0 } }
const hit = (partId: string, n: { x: number; y: number; z: number }): FaceHit => ({
  partId, faceNormal: n, faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: n, localHitPoint: { x: 0, y: 0, z: 0 }, hitPoint: { x: 0, y: 0, z: 0 },
})

test('two perpendicular equal-width ends create a finger joint', () => {
  const onAddFingerJoint = vi.fn()
  const { result } = renderHook(() => useAddFingerJoint({ parts: [a, b], onAddFingerJoint }))
  act(() => result.current.activateFingerJoint())
  act(() => result.current.onFaceClick(hit('A', { x: 1, y: 0, z: 0 })))
  expect(onAddFingerJoint).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('B', { x: 1, y: 0, z: 0 })))
  expect(onAddFingerJoint).toHaveBeenCalledTimes(1)
})

test('a second click on the same board does not create a joint', () => {
  const onAddFingerJoint = vi.fn()
  const { result } = renderHook(() => useAddFingerJoint({ parts: [a, b], onAddFingerJoint }))
  act(() => result.current.activateFingerJoint())
  act(() => result.current.onFaceClick(hit('A', { x: 1, y: 0, z: 0 })))
  act(() => result.current.onFaceClick(hit('A', { x: 1, y: 0, z: 0 })))
  expect(onAddFingerJoint).not.toHaveBeenCalled()
  expect(result.current.pendingA).toBeNull()
  expect(result.current.statusMessage).toMatch(/different board/i)
})

test('a non-corner second hit (parallel ends) does not create a joint', () => {
  const onAddFingerJoint = vi.fn()
  const flat: Part = { ...b, rotation: { x: 0, y: 0, z: 0 } } // +X end now world +X, not a corner
  const { result } = renderHook(() => useAddFingerJoint({ parts: [a, flat], onAddFingerJoint }))
  act(() => result.current.activateFingerJoint())
  act(() => result.current.onFaceClick(hit('A', { x: 1, y: 0, z: 0 })))
  act(() => result.current.onFaceClick(hit('B', { x: 1, y: 0, z: 0 })))
  expect(onAddFingerJoint).not.toHaveBeenCalled()
  expect(result.current.statusMessage).toMatch(/corner/i)
})
```
Run `pnpm vitest run src/scene/useAddFingerJoint.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `useAddFingerJoint`**

Create `src/scene/useAddFingerJoint.ts`:
```ts
import { useState, useCallback } from 'react'
import type { FaceHit, Part } from './types'
import { isValidFingerJoint } from '../geom/fingerjoint'
import { localNormalToFaceString } from './snapMath'

export interface AddFingerJointState {
  fingerJointActive: boolean
  pendingA: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateFingerJoint: () => void
  cancelFingerJoint: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddFingerJoint(params: {
  parts: Part[]
  onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void
}): AddFingerJointState {
  const { parts, onAddFingerJoint } = params
  const [fingerJointActive, setActive] = useState(false)
  const [pendingA, setPending] = useState<FaceHit | null>(null)
  const [statusMessage, setStatus] = useState<string | null>(null)
  const [hoveredFace, setHovered] = useState<FaceHit | null>(null)

  const activateFingerJoint = useCallback(() => {
    setActive((v) => !v)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])
  const cancelFingerJoint = useCallback(() => {
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
        setStatus('Pick a different board for the second end')
        setPending(null)
        return
      }
      const a = parts.find((p) => p.id === pendingA.partId)
      if (a?.kind !== 'board') {
        setPending(null)
        return
      }
      const endA = localNormalToFaceString(pendingA.localFaceNormal)
      const endB = localNormalToFaceString(hit.localFaceNormal)
      if (!isValidFingerJoint(a, endA, part, endB)) {
        setStatus('Both ends must form a right-angle corner of equal width')
        setPending(null)
        return
      }
      onAddFingerJoint(pendingA, hit)
      setPending(null)
      setActive(false)
      setHovered(null)
    },
    [parts, pendingA, onAddFingerJoint],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHovered(fingerJointActive ? hit : null)
    },
    [fingerJointActive],
  )

  return {
    fingerJointActive,
    pendingA,
    statusMessage,
    hoveredFace,
    activateFingerJoint,
    cancelFingerJoint,
    onFaceClick,
    onFaceHover,
  }
}
```
Run the test → PASS.

- [ ] **Step 3: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/scene/useAddFingerJoint.ts src/scene/useAddFingerJoint.test.ts
git commit -S -m "feat(scene): useAddFingerJoint two-click gesture

<trailers per Commit conventions>"
```

---

## Task 5: App + Viewport + Sidebar — the 6th exclusive mode

Wire the gesture as a 6th mutually-exclusive mode (shortcut `f`), mirroring the mortise-tenon (`m`) mode wiring exactly. **Integration task — no new unit tests**; verification is typecheck + lint + the full suite staying green. Before editing, read the existing `mortiseTenon`-mode wiring in each file and mirror it.

**Files:**
- Modify: `src/App.tsx`, `src/render/viewport.tsx`, `src/ui/sidebar.tsx` (+ `src/ui/sidebar.test.tsx` `props()` factory)

- [ ] **Step 1: Compose the hook in `App.tsx`**

Import `useAddFingerJoint` from `./scene/useAddFingerJoint`; destructure `onAddFingerJoint` from `useScene()` (next to `onAddMortiseTenon`). After the `useAddMortiseTenon({...})` destructure:
```ts
  const {
    fingerJointActive,
    pendingA: fingerJointPendingFace,
    statusMessage: fingerJointStatus,
    hoveredFace: fingerJointHoveredFace,
    activateFingerJoint,
    cancelFingerJoint,
    onFaceClick: onFaceClickFingerJoint,
    onFaceHover: onFaceHoverFingerJoint,
  } = useAddFingerJoint({ parts: scene.parts, onAddFingerJoint })
```

- [ ] **Step 2: Mutual exclusion**

Add `cancelFingerJoint()` to each existing `handleActivateCut`/`handleActivateSnap`/`handleActivateJoint`/`handleActivateHalfLap`/`handleActivateMortiseTenon` (and their dep arrays), and add:
```ts
  const handleActivateFingerJoint = useCallback(() => {
    cancelCut()
    cancelSnap()
    cancelJoint()
    cancelHalfLap()
    cancelMortiseTenon()
    activateFingerJoint()
  }, [cancelCut, cancelSnap, cancelJoint, cancelHalfLap, cancelMortiseTenon, activateFingerJoint])
```

- [ ] **Step 3: Keyboard + guards**

In the non-modifier keydown block, after the `m` case, add:
```ts
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault()
          handleActivateFingerJoint()
          return
        }
```
Extend the `Escape` handler with `if (fingerJointActive) cancelFingerJoint()`; extend the `h` and `Delete/Backspace` guards' condition with `&& !fingerJointActive`; add `handleActivateFingerJoint`, `cancelFingerJoint`, `fingerJointActive` to the keydown effect deps.

- [ ] **Step 4: Viewport props + routing**

In `src/render/viewport.tsx`, mirror the mortise-tenon props exactly for finger joint:
- Props interface: add `fingerJointActive: boolean; onFaceClickFingerJoint: (hit: FaceHit) => void; onFaceHoverFingerJoint: (hit: FaceHit | null) => void; fingerJointPendingFace: FaceHit | null; fingerJointHoveredFace: FaceHit | null`.
- Destructure them; add refs `fingerJointActiveRef`, `onFaceClickFingerJointRef`, `onFaceHoverFingerJointRef`; sync them in the ref-sync effect.
- Click dispatch: add `if (fingerJointActiveRef.current) { if (hits.length > 0) { const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current); if (faceHit) onFaceClickFingerJointRef.current(faceHit) } } else if (mortiseTenonActiveRef.current) {` — i.e. finger becomes the first branch.
- Hover guard: extend the early-return `if (!snapActiveRef.current && … && !mortiseTenonActiveRef.current) return` with `&& !fingerJointActiveRef.current`.
- Hover dispatch (hit + null branches): add `fingerJointActiveRef.current` as the first branch → `onFaceHoverFingerJointRef.current`.
- Highlight effect: source highlight uses `fingerJointActive ? fingerJointPendingFace :` as the leading condition; hover highlight uses `fingerJointActive ? fingerJointHoveredFace :` leading; add the three new values to that effect's deps.
- Cursor effect: add `|| fingerJointActive` to the condition + deps.

- [ ] **Step 5: Pass Viewport + Sidebar props in `App.tsx`**

`<Viewport>` (after the mortise-tenon props): `fingerJointActive`, `onFaceClickFingerJoint`, `onFaceHoverFingerJoint`, `fingerJointPendingFace`, `fingerJointHoveredFace`. `<Sidebar>` (after the mortise-tenon props): `fingerJointActive`, `onFingerJointToggle={handleActivateFingerJoint}`, `fingerJointStatus`.

- [ ] **Step 6: Sidebar button**

In `src/ui/sidebar.tsx`: add `fingerJointActive: boolean; onFingerJointToggle: () => void; fingerJointStatus: string | null` to the shell prop interface (next to the mortise-tenon trio); destructure them; render a "Finger joint" toggle button immediately after the mortise-tenon button, mirroring its exact markup (active styling keyed on `fingerJointActive`, `onClick={onFingerJointToggle}`, showing `fingerJointStatus`). Update the shared `props()` factory in `src/ui/sidebar.test.tsx` to include the three new props (`fingerJointActive: false, onFingerJointToggle: vi.fn(), fingerJointStatus: null`).

- [ ] **Step 7: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS (fix any other test mock the new required props break, minimally). Interactive 3D verification is a human step.
```bash
git add src/App.tsx src/render/viewport.tsx src/ui/sidebar.tsx src/ui/sidebar.test.tsx
git commit -S -m "feat(ui): wire finger-joint add-mode (App/Viewport/Sidebar)

<trailers per Commit conventions>"
```

---

## Task 6: `JointsPanel` finger-joint controls

Replace the Task 2 `if (j.kind === 'finger') return null` stub with a real branch.

**Files:**
- Modify: `src/ui/JointsPanel.tsx`
- Test: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/ui/sidebar.test.tsx`, add a describe (mirror the mortise-tenon block). Fixture: two equal-width boards forming a corner:
```ts
describe('Sidebar joints panel — finger joint', () => {
  afterEach(() => cleanup())

  const fjScene = () => ({
    parts: [
      makeBoard({ length: 200, width: 80, thickness: 18 }),
      makeBoard({ id: 'board_t2', label: 'Board 2', length: 200, width: 80, thickness: 18, rotation: { x: 0, y: 90, z: 0 } }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'finger' as const,
        id: 'jf',
        label: 'Finger joint 1',
        partAId: 'board_t1',
        endA: '+X' as const,
        partBId: 'board_t2',
        endB: '+X' as const,
        fingerCount: 5,
        clearance: 0,
      },
    ],
  })

  it('shows Fingers / Clear controls for the lead board', () => {
    render(<Sidebar {...props({ scene: fjScene(), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Fingers')).toBeTruthy()
    expect(screen.getByText('Clear')).toBeTruthy()
  })

  it('shows the read-only hint on the mating board', () => {
    render(<Sidebar {...props({ scene: fjScene(), selectedId: 'board_t2' })} />)
    expect(screen.getByText(/Edit from/)).toBeTruthy()
  })
})
```
(Confirm `makeBoard()`'s default id is `board_t1`, matching `partAId`; if it differs, adjust the fixture ids — do NOT change `makeBoard`.) Run `pnpm vitest run src/ui/sidebar.test.tsx -t "finger"` → FAIL.

- [ ] **Step 2: Implement the branch**

In `src/ui/JointsPanel.tsx`, add `import { isValidFingerJoint } from '../geom/fingerjoint'`. Replace the stub `if (j.kind === 'finger') return null` with:
```tsx
        if (j.kind === 'finger') {
          const isLead = j.partAId === part.id
          const a = scene.parts.find((p) => p.id === j.partAId)
          const b = scene.parts.find((p) => p.id === j.partBId)
          const stale =
            a?.kind === 'board' && b?.kind === 'board'
              ? !isValidFingerJoint(a, j.endA, b, j.endB)
              : true
          return (
            <div key={j.id} className="border-t border-border/30 pt-1 pb-1">
              <div className="flex items-center gap-1 py-0.5">
                <span className="flex-1 text-[11px] text-foreground">{j.label}</span>
                <span className="text-[10px] text-muted-foreground">{isLead ? 'A' : 'B'}</span>
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
                {isLead ? '→' : '←'} {partLabel(scene, isLead ? j.partBId : j.partAId)}
              </p>
              {stale && (
                <p className="text-[10px] text-destructive-foreground pb-1">
                  Joint stale — ends must form a right-angle corner of equal width
                </p>
              )}
              {isLead ? (
                <>
                  <JointNumInput label="Fingers" value={j.fingerCount} onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, fingerCount: Math.max(3, Math.round(v)) }))} />
                  <JointNumInput label="Clear" value={j.clearance} suffix="mm" onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, clearance: Math.max(0, v) }))} />
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground pb-0.5">
                  Edit from {partLabel(scene, j.partAId)}.
                </p>
              )}
            </div>
          )
        }
```
(`Button`, `JointNumInput`, `partLabel` are already imported for the other branches. All `onUpdateJoint` calls sit inside the `j.kind === 'finger'` narrow — the type-hole invariant. `JointNumInput` rounds/parses numerically; `Math.max(3, Math.round(v))` enforces the ≥3 minimum on commit.)

- [ ] **Step 3: Run + commit**

Run: `pnpm vitest run src/ui/sidebar.test.tsx` then `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/ui/JointsPanel.tsx src/ui/sidebar.test.tsx
git commit -S -m "feat(ui): finger-joint controls in JointsPanel

<trailers per Commit conventions>"
```

---

## Task 7: Documentation & final verification

**Files:**
- Create: `docs/superpowers/notes/2026-07-24-box-finger-joint-notes.md`
- Modify: `docs/keyboard-shortcuts.md`, `README.md`, `project-structure.html`

- [ ] **Step 1: Write the implementation notes**

Create `docs/superpowers/notes/2026-07-24-box-finger-joint-notes.md`:
```markdown
# Box / Finger Joint (JP6) — Implementation Notes

**Date:** 2026-07-24

- Sixth joint type; first interlocking corner and first with a variable integer count
  (`fingerCount`). Symmetric-ish (both boards get finger slots); one board (B) auto-seats. Mirrors
  the M&T slice. `Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint`.
- `fingerjoint.ts` is self-contained (no runtime import from `dado.ts`, which imports
  `deriveFingerJoint` back). The gesture/creation code imports the exported `isValidFingerJoint`
  directly — create gate = derive gate (carrying forward the JP5 fix), so no dead joints.
- **World-parity interlock (the subtle bit):** finger removal is by WORLD segment index, not local
  index. When the two boards' `fingerAxis` run anti-parallel (reachable by rotating B), the seat
  aligns physical spans so a world segment maps to a *reversed* local index on B. `deriveFingerJoint`
  computes `flip = fA·fB < 0` and passes it to `computeFingerCuts`, which removes local `i` iff
  `(flip ? N−1−i : i) % 2 === removeParity`. A removes world-odd, B removes world-even → complementary.
  The L99 review caught this before implementation; a flip fixture covers it.
- Each finger slot cuts to depth = the MATING board's thickness (that's the overlap extent along the
  board's seat axis), spans full thickness, one segment along `fingerAxis`. Clearance widens each
  slot by `clearance/2` per interior edge (both boards widen → ≈`clearance` per-side meshed gap).
- The corner seat is a 3-axis flush placement in A's orthonormal frame; the corner side (which of
  A's thickness faces) is chosen nearest B's current end, so the move is minimal and idempotent.
- Fingers minimum is 3 (a 1-finger "joint" is a degenerate lap). Requires equal joint widths.
- 6th exclusive viewport mode (shortcut `f`), mirroring the M&T wiring. The `activeMode`-enum
  refactor (six modes now) is deferred to its own slice (L99 finding D1).
- No OCCT/mesh/export/drawing change — ordinary `BoxCut`s. Interactive 3D verification is a human
  step (OCCT WASM doesn't boot headless).
```

- [ ] **Step 2: Update `docs/keyboard-shortcuts.md`** — add an `F` row ("Activate finger-joint mode | Click one board's end, then the perpendicular equal-width end of another") right after the `M` (mortise & tenon) row, matching the table format.

- [ ] **Step 3: Update `README.md`** — append a "Finger joint mode (`F`)" bullet after the mortise & tenon bullet (interlocking right-angle corner, `N` meshing fingers, auto-seated; `Fingers`/`Clear` controls). Match the existing style.

- [ ] **Step 4: Update `project-structure.html`** — add `fingerjoint.ts` (finger-joint geometry) next to the `mortisetenon.ts` entry in the `src/geom/` table, and `useAddFingerJoint.ts` next to `useAddMortiseTenon.ts` in `src/scene/`. Match the existing row style. (The `<!-- AUTOGEN:src-tree -->` region is release-regenerated — leave it untouched; edit the hand-written tables below it, as in JP5.)

- [ ] **Step 5: Full verification suite + build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS — typecheck clean, lint clean, all tests green (every JP1–JP5 test intact), `tsc + vite build` succeeds. Paste the final test summary + build result.

- [ ] **Step 6: Commit + push**

```bash
git add docs/superpowers/notes/2026-07-24-box-finger-joint-notes.md docs/keyboard-shortcuts.md README.md project-structure.html
git commit -S -m "docs(joints): box & finger joint notes + keyboard/README/structure updates

<trailers per Commit conventions>"
git push -u origin claude/next-step-suggestion-i0qjjd
```
(Retry push up to 4× with exponential backoff on network error. No PR.)

---

## Verification checklist (whole feature)

- [ ] `isValidFingerJoint`: axis-aligned + non-thickness ends + perpendicular ends + parallel finger axes + equal joint widths; invalid otherwise (stale → null).
- [ ] `computeFingerCuts`: A removes world-odd, B removes world-even; **flip** reverses B's parity to stay complementary; depth = mating thickness; full thickness; clearance widens interior edges; `N<2` → no cuts.
- [ ] `computeFingerSeat`: B lands in a flush corner (`(182,0,200)` for the fixture); corner side nearest current; idempotent.
- [ ] `deriveFingerJoint`: cuts split across both boards + seat on B; complementary world bands; asymmetric depths for unequal thickness; stale → null.
- [ ] `deriveJoint` dispatches `finger`; `jointInvolves` + `parseFile` (v9) + `onRemoveJoint` handle it.
- [ ] `onAddFingerJoint` (one undo, gated on `isValidFingerJoint`) + `useAddFingerJoint` (two-click, corner-gated with status messages).
- [ ] 6th exclusive mode (shortcut `f`): mutual exclusion, routing, Sidebar button.
- [ ] `JointsPanel`: Fingers/Clear on the lead board; read-only hint on the mating board; other joint panels unaffected.
- [ ] `pnpm typecheck && lint && test && build` all green.
```
