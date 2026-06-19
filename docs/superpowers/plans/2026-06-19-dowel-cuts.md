# Dowel Cuts (SP2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four subtractive joinery cuts to dowels — square/angled **end cuts**, lateral **notches** (incl. half-laps), and **bores** (axial + transverse) — created by clicking the relevant surface to seed and refined numerically, all participating in undo/redo, geometry rebuild, STL/STEP export, and file save/load.

**Architecture:** A new `DowelCut` discriminated union (separate from the board's `CutDef`, because dowel cuts are axis/azimuth-relative). Pure tool-geometry math in a new `src/geom/dowelCut.ts` (THREE-free, unit-tested like `mitre.ts`); OCCT plumbing in `occt.ts` mirrors the existing `makeMitreCut`/`makeCut` subtraction pattern. Click-to-seed via an extended `useAddCut` tool selector; numeric editing in a new `DowelCutsPanel`. All dowel-cut scene mutations go through the existing generic `useScene.onUpdate`. Phased: end cuts → bores → notch.

**Tech Stack:** React 19 + TypeScript (strict), Three.js, OpenCASCADE.js (WASM, Comlink worker), Vitest + happy-dom + @testing-library/react, pnpm.

---

## Prerequisite: base branch

**SP2 depends on SP1 code (`CylinderPart`, `makeCylinder`, the kind-aware `BuildSpec`/`ExportSpec`, the dowel `EditPanel`, `onAdd('cylinder')`) which lives only in unmerged PR #6 (`claude/exciting-bell-2jysqk`).** PR #6 was branched before the mitre (#9) and e2e (#8) merges, so its `BuildSpec`/`ExportSpec` are stale.

**Before starting, establish the base:** merge PR #6 into `main` (or rebase PR #6 onto current `main`), then branch SP2 work from that. Every file reference below assumes that **main + SP1** tree. Verify the base is correct:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. The cylinder part (Ø8×100 dowel) can be added, dimensioned, and exported, and `Part = BoardPart | CylinderPart` exists in `src/scene/types.ts`. If `CylinderPart` is absent, the base is wrong — stop and fix it.

> If SP1 cannot be landed first, this plan cannot be executed: there is no dowel to cut.

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/scene/types.ts` | Add `DowelCut` union; add `cuts: DowelCut[]` to `CylinderPart` |
| Modify | `src/scene/utils.ts` | `shapeKey` cylinder arm serializes `cuts` |
| Create | `src/geom/dowelCut.ts` | Pure tool-geometry math (4 cut types) + hit-seeding helpers |
| Create | `src/geom/dowelCut.test.ts` | Unit tests for all pure functions |
| Modify | `src/geom/occt.ts` | `makeBoxCutAt`, `makeCylinderCut`, `makeDowelShape`; `ExportSpec` cylinder `cuts`; `makeTransformedShape` cylinder branch |
| Modify | `src/geom/occt.test.ts` | `makeDowelShape` smoke (skipped without WASM) |
| Modify | `src/geom/occt.worker.ts` | `BuildSpec` cylinder arm gains `cuts`; routes to `makeDowelShape` |
| Modify | `src/scene/useScene.ts` | `buildSpecForPart` + `exportStep` cylinder arms carry `cuts`; `onAdd`/`onDuplicate` cylinder default/copy `cuts` |
| Modify | `src/scene/useScene.test.ts` | `buildSpecForPart`/default/duplicate cylinder-cuts coverage |
| Modify | `src/scene/useAddCut.ts` | Dowel tool state + cylinder `onFaceClick` branch |
| Modify | `src/scene/useAddCut.test.ts` | Dowel tool seeding + surface-mismatch tests |
| Create | `src/ui/DowelCutsPanel.tsx` | Tool-arm buttons + per-cut numeric editor rows |
| Create | `src/ui/DowelCutsPanel.test.tsx` | Renders arm buttons + cut-row inputs |
| Modify | `src/ui/sidebar.tsx` | Render `<DowelCutsPanel>` in the dowel `EditPanel`; thread props |
| Modify | `src/App.tsx` | Thread `dowelTool`/`armDowelTool` from `useAddCut` to `Sidebar` |
| Create | `docs/superpowers/notes/2026-06-19-dowel-cuts-notes.md` | Living implementation notes |

---

## PHASE 1 — End cuts

### Task 1: Data model + `shapeKey`

**Files:**
- Modify: `src/scene/types.ts`
- Modify: `src/scene/utils.ts`
- Test: `src/scene/utils.test.ts` (create if absent)

- [ ] **Step 1: Add the `DowelCut` union and `cuts` field**

In `src/scene/types.ts`, after the `CutDef` definitions (and before or after `CylinderPart`), add:

```ts
export interface DowelEndCut {
  kind: 'end'
  id: CutId
  label: string
  end: '+Z' | '-Z' // which cap the cut acts on
  offset: number // mm inward from that end where the cut plane crosses the axis
  angle: number // degrees tilt from perpendicular; 0 = square trim
  azimuth: number // degrees around the axis; direction the tilt faces (used when angle > 0)
}

export interface DowelNotch {
  kind: 'notch'
  id: CutId
  label: string
  position: number // mm along axis — notch center
  width: number // mm extent along axis
  depth: number // mm radial depth (0..diameter); depth = radius ⇒ half-lap
  azimuth: number // degrees around axis — which side the notch faces
}

export interface DowelBoreAxial {
  kind: 'bore-axial'
  id: CutId
  label: string
  end: '+Z' | '-Z' // which end the hole is drilled from
  diameter: number // mm
  depth: number // mm; depth ≥ length ⇒ through
}

export interface DowelBoreTransverse {
  kind: 'bore-transverse'
  id: CutId
  label: string
  position: number // mm along axis — hole center
  azimuth: number // degrees around axis — direction the hole enters
  diameter: number // mm
  depth: number // mm; depth ≥ diameter ⇒ through
}

export type DowelCut = DowelEndCut | DowelNotch | DowelBoreAxial | DowelBoreTransverse
```

In the same file, add `cuts` to `CylinderPart`:

```ts
export interface CylinderPart {
  kind: 'cylinder'
  id: PartId
  label: string
  diameter: number
  length: number
  material: string
  color: string
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  cuts: DowelCut[]
  visible: boolean
}
```

- [ ] **Step 2: Write the failing `shapeKey` test**

In `src/scene/utils.test.ts` add (create the file with imports if it does not exist):

```ts
import { describe, it, expect } from 'vitest'
import { shapeKey } from './utils'
import type { CylinderPart } from './types'

function dowel(over: Partial<CylinderPart> = {}): CylinderPart {
  return {
    kind: 'cylinder',
    id: 'd1',
    label: 'Dowel 1',
    diameter: 8,
    length: 100,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...over,
  }
}

describe('shapeKey — cylinder cuts', () => {
  it('changes when a cut is added', () => {
    const base = shapeKey(dowel())
    const withCut = shapeKey(
      dowel({
        cuts: [{ kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 }],
      }),
    )
    expect(withCut).not.toBe(base)
  })

  it('is stable regardless of cut array order', () => {
    const a = shapeKey(
      dowel({
        cuts: [
          { kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 },
          { kind: 'end', id: 'c2', label: 'End 2', end: '-Z', offset: 0, angle: 30, azimuth: 0 },
        ],
      }),
    )
    const b = shapeKey(
      dowel({
        cuts: [
          { kind: 'end', id: 'c2', label: 'End 2', end: '-Z', offset: 0, angle: 30, azimuth: 0 },
          { kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 },
        ],
      }),
    )
    expect(a).toBe(b)
  })

  it('ignores position/rotation', () => {
    const a = shapeKey(dowel())
    const b = shapeKey(dowel({ position: { x: 50, y: 0, z: 0 }, rotation: { x: 1, y: 0, z: 0 } }))
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `pnpm vitest run src/scene/utils.test.ts`
Expected: FAIL — "changes when a cut is added" fails because the cylinder key ignores `cuts`.

- [ ] **Step 4: Update `shapeKey`**

In `src/scene/utils.ts`, replace the cylinder branch:

```ts
  if (part.kind === 'cylinder') {
    const cutKey = part.cuts
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => JSON.stringify(c))
      .join(';')
    return `cylinder|${part.diameter}|${part.length}|${cutKey}`
  }
```

(`id` and `label` are immutable for a dowel cut once created — the UI exposes no rename — so including them in the JSON cannot cause spurious rebuilds.)

- [ ] **Step 5: Run tests, verify pass**

Run: `pnpm vitest run src/scene/utils.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. (Adding `cuts` to `CylinderPart` may surface errors in `useScene.ts`/`useFile.ts` where cylinder parts are constructed — those are fixed in Task 4 and Task 1.5. If the typecheck blocks the commit, complete Step 7's `onAdd`/`onDuplicate`/`parseFile` edits below first.)

- [ ] **Step 7: Make `CylinderPart` construction sites supply `cuts`**

Three SP1 sites build a cylinder object literal and now need `cuts: []`:

1. `src/scene/useScene.ts`, in `onAdd`, the `else` (cylinder) branch — add `cuts: [],` to the object (e.g. before `visible: true,`).
2. `src/scene/useScene.ts`, in `onDuplicate`, the `else` (cylinder) branch — add cut-id-regenerating copy:

```ts
        clone = {
          ...orig,
          id: `dowel_${crypto.randomUUID()}` as PartId,
          color,
          position: { ...orig.position, x: orig.position.x + orig.diameter + 10 },
          rotation: { x: 0, y: 0, z: 0 },
          visible: true,
          cuts: orig.cuts.map((c) => ({ ...c, id: `cut_${crypto.randomUUID()}` as CutId })),
        }
```

3. `src/scene/useFile.ts`, in the file-parsing code that reconstructs a cylinder part (`parseFile`), default a missing `cuts` to `[]`. Find where the cylinder branch builds the part and ensure `cuts: Array.isArray(raw.cuts) ? raw.cuts : []` (match the surrounding style; the exact expression depends on how `parseFile` narrows parts — mirror how the board branch handles `cuts`).

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/scene/utils.test.ts`
Expected: all PASS.

```bash
git add src/scene/types.ts src/scene/utils.ts src/scene/utils.test.ts src/scene/useScene.ts src/scene/useFile.ts
git commit -m "feat(dowel): DowelCut data model + shapeKey + cuts:[] defaults"
```

---

### Task 2: Pure end-cut tool math + seeding helpers (`dowelCut.ts`)

**Files:**
- Create: `src/geom/dowelCut.ts`
- Test: `src/geom/dowelCut.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/geom/dowelCut.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeEndTool, dowelSurfaceFromNormal, azimuthFromHit } from './dowelCut'
import type { DowelEndCut } from '../scene/types'

const dowel = { diameter: 8, length: 100 }
const RAD = Math.PI / 180

function endCut(over: Partial<DowelEndCut> = {}): DowelEndCut {
  return { kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0, ...over }
}

describe('computeEndTool', () => {
  it('+Z end: pivot and box sit at the top cap, square axis perpendicular to azimuth', () => {
    const t = computeEndTool(dowel, endCut({ end: '+Z', offset: 0, angle: 45, azimuth: 0 }))
    expect(t.pivot.z).toBeCloseTo(100)
    expect(t.boxOrigin.z).toBeCloseTo(100)
    // azimuth 0 ⇒ tilt faces +X ⇒ rotation axis is +Y
    expect(t.axisDir.x).toBeCloseTo(0)
    expect(t.axisDir.y).toBeCloseTo(1)
    expect(t.axisDir.z).toBeCloseTo(0)
    expect(t.angleRad).toBeCloseTo(45 * RAD)
  })

  it('offset moves the cut plane inward from the chosen end', () => {
    const t = computeEndTool(dowel, endCut({ end: '+Z', offset: 20, angle: 0 }))
    expect(t.pivot.z).toBeCloseTo(80)
  })

  it('-Z end flips the rotation sign and box direction', () => {
    const t = computeEndTool(dowel, endCut({ end: '-Z', offset: 10, angle: 45, azimuth: 0 }))
    expect(t.pivot.z).toBeCloseTo(10)
    expect(t.angleRad).toBeCloseTo(-45 * RAD)
    expect(t.boxOrigin.z).toBeLessThan(10) // box extends toward -Z
  })

  it('azimuth rotates the tilt axis in the XY plane', () => {
    const t = computeEndTool(dowel, endCut({ azimuth: 90 }))
    // azimuth 90 ⇒ tilt faces +Y ⇒ rotation axis is -X
    expect(t.axisDir.x).toBeCloseTo(-1)
    expect(t.axisDir.y).toBeCloseTo(0)
  })
})

describe('dowelSurfaceFromNormal', () => {
  it('classifies caps by the dominant Z component', () => {
    expect(dowelSurfaceFromNormal({ x: 0, y: 0, z: 1 })).toBe('cap+')
    expect(dowelSurfaceFromNormal({ x: 0, y: 0, z: -1 })).toBe('cap-')
  })
  it('classifies the lateral surface by a dominant radial component', () => {
    expect(dowelSurfaceFromNormal({ x: 1, y: 0, z: 0 })).toBe('lateral')
    expect(dowelSurfaceFromNormal({ x: 0.7, y: 0.7, z: 0.1 })).toBe('lateral')
  })
})

describe('azimuthFromHit', () => {
  it('returns degrees measured from +X', () => {
    expect(azimuthFromHit({ x: 4, y: 0, z: 50 })).toBeCloseTo(0)
    expect(azimuthFromHit({ x: 0, y: 4, z: 50 })).toBeCloseTo(90)
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm vitest run src/geom/dowelCut.test.ts`
Expected: FAIL — module `./dowelCut` not found.

- [ ] **Step 3: Implement `dowelCut.ts` (end + helpers)**

Create `src/geom/dowelCut.ts`:

```ts
import type { DowelEndCut, Vec3 } from '../scene/types'

const DEG2RAD = Math.PI / 180

export interface BoxToolDescriptor {
  boxOrigin: Vec3 // axis-aligned oversized box min-corner, BEFORE rotation
  boxSize: Vec3 // oversized box dimensions
  pivot: Vec3 // rotation axis point
  axisDir: Vec3 // unit rotation axis
  angleRad: number // signed rotation
}

export interface CylinderToolDescriptor {
  radius: number
  height: number
  basePoint: Vec3 // cylinder base center
  dir: Vec3 // unit axis direction (cylinder extends +dir from basePoint)
}

interface DowelDims {
  diameter: number
  length: number
}

// Oversized box half-space subtracted at one end. angle 0 ⇒ square trim at
// `offset` from the chosen end; angle > 0 ⇒ wedge pivoting on the cap toward
// `azimuth`. Sign of angleRad is pinned by tests and confirmed in the live spike.
export function computeEndTool(dowel: DowelDims, cut: DowelEndCut): BoxToolDescriptor {
  const { diameter: D, length: L } = dowel
  const BIG = 4 * (D + L)
  const span = 2 * BIG
  const zCut = cut.end === '+Z' ? L - cut.offset : cut.offset
  const az = cut.azimuth * DEG2RAD
  return {
    boxOrigin: { x: -BIG, y: -BIG, z: cut.end === '+Z' ? zCut : zCut - span },
    boxSize: { x: span, y: span, z: span },
    pivot: { x: 0, y: 0, z: zCut },
    // rotation axis is horizontal, perpendicular to the azimuth direction
    // (cos az, sin az, 0) so the cut plane tilts toward `azimuth`.
    axisDir: { x: -Math.sin(az), y: Math.cos(az), z: 0 },
    angleRad: (cut.end === '+Z' ? 1 : -1) * cut.angle * DEG2RAD,
  }
}

export type DowelSurface = 'cap+' | 'cap-' | 'lateral'

export function dowelSurfaceFromNormal(localNormal: Vec3): DowelSurface {
  const az = Math.abs(localNormal.z)
  const radial = Math.hypot(localNormal.x, localNormal.y)
  if (az >= radial) return localNormal.z >= 0 ? 'cap+' : 'cap-'
  return 'lateral'
}

export function azimuthFromHit(localHit: Vec3): number {
  return Math.atan2(localHit.y, localHit.x) / DEG2RAD
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run src/geom/dowelCut.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/geom/dowelCut.test.ts`

```bash
git add src/geom/dowelCut.ts src/geom/dowelCut.test.ts
git commit -m "feat(dowel): pure end-cut tool math + hit-seeding helpers"
```

---

### Task 3: OCCT plumbing — `makeBoxCutAt` + `makeDowelShape` (end cuts)

**Files:**
- Modify: `src/geom/occt.ts`
- Test: `src/geom/occt.test.ts`

- [ ] **Step 1: Add the OCCT functions**

In `src/geom/occt.ts`:

1. Update imports at the top:

```ts
import type { CutDef, DowelCut, MitreCut, Vec3 } from '../scene/types'
import { computeMitreTool } from './mitre'
import {
  computeEndTool,
  type BoxToolDescriptor,
  type CylinderToolDescriptor,
} from './dowelCut'
```

(`computeMitreTool` import already exists in some form — keep a single import line. `CylinderToolDescriptor` is used in Phase 2; importing it now is harmless but if `noUnusedLocals` complains, add it in Task 8 instead.)

2. Add after `makeMitreCut` (before `ExportSpec`):

```ts
// Rotate + translate an oversized box and subtract it. Generalizes makeMitreCut's
// body; serves dowel end cuts and notches. makeMitreCut is left as-is for boards.
export function makeBoxCutAt(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  tool: BoxToolDescriptor,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const builder = new O.BRepPrimAPI_MakeBox_1(tool.boxSize.x, tool.boxSize.y, tool.boxSize.z)
  const boxShape = builder.Shape()
  builder.delete()

  const tTrsf = new O.gp_Trsf_1()
  const tVec = new O.gp_Vec_4(tool.boxOrigin.x, tool.boxOrigin.y, tool.boxOrigin.z)
  tTrsf.SetTranslation_1(tVec)
  tVec.delete()
  const tXform = new O.BRepBuilderAPI_Transform_2(boxShape, tTrsf, false)
  tTrsf.delete()
  const translated = tXform.Shape()

  const rTrsf = new O.gp_Trsf_1()
  const pnt = new O.gp_Pnt_3(tool.pivot.x, tool.pivot.y, tool.pivot.z)
  const dir = new O.gp_Dir_4(tool.axisDir.x, tool.axisDir.y, tool.axisDir.z)
  const ax1 = new O.gp_Ax1_2(pnt, dir)
  rTrsf.SetRotation_1(ax1, tool.angleRad)
  pnt.delete()
  dir.delete()
  ax1.delete()
  const rXform = new O.BRepBuilderAPI_Transform_2(translated, rTrsf, false)
  rTrsf.delete()
  const movedTool = rXform.Shape()

  const pr1 = new O.Message_ProgressRange_1()
  const op = new O.BRepAlgoAPI_Cut_3(shape, movedTool, pr1)
  pr1.delete()
  const pr2 = new O.Message_ProgressRange_1()
  op.Build(pr2)
  pr2.delete()

  const cleanup = () => {
    op.delete()
    rXform.delete()
    movedTool.delete()
    tXform.delete()
    translated.delete()
    boxShape.delete()
  }

  if (!op.IsDone()) {
    console.warn('makeBoxCutAt: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }
  const result = op.Shape()
  cleanup()
  return result
}

// Build a cylinder from a dowel's dims and fold each cut through a subtraction,
// mirroring makeShape. makeCylinderCut (Phase 2) is referenced in the bore arms.
export function makeDowelShape(
  oc: OpenCascadeInstance,
  dims: { diameter: number; length: number; cuts: DowelCut[] },
): TopoDS_Shape {
  const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
  let current = makeCylinder(oc, dims.diameter / 2, dims.length)
  const dowel = { diameter: dims.diameter, length: dims.length }
  for (const cut of sorted) {
    const prev = current
    switch (cut.kind) {
      case 'end':
        if (cut.angle <= 0 && cut.offset <= 0) continue
        current = makeBoxCutAt(oc, current, computeEndTool(dowel, cut))
        break
      case 'notch':
      case 'bore-axial':
      case 'bore-transverse':
        // Implemented in Phase 2/3.
        continue
      default: {
        const _exhaustive: never = cut
        throw new Error(`unknown dowel cut kind: ${(_exhaustive as { kind: string }).kind}`)
      }
    }
    if (prev !== current) prev.delete()
  }
  return current
}
```

> `makeCylinder` is the SP1 export already present in this file. If `CylinderToolDescriptor` is imported but unused until Phase 2, hold its import until Task 8 to satisfy `noUnusedLocals`.

- [ ] **Step 2: Add the skipped smoke test**

In `src/geom/occt.test.ts`, add (mirroring the existing `it.skip` WASM guards):

```ts
it.skip('makeDowelShape applies an end cut without throwing (needs WASM)', async () => {
  const oc = await initOCCT()
  const shape = makeDowelShape(oc, {
    diameter: 8,
    length: 100,
    cuts: [{ kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 }],
  })
  expect(shape).toBeTruthy()
  shape.delete()
})
```

Add `makeDowelShape` to the existing import from `./occt` in that test file.

- [ ] **Step 3: Typecheck, lint, test**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/geom/occt.test.ts`
Expected: PASS (the new test reports as skipped).

- [ ] **Step 4: Commit**

```bash
git add src/geom/occt.ts src/geom/occt.test.ts
git commit -m "feat(dowel): makeBoxCutAt + makeDowelShape (end cuts)"
```

---

### Task 4: Worker + scene wiring (cylinder cuts)

**Files:**
- Modify: `src/geom/occt.worker.ts`
- Modify: `src/scene/useScene.ts`
- Test: `src/scene/useScene.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scene/useScene.test.ts`, add a test that `buildSpecForPart` carries cylinder cuts. If `buildSpecForPart` is not exported, export it from `useScene.ts` (`export function buildSpecForPart`). Add:

```ts
import { buildSpecForPart } from './useScene'
import type { CylinderPart } from './types'

describe('buildSpecForPart — cylinder cuts', () => {
  it('passes dowel cuts through to the build spec', () => {
    const part: CylinderPart = {
      kind: 'cylinder',
      id: 'd1',
      label: 'Dowel 1',
      diameter: 8,
      length: 100,
      material: '',
      color: '#fff',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
      cuts: [{ kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 }],
      visible: true,
    }
    const spec = buildSpecForPart(part)
    expect(spec.kind).toBe('cylinder')
    if (spec.kind === 'cylinder') {
      expect(spec.cuts).toHaveLength(1)
      expect(spec.cuts[0]).toMatchObject({ kind: 'end', angle: 45 })
    }
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm vitest run src/scene/useScene.test.ts`
Expected: FAIL — `spec.cuts` is `undefined` (and/or a type error if `buildSpecForPart` wasn't exported).

- [ ] **Step 3: Update the worker `BuildSpec`**

In `src/geom/occt.worker.ts`:

```ts
import { initOCCT, makeShape, makeCylinder, makeDowelShape, writeStep } from './occt'
import type { DowelCut, Vec3 } from '../scene/types'
```

Update the union arm and the switch:

```ts
export type BuildSpec =
  | {
      kind: 'board'
      length: number
      width: number
      thickness: number
      cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
    }
  | { kind: 'cylinder'; diameter: number; length: number; cuts: DowelCut[] }
```

```ts
      case 'cylinder':
        shape = makeDowelShape(oc, { diameter: spec.diameter, length: spec.length, cuts: spec.cuts })
        break
```

> Note: the board arm shown is SP1's pre-mitre shape. On the **main + SP1** base it already carries mitre cuts — do not regress it; only touch the cylinder arm. `makeCylinder` may become unused in this file once the cylinder arm routes to `makeDowelShape`; if `noUnusedLocals`/eslint flags it, drop `makeCylinder` from the import.

- [ ] **Step 4: Update `useScene.ts` (build spec + export + export `buildSpecForPart`)**

1. Export and extend `buildSpecForPart` cylinder arm:

```ts
export function buildSpecForPart(part: Part): BuildSpec {
  if (part.kind === 'board') {
    return {
      kind: 'board',
      length: part.length,
      width: part.width,
      thickness: part.thickness,
      cuts: part.cuts.map(({ id, position, size }) => ({ id, position, size })),
    }
  }
  return { kind: 'cylinder', diameter: part.diameter, length: part.length, cuts: part.cuts }
}
```

(Keep the board arm as it exists on the base branch; only add `cuts` to the cylinder return.)

2. In `exportStep`, the cylinder arm gains `cuts`:

```ts
        : {
            kind: 'cylinder',
            label: p.label,
            diameter: p.diameter,
            length: p.length,
            cuts: p.cuts,
            matrix: Array.from(composeWorldMatrix(p)),
          },
```

- [ ] **Step 5: Update `ExportSpec` + `makeTransformedShape` (occt.ts)**

In `src/geom/occt.ts`, the cylinder arm of `ExportSpec` gains `cuts: DowelCut[]`, and `makeTransformedShape`'s cylinder branch calls `makeDowelShape`:

```ts
export type ExportSpec =
  | { kind: 'board'; label: string; length: number; width: number; thickness: number; cuts: CutDef[]; matrix: number[] }
  | { kind: 'cylinder'; label: string; diameter: number; length: number; cuts: DowelCut[]; matrix: number[] }
```

In `makeTransformedShape`, replace the cylinder branch's shape construction with:

```ts
  const shape =
    spec.kind === 'board'
      ? makeShape(oc, spec)
      : makeDowelShape(oc, { diameter: spec.diameter, length: spec.length, cuts: spec.cuts })
```

(Match the existing `makeTransformedShape` structure on the base branch; the key change is routing cylinder → `makeDowelShape`.)

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `pnpm vitest run src/scene/useScene.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/geom/occt.worker.ts src/geom/occt.ts src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat(dowel): route cylinder build + STEP export through makeDowelShape"
```

---

### Task 5: Click-to-seed end cut (`useAddCut`)

**Files:**
- Modify: `src/scene/useAddCut.ts`
- Test: `src/scene/useAddCut.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/scene/useAddCut.test.ts` add (create with `renderHook` imports if absent; follow existing board-cut tests in this file for setup):

```ts
import { renderHook, act } from '@testing-library/react'
import { useAddCut } from './useAddCut'
import type { CylinderPart, FaceHit, Part } from './types'

function dowel(): CylinderPart {
  return {
    kind: 'cylinder', id: 'd1', label: 'Dowel 1', diameter: 8, length: 100,
    material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ', cuts: [], visible: true,
  }
}
function capHit(): FaceHit {
  return {
    partId: 'd1',
    faceNormal: { x: 0, y: 0, z: 1 },
    localFaceNormal: { x: 0, y: 0, z: 1 },
    localHitPoint: { x: 2, y: 0, z: 100 },
    hitPoint: { x: 2, y: 0, z: 100 },
  } as FaceHit
}
function lateralHit(): FaceHit {
  return {
    partId: 'd1',
    faceNormal: { x: 1, y: 0, z: 0 },
    localFaceNormal: { x: 1, y: 0, z: 0 },
    localHitPoint: { x: 4, y: 0, z: 50 },
    hitPoint: { x: 4, y: 0, z: 50 },
  } as FaceHit
}

describe('useAddCut — dowel end tool', () => {
  it('adds an end cut when the End tool is armed and a cap is clicked', () => {
    let parts: Part[] = [dowel()]
    const onUpdate = vi.fn((id, updater) => {
      parts = parts.map((p) => (p.id === id ? updater(p) : p))
    })
    const { result } = renderHook(() =>
      useAddCut({ parts, onUpdate, onSelect: vi.fn() }),
    )
    act(() => result.current.armDowelTool('end'))
    act(() => result.current.onFaceClick(capHit()))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    const updated = parts[0] as CylinderPart
    expect(updated.cuts).toHaveLength(1)
    expect(updated.cuts[0]).toMatchObject({ kind: 'end', end: '+Z' })
  })

  it('ignores a lateral click when the End tool is armed (surface mismatch)', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [dowel()], onUpdate, onSelect: vi.fn() }),
    )
    act(() => result.current.armDowelTool('end'))
    act(() => result.current.onFaceClick(lateralHit()))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('does nothing when no dowel tool is armed', () => {
    const onUpdate = vi.fn()
    const { result } = renderHook(() =>
      useAddCut({ parts: [dowel()], onUpdate, onSelect: vi.fn() }),
    )
    act(() => result.current.onFaceClick(capHit()))
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm vitest run src/scene/useAddCut.test.ts`
Expected: FAIL — `armDowelTool` does not exist.

- [ ] **Step 3: Extend `useAddCut`**

In `src/scene/useAddCut.ts`:

1. Imports + tool type:

```ts
import type { CutDef, CutId, DowelCut, Face, FaceHit, Part, PartId } from './types'
import { defaultCutSize, faceAxes } from './snapMath'
import { dowelSurfaceFromNormal, azimuthFromHit } from '../geom/dowelCut'

export type DowelCutTool = 'end' | 'notch' | 'bore-axial' | 'bore-transverse'
```

2. Add to `AddCutState`:

```ts
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
```

3. Add state + arm/cancel handling inside the hook:

```ts
  const [dowelTool, setDowelTool] = useState<DowelCutTool | null>(null)

  const armDowelTool = useCallback((tool: DowelCutTool) => {
    setDowelTool((cur) => (cur === tool ? null : tool))
  }, [])
```

In `cancelCut`, also clear the dowel tool: add `setDowelTool(null)`.

4. At the **top** of `onFaceClick`, before the board logic, add the cylinder branch:

```ts
      const part = parts.find((p) => p.id === hit.partId)
      if (!part) return

      if (part.kind === 'cylinder') {
        if (!dowelTool) return
        const surface = dowelSurfaceFromNormal(hit.localFaceNormal)
        const isCap = surface === 'cap+' || surface === 'cap-'
        const end = surface === 'cap+' ? '+Z' : '-Z'
        const h = hit.localHitPoint
        const r = part.diameter / 2
        const n = part.cuts.length + 1
        const id = `cut_${crypto.randomUUID()}` as CutId
        let newCut: DowelCut | null = null
        switch (dowelTool) {
          case 'end':
            // NOTE: spec §4 said default angle 0; that is a no-op on click, so we
            // seed 45° (a visible mitre) — recorded in the implementation notes.
            if (isCap) newCut = { kind: 'end', id, label: `End ${n}`, end, offset: 0, angle: 45, azimuth: 0 }
            break
          case 'bore-axial':
            if (isCap)
              newCut = { kind: 'bore-axial', id, label: `Bore ${n}`, end, diameter: Math.max(2, part.diameter / 3), depth: part.length }
            break
          case 'notch':
            if (!isCap)
              newCut = { kind: 'notch', id, label: `Notch ${n}`, position: h.z, width: 20, depth: r, azimuth: azimuthFromHit(h) }
            break
          case 'bore-transverse':
            if (!isCap)
              newCut = { kind: 'bore-transverse', id, label: `Bore ${n}`, position: h.z, azimuth: azimuthFromHit(h), diameter: Math.max(2, part.diameter / 3), depth: part.diameter }
            break
        }
        if (!newCut) return
        const cut = newCut
        onUpdate(
          hit.partId,
          (p) => (p.kind === 'cylinder' ? { ...p, cuts: [...p.cuts, cut] } : p),
          'Add cut',
        )
        onSelect(hit.partId)
        setLastPlacedCutId(cut.id)
        setDowelTool(null)
        return
      }

      if (!cutActive || part.kind !== 'board') return
```

Then the existing board logic follows (remove the now-duplicated `const part = ...` / `if (!part ...)` lines at the original location; the early `if (!cutActive ...)` guard above replaces the old `if (!cutActive) return` + board check).

5. Update `onFaceHover` to also show the highlight while a dowel tool is armed:

```ts
  const onFaceHover = useCallback(
    (hit: FaceHit | null) => {
      setHoveredFace(cutActive || dowelTool ? hit : null)
    },
    [cutActive, dowelTool],
  )
```

6. Add `dowelTool` to `onFaceClick`'s dependency array, and return `dowelTool` + `armDowelTool` from the hook.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run src/scene/useAddCut.test.ts`
Expected: PASS (3 new + existing board tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/scene/useAddCut.test.ts`

```bash
git add src/scene/useAddCut.ts src/scene/useAddCut.test.ts
git commit -m "feat(dowel): click-to-seed end cut via armed tool in useAddCut"
```

---

### Task 6: Sidebar editor — `DowelCutsPanel` (end cuts) + wiring

**Files:**
- Create: `src/ui/DowelCutsPanel.tsx`
- Create: `src/ui/DowelCutsPanel.test.tsx`
- Modify: `src/ui/sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/ui/DowelCutsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DowelCutsPanel } from './DowelCutsPanel'
import type { CylinderPart } from '../scene/types'

function dowel(): CylinderPart {
  return {
    kind: 'cylinder', id: 'd1', label: 'Dowel 1', diameter: 8, length: 100,
    material: '', color: '#fff', position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }, rotationOrder: 'XYZ',
    cuts: [{ kind: 'end', id: 'c1', label: 'End 1', end: '+Z', offset: 0, angle: 45, azimuth: 0 }],
    visible: true,
  }
}

describe('DowelCutsPanel', () => {
  it('renders an arm button for each tool and the existing cut row', () => {
    render(
      <DowelCutsPanel part={dowel()} dowelTool={null} armDowelTool={vi.fn()} onUpdate={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /end/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /notch/i })).toBeTruthy()
    expect(screen.getByText(/End 1/)).toBeTruthy()
    // the end cut exposes an angle input
    expect(screen.getByLabelText(/angle/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm vitest run src/ui/DowelCutsPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DowelCutsPanel.tsx`**

Create `src/ui/DowelCutsPanel.tsx` (uses shadcn primitives already in `src/components/ui/`; follow the board cuts panel in `sidebar.tsx` for styling conventions):

```tsx
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import type { CylinderPart, DowelCut, Part, PartId } from '../scene/types'
import type { DowelCutTool } from '../scene/useAddCut'

interface Props {
  part: CylinderPart
  dowelTool: DowelCutTool | null
  armDowelTool: (tool: DowelCutTool) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part, label: string) => void
}

const TOOLS: { tool: DowelCutTool; label: string }[] = [
  { tool: 'end', label: 'End' },
  { tool: 'notch', label: 'Notch' },
  { tool: 'bore-axial', label: 'Axial bore' },
  { tool: 'bore-transverse', label: 'Transverse bore' },
]

export function DowelCutsPanel({ part, dowelTool, armDowelTool, onUpdate }: Props) {
  const patch = (cutId: string, fields: Partial<DowelCut>) =>
    onUpdate(
      part.id,
      (p) =>
        p.kind === 'cylinder'
          ? { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? ({ ...c, ...fields } as DowelCut) : c)) }
          : p,
      'Edit cut',
    )

  const removeCut = (cutId: string) =>
    onUpdate(
      part.id,
      (p) => (p.kind === 'cylinder' ? { ...p, cuts: p.cuts.filter((c) => c.id !== cutId) } : p),
      'Remove cut',
    )

  const num = (id: string, value: number, onChange: (v: number) => void, label: string) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {TOOLS.map(({ tool, label }) => (
          <Button
            key={tool}
            size="sm"
            variant={dowelTool === tool ? 'default' : 'outline'}
            onClick={() => armDowelTool(tool)}
          >
            {label}
          </Button>
        ))}
      </div>

      {part.cuts.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Arm a tool, then click the dowel to add a cut.
        </p>
      )}

      {part.cuts.map((cut) => (
        <div key={cut.id} className="rounded border p-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{cut.label}</span>
            <Button size="sm" variant="ghost" onClick={() => removeCut(cut.id)}>
              Delete
            </Button>
          </div>

          {cut.kind === 'end' && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => patch(cut.id, { end: cut.end === '+Z' ? '-Z' : '+Z' })}
              >
                End: {cut.end}
              </Button>
              <Button size="sm" variant="outline" onClick={() => patch(cut.id, { angle: 0 })}>
                Square
              </Button>
              {num(`${cut.id}-offset`, cut.offset, (v) => patch(cut.id, { offset: v }), 'Offset')}
              {num(`${cut.id}-angle`, cut.angle, (v) => patch(cut.id, { angle: v }), 'Angle')}
              {num(`${cut.id}-azimuth`, cut.azimuth, (v) => patch(cut.id, { azimuth: v }), 'Azimuth')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

> Phase 2/3 add the `notch` / `bore-axial` / `bore-transverse` row bodies here. The end-cut row is sufficient for Phase 1.

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run src/ui/DowelCutsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into the sidebar + App**

In `src/ui/sidebar.tsx`:
- Import `DowelCutsPanel` and `DowelCutTool`.
- Add `dowelTool: DowelCutTool | null` and `armDowelTool: (t: DowelCutTool) => void` to the Sidebar/EditPanel prop types (thread them exactly as `cutActive`/`activateCut` are threaded for the board cuts UI).
- In the dowel branch of `EditPanel` (where SP1 renders dowel Ø/length inputs), after the dimensions block render:

```tsx
<DowelCutsPanel
  part={part}
  dowelTool={dowelTool}
  armDowelTool={armDowelTool}
  onUpdate={onUpdate}
/>
```

In `src/App.tsx`:
- The `useAddCut(...)` result now includes `dowelTool` and `armDowelTool`. Pass them into `<Sidebar ... dowelTool={addCut.dowelTool} armDowelTool={addCut.armDowelTool} />` (use the same destructured name App already uses for the `useAddCut` result; mirror how `cutActive`/`activateCut` are passed).

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/DowelCutsPanel.tsx src/ui/DowelCutsPanel.test.tsx src/ui/sidebar.tsx src/App.tsx
git commit -m "feat(dowel): DowelCutsPanel end-cut editor + sidebar/App wiring"
```

**Phase 1 checkpoint:** a user can arm "End", click a dowel cap, get a 45° end cut, and edit offset/angle/azimuth or square it. Verify in `pnpm dev` (live WASM): the dowel re-meshes on edit. Record any surprises in the notes file (created in Task 13).

---

## PHASE 2 — Bores (axial + transverse)

### Task 7: Pure bore tool math

**Files:**
- Modify: `src/geom/dowelCut.ts`
- Test: `src/geom/dowelCut.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/geom/dowelCut.test.ts`:

```ts
import { computeAxialBoreTool, computeTransverseBoreTool } from './dowelCut'
import type { DowelBoreAxial, DowelBoreTransverse } from '../scene/types'

describe('computeAxialBoreTool', () => {
  const base: DowelBoreAxial = { kind: 'bore-axial', id: 'c', label: 'Bore', end: '+Z', diameter: 3, depth: 20 }
  it('+Z drills downward along -Z, radius = diameter/2, on the axis', () => {
    const t = computeAxialBoreTool(dowel, base)
    expect(t.radius).toBeCloseTo(1.5)
    expect(t.dir).toMatchObject({ x: 0, y: 0, z: -1 })
    expect(t.basePoint.x).toBeCloseTo(0)
    expect(t.basePoint.y).toBeCloseTo(0)
  })
  it('through hole (depth ≥ length) makes the tool at least as long as the dowel', () => {
    const t = computeAxialBoreTool(dowel, { ...base, depth: 100 })
    expect(t.height).toBeGreaterThanOrEqual(dowel.length)
  })
  it('-Z drills upward along +Z', () => {
    const t = computeAxialBoreTool(dowel, { ...base, end: '-Z' })
    expect(t.dir).toMatchObject({ x: 0, y: 0, z: 1 })
  })
})

describe('computeTransverseBoreTool', () => {
  const base: DowelBoreTransverse = { kind: 'bore-transverse', id: 'c', label: 'Bore', position: 50, azimuth: 0, diameter: 3, depth: 8 }
  it('enters radially inward from the azimuth side at the given height', () => {
    const t = computeTransverseBoreTool(dowel, base)
    expect(t.basePoint.z).toBeCloseTo(50)
    expect(t.basePoint.x).toBeGreaterThan(dowel.diameter / 2) // outside the surface
    expect(t.dir).toMatchObject({ x: -1, y: 0, z: 0 })
  })
  it('through hole (depth ≥ diameter) spans the full diameter', () => {
    const t = computeTransverseBoreTool(dowel, { ...base, depth: 8 })
    expect(t.height).toBeGreaterThanOrEqual(dowel.diameter)
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm vitest run src/geom/dowelCut.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the bore tools**

Append to `src/geom/dowelCut.ts` (add `DowelBoreAxial`, `DowelBoreTransverse` to the type import):

```ts
export function computeAxialBoreTool(dowel: DowelDims, cut: DowelBoreAxial): CylinderToolDescriptor {
  const over = dowel.diameter
  const through = cut.depth >= dowel.length
  const height = (through ? dowel.length : cut.depth) + over
  if (cut.end === '+Z') {
    return { radius: cut.diameter / 2, height, basePoint: { x: 0, y: 0, z: dowel.length + over }, dir: { x: 0, y: 0, z: -1 } }
  }
  return { radius: cut.diameter / 2, height, basePoint: { x: 0, y: 0, z: -over }, dir: { x: 0, y: 0, z: 1 } }
}

export function computeTransverseBoreTool(
  dowel: DowelDims,
  cut: DowelBoreTransverse,
): CylinderToolDescriptor {
  const R = dowel.diameter / 2
  const over = dowel.diameter
  const az = cut.azimuth * DEG2RAD
  const through = cut.depth >= dowel.diameter
  const height = (through ? dowel.diameter : cut.depth) + over
  return {
    radius: cut.diameter / 2,
    height,
    basePoint: { x: (R + over) * Math.cos(az), y: (R + over) * Math.sin(az), z: cut.position },
    dir: { x: -Math.cos(az), y: -Math.sin(az), z: 0 },
  }
}
```

- [ ] **Step 4: Run, verify pass; typecheck; lint; commit**

Run: `pnpm vitest run src/geom/dowelCut.test.ts && pnpm typecheck && pnpm lint`

```bash
git add src/geom/dowelCut.ts src/geom/dowelCut.test.ts
git commit -m "feat(dowel): pure axial + transverse bore tool math"
```

---

### Task 8: OCCT `makeCylinderCut` + bore arms in `makeDowelShape`

**Files:**
- Modify: `src/geom/occt.ts`
- Test: `src/geom/occt.test.ts`

- [ ] **Step 1: Implement `makeCylinderCut`**

In `src/geom/occt.ts`, ensure `CylinderToolDescriptor` and the two bore-tool functions are imported from `./dowelCut`:

```ts
import {
  computeEndTool,
  computeAxialBoreTool,
  computeTransverseBoreTool,
  type BoxToolDescriptor,
  type CylinderToolDescriptor,
} from './dowelCut'
```

Add after `makeBoxCutAt`:

```ts
// Build an oriented cylinder tool and subtract it. Serves both bore types.
// gp_Ax2_3 / BRepPrimAPI_MakeCylinder_3 overloads are this design's best read of
// the embind API and are UNVERIFIED until the live OCCT spike (browser-only).
export function makeCylinderCut(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  tool: CylinderToolDescriptor,
): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const pnt = new O.gp_Pnt_3(tool.basePoint.x, tool.basePoint.y, tool.basePoint.z)
  const dir = new O.gp_Dir_4(tool.dir.x, tool.dir.y, tool.dir.z)
  const ax2 = new O.gp_Ax2_3(pnt, dir)
  const builder = new O.BRepPrimAPI_MakeCylinder_3(ax2, tool.radius, tool.height)
  const toolShape = builder.Shape()
  builder.delete()
  ax2.delete()
  pnt.delete()
  dir.delete()

  const pr1 = new O.Message_ProgressRange_1()
  const op = new O.BRepAlgoAPI_Cut_3(shape, toolShape, pr1)
  pr1.delete()
  const pr2 = new O.Message_ProgressRange_1()
  op.Build(pr2)
  pr2.delete()

  const cleanup = () => {
    op.delete()
    toolShape.delete()
  }
  if (!op.IsDone()) {
    console.warn('makeCylinderCut: BRepAlgoAPI_Cut did not complete — returning input shape')
    cleanup()
    return shape
  }
  const result = op.Shape()
  cleanup()
  return result
}
```

- [ ] **Step 2: Fill the bore arms in `makeDowelShape`**

Replace the `bore-axial`/`bore-transverse` placeholder arms:

```ts
      case 'bore-axial':
        if (cut.diameter <= 0 || cut.depth <= 0) continue
        current = makeCylinderCut(oc, current, computeAxialBoreTool(dowel, cut))
        break
      case 'bore-transverse':
        if (cut.diameter <= 0 || cut.depth <= 0) continue
        current = makeCylinderCut(oc, current, computeTransverseBoreTool(dowel, cut))
        break
```

(Leave `notch` falling through to Phase 3; keep the `notch` arm as a `continue` for now.)

- [ ] **Step 3: Extend the skipped smoke test**

Add to `src/geom/occt.test.ts`:

```ts
it.skip('makeDowelShape applies axial + transverse bores (needs WASM)', async () => {
  const oc = await initOCCT()
  const shape = makeDowelShape(oc, {
    diameter: 8,
    length: 100,
    cuts: [
      { kind: 'bore-axial', id: 'a', label: 'Bore 1', end: '+Z', diameter: 3, depth: 20 },
      { kind: 'bore-transverse', id: 'b', label: 'Bore 2', position: 50, azimuth: 0, diameter: 3, depth: 8 },
    ],
  })
  expect(shape).toBeTruthy()
  shape.delete()
})
```

- [ ] **Step 4: Typecheck, lint, test, commit**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/geom/occt.test.ts`

```bash
git add src/geom/occt.ts src/geom/occt.test.ts
git commit -m "feat(dowel): makeCylinderCut + bore arms in makeDowelShape"
```

---

### Task 9: Bore tools in `useAddCut` + bore rows in `DowelCutsPanel`

**Files:**
- Modify: `src/scene/useAddCut.test.ts`
- Modify: `src/ui/DowelCutsPanel.tsx`
- Modify: `src/ui/DowelCutsPanel.test.tsx`

> The `useAddCut` cylinder branch (Task 5) already handles `bore-axial` (cap) and `bore-transverse` (lateral). Tasks here add coverage + the editor rows.

- [ ] **Step 1: Add `useAddCut` bore tests**

Append to `src/scene/useAddCut.test.ts`:

```ts
describe('useAddCut — dowel bore tools', () => {
  it('Axial bore on a cap seeds a through bore', () => {
    let parts: Part[] = [dowel()]
    const onUpdate = vi.fn((id, updater) => {
      parts = parts.map((p) => (p.id === id ? updater(p) : p))
    })
    const { result } = renderHook(() => useAddCut({ parts, onUpdate, onSelect: vi.fn() }))
    act(() => result.current.armDowelTool('bore-axial'))
    act(() => result.current.onFaceClick(capHit()))
    const cut = (parts[0] as CylinderPart).cuts[0]
    expect(cut).toMatchObject({ kind: 'bore-axial', end: '+Z' })
  })

  it('Transverse bore on the lateral surface uses the hit azimuth + height', () => {
    let parts: Part[] = [dowel()]
    const onUpdate = vi.fn((id, updater) => {
      parts = parts.map((p) => (p.id === id ? updater(p) : p))
    })
    const { result } = renderHook(() => useAddCut({ parts, onUpdate, onSelect: vi.fn() }))
    act(() => result.current.armDowelTool('bore-transverse'))
    act(() => result.current.onFaceClick(lateralHit()))
    const cut = (parts[0] as CylinderPart).cuts[0]
    expect(cut).toMatchObject({ kind: 'bore-transverse', position: 50, azimuth: 0 })
  })
})
```

- [ ] **Step 2: Run, verify pass** (the Task 5 implementation already supports these)

Run: `pnpm vitest run src/scene/useAddCut.test.ts`
Expected: PASS. If a bore branch is missing, complete the corresponding `switch` arm from Task 5 Step 3.

- [ ] **Step 3: Add bore editor rows**

In `src/ui/DowelCutsPanel.tsx`, add inside the cut-row map, after the `end` block:

```tsx
          {cut.kind === 'bore-axial' && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => patch(cut.id, { end: cut.end === '+Z' ? '-Z' : '+Z' })}
              >
                End: {cut.end}
              </Button>
              <Button size="sm" variant="outline" onClick={() => patch(cut.id, { depth: part.length })}>
                Through
              </Button>
              {num(`${cut.id}-dia`, cut.diameter, (v) => patch(cut.id, { diameter: v }), 'Diameter')}
              {num(`${cut.id}-depth`, cut.depth, (v) => patch(cut.id, { depth: v }), 'Depth')}
            </div>
          )}

          {cut.kind === 'bore-transverse' && (
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => patch(cut.id, { depth: part.diameter })}>
                Through
              </Button>
              {num(`${cut.id}-pos`, cut.position, (v) => patch(cut.id, { position: v }), 'Position')}
              {num(`${cut.id}-azimuth`, cut.azimuth, (v) => patch(cut.id, { azimuth: v }), 'Azimuth')}
              {num(`${cut.id}-dia`, cut.diameter, (v) => patch(cut.id, { diameter: v }), 'Diameter')}
              {num(`${cut.id}-depth`, cut.depth, (v) => patch(cut.id, { depth: v }), 'Depth')}
            </div>
          )}
```

- [ ] **Step 4: Add a component test for a bore row**

Append to `src/ui/DowelCutsPanel.test.tsx`:

```tsx
it('renders bore-transverse inputs', () => {
  const part = dowel()
  part.cuts = [
    { kind: 'bore-transverse', id: 'b1', label: 'Bore 1', position: 50, azimuth: 0, diameter: 3, depth: 8 },
  ]
  render(<DowelCutsPanel part={part} dowelTool={null} armDowelTool={vi.fn()} onUpdate={vi.fn()} />)
  expect(screen.getByLabelText(/position/i)).toBeTruthy()
  expect(screen.getByLabelText(/depth/i)).toBeTruthy()
})
```

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/scene/useAddCut.test.ts src/ui/DowelCutsPanel.tsx src/ui/DowelCutsPanel.test.tsx
git commit -m "feat(dowel): bore authoring + editor rows"
```

**Phase 2 checkpoint:** arm "Axial bore" / "Transverse bore", click the matching surface, edit Ø/depth/through. Verify live in `pnpm dev`.

---

## PHASE 3 — Notch

### Task 10: Pure notch tool math

**Files:**
- Modify: `src/geom/dowelCut.ts`
- Test: `src/geom/dowelCut.test.ts`

- [ ] **Step 1: Add failing test**

Append to `src/geom/dowelCut.test.ts`:

```ts
import { computeNotchTool } from './dowelCut'
import type { DowelNotch } from '../scene/types'

describe('computeNotchTool', () => {
  const base: DowelNotch = { kind: 'notch', id: 'c', label: 'Notch', position: 50, width: 20, depth: 4, azimuth: 0 }
  it('half-lap (depth = radius) puts the inner face on the axis', () => {
    const t = computeNotchTool(dowel, base) // R = 4, depth 4
    expect(t.boxOrigin.x).toBeCloseTo(0) // R - depth = 0
  })
  it('box spans `width` along the axis centered at `position`', () => {
    const t = computeNotchTool(dowel, base)
    expect(t.boxOrigin.z).toBeCloseTo(40) // position - width/2
    expect(t.boxSize.z).toBeCloseTo(20)
  })
  it('azimuth rotates the box about the dowel axis', () => {
    const t = computeNotchTool(dowel, { ...base, azimuth: 90 })
    expect(t.axisDir).toMatchObject({ x: 0, y: 0, z: 1 })
    expect(t.angleRad).toBeCloseTo((90 * Math.PI) / 180)
  })
})
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm vitest run src/geom/dowelCut.test.ts`
Expected: FAIL — `computeNotchTool` not exported.

- [ ] **Step 3: Implement**

Append to `src/geom/dowelCut.ts` (add `DowelNotch` to the type import):

```ts
export function computeNotchTool(dowel: DowelDims, cut: DowelNotch): BoxToolDescriptor {
  const R = dowel.diameter / 2
  const BIG = 4 * (dowel.diameter + dowel.length)
  const span = 2 * BIG
  // Before rotation the notch faces +X: remove material with x ≥ R - depth,
  // over z ∈ [position - width/2, position + width/2]. azimuth handled by a
  // rotation about the +Z axis through the dowel axis.
  return {
    boxOrigin: { x: R - cut.depth, y: -BIG, z: cut.position - cut.width / 2 },
    boxSize: { x: span, y: span, z: cut.width },
    pivot: { x: 0, y: 0, z: 0 },
    axisDir: { x: 0, y: 0, z: 1 },
    angleRad: cut.azimuth * DEG2RAD,
  }
}
```

- [ ] **Step 4: Run, verify pass; typecheck; lint; commit**

Run: `pnpm vitest run src/geom/dowelCut.test.ts && pnpm typecheck && pnpm lint`

```bash
git add src/geom/dowelCut.ts src/geom/dowelCut.test.ts
git commit -m "feat(dowel): pure notch tool math"
```

---

### Task 11: Notch arm in `makeDowelShape`

**Files:**
- Modify: `src/geom/occt.ts`
- Test: `src/geom/occt.test.ts`

- [ ] **Step 1: Wire the notch arm**

In `src/geom/occt.ts`, import `computeNotchTool` from `./dowelCut`, and replace the `notch` arm in `makeDowelShape`:

```ts
      case 'notch':
        if (cut.depth <= 0 || cut.width <= 0) continue
        current = makeBoxCutAt(oc, current, computeNotchTool(dowel, cut))
        break
```

- [ ] **Step 2: Extend the skipped smoke test**

Add to `src/geom/occt.test.ts`:

```ts
it.skip('makeDowelShape applies a notch (needs WASM)', async () => {
  const oc = await initOCCT()
  const shape = makeDowelShape(oc, {
    diameter: 8,
    length: 100,
    cuts: [{ kind: 'notch', id: 'n', label: 'Notch 1', position: 50, width: 20, depth: 4, azimuth: 0 }],
  })
  expect(shape).toBeTruthy()
  shape.delete()
})
```

- [ ] **Step 3: Typecheck, lint, test, commit**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/geom/occt.test.ts`

```bash
git add src/geom/occt.ts src/geom/occt.test.ts
git commit -m "feat(dowel): notch arm in makeDowelShape"
```

---

### Task 12: Notch authoring + editor row

**Files:**
- Modify: `src/scene/useAddCut.test.ts`
- Modify: `src/ui/DowelCutsPanel.tsx`
- Modify: `src/ui/DowelCutsPanel.test.tsx`

> The `useAddCut` `notch` arm already exists (Task 5). This task adds coverage + the editor row.

- [ ] **Step 1: Add `useAddCut` notch test**

Append to `src/scene/useAddCut.test.ts`:

```ts
it('Notch tool on the lateral surface seeds a half-lap at the hit', () => {
  let parts: Part[] = [dowel()]
  const onUpdate = vi.fn((id, updater) => {
    parts = parts.map((p) => (p.id === id ? updater(p) : p))
  })
  const { result } = renderHook(() => useAddCut({ parts, onUpdate, onSelect: vi.fn() }))
  act(() => result.current.armDowelTool('notch'))
  act(() => result.current.onFaceClick(lateralHit()))
  const cut = (parts[0] as CylinderPart).cuts[0]
  expect(cut).toMatchObject({ kind: 'notch', position: 50, azimuth: 0, depth: 4 })
})

it('Notch tool ignores a cap click', () => {
  const onUpdate = vi.fn()
  const { result } = renderHook(() => useAddCut({ parts: [dowel()], onUpdate, onSelect: vi.fn() }))
  act(() => result.current.armDowelTool('notch'))
  act(() => result.current.onFaceClick(capHit()))
  expect(onUpdate).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Add the notch editor row**

In `src/ui/DowelCutsPanel.tsx`, add inside the cut-row map:

```tsx
          {cut.kind === 'notch' && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => patch(cut.id, { depth: part.diameter / 2 })}
              >
                Half-lap
              </Button>
              {num(`${cut.id}-pos`, cut.position, (v) => patch(cut.id, { position: v }), 'Position')}
              {num(`${cut.id}-width`, cut.width, (v) => patch(cut.id, { width: v }), 'Width')}
              {num(`${cut.id}-depth`, cut.depth, (v) => patch(cut.id, { depth: v }), 'Depth')}
              {num(`${cut.id}-azimuth`, cut.azimuth, (v) => patch(cut.id, { azimuth: v }), 'Azimuth')}
            </div>
          )}
```

- [ ] **Step 3: Add a notch component test**

Append to `src/ui/DowelCutsPanel.test.tsx`:

```tsx
it('renders notch inputs', () => {
  const part = dowel()
  part.cuts = [{ kind: 'notch', id: 'n1', label: 'Notch 1', position: 50, width: 20, depth: 4, azimuth: 0 }]
  render(<DowelCutsPanel part={part} dowelTool={null} armDowelTool={vi.fn()} onUpdate={vi.fn()} />)
  expect(screen.getByLabelText(/width/i)).toBeTruthy()
})
```

- [ ] **Step 4: Full suite, typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add src/scene/useAddCut.test.ts src/ui/DowelCutsPanel.tsx src/ui/DowelCutsPanel.test.tsx
git commit -m "feat(dowel): notch authoring + editor row"
```

**Phase 3 checkpoint:** arm "Notch", click the lateral surface, get a half-lap; edit width/depth/azimuth. Verify live.

---

### Task 13: Implementation notes + final verification

**Files:**
- Create: `docs/superpowers/notes/2026-06-19-dowel-cuts-notes.md`

- [ ] **Step 1: Write the notes file**

Create `docs/superpowers/notes/2026-06-19-dowel-cuts-notes.md` capturing:
- **Base-branch dependency:** SP2 was built on main + SP1 (PR #6 merged/rebased).
- **Deviation from spec §4:** seeded end-cut default angle is **45°**, not 0° — a 0° default is a no-op on click and produces no visible cut.
- **UNVERIFIED OCCT overloads:** `gp_Ax2_3`, `gp_Dir_4`, `gp_Pnt_3`, `BRepPrimAPI_MakeCylinder_3`, `gp_Ax1_2`, `BRepBuilderAPI_Transform_2` for the bore/box tools — confirm in the live spike; record the working overload ids here.
- **Angle/azimuth sign conventions** for `computeEndTool` (pinned by tests) — note any sign flips discovered during the live spike.
- **`through` representation:** numeric depth ≥ extent; tools overshoot by `dowel.diameter`. Note if the overshoot needed tuning.
- Any deferred polish: dowel cut-linking, smooth shading, faceted edge lines on the curved surface, 2D drawings (SP4), snap (SP3).

- [ ] **Step 2: Live WASM spike (browser)**

Run `pnpm dev`, add a dowel, and exercise each cut type (end, axial bore, transverse bore, notch) confirming each re-meshes and renders correctly. STL/STEP export includes the cut dowel. Save/reopen round-trips the cuts. Fix any OCCT overload mismatches and update the notes. (OCCT is browser-only; Node tests skip the kernel.)

- [ ] **Step 3: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green; new skipped OCCT tests reported as skipped.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-06-19-dowel-cuts-notes.md
git commit -m "docs(dowel): SP2 implementation notes"
```

- [ ] **Step 5: Push**

```bash
git push -u origin <sp2-branch>
```

---

## Self-Review

**Spec coverage:**
- Data model (DowelCut union, `cuts` field, no `pairedCutId`, numeric depth, no format bump) → Task 1.
- Pure math module (4 tools + seeding helpers) → Tasks 2, 7, 10.
- OCCT plumbing (`makeBoxCutAt`, `makeCylinderCut`, `makeDowelShape`; unverified-overload flag) → Tasks 3, 8, 11.
- Click-to-seed interaction (tool selector, surface resolution, hit→param, mismatch no-op, undo/redo via onUpdate, disarm) → Tasks 5, 9, 12.
- Worker + export seams (BuildSpec/ExportSpec cylinder cuts; mesh/STL unchanged) → Tasks 3–4, 8.
- Sidebar editor (arm buttons + per-kind rows + quick-sets) → Tasks 6, 9, 12.
- `shapeKey` + file load default `[]` → Task 1.
- Testing (pure math, occt skip-smoke, worker/buildSpec, useAddCut, EditPanel, round-trip) → distributed across all tasks.
- Phasing (end → bores → notch) → Phases 1–3.
- Out of scope (linking, snap, 2D drawings, smooth shading) → noted, untouched.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The two anchored edits that reference existing structure (`useFile.parseFile` cylinder branch in Task 1 Step 7.3; sidebar/App prop threading in Task 6 Step 5) are unavoidable because those SP1 files are large and only exist post-merge — each gives the exact code to add and the existing pattern to mirror.

**Type consistency:** `BoxToolDescriptor`/`CylinderToolDescriptor` (dowelCut.ts) are consumed unchanged by `makeBoxCutAt`/`makeCylinderCut` (occt.ts). `DowelCutTool` is defined once in `useAddCut.ts` and imported by `DowelCutsPanel`. `makeDowelShape`'s signature `{ diameter, length, cuts }` is identical at every call site (worker, `makeTransformedShape`). `buildSpecForPart`/`ExportSpec` cylinder arms both carry `cuts: DowelCut[]`. `armDowelTool`/`dowelTool` names match across `useAddCut` → `App` → `Sidebar` → `DowelCutsPanel`.
