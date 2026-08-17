# Joinery Cuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-destructive rectangular Boolean cuts (dado, rabbet, half-lap, mortise & tenon) to board parts, stored as `CutDef[]` on `BoardPart`, rebuilt via OCCT Boolean subtraction, with click-to-place UX and full sidebar editing.

**Architecture:** `CutDef[]` stored on `BoardPart`; `shapeKey` encodes cut geometry; OCCT worker chains `BRepAlgoAPI_Cut` per rebuild from scratch. `useAddCut` is a new hook that handles click-to-place state. Viewport routes: cut mode → snap mode → normal select. `useScene` gains `onUpdateCut`, `onRemoveCut`, `onLinkCuts`, `onUnlinkCuts`.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react, OpenCASCADE.js (WASM via Comlink worker), Three.js

**Spec:** `docs/superpowers/specs/2026-05-31-joinery-cuts-design.md`

---

## File map

| File | Action |
|---|---|
| `src/scene/types.ts` | Add `CutId`, `CutDef`, extend `BoardPart.cuts` and `FaceHit.localHitPoint` |
| `src/scene/snapMath.ts` | Add `faceAxes`, `defaultCutSize` exports |
| `src/scene/snapMath.test.ts` | Tests for new exports; fix FaceHit/BoardPart construction sites |
| `src/scene/utils.ts` | Extend `shapeKey` to serialise cuts |
| `src/scene/utils.test.ts` | Update existing tests; add cut-specific tests |
| `src/geom/occt.ts` | Add `makeCut` primitive |
| `src/geom/occt.test.ts` | Add smoke tests for `makeCut` |
| `src/geom/occt.worker.ts` | Extend `buildPart` dims with `cuts`; chain Boolean subtracts |
| `src/scene/useScene.ts` | Add `onUpdateCut`, `onRemoveCut`, `onLinkCuts`, `onUnlinkCuts`; update `buildPart` call; import `faceAxes` |
| `src/scene/useScene.test.ts` | Tests for all four new operations; fix BoardPart construction sites |
| `src/scene/useFile.ts` | Default `cuts: []` in `parseFile` |
| `src/scene/useFile.test.ts` | Test migration (file without cuts field) |
| `src/scene/useAddCut.ts` | New hook — cut placement state machine |
| `src/scene/useAddCut.test.ts` | New test file |
| `src/render/viewport.tsx` | `localHitPoint` in `buildFaceHit`; cut mode routing in click/hover |
| `src/ui/sidebar.tsx` | Widen `onUpdate`; add `CutRow`, Cuts section, new props |
| `src/ui/sidebar.test.tsx` | Update `props()` helper; add Cuts section tests |
| `src/App.tsx` | Compose `useAddCut`; mutual exclusion; `C` key; fix `onSnapToggle` |
| `src/scene/useSnap.test.ts` | Fix FaceHit/BoardPart construction sites |

---

## Task 1: Types + all construction sites

**Files:**
- Modify: `src/scene/types.ts`
- Modify: `src/render/viewport.tsx:63-112`
- Modify: `src/scene/snapMath.test.ts:6-19, 22-34, 36-43, 199, 220, 243`
- Modify: `src/scene/useSnap.test.ts:14-37, 40-58`
- Modify: `src/scene/useScene.ts:48-61, 244-256`
- Modify: `src/scene/useScene.test.ts:141-154`
- Modify: `src/scene/utils.test.ts:5-16`
- Modify: `src/ui/sidebar.test.tsx:6-20`

No new tests — this task is typecheck-driven.

- [ ] **Step 1: Add new types to `src/scene/types.ts`**

Replace the entire file with:

```typescript
export type PartId = string
export type CutId = string

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface CutDef {
  id: CutId
  label: string
  face: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'
  position: Vec3
  size: Vec3
  pairedCutId?: string  // "{partId}:{cutId}"
}

export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number
  width: number
  thickness: number
  color: string
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  cuts: CutDef[]
}

export type Part = BoardPart

export interface Scene {
  parts: Part[]
}

export interface FaceHit {
  partId: PartId
  faceNormal: Vec3
  faceCenter: Vec3
  localFaceNormal: Vec3
  localHitPoint: Vec3
}

export interface CameraState {
  position: Vec3
  target: Vec3
}

export interface ZimmuFile {
  version: number
  name: string
  appVersion: string
  units: 'mm'
  createdAt: string
  updatedAt: string
  camera: CameraState
  scene: Scene
}
```

- [ ] **Step 2: Run typecheck — expect errors listing all construction sites**

```bash
pnpm typecheck 2>&1 | head -60
```

Expected: ~17 errors about missing `localHitPoint` on FaceHit objects and missing `cuts` on BoardPart objects.

- [ ] **Step 3: Fix `src/render/viewport.tsx:112` — add `localHitPoint` to `buildFaceHit` return**

Replace the final `return` in `buildFaceHit` (currently line 112):

```typescript
// old
return { partId, faceNormal, faceCenter, localFaceNormal }
```

```typescript
// new
const lhp = intersection.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert())
const localHitPoint = { x: lhp.x, y: lhp.y, z: lhp.z }
return { partId, faceNormal, faceCenter, localFaceNormal, localHitPoint }
```

- [ ] **Step 4: Fix `src/scene/snapMath.test.ts` — FaceHit and BoardPart construction sites**

In the `face()` helper (lines 6–19), add `localHitPoint`:

```typescript
function face(
  partId: string,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number,
): FaceHit {
  return {
    partId,
    faceCenter: { x: cx, y: cy, z: cz },
    faceNormal: { x: nx, y: ny, z: nz },
    localFaceNormal: { x: nx, y: ny, z: nz },
    localHitPoint: { x: 0, y: 0, z: 0 },
  }
}
```

In the `BOARD` constant (lines 22–34), add `cuts: []`:

```typescript
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
  cuts: [],
}
```

In the `makeFace()` helper (lines 36–43), add `localHitPoint`:

```typescript
function makeFace(nx: number, ny: number, nz: number): FaceHit {
  return {
    partId: 'b1',
    faceNormal: { x: nx, y: ny, z: nz },
    faceCenter: { x: 0, y: 0, z: 0 },
    localFaceNormal: { x: nx, y: ny, z: nz },
    localHitPoint: { x: 0, y: 0, z: 0 },
  }
}
```

In the three `computeFaceCorners` describe blocks, each inline FaceHit literal needs `localHitPoint`. These are at approximately lines 199, 220, 243. Each looks like:

```typescript
{ partId: 'b1', faceNormal: fn, faceCenter: fn, localFaceNormal: fn }
```

Change each to:

```typescript
{ partId: 'b1', faceNormal: fn, faceCenter: fn, localFaceNormal: fn, localHitPoint: { x: 0, y: 0, z: 0 } }
```

- [ ] **Step 5: Fix `src/scene/useSnap.test.ts` — FaceHit and Part construction sites**

Add `cuts: []` to `partA` and `partB` (lines 14–37):

```typescript
const partA: Part = {
  kind: 'board',
  id: 'a',
  label: 'Board A',
  length: 100,
  width: 50,
  thickness: 25,
  color: '#fff',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
}
const partB: Part = {
  kind: 'board',
  id: 'b',
  label: 'Board B',
  length: 100,
  width: 50,
  thickness: 25,
  color: '#fff',
  position: { x: 0, y: 0, z: 200 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
}
```

Add `localHitPoint: { x: 0, y: 0, z: 0 }` to `faceOnA`, `faceOnB`, `faceOnBParallel` (lines 40–58):

```typescript
const faceOnA: FaceHit = {
  partId: 'a',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 50, y: 25, z: 25 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
}
const faceOnB: FaceHit = {
  partId: 'b',
  faceNormal: { x: 0, y: 0, z: -1 },
  faceCenter: { x: 50, y: 25, z: 200 },
  localFaceNormal: { x: 0, y: 0, z: -1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
}
const faceOnBParallel: FaceHit = {
  partId: 'b',
  faceNormal: { x: 0, y: 0, z: 1 },
  faceCenter: { x: 50, y: 25, z: 225 },
  localFaceNormal: { x: 0, y: 0, z: 1 },
  localHitPoint: { x: 0, y: 0, z: 0 },
}
```

- [ ] **Step 6: Fix `src/scene/useScene.ts` — add `cuts: []` to `makeDefaultBoard` and `onAdd`**

In `makeDefaultBoard()` (lines 48–61), add `cuts: []`:

```typescript
function makeDefaultBoard(): BoardPart {
  return {
    kind: 'board',
    id: `board_${crypto.randomUUID()}`,
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
    color: PART_COLORS[0],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
  }
}
```

In `onAdd` (lines 244–256), add `cuts: []` to the `part` object:

```typescript
const part: BoardPart = {
  kind: 'board',
  id,
  label,
  length: 200,
  width: 100,
  thickness: 25,
  color: PART_COLORS[colorIndex.current % PART_COLORS.length],
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
}
```

- [ ] **Step 7: Fix `src/scene/useScene.test.ts` — add `cuts: []` to replacement parts object (lines 141–154)**

```typescript
const replacement = {
  parts: [
    {
      kind: 'board' as const,
      id: 'board_test',
      label: 'Board 5',
      length: 300,
      width: 150,
      thickness: 30,
      color: '#d4a373',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ' as const,
      cuts: [],
    },
  ],
}
```

- [ ] **Step 8: Fix `src/scene/utils.test.ts` — add `cuts: []` to `board` fixture (lines 5–16)**

```typescript
const board: BoardPart = {
  kind: 'board',
  id: 'board_test',
  label: 'Test',
  length: 200,
  width: 100,
  thickness: 25,
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
}
```

- [ ] **Step 9: Fix `src/ui/sidebar.test.tsx` — add `cuts: []` to `makeBoard()` helper (lines 6–20)**

```typescript
function makeBoard(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'board_t1',
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
    color: '#d4a373',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    ...overrides,
  }
}
```

- [ ] **Step 10: Run typecheck and tests — expect clean**

