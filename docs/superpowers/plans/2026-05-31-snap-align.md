# Snap & Align Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement face-to-face flush snap — two-click flow, translate only, chained snaps, undoable with labelled history.

**Architecture:** Pure math in `snapMath.ts` (computeSnapDelta, computeFaceCorners, computeLocalFaceCenter); state machine in `useSnap.ts`; visual feedback (LineLoop highlights) in `Viewport`; sidebar button and F/Escape shortcuts wire it together through `App.tsx`.

**Tech Stack:** React 19 hooks, Three.js (math types only in snapMath), Vitest + @testing-library/react for hook tests.

**Spec:** `docs/superpowers/specs/2026-05-31-snap-align-design.md`

> **Spec correction (halfU/halfV table):** The spec's comment table for `computeFaceCorners` has halfU/halfV swapped. This plan uses a `halfExtent(axis)` helper that dynamically reads which dimension u/v align with — correct and avoids the lookup table entirely.

---

## File map

**Create:**
- `src/scene/snapMath.ts` — `computeSnapDelta`, `computeFaceCorners`, `computeLocalFaceCenter`
- `src/scene/snapMath.test.ts` — pure math tests (no mocks)
- `src/scene/useSnap.ts` — state machine hook
- `src/scene/useSnap.test.ts` — hook state machine tests

**Modify:**
- `src/scene/types.ts` — add `FaceHit` interface
- `src/scene/useScene.ts` — extend `onUpdate` with optional `historyLabel`
- `src/scene/useScene.test.ts` — add coalescing-suppression test
- `src/render/viewport.tsx` — LineLoop highlights, face detection, rAF mousemove, cursor
- `src/ui/sidebar.tsx` — Snap faces button with phase labels
- `src/App.tsx` — compose `useSnap`, F/Escape shortcuts, pass snap props

---

## Task 1: Add FaceHit type

**Files:**
- Modify: `src/scene/types.ts`

- [ ] **Step 1: Add `FaceHit` interface after the `Scene` interface**

```typescript
export interface FaceHit {
  partId: PartId
  faceNormal: Vec3      // world-space unit normal, snapped to nearest axis
  faceCenter: Vec3      // world-space face centre — used by computeSnapDelta
  localFaceNormal: Vec3 // canonical local-space normal; exactly one ±1 component, rest 0
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scene/types.ts
git commit -m "feat: add FaceHit type"
```

---

## Task 2: snapMath — computeSnapDelta

**Files:**
- Create: `src/scene/snapMath.ts`
- Create: `src/scene/snapMath.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/scene/snapMath.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeSnapDelta } from './snapMath'
import type { FaceHit } from './types'

function face(
  partId: string,
  cx: number, cy: number, cz: number,
  nx: number, ny: number, nz: number,
): FaceHit {
  return {
    partId,
    faceCenter: { x: cx, y: cy, z: cz },
    faceNormal: { x: nx, y: ny, z: nz },
    localFaceNormal: { x: nx, y: ny, z: nz },
  }
}

describe('computeSnapDelta', () => {
  // Note: computeSnapDelta is pure math — it does not apply the parallel-normal guard.
  // The guard lives in useSnap.onFaceClick.

  it('anti-parallel normals 100mm apart — source moves -100 in Z', () => {
    const src = face('a', 0, 0, 0, 0, 0, 1)
    const tgt = face('b', 0, 0, 100, 0, 0, -1)
    const d = computeSnapDelta(src, tgt)
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(0)
    expect(d.z).toBeCloseTo(-100)
  })

  it('already flush — returns zero delta', () => {
    const src = face('a', 0, 0, 25, 0, 0, 1)
    const tgt = face('b', 0, 0, 25, 0, 0, -1)
    const d = computeSnapDelta(src, tgt)
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(0)
    expect(d.z).toBeCloseTo(0)
  })

  it('past flush (overlap) — negative delta brings back', () => {
    const src = face('a', 0, 0, 10, 0, 0, 1)
    const tgt = face('b', 0, 0, 0, 0, 0, 1)
    const d = computeSnapDelta(src, tgt)
    expect(d.z).toBeCloseTo(-10)
  })

  it('lateral offset is ignored — only normal component matters', () => {
    const src = face('a', 50, 30, 0, 0, 0, 1)
    const tgt = face('b', 0, 0, 100, 0, 0, -1)
    const d = computeSnapDelta(src, tgt)
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(0)
    expect(d.z).toBeCloseTo(-100)
  })

  it('X-axis faces 75mm apart', () => {
    const src = face('a', 0, 0, 0, 1, 0, 0)
    const tgt = face('b', 75, 0, 0, -1, 0, 0)
    const d = computeSnapDelta(src, tgt)
    expect(d.x).toBeCloseTo(75)
    expect(d.y).toBeCloseTo(0)
    expect(d.z).toBeCloseTo(0)
  })

  it('parallel normals (same direction) — formula still works, guard is callers job', () => {
    const src = face('a', 0, 0, 0, 0, 0, 1)
    const tgt = face('b', 0, 0, 100, 0, 0, 1)
    const d = computeSnapDelta(src, tgt)
    expect(d.z).toBeCloseTo(100)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/scene/snapMath.test.ts
```

Expected: `Cannot find module './snapMath'`

- [ ] **Step 3: Create `src/scene/snapMath.ts` with computeSnapDelta**

