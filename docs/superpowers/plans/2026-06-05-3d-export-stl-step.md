# 3D Geometry Export (STL + STEP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the current scene to a binary **STL** mesh and a **STEP** B-rep file of named solids, both delivered as browser Blob downloads.

**Architecture:** Hybrid. STL is built on the main thread from the already-rendered non-indexed `BufferGeometry`. STEP is built in the OCCT worker via `STEPCAFControl_Writer` + an XCAF document (named solids), with a documented fallback to the plain `STEPControl_Writer`. A single pure `composeWorldMatrix(part)` computes each part's world transform and feeds both paths so they can never diverge.

**Tech Stack:** React 19 + TypeScript, Vitest + happy-dom + @testing-library/react, OpenCASCADE.js (WASM via Comlink worker), Three.js.

**Plan-time de-risking already done:** The opencascade.js build (v1.1.1) lists `STEPCAFControl_Writer`, `XCAFApp_Application`, `XCAFDoc_DocumentTool`, `TDataStd_Name`, `TDocStd_Document`, `STEPControl_Writer`, `Interface_Static`, `BRep_Builder`, `TopoDS_Compound` in its **Supported APIs** doc, so the named-solid path is viable. Exact embind overload suffixes (`_1`/`_2`) and `oc.FS` read-back are confirmed at runtime by the **Task 6 live spike**.

---

## File map

| File | Action |
|---|---|
| `src/geom/transform.ts` | **Create.** `composeWorldMatrix(part)`, `applyMatrixToPoint(m,x,y,z)`. Pure, no THREE import. |
| `src/geom/transform.test.ts` | **Create.** Parity vs `THREE.Matrix4`. |
| `src/geom/stl.ts` | **Create.** `buildBinaryStl(parts, geometries)`. |
| `src/geom/stl.test.ts` | **Create.** Binary STL structure + transforms. |
| `src/ui/download.ts` | **Create.** `downloadBlob(data, filename, mime)`. |
| `src/ui/download.test.ts` | **Create.** Anchor + Blob behaviour. |
| `src/geom/occt.ts` | **Modify.** Add `makeShape(oc, dims)`, `ExportSpec` type, `writeStep(oc, specs)`. |
| `src/geom/occt.test.ts` | **Modify.** `makeShape` export check; skipped browser STEP smoke. |
| `src/geom/occt.worker.ts` | **Modify.** `buildPart` uses `makeShape`; add `exportStep(specs)`. |
| `src/scene/useScene.ts` | **Modify.** Add `exportStep(parts)` to hook + `UseSceneResult`. |
| `src/scene/useScene.test.ts` | **Modify.** Extend comlink mock; test `exportStep`. |
| `src/App.tsx` | **Modify.** `visibleParts`, `canExport`, `handleExportStl`, `handleExportStep`; pass to `FileMenu`. |
| `src/ui/FileMenu.tsx` | **Modify.** Props `onExportStl`, `onExportStep`, `canExport`; two menu items. |
| `src/ui/FileMenu.test.tsx` | **Modify.** Extend `baseProps`; export-item tests. |

**Commit identity:** before the first commit run `git config user.email noreply@anthropic.com && git config user.name Claude` (a stop-hook enforces this). Develop on branch `claude/optimistic-cori-FltT4`.

---

## Task 1: `composeWorldMatrix` + `applyMatrixToPoint`