```bash
pnpm typecheck && pnpm test
```

Expected: 0 typecheck errors, all existing tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/scene/types.ts src/render/viewport.tsx src/scene/snapMath.test.ts \
  src/scene/useSnap.test.ts src/scene/useScene.ts src/scene/useScene.test.ts \
  src/scene/utils.test.ts src/ui/sidebar.test.tsx
git commit -m "feat: add CutId/CutDef types, extend BoardPart and FaceHit"
```

---

## Task 2: snapMath utilities — `faceAxes` and `defaultCutSize`

**Files:**
- Modify: `src/scene/snapMath.ts`
- Modify: `src/scene/snapMath.test.ts`

- [ ] **Step 1: Write failing tests in `src/scene/snapMath.test.ts`**

Add a new `import` at the top (after the existing imports):

```typescript
import { computeSnapDelta, computeFaceCorners, computeLocalFaceCenter, faceAxes, defaultCutSize } from './snapMath'
import type { BoardPart, CutDef, FaceHit, Vec3 } from './types'
```

Add these two new `describe` blocks at the end of the file:

```typescript
describe('faceAxes', () => {
  it('+X: depth=x, u=y, v=z', () => {
    const a = faceAxes('+X')
    expect(a.depth).toBe('x')
    expect(a.u).toBe('y')
    expect(a.v).toBe('z')
  })
  it('-X: depth=x, u=y, v=z', () => {
    const a = faceAxes('-X')
    expect(a.depth).toBe('x')
    expect(a.u).toBe('y')
    expect(a.v).toBe('z')
  })
  it('+Y: depth=y, u=x, v=z', () => {
    const a = faceAxes('+Y')
    expect(a.depth).toBe('y')
    expect(a.u).toBe('x')
    expect(a.v).toBe('z')
  })
  it('-Y: depth=y, u=x, v=z', () => {
    const a = faceAxes('-Y')
    expect(a.depth).toBe('y')
    expect(a.u).toBe('x')
    expect(a.v).toBe('z')
  })
  it('+Z: depth=z, u=x, v=y', () => {
    const a = faceAxes('+Z')
    expect(a.depth).toBe('z')
    expect(a.u).toBe('x')
    expect(a.v).toBe('y')
  })
  it('-Z: depth=z, u=x, v=y', () => {
    const a = faceAxes('-Z')
    expect(a.depth).toBe('z')
    expect(a.u).toBe('x')
    expect(a.v).toBe('y')
  })
})

describe('defaultCutSize', () => {
  it('+X/-X: depth axis (x) = 10, u/v = 20', () => {
    const s = defaultCutSize('+X')
    expect(s.x).toBe(10)
    expect(s.y).toBe(20)
    expect(s.z).toBe(20)
    expect(defaultCutSize('-X')).toEqual(s)
  })
  it('+Y/-Y: depth axis (y) = 10, u/v = 20', () => {
    const s = defaultCutSize('+Y')
    expect(s.x).toBe(20)
    expect(s.y).toBe(10)
    expect(s.z).toBe(20)
    expect(defaultCutSize('-Y')).toEqual(s)
  })
  it('+Z/-Z: depth axis (z) = 10, u/v = 20', () => {
    const s = defaultCutSize('+Z')
    expect(s.x).toBe(20)
    expect(s.y).toBe(20)
    expect(s.z).toBe(10)
    expect(defaultCutSize('-Z')).toEqual(s)
  })
  it('depth axis matches faceAxes().depth for all faces', () => {
    const faces: CutDef['face'][] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']
    for (const f of faces) {
      const axes = faceAxes(f)
      const size = defaultCutSize(f)
      expect(size[axes.depth]).toBe(10)
      expect(size[axes.u]).toBe(20)
      expect(size[axes.v]).toBe(20)
    }
  })
})
```

- [ ] **Step 2: Run tests — expect failures on the new tests**

```bash
pnpm vitest run src/scene/snapMath.test.ts
```

Expected: FAIL — `faceAxes is not a function`, `defaultCutSize is not a function`.

- [ ] **Step 3: Add `faceAxes` and `defaultCutSize` to `src/scene/snapMath.ts`**

Add at the top of the file (after existing imports), a `FaceAxis` type, then the two exported functions. Add them before `computeSnapDelta`:

```typescript
import type { BoardPart, CutDef, FaceHit, Part, Vec3 } from './types'

type FaceAxis = 'x' | 'y' | 'z'

export function faceAxes(face: CutDef['face']): { depth: FaceAxis; u: FaceAxis; v: FaceAxis } {
  if (face === '+X' || face === '-X') return { depth: 'x', u: 'y', v: 'z' }
  if (face === '+Y' || face === '-Y') return { depth: 'y', u: 'x', v: 'z' }
  return { depth: 'z', u: 'x', v: 'y' }
}

export function defaultCutSize(face: CutDef['face']): Vec3 {
  if (face === '+X' || face === '-X') return { x: 10, y: 20, z: 20 }
  if (face === '+Y' || face === '-Y') return { x: 20, y: 10, z: 20 }
  return { x: 20, y: 20, z: 10 }
}
```

(The existing import line `import type { BoardPart, FaceHit, Part, Vec3 } from './types'` must be extended to include `CutDef`.)

- [ ] **Step 4: Run tests — expect all pass**

```bash
pnpm vitest run src/scene/snapMath.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/snapMath.ts src/scene/snapMath.test.ts
git commit -m "feat: add faceAxes and defaultCutSize to snapMath"
```

---

## Task 3: `shapeKey` extension

**Files:**
- Modify: `src/scene/utils.ts`
- Modify: `src/scene/utils.test.ts`

- [ ] **Step 1: Update existing tests and add new ones in `src/scene/utils.test.ts`**

Add `CutDef` import:

```typescript
import type { BoardPart, CutDef } from './types'
```

Update the "encodes kind and dimensions" test (the key format now has a trailing `|` with an empty cuts segment):

```typescript
it('encodes kind and dimensions', () => {
  expect(shapeKey(board)).toBe('board|200|100|25|')
})
```

Update all tests that compare against the bare key — the no-cuts board returns `'board|200|100|25|'` everywhere. The relative-change tests (`.not.toBe(shapeKey(board))`) remain valid as-is.

Add new tests at the end of the `describe` block:

```typescript
it('no cuts — trailing pipe, empty segment', () => {
  expect(shapeKey(board)).toBe('board|200|100|25|')
})

it('one cut — encodes position and size', () => {
  const boardWithCut: BoardPart = {
    ...board,
    cuts: [{
      id: 'cut_a',
      label: 'Cut 1',
      face: '+Z',
      position: { x: 90, y: 40, z: 15 },
      size: { x: 20, y: 20, z: 10 },
    }],
  }
  expect(shapeKey(boardWithCut)).toBe('board|200|100|25|90,40,15|20,20,10')
})

it('two cuts — sorted by id regardless of insertion order', () => {
  const cutA: CutDef = { id: 'aaa', label: 'A', face: '+Z', position: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 10, z: 10 } }
  const cutB: CutDef = { id: 'bbb', label: 'B', face: '+X', position: { x: 1, y: 1, z: 1 }, size: { x: 5, y: 5, z: 5 } }
  const order1: BoardPart = { ...board, cuts: [cutA, cutB] }
  const order2: BoardPart = { ...board, cuts: [cutB, cutA] }
  expect(shapeKey(order1)).toBe(shapeKey(order2))
})

it('excludes face and label — geometry only', () => {
  const cutFaceA: CutDef = { id: 'cut_1', label: 'Dado', face: '+Z', position: { x: 0, y: 0, z: 0 }, size: { x: 20, y: 20, z: 10 } }
  const cutFaceB: CutDef = { id: 'cut_1', label: 'Other', face: '-X', position: { x: 0, y: 0, z: 0 }, size: { x: 20, y: 20, z: 10 } }
  expect(shapeKey({ ...board, cuts: [cutFaceA] })).toBe(shapeKey({ ...board, cuts: [cutFaceB] }))
})

it('changes when cut position changes', () => {
  const base: BoardPart = { ...board, cuts: [{ id: 'c1', label: 'C', face: '+Z', position: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 10, z: 10 } }] }
  const moved: BoardPart = { ...board, cuts: [{ id: 'c1', label: 'C', face: '+Z', position: { x: 1, y: 0, z: 0 }, size: { x: 10, y: 10, z: 10 } }] }
  expect(shapeKey(base)).not.toBe(shapeKey(moved))
})

