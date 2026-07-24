# Mortise & Tenon Joint (JP5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mortise & tenon joint — a mortise board with a blind/through rectangular pocket and a tenon board whose end is reduced to a 4-shoulder centered tongue that seats into the pocket.

**Architecture:** New pure `src/geom/mortisetenon.ts` (self-contained, no runtime import from `dado.ts` to avoid a cycle) computes 0/2/4 tenon shoulder strips + 1 pocket + a seat, mirroring the dado's `computeDadoSeat`/`deriveDadoAxes` with 2-axis centering. `deriveJoint` gains a `mortise-tenon` case; a two-click `useAddMortiseTenon` gesture + a 5th exclusive viewport mode (`m`) create it; `JointsPanel` gains a `mortise-tenon` branch.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + happy-dom, THREE for the seat vector math (as in `dado.ts`), pnpm.

**Spec:** `docs/superpowers/specs/2026-07-23-mortise-tenon-joint-design.md`

**Commit conventions (every commit):** sign with `-S`; author `Claude <noreply@anthropic.com>` (already configured); end the body with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LZYYj3iGa4yi5RjEfizDJC
```
No model identifier anywhere in commits/code. Branch `claude/next-step-suggestion-i0qjjd`. Run `pnpm typecheck && pnpm lint && pnpm test` before each commit. Local signature verification printing "No signature" is a known sandbox false-negative — fine if `git commit -S` exits 0. New commit per task (no `--amend` unless a review asks).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/geom/mortisetenon.ts` | M&T geometry | **Create** — validity, shoulders, pocket, offset, seat, derive |
| `src/scene/types.ts` | canonical types | `MortiseTenonJoint`; extend `Joint` union |
| `src/geom/dado.ts` | dado geom + dispatch | `deriveJoint` `mortise-tenon` case + import |
| `src/scene/jointInvolves.ts` | joint↔part membership | `mortise-tenon` arm |
| `src/scene/useFile.ts` | file format | `FILE_FORMAT_VERSION` `7 → 8`; `parseFile` `mortise-tenon` arm |
| `src/scene/useScene.ts` | scene state | `onAddMortiseTenon`; `onRemoveJoint` label arm |
| `src/scene/useAddMortiseTenon.ts` | gesture | **Create** — two-click state machine |
| `src/App.tsx` / `src/render/viewport.tsx` / `src/ui/sidebar.tsx` | composition | 5th exclusive mode (`m`) |
| `src/ui/JointsPanel.tsx` | joint editor | `mortise-tenon` controls branch |

**Unchanged:** `reconcileJoints.ts` (seatful path already works), `halflap.ts`, `computeDado*`/`computeRabbet`/`computeNotch`, `useAddJoint.ts`/`useAddHalfLap.ts`, `occt.*`, `mesh.ts`, STL/STEP export, `drawing.ts`.

**The reference fixture** (used across the geometry tests): a mortise board `M` (200×100×40, at origin, unrotated, `mortiseFace '+Z'`) and a tenon board `T` (120×60×30, rotation `{0,90,0}`, `tenonEnd '+X'`). Under `Ry=90`: T's local +X → world −Z (opposes M's +Z face ⇒ valid perpendicular seat), local +Z (thickness) → world +X, local +Y (width) → world +Y. With `tenonLength=27, tenonThickness=10, tenonWidth=40, clearance=0, through=false, offsetU=100, offsetV=50`, the geometry is hand-computable (used below).

---

## Task 1: M&T geometry + `MortiseTenonJoint` type (standalone)

Define the type and build all geometry against it **before** it enters the `Joint` union (so nothing else breaks yet). `mortisetenon.ts` is self-contained: it must not import any runtime value from `dado.ts`.

**Files:**
- Modify: `src/scene/types.ts` (add `MortiseTenonJoint`; **do not** change `Joint` yet)
- Create: `src/geom/mortisetenon.ts`, `src/geom/mortisetenon.test.ts`

- [ ] **Step 1: Add `MortiseTenonJoint` to types (not in the union yet)**

In `src/scene/types.ts`, after `HalfLapJoint` and **before** `export type Joint = …`:
```ts
export interface MortiseTenonJoint {
  kind: 'mortise-tenon'
  id: string // "joint_<uuid>"
  label: string // "Mortise & tenon 1"
  mortisePartId: PartId // board that carries the pocket
  mortiseFace: Face // face the pocket is cut into
  tenonPartId: PartId // board whose end becomes the tenon
  tenonEnd: Face // the tenon board's end reduced to the tongue
  tenonLength: number // mm — tongue projection = blind mortise depth
  tenonThickness: number // mm — tongue thickness (tenon board local Z)
  tenonWidth: number // mm — tongue width (the non-Z cross-section axis)
  clearance: number // mm — added to pocket cross-section + depth for fit
  through: boolean // false = blind pocket; true = pocket spans the mortise thickness
  offsetU: number // mortise center along mortiseFace's u axis
  offsetV: number // mortise center along mortiseFace's v axis
}
```
Leave `export type Joint = DadoJoint | HalfLapJoint` unchanged in this task.

- [ ] **Step 2: Write the failing geometry tests**

