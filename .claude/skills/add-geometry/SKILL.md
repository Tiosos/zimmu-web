---
name: add-geometry
description: Use when adding any new OCCT shape, primitive, or joint type to Zimmu. Covers the full seam from OCCT kernel → worker → Three.js mesh → test.
---

# Add Geometry (Zimmu)

## Overview

Every new shape in Zimmu crosses these boundaries in order:
1. OCCT kernel function → `src/geom/occt.ts`
2. Worker exposure → `src/geom/occt.worker.ts`
3. Three.js mesh → `src/geom/mesh.ts` (if new mesh topology needed)
4. Unit test → `src/geom/occt.test.ts` (Vitest — **mocks/skips OCCT**, never runs the real kernel)
5. Live-kernel verification → `e2e/*.spec.ts` (Playwright — the **only** place real OCCT runs)

**OCCT is browser-only, so a green `pnpm test` proves nothing about the geometry.** Vitest runs in Node, where the kernel is unavailable; the unit tests mock or skip it. Only the E2E step (5) actually builds your shape against opencascade.js. Skipping it is exactly how wrong embind overloads and mis-placed cuts ship: code that "passes all tests" yet throws or mis-builds the moment a real user renders it.

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

> ⚠️ This Vitest test runs in Node and **mocks/skips the real OCCT kernel**. It checks your function's *contract* (params, return type, mesh wiring) — not that OCCT actually builds the shape. A passing unit test is necessary but **not sufficient**. The real kernel check is Step 5; both are required.

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

### 5. Verify against the live OCCT kernel (REQUIRED — Vitest cannot)

This is the only step that runs the real kernel, so it is the one that actually
proves your geometry. Add an assertion to `e2e/` that boots OCCT in the browser
and exercises your shape. Two specs already do this — copy whichever fits:

- `e2e/geom-kernel.spec.ts` — every shape/cut **builds without throwing**. Catches
  wrong embind overloads (the #1 opencascade.js gotcha — see Common Mistakes).
- `e2e/dowel-geometry.spec.ts` — the shape is **geometrically correct**: volume +
  centroid via `GProp`, extent via `Bnd_Box`. Catches silent mis-placement.

The pattern imports the source module in-page (Vite serves `/src` in dev) and
calls it directly against the live kernel — no UI driving needed:

```ts
const out = await page.evaluate(async () => {
  // @ts-expect-error dev-only source import served by Vite
  const occt = await import('/src/geom/occt.ts')
  const oc = await occt.initOCCT()
  const shape = occt.makeMyShape(oc, 100, 100, 50)
  const g = new oc.GProp_GProps_1()
  oc.BRepGProp.VolumeProperties_1(shape, g, false, false, false)
  return { volume: g.Mass() }              // assert on this in the test body
})
expect(out.volume).toBeCloseTo(/* analytically-derived expected */, 0)
```

For a **cut** (removes material), assert the volume *decreased by the expected
amount* and the centroid shifted the right way. A mis-placed cut that misses the
stock removes nothing yet still passes a naive "doesn't throw" check — volume and
centroid are what catch it.

Run `pnpm test:e2e` — it must pass against the real kernel.

### 6. Run the full check suite

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

All four must pass before committing. **`pnpm test:e2e` is not optional** — it is
the only gate that exercises the live OCCT kernel; the other three can be green
while the geometry is completely broken.

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

These are the base class names. In opencascade.js you call a **suffixed** overload (`_1`, `_2`, …) whose number does **not** track the argument count — confirm the right one against the live kernel before using it (see Common Mistakes).

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Ctor throws `invalid number of parameters (N) - expected (M)` | The embind suffix (`_1`/`_2`/`_3`) does **not** track arg count. `BRepPrimAPI_MakeCylinder_1` is `(R,H)`; `_2` is `(R,H,Angle)`; `BRepAlgoAPI_Cut_3` is `(S1,S2)`. Probe the live kernel for the right suffix — never guess from the count. |
| `Message_ProgressRange is not a constructor` | Absent in opencascade.js v1.1.1. Drop it: use `BRepAlgoAPI_Cut_3(S1, S2)`, which runs the boolean in its constructor (`IsDone()`/`Shape()` valid immediately) — no progress range, no `Build()`. |
| Shape builds but is in the wrong place / orientation | Vitest can't see this. Add a live-kernel geometry assertion (Step 5) on volume + centroid; a mis-placed cut removes no/wrong material. |
| Shape renders as nothing | Call `BRepMesh_IncrementalMesh` before `toBufferGeometry` |
| Vertices look inside-out | Check face orientation with `BRep_Tool::Surface` normals |
| Test passes in browser, fails in Vitest | OCCT is browser-only — guard the Vitest test with `if (typeof window === 'undefined') return`, **and** do the real verification in an E2E spec (Step 5). Skipping in Vitest is not "fixing" it. |
| Shape offset from origin | Use `gp_Pnt` or `gp_Ax2` to position the shape, not Three.js transforms |
| Boolean op returns null shape | Check that input shapes actually intersect first |