it('changes when cut size changes', () => {
  const base: BoardPart = { ...board, cuts: [{ id: 'c1', label: 'C', face: '+Z', position: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 10, z: 10 } }] }
  const resized: BoardPart = { ...board, cuts: [{ id: 'c1', label: 'C', face: '+Z', position: { x: 0, y: 0, z: 0 }, size: { x: 15, y: 10, z: 10 } }] }
  expect(shapeKey(base)).not.toBe(shapeKey(resized))
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm vitest run src/scene/utils.test.ts
```

Expected: FAIL — "encodes kind and dimensions" gets `'board|200|100|25'` not `'board|200|100|25|'`; new cut tests fail.

- [ ] **Step 3: Rewrite `shapeKey` in `src/scene/utils.ts`**

```typescript
import type { Part } from './types'

export function shapeKey(part: Part): string {
  if (part.kind === 'board') {
    const cutKey = part.cuts
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (c) =>
          `${c.position.x},${c.position.y},${c.position.z}|${c.size.x},${c.size.y},${c.size.z}`,
      )
      .join(';')
    return `board|${part.length}|${part.width}|${part.thickness}|${cutKey}`
  }
  throw new Error(`unknown part kind: ${(part as { kind: string }).kind}`)
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pnpm vitest run src/scene/utils.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run full suite**

```bash
pnpm typecheck && pnpm test
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/scene/utils.ts src/scene/utils.test.ts
git commit -m "feat: extend shapeKey to encode cuts"
```

---

## Task 4: `makeCut` OCCT primitive

**Files:**
- Modify: `src/geom/occt.ts`
- Modify: `src/geom/occt.test.ts`

- [ ] **Step 1: Add tests in `src/geom/occt.test.ts`**

Add the export check and two skip tests after the existing tests:

```typescript
import { describe, expect, it } from 'vitest'
import { initOCCT, makeBox, makeCut } from './occt'

// ... existing tests unchanged ...

it('exports makeCut', () => {
  expect(typeof makeCut).toBe('function')
})

it.skip('makeCut: board with one cut produces fewer triangles than bare board (browser-only)', async () => {
  const oc = await initOCCT()
  const board = makeBox(oc, 200, 100, 25)
  const cut = makeCut(oc, board, { x: 90, y: 40, z: 15 }, { x: 20, y: 20, z: 10 })
  // Can't easily count triangles here — just verify shape is valid
  expect(cut).toBeTruthy()
  cut.delete()
})

it.skip('makeCut: non-intersecting tool returns valid shape (browser-only)', async () => {
  const oc = await initOCCT()
  const board = makeBox(oc, 200, 100, 25)
  // Cut placed completely outside the board
  const result = makeCut(oc, board, { x: 1000, y: 1000, z: 1000 }, { x: 10, y: 10, z: 10 })
  expect(result).toBeTruthy()
  result.delete()
})
```

- [ ] **Step 2: Run tests — `exports makeCut` fails**

```bash
pnpm vitest run src/geom/occt.test.ts
```

Expected: FAIL — `makeCut is not a function`.

- [ ] **Step 3: Implement `makeCut` in `src/geom/occt.ts`**

Add the `Vec3` import and `makeCut` export after `makeBox`:

```typescript
import type { OpenCascadeInstance, TopoDS_Shape } from 'opencascade.js'
import type { Vec3 } from '../scene/types'

// ... initOCCT and makeBox unchanged ...

export function makeCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  position: Vec3,
  size: Vec3,
): TopoDS_Shape {
  const builder = new oc.BRepPrimAPI_MakeBox_1(size.x, size.y, size.z)
  const toolShape = builder.Shape()
  builder.delete()

  const trsf = new oc.gp_Trsf_1()
  const vec = new oc.gp_Vec_4(position.x, position.y, position.z)
  trsf.SetTranslation_1(vec)
  vec.delete()
  const xform = new oc.BRepBuilderAPI_Transform_2(toolShape, trsf, false)
  trsf.delete()
  const movedTool = xform.Shape()

  const pr1 = new oc.Message_ProgressRange_1()
  const op = new oc.BRepAlgoAPI_Cut_3(shape, movedTool, pr1)
  pr1.delete()
  const pr2 = new oc.Message_ProgressRange_1()
  op.Build(pr2)
  pr2.delete()

  if (!op.IsDone()) {
    console.warn('makeCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    op.delete()
    xform.delete()
    movedTool.delete()
    toolShape.delete()
    return shape
  }

  const result = op.Shape()
  op.delete()
  xform.delete()
  movedTool.delete()
  toolShape.delete()

  return result
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm vitest run src/geom/occt.test.ts
```

Expected: `exports makeCut` PASS; skip tests skipped.

- [ ] **Step 5: Commit**

```bash
git add src/geom/occt.ts src/geom/occt.test.ts
git commit -m "feat: add makeCut OCCT primitive"
```

---

## Task 5: Worker extension + `useScene` call site

**Files:**
- Modify: `src/geom/occt.worker.ts`
- Modify: `src/scene/useScene.ts:143`
- Modify: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write failing test in `src/scene/useScene.test.ts`**

Add this test inside the outer `describe('useScene', ...)` block (after existing tests):

```typescript
it('passes cuts array to buildPart when geometry is triggered', async () => {
  const { result } = renderHook(() => useScene())
  await waitFor(() => expect(result.current.occtReady).toBe(true))
  mockBuildPart.mockClear()

  const id = result.current.scene.parts[0].id
  act(() => {
    result.current.onUpdate(id, (p) => ({
      ...p,
      cuts: [{
        id: 'cut_1',
        label: 'Cut 1',
        face: '+Z' as const,
        position: { x: 90, y: 40, z: 15 },
        size: { x: 20, y: 20, z: 10 },
      }],
    }))
  })

  await waitFor(() =>
    expect(mockBuildPart).toHaveBeenCalledWith(
      'board',
      expect.objectContaining({
        cuts: [{ id: 'cut_1', position: { x: 90, y: 40, z: 15 }, size: { x: 20, y: 20, z: 10 } }],
      }),
    ),
  )
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
pnpm vitest run src/scene/useScene.test.ts -t "passes cuts array"
```

Expected: FAIL — `mockBuildPart` called with `{ length, width, thickness }` only (no `cuts`).

- [ ] **Step 3: Update `src/geom/occt.worker.ts` — extend `buildPart` dims with `cuts`**

```typescript
import { expose, transfer } from 'comlink'
import { initOCCT, makeBox, makeCut } from './occt'
import { shapeToMeshData } from './mesh'
import type { Vec3 } from '../scene/types'

const api = {
  async buildPart(
    kind: 'board',
    dims: {
      length: number
      width: number
      thickness: number
      cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
    },
  ) {
    const oc = await initOCCT()
    if (kind === 'board') {
      const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
      let current = makeBox(oc, dims.length, dims.width, dims.thickness)

      for (const cut of sorted) {
        if (cut.size.x <= 0.1 || cut.size.y <= 0.1 || cut.size.z <= 0.1) continue
        const prev = current
        current = makeCut(oc, current, cut.position, cut.size)
        if (prev !== current) prev.delete()
      }

      const data = shapeToMeshData(oc, current, { linearDeflection: 0.1, angularDeflection: 0.5 })
      current.delete()
      return transfer(data, [data.positions.buffer, data.normals.buffer])
    }
    const _: never = kind
    throw new Error(`unknown kind: ${_}`)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
```

- [ ] **Step 4: Update the `buildPart` call in `src/scene/useScene.ts:143`**

Replace:

```typescript
getOcct()
  .buildPart(part.kind, { length: part.length, width: part.width, thickness: part.thickness })
```

With:

```typescript
getOcct()
  .buildPart(part.kind, {
    length: part.length,
    width: part.width,
    thickness: part.thickness,
    cuts: part.cuts.map(({ id, position, size }) => ({ id, position, size })),
  })
```

- [ ] **Step 5: Run test — expect pass**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/geom/occt.worker.ts src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat: extend worker buildPart to chain Boolean cuts"
```

---

## Task 6: `onUpdateCut` in `useScene`

**Files:**
- Modify: `src/scene/useScene.ts`
- Modify: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write failing tests in `src/scene/useScene.test.ts`**

Add this import at the top of the existing mock/import block (after existing imports):

```typescript
import type { CutDef } from './types'
```

Add these tests at the end of the outer `describe`:

```typescript
describe('onUpdateCut', () => {
  const cut1: CutDef = {
    id: 'cut_1',
    label: 'Cut 1',
    face: '+Z',
    position: { x: 90, y: 40, z: 15 },
    size: { x: 20, y: 20, z: 10 },
  }

  it('updates the matching cut', () => {
    const { result } = renderHook(() => useScene())
    const partId = result.current.scene.parts[0].id
    act(() => {
      result.current.onUpdate(partId, (p) => ({ ...p, cuts: [cut1] }))
    })
    act(() => {
      result.current.onUpdateCut(partId, 'cut_1', (c) => ({ ...c, size: { ...c.size, x: 30 } }))
    })
    expect(result.current.scene.parts[0].cuts[0].size.x).toBe(30)
  })

  it('creates an undoable entry (single undo restores)', () => {
    const { result } = renderHook(() => useScene())
    const partId = result.current.scene.parts[0].id
    act(() => {
      result.current.onUpdate(partId, (p) => ({ ...p, cuts: [cut1] }))
    })
    act(() => {
      result.current.onUpdateCut(partId, 'cut_1', (c) => ({ ...c, size: { ...c.size, x: 30 } }))
    })
    act(() => { result.current.undo() })
    expect(result.current.scene.parts[0].cuts[0].size.x).toBe(20)
  })

  it('propagates u/v sizes to paired cut; single undo restores both', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })

    const partAId = result.current.scene.parts[0].id
    const partBId = result.current.scene.parts[1].id

    const cutA: CutDef = {
      id: 'cut_a',
      label: 'Mortise',
      face: '+Z',
      position: { x: 90, y: 40, z: 15 },
      size: { x: 30, y: 50, z: 10 },
      pairedCutId: `${partBId}:cut_b`,
    }
    const cutB: CutDef = {
      id: 'cut_b',
      label: 'Tenon',
      face: '+Z',
      position: { x: 0, y: 0, z: 15 },
      size: { x: 30, y: 50, z: 10 },
      pairedCutId: `${partAId}:cut_a`,
    }

    act(() => {
      result.current.onUpdate(partAId, (p) => ({ ...p, cuts: [cutA] }))
      result.current.onUpdate(partBId, (p) => ({ ...p, cuts: [cutB] }))
    })

    // Update cut A's u-axis size (x for +Z face: axes.u='x')
    act(() => {
      result.current.onUpdateCut(partAId, 'cut_a', (c) => ({ ...c, size: { ...c.size, x: 40 } }))
    })

    // cut A updated
    expect(result.current.scene.parts[0].cuts[0].size.x).toBe(40)
    // cut B's u-axis (also x, both are +Z face) updated by propagation
    expect(result.current.scene.parts[1].cuts[0].size.x).toBe(40)

    // single undo restores both
    act(() => { result.current.undo() })
    expect(result.current.scene.parts[0].cuts[0].size.x).toBe(30)
    expect(result.current.scene.parts[1].cuts[0].size.x).toBe(30)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm vitest run src/scene/useScene.test.ts -t "onUpdateCut"
```

Expected: FAIL — `result.current.onUpdateCut is not a function`.

- [ ] **Step 3: Add `faceAxes` import and `onUpdateCut` to `src/scene/useScene.ts`**

Add to the imports at the top (`shapeKey` stays imported from `./utils` — do not move it):

```typescript
import { faceAxes } from './snapMath'
import type { CutDef, CutId } from './types'
```

(Add `CutDef, CutId` to the existing `import type { BoardPart, Part, PartId, Scene } from './types'` line, or keep separate.)

Add `onUpdateCut` to the `UseSceneResult` interface:

```typescript
onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
```

Implement `onUpdateCut` in the hook body (before the `return` statement):

```typescript
const onUpdateCut = useCallback(
  (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => {
    const part = sceneRef.current.parts.find((p) => p.id === partId)
    if (!part) return
    const beforeA = part.cuts.find((c) => c.id === cutId)
    if (!beforeA) return
    const afterA = updater(beforeA)

    if (afterA.pairedCutId) {
      const colonIdx = afterA.pairedCutId.indexOf(':')
      const pairedPartId = afterA.pairedCutId.slice(0, colonIdx) as PartId
      const pairedCutIdStr = afterA.pairedCutId.slice(colonIdx + 1) as CutId
      const pairedPart = sceneRef.current.parts.find((p) => p.id === pairedPartId)
      const beforeB = pairedPart?.cuts.find((c) => c.id === pairedCutIdStr)

      if (pairedPart && beforeB) {
        const axesA = faceAxes(afterA.face)
        const axesB = faceAxes(beforeB.face)
        const afterB: CutDef = {
          ...beforeB,
          size: {
            ...beforeB.size,
            [axesB.u]: afterA.size[axesA.u],
            [axesB.v]: afterA.size[axesA.v],
          },
        }

        setScene((prev) => ({
          parts: prev.parts.map((p) => {
            if (p.id === partId) return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? afterA : c)) }
            if (p.id === pairedPartId) return { ...p, cuts: p.cuts.map((c) => (c.id === pairedCutIdStr ? afterB : c)) }
            return p
          }),
        }))

        push({
          label: 'Edit cut',
          coalesceKey: `cut-${partId}-${cutId}`,
          undo: () =>
            setScene((prev) => ({
              parts: prev.parts.map((p) => {
                if (p.id === partId) return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? beforeA : c)) }
                if (p.id === pairedPartId) return { ...p, cuts: p.cuts.map((c) => (c.id === pairedCutIdStr ? beforeB : c)) }
                return p
              }),
            })),
          redo: () =>
            setScene((prev) => ({
              parts: prev.parts.map((p) => {
                if (p.id === partId) return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? afterA : c)) }
                if (p.id === pairedPartId) return { ...p, cuts: p.cuts.map((c) => (c.id === pairedCutIdStr ? afterB : c)) }
                return p
              }),
            })),
        })
        return
      }
    }

    // No paired cut — single-part update
    setScene((prev) => ({
      parts: prev.parts.map((p) =>
        p.id === partId ? { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? afterA : c)) } : p,
      ),
    }))
    push({
      label: 'Edit cut',
      coalesceKey: `cut-${partId}-${cutId}`,
      undo: () =>
        setScene((prev) => ({
          parts: prev.parts.map((p) =>
            p.id === partId ? { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? beforeA : c)) } : p,
          ),
        })),
      redo: () =>
        setScene((prev) => ({
          parts: prev.parts.map((p) =>
            p.id === partId ? { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? afterA : c)) } : p,
          ),
        })),
    })
  },
  [push],
)
```

Add `onUpdateCut` to the return value.

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat: add onUpdateCut with paired u/v propagation"
```

