---
name: add-geometry
description: Use when adding any new OCCT shape, primitive, or joint type to Zimmu. Covers the full seam from OCCT kernel → worker → Three.js mesh → test.
---

# Add Geometry (Zimmu)

## Overview

Every new shape in Zimmu crosses four boundaries in order:
1. OCCT kernel function → `src/geom/occt.ts`
2. Worker exposure → `src/geom/occt.worker.ts`
3. Three.js mesh → `src/geom/mesh.ts` (if new mesh topology needed)
4. Test → `src/geom/occt.test.ts`

**Never skip the test.** OCCT geometry bugs are invisible until something renders wrong.

## The Seam (read before touching code)

```
occt.ts                   occt.worker.ts           App.tsx / viewport.tsx
──────────────────────    ─────────────────────    ─────────────────────────
makeBox(w,h,d)            Comlink.expose({          const proxy = Comlink.wrap(...)
makeJoint(...)      ───▶  makeBox,          ───▶   const shape = await proxy.makeBox(...)
                          makeJoint,               const geom  = toBufferGeometry(shape)
                          })                       mesh.geometry = geom
```

`mesh.ts` converts any `TopoDS_Shape` → `THREE.BufferGeometry`. You rarely need to change it unless the tessellation parameters need tuning.

## Step-by-Step Workflow

### 1. Write the failing test FIRST

In `src/geom/occt.test.ts`, add a `describe` block for the new shape:

```ts
describe('makeMyShape', () => {
  it('returns a valid shape', async () => {
    const oc = await getOC()
    // Call your not-yet-written function
    const shape = makeMyShape(oc, ...params)
    expect(shape.IsNull()).toBe(false)
  })

  it('produces expected mesh vertex count', async () => {
    const oc = await getOC()
    const shape = makeMyShape(oc, 100, 100, 50)
    const geom = toBufferGeometry(oc, shape)
    // Mesh should have some vertices
    expect(geom.attributes.position.count).toBeGreaterThan(0)
  })
})
```

Run `pnpm test` — it must **fail** before you write the implementation.

### 2. Implement in `src/geom/occt.ts`

Add a new exported function. Follow the existing `makeBox` pattern exactly:

```ts
export function makeMyShape(
  oc: OpenCascadeInstance,
  width: number,
  height: number,
  depth: number,
): TopoDS_Shape {
  // Build your shape using OCCT BRep/Boolean/Prism operations
  // ...
  return shape
}
```

Key constraints:
- **Units are millimetres.** Keep that consistent.
- **Never hold OCCT objects across async boundaries** — WASM memory is not shared.
- Run `pnpm test` — the test must now **pass**.

### 3. Expose via the worker (`src/geom/occt.worker.ts`)

```ts
import { makeMyShape } from './occt'

Comlink.expose({
  // ... existing exports
  makeMyShape,
})
```

The worker wraps every OCCT call so the main thread stays unblocked. Do not call OCCT directly from React components or `App.tsx`.

### 4. Consume in the UI (`src/App.tsx` or a new component)

```ts
const proxy = Comlink.wrap<OcctWorker>(worker)
const shape = await proxy.makeMyShape(width, height, depth)
const geom  = toBufferGeometry(oc, shape)   // oc is only needed for tessellation
```

Note: `toBufferGeometry` requires the `oc` instance. In the worker context this is fine; in the main thread you need a separate `oc` reference for mesh conversion (or do the conversion inside the worker and transfer the typed arrays).

### 5. Run the full check suite

```bash
pnpm typecheck && pnpm lint && pnpm test
```

All three must pass before committing.

## Coordinate System

Zimmu uses **+Z up** (CAD convention). Three.js defaults to +Y up. The viewport camera is already configured for +Z up — do not change the world orientation to work around a geometry issue. If your shape looks upside-down, the issue is in the shape construction, not the camera.

## OCCT Operation Cheatsheet

| Goal | OCCT class |
|------|-----------|
| Box/cuboid | `BRepPrimAPI_MakeBox` |
| Cylinder | `BRepPrimAPI_MakeCylinder` |
| Boolean union | `BRepAlgoAPI_Fuse` |
| Boolean cut | `BRepAlgoAPI_Cut` |
| Linear extrude | `BRepPrimAPI_MakePrism` |
| Shell/fillet | `BRepFilletAPI_MakeFillet` |
| Tessellate | `BRepMesh_IncrementalMesh` |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Shape renders as nothing | Call `BRepMesh_IncrementalMesh` before `toBufferGeometry` |
| Vertices look inside-out | Check face orientation with `BRep_Tool::Surface` normals |
| Test passes in browser, fails in Vitest | OCCT is browser-only — guard with `if (typeof window === 'undefined') return` |
| Shape offset from origin | Use `gp_Pnt` or `gp_Ax2` to position the shape, not Three.js transforms |
| Boolean op returns null shape | Check that input shapes actually intersect first |