Create `src/geom/mortisetenon.test.ts`:
```ts
import { test, expect } from 'vitest'
import type { BoardPart, MortiseTenonJoint, Part } from '../scene/types'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'
import { computeLocalFaceCenter } from '../scene/snapMath'
import {
  isValidMortiseTenon,
  computeTenonShoulders,
  computeMortisePocket,
  computeMortiseTenonSeat,
  deriveMortiseTenon,
} from './mortisetenon'

const M: BoardPart = {
  kind: 'board', id: 'M', label: 'M', length: 200, width: 100, thickness: 40,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const T: BoardPart = {
  kind: 'board', id: 'T', label: 'T', length: 120, width: 60, thickness: 30,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 90, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const parts: Part[] = [M, T]
const joint: MortiseTenonJoint = {
  kind: 'mortise-tenon', id: 'j1', label: 'Mortise & tenon 1',
  mortisePartId: 'M', mortiseFace: '+Z', tenonPartId: 'T', tenonEnd: '+X',
  tenonLength: 27, tenonThickness: 10, tenonWidth: 40, clearance: 0, through: false,
  offsetU: 100, offsetV: 50,
}

test('isValidMortiseTenon: perpendicular, axis-aligned, length/width-end seat is valid', () => {
  expect(isValidMortiseTenon(M, '+Z', T, '+X')).toBe(true)
})
test('isValidMortiseTenon: a non-perpendicular seat is invalid', () => {
  expect(isValidMortiseTenon(M, '+Z', { ...T, rotation: { x: 0, y: 0, z: 0 } }, '+X')).toBe(false)
})
test('isValidMortiseTenon: a thickness-end tenon is invalid', () => {
  // '+Z' tenon end has depth axis 'z' — out of scope.
  expect(isValidMortiseTenon(M, '+Z', { ...T, rotation: { x: 0, y: 0, z: 0 } }, '+Z')).toBe(false)
})
test('isValidMortiseTenon: a non-axis-aligned tenon board is invalid', () => {
  expect(isValidMortiseTenon(M, '+Z', { ...T, rotation: { x: 0, y: 45, z: 0 } }, '+X')).toBe(false)
})

test('computeTenonShoulders: 4 centered shoulder strips over the tenon length', () => {
  const cuts = computeTenonShoulders(T, joint)
  expect(cuts).toHaveLength(4)
  const by = (s: string) => cuts.find((c) => c.id === `cut_j1_shoulder${s}`)!
  expect(by('Zhi').position).toEqual({ x: 93, y: 0, z: 20 })
  expect(by('Zhi').size).toEqual({ x: 27, y: 60, z: 10 })
  expect(by('Zlo').position).toEqual({ x: 93, y: 0, z: 0 })
  expect(by('Zlo').size).toEqual({ x: 27, y: 60, z: 10 })
  expect(by('Whi').position).toEqual({ x: 93, y: 50, z: 0 })
  expect(by('Whi').size).toEqual({ x: 27, y: 10, z: 30 })
  expect(by('Wlo').position).toEqual({ x: 93, y: 0, z: 0 })
  expect(by('Wlo').size).toEqual({ x: 27, y: 10, z: 30 })
  expect(by('Zhi').sourceJointId).toBe('j1')
})
test('computeTenonShoulders: full-width tenon drops the width shoulders (2 strips)', () => {
  const cuts = computeTenonShoulders(T, { ...joint, tenonWidth: 60 })
  expect(cuts).toHaveLength(2)
  expect(cuts.every((c) => c.id.includes('shoulderZ'))).toBe(true)
})

test('computeMortisePocket: blind pocket sized + oriented to the tenon, centered on the offset', () => {
  const cut = computeMortisePocket(M, T, joint)
  expect(cut.id).toBe('cut_j1_mortise')
  expect(cut.position).toEqual({ x: 95, y: 30, z: 13 }) // depth 27 from the +Z face (z 13..40)
  expect(cut.size).toEqual({ x: 10, y: 40, z: 27 }) // thk(x) × width(y) × depth(z)
})
test('computeMortisePocket: through pocket spans the full thickness', () => {
  const cut = computeMortisePocket(M, T, { ...joint, through: true })
  expect(cut.position.z).toBe(0)
  expect(cut.size.z).toBe(40)
})

test('computeMortiseTenonSeat: tongue tip on the pocket bottom, centered on the mortise', () => {
  const seat = computeMortiseTenonSeat(M, T, joint)
  const seated: BoardPart = { ...T, position: seat.position }
  const endLocal = computeLocalFaceCenter({ x: 1, y: 0, z: 0 }, seated)
  const [wx, wy, wz] = applyMatrixToPoint(composeWorldMatrix(seated), endLocal.x, endLocal.y, endLocal.z)
  expect(wx).toBeCloseTo(100, 6)
  expect(wy).toBeCloseTo(50, 6)
  expect(wz).toBeCloseTo(13, 6)
})

test('deriveMortiseTenon: 4 shoulders (tenon) + 1 pocket (mortise) + a seat', () => {
  const r = deriveMortiseTenon(joint, parts)
  expect(r).not.toBeNull()
  expect(r!.seat!.partId).toBe('T')
  expect(r!.cuts).toHaveLength(5)
  expect(r!.cuts.filter((c) => c.partId === 'T')).toHaveLength(4)
  expect(r!.cuts.filter((c) => c.partId === 'M')).toHaveLength(1)
})
test('deriveMortiseTenon: stale (non-perpendicular) returns null', () => {
  expect(deriveMortiseTenon(joint, [M, { ...T, rotation: { x: 0, y: 0, z: 0 } }])).toBeNull()
})
```
Run `pnpm vitest run src/geom/mortisetenon.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/geom/mortisetenon.ts`**