```typescript
// Three.js math types run in Node/happy-dom without browser mocks needed.
import * as THREE from 'three'
import type { BoardPart, FaceHit, Part, Vec3 } from './types'

const DEG2RAD = Math.PI / 180

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

export function computeSnapDelta(sourceFace: FaceHit, targetFace: FaceHit): Vec3 {
  const gap = dot(sub(targetFace.faceCenter, sourceFace.faceCenter), targetFace.faceNormal)
  return scale(targetFace.faceNormal, gap)
}

// Analytic local face centre — OCCT places the box corner at the local origin.
// Exported for Viewport use (face center computation in raycaster hit handler).
export function computeLocalFaceCenter(localFaceNormal: Vec3, part: BoardPart): Vec3 {
  const { length, width, thickness } = part
  const { x, y, z } = localFaceNormal
  if (x === 1)  return { x: length,   y: width / 2,   z: thickness / 2 }
  if (x === -1) return { x: 0,        y: width / 2,   z: thickness / 2 }
  if (y === 1)  return { x: length / 2, y: width,     z: thickness / 2 }
  if (y === -1) return { x: length / 2, y: 0,         z: thickness / 2 }
  if (z === 1)  return { x: length / 2, y: width / 2, z: thickness     }
  return               { x: length / 2, y: width / 2, z: 0             }
}

// Determine the half-extent of a box along a given local axis.
// The spec's comment table has halfU/halfV swapped; this dynamic approach is correct.
function halfExtent(axis: THREE.Vector3, length: number, width: number, thickness: number): number {
  const ax = Math.abs(axis.x), ay = Math.abs(axis.y), az = Math.abs(axis.z)
  if (ax > ay && ax > az) return length / 2
  if (ay > ax && ay > az) return width / 2
  return thickness / 2
}

export function computeFaceCorners(face: FaceHit, part: Part): [Vec3, Vec3, Vec3, Vec3] {
  if (part.kind !== 'board') {
    throw new Error(`computeFaceCorners: unsupported kind '${part.kind}'`)
  }
  const { length, width, thickness, position, rotation, rotationOrder } = part
  const { localFaceNormal: lfn } = face

  const localCenter = computeLocalFaceCenter(lfn, part)

  const n = new THREE.Vector3(lfn.x, lfn.y, lfn.z)
  const fallback = Math.abs(lfn.x) < 0.9
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0)
  const u = new THREE.Vector3().crossVectors(n, fallback).normalize()
  const v = new THREE.Vector3().crossVectors(n, u)

  const hU = halfExtent(u, length, width, thickness)
  const hV = halfExtent(v, length, width, thickness)

  const lc = new THREE.Vector3(localCenter.x, localCenter.y, localCenter.z)
  const localCorners = [
    lc.clone().addScaledVector(u,  hU).addScaledVector(v,  hV),
    lc.clone().addScaledVector(u, -hU).addScaledVector(v,  hV),
    lc.clone().addScaledVector(u, -hU).addScaledVector(v, -hV),
    lc.clone().addScaledVector(u,  hU).addScaledVector(v, -hV),
  ]

  const euler = new THREE.Euler(
    rotation.x * DEG2RAD,
    rotation.y * DEG2RAD,
    rotation.z * DEG2RAD,
    rotationOrder,
  )
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(position.x, position.y, position.z),
    new THREE.Quaternion().setFromEuler(euler),
    new THREE.Vector3(1, 1, 1),
  )

  const [c0, c1, c2, c3] = localCorners.map((c) => {
    c.applyMatrix4(matrix)
    return { x: c.x, y: c.y, z: c.z } as Vec3
  })
  return [c0, c1, c2, c3]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/scene/snapMath.test.ts
```

Expected: all 6 computeSnapDelta tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scene/snapMath.ts src/scene/snapMath.test.ts
git commit -m "feat: add snapMath computeSnapDelta"
```

---

## Task 3: snapMath — computeFaceCorners and computeLocalFaceCenter

**Files:**
- Modify: `src/scene/snapMath.test.ts` (add tests — implementation already in snapMath.ts from Task 2)

- [ ] **Step 1: Write failing tests for computeFaceCorners**

Append to `src/scene/snapMath.test.ts`:

```typescript
import { computeFaceCorners, computeLocalFaceCenter } from './snapMath'

// Board 100mm × 50mm × 25mm at identity (position 0,0,0, rotation 0,0,0, corner at local origin)
const BOARD: BoardPart = {
  kind: 'board',
  id: 'b1',
  label: 'Board 1',
  length: 100,
  width: 50,
  thickness: 25,
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
}

function makeFace(nx: number, ny: number, nz: number): FaceHit {
  // faceCenter is irrelevant for computeFaceCorners — uses analytic derivation
  return {
    partId: 'b1',
    faceNormal: { x: nx, y: ny, z: nz },
    faceCenter: { x: 0, y: 0, z: 0 },
    localFaceNormal: { x: nx, y: ny, z: nz },
  }
}

function expectVec3(actual: Vec3, x: number, y: number, z: number, eps = 1e-6) {
  expect(actual.x).toBeCloseTo(x, 5)
  expect(actual.y).toBeCloseTo(y, 5)
  expect(actual.z).toBeCloseTo(z, 5)
}