---

## Task 7: `onRemoveCut`, `onLinkCuts`, `onUnlinkCuts` in `useScene`

**Files:**
- Modify: `src/scene/useScene.ts`
- Modify: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write failing tests in `src/scene/useScene.test.ts`**

Add after the `onUpdateCut` describe block:

```typescript
describe('onRemoveCut', () => {
  it('removes cut from the part', () => {
    const { result } = renderHook(() => useScene())
    const partId = result.current.scene.parts[0].id
    act(() => {
      result.current.onUpdate(partId, (p) => ({
        ...p,
        cuts: [{ id: 'cut_1', label: 'Cut 1', face: '+Z' as const, position: { x: 0, y: 0, z: 0 }, size: { x: 20, y: 20, z: 10 } }],
      }))
    })
    act(() => { result.current.onRemoveCut(partId, 'cut_1') })
    expect(result.current.scene.parts[0].cuts).toHaveLength(0)
  })

  it('clears stale pairedCutId references on other parts', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })

    const partAId = result.current.scene.parts[0].id
    const partBId = result.current.scene.parts[1].id

    act(() => {
      result.current.onUpdate(partAId, (p) => ({
        ...p,
        cuts: [{ id: 'cut_a', label: 'A', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 } }],
      }))
      result.current.onUpdate(partBId, (p) => ({
        ...p,
        cuts: [{ id: 'cut_b', label: 'B', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 }, pairedCutId: `${partAId}:cut_a` }],
      }))
    })

    act(() => { result.current.onRemoveCut(partAId, 'cut_a') })

    expect(result.current.scene.parts[0].cuts).toHaveLength(0)
    expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBeUndefined()
  })

  it('undo restores cut and paired references in one step', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })

    const partAId = result.current.scene.parts[0].id
    const partBId = result.current.scene.parts[1].id

    act(() => {
      result.current.onUpdate(partAId, (p) => ({
        ...p,
        cuts: [{ id: 'cut_a', label: 'A', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 } }],
      }))
      result.current.onUpdate(partBId, (p) => ({
        ...p,
        cuts: [{ id: 'cut_b', label: 'B', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 }, pairedCutId: `${partAId}:cut_a` }],
      }))
    })

    act(() => { result.current.onRemoveCut(partAId, 'cut_a') })
    act(() => { result.current.undo() })

    expect(result.current.scene.parts[0].cuts).toHaveLength(1)
    expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBe(`${partAId}:cut_a`)
  })
})

describe('onLinkCuts', () => {
  it('sets pairedCutId bidirectionally', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })

    const partAId = result.current.scene.parts[0].id
    const partBId = result.current.scene.parts[1].id

    act(() => {
      result.current.onUpdate(partAId, (p) => ({
        ...p,
        cuts: [{ id: 'cut_a', label: 'A', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 30, y: 40, z: 10 } }],
      }))
      result.current.onUpdate(partBId, (p) => ({
        ...p,
        cuts: [{ id: 'cut_b', label: 'B', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 10, y: 10, z: 10 } }],
      }))
    })

    act(() => { result.current.onLinkCuts(partAId, 'cut_a', partBId, 'cut_b') })

    expect(result.current.scene.parts[0].cuts[0].pairedCutId).toBe(`${partBId}:cut_b`)
    expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBe(`${partAId}:cut_a`)
    // u/v sizes from A (+Z: u=x, v=y) propagated to B
    expect(result.current.scene.parts[1].cuts[0].size.x).toBe(30)
    expect(result.current.scene.parts[1].cuts[0].size.y).toBe(40)
  })

  it('undo clears both pairedCutIds', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })
    const partAId = result.current.scene.parts[0].id
    const partBId = result.current.scene.parts[1].id
    act(() => {
      result.current.onUpdate(partAId, (p) => ({ ...p, cuts: [{ id: 'cut_a', label: 'A', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 30, y: 40, z: 10 } }] }))
      result.current.onUpdate(partBId, (p) => ({ ...p, cuts: [{ id: 'cut_b', label: 'B', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 10, y: 10, z: 10 } }] }))
    })
    act(() => { result.current.onLinkCuts(partAId, 'cut_a', partBId, 'cut_b') })
    act(() => { result.current.undo() })
    expect(result.current.scene.parts[0].cuts[0].pairedCutId).toBeUndefined()
    expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBeUndefined()
  })
})

describe('onUnlinkCuts', () => {
  it('clears pairedCutId on both sides', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })
    const partAId = result.current.scene.parts[0].id
    const partBId = result.current.scene.parts[1].id
    act(() => {
      result.current.onUpdate(partAId, (p) => ({ ...p, cuts: [{ id: 'cut_a', label: 'A', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 }, pairedCutId: `${partBId}:cut_b` }] }))
      result.current.onUpdate(partBId, (p) => ({ ...p, cuts: [{ id: 'cut_b', label: 'B', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 }, pairedCutId: `${partAId}:cut_a` }] }))
    })
    act(() => { result.current.onUnlinkCuts(partAId, 'cut_a') })
    expect(result.current.scene.parts[0].cuts[0].pairedCutId).toBeUndefined()
    expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBeUndefined()
  })

  it('undo restores both pairedCutIds', async () => {
    const { result } = renderHook(() => useScene())
    await waitFor(() => expect(result.current.occtReady).toBe(true))
    act(() => { result.current.onAdd() })
    const partAId = result.current.scene.parts[0].id
    const partBId = result.current.scene.parts[1].id
    act(() => {
      result.current.onUpdate(partAId, (p) => ({ ...p, cuts: [{ id: 'cut_a', label: 'A', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 }, pairedCutId: `${partBId}:cut_b` }] }))
      result.current.onUpdate(partBId, (p) => ({ ...p, cuts: [{ id: 'cut_b', label: 'B', face: '+Z' as const, position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 }, pairedCutId: `${partAId}:cut_a` }] }))
    })
    act(() => { result.current.onUnlinkCuts(partAId, 'cut_a') })
    act(() => { result.current.undo() })
    expect(result.current.scene.parts[0].cuts[0].pairedCutId).toBe(`${partBId}:cut_b`)
    expect(result.current.scene.parts[1].cuts[0].pairedCutId).toBe(`${partAId}:cut_a`)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm vitest run src/scene/useScene.test.ts -t "onRemoveCut|onLinkCuts|onUnlinkCuts"
```

Expected: FAIL — all three functions undefined.

- [ ] **Step 3: Add `onRemoveCut`, `onLinkCuts`, `onUnlinkCuts` to `UseSceneResult` interface in `src/scene/useScene.ts`**