```ts
import * as THREE from 'three'
import type { BoardPart, BoxCut, CutId, Face, Part, Vec3 } from '../scene/types'
import type { MortiseTenonJoint } from '../scene/types'
import type { DeriveResult, DerivedCut } from './dado'
import { applyMatrixToPoint, composeWorldMatrix } from './transform'
import { faceAxes, computeLocalFaceCenter } from '../scene/snapMath'

const DEG2RAD = Math.PI / 180
type Axis = 'x' | 'y' | 'z'
const EPS = 1e-4

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
function isPerpendicularSeat(mortise: BoardPart, mortiseFace: Face, tenon: BoardPart, tenonEnd: Face): boolean {
  return (
    localDirToWorld(mortise, FACE_NORMALS[mortiseFace]).dot(localDirToWorld(tenon, FACE_NORMALS[tenonEnd])) < -0.99
  )
}

export function isValidMortiseTenon(
  mortise: BoardPart, mortiseFace: Face, tenon: BoardPart, tenonEnd: Face,
): boolean {
  if (!isAxisAligned(mortise) || !isAxisAligned(tenon)) return false
  if (!isPerpendicularSeat(mortise, mortiseFace, tenon, tenonEnd)) return false
  return faceAxes(tenonEnd).depth !== 'z'
}

export function computeTenonShoulders(tenon: BoardPart, joint: MortiseTenonJoint): BoxCut[] {
  const dim = boardDims(tenon)
  const seatAx = faceAxes(joint.tenonEnd).depth
  const widthAx: Axis = seatAx === 'x' ? 'y' : 'x'
  const d = clamp(joint.tenonLength, 0.1, dim[seatAx] - 0.1)
  const tt = clamp(joint.tenonThickness, 0.1, dim.z)
  const tw = clamp(joint.tenonWidth, 0.1, dim[widthAx])
  const s0 = joint.tenonEnd.startsWith('+') ? dim[seatAx] - d : 0
  const zMargin = (dim.z - tt) / 2
  const wMargin = (dim[widthAx] - tw) / 2

  const make = (suffix: string, position: Vec3, size: Vec3): BoxCut => ({
    kind: 'box',
    id: `cut_${joint.id}_shoulder${suffix}` as CutId,
    label: `${joint.label} shoulder`,
    face: joint.tenonEnd,
    position,
    size,
    sourceJointId: joint.id,
  })
  const strip = (seatSize: number, waLo: number, waSize: number, zLo: number, zSize: number): [Vec3, Vec3] => {
    const position: Vec3 = { x: 0, y: 0, z: 0 }
    const size: Vec3 = { x: 0, y: 0, z: 0 }
    position[seatAx] = s0
    size[seatAx] = seatSize
    position[widthAx] = waLo
    size[widthAx] = waSize
    position.z = zLo
    size.z = zSize
    return [position, size]
  }

  const cuts: BoxCut[] = []
  if (zMargin > EPS) {
    cuts.push(make('Zhi', ...strip(d, 0, dim[widthAx], dim.z / 2 + tt / 2, zMargin)))
    cuts.push(make('Zlo', ...strip(d, 0, dim[widthAx], 0, zMargin)))
  }
  if (wMargin > EPS) {
    cuts.push(make('Whi', ...strip(d, dim[widthAx] / 2 + tw / 2, wMargin, 0, dim.z)))
    cuts.push(make('Wlo', ...strip(d, 0, wMargin, 0, dim.z)))
  }
  return cuts
}

export function computeMortisePocket(mortise: BoardPart, tenon: BoardPart, joint: MortiseTenonJoint): BoxCut {
  const dAx = faceAxes(joint.mortiseFace).depth
  const { u, v } = faceAxes(joint.mortiseFace)
  const dim = boardDims(mortise)
  const thicknessWorld = localDirToWorld(tenon, unitVec('z'))
  const uWorld = localDirToWorld(mortise, unitVec(u))
  const vWorld = localDirToWorld(mortise, unitVec(v))
  const thkAx: Axis = Math.abs(thicknessWorld.dot(uWorld)) >= Math.abs(thicknessWorld.dot(vWorld)) ? u : v
  const wAx: Axis = thkAx === u ? v : u

  const size: Vec3 = { x: 0, y: 0, z: 0 }
  size[dAx] = joint.through ? dim[dAx] : clamp(joint.tenonLength + joint.clearance, 0.1, dim[dAx])
  size[thkAx] = clamp(joint.tenonThickness + joint.clearance, 0.1, dim[thkAx])
  size[wAx] = clamp(joint.tenonWidth + joint.clearance, 0.1, dim[wAx])

  const position: Vec3 = { x: 0, y: 0, z: 0 }
  position[dAx] = joint.mortiseFace.startsWith('+') ? dim[dAx] - size[dAx] : 0
  position[u] = clamp(joint.offsetU - size[u] / 2, 0, dim[u] - size[u])
  position[v] = clamp(joint.offsetV - size[v] / 2, 0, dim[v] - size[v])

  return {
    kind: 'box',
    id: `cut_${joint.id}_mortise` as CutId,
    label: `${joint.label} mortise`,
    face: joint.mortiseFace,
    position,
    size,
    sourceJointId: joint.id,
  }
}

// Seed editable offsets at creation: project the tenon board's center onto the mortise face axes.
export function computeMortiseOffset(
  mortise: BoardPart, tenon: BoardPart, mortiseFace: Face,
): { offsetU: number; offsetV: number } {
  const { u, v } = faceAxes(mortiseFace)
  const dim = boardDims(mortise)
  const [cx, cy, cz] = applyMatrixToPoint(
    composeWorldMatrix(tenon), tenon.length / 2, tenon.width / 2, tenon.thickness / 2,
  )
  const rel = { x: cx - mortise.position.x, y: cy - mortise.position.y, z: cz - mortise.position.z }
  const uDir = localDirToWorld(mortise, unitVec(u))
  const vDir = localDirToWorld(mortise, unitVec(v))
  return {
    offsetU: clamp(rel.x * uDir.x + rel.y * uDir.y + rel.z * uDir.z, 0, dim[u]),
    offsetV: clamp(rel.x * vDir.x + rel.y * vDir.y + rel.z * vDir.z, 0, dim[v]),
  }
}

export function computeMortiseTenonSeat(
  mortise: BoardPart, tenon: BoardPart, joint: MortiseTenonJoint,
): { position: Vec3 } {
  const dAx = faceAxes(joint.mortiseFace).depth
  const { u, v } = faceAxes(joint.mortiseFace)
  const dim = boardDims(mortise)
  const d = clamp(joint.tenonLength, 0.1, dim[dAx])

  const endLocal = computeLocalFaceCenter(FACE_NORMALS[joint.tenonEnd], tenon)
  const [ex, ey, ez] = applyMatrixToPoint(composeWorldMatrix(tenon), endLocal.x, endLocal.y, endLocal.z)
  const endWorld = new THREE.Vector3(ex, ey, ez)

  const mM = composeWorldMatrix(mortise)
  const faceCenter = computeLocalFaceCenter(FACE_NORMALS[joint.mortiseFace], mortise)
  const bottomLocal: Vec3 = { ...faceCenter }
  bottomLocal[dAx] = joint.mortiseFace.startsWith('+') ? dim[dAx] - d : d
  const [bx, by, bz] = applyMatrixToPoint(mM, bottomLocal.x, bottomLocal.y, bottomLocal.z)
  const bottomWorld = new THREE.Vector3(bx, by, bz)

  const centerLocal: Vec3 = { ...faceCenter }
  centerLocal[u] = joint.offsetU
  centerLocal[v] = joint.offsetV
  const [gx, gy, gz] = applyMatrixToPoint(mM, centerLocal.x, centerLocal.y, centerLocal.z)
  const centerWorld = new THREE.Vector3(gx, gy, gz)

  const faceN = localDirToWorld(mortise, FACE_NORMALS[joint.mortiseFace])
  const uDir = localDirToWorld(mortise, unitVec(u))
  const vDir = localDirToWorld(mortise, unitVec(v))

  const desired = endWorld.clone()
  desired.addScaledVector(faceN, bottomWorld.clone().sub(endWorld).dot(faceN))
  desired.addScaledVector(uDir, centerWorld.clone().sub(endWorld).dot(uDir))
  desired.addScaledVector(vDir, centerWorld.clone().sub(endWorld).dot(vDir))

  return {
    position: {
      x: tenon.position.x + (desired.x - endWorld.x),
      y: tenon.position.y + (desired.y - endWorld.y),
      z: tenon.position.z + (desired.z - endWorld.z),
    },
  }
}

export function deriveMortiseTenon(joint: MortiseTenonJoint, parts: Part[]): DeriveResult | null {
  const mortise = parts.find((p) => p.id === joint.mortisePartId)
  const tenon = parts.find((p) => p.id === joint.tenonPartId)
  if (mortise?.kind !== 'board' || tenon?.kind !== 'board') return null
  if (!isValidMortiseTenon(mortise, joint.mortiseFace, tenon, joint.tenonEnd)) return null
  const cuts: DerivedCut[] = [
    ...computeTenonShoulders(tenon, joint).map((cut) => ({ partId: tenon.id, cut })),
    { partId: mortise.id, cut: computeMortisePocket(mortise, tenon, joint) },
  ]
  const seat = { partId: tenon.id, position: computeMortiseTenonSeat(mortise, tenon, joint).position }
  return { cuts, seat }
}
```
Run `pnpm vitest run src/geom/mortisetenon.test.ts` → PASS (all).