**Files:**
- Create: `src/geom/transform.ts`
- Create: `src/geom/transform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/geom/transform.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'
import type { Part } from '../scene/types'

function part(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'P',
    length: 100,
    width: 50,
    thickness: 25,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

// Reference world matrix exactly as the viewport builds it:
// mesh.position + mesh.rotation.set(rx, ry, rz, 'XYZ'), degrees -> radians.
function threeMatrix(p: Part): number[] {
  const deg2rad = Math.PI / 180
  const e = new THREE.Euler(
    p.rotation.x * deg2rad,
    p.rotation.y * deg2rad,
    p.rotation.z * deg2rad,
    'XYZ',
  )
  const q = new THREE.Quaternion().setFromEuler(e)
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(p.position.x, p.position.y, p.position.z),
    q,
    new THREE.Vector3(1, 1, 1),
  )
  return Array.from(m.elements)
}

function expectMatrixClose(actual: Float64Array, expected: number[]) {
  for (let i = 0; i < 16; i++) expect(actual[i]).toBeCloseTo(expected[i], 9)
}

describe('composeWorldMatrix', () => {
  it('identity for zero position/rotation', () => {
    expectMatrixClose(composeWorldMatrix(part()), threeMatrix(part()))
  })

  it('pure translation', () => {
    const p = part({ position: { x: 12, y: -7, z: 3 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })

  it('rotation about X only', () => {
    const p = part({ rotation: { x: 90, y: 0, z: 0 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })

  it('rotation about Y only', () => {
    const p = part({ rotation: { x: 0, y: 90, z: 0 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })

  it('rotation about Z only', () => {
    const p = part({ rotation: { x: 0, y: 0, z: 90 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })

  it('combined rotation + translation', () => {
    const p = part({ position: { x: 5, y: 6, z: 7 }, rotation: { x: 30, y: 45, z: 60 } })
    expectMatrixClose(composeWorldMatrix(p), threeMatrix(p))
  })
})

describe('applyMatrixToPoint', () => {
  it('matches THREE.Vector3.applyMatrix4 for a combined transform', () => {
    const p = part({ position: { x: 5, y: 6, z: 7 }, rotation: { x: 30, y: 45, z: 60 } })
    const m = composeWorldMatrix(p)
    const [x, y, z] = applyMatrixToPoint(m, 2, 3, 4)
    const v = new THREE.Vector3(2, 3, 4).applyMatrix4(
      new THREE.Matrix4().fromArray(Array.from(m)),
    )
    expect(x).toBeCloseTo(v.x, 9)
    expect(y).toBeCloseTo(v.y, 9)
    expect(z).toBeCloseTo(v.z, 9)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/geom/transform.test.ts`
Expected: FAIL — cannot resolve module `./transform`.

- [ ] **Step 3: Write the implementation**

Create `src/geom/transform.ts`:

```typescript
import type { Part } from '../scene/types'

const DEG2RAD = Math.PI / 180

// Column-major (THREE Matrix4.elements layout). Equivalent to
// new THREE.Matrix4().compose(position, quaternion(Euler XYZ deg), (1,1,1)).
export function composeWorldMatrix(part: Part): Float64Array {
  const x = part.rotation.x * DEG2RAD
  const y = part.rotation.y * DEG2RAD
  const z = part.rotation.z * DEG2RAD
  const cx = Math.cos(x)
  const sx = Math.sin(x)
  const cy = Math.cos(y)
  const sy = Math.sin(y)
  const cz = Math.cos(z)
  const sz = Math.sin(z)

  // Rotation for THREE Euler order 'XYZ' (R = Rx * Ry * Rz), row-major r[row][col]:
  const r00 = cy * cz
  const r01 = -cy * sz
  const r02 = sy
  const r10 = cx * sz + sx * sy * cz
  const r11 = cx * cz - sx * sy * sz
  const r12 = -sx * cy
  const r20 = sx * sz - cx * sy * cz
  const r21 = sx * cz + cx * sy * sz
  const r22 = cx * cy

  const m = new Float64Array(16)
  m[0] = r00
  m[1] = r10
  m[2] = r20
  m[3] = 0
  m[4] = r01
  m[5] = r11
  m[6] = r21
  m[7] = 0
  m[8] = r02
  m[9] = r12
  m[10] = r22
  m[11] = 0
  m[12] = part.position.x
  m[13] = part.position.y
  m[14] = part.position.z
  m[15] = 1
  return m
}

// Apply a column-major 4x4 to (x,y,z) as a position (w=1).
export function applyMatrixToPoint(
  m: Float64Array,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/geom/transform.test.ts`
Expected: PASS (7 tests). If any rotation case fails, the closed form is wrong — adjust `r00..r22` to match THREE (THREE is authoritative), do not change the test.

- [ ] **Step 5: Commit**

```bash
git add src/geom/transform.ts src/geom/transform.test.ts
git commit -m "feat: add composeWorldMatrix transform util with THREE parity"
```

---

## Task 2: `buildBinaryStl`