```typescript
onRemoveCut: (partId: PartId, cutId: CutId) => void
onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
onUnlinkCuts: (partId: PartId, cutId: CutId) => void
```

- [ ] **Step 4: Implement `onRemoveCut` in the hook body**

```typescript
const onRemoveCut = useCallback(
  (partId: PartId, cutId: CutId) => {
    const part = sceneRef.current.parts.find((p) => p.id === partId)
    if (!part) return
    const removedCut = part.cuts.find((c) => c.id === cutId)
    if (!removedCut) return

    const affectedPairs: Array<{ partId: PartId; cutId: CutId }> = []
    for (const p of sceneRef.current.parts) {
      for (const c of p.cuts) {
        if (c.pairedCutId === `${partId}:${cutId}`) {
          affectedPairs.push({ partId: p.id, cutId: c.id })
        }
      }
    }

    setScene((prev) => ({
      parts: prev.parts.map((p) => {
        if (p.id === partId) return { ...p, cuts: p.cuts.filter((c) => c.id !== cutId) }
        const pair = affectedPairs.find((ap) => ap.partId === p.id)
        if (pair) {
          return { ...p, cuts: p.cuts.map((c) => (c.id === pair.cutId ? { ...c, pairedCutId: undefined } : c)) }
        }
        return p
      }),
    }))

    push({
      label: 'Remove cut',
      undo: () =>
        setScene((prev) => ({
          parts: prev.parts.map((p) => {
            if (p.id === partId) return { ...p, cuts: [...p.cuts, removedCut] }
            const pair = affectedPairs.find((ap) => ap.partId === p.id)
            if (pair) {
              return {
                ...p,
                cuts: p.cuts.map((c) =>
                  c.id === pair.cutId ? { ...c, pairedCutId: `${partId}:${cutId}` } : c,
                ),
              }
            }
            return p
          }),
        })),
      redo: () =>
        setScene((prev) => ({
          parts: prev.parts.map((p) => {
            if (p.id === partId) return { ...p, cuts: p.cuts.filter((c) => c.id !== cutId) }
            const pair = affectedPairs.find((ap) => ap.partId === p.id)
            if (pair) {
              return { ...p, cuts: p.cuts.map((c) => (c.id === pair.cutId ? { ...c, pairedCutId: undefined } : c)) }
            }
            return p
          }),
        })),
    })
  },
  [push],
)
```

- [ ] **Step 5: Implement `onLinkCuts` in the hook body**

```typescript
const onLinkCuts = useCallback(
  (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => {
    const partA = sceneRef.current.parts.find((p) => p.id === partIdA)
    const partB = sceneRef.current.parts.find((p) => p.id === partIdB)
    if (!partA || !partB) return
    const cutA = partA.cuts.find((c) => c.id === cutIdA)
    const cutB = partB.cuts.find((c) => c.id === cutIdB)
    if (!cutA || !cutB) return

    const axesA = faceAxes(cutA.face)
    const axesB = faceAxes(cutB.face)

    const linkedA: CutDef = { ...cutA, pairedCutId: `${partIdB}:${cutIdB}` }
    const linkedB: CutDef = {
      ...cutB,
      pairedCutId: `${partIdA}:${cutIdA}`,
      size: { ...cutB.size, [axesB.u]: cutA.size[axesA.u], [axesB.v]: cutA.size[axesA.v] },
    }

    setScene((prev) => ({
      parts: prev.parts.map((p) => {
        if (p.id === partIdA) return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdA ? linkedA : c)) }
        if (p.id === partIdB) return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdB ? linkedB : c)) }
        return p
      }),
    }))

    push({
      label: 'Link cuts',
      undo: () =>
        setScene((prev) => ({
          parts: prev.parts.map((p) => {
            if (p.id === partIdA) return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdA ? cutA : c)) }
            if (p.id === partIdB) return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdB ? cutB : c)) }
            return p
          }),
        })),
      redo: () =>
        setScene((prev) => ({
          parts: prev.parts.map((p) => {
            if (p.id === partIdA) return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdA ? linkedA : c)) }
            if (p.id === partIdB) return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdB ? linkedB : c)) }
            return p
          }),
        })),
    })
  },
  [push],
)
```

- [ ] **Step 6: Implement `onUnlinkCuts` in the hook body**

```typescript
const onUnlinkCuts = useCallback(
  (partId: PartId, cutId: CutId) => {
    const part = sceneRef.current.parts.find((p) => p.id === partId)
    if (!part) return
    const cut = part.cuts.find((c) => c.id === cutId)
    if (!cut?.pairedCutId) return

    const sep = cut.pairedCutId.indexOf(':')
    const matingPartId = cut.pairedCutId.slice(0, sep) as PartId
    const matingCutId = cut.pairedCutId.slice(sep + 1) as CutId
    const matingPart = sceneRef.current.parts.find((p) => p.id === matingPartId)
    const matingCut = matingPart?.cuts.find((c) => c.id === matingCutId)

    const unlinked = { ...cut, pairedCutId: undefined }
    const unlinkedMating = matingCut ? { ...matingCut, pairedCutId: undefined } : null

    setScene((prev) => ({
      parts: prev.parts.map((p) => {
        if (p.id === partId) return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? unlinked : c)) }
        if (p.id === matingPartId && unlinkedMating) {
          return { ...p, cuts: p.cuts.map((c) => (c.id === matingCutId ? unlinkedMating : c)) }
        }
        return p
      }),
    }))

    push({
      label: 'Unlink cuts',
      undo: () =>
        setScene((prev) => ({
          parts: prev.parts.map((p) => {
            if (p.id === partId) return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? cut : c)) }
            if (p.id === matingPartId && matingCut) {
              return { ...p, cuts: p.cuts.map((c) => (c.id === matingCutId ? matingCut : c)) }
            }
            return p
          }),
        })),
      redo: () =>
        setScene((prev) => ({
          parts: prev.parts.map((p) => {
            if (p.id === partId) return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? unlinked : c)) }
            if (p.id === matingPartId && unlinkedMating) {
              return { ...p, cuts: p.cuts.map((c) => (c.id === matingCutId ? unlinkedMating : c)) }
            }
            return p
          }),
        })),
    })
  },
  [push],
)
```

Add all three to the `return` value.

- [ ] **Step 7: Run tests — expect pass**

```bash
pnpm vitest run src/scene/useScene.test.ts
```

Expected: All tests PASS.

- [ ] **Step 8: Fix `onDuplicate` to remap cut IDs in `src/scene/useScene.ts`**

The existing `onDuplicate` spreads the original part, copying its `cuts` array with identical IDs and `pairedCutId` references. After this task introduces linked cuts, a duplicated board sharing cut IDs with the original would cause `onRemoveCut` and `onLinkCuts` to affect both boards.

Find the `clone` object in `onDuplicate` (around line 308) and extend it:

```typescript
// old
const clone: BoardPart = {
  ...orig,
  id: `board_${crypto.randomUUID()}` as PartId,
  color: PART_COLORS[colorIndex.current % PART_COLORS.length],
  position: { ...orig.position, x: orig.position.x + orig.length + 10 },
  rotation: { x: 0, y: 0, z: 0 },
}
```

```typescript
// new
const clone: BoardPart = {
  ...orig,
  id: `board_${crypto.randomUUID()}` as PartId,
  color: PART_COLORS[colorIndex.current % PART_COLORS.length],
  position: { ...orig.position, x: orig.position.x + orig.length + 10 },
  rotation: { x: 0, y: 0, z: 0 },
  cuts: orig.cuts.map((c) => ({
    ...c,
    id: `cut_${crypto.randomUUID()}` as CutId,
    pairedCutId: undefined,
  })),
}
```

Add `CutId` to the imports at the top of `useScene.ts` if not already present from Task 6.

Run typecheck:

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat: add onRemoveCut, onLinkCuts, onUnlinkCuts to useScene; remap cut IDs on duplicate"
```

---

## Task 8: `useFile` migration

**Files:**
- Modify: `src/scene/useFile.ts:50`
- Modify: `src/scene/useFile.test.ts`

- [ ] **Step 1: Write failing test in `src/scene/useFile.test.ts`**

Add a new test inside the `describe('useFile', ...)` block:

```typescript
it('defaults cuts to [] when loading a file without cut data', async () => {
  const fixtureNoCuts: ZimmuFile = {
    ...FIXTURE,
    scene: {
      parts: [{
        kind: 'board' as const,
        id: 'board_old',
        label: 'Board 1',
        length: 200,
        width: 100,
        thickness: 25,
        color: '#d4a373',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ' as const,
        // no cuts field — simulates a pre-cuts file
      } as unknown as Part],
    },
  }

  const mockHandle = {
    name: 'old.zimmu',
    queryPermission: vi.fn().mockResolvedValue('granted'),
    getFile: vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue(JSON.stringify(fixtureNoCuts)),
    }),
  } as unknown as FileSystemFileHandle
  vi.mocked(idb.readHandle).mockResolvedValue(mockHandle)

  const onFileLoaded = vi.fn()
  const { result } = renderHook(() => useFile(makeInput({ onFileLoaded })))
  await waitFor(() => expect(result.current.fileReady).toBe(true))

  const envelope = onFileLoaded.mock.calls[0][0] as ZimmuFile
  expect(envelope.scene.parts[0].cuts).toEqual([])
})
```

Add `import type { Part } from './types'` if not already present.

- [ ] **Step 2: Run test — expect failure**

```bash
pnpm vitest run src/scene/useFile.test.ts -t "defaults cuts"
```

Expected: FAIL — `envelope.scene.parts[0].cuts` is `undefined`.

- [ ] **Step 3: Fix `parseFile` in `src/scene/useFile.ts` (line 50)**

Replace:

```typescript
return { ...raw, scene: { parts } }
```

With:

```typescript
return { ...raw, scene: { parts: parts.map((p) => ({ cuts: [], ...p })) } }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm vitest run src/scene/useFile.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/useFile.ts src/scene/useFile.test.ts
git commit -m "feat: default cuts to [] when loading pre-cuts files"
```

---

## Task 9: `useAddCut` hook

**Files:**
- Create: `src/scene/useAddCut.ts`
- Create: `src/scene/useAddCut.test.ts`

- [ ] **Step 1: Create `src/scene/useAddCut.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAddCut } from './useAddCut'
import type { FaceHit, Part } from './types'