- [ ] **Step 4: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS (M&T tested; nothing else references it yet).
```bash
git add src/scene/types.ts src/geom/mortisetenon.ts src/geom/mortisetenon.test.ts
git commit -S -m "feat(geom): mortise & tenon geometry + MortiseTenonJoint type

<trailers per Commit conventions>"
```

---

## Task 2: Union flip — dispatch, `jointInvolves`, `parseFile`, panel stub

Add `MortiseTenonJoint` to the union and fix every consumer so typecheck stays green. `onUpdateJoint` is already `(j: Joint) => Joint` (JP4), so no signature change.

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
export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint
```
Run `pnpm typecheck` → FAIL in `dado.ts` (deriveJoint switch not exhaustive) and `JointsPanel.tsx` (narrowing). Expected.

- [ ] **Step 2: `deriveJoint` case**

In `src/geom/dado.ts`, add the import near the top (next to the `deriveHalfLap` import):
```ts
import { deriveMortiseTenon } from './mortisetenon'
```
In the `deriveJoint` dispatcher, add a case:
```ts
    case 'mortise-tenon':
      return deriveMortiseTenon(joint, parts)
```
(`mortisetenon.ts` type-imports `DeriveResult`/`DerivedCut` from `dado.ts`; `dado.ts` imports the `deriveMortiseTenon` value — one-directional, no runtime cycle.)

- [ ] **Step 3: `jointInvolves` arm**

`src/scene/jointInvolves.ts` — extend to handle all three kinds:
```ts
import type { Joint, PartId } from './types'

export function jointInvolves(joint: Joint, partId: PartId): boolean {
  if (joint.kind === 'dado') return joint.housingPartId === partId || joint.housedPartId === partId
  if (joint.kind === 'halflap') return joint.partAId === partId || joint.partBId === partId
  return joint.mortisePartId === partId || joint.tenonPartId === partId
}
```

- [ ] **Step 4: `parseFile` arm + version bump**

In `src/scene/useFile.ts`: `export const FILE_FORMAT_VERSION = 8`. In the joint-defaulting `.map`, add a `mortise-tenon` arm to the kind ternary (before the halflap/dado arms):
```ts
      joints: ((raw.scene.joints ?? []) as unknown as Array<Record<string, unknown>>).map((j) =>
        j.kind === 'mortise-tenon'
          ? ({ tenonLength: 0, tenonThickness: 0, tenonWidth: 0, clearance: 0, through: false, offsetU: 0, offsetV: 0, ...j } as unknown as Joint)
          : j.kind === 'halflap'
            ? ({ split: 0.5, clearance: 0, ...j } as unknown as Joint)
            : ({ kind: 'dado' as const, profile: 'plain' as const, tongueThickness: 6, rabbetFace: '+Z' as const, stopStart: 0, stopEnd: 0, ...j } as unknown as Joint),
      ),
```
(The M&T defaults are inert backfill — real v8 M&T joints always carry every field via `...j`. Preserve the existing comment lines above the map and add a `v7→v8: mortise-tenon joints` note.)

- [ ] **Step 5: JointsPanel stub**

In `src/ui/JointsPanel.tsx`, the map callback currently has `if (j.kind === 'halflap') { return (...) }` then the dado body. Add, immediately after the half-lap branch's closing `}` and before the dado code (`const isHousing = ...`):
```tsx
        if (j.kind === 'mortise-tenon') return null
```
(Renders nothing yet — Task 6 fills it in. The guard narrows `j` to `DadoJoint` for the dado body.)

- [ ] **Step 6: Dispatch test**

In `src/geom/dado.test.ts`, add near the other `deriveJoint` dispatch tests:
```ts
test('deriveJoint dispatches a mortise-tenon to the M&T deriver', () => {
  const m: BoardPart = { ...housing, id: 'MM', length: 200, width: 100, thickness: 40, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
  const t: BoardPart = { ...housing, id: 'TT', length: 120, width: 60, thickness: 30, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 90, z: 0 } }
  const mt = { kind: 'mortise-tenon' as const, id: 'jm', label: 'Mortise & tenon 1', mortisePartId: 'MM', mortiseFace: '+Z' as const, tenonPartId: 'TT', tenonEnd: '+X' as const, tenonLength: 27, tenonThickness: 10, tenonWidth: 40, clearance: 0, through: false, offsetU: 100, offsetV: 50 }
  const r = deriveJoint(mt, [m, t])
  expect(r).not.toBeNull()
  expect(r!.seat!.partId).toBe('TT')
  expect(r!.cuts).toHaveLength(5)
})
```
(`housing`, `BoardPart`, `deriveJoint` are already available in that file.)

- [ ] **Step 7: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/scene/types.ts src/geom/dado.ts src/geom/dado.test.ts src/scene/jointInvolves.ts src/scene/useFile.ts src/ui/JointsPanel.tsx
git commit -S -m "feat(joints): dispatch mortise-tenon; Joint union += MortiseTenonJoint

<trailers per Commit conventions>"
```

---

## Task 3: `onAddMortiseTenon` + kind-aware remove label