// Cross product helper for winding-order tests (no Three.js import needed)
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}
function subV(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}
function dotV(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

import type { BoardPart } from './types'

describe('computeLocalFaceCenter', () => {
  it('face +X returns (length, width/2, thickness/2)', () => {
    const c = computeLocalFaceCenter({ x: 1, y: 0, z: 0 }, BOARD)
    expectVec3(c, 100, 25, 12.5)
  })
  it('face -X returns (0, width/2, thickness/2)', () => {
    const c = computeLocalFaceCenter({ x: -1, y: 0, z: 0 }, BOARD)
    expectVec3(c, 0, 25, 12.5)
  })
  it('face +Y returns (length/2, width, thickness/2)', () => {
    const c = computeLocalFaceCenter({ x: 0, y: 1, z: 0 }, BOARD)
    expectVec3(c, 50, 50, 12.5)
  })
  it('face -Y returns (length/2, 0, thickness/2)', () => {
    const c = computeLocalFaceCenter({ x: 0, y: -1, z: 0 }, BOARD)
    expectVec3(c, 50, 0, 12.5)
  })
  it('face +Z returns (length/2, width/2, thickness)', () => {
    const c = computeLocalFaceCenter({ x: 0, y: 0, z: 1 }, BOARD)
    expectVec3(c, 50, 25, 25)
  })
  it('face -Z returns (length/2, width/2, 0)', () => {
    const c = computeLocalFaceCenter({ x: 0, y: 0, z: -1 }, BOARD)
    expectVec3(c, 50, 25, 0)
  })
})

describe('computeFaceCorners', () => {
  it('throws for unsupported part kind', () => {
    const badPart = { ...BOARD, kind: 'cylinder' as never }
    expect(() => computeFaceCorners(makeFace(0, 0, 1), badPart)).toThrow(
      "computeFaceCorners: unsupported kind 'cylinder'",
    )
  })

  it('face +Z: returns 4 corners at Z=25 spanning full XY face', () => {
    const [c0, c1, c2, c3] = computeFaceCorners(makeFace(0, 0, 1), BOARD)
    // All corners at Z = 25
    expect(c0.z).toBeCloseTo(25)
    expect(c1.z).toBeCloseTo(25)
    expect(c2.z).toBeCloseTo(25)
    expect(c3.z).toBeCloseTo(25)
    // Corners span X=[0,100] and Y=[0,50]
    const xs = [c0.x, c1.x, c2.x, c3.x].sort((a, b) => a - b)
    const ys = [c0.y, c1.y, c2.y, c3.y].sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(0)
    expect(xs[3]).toBeCloseTo(100)
    expect(ys[0]).toBeCloseTo(0)
    expect(ys[3]).toBeCloseTo(50)
  })

  it('face +X: returns 4 corners at X=100 spanning full YZ face', () => {
    const [c0, c1, c2, c3] = computeFaceCorners(makeFace(1, 0, 0), BOARD)
    expect(c0.x).toBeCloseTo(100)
    expect(c1.x).toBeCloseTo(100)
    expect(c2.x).toBeCloseTo(100)
    expect(c3.x).toBeCloseTo(100)
    const ys = [c0.y, c1.y, c2.y, c3.y].sort((a, b) => a - b)
    const zs = [c0.z, c1.z, c2.z, c3.z].sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(0)
    expect(ys[3]).toBeCloseTo(50)
    expect(zs[0]).toBeCloseTo(0)
    expect(zs[3]).toBeCloseTo(25)
  })

  it('all 4 corners lie in the face plane (dot to normal ≈ 0)', () => {
    const normals: [number, number, number][] = [
      [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
    ]
    for (const [nx, ny, nz] of normals) {
      const fn = { x: nx, y: ny, z: nz }
      const corners = computeFaceCorners({ partId: 'b1', faceNormal: fn, faceCenter: fn, localFaceNormal: fn }, BOARD)
      const center = computeLocalFaceCenter(fn, BOARD)
      for (const corner of corners) {
        const d = dotV(subV(corner, center), fn)
        expect(Math.abs(d)).toBeLessThan(1e-4)
      }
    }
  })

  it('CCW winding: cross(c1-c0, c2-c0) points in same direction as faceNormal', () => {
    const normals: [number, number, number][] = [
      [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
    ]
    for (const [nx, ny, nz] of normals) {
      const fn = { x: nx, y: ny, z: nz }
      const [c0, c1, c2] = computeFaceCorners({ partId: 'b1', faceNormal: fn, faceCenter: fn, localFaceNormal: fn }, BOARD)
      const winding = cross(subV(c1, c0), subV(c2, c0))
      expect(dotV(winding, fn)).toBeGreaterThan(0)
    }
  })

  it('no bowtie: all 4 corners are distinct', () => {
    const normals: [number, number, number][] = [
      [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
    ]
    for (const [nx, ny, nz] of normals) {
      const fn = { x: nx, y: ny, z: nz }
      const corners = computeFaceCorners({ partId: 'b1', faceNormal: fn, faceCenter: fn, localFaceNormal: fn }, BOARD)
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const d = Math.hypot(
            corners[i].x - corners[j].x,
            corners[i].y - corners[j].y,
            corners[i].z - corners[j].z,
          )
          expect(d).toBeGreaterThan(0.01)
        }
      }
    }
  })

  it('non-zero position (10,20,30) shifts all corners by (10,20,30)', () => {
    const translated: BoardPart = {
      ...BOARD,
      position: { x: 10, y: 20, z: 30 },
    }
    const base = computeFaceCorners(makeFace(0, 0, 1), BOARD)
    const moved = computeFaceCorners(makeFace(0, 0, 1), translated)
    for (let i = 0; i < 4; i++) {
      expect(moved[i].x).toBeCloseTo(base[i].x + 10, 4)
      expect(moved[i].y).toBeCloseTo(base[i].y + 20, 4)
      expect(moved[i].z).toBeCloseTo(base[i].z + 30, 4)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/scene/snapMath.test.ts
```

Expected: computeLocalFaceCenter and computeFaceCorners tests fail (functions not exported yet — they are already defined from Task 2 but the test imports were not in the file).

Actually since the functions were written in Task 2, the tests should pass. Run to confirm:

```bash
pnpm vitest run src/scene/snapMath.test.ts
```

Expected: all tests pass. If any fail, debug the corner coordinates against the analytic derivation.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/scene/snapMath.test.ts
git commit -m "feat: add snapMath tests for computeFaceCorners and computeLocalFaceCenter"
```

---

## Task 4: Extend useScene.onUpdate with historyLabel

**Files:**
- Modify: `src/scene/useScene.ts`
- Modify: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/scene/useScene.test.ts` inside the `describe('undo/redo')` block:

```typescript
it('onUpdate with historyLabel suppresses coalescing — two undos required', () => {
  const { result } = renderHook(() => useScene())
  const id = result.current.scene.parts[0].id
  const pos0 = result.current.scene.parts[0].position.z

  act(() => {
    result.current.onUpdate(
      id,
      (p) => ({ ...p, position: { ...p.position, z: 50 } }),
      'Snap A to B',
    )
  })
  const pos1 = result.current.scene.parts[0].position.z // 50

  act(() => {
    result.current.onUpdate(
      id,
      (p) => ({ ...p, position: { ...p.position, z: 100 } }),
      'Snap A to B',
    )
  })

  // Without historyLabel these two would coalesce into one undo step.
  // With historyLabel each is a discrete entry.
  act(() => { result.current.undo() })
  expect(result.current.scene.parts[0].position.z).toBe(pos1) // intermediate

  act(() => { result.current.undo() })
  expect(result.current.scene.parts[0].position.z).toBe(pos0) // original (0)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: the new test fails — two `onUpdate` calls without `historyLabel` coalesce, so `undo()` jumps from 100 straight to 0.

- [ ] **Step 3: Update `onUpdate` in `src/scene/useScene.ts`**

Change the `onUpdate` callback (lines 341–357):

```typescript
const onUpdate = useCallback(
  (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => {
    const before = sceneRef.current.parts.find((p) => p.id === id)
    if (!before) return
    const after = updater(before)
    setScene((prev) => ({ parts: prev.parts.map((p) => (p.id === id ? after : p)) }))
    push({
      label: historyLabel ?? `Update ${after.label}`,
      coalesceKey: historyLabel !== undefined ? undefined : `update-${id}`,
      undo: () =>
        setScene((prev) => ({ parts: prev.parts.map((p) => (p.id === id ? before : p)) })),
      redo: () =>
        setScene((prev) => ({ parts: prev.parts.map((p) => (p.id === id ? after : p)) })),
    })
  },
  [push],
)
```

Also update the `UseSceneResult` interface:

```typescript
onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: all tests pass including the new coalescing-suppression test.

- [ ] **Step 5: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat: extend onUpdate with optional historyLabel to suppress coalescing"
```

---

## Task 5: useSnap hook

**Files:**
- Create: `src/scene/useSnap.ts`
- Create: `src/scene/useSnap.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/scene/useSnap.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { FaceHit, Part, PartId } from './types'

// Mock snapMath so tests don't depend on Three.js math correctness
vi.mock('./snapMath', () => ({
  computeSnapDelta: (_src: FaceHit, _tgt: FaceHit) => ({ x: 0, y: 0, z: 100 }),
  computeFaceCorners: vi.fn(),
  computeLocalFaceCenter: vi.fn(),
}))

import { useSnap } from './useSnap'

const partA: Part = {
  kind: 'board', id: 'a', label: 'Board A',
  length: 100, width: 50, thickness: 25, color: '#fff',
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ',
}
const partB: Part = {
  kind: 'board', id: 'b', label: 'Board B',
  length: 100, width: 50, thickness: 25, color: '#fff',
  position: { x: 0, y: 0, z: 200 }, rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ',
}

// Source face on A pointing +Z, target face on B pointing -Z (anti-parallel)
const faceOnA: FaceHit = {
  partId: 'a',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 50, y: 25, z: 25 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
}
const faceOnB: FaceHit = {
  partId: 'b',
  faceNormal: { x: 0, y: 0, z: -1 },
  faceCenter: { x: 50, y: 25, z: 200 },
  localFaceNormal: { x: 0, y: 0, z: -1 },
}
// Parallel-normal face on B (same direction as faceOnA)
const faceOnBParallel: FaceHit = {
  partId: 'b',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 50, y: 25, z: 225 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
}

describe('useSnap', () => {
  let onUpdate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onUpdate = vi.fn()
  })

  it('initial state: inactive, idle phase, no faces', () => {
    const { result } = renderHook(() =>
      useSnap({ parts: [partA, partB], onUpdate }),
    )
    expect(result.current.snapActive).toBe(false)
    expect(result.current.snapPhase).toBe('idle')
    expect(result.current.sourceFace).toBeNull()
    expect(result.current.hoveredFace).toBeNull()
  })

  describe('activateSnap', () => {
    it('activates snap and sets phase to idle', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      expect(result.current.snapActive).toBe(true)
      expect(result.current.snapPhase).toBe('idle')
    })

    it('toggles off when called while active (button toggle)', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.activateSnap() })
      expect(result.current.snapActive).toBe(false)
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
    })
  })

  describe('cancelSnap', () => {
    it('from idle-active: resets all four fields to initial values', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.cancelSnap() })
      expect(result.current.snapActive).toBe(false)
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
    })

    it('from source-picked: resets all four fields', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      expect(result.current.snapPhase).toBe('source-picked')
      act(() => { result.current.cancelSnap() })
      expect(result.current.snapActive).toBe(false)
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
    })
  })

  describe('onFaceHover in idle phase', () => {
    it('is a no-op — hoveredFace stays null', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceHover(faceOnA) })
      expect(result.current.hoveredFace).toBeNull()
    })
  })

  describe('onFaceClick in idle phase', () => {
    it('records source face and transitions to source-picked', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      expect(result.current.sourceFace).toEqual(faceOnA)
      expect(result.current.snapPhase).toBe('source-picked')
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('is a no-op when snap is inactive', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.onFaceClick(faceOnA) })
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.snapPhase).toBe('idle')
    })
  })

  describe('onFaceClick in source-picked phase', () => {
    it('valid target: calls onUpdate once, resets to active-idle', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceClick(faceOnB) })

      expect(onUpdate).toHaveBeenCalledTimes(1)
      expect(result.current.snapPhase).toBe('idle')
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
      expect(result.current.snapActive).toBe(true) // stays active for chaining
    })

    it('onUpdate receives correct updater: applies delta to source position', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceClick(faceOnB) })

      const [, updater] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part, string]
      const result2 = updater(partA)
      // mock computeSnapDelta returns { x:0, y:0, z:100 }
      expect(result2.position).toEqual({ x: 0, y: 0, z: 100 })
    })

    it('onUpdate receives history label "Snap Board A to Board B"', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceClick(faceOnB) })

      const [, , label] = onUpdate.mock.calls[0] as [PartId, (p: Part) => Part, string]
      expect(label).toBe('Snap Board A to Board B')
    })

    it('same-part guard: ignores click on same part as source', () => {
      const anotherFaceOnA: FaceHit = { ...faceOnA, faceNormal: { x: 0, y: 0, z: -1 }, localFaceNormal: { x: 0, y: 0, z: -1 } }
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceClick(anotherFaceOnA) })
      expect(onUpdate).not.toHaveBeenCalled()
      expect(result.current.snapPhase).toBe('source-picked')
    })

    it('parallel-normal guard: ignores click when dot(nSource, nTarget) > 0', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceClick(faceOnBParallel) })
      expect(onUpdate).not.toHaveBeenCalled()
      expect(result.current.snapPhase).toBe('source-picked')
    })
  })

  describe('onFaceHover in source-picked phase', () => {
    it('sets hoveredFace for valid target', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceHover(faceOnB) })
      expect(result.current.hoveredFace).toEqual(faceOnB)
    })

    it('same-part guard: hoveredFace stays null when hovering source part', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceHover(faceOnA) })
      expect(result.current.hoveredFace).toBeNull()
    })

    it('parallel-normal guard: hoveredFace stays null for parallel target', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceHover(faceOnBParallel) })
      expect(result.current.hoveredFace).toBeNull()
    })

    it('null hit clears hoveredFace', () => {
      const { result } = renderHook(() =>
        useSnap({ parts: [partA, partB], onUpdate }),
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      act(() => { result.current.onFaceHover(faceOnB) })
      act(() => { result.current.onFaceHover(null) })
      expect(result.current.hoveredFace).toBeNull()
    })
  })

  describe('source part deletion', () => {
    it('cancels snap when source part is removed from parts', () => {
      const { result, rerender } = renderHook(
        ({ parts }: { parts: Part[] }) => useSnap({ parts, onUpdate }),
        { initialProps: { parts: [partA, partB] } },
      )
      act(() => { result.current.activateSnap() })
      act(() => { result.current.onFaceClick(faceOnA) })
      expect(result.current.snapPhase).toBe('source-picked')

      rerender({ parts: [partB] }) // partA removed
      expect(result.current.snapActive).toBe(false)
      expect(result.current.sourceFace).toBeNull()
      expect(result.current.hoveredFace).toBeNull()
      expect(result.current.snapPhase).toBe('idle')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/scene/useSnap.test.ts
```

Expected: `Cannot find module './useSnap'`

- [ ] **Step 3: Create `src/scene/useSnap.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { FaceHit, Part, PartId, Vec3 } from './types'
import { computeSnapDelta } from './snapMath'

export interface SnapState {
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  activateSnap: () => void
  cancelSnap: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function vecLen(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

export function useSnap(params: {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void
}): SnapState {
  const { parts, onUpdate } = params

  const [snapActive, setSnapActive] = useState(false)
  const [snapPhase, setSnapPhase] = useState<'idle' | 'source-picked'>('idle')
  const [sourceFace, setSourceFace] = useState<FaceHit | null>(null)
  const [hoveredFace, setHoveredFace] = useState<FaceHit | null>(null)

  // Invariant: sourceFace !== null <=> snapPhase === 'source-picked'
  // Every path that sets one must set the other atomically.

  const cancelSnap = useCallback(() => {
    setSnapActive(false)
    setSnapPhase('idle')
    setSourceFace(null)
    setHoveredFace(null)
  }, [])

  const activateSnap = useCallback(() => {
    if (snapActive) {
      cancelSnap()
    } else {
      setSnapActive(true)
      setSnapPhase('idle')
    }
  }, [snapActive, cancelSnap])

  // Cancel if source part is deleted while snap is in progress
  useEffect(() => {
    if (sourceFace && !parts.find((p) => p.id === sourceFace.partId)) {
      cancelSnap()
    }
  }, [parts, sourceFace, cancelSnap])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      if (!snapActive) return

      if (snapPhase === 'idle') {
        setSourceFace(hit)
        setSnapPhase('source-picked')
        return
      }

      // source-picked: apply guards then snap
      if (hit.partId === sourceFace!.partId) return
      if (dot(sourceFace!.faceNormal, hit.faceNormal) > 0) return

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

      setSourceFace(null)
      setSnapPhase('idle')
      // snapActive stays true — chained snaps
    },
    [snapActive, snapPhase, sourceFace, parts, onUpdate],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      if (!snapActive) { setHoveredFace(null); return }
      if (snapPhase === 'idle') { setHoveredFace(null); return }
      if (hit?.partId === sourceFace?.partId) { setHoveredFace(null); return }
      if (hit && dot(sourceFace!.faceNormal, hit.faceNormal) > 0) { setHoveredFace(null); return }
      setHoveredFace(hit)
    },
    [snapActive, snapPhase, sourceFace],
  )

  return { snapActive, snapPhase, sourceFace, hoveredFace, activateSnap, cancelSnap, onFaceClick, onFaceHover }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/scene/useSnap.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add src/scene/useSnap.ts src/scene/useSnap.test.ts
git commit -m "feat: add useSnap state machine hook"
```

---

## Task 6: Viewport — LineLoop highlights

**Files:**
- Modify: `src/render/viewport.tsx`

This task adds the highlight infrastructure (new props, LineLoop refs, highlight effect) but does not yet add face detection or rAF mousemove — those come in Task 7.

- [ ] **Step 1: Add snap imports to viewport.tsx**

At the top of `src/render/viewport.tsx`, add to the existing imports:

```typescript
import type { FaceHit } from '../scene/types'
import { computeFaceCorners, computeLocalFaceCenter } from '../scene/snapMath'
```

- [ ] **Step 2: Update ViewportProps and add snap refs**

Replace the existing `ViewportProps` interface:

```typescript
interface ViewportProps {
  parts: Part[]
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
  cameraStateRef: { current: CameraState }
  loadedCamera: CameraState | null
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}
```

Update the destructuring in the `Viewport` function signature to match:

```typescript
export function Viewport({
  parts,
  geometries,
  selectedId,
  onPartClick,
  cameraStateRef,
  loadedCamera,
  snapActive,
  snapPhase: _snapPhase,
  sourceFace,
  hoveredFace,
  onFaceClick,
  onFaceHover,
}: ViewportProps) {
```

(`_snapPhase` is unused in Viewport — only the sidebar needs the phase for label text.)

- [ ] **Step 3: Add refs for snap and update layout effect syncs**

Add after the existing `const onClickRef = useRef(onPartClick)` line:

```typescript
const partsRef = useRef<Part[]>(parts)
const snapActiveRef = useRef(snapActive)
const onFaceClickRef = useRef(onFaceClick)
const onFaceHoverRef = useRef(onFaceHover)
const sourceHighlightRef = useRef<THREE.LineLoop | null>(null)
const hoverHighlightRef = useRef<THREE.LineLoop | null>(null)
const rafIdRef = useRef<number>(0)
const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
```

Replace the existing layout-effect ref sync:

```typescript
useLayoutEffect(() => {
  onClickRef.current = onPartClick
  partsRef.current = parts
  snapActiveRef.current = snapActive
  onFaceClickRef.current = onFaceClick
  onFaceHoverRef.current = onFaceHover
})
```

- [ ] **Step 4: Create LineLoops in scene-setup effect**

Inside the scene-setup `useEffect`, after `scene.add(grid)` and before the stats setup, add:

```typescript
// Snap face highlight LineLoops
const snapMat = (color: number) =>
  new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, linewidth: 1 })
const emptyGeo = () => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3))
  return g
}
const sourceLoop = new THREE.LineLoop(emptyGeo(), snapMat(0xfbbf24))
const hoverLoop = new THREE.LineLoop(emptyGeo(), snapMat(0x60a5fa))
sourceLoop.renderOrder = 1
hoverLoop.renderOrder = 1
sourceLoop.visible = false
hoverLoop.visible = false
scene.add(sourceLoop)
scene.add(hoverLoop)
sourceHighlightRef.current = sourceLoop
hoverHighlightRef.current = hoverLoop
```

Add to the scene-setup cleanup (inside the `return () => {` block):

```typescript
sourceHighlightRef.current?.geometry.dispose()
hoverHighlightRef.current?.geometry.dispose()
scene.remove(sourceLoop)
scene.remove(hoverLoop)
sourceLoop.material.dispose()
hoverLoop.material.dispose()
```

- [ ] **Step 5: Add highlight update effect**

Add a new `useEffect` after the mesh-management effect:

```typescript
// Snap highlight update — rebuilds LineLoop geometry when faces change
useEffect(() => {
  function updateHighlight(
    loop: THREE.LineLoop | null,
    face: FaceHit | null,
    color: number,
  ) {
    if (!loop) return
    if (face === null) {
      loop.visible = false
      return
    }
    const part = parts.find((p) => p.id === face.partId)
    if (!part || part.kind !== 'board') {
      loop.visible = false
      return
    }
    const corners = computeFaceCorners(face, part)
    const OFFSET = 1.0
    const pos = new Float32Array(4 * 3)
    corners.forEach((c, i) => {
      pos[i * 3]     = c.x + face.faceNormal.x * OFFSET
      pos[i * 3 + 1] = c.y + face.faceNormal.y * OFFSET
      pos[i * 3 + 2] = c.z + face.faceNormal.z * OFFSET
    })
    loop.geometry.dispose()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    loop.geometry = geo
    ;(loop.material as THREE.LineBasicMaterial).color.setHex(color)
    loop.visible = true
  }

  updateHighlight(sourceHighlightRef.current, snapActive ? sourceFace : null, 0xfbbf24)
  updateHighlight(hoverHighlightRef.current, snapActive ? hoveredFace : null, 0x60a5fa)
}, [snapActive, sourceFace, hoveredFace, parts])
```

- [ ] **Step 6: Add cursor effect**

Add after the highlight effect:

```typescript
useEffect(() => {
  const mount = mountRef.current
  if (!mount) return
  mount.style.cursor = snapActive ? 'crosshair' : ''
  return () => {
    mount.style.cursor = ''
  }
}, [snapActive])
```

- [ ] **Step 7: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors (snap props are added but not yet wired in App.tsx — TypeScript will flag missing props there, which is expected at this stage).

- [ ] **Step 8: Commit**

```bash
git add src/render/viewport.tsx
git commit -m "feat: add Viewport LineLoop highlights and snap props"
```

---

## Task 7: Viewport — face detection and rAF mousemove

**Files:**
- Modify: `src/render/viewport.tsx`

- [ ] **Step 1: Add face hit detection helper**

Add this function inside the `Viewport` component body (before the scene-setup `useEffect`, after the ref declarations). It is defined inside the component so it closes over nothing — all state comes from its arguments:

```typescript
function buildFaceHit(
  intersection: THREE.Intersection,
  meshMap: Map<PartId, THREE.Mesh>,
  currentParts: Part[],
): FaceHit | null {
  const mesh = intersection.object as THREE.Mesh
  let partId: PartId | null = null
  for (const [id, m] of meshMap) {
    if (m === mesh) { partId = id; break }
  }
  if (!partId || !intersection.face) return null

  const part = currentParts.find((p) => p.id === partId)
  if (!part || part.kind !== 'board') return null

  // Snap hit normal to nearest axis in local space
  const ln = intersection.face.normal
  const ax = Math.abs(ln.x), ay = Math.abs(ln.y), az = Math.abs(ln.z)
  let lx = 0, ly = 0, lz = 0
  if (ax >= ay && ax >= az) lx = Math.sign(ln.x)
  else if (ay >= ax && ay >= az) ly = Math.sign(ln.y)
  else lz = Math.sign(ln.z)
  const localFaceNormal = { x: lx, y: ly, z: lz }

  // Transform local normal to world space and snap again
  const wn = new THREE.Vector3(lx, ly, lz).transformDirection(mesh.matrixWorld)
  const wx = Math.abs(wn.x), wy = Math.abs(wn.y), wz = Math.abs(wn.z)
  let fnx = 0, fny = 0, fnz = 0
  if (wx >= wy && wx >= wz) fnx = Math.sign(wn.x)
  else if (wy >= wx && wy >= wz) fny = Math.sign(wn.y)
  else fnz = Math.sign(wn.z)
  const faceNormal = { x: fnx, y: fny, z: fnz }

  // Analytic face centre (no geometry vertex iteration)
  const lc = computeLocalFaceCenter(localFaceNormal, part)
  const wc = new THREE.Vector3(lc.x, lc.y, lc.z).applyMatrix4(mesh.matrixWorld)
  const faceCenter = { x: wc.x, y: wc.y, z: wc.z }

  return { partId, faceNormal, faceCenter, localFaceNormal }
}
```

- [ ] **Step 2: Add rAF mousemove listener and update click handler in scene-setup effect**

Inside the scene-setup `useEffect`, after `renderer.domElement.addEventListener('click', handleClick)`, add:

```typescript
const handleMouseMove = (e: MouseEvent) => {
  lastMouseRef.current = { x: e.clientX, y: e.clientY }
  cancelAnimationFrame(rafIdRef.current)
  rafIdRef.current = requestAnimationFrame(() => {
    if (!snapActiveRef.current) return
    const { x, y } = lastMouseRef.current
    const rect = renderer.domElement.getBoundingClientRect()
    const nx = ((x - rect.left) / rect.width) * 2 - 1
    const ny = -((y - rect.top) / rect.height) * 2 + 1
    raycaster.current.setFromCamera(new THREE.Vector2(nx, ny), camera)
    const hits = raycaster.current.intersectObjects(Array.from(meshes.current.values()), false)
    if (hits.length > 0) {
      const hit = buildFaceHit(hits[0], meshes.current, partsRef.current)
      onFaceHoverRef.current(hit)
    } else {
      onFaceHoverRef.current(null)
    }
  })
}
renderer.domElement.addEventListener('mousemove', handleMouseMove)
```

Replace the existing `handleClick` function with a routing version:

```typescript
const handleClick = (e: MouseEvent) => {
  if (!mouseDown.current) return
  if (Math.hypot(e.clientX - mouseDown.current.x, e.clientY - mouseDown.current.y) > 4) return
  const rect = renderer.domElement.getBoundingClientRect()
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.current.setFromCamera(new THREE.Vector2(nx, ny), camera)
  const hits = raycaster.current.intersectObjects(Array.from(meshes.current.values()), false)

  if (snapActiveRef.current) {
    // Snap mode: route to onFaceClick; ignore miss (don't deselect)
    if (hits.length > 0) {
      const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current)
      if (faceHit) onFaceClickRef.current(faceHit)
    }
  } else {
    // Normal mode: route to onPartClick
    if (hits.length > 0) {
      const hit = hits[0].object as THREE.Mesh
      for (const [id, m] of meshes.current) {
        if (m === hit) {
          onClickRef.current(id)
          return
        }
      }
    }
    onClickRef.current(null)
  }
}
```

Add to the scene-setup cleanup:

```typescript
renderer.domElement.removeEventListener('mousemove', handleMouseMove)
cancelAnimationFrame(rafIdRef.current)
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: errors only for missing snap props in App.tsx (not yet updated). No errors in viewport.tsx itself.

- [ ] **Step 4: Commit**

```bash
git add src/render/viewport.tsx
git commit -m "feat: add Viewport face detection and rAF mousemove for snap"
```

---

## Task 8: Sidebar — Snap button

**Files:**
- Modify: `src/ui/sidebar.tsx`

- [ ] **Step 1: Add snap props to SidebarProps**

In `src/ui/sidebar.tsx`, extend the `SidebarProps` interface:

```typescript
interface SidebarProps {
  scene: Scene
  occtReady: boolean
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  nextLabel: string
  onAdd: () => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part) => void
  selectedId: PartId | null
  onSelect: (id: PartId | null) => void
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  onSnapToggle: () => void
}
```

Update the `Sidebar` function destructuring to include the new props:

```typescript
export function Sidebar({
  scene,
  occtReady,
  errors,
  pendingIds,
  nextLabel,
  onAdd,
  onRemove,
  onDuplicate,
  onUpdate,
  selectedId,
  onSelect,
  snapActive,
  snapPhase,
  onSnapToggle,
}: SidebarProps) {
```

- [ ] **Step 2: Add the Snap button above the parts list**

In the `Sidebar` return, wrap the existing `<div style={{ flex: 1, overflowY: 'auto' }}>` with a container and add the button before it. Replace:

```typescript
return (
  <div
    style={{
      width: 240,
      height: '100%',
      background: '#1a1a1d',
      borderLeft: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}
  >
    <div style={{ flex: 1, overflowY: 'auto' }}>
```

With:

```typescript
return (
  <div
    style={{
      width: 240,
      height: '100%',
      background: '#1a1a1d',
      borderLeft: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}
  >
    <div style={{ padding: '8px 8px 0' }}>
      <button
        onClick={onSnapToggle}
        style={{
          width: '100%',
          padding: '7px 0',
          background: snapActive ? '#2a4a2a' : '#222',
          color: snapActive ? '#6bcb6b' : '#888',
          border: `1px solid ${snapActive ? '#3a6a3a' : '#333'}`,
          borderRadius: 3,
          cursor: 'pointer',
          fontSize: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          lineHeight: 1.3,
        }}
      >
        <span>{snapActive ? 'Snapping' : 'Snap faces'}</span>
        {snapActive && (
          <span style={{ fontSize: 10, color: '#aaa' }}>
            {snapPhase === 'idle'
              ? 'Click a face · Esc to cancel'
              : 'Click target face · Esc to cancel'}
          </span>
        )}
      </button>
    </div>
    <div style={{ flex: 1, overflowY: 'auto' }}>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: errors only in App.tsx (snapActive/snapPhase/onSnapToggle not yet passed).

- [ ] **Step 4: Commit**

```bash
git add src/ui/sidebar.tsx
git commit -m "feat: add Snap faces button to sidebar"
```

---

## Task 9: Wire everything in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import useSnap**

Add to the imports in `src/App.tsx`:

```typescript
import { useSnap } from './scene/useSnap'
```

- [ ] **Step 2: Call useSnap after useScene**

Add after the `useScene()` destructuring:

```typescript
const { snapActive, snapPhase, sourceFace, hoveredFace, activateSnap, cancelSnap, onFaceClick, onFaceHover } =
  useSnap({ parts: scene.parts, onUpdate })
```

- [ ] **Step 3: Add F and Escape to the keyboard handler**

The existing handler guards with `if (!mod) return` partway through. Add the non-mod shortcuts BEFORE that guard. Update the keyboard `useEffect`:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const mod = e.metaKey || e.ctrlKey

    // Non-modifier shortcuts
    if (!mod) {
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault()
        activateSnap()
        return
      }
      if (e.key === 'Escape' && snapActive) {
        e.preventDefault()
        cancelSnap()
        return
      }
      return
    }

    // Modifier shortcuts
    const k = e.key.toLowerCase()
    if (!e.shiftKey && k === 's') {
      e.preventDefault()
      void saveFile()
    }
    if (e.shiftKey && k === 's') {
      e.preventDefault()
      void saveAsFile()
    }
    if (!e.shiftKey && k === 'o') {
      e.preventDefault()
      void openFile()
    }
    if (!e.shiftKey && k === 'n') {
      e.preventDefault()
      void newFile()
    }
    if (!e.shiftKey && k === 'z') {
      e.preventDefault()
      undo()
    }
    if ((e.shiftKey && k === 'z') || (k === 'y' && !e.shiftKey)) {
      e.preventDefault()
      redo()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [saveFile, saveAsFile, openFile, newFile, undo, redo, activateSnap, cancelSnap, snapActive])
```

- [ ] **Step 4: Pass snap props to Viewport and Sidebar**

Update the `<Viewport>` JSX:

```tsx
<Viewport
  parts={scene.parts}
  geometries={geometries}
  selectedId={selectedId}
  onPartClick={onSelect}
  cameraStateRef={cameraStateRef}
  loadedCamera={loadedCamera}
  snapActive={snapActive}
  snapPhase={snapPhase}
  sourceFace={sourceFace}
  hoveredFace={hoveredFace}
  onFaceClick={onFaceClick}
  onFaceHover={onFaceHover}
/>
```

Update the `<Sidebar>` JSX:

```tsx
<Sidebar
  scene={scene}
  occtReady={occtReady}
  errors={errors}
  pendingIds={pendingIds}
  nextLabel={nextLabel}
  onAdd={onAdd}
  onRemove={onRemove}
  onDuplicate={onDuplicate}
  onUpdate={onUpdate}
  selectedId={selectedId}
  onSelect={onSelect}
  snapActive={snapActive}
  snapPhase={snapPhase}
  onSnapToggle={activateSnap}
/>
```

- [ ] **Step 5: Full check**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all pass. If lint complains about the unused `_snapPhase` destructure in Viewport, rename to `snapPhase: _snapPhase` or remove the underscore prefix depending on the lint rule.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire snap & align — useSnap, F/Escape shortcuts, Viewport and Sidebar props"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| FaceHit type | Task 1 |
| computeSnapDelta | Task 2 |
| computeFaceCorners + computeLocalFaceCenter | Task 3 |
| useScene.onUpdate historyLabel | Task 4 |
| useSnap state machine + all guards | Task 5 |
| ViewportProps, LineLoops, highlight effect, cursor | Task 6 |
| Face detection, rAF mousemove, click routing | Task 7 |
| Sidebar Snap button + phase labels | Task 8 |
| App.tsx composition + F/Escape | Task 9 |
| Parallel-normal guard (dot > 0, perpendicular allowed) | Task 5 (onFaceClick, onFaceHover) |
| Source part deletion cancels snap | Task 5 (useEffect) |
| Chained snaps (stays active) | Task 5 |
| coalesceKey suppression test | Task 4 |
| snapActiveRef stale-closure safety | Task 6 |
| rAF cancelAnimationFrame on cleanup | Task 7 |
| geometry.dispose() before reassignment | Task 6 |
| depthTest: false + renderOrder on LineLoops | Task 6 |
| Spec correction (halfU/halfV → dynamic halfExtent) | Task 2/3 |

**Placeholder scan:** No TBDs, TODOs, or "similar to above" patterns. All code blocks are complete.

**Type consistency:**
- `FaceHit` defined Task 1, used identically in Tasks 2–9.
- `computeSnapDelta`, `computeFaceCorners`, `computeLocalFaceCenter` defined in Task 2/3, imported in Tasks 5, 6, 7 by exact name.
- `SnapState` interface defined in `useSnap.ts` Task 5, destructured in App.tsx Task 9 by matching field names.
- `onUpdate(id, updater, historyLabel?)` — optional `historyLabel` in useScene (Task 4); `useSnap` always passes it (Task 5). Compatible.
- `ViewportProps` extended Task 6, all new props passed in App.tsx Task 9.
- `SidebarProps` extended Task 8, all new props passed in App.tsx Task 9.