const mockPart: Part = {
  kind: 'board',
  id: 'board_test',
  label: 'Board 1',
  length: 200,
  width: 100,
  thickness: 25,
  color: '#d4a373',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  rotationOrder: 'XYZ',
  cuts: [],
}

function makeHit(overrides: Partial<FaceHit> = {}): FaceHit {
  return {
    partId: 'board_test',
    faceNormal: { x: 0, y: 0, z: 1 },
    faceCenter: { x: 100, y: 50, z: 25 },
    localFaceNormal: { x: 0, y: 0, z: 1 },
    localHitPoint: { x: 100, y: 50, z: 25 },
    ...overrides,
  }
}

describe('useAddCut', () => {
  it('starts with cutActive false, lastPlacedCutId null', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    expect(result.current.cutActive).toBe(false)
    expect(result.current.lastPlacedCutId).toBeNull()
  })

  it('activateCut toggles cutActive on/off', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    act(() => { result.current.activateCut() })
    expect(result.current.cutActive).toBe(true)
    act(() => { result.current.activateCut() })
    expect(result.current.cutActive).toBe(false)
  })

  it('cancelCut sets cutActive false and clears lastPlacedCutId', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    act(() => { result.current.activateCut() })
    act(() => { result.current.cancelCut() })
    expect(result.current.cutActive).toBe(false)
    expect(result.current.lastPlacedCutId).toBeNull()
  })

  it('onFaceClick when inactive: no-op', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate, onSelect: vi.fn() }),
    )
    act(() => { result.current.onFaceClick(makeHit()) })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('onFaceClick +Z face: correct position and size', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate, onSelect: vi.fn() }),
    )
    act(() => { result.current.activateCut() })
    act(() => {
      result.current.onFaceClick(makeHit({
        localFaceNormal: { x: 0, y: 0, z: 1 },
        localHitPoint: { x: 100, y: 50, z: 25 },
      }))
    })
    expect(onUpdate).toHaveBeenCalledWith('board_test', expect.any(Function), 'Add cut')
    const updater = onUpdate.mock.calls[0][1] as (p: Part) => Part
    const updated = updater(mockPart)
    expect(updated.cuts).toHaveLength(1)
    const cut = updated.cuts[0]
    expect(cut.face).toBe('+Z')
    expect(cut.label).toBe('Cut 1')
    expect(cut.size).toEqual({ x: 20, y: 20, z: 10 })
    // depth corner: z = thickness - size.z = 25 - 10 = 15
    // u-centre: x = 100 - 10 = 90
    // v-centre: y = 50 - 10 = 40
    expect(cut.position).toEqual({ x: 90, y: 40, z: 15 })
  })

  it('onFaceClick -Z face: depth corner at z=0', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate, onSelect: vi.fn() }),
    )
    act(() => { result.current.activateCut() })
    act(() => {
      result.current.onFaceClick(makeHit({
        localFaceNormal: { x: 0, y: 0, z: -1 },
        localHitPoint: { x: 100, y: 50, z: 0 },
      }))
    })
    const updater = onUpdate.mock.calls[0][1] as (p: Part) => Part
    const cut = updater(mockPart).cuts[0]
    expect(cut.face).toBe('-Z')
    expect(cut.position.z).toBe(0)
  })

  it('onFaceClick +X face: correct face string', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate, onSelect: vi.fn() }),
    )
    act(() => { result.current.activateCut() })
    act(() => {
      result.current.onFaceClick(makeHit({
        localFaceNormal: { x: 1, y: 0, z: 0 },
        localHitPoint: { x: 200, y: 50, z: 12 },
      }))
    })
    const updater = onUpdate.mock.calls[0][1] as (p: Part) => Part
    expect(updater(mockPart).cuts[0].face).toBe('+X')
  })

  it('onFaceClick calls onSelect with partId', () => {
    const onSelect = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect }),
    )
    act(() => { result.current.activateCut() })
    act(() => { result.current.onFaceClick(makeHit()) })
    expect(onSelect).toHaveBeenCalledWith('board_test')
  })

  it('onFaceClick sets lastPlacedCutId; cutActive stays true for chaining', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    act(() => { result.current.activateCut() })
    act(() => { result.current.onFaceClick(makeHit()) })
    expect(result.current.lastPlacedCutId).not.toBeNull()
    expect(result.current.cutActive).toBe(true)
  })

  it('cancelCut clears lastPlacedCutId', () => {
    const { result } = renderHook(() =>
      useAddCut({ parts: [mockPart], onUpdate: vi.fn(), onSelect: vi.fn() }),
    )
    act(() => { result.current.activateCut() })
    act(() => { result.current.onFaceClick(makeHit()) })
    act(() => { result.current.cancelCut() })
    expect(result.current.lastPlacedCutId).toBeNull()
  })

  it('label increments with existing cuts count', () => {
    const onUpdate = vi.fn()
    const partWithOneCut: Part = {
      ...mockPart,
      cuts: [{ id: 'existing', label: 'Cut 1', face: '+Z', position: { x: 0, y: 0, z: 15 }, size: { x: 20, y: 20, z: 10 } }],
    }
    const { result } = renderHook(() =>
      useAddCut({ parts: [partWithOneCut], onUpdate, onSelect: vi.fn() }),
    )
    act(() => { result.current.activateCut() })
    act(() => { result.current.onFaceClick(makeHit()) })
    const updater = onUpdate.mock.calls[0][1] as (p: Part) => Part
    const cut = updater(partWithOneCut).cuts[1]
    expect(cut.label).toBe('Cut 2')
  })
})
```

- [ ] **Step 2: Run tests — expect file-not-found or function-not-found failure**

```bash
pnpm vitest run src/scene/useAddCut.test.ts
```

Expected: FAIL — module `./useAddCut` not found.

- [ ] **Step 3: Create `src/scene/useAddCut.ts`**

```typescript
import { useState, useCallback } from 'react'
import type { CutDef, CutId, FaceHit, Part, PartId } from './types'
import { defaultCutSize, faceAxes } from './snapMath'

export interface AddCutState {
  cutActive: boolean
  lastPlacedCutId: CutId | null
  hoveredFace: FaceHit | null
  activateCut: () => void
  cancelCut: () => void
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
}

export function useAddCut(params: {
  parts: Part[]
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel: string) => void
  onSelect: (id: PartId) => void
}): AddCutState {
  const { parts, onUpdate, onSelect } = params
  const [cutActive, setCutActive] = useState(false)
  const [lastPlacedCutId, setLastPlacedCutId] = useState<CutId | null>(null)
  const [hoveredFace, setHoveredFace] = useState<FaceHit | null>(null)

  const activateCut = useCallback(() => {
    setCutActive((v) => !v)
  }, [])

  const cancelCut = useCallback(() => {
    setCutActive(false)
    setLastPlacedCutId(null)
    setHoveredFace(null)
  }, [])

  const onFaceClick = useCallback(
    (hit: FaceHit) => {
      if (!cutActive) return
      const part = parts.find((p) => p.id === hit.partId)
      if (!part || part.kind !== 'board') return

      const lfn = hit.localFaceNormal
      const ax = Math.abs(lfn.x), ay = Math.abs(lfn.y), az = Math.abs(lfn.z)
      let face: CutDef['face']
      if (ax >= ay && ax >= az) face = lfn.x > 0 ? '+X' : '-X'
      else if (ay >= ax && ay >= az) face = lfn.y > 0 ? '+Y' : '-Y'
      else face = lfn.z > 0 ? '+Z' : '-Z'

      const size = defaultCutSize(face)
      const axes = faceAxes(face)
      const h = hit.localHitPoint
      const boardDim: Record<string, number> = { x: part.length, y: part.width, z: part.thickness }

      const position: Record<string, number> = { x: 0, y: 0, z: 0 }
      position[axes.depth] = face.startsWith('+') ? boardDim[axes.depth] - size[axes.depth] : 0
      position[axes.u] = h[axes.u] - size[axes.u] / 2
      position[axes.v] = h[axes.v] - size[axes.v] / 2

      const cutId = `cut_${crypto.randomUUID()}` as CutId
      const newCut: CutDef = {
        id: cutId,
        label: `Cut ${part.cuts.length + 1}`,
        face,
        position: { x: position.x, y: position.y, z: position.z },
        size,
      }

      onUpdate(hit.partId, (p) => ({ ...p, cuts: [...p.cuts, newCut] }), 'Add cut')
      onSelect(hit.partId)
      setLastPlacedCutId(cutId)
    },
    [cutActive, parts, onUpdate, onSelect],
  )

  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHoveredFace(cutActive ? hit : null)
    },
    [cutActive],
  )

  return { cutActive, lastPlacedCutId, hoveredFace, activateCut, cancelCut, onFaceClick, onFaceHover }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pnpm vitest run src/scene/useAddCut.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run full suite**

```bash
pnpm typecheck && pnpm test
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/scene/useAddCut.ts src/scene/useAddCut.test.ts
git commit -m "feat: add useAddCut hook for click-to-place cuts"
```

---

## Task 10: Viewport cut mode routing

**Files:**
- Modify: `src/render/viewport.tsx`

No unit tests (viewport is Three.js-heavy). Verify manually: start dev server, add a board, press `C`, click a face — a cut should appear in the sidebar.