**Files:**
- Modify: `src/scene/useScene.ts`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scene/useScene.test.ts`, in the `useScene — joints` describe, after the existing tests:
```ts
  it('onAddMortiseTenon creates a mortise & tenon + cuts + seat in one undo entry', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    // Mortise board (flat) + tenon board (Ry=90) so the tenon end is perpendicular to the +Z face.
    await act(async () => result.current.onAdd('board'))
    await act(async () => result.current.onAdd('board'))
    const [Mb, Tb] = result.current.scene.parts
    await act(async () => {
      result.current.onUpdate(Mb.id, (p) => ({ ...p, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }), 'posM')
      result.current.onUpdate(Tb.id, (p) => ({ ...p, position: { x: 0, y: 0, z: 60 }, rotation: { x: 0, y: 90, z: 0 } }), 'posT')
    })
    await act(async () => {
      result.current.onAddMortiseTenon(hit(Mb.id, { x: 0, y: 0, z: 1 }), hit(Tb.id, { x: 1, y: 0, z: 0 }))
    })
    expect(result.current.scene.joints).toHaveLength(1)
    expect(result.current.scene.joints[0].kind).toBe('mortise-tenon')
    const jointCuts = () =>
      result.current.scene.parts
        .filter((p) => p.kind === 'board')
        .reduce((n, p) => n + (p.kind === 'board' ? p.cuts.filter((c) => c.kind === 'box' && c.sourceJointId).length : 0), 0)
    expect(jointCuts()).toBeGreaterThanOrEqual(2) // shoulders on tenon + pocket on mortise

    await act(async () => result.current.undo())
    expect(result.current.scene.joints).toHaveLength(0)
    expect(jointCuts()).toBe(0)
  })
```
(`hit` and the `useScene — joints` describe helpers already exist in this file.) Run `pnpm vitest run src/scene/useScene.test.ts -t "onAddMortiseTenon"` → FAIL (not a function).

- [ ] **Step 2: Add to the result type + imports**

In `src/scene/useScene.ts`: add `import { computeMortiseOffset } from '../geom/mortisetenon'`. Ensure `isValidDadoSeat` and `localNormalToFaceString` are imported (they already are, used by `onAddJoint`). In `UseSceneResult`, after `onAddHalfLap`:
```ts
  onAddMortiseTenon: (mortiseHit: FaceHit, tenonHit: FaceHit) => void
```

- [ ] **Step 3: Implement `onAddMortiseTenon` + label arm**

After the `onAddHalfLap` `useCallback`, add:
```ts
  const onAddMortiseTenon = useCallback(
    (mortiseHit: FaceHit, tenonHit: FaceHit) => {
      const s = sceneRef.current
      const mortise = s.parts.find((p) => p.id === mortiseHit.partId)
      const tenon = s.parts.find((p) => p.id === tenonHit.partId)
      if (mortise?.kind !== 'board' || tenon?.kind !== 'board' || mortise.id === tenon.id) return
      const mortiseFace = localNormalToFaceString(mortiseHit.localFaceNormal)
      const tenonEnd = localNormalToFaceString(tenonHit.localFaceNormal)
      if (!isValidDadoSeat(mortise, mortiseFace, tenon, tenonEnd)) return
      const n = s.joints.filter((j) => j.kind === 'mortise-tenon').length + 1
      const tenonThickness = Math.round(tenon.thickness / 3)
      const { offsetU, offsetV } = computeMortiseOffset(mortise, tenon, mortiseFace)
      const joint: Joint = {
        kind: 'mortise-tenon',
        id: `joint_${crypto.randomUUID()}`,
        label: `Mortise & tenon ${n}`,
        mortisePartId: mortise.id,
        mortiseFace,
        tenonPartId: tenon.id,
        tenonEnd,
        tenonLength: Math.round((mortise.thickness * 2) / 3),
        tenonThickness,
        tenonWidth: Math.max(0.1, tenon.width - 2 * tenonThickness),
        clearance: 0,
        through: false,
        offsetU,
        offsetV,
      }
      commitReconciled((prev) => ({ ...prev, joints: [...prev.joints, joint] }), 'Add mortise & tenon')
      setSelectedId(mortise.id)
    },
    [commitReconciled],
  )
```
Add `onAddMortiseTenon` to the returned object (near `onAddHalfLap`). In `onRemoveJoint`, extend the kind-aware label (currently `joint.kind === 'halflap' ? 'Remove half-lap' : 'Remove dado'`) to:
```ts
      const label =
        joint.kind === 'mortise-tenon' ? 'Remove mortise & tenon' : joint.kind === 'halflap' ? 'Remove half-lap' : 'Remove dado'
```

- [ ] **Step 4: Run + commit**

Run: `pnpm vitest run src/scene/useScene.test.ts` then `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -S -m "feat(scene): onAddMortiseTenon + kind-aware remove label

<trailers per Commit conventions>"
```

---

## Task 4: `useAddMortiseTenon` two-click gesture

Mirror `useAddJoint` (which validates a perpendicular seat), not `useAddHalfLap`.

**Files:**
- Create: `src/scene/useAddMortiseTenon.ts`, `src/scene/useAddMortiseTenon.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/scene/useAddMortiseTenon.test.ts`:
```ts
import { test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part } from './types'
import { useAddMortiseTenon } from './useAddMortiseTenon'

const mortise: Part = {
  kind: 'board', id: 'M', label: 'M', length: 200, width: 100, thickness: 40,
  material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
}
const tenon: Part = { ...mortise, id: 'T', length: 120, width: 60, thickness: 30, rotation: { x: 0, y: 90, z: 0 } }
const hit = (partId: string, n: { x: number; y: number; z: number }): FaceHit => ({
  partId, faceNormal: n, faceCenter: { x: 0, y: 0, z: 0 },
  localFaceNormal: n, localHitPoint: { x: 0, y: 0, z: 0 }, hitPoint: { x: 0, y: 0, z: 0 },
})

test('mortise face + perpendicular tenon end create a mortise & tenon', () => {
  const onAddMortiseTenon = vi.fn()
  const { result } = renderHook(() =>
    useAddMortiseTenon({ parts: [mortise, tenon], onAddMortiseTenon }),
  )
  act(() => result.current.activateMortiseTenon())
  act(() => result.current.onFaceClick(hit('M', { x: 0, y: 0, z: 1 }))) // +Z mortise face
  expect(onAddMortiseTenon).not.toHaveBeenCalled()
  act(() => result.current.onFaceClick(hit('T', { x: 1, y: 0, z: 0 }))) // +X tenon end
  expect(onAddMortiseTenon).toHaveBeenCalledTimes(1)
})