**Files:**
- Create: `src/geom/stl.ts`
- Create: `src/geom/stl.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/geom/stl.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildBinaryStl } from './stl'
import type { Part, PartId } from '../scene/types'

function part(overrides: Partial<Part> = {}): Part {
  return {
    kind: 'board',
    id: 'p1',
    label: 'P',
    length: 100,
    width: 50,
    thickness: 25,
    material: '',
    color: '#fff',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    ...overrides,
  }
}

// One triangle in the XY plane, CCW so the facet normal is +Z.
function oneTriangleGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

describe('buildBinaryStl', () => {
  it('empty scene -> 84-byte buffer, count 0', () => {
    const buf = buildBinaryStl([], new Map())
    expect(buf.byteLength).toBe(84)
    expect(new DataView(buf).getUint32(80, true)).toBe(0)
  })

  it('one triangle -> count 1, correct size, facet normal +Z', () => {
    const geos = new Map<PartId, THREE.BufferGeometry>([['p1', oneTriangleGeo()]])
    const buf = buildBinaryStl([part()], geos)
    expect(buf.byteLength).toBe(84 + 50)
    const dv = new DataView(buf)
    expect(dv.getUint32(80, true)).toBe(1)
    // facet normal at offset 84
    expect(dv.getFloat32(84, true)).toBeCloseTo(0, 5)
    expect(dv.getFloat32(88, true)).toBeCloseTo(0, 5)
    expect(dv.getFloat32(92, true)).toBeCloseTo(1, 5)
    // first vertex at offset 96 = (0,0,0)
    expect(dv.getFloat32(96, true)).toBeCloseTo(0, 5)
    expect(dv.getFloat32(100, true)).toBeCloseTo(0, 5)
    expect(dv.getFloat32(104, true)).toBeCloseTo(0, 5)
  })

  it('applies the part world translation to vertices', () => {
    const geos = new Map<PartId, THREE.BufferGeometry>([['p1', oneTriangleGeo()]])
    const buf = buildBinaryStl([part({ position: { x: 10, y: 20, z: 30 } })], geos)
    const dv = new DataView(buf)
    // first vertex (0,0,0) translated -> (10,20,30) at offset 96
    expect(dv.getFloat32(96, true)).toBeCloseTo(10, 4)
    expect(dv.getFloat32(100, true)).toBeCloseTo(20, 4)
    expect(dv.getFloat32(104, true)).toBeCloseTo(30, 4)
  })

  it('sums triangles across parts', () => {
    const geos = new Map<PartId, THREE.BufferGeometry>([
      ['p1', oneTriangleGeo()],
      ['p2', oneTriangleGeo()],
    ])
    const buf = buildBinaryStl([part(), part({ id: 'p2' })], geos)
    expect(new DataView(buf).getUint32(80, true)).toBe(2)
  })

  it('skips a part with no geometry entry', () => {
    const geos = new Map<PartId, THREE.BufferGeometry>([['p1', oneTriangleGeo()]])
    const buf = buildBinaryStl([part(), part({ id: 'missing' })], geos)
    expect(new DataView(buf).getUint32(80, true)).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/geom/stl.test.ts`
Expected: FAIL — cannot resolve module `./stl`.

- [ ] **Step 3: Write the implementation**

Create `src/geom/stl.ts`:

```typescript
import * as THREE from 'three'
import type { Part, PartId } from '../scene/types'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'

type Vec = [number, number, number]

function facetNormal(a: Vec, b: Vec, c: Vec): Vec {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  if (len === 0) return [0, 0, 0]
  return [nx / len, ny / len, nz / len]
}

export function buildBinaryStl(
  parts: Part[],
  geometries: Map<PartId, THREE.BufferGeometry>,
): ArrayBuffer {
  const tris: number[] = [] // per triangle: nx,ny,nz, ax,ay,az, bx,by,bz, cx,cy,cz
  let count = 0
  for (const part of parts) {
    const geo = geometries.get(part.id)
    if (!geo) continue
    const pos = geo.getAttribute('position')
    if (!pos) continue
    const m = composeWorldMatrix(part)
    for (let i = 0; i < pos.count; i += 3) {
      const a = applyMatrixToPoint(m, pos.getX(i), pos.getY(i), pos.getZ(i))
      const b = applyMatrixToPoint(m, pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1))
      const c = applyMatrixToPoint(m, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2))
      const n = facetNormal(a, b, c)
      tris.push(n[0], n[1], n[2], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
      count++
    }
  }

  const buffer = new ArrayBuffer(84 + count * 50)
  const view = new DataView(buffer)
  const header = 'Zimmu STL export'
  for (let i = 0; i < header.length && i < 80; i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, count, true)

  let off = 84
  for (let t = 0; t < tris.length; t += 12) {
    for (let k = 0; k < 12; k++) view.setFloat32(off + k * 4, tris[t + k], true)
    view.setUint16(off + 48, 0, true) // attribute byte count
    off += 50
  }
  return buffer
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/geom/stl.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geom/stl.ts src/geom/stl.test.ts
git commit -m "feat: add buildBinaryStl world-space mesh exporter"
```

---

## Task 3: `downloadBlob`

**Files:**
- Create: `src/ui/download.ts`
- Create: `src/ui/download.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/download.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from './download'

describe('downloadBlob', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('creates an anchor with the filename, clicks it, and revokes the url', () => {
    const click = vi.fn()
    const anchor = { href: '', download: '', click } as unknown as HTMLAnchorElement
    const createEl = vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    downloadBlob(new ArrayBuffer(4), 'thing.stl', 'model/stl')

    expect(createEl).toHaveBeenCalledWith('a')
    expect(anchor.download).toBe('thing.stl')
    expect(anchor.href).toBe('blob:fake')
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/ui/download.test.ts`
Expected: FAIL — cannot resolve module `./download`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/download.ts`:

```typescript
export function downloadBlob(data: BlobPart, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/ui/download.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/download.ts src/ui/download.test.ts
git commit -m "feat: add downloadBlob helper"
```

---

## Task 4: Extract `makeShape` (shared solid builder)

**Files:**
- Modify: `src/geom/occt.ts`
- Modify: `src/geom/occt.worker.ts`
- Modify: `src/geom/occt.test.ts`

This is a refactor — behaviour is unchanged. The existing worker tests and `useScene` tests must stay green.

- [ ] **Step 1: Add `makeShape` and `ExportSpec` to `src/geom/occt.ts`**

Append after `makeCut` (end of file). `makeBox`, `makeCut`, `Vec3`, `OpenCascadeInstance`, `TopoDS_Shape` are already imported/defined in the file.

```typescript
export interface ExportSpec {
  label: string
  length: number
  width: number
  thickness: number
  cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
  matrix: number[] // column-major 16, from composeWorldMatrix
}

export function makeShape(
  oc: OpenCascadeInstance,
  dims: {
    length: number
    width: number
    thickness: number
    cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
  },
): TopoDS_Shape {
  const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
  let current = makeBox(oc, dims.length, dims.width, dims.thickness)
  for (const cut of sorted) {
    if (cut.size.x <= 0.1 || cut.size.y <= 0.1 || cut.size.z <= 0.1) continue
    const prev = current
    current = makeCut(oc, current, cut.position, cut.size)
    if (prev !== current) prev.delete()
  }
  return current
}
```

- [ ] **Step 2: Refactor `buildPart` in `src/geom/occt.worker.ts` to use `makeShape`**

Replace the whole `if (kind === 'board') { ... }` body's shape-building loop. The new file:

```typescript
import { expose, transfer } from 'comlink'
import { initOCCT, makeShape } from './occt'
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
      const shape = makeShape(oc, dims)
      const data = shapeToMeshData(oc, shape, { linearDeflection: 0.1, angularDeflection: 0.5 })
      shape.delete()
      return transfer(data, [data.positions.buffer, data.normals.buffer])
    }
    const _: never = kind
    throw new Error(`unknown kind: ${_}`)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
```

(Note: `makeBox`/`makeCut` are no longer imported by the worker — they are used via `makeShape` inside `occt.ts`.)

- [ ] **Step 3: Add a `makeShape` export check to `src/geom/occt.test.ts`**

Update the import line to include `makeShape` and add one test (place it next to the existing `makeCut` export check):

```typescript
import { initOCCT, makeBox, makeCut, makeShape } from './occt'

