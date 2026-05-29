---
name: debug-geometry
description: Use when geometry renders incorrectly, OCCT operations fail silently, the WASM worker crashes, or Three.js meshes look wrong in Zimmu. Covers WASM init failures, worker errors, mesh corruption, coordinate system confusion, and Boolean operation failures.
---

# Debug Geometry (Zimmu)

## Overview

Geometry bugs in Zimmu can fail silently at any of three layers. Diagnose which layer before attempting any fix.

```
Layer 1: OCCT kernel       — shape is wrong or null before any rendering
Layer 2: Mesh conversion   — shape is correct but BufferGeometry is corrupt
Layer 3: Three.js/viewport — geometry is correct but scene/camera is wrong
```

**Always identify the failing layer first.** Fixing the wrong layer wastes time.

## Phase 1: Identify the Failing Layer

### Check Layer 1 — Is the OCCT shape valid?

Add a temporary log immediately after shape construction in `occt.ts`:

```ts
const shape = builder.Shape()
console.log('shape null?', shape.IsNull())
console.log('shape type:', shape.ShapeType())  // 0=Compound, 2=Shell, 4=Face, 6=Edge
```

- `IsNull() === true` → the OCCT operation failed. Go to **OCCT Failures**.
- `ShapeType()` is unexpected → wrong operation type selected.

### Check Layer 2 — Is the mesh conversion producing geometry?

In `mesh.ts` or wherever `toBufferGeometry` is called:

```ts
const geom = toBufferGeometry(oc, shape)
console.log('vertices:', geom.attributes.position.count)
console.log('bbox:', new THREE.Box3().setFromBufferAttribute(geom.attributes.position))
```

- `vertices === 0` → tessellation produced nothing. Check mesh deflection parameters.
- bbox is enormous or at wrong position → coordinate system mismatch (see below).

### Check Layer 3 — Is the scene/camera the issue?

Add an `AxesHelper` temporarily to confirm world orientation:

```ts
scene.add(new THREE.AxesHelper(200))  // Red=X, Green=Y, Blue=Z (Z should be up)
```

If the axes look correct and the mesh bounding box is in a reasonable position, the issue is in the shape or mesh, not the viewport.

## OCCT Failures

### Shape is null after a Boolean operation

```
BRepAlgoAPI_Cut / Fuse / Common returns IsNull() === true
```

**Root causes (check in order):**
1. Input shapes do not intersect (cut of non-overlapping shapes returns empty)
2. Input shapes share a face exactly (degenerate Boolean — add a 0.001 mm offset)
3. One input shape is itself invalid — call `BRepCheck_Analyzer` to validate:

```ts
const analyzer = new oc.BRepCheck_Analyzer(shape, false)
if (!analyzer.IsValid()) {
  console.error('invalid input shape — Boolean will fail')
}
```

### WASM init fails / worker throws on startup

Check the browser DevTools Network tab:
- Is `opencascade.wasm` being fetched? (It's ~65 MB — first load is slow)
- Is the response 200? A 404 means the asset path is wrong in the Vite config.

Check the worker error:
```ts
// In App.tsx or wherever the worker is created:
worker.onerror = (e) => console.error('Worker error:', e)
```

Common causes:
- `optimizeDeps.exclude` is missing `opencascade.js` → pre-bundler corrupts it
- `worker.format` is not `'es'` in `vite.config.ts`
- WASM file not included in `assetsInclude`

All three are already configured correctly in the repo. If they regress, restore from `vite.config.ts`.

### BRepMesh produces zero vertices

```ts
const mesh = new oc.BRepMesh_IncrementalMesh(shape, 0.1, false, 0.5)
mesh.Perform()
// After this, iterate faces — if no faces, shape has no shell
```

- Deflection value too large for a tiny shape → reduce from `0.1` to `0.01`
- Shape has no faces (only edges/vertices) → wrong shape type for tessellation
- `mesh.Perform()` not called → always call it explicitly

## Mesh Conversion Issues

### Mesh appears inside-out (normals facing inward)

OCCT face orientations can be `TopAbs_REVERSED`. In `mesh.ts`, check:

```ts
const face = explorer.Current()
const orientation = face.Orientation()  // TopAbs_FORWARD or TopAbs_REVERSED
if (orientation === oc.TopAbs_ShapeEnum.TopAbs_REVERSED) {
  // Flip triangle winding order when building the index buffer
}
```

### Mesh has gaps / cracked faces

Tessellation tolerance is too loose relative to edge length:
- Reduce linear deflection: `new oc.BRepMesh_IncrementalMesh(shape, 0.01, false, 0.1)`
- The second parameter (0.01 mm) is the max linear deviation; 0.1 rad is the angular deviation.

## Coordinate System Confusion

Zimmu uses **+Z up**. Three.js defaults to **+Y up**.

| Symptom | Cause | Fix |
|---------|-------|-----|
| Shape appears lying flat | Z/Y swapped | Check shape construction — use `gp_Dir(0,0,1)` for Z-up axis in OCCT |
| Shape at wrong position | `gp_Pnt` not set | Pass explicit origin to `BRepPrimAPI_Make*` constructors |
| Camera clips the shape | Shape too far from origin | Log bbox, recentre using `gp_Trsf` |

The camera `up` vector is already set to `(0, 0, 1)` in `viewport.tsx`. Do not change it.

## Worker / Comlink Errors

### `DataCloneError` when passing a shape over Comlink

`TopoDS_Shape` is a WASM object — it cannot be transferred via `postMessage`. Options:
1. Do the mesh conversion **inside the worker** and transfer typed arrays (`Float32Array`, `Uint32Array`) instead
2. Return a plain description (dimensions, type) and reconstruct the shape in the main thread

### Worker is unresponsive after OCCT call

OCCT Boolean operations on complex shapes can be CPU-bound for seconds. The worker thread will be blocked. Options:
1. Move the expensive call behind a loading indicator
2. Break the Boolean into smaller operations with `await new Promise(r => setTimeout(r, 0))` between them (yields the event loop enough to stay responsive)

## Debugging Checklist

```
[ ] Layer identified: kernel / mesh / viewport
[ ] shape.IsNull() checked
[ ] shape.ShapeType() logged
[ ] mesh vertex count checked
[ ] BRepMesh_IncrementalMesh.Perform() was called
[ ] WASM file loaded (Network tab — 200, ~65 MB)
[ ] Worker onerror handler attached
[ ] Boolean input shapes validated with BRepCheck_Analyzer
[ ] Coordinate system: Z-up used throughout shape construction
[ ] toBufferGeometry bbox logged and reasonable
```