test('a non-perpendicular second hit does not create a joint', () => {
  const onAddMortiseTenon = vi.fn()
  const flat: Part = { ...tenon, rotation: { x: 0, y: 0, z: 0 } } // +X end now points world +X, not −Z
  const { result } = renderHook(() =>
    useAddMortiseTenon({ parts: [mortise, flat], onAddMortiseTenon }),
  )
  act(() => result.current.activateMortiseTenon())
  act(() => result.current.onFaceClick(hit('M', { x: 0, y: 0, z: 1 })))
  act(() => result.current.onFaceClick(hit('T', { x: 1, y: 0, z: 0 })))
  expect(onAddMortiseTenon).not.toHaveBeenCalled()
})
```
Run `pnpm vitest run src/scene/useAddMortiseTenon.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `useAddMortiseTenon`**

Create `src/scene/useAddMortiseTenon.ts`:
```ts
import { useState, useCallback } from 'react'
import type { FaceHit, Part } from './types'
import { isValidDadoSeat } from '../geom/dado'
import { localNormalToFaceString } from './snapMath'

export interface AddMortiseTenonState {
  mortiseTenonActive: boolean
  pendingMortise: FaceHit | null
  statusMessage: string | null
  hoveredFace: FaceHit | null
  activateMortiseTenon: () => void
  cancelMortiseTenon: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddMortiseTenon(params: {
  parts: Part[]
  onAddMortiseTenon: (mortiseHit: FaceHit, tenonHit: FaceHit) => void
}): AddMortiseTenonState {
  const { parts, onAddMortiseTenon } = params
  const [mortiseTenonActive, setActive] = useState(false)
  const [pendingMortise, setPending] = useState<FaceHit | null>(null)
  const [statusMessage, setStatus] = useState<string | null>(null)
  const [hoveredFace, setHovered] = useState<FaceHit | null>(null)

  const activateMortiseTenon = useCallback(() => {
    setActive((v) => !v)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])
  const cancelMortiseTenon = useCallback(() => {
    setActive(false)
    setPending(null)
    setStatus(null)
    setHovered(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      const part = parts.find((p) => p.id === hit.partId)
      if (part?.kind !== 'board') return
      if (pendingMortise === null) {
        setPending(hit)
        setStatus(null)
        return
      }
      if (hit.partId === pendingMortise.partId) {
        setStatus('Pick a different board for the tenon')
        setPending(null)
        return
      }
      const mortise = parts.find((p) => p.id === pendingMortise.partId)
      if (mortise?.kind !== 'board') {
        setPending(null)
        return
      }
      const mortiseFace = localNormalToFaceString(pendingMortise.localFaceNormal)
      const tenonEnd = localNormalToFaceString(hit.localFaceNormal)
      if (!isValidDadoSeat(mortise, mortiseFace, part, tenonEnd)) {
        setStatus('Tenon end must be perpendicular to the mortise face')
        setPending(null)
        return
      }
      onAddMortiseTenon(pendingMortise, hit)
      setPending(null)
      setActive(false)
      setHovered(null)
    },
    [parts, pendingMortise, onAddMortiseTenon],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHovered(mortiseTenonActive ? hit : null)
    },
    [mortiseTenonActive],
  )

  return {
    mortiseTenonActive,
    pendingMortise,
    statusMessage,
    hoveredFace,
    activateMortiseTenon,
    cancelMortiseTenon,
    onFaceClick,
    onFaceHover,
  }
}
```
Run the test → PASS.

- [ ] **Step 3: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/scene/useAddMortiseTenon.ts src/scene/useAddMortiseTenon.test.ts
git commit -S -m "feat(scene): useAddMortiseTenon two-click gesture

<trailers per Commit conventions>"
```

---

## Task 5: App + Viewport + Sidebar — the 5th exclusive mode

Wire the gesture as a 5th mutually-exclusive mode (shortcut `m`), mirroring the half-lap mode wiring exactly. **Integration task — no new unit tests**; verification is typecheck + lint + the full suite staying green. Before editing, read the existing `halfLap`-mode wiring in each file and mirror it.

**Files:**
- Modify: `src/App.tsx`, `src/render/viewport.tsx`, `src/ui/sidebar.tsx` (+ any test mock that needs the new required props)

- [ ] **Step 1: Compose the hook in `App.tsx`**

Import `useAddMortiseTenon` from `./scene/useAddMortiseTenon`; destructure `onAddMortiseTenon` from `useScene()` (next to `onAddHalfLap`). After the `useAddHalfLap({...})` destructure:
```ts
  const {
    mortiseTenonActive,
    pendingMortise: mortiseTenonPendingFace,
    statusMessage: mortiseTenonStatus,
    hoveredFace: mortiseTenonHoveredFace,
    activateMortiseTenon,
    cancelMortiseTenon,
    onFaceClick: onFaceClickMortiseTenon,
    onFaceHover: onFaceHoverMortiseTenon,
  } = useAddMortiseTenon({ parts: scene.parts, onAddMortiseTenon })
```

- [ ] **Step 2: Mutual exclusion**

Add `cancelMortiseTenon()` to each existing `handleActivateCut`/`handleActivateSnap`/`handleActivateJoint`/`handleActivateHalfLap` (and their dep arrays), and add:
```ts
  const handleActivateMortiseTenon = useCallback(() => {
    cancelCut()
    cancelSnap()
    cancelJoint()
    cancelHalfLap()
    activateMortiseTenon()
  }, [cancelCut, cancelSnap, cancelJoint, cancelHalfLap, activateMortiseTenon])
```

- [ ] **Step 3: Keyboard + guards**

In the non-modifier keydown block, after the `l` case, add:
```ts
        if (e.key.toLowerCase() === 'm') {
          e.preventDefault()
          handleActivateMortiseTenon()
          return
        }