- [ ] **Step 1: Add new props to `ViewportProps` interface (line 9–22)**

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
  cutActive: boolean
  onFaceClickCut: (hit: FaceHit) => void
  onFaceHoverCut: (hit: FaceHit | null) => void
}
```

- [ ] **Step 2: Destructure new props in the `Viewport` function**

Add `cutActive`, `onFaceClickCut`, `onFaceHoverCut` to the destructured parameters.

- [ ] **Step 3: Add refs for cut mode (after existing refs, around line 53)**

```typescript
const cutActiveRef = useRef(cutActive)
const onFaceClickCutRef = useRef(onFaceClickCut)
const onFaceHoverCutRef = useRef(onFaceHoverCut)
```

- [ ] **Step 4: Update `useLayoutEffect` to sync new refs (line 55–61)**

```typescript
useLayoutEffect(() => {
  onClickRef.current = onPartClick
  partsRef.current = parts
  snapActiveRef.current = snapActive
  onFaceClickRef.current = onFaceClick
  onFaceHoverRef.current = onFaceHover
  cutActiveRef.current = cutActive
  onFaceClickCutRef.current = onFaceClickCut
  onFaceHoverCutRef.current = onFaceHoverCut
})
```

- [ ] **Step 5: Update `handleClick` to prioritise cut mode (lines 221–239)**

Replace:

```typescript
if (snapActiveRef.current) {
  if (hits.length > 0) {
    const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current)
    if (faceHit) onFaceClickRef.current(faceHit)
  }
} else {
  // Normal mode ...
}
```

With:

```typescript
if (cutActiveRef.current) {
  if (hits.length > 0) {
    const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current)
    if (faceHit) onFaceClickCutRef.current(faceHit)
  }
} else if (snapActiveRef.current) {
  if (hits.length > 0) {
    const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current)
    if (faceHit) onFaceClickRef.current(faceHit)
  }
} else {
  // Normal mode — unchanged
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
```

- [ ] **Step 6: Update the rAF hover callback to route cut mode (lines 245–259)**

Replace:

```typescript
rafIdRef.current = requestAnimationFrame(() => {
  if (!snapActiveRef.current) return
  // ...
  if (hits.length > 0) {
    const hit = buildFaceHit(hits[0], meshes.current, partsRef.current)
    onFaceHoverRef.current(hit)
  } else {
    onFaceHoverRef.current(null)
  }
})
```

With:

```typescript
rafIdRef.current = requestAnimationFrame(() => {
  if (!snapActiveRef.current && !cutActiveRef.current) return
  const { x, y } = lastMouseRef.current
  const rect = renderer.domElement.getBoundingClientRect()
  const nx = ((x - rect.left) / rect.width) * 2 - 1
  const ny = -((y - rect.top) / rect.height) * 2 + 1
  raycaster.current.setFromCamera(new THREE.Vector2(nx, ny), camera)
  const hits = raycaster.current.intersectObjects(Array.from(meshes.current.values()), false)
  if (hits.length > 0) {
    const hit = buildFaceHit(hits[0], meshes.current, partsRef.current)
    if (cutActiveRef.current) onFaceHoverCutRef.current(hit)
    else onFaceHoverRef.current(hit)
  } else {
    if (cutActiveRef.current) onFaceHoverCutRef.current(null)
    else onFaceHoverRef.current(null)
  }
})
```

- [ ] **Step 7: Update the face-highlight `useLayoutEffect` for cut mode**

In `src/render/viewport.tsx`, find the `useLayoutEffect` that calls `updateHighlight` (currently lines 414–416). The hover ring is gated on `snapActive` — extend the guard to also fire when cut mode is active:

```typescript
// old
updateHighlight(sourceHighlightRef.current, snapActive ? sourceFace : null, 0xfbbf24)
updateHighlight(hoverHighlightRef.current, snapActive ? hoveredFace : null, 0x60a5fa)
}, [snapActive, sourceFace, hoveredFace, parts])
```

```typescript
// new
updateHighlight(sourceHighlightRef.current, snapActive ? sourceFace : null, 0xfbbf24)
updateHighlight(hoverHighlightRef.current, (snapActive || cutActive) ? hoveredFace : null, 0x60a5fa)
}, [snapActive, cutActive, sourceFace, hoveredFace, parts])
```

Also update the cursor `useEffect` (lines 421–425):

```typescript
// old
mount.style.cursor = snapActive ? 'crosshair' : ''
...
}, [snapActive])
```

```typescript
// new
mount.style.cursor = (snapActive || cutActive) ? 'crosshair' : ''
...
}, [snapActive, cutActive])
```

- [ ] **Step 8: Add stub props to App.tsx to unblock the pre-commit typecheck**

Task 10 adds three required props to `ViewportProps`. App.tsx does not pass them yet, so the pre-commit hook fails. Add stubs now (they will be replaced by real values in Task 12 Step 5):

In `src/App.tsx`, in the `<Viewport ...>` JSX, add:

```typescript
cutActive={false}
onFaceClickCut={() => {}}
onFaceHoverCut={() => {}}
```

- [ ] **Step 9: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/render/viewport.tsx src/App.tsx
git commit -m "feat: add cut mode routing to Viewport"
```

---

## Task 11: Sidebar cuts UI

**Files:**
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/ui/sidebar.test.tsx`

- [ ] **Step 1: Write failing tests in `src/ui/sidebar.test.tsx`**

Add new imports at the top:

```typescript
import type { CutDef, CutId, PartId, Scene } from '../scene/types'
```

Update the `props()` helper to include all new props with safe defaults:

```typescript
function props(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return {
    scene: { parts: [makeBoard()] } as Scene,
    occtReady: true,
    errors: new Map<PartId, string>(),
    pendingIds: new Set<PartId>(),
    nextLabel: 'Board 2',
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onDuplicate: vi.fn(),
    onUpdate: vi.fn(),
    onUpdateCut: vi.fn(),
    onRemoveCut: vi.fn(),
    onLinkCuts: vi.fn(),
    onUnlinkCuts: vi.fn(),
    lastPlacedCutId: null as CutId | null,
    selectedId: null,
    onSelect: vi.fn(),
    snapActive: false,
    snapPhase: 'idle' as const,
    onSnapToggle: vi.fn(),
    cutActive: false,
    onCutToggle: vi.fn(),
    ...overrides,
  }
}
```

Add new tests at the end of the `describe('Sidebar', ...)` block:

```typescript
it('shows Cuts section header when a part is selected', () => {
  render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
  expect(screen.getByText(/Cuts/i)).toBeTruthy()
})

it('shows "No cuts" placeholder when part has zero cuts', () => {
  render(<Sidebar {...props({ selectedId: 'board_t1' })} />)
  expect(screen.getByText(/No cuts/i)).toBeTruthy()
})

it('renders a cut row when part has one cut', () => {
  const cut: CutDef = {
    id: 'cut_1',
    label: 'Dado',
    face: '+Z',
    position: { x: 90, y: 40, z: 15 },
    size: { x: 20, y: 20, z: 10 },
  }
  const scene = { parts: [makeBoard({ cuts: [cut] })] }
  render(<Sidebar {...props({ scene, selectedId: 'board_t1' })} />)
  expect(screen.getByText('Dado')).toBeTruthy()
})