it('exports makeShape', () => {
  expect(typeof makeShape).toBe('function')
})
```

- [ ] **Step 4: Run the full suite to verify nothing regressed**

Run: `pnpm typecheck && pnpm test`
Expected: clean — all existing tests still pass, plus the new `makeShape` check.

- [ ] **Step 5: Commit**

```bash
git add src/geom/occt.ts src/geom/occt.worker.ts src/geom/occt.test.ts
git commit -m "refactor: extract makeShape shared by buildPart and export"
```

---

## Task 5: `writeStep` + worker `exportStep` + `useScene.exportStep`

**Files:**
- Modify: `src/geom/occt.ts`
- Modify: `src/geom/occt.worker.ts`
- Modify: `src/geom/occt.test.ts`
- Modify: `src/scene/useScene.ts`
- Modify: `src/scene/useScene.test.ts`

The CAF binding symbols below are the design's best reading; the **Task 6 live spike** confirms/fixes them. The `useScene` unit test (mocked worker) and the `occt.test` export check run in Node now; the STEP body itself only runs in the browser.

- [ ] **Step 1: Write the failing `useScene.exportStep` test**

In `src/scene/useScene.test.ts`, extend the comlink mock and add a test.

Add a module-level mock fn near `const mockBuildPart = vi.fn()`:

```typescript
const mockExportStep = vi.fn()
```

Update the `vi.mock('comlink', ...)` factory's `wrap` to expose it:

```typescript
vi.mock('comlink', () => ({
  wrap: () => ({ buildPart: mockBuildPart, buildBox: vi.fn(), exportStep: mockExportStep }),
  expose: vi.fn(),
  transfer: vi.fn((data: unknown) => data),
}))
```

Add this test inside `describe('useScene', ...)` (after the existing tests):

```typescript
it('exportStep builds one spec per part with a 16-element matrix and returns the worker string', async () => {
  mockExportStep.mockResolvedValue('ISO-10303-21;\nENDSEC;')
  const { result } = renderHook(() => useScene())
  const parts = result.current.scene.parts

  const text = await result.current.exportStep(parts)

  expect(text).toContain('ISO-10303-21')
  expect(mockExportStep).toHaveBeenCalledTimes(1)
  const specs = mockExportStep.mock.calls[0][0] as Array<{
    label: string
    length: number
    cuts: unknown[]
    matrix: number[]
  }>
  expect(specs).toHaveLength(parts.length)
  expect(specs[0].label).toBe(parts[0].label)
  expect(specs[0].length).toBe(parts[0].length)
  expect(specs[0].matrix).toHaveLength(16)
  expect(Array.isArray(specs[0].cuts)).toBe(true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/scene/useScene.test.ts -t "exportStep"`
Expected: FAIL — `result.current.exportStep is not a function`.

- [ ] **Step 3: Add `writeStep` to `src/geom/occt.ts`**

Append after `makeShape`. Uses `(oc as any)` casts matching the existing `makeCut` style.

```typescript
function makeTransformedShape(oc: OpenCascadeInstance, spec: ExportSpec): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const shape = makeShape(oc, spec)
  const trsf = new O.gp_Trsf_1()
  // gp_Trsf.SetValues expects row-major 3x4 (a11..a14, a21..a24, a31..a34).
  // spec.matrix is column-major: m[col*4 + row].
  const m = spec.matrix
  trsf.SetValues(
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
  )
  const xform = new O.BRepBuilderAPI_Transform_2(shape, trsf, false)
  const moved = xform.Shape()
  shape.delete()
  trsf.delete()
  xform.delete()
  return moved
}

// Named-solid STEP via XCAF. Symbol overloads (_1/_2) confirmed by the live spike.
export function writeStep(oc: OpenCascadeInstance, specs: ExportSpec[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  O.Interface_Static.SetCVal('write.step.unit', 'MM')

  const app = O.XCAFApp_Application.GetApplication()
  const doc = new O.Handle_TDocStd_Document_1()
  app.NewDocument(new O.TCollection_ExtendedString_2('MDTV-XCAF', true), doc)
  const shapeTool = O.XCAFDoc_DocumentTool.ShapeTool(doc.get().Main())

  const moved: TopoDS_Shape[] = []
  for (const spec of specs) {
    const shape = makeTransformedShape(oc, spec)
    const lbl = shapeTool.AddShape(shape, false, true)
    O.TDataStd_Name.Set_2(lbl, new O.TCollection_ExtendedString_2(spec.label, true))
    moved.push(shape)
  }

  const writer = new O.STEPCAFControl_Writer_1()
  const pr = new O.Message_ProgressRange_1()
  writer.Transfer_1(doc, O.STEPControl_StepModelType.STEPControl_AsIs, '', pr)
  writer.Write('out.step')
  pr.delete()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text: string = (oc as any).FS.readFile('out.step', { encoding: 'utf8' })
  for (const s of moved) s.delete()
  writer.delete()
  return text
}
```

- [ ] **Step 4: Add `exportStep` to the worker `src/geom/occt.worker.ts`**

Add `writeStep` and `ExportSpec` to the import, and add the method to `api`:

```typescript
import { initOCCT, makeShape, writeStep } from './occt'
import type { ExportSpec } from './occt'
```

Add inside the `api` object (after `buildPart`):

```typescript
  async exportStep(specs: ExportSpec[]): Promise<string> {
    const oc = await initOCCT()
    return writeStep(oc, specs)
  },
```

- [ ] **Step 5: Add `exportStep` to `src/scene/useScene.ts`**

Add the import near the other geom imports:

```typescript
import { composeWorldMatrix } from '../geom/transform'
```

Add to the `UseSceneResult` interface:

```typescript
  exportStep: (parts: Part[]) => Promise<string>
```

Add the implementation in the hook body (near the other `useCallback`s, before the `return`):

```typescript
  const exportStep = useCallback(async (parts: Part[]): Promise<string> => {
    const specs = parts.map((p) => ({
      label: p.label,
      length: p.length,
      width: p.width,
      thickness: p.thickness,
      cuts: p.cuts.map(({ id, position, size }) => ({ id, position, size })),
      matrix: Array.from(composeWorldMatrix(p)),
    }))
    return getOcct().exportStep(specs)
  }, [])
```

Add `exportStep` to the returned object.

- [ ] **Step 6: Run the `useScene` test to verify it passes**

Run: `pnpm vitest run src/scene/useScene.test.ts -t "exportStep"`
Expected: PASS.

- [ ] **Step 7: Add a skipped browser smoke test to `src/geom/occt.test.ts`**

Add (it stays skipped in Node — OCCT is browser-only; it documents the live expectation):

```typescript
it.skip('writeStep: one named board returns a STEP string (browser-only)', async () => {
  const oc = await initOCCT()
  const { writeStep } = await import('./occt')
  const text = writeStep(oc, [
    {
      label: 'Rail',
      length: 200,
      width: 100,
      thickness: 25,
      cuts: [],
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    },
  ])
  expect(text).toContain('ISO-10303-21')
  expect(text).toContain('END-ISO-10303-21')
  expect(text).toContain('Rail')
})
```

- [ ] **Step 8: Run the full suite**

Run: `pnpm typecheck && pnpm test`
Expected: clean (the new smoke test is skipped).

- [ ] **Step 9: Commit**

```bash
git add src/geom/occt.ts src/geom/occt.worker.ts src/geom/occt.test.ts \
  src/scene/useScene.ts src/scene/useScene.test.ts
git commit -m "feat: add writeStep (XCAF named solids) + exportStep worker/useScene"
```

---

## Task 6: App + FileMenu wiring + LIVE SPIKE

**Files:**
- Modify: `src/ui/FileMenu.tsx`
- Modify: `src/ui/FileMenu.test.tsx`
- Modify: `src/App.tsx`

This task wires the real UI and contains the **live STEP spike** (Steps 7–9). This is the first point STEP runs against real WASM; the highest-risk item is verified here, looping back to Task 5 if the CAF symbols differ.

- [ ] **Step 1: Write failing FileMenu tests**

In `src/ui/FileMenu.test.tsx`, add the three new props to `baseProps`:

```typescript
  onExportStl: vi.fn(),
  onExportStep: vi.fn(),
  canExport: true,
```

Add tests inside `describe('FileMenu', ...)`:

```typescript
it('renders Export STL and Export STEP items', () => {
  render(<FileMenu {...baseProps} />)
  openMenu()
  expect(screen.getByRole('button', { name: /Export STL/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Export STEP/ })).toBeTruthy()
})

it('export items are disabled when canExport=false', () => {
  render(<FileMenu {...baseProps} canExport={false} />)
  openMenu()
  expect((screen.getByRole('button', { name: /Export STL/ }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  expect((screen.getByRole('button', { name: /Export STEP/ }) as HTMLButtonElement).disabled).toBe(
    true,
  )
})

it('clicking Export STL calls onExportStl', () => {
  const onExportStl = vi.fn()
  render(<FileMenu {...baseProps} onExportStl={onExportStl} />)
  openMenu()
  fireEvent.click(screen.getByRole('button', { name: /Export STL/ }))
  expect(onExportStl).toHaveBeenCalledOnce()
})

it('clicking Export STEP calls onExportStep', () => {
  const onExportStep = vi.fn()
  render(<FileMenu {...baseProps} onExportStep={onExportStep} />)
  openMenu()
  fireEvent.click(screen.getByRole('button', { name: /Export STEP/ }))
  expect(onExportStep).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/ui/FileMenu.test.tsx -t "Export"`
Expected: FAIL — `Export STL` button not found / `baseProps` type error for missing props.

- [ ] **Step 3: Add the props to `FileMenuProps` in `src/ui/FileMenu.tsx`**

Add to the `FileMenuProps` interface (after `onCuttingList`):

```typescript
  onExportStl: () => void
  onExportStep: () => void
  canExport: boolean
```

- [ ] **Step 4: Destructure the new props in the `FileMenu` function signature**

Add `onExportStl`, `onExportStep`, `canExport` to the destructured parameter list.

- [ ] **Step 5: Add the two menu items**

In the dropdown JSX, replace the Cutting List line with Cutting List + a new separator and the two export items:

```tsx
{menuItem('Cutting List…', '⌘⇧E', onCuttingList, false)}
<Separator className="my-1" />
{menuItem('Export STL…', '', onExportStl, !canExport)}
{menuItem('Export STEP…', '', onExportStep, !canExport)}
```

- [ ] **Step 6: Run the FileMenu tests to verify they pass**

Run: `pnpm vitest run src/ui/FileMenu.test.tsx`
Expected: PASS (existing + 4 new).

- [ ] **Step 7: Wire handlers in `src/App.tsx`**

Add imports:

```typescript
import { buildBinaryStl } from './geom/stl'
import { downloadBlob } from './ui/download'
```

Add `exportStep` to the `useScene()` destructure (add the name to the existing destructure list).

After the `useFile` destructure (where `projectName` is available), add:

```typescript
  const visibleParts = scene.parts.filter((p) => p.visible)
  const canExport = visibleParts.length > 0

  const handleExportStl = useCallback(() => {
    downloadBlob(buildBinaryStl(visibleParts, geometries), `${projectName}.stl`, 'model/stl')
  }, [visibleParts, geometries, projectName])

  const handleExportStep = useCallback(() => {
    void (async () => {
      const text = await exportStep(visibleParts)
      downloadBlob(text, `${projectName}.step`, 'application/step')
    })()
  }, [visibleParts, projectName, exportStep])
```

Pass them to `<FileMenu>` (after `onCuttingList`):

```tsx
        onExportStl={handleExportStl}
        onExportStep={handleExportStep}
        canExport={canExport}
```

- [ ] **Step 8: Run typecheck + full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean.

- [ ] **Step 9: LIVE SPIKE — verify STEP against real WASM**

Run: `pnpm dev`, open `http://localhost:5173`.

1. With the default board present, open **File ▸ Export STEP…**.
2. **If a `.step` file downloads:** open it in a text editor — confirm it starts with `ISO-10303-21;`, ends with `END-ISO-10303-21;`, and contains the part label (e.g. `Board 1`). Open it in FreeCAD/Fusion — confirm one named solid. CAF path works → proceed.
3. **If the browser console throws** (e.g. `O.XCAFApp_Application is undefined`, `…Set_2 is not a function`, `…_1` overload missing): the embind symbol differs. Fix `writeStep` in `src/geom/occt.ts`:
   - Try the un-suffixed or alternative-suffixed name (e.g. `STEPCAFControl_Writer_2`, `TDataStd_Name.Set_1`, `Transfer` vs `Transfer_1`). The `node_modules/opencascade.js/dist/Supported APIs.md` entry for each class lists its available constructors/methods.
   - If XCAF is genuinely unavailable, switch `writeStep` to the **fallback** (unnamed) writer:
     ```typescript
     // Fallback body of writeStep:
     const builder = new O.BRep_Builder()
     const compound = new O.TopoDS_Compound()
     builder.MakeCompound(compound)
     for (const spec of specs) builder.Add(compound, makeTransformedShape(oc, spec))
     const writer = new O.STEPControl_Writer_1()
     const pr = new O.Message_ProgressRange_1()
     writer.Transfer(compound, O.STEPControl_StepModelType.STEPControl_AsIs, true, pr)
     writer.Write('out.step')
     pr.delete()
     const text: string = (oc as any).FS.readFile('out.step', { encoding: 'utf8' })
     compound.delete(); builder.delete(); writer.delete()
     return text
     ```
   - Re-run `pnpm dev` and retry until a valid STEP downloads.
4. Also test **File ▸ Export STL…** — confirm a `.stl` downloads and opens in any mesh viewer at mm scale.
5. Record what worked (exact symbols used; CAF vs fallback) in the implementation notes file (see Task 7 Step 2).

If `writeStep` changed in this step, re-run `pnpm typecheck && pnpm lint && pnpm test` before committing.

- [ ] **Step 10: Commit**

```bash
git add src/ui/FileMenu.tsx src/ui/FileMenu.test.tsx src/App.tsx src/geom/occt.ts
git commit -m "feat: wire STL/STEP export into File menu; verify STEP live"
```

---

## Task 7: Final verification, notes, push

**Files:**
- Create: `docs/superpowers/notes/2026-06-05-3d-export-notes.md`

- [ ] **Step 1: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 2: Write implementation notes**

Create `docs/superpowers/notes/2026-06-05-3d-export-notes.md` recording: whether the CAF named-solid path or the unnamed fallback shipped; the exact OCCT embind symbols/overloads used in `writeStep`; any `gp_Trsf.SetValues` surprises; and anything discovered during the live spike that a future reader would need.

```bash
git add docs/superpowers/notes/2026-06-05-3d-export-notes.md
git commit -m "docs: add 3D export implementation notes"
```

- [ ] **Step 3: Manual smoke (full spec scenario)**

With `pnpm dev`:
1. Build a 3-board joint; rotate one board; add a cut to another.
2. Export STL → open in a mesh viewer → placement + mm scale correct; cut void present.
3. Export STEP → open in FreeCAD/Fusion → parts in correct relative positions, separate solids (named, if CAF shipped), mm scale.
4. Hide a part → re-export → hidden part absent from both files.
5. Delete all parts → both menu items disabled.

- [ ] **Step 4: Push**

```bash
git push -u origin claude/optimistic-cori-FltT4
```

(Retry up to 4× with exponential backoff on network errors. Do NOT open a PR unless asked.)

---

## Self-review notes (for the executor)

- **Spec coverage:** STL (Task 2), STEP named solids (Task 5 + spike Task 6), shared transform (Task 1), Blob delivery (Task 3), visible-only scope + `canExport` (Task 6), menu placement (Task 6), units/coords baked into `composeWorldMatrix`/`writeStep`. All covered.
- **Type consistency:** `ExportSpec` defined once in `occt.ts` (Task 4), imported by the worker (Task 5); `exportStep(parts: Part[]) => Promise<string>` identical in `useScene` impl, `UseSceneResult`, and worker (`exportStep(specs: ExportSpec[])`). `composeWorldMatrix`/`applyMatrixToPoint` signatures match across Tasks 1, 2, 5.
- **Known illustrative code:** the CAF symbol overloads in Task 5 are explicitly spike-confirmed in Task 6 Step 9 with a concrete fallback — not a placeholder.