```
Extend the `Escape` handler with `if (mortiseTenonActive) cancelMortiseTenon()`; extend the `h` and `Delete/Backspace` guards' condition with `&& !mortiseTenonActive`; add `handleActivateMortiseTenon`, `cancelMortiseTenon`, `mortiseTenonActive` to the keydown effect deps.

- [ ] **Step 4: Viewport props + routing**

In `src/render/viewport.tsx`, mirror the half-lap props exactly for mortise-tenon:
- Props interface: add `mortiseTenonActive: boolean; onFaceClickMortiseTenon: (hit: FaceHit) => void; onFaceHoverMortiseTenon: (hit: FaceHit | null) => void; mortiseTenonPendingFace: FaceHit | null; mortiseTenonHoveredFace: FaceHit | null`.
- Destructure them; add refs `mortiseTenonActiveRef`, `onFaceClickMortiseTenonRef`, `onFaceHoverMortiseTenonRef`; sync them in the ref-sync effect.
- Click dispatch: add `if (mortiseTenonActiveRef.current) { if (hits.length > 0) { const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current); if (faceHit) onFaceClickMortiseTenonRef.current(faceHit) } } else if (halfLapActiveRef.current) {` — i.e. mortise-tenon becomes the first branch.
- Hover guard: extend the early-return `if (!snapActiveRef.current && … && !halfLapActiveRef.current) return` with `&& !mortiseTenonActiveRef.current`.
- Hover dispatch (hit + null branches): add `mortiseTenonActiveRef.current` as the first branch → `onFaceHoverMortiseTenonRef.current`.
- Highlight effect: source highlight uses `mortiseTenonActive ? mortiseTenonPendingFace :` as the leading condition; hover highlight uses `mortiseTenonActive ? mortiseTenonHoveredFace :` leading; add the three new values to that effect's deps.
- Cursor effect: add `|| mortiseTenonActive` to the condition + deps.

- [ ] **Step 5: Pass Viewport + Sidebar props in `App.tsx`**

`<Viewport>` (after the half-lap props): `mortiseTenonActive`, `onFaceClickMortiseTenon`, `onFaceHoverMortiseTenon`, `mortiseTenonPendingFace`, `mortiseTenonHoveredFace`. `<Sidebar>` (after the half-lap props): `mortiseTenonActive`, `onMortiseTenonToggle={handleActivateMortiseTenon}`, `mortiseTenonStatus`.

- [ ] **Step 6: Sidebar button**

In `src/ui/sidebar.tsx`: add `mortiseTenonActive: boolean; onMortiseTenonToggle: () => void; mortiseTenonStatus: string | null` to the shell prop interface (next to the half-lap trio); destructure them; render a "Mortise & tenon" toggle button immediately after the half-lap button, mirroring its exact markup (active styling keyed on `mortiseTenonActive`, `onClick={onMortiseTenonToggle}`, showing `mortiseTenonStatus`). Update the shared `props()` factory in `src/ui/sidebar.test.tsx` to include the three new props (`mortiseTenonActive: false, onMortiseTenonToggle: vi.fn(), mortiseTenonStatus: null`).

- [ ] **Step 7: Full check + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test` → PASS (fix any other test mock the new required props break, minimally). Interactive 3D verification is a human step.
```bash
git add src/App.tsx src/render/viewport.tsx src/ui/sidebar.tsx src/ui/sidebar.test.tsx
git commit -S -m "feat(ui): wire mortise-tenon add-mode (App/Viewport/Sidebar)

<trailers per Commit conventions>"
```

---

## Task 6: `JointsPanel` mortise-tenon controls

Replace the Task 2 `if (j.kind === 'mortise-tenon') return null` stub with a real branch.

**Files:**
- Modify: `src/ui/JointsPanel.tsx`
- Test: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/ui/sidebar.test.tsx`, add a describe (mirror the half-lap block). Fixture: a mortise board + a tenon board:
```ts
describe('Sidebar joints panel — mortise & tenon', () => {
  afterEach(() => cleanup())

  const mtScene = () => ({
    parts: [
      makeBoard(),
      makeBoard({ id: 'board_t2', label: 'Board 2', rotation: { x: 0, y: 90, z: 0 } }),
    ],
    materials: {},
    hardware: [],
    joints: [
      {
        kind: 'mortise-tenon' as const,
        id: 'jm',
        label: 'Mortise & tenon 1',
        mortisePartId: 'board_t1',
        mortiseFace: '+Z' as const,
        tenonPartId: 'board_t2',
        tenonEnd: '+X' as const,
        tenonLength: 20,
        tenonThickness: 8,
        tenonWidth: 40,
        clearance: 0,
        through: false,
        offsetU: 100,
        offsetV: 50,
      },
    ],
  })

  it('shows Length / Thk / Width / Through controls for the mortise board', () => {
    render(<Sidebar {...props({ scene: mtScene(), selectedId: 'board_t1' })} />)
    expect(screen.getByText('Length')).toBeTruthy()
    expect(screen.getByText('Thk')).toBeTruthy()
    expect(screen.getByText('Width')).toBeTruthy()
    expect(screen.getByText('Through')).toBeTruthy()
  })

  it('shows the tenon-side read-only hint on the other board', () => {
    render(<Sidebar {...props({ scene: mtScene(), selectedId: 'board_t2' })} />)
    expect(screen.getByText(/Edit from/)).toBeTruthy()
  })
})
```
Run `pnpm vitest run src/ui/sidebar.test.tsx -t "mortise"` → FAIL.

- [ ] **Step 2: Implement the branch**

In `src/ui/JointsPanel.tsx`, add `import { isValidMortiseTenon } from '../geom/mortisetenon'`, and the `Select` primitives if the `Through` toggle uses one (they're already imported for the dado Profile select). Replace the stub `if (j.kind === 'mortise-tenon') return null` with:
```tsx
        if (j.kind === 'mortise-tenon') {
          const isMortise = j.mortisePartId === part.id
          const mortise = scene.parts.find((p) => p.id === j.mortisePartId)
          const tenon = scene.parts.find((p) => p.id === j.tenonPartId)
          const stale =
            mortise?.kind === 'board' && tenon?.kind === 'board'
              ? !isValidMortiseTenon(mortise, j.mortiseFace, tenon, j.tenonEnd)
              : true
          return (
            <div key={j.id} className="border-t border-border/30 pt-1 pb-1">
              <div className="flex items-center gap-1 py-0.5">
                <span className="flex-1 text-[11px] text-foreground">{j.label}</span>
                <span className="text-[10px] text-muted-foreground">{isMortise ? 'mortise' : 'tenon'}</span>
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
                {isMortise ? '→' : '←'} {partLabel(scene, isMortise ? j.tenonPartId : j.mortisePartId)}
              </p>
              {stale && (
                <p className="text-[10px] text-destructive-foreground pb-1">
                  Joint stale — tenon end must be perpendicular to the mortise face
                </p>
              )}
              {isMortise ? (
                <>
                  <JointNumInput label="Length" value={j.tenonLength} suffix="mm" onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, tenonLength: Math.max(0.1, v) }))} />
                  <JointNumInput label="Thk" value={j.tenonThickness} suffix="mm" onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, tenonThickness: Math.max(0.1, v) }))} />
                  <JointNumInput label="Width" value={j.tenonWidth} suffix="mm" onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, tenonWidth: Math.max(0.1, v) }))} />
                  <JointNumInput label="Clear" value={j.clearance} suffix="mm" onCommit={(v) => onUpdateJoint(j.id, (jt) => ({ ...jt, clearance: Math.max(0, v) }))} />
                  <div className="flex items-center gap-1.5 mb-1">
                    <Label className="w-10 shrink-0 text-right">Through</Label>
                    <Select value={j.through ? 'yes' : 'no'} onValueChange={(val) => onUpdateJoint(j.id, (jt) => ({ ...jt, through: val === 'yes' }))}>
                      <SelectTrigger className="h-7 flex-1 text-[11px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">Blind</SelectItem>
                        <SelectItem value="yes">Through</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground pb-0.5">
                  Edit from {partLabel(scene, j.mortisePartId)}.
                </p>
              )}
            </div>
          )
        }