it('delete button on cut row calls onRemoveCut', () => {
  const onRemoveCut = vi.fn()
  const cut: CutDef = {
    id: 'cut_1',
    label: 'Dado',
    face: '+Z',
    position: { x: 90, y: 40, z: 15 },
    size: { x: 20, y: 20, z: 10 },
  }
  const scene = { parts: [makeBoard({ cuts: [cut] })] }
  render(<Sidebar {...props({ scene, selectedId: 'board_t1', onRemoveCut })} />)
  fireEvent.click(screen.getByTitle('Delete cut'))
  expect(onRemoveCut).toHaveBeenCalledWith('board_t1', 'cut_1')
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm vitest run src/ui/sidebar.test.tsx -t "Cuts section|cut row|onRemoveCut"
```

Expected: FAIL — `props()` missing new fields, `Cuts section` not rendered.

- [ ] **Step 3: Widen `SidebarProps` in `src/ui/sidebar.tsx`**

Replace the `SidebarProps` interface with:

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
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  lastPlacedCutId: CutId | null
  selectedId: PartId | null
  onSelect: (id: PartId | null) => void
  snapActive: boolean
  snapPhase: 'idle' | 'source-picked'
  onSnapToggle: () => void
  cutActive: boolean
  onCutToggle: () => void
}
```

Add `CutDef` and `CutId` to the type imports at the top of the file:

```typescript
import type { CutDef, CutId, Part, PartId, Scene } from '../scene/types'
```

Add `useMemo` to the React import:

```typescript
import { useState, useEffect, useRef, useMemo } from 'react'
```

- [ ] **Step 4: Update `EditPanel` props and signature**

Replace `EditPanelProps`:

```typescript
function EditPanel({
  part,
  onUpdate,
  onUpdateCut,
  onRemoveCut,
  onLinkCuts,
  onUnlinkCuts,
  lastPlacedCutId,
  scene,
  nextLabel,
}: {
  part: Part
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  lastPlacedCutId: CutId | null
  scene: Scene
  nextLabel: string
})
```

- [ ] **Step 5: Add `CutRow` component before `EditPanel`**

```typescript
function CutRow({
  cut,
  partId,
  scene,
  onUpdateCut,
  onRemoveCut,
  onLinkCuts,
  onUnlinkCuts,
  defaultOpen,
}: {
  cut: CutDef
  partId: PartId
  scene: Scene
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  // Build cut lookup once for pairing display
  const cutLookup = useMemo(() => {
    const map = new Map<string, { partId: PartId; cut: CutDef; partLabel: string }>()
    for (const p of scene.parts) {
      for (const c of p.cuts) {
        map.set(`${p.id}:${c.id}`, { partId: p.id, cut: c, partLabel: p.label })
      }
    }
    return map
  }, [scene.parts])

  const pairedEntry = cut.pairedCutId ? cutLookup.get(cut.pairedCutId) ?? null : null
  const pairLost = !!cut.pairedCutId && !pairedEntry

  // All cuts on other boards for the link dropdown
  const linkOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = []
    for (const p of scene.parts) {
      if (p.id === partId) continue
      for (const c of p.cuts) {
        opts.push({ value: `${p.id}:${c.id}`, label: `${p.label} › ${c.label}` })
      }
    }
    return opts
  }, [scene.parts, partId])

  return (
    <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 2 }}>
      <div
        style={{ ...s.groupHdr, display: 'flex', alignItems: 'center', gap: 4 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1 }}>{cut.label}</span>
        <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>{cut.face}</span>
        <button
          title="Delete cut"
          style={{ ...s.iconBtn, color: '#c0392b' }}
          onClick={(e) => {
            e.stopPropagation()
            onRemoveCut(partId, cut.id)
          }}
        >
          ✕
        </button>
      </div>
      {open && (
        <div style={{ paddingLeft: 8 }}>
          <div style={{ ...s.groupHdr, cursor: 'default' }}>Size</div>
          <DimInput
            value={cut.size[faceAxes(cut.face).depth]}
            suffix="mm depth"
            min={0.1}
            onCommit={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                size: { ...c.size, [faceAxes(c.face).depth]: v },
              }))
            }
          />
          <DimInput
            value={cut.size[faceAxes(cut.face).u]}
            suffix="mm width"
            min={0.1}
            onCommit={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                size: { ...c.size, [faceAxes(c.face).u]: v },
              }))
            }
          />
          <DimInput
            value={cut.size[faceAxes(cut.face).v]}
            suffix="mm height"
            min={0.1}
            onCommit={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                size: { ...c.size, [faceAxes(c.face).v]: v },
              }))
            }
          />
          <div style={{ ...s.groupHdr, cursor: 'default' }}>Offset</div>
          <NumInput
            value={cut.position[faceAxes(cut.face).u]}
            suffix="mm U"
            onChange={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                position: { ...c.position, [faceAxes(c.face).u]: v },
              }))
            }
          />
          <NumInput
            value={cut.position[faceAxes(cut.face).v]}
            suffix="mm V"
            onChange={(v) =>
              onUpdateCut(partId, cut.id, (c) => ({
                ...c,
                position: { ...c.position, [faceAxes(c.face).v]: v },
              }))
            }
          />
          <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>
            {pairLost ? (
              <span style={{ color: '#c0392b' }}>
                Pair lost{' '}
                <button
                  style={s.iconBtn}
                  onClick={() => onUnlinkCuts(partId, cut.id)}
                >
                  Unlink
                </button>
              </span>
            ) : pairedEntry ? (
              <span>
                ↔ {pairedEntry.partLabel} › {pairedEntry.cut.label}{' '}
                <button style={s.iconBtn} onClick={() => onUnlinkCuts(partId, cut.id)}>
                  Unlink
                </button>
              </span>
            ) : linkOptions.length > 0 ? (
              <select
                style={{ ...s.input, fontSize: 11 }}
                value=""
                onChange={(e) => {
                  const [pId, cId] = e.target.value.split(':') as [PartId, CutId]
                  onLinkCuts(partId, cut.id, pId, cId)
                }}
              >
                <option value="">Link to cut…</option>
                {linkOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
```

You need to import `faceAxes` at the top of the file:

```typescript
import { faceAxes } from '../scene/snapMath'
```

- [ ] **Step 6: Add Cuts section to `EditPanel` (after the Rotation section, before the closing `</div>`)**

Inside `EditPanel`, before the final `</div>`, add:

```typescript
<div style={s.groupHdr}>▾ Cuts</div>
{part.cuts.length === 0 ? (
  <div style={{ fontSize: 11, color: '#555', padding: '2px 0 4px' }}>No cuts</div>
) : (
  part.cuts.map((cut) => (
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
  ))
)}
```

- [ ] **Step 7: Add "Add Cut" button and update the `Sidebar` component**

In the `Sidebar` JSX, add a second button above the "Snap faces" button in the top controls section:

```typescript
<button
  onClick={onCutToggle}
  style={{
    width: '100%',
    padding: '7px 0',
    background: cutActive ? '#2a3a4a' : '#222',
    color: cutActive ? '#6bb3cb' : '#888',
    border: `1px solid ${cutActive ? '#3a5a6a' : '#333'}`,
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    marginBottom: 4,
  }}
>
  {cutActive ? 'Adding Cut' : 'Add Cut'}
</button>
```

Pass all new props through from `Sidebar` to `EditPanel`:

```typescript
{selectedPart && (
  <EditPanel
    key={selectedPart.id}
    part={selectedPart}
    onUpdate={onUpdate}
    onUpdateCut={onUpdateCut}
    onRemoveCut={onRemoveCut}
    onLinkCuts={onLinkCuts}
    onUnlinkCuts={onUnlinkCuts}
    lastPlacedCutId={lastPlacedCutId}
    scene={scene}
    nextLabel={nextLabel}
  />
)}
```

- [ ] **Step 8: Run tests — expect all pass**

```bash
pnpm vitest run src/ui/sidebar.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 9: Add stub props to App.tsx to unblock the pre-commit typecheck**

Task 11 adds seven required props to `SidebarProps`. App.tsx does not pass them yet. Add stubs now (replaced in Task 12 Steps 5–6):

In `src/App.tsx`, in the `<Sidebar ...>` JSX, add:

```typescript
onUpdateCut={() => {}}
onRemoveCut={() => {}}
onLinkCuts={() => {}}
onUnlinkCuts={() => {}}
lastPlacedCutId={null}
cutActive={false}
onCutToggle={() => {}}
```

- [ ] **Step 10: Run full suite**

```bash
pnpm typecheck && pnpm test
```

Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/ui/sidebar.tsx src/ui/sidebar.test.tsx src/App.tsx
git commit -m "feat: add Cuts section to EditPanel sidebar"
```

---

## Task 12: App wiring

**Files:**
- Modify: `src/App.tsx`

No unit tests. After this task, verify manually: start dev server, add boards, press `C`, click a face — cut appears in sidebar with correct position/size, `F` activates snap (cancels cut), pressing `C` again while snap active cancels snap and activates cut.

- [ ] **Step 1: Add `useAddCut` import and call in `src/App.tsx`**

Add to imports:

```typescript
import { useAddCut } from './scene/useAddCut'
```

After the `useSnap` call (line 44), add:

```typescript
const {
  cutActive,
  lastPlacedCutId,
  activateCut,
  cancelCut,
  onFaceClick: onFaceClickCut,
  onFaceHover: onFaceHoverCut,
} = useAddCut({ parts: scene.parts, onUpdate, onSelect })
```

- [ ] **Step 1b: Extend the `useScene()` destructure to include the four cut-mutation functions**

Find the existing `useScene()` destructure block in `src/App.tsx` and add the four new handlers:

```typescript
const {
  // ... existing fields ...
  onUpdateCut,
  onRemoveCut,
  onLinkCuts,
  onUnlinkCuts,
} = useScene()
```

Without this step, Steps 6 and 7 will fail with `onUpdateCut is not defined`.

- [ ] **Step 2: Add mutual exclusion wrappers with `useCallback`**

After the `useAddCut` call, add:

```typescript
const handleActivateCut = useCallback(() => { cancelSnap(); activateCut() }, [cancelSnap, activateCut])
const handleActivateSnap = useCallback(() => { cancelCut(); activateSnap() }, [cancelCut, activateSnap])
```

These must be `useCallback`-wrapped — plain arrow functions would be recreated every render and cause the keyboard effect to re-register its listener on every render.

- [ ] **Step 3: Add `C` key handler and Escape handler for cut mode to the keyboard effect**

Inside the `if (!mod)` block, after the `f` key handler, add the `C` key branch:

```typescript
if (e.key.toLowerCase() === 'c') {
  e.preventDefault()
  handleActivateCut()
  return
}
```

In the same effect, update the Escape branch to also cancel cut mode:

```typescript
// old
if (e.key === 'Escape' && snapActive) {
  cancelSnap()
  return
}
```

```typescript
// new
if (e.key === 'Escape') {
  if (cutActive) cancelCut()
  if (snapActive) cancelSnap()
  return
}
```

Update the effect's dependency array to include `handleActivateCut`, `handleActivateSnap`, `cancelCut`, `cutActive`.

- [ ] **Step 4: Fix the critical `onSnapToggle` prop**

In the JSX, replace:

```typescript
onSnapToggle={activateSnap}
```

With:

```typescript
onSnapToggle={handleActivateSnap}
```

- [ ] **Step 5: Pass cut props to `Viewport`**

In the `<Viewport ...>` JSX, add:

```typescript
cutActive={cutActive}
onFaceClickCut={onFaceClickCut}
onFaceHoverCut={onFaceHoverCut}
```

- [ ] **Step 6: Pass cut props to `Sidebar`**

In the `<Sidebar ...>` JSX, add:

```typescript
onUpdateCut={onUpdateCut}
onRemoveCut={onRemoveCut}
onLinkCuts={onLinkCuts}
onUnlinkCuts={onUnlinkCuts}
lastPlacedCutId={lastPlacedCutId}
cutActive={cutActive}
onCutToggle={handleActivateCut}
```

- [ ] **Step 7: Run typecheck and full test suite**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: clean.

- [ ] **Step 8: Manual smoke test**

```bash
pnpm dev
```

Open `http://localhost:5173`. Verify:
1. Add a board. Press `C` — sidebar "Add Cut" button turns active blue.
2. Click a face. A cut row appears in the sidebar Cuts section.
3. Expand the cut row — six fields (depth, width, height, U offset, V offset) and face chip shown.
4. Change depth — geometry updates in viewport (void appears).
5. Press `F` — snap activates, cut deactivates. Sidebar "Snap faces" button active; "Add Cut" inactive.
6. Press `C` — snap deactivates, cut activates.
7. Press `Escape` — cut deactivates.
8. Add two boards with cuts. Link one pair — u/v sizes sync.
9. Undo "Link cuts" — both pairedCutIds cleared.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire useAddCut into App, mutual exclusion with snap, C key"
```

---

## Post-implementation checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm test` all green
- [ ] Manual smoke test (Task 12 Step 8) passes
- [ ] Push to branch

```bash
git push -u origin claude/continue-tasks-gIycE
```