```
(`Label`, `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` are already imported for the dado controls. All `onUpdateJoint` calls sit inside the `j.kind === 'mortise-tenon'` narrow — the JP4 type-hole invariant.)

- [ ] **Step 3: Run + commit**

Run: `pnpm vitest run src/ui/sidebar.test.tsx` then `pnpm typecheck && pnpm lint && pnpm test` → PASS.
```bash
git add src/ui/JointsPanel.tsx src/ui/sidebar.test.tsx
git commit -S -m "feat(ui): mortise-tenon controls in JointsPanel

<trailers per Commit conventions>"
```

---

## Task 7: Documentation & final verification

**Files:**
- Create: `docs/superpowers/notes/2026-07-23-mortise-tenon-joint-notes.md`
- Modify: `docs/keyboard-shortcuts.md`, `README.md`, `project-structure.html`

- [ ] **Step 1: Write the implementation notes**

Create `docs/superpowers/notes/2026-07-23-mortise-tenon-joint-notes.md`:
```markdown
# Mortise & Tenon Joint (JP5) — Implementation Notes

**Date:** 2026-07-23

- Fifth joint type; first with a blind pocket + multi-cut tenon. Asymmetric (mortise board + tenon
  board), mirrors the dado. `Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint`.
- `mortisetenon.ts` is self-contained (no runtime import from `dado.ts`, which imports
  `deriveMortiseTenon` back). It reimplements the perpendicular-seat check (`isPerpendicularSeat`)
  and `isAxisAligned` locally; the gesture/creation code (`useAddMortiseTenon`, `useScene`) imports
  the exported `isValidDadoSeat` directly (those modules aren't imported by `dado.ts`).
- Tenon = 0/2/4 shoulder strips over `tenonLength`, leaving a centered `tenonThickness × tenonWidth`
  tongue; a strip vanishes when its margin is 0 (full-width / full-thickness).
- Mortise = one pocket `BoxCut`, cross-section oriented to the tenon's thickness/width via a
  `deriveDadoAxes`-style world-axis alignment; blind depth = `tenonLength + clearance`, or full
  thickness when `through`.
- Seat mirrors `computeDadoSeat` with `depth = tenonLength` and 2-axis centering: drops the tongue tip
  on the pocket bottom and aligns the tongue center to `(offsetU, offsetV)` on the face.
- `offsetU`/`offsetV` are auto-derived at creation (`computeMortiseOffset`) and editable.
- 5th exclusive viewport mode (shortcut `m`), mirroring the half-lap wiring. JP4's suggested
  `activeMode` refactor was deliberately deferred.
- No OCCT/mesh/export/drawing change — everything is ordinary `BoxCut`s. Interactive 3D verification
  is a human step (OCCT WASM doesn't boot headless).
```

- [ ] **Step 2: Update `docs/keyboard-shortcuts.md`** — add an `M` row ("Activate mortise & tenon mode | Click the mortise face, then the perpendicular tenon end") right after the `L` (half-lap) row, matching the table format.

- [ ] **Step 3: Update `README.md`** — append a "Mortise & tenon joint mode (`M`)" bullet after the half-lap bullet (blind/through pocket + 4-shoulder centered tenon; `Length`/`Thk`/`Width`/`Through` controls). Match the existing style.

- [ ] **Step 4: Update `project-structure.html`** — add `mortisetenon.ts` (M&T geometry) next to the `dado.ts`/`halflap.ts` entries in the `src/geom/` table, and `useAddMortiseTenon.ts` next to `useAddHalfLap.ts` in `src/scene/`. Match the existing row style. If the tree isn't itemized to that depth, add a minimal style-matching mention; otherwise note it in your report.

- [ ] **Step 5: Full verification suite + build**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: PASS — typecheck clean, lint clean, all tests green (every JP1–JP4 test intact), `tsc + vite build` succeeds. Paste the final test summary + build result.

- [ ] **Step 6: Commit + push**

```bash
git add docs/superpowers/notes/2026-07-23-mortise-tenon-joint-notes.md docs/keyboard-shortcuts.md README.md project-structure.html
git commit -S -m "docs(joints): mortise & tenon notes + keyboard/README/structure updates

<trailers per Commit conventions>"
git push -u origin claude/next-step-suggestion-i0qjjd
```
(Retry push up to 4× with exponential backoff on network error. No PR.)

---

## Verification checklist (whole feature)

- [ ] `computeTenonShoulders`: 4 centered strips (2 when full-width, 0 when full-width+full-thickness), correct central-tongue bounds, `+`/`−` end placement.
- [ ] `computeMortisePocket`: blind depth `tenonLength+clearance` / through full-thickness; cross-section oriented to thickness/width; centered on `offsetU/offsetV`.
- [ ] `computeMortiseTenonSeat`: tongue tip on the pocket bottom, tongue center on the mortise center (incl. a rotated tenon board).
- [ ] `isValidMortiseTenon`: axis-aligned + perpendicular + length/width-end; invalid otherwise (stale → null).
- [ ] `deriveJoint` dispatches `mortise-tenon`; `jointInvolves` + `parseFile` + `onRemoveJoint` handle it; format 8.
- [ ] `onAddMortiseTenon` (one undo) + `useAddMortiseTenon` (perpendicular-gated two-click).
- [ ] 5th exclusive mode (shortcut `m`): mutual exclusion, routing, Sidebar button.
- [ ] `JointsPanel`: Length/Thk/Width/Clear/Through on the mortise side; read-only hint on the tenon side; dado + half-lap panels unaffected.
- [ ] `pnpm typecheck && lint && test && build` all green.
```
