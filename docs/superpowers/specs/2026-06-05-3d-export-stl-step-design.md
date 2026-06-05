# 3D Geometry Export (STL + STEP) — Design Spec

**Date:** 2026-06-05
**Status:** Draft — pending user review
**Scope:** Export the current scene to STL (binary mesh) and STEP (B-rep compound of named solids). Sub-project 1 of a three-part export effort; **2D shop drawings are a separate future cycle and out of scope here.**

---

## Goal

Let the user get the design out of Zimmu and into the shop / other CAD tools:

- **STL** — a single binary mesh of all visible parts, baked to world coordinates. For 3D printing and quick sharing. Reuses the geometry already on screen; no OCCT, no rebuild.
- **STEP** — a B-rep `TopoDS_Compound` where each visible part is a separate solid named by its part label, baked to world coordinates, units millimetres. For CNC/CAM and round-tripping into Fusion / FreeCAD as a multi-body assembly.

Both are delivered as **Blob downloads** (the established pattern from the CSV cutting list), so they work in every browser — no File System Access API, no `supported` gate.

**Approach (chosen):** Hybrid. STL is built on the main thread from the rendered `BufferGeometry`. STEP is built in the OCCT worker. A single pure function, `composeWorldMatrix(part)`, computes each part's world transform and feeds **both** paths, so the two formats can never diverge in placement.

---

## 1. Architecture

### New files

| File | Role |
|---|---|
| `src/geom/transform.ts` | `composeWorldMatrix(part): Float64Array` (length 16, column-major). Matches THREE's `position` + `Euler('XYZ', deg→rad)`. Pure, no THREE import. |
| `src/geom/transform.test.ts` | Parity tests against `THREE.Matrix4`. |
| `src/geom/stl.ts` | `buildBinaryStl(parts, geometries): ArrayBuffer`. Transforms each triangle to world space, computes facet normals, emits binary STL. Pure. |
| `src/geom/stl.test.ts` | Triangle count, header, transformed coords, facet normal, empty scene. |
| `src/ui/download.ts` | `downloadBlob(data, filename, mime): void` — Blob + anchor click + revoke. |

### Modified files

| File | Change |
|---|---|
| `src/geom/occt.ts` | Extract `makeShape(oc, dims)` (box + cut chain) shared by build and export. Add `writeStep(oc, specs): string` — the XCAF/CAF STEP writer (with plain-writer fallback) and `oc.FS` read-back. Keeping the OCCT work here (not in the worker) mirrors `makeBox`/`makeShape` and lets `occt.test.ts` smoke-test it browser-only. |
| `src/geom/occt.worker.ts` | Add `exportStep(specs): Promise<string>` — thin wrapper: `await initOCCT()` then `return writeStep(oc, specs)`. Refactor `buildPart` to use `makeShape`. |
| `src/scene/useScene.ts` | Add `exportStep(parts: Part[]): Promise<string>` to the hook and `UseSceneResult`. Builds per-part specs (label, dims, cuts, world matrix) and calls the worker. Worker access stays encapsulated here — `App` never touches the worker directly. |
| `src/scene/useScene.test.ts` | Test `exportStep` builds specs (with matrices) from the given parts and returns the worker's string. |
| `src/App.tsx` | `handleExportStl`, `handleExportStep`; compute `visibleParts` and `canExport`; wire three new props into `FileMenu`. |
| `src/ui/FileMenu.tsx` | Two menu items below "Cutting List…" under a new separator: **"Export STL…"**, **"Export STEP…"**. New props `onExportStl`, `onExportStep`, `canExport`. |
| `src/ui/FileMenu.test.tsx` | Items render; disabled when `!canExport`; handlers fire. |

### Dependency direction

```
transform.ts  ← stl.ts        (main thread STL)
transform.ts  ← useScene.ts   (matrices handed to the worker for STEP)
occt.ts (makeShape) ← occt.worker.ts
download.ts   ← App.tsx
```

- **Invariant preserved:** no new OCCT import in `render/` or `ui/`. STL touches only `BufferGeometry` (a `three` type already used throughout `render/`/`scene/`).
- **`composeWorldMatrix` has no THREE dependency** — it is plain arithmetic, verified against THREE in tests. This keeps `src/geom/` free of `three` except where mesh interop already requires it (`mesh.ts`).

---

## 2. Coordinate System, Units, Conventions

- **Export as-is.** +Z up (CAD convention, same as the viewport). No axis remapping.
- **Units:** millimetres. STEP declares `MM` via `Interface_Static.SetCVal("write.step.unit", "MM")`. STL is unitless by spec; consumers treat the numbers as mm.
- **World coordinates.** Every vertex/solid is baked through its part's world matrix (`position` + Euler `XYZ` rotation in degrees). No local-space export.
- **Visible-only, whole scene.** `parts.filter((p) => p.visible)`. Hidden parts are excluded (WYSIWYG). No selection-scoped or per-part-file export in this version.
- **Filenames:** `${projectName}.stl`, `${projectName}.step`. (`projectName` already flows to `CuttingList` for `.csv`; reuse the same value.)
- **MIME types:** `model/stl` for STL, `application/step` for STEP.

---

## 3. `composeWorldMatrix` (`src/geom/transform.ts`)

Returns a length-16 `Float64Array` in **column-major** order (THREE's `Matrix4.elements` layout), representing `T · R`:

- `R` = rotation from Euler angles `(rx, ry, rz)` in **degrees → radians**, order `'XYZ'` — identical to `THREE.Euler` with order `'XYZ'`, i.e. the composed rotation matrix `Rx · Ry · Rz` as THREE builds it in `Matrix4.makeRotationFromEuler` for order `XYZ`.
- `T` = translation by `(position.x, position.y, position.z)`.
- Scale is always 1.

```typescript
import type { Part } from '../scene/types'

const DEG2RAD = Math.PI / 180

// Column-major (THREE Matrix4.elements layout). Equivalent to
// new THREE.Matrix4().compose(position, quaternion(Euler XYZ deg), (1,1,1)).
export function composeWorldMatrix(part: Part): Float64Array {
  const x = part.rotation.x * DEG2RAD
  const y = part.rotation.y * DEG2RAD
  const z = part.rotation.z * DEG2RAD
  const cx = Math.cos(x), sx = Math.sin(x)
  const cy = Math.cos(y), sy = Math.sin(y)
  const cz = Math.cos(z), sz = Math.sin(z)

  // Rotation matrix for THREE Euler order 'XYZ' (R = Rx * Ry * Rz),
  // expressed in row-major terms r[row][col]:
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
  // column-major: m[col*4 + row]
  m[0] = r00; m[1] = r10; m[2] = r20; m[3] = 0
  m[4] = r01; m[5] = r11; m[6] = r21; m[7] = 0
  m[8] = r02; m[9] = r12; m[10] = r22; m[11] = 0
  m[12] = part.position.x; m[13] = part.position.y; m[14] = part.position.z; m[15] = 1
  return m
}
```

**The above `Rx*Ry*Rz` expansion is the design's claim and must be verified, not trusted.** The parity test (Section 7) is the source of truth: if the closed form disagrees with THREE for any case, fix the closed form to match THREE — THREE is what the viewport renders.

A small helper applies the matrix to a point (used by STL):

```typescript
// Apply a column-major 4x4 to (x,y,z) as a position (w=1).
export function applyMatrixToPoint(
  m: Float64Array,
  x: number, y: number, z: number,
): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}
```

---

## 4. STL Path (main thread)

### `buildBinaryStl(parts, geometries): ArrayBuffer` (`src/geom/stl.ts`)

```typescript
import type { Part, PartId } from '../scene/types'
import * as THREE from 'three'
import { composeWorldMatrix, applyMatrixToPoint } from './transform'

export function buildBinaryStl(
  parts: Part[],
  geometries: Map<PartId, THREE.BufferGeometry>,
): ArrayBuffer {
  // 1. Collect transformed triangles.
  const tris: number[] = [] // flat: per triangle 12 floats (nx,ny,nz, ax..cz)
  let count = 0
  for (const part of parts) {
    const geo = geometries.get(part.id)
    if (!geo) continue
    const pos = geo.getAttribute('position')
    if (!pos) continue
    const m = composeWorldMatrix(part)
    for (let i = 0; i < pos.count; i += 3) {
      const a = applyMatrixToPoint(m, pos.getX(i),   pos.getY(i),   pos.getZ(i))
      const b = applyMatrixToPoint(m, pos.getX(i+1), pos.getY(i+1), pos.getZ(i+1))
      const c = applyMatrixToPoint(m, pos.getX(i+2), pos.getY(i+2), pos.getZ(i+2))
      const n = facetNormal(a, b, c)
      tris.push(n[0], n[1], n[2], a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2])
      count++
    }
  }

  // 2. Serialize binary STL: 80-byte header, uint32 count, 50 bytes/triangle.
  const buffer = new ArrayBuffer(84 + count * 50)
  const view = new DataView(buffer)
  writeHeader(view) // "Zimmu STL export" padded to 80 bytes
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

- **Triangle soup assumption:** `geometries` holds **non-indexed** `BufferGeometry` (the worker pushes 9 position floats per triangle; confirmed in `mesh.ts` / `useScene.ts`). The loop therefore steps `i += 3` over `position.count`. If a future change introduces an index buffer this breaks — `stl.ts` must read `geo.index` when present. (Noted; not handled now since geometry is currently always non-indexed.)
- **Facet normals are recomputed** from the transformed vertices (`normalize((b−a)×(c−a))`), ignoring stored vertex normals. Robust and matches STL's per-facet model. Degenerate triangles (zero-length cross product) emit a zero normal — accepted (consumers tolerate it).
- **Winding** comes straight from the OCCT triangulation (outward). World matrices here are rotation + translation only (determinant +1), so winding is preserved.
- **`min` clamp:** not applicable — STL has no minimum size rule.

### `downloadBlob` (`src/ui/download.ts`)

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

(CSV in `CuttingList.tsx` keeps its own inline copy — not refactored here, per surgical-change discipline. Mentioned only as the precedent.)

---

## 5. STEP Path (worker)

### `makeShape` extraction (`src/geom/occt.ts`)

Pull the box + cut-chain loop currently inline in `occt.worker.ts:buildPart` into a shared builder so build and export produce identical solids:

```typescript
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

`buildPart` becomes: `const shape = makeShape(oc, dims); const data = shapeToMeshData(...); shape.delete(); return transfer(...)`.

### `writeStep(oc, specs)` (`src/geom/occt.ts`), wrapped by the worker

The STEP-writing body lives in `occt.ts` as `writeStep(oc, specs): string`; the worker method is a thin wrapper:

```typescript
// src/geom/occt.worker.ts
async exportStep(specs: ExportSpec[]): Promise<string> {
  const oc = await initOCCT()
  return writeStep(oc, specs)
}
```

The code below is the body of `writeStep` (it receives `oc`, returns the STEP text). Spec shape handed from `useScene`:

```typescript
type ExportSpec = {
  label: string
  length: number
  width: number
  thickness: number
  cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
  matrix: number[] // column-major 16 (Float64Array serialized over Comlink)
}
```

**Writer choice: `STEPCAFControl_Writer` + XCAF document (named solids).** Each part's `label` is attached as the solid's entity name so it appears in the CAD tree (Fusion/FreeCAD). This is **spike-gated** (see Risk 1): if the XCAF bindings are missing from the build, fall back to the unnamed `STEPControl_Writer` path and flag it loudly.

A shared `makeTransformedShape(oc, spec)` builds each part's solid and applies its world matrix — used by both writer paths:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTransformedShape(oc: OpenCascadeInstance, spec: ExportSpec): TopoDS_Shape {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  const shape = makeShape(oc, spec)
  const trsf = new O.gp_Trsf_1()
  // gp_Trsf.SetValues expects row-major 3x4 (a11..a14, a21..a24, a31..a34).
  // Source matrix is column-major: m[col*4+row].
  const m = spec.matrix
  trsf.SetValues(
    m[0], m[4], m[8],  m[12],
    m[1], m[5], m[9],  m[13],
    m[2], m[6], m[10], m[14],
  )
  const xform = new O.BRepBuilderAPI_Transform_2(shape, trsf, false)
  const moved = xform.Shape()
  shape.delete(); trsf.delete(); xform.delete()
  return moved
}
```

**Primary path — CAF (named):**

```typescript
export function writeStep(oc: OpenCascadeInstance, specs: ExportSpec[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const O = oc as any
  O.Interface_Static.SetCVal('write.step.unit', 'MM')

  // --- XCAF document + shape tool (exact handle wrapping confirmed by the spike) ---
  const app = O.XCAFApp_Application.GetApplication()
  const doc = new O.Handle_TDocStd_Document_1()
  app.NewDocument(new O.TCollection_ExtendedString_2('MDTV-XCAF', true), doc)
  const shapeTool = O.XCAFDoc_DocumentTool.ShapeTool(doc.get().Main())

  const moved: TopoDS_Shape[] = []
  for (const spec of specs) {
    const shape = makeTransformedShape(oc, spec)
    const lbl = shapeTool.AddShape(shape, false, true) // free solid, named below
    O.TDataStd_Name.Set_2(lbl, new O.TCollection_ExtendedString_2(spec.label, true))
    moved.push(shape)
  }

  const writer = new O.STEPCAFControl_Writer_1()
  const pr = new O.Message_ProgressRange_1()
  writer.Transfer_1(doc, O.STEPControl_StepModelType.STEPControl_AsIs, '', pr)
  writer.Write('out.step')
  pr.delete()

  const text: string = oc.FS.readFile('out.step', { encoding: 'utf8' })
  for (const s of moved) s.delete()
  writer.delete()
  return text
}
```

> The exact handle/`Set_*` overloads above (`Handle_TDocStd_Document_1`, `NewDocument`, `XCAFDoc_DocumentTool.ShapeTool`, `TDataStd_Name.Set_2`, `Transfer_1`) are the **design's best reading of the binding surface and must be confirmed by the Risk-1 spike** before the UI is built. The spike adjusts these calls to whatever the build actually exposes.

**Fallback path — plain writer (unnamed), used only if the spike finds XCAF missing:**

```typescript
const builder = new O.BRep_Builder()
const compound = new O.TopoDS_Compound()
builder.MakeCompound(compound)
for (const spec of specs) builder.Add(compound, makeTransformedShape(oc, spec))
const writer = new O.STEPControl_Writer_1()
const pr = new O.Message_ProgressRange_1()
writer.Transfer(compound, O.STEPControl_StepModelType.STEPControl_AsIs, true, pr)
writer.Write('out.step')
// ...read 'out.step', cleanup...
```

- **`(oc as any)` casts** match the existing `makeCut` convention (the `.d.ts` doesn't type these constructors). Same eslint-disable style.
- **Memory:** the STEP text is a JS string returned over Comlink. Fine for hobby-scale assemblies.
- **Empty `specs`:** guarded earlier by `canExport`; if it still happens, an empty document/compound writes a valid (empty) STEP — harmless.

### `useScene.exportStep` (`src/scene/useScene.ts`)

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

Added to `UseSceneResult` as `exportStep: (parts: Part[]) => Promise<string>`. Import `composeWorldMatrix` from `../geom/transform`. `getOcct()` is the existing lazy Comlink singleton.

---

## 6. UI Wiring

### `App.tsx`

```typescript
const visibleParts = scene.parts.filter((p) => p.visible)
const canExport = visibleParts.length > 0

const handleExportStl = useCallback(() => {
  const buffer = buildBinaryStl(visibleParts, geometries)
  downloadBlob(buffer, `${projectName}.stl`, 'model/stl')
}, [visibleParts, geometries, projectName])

const handleExportStep = useCallback(async () => {
  const text = await exportStep(visibleParts)
  downloadBlob(text, `${projectName}.step`, 'application/step')
}, [visibleParts, projectName, exportStep])
```

Pass `onExportStl={handleExportStl}`, `onExportStep={handleExportStep}`, `canExport={canExport}` to `FileMenu`. (`projectName` already available from `useFile`; `geometries` from `useScene`.)

- **No error toast for STEP failure in v1.** If `exportStep` rejects (OCCT crash), the promise rejection surfaces in console. A user-facing error path is a documented follow-up (the file menu's `fileError` channel is for project save/load, not export). Acceptable for a prototype; noted in Risk 2.

### `FileMenu.tsx`

Add three props to `FileMenuProps`: `onExportStl: () => void`, `onExportStep: () => void`, `canExport: boolean`. Below the existing "Cutting List…" item, add a separator and two items:

```tsx
<Separator className="my-1" />
{menuItem('Export STL…', '', onExportStl, !canExport)}
{menuItem('Export STEP…', '', onExportStep, !canExport)}
```

Empty shortcut strings render fine in the existing `menuItem` helper (the shortcut `<span>` just shows nothing). No keyboard shortcuts assigned (avoids collision with the existing `⌘⇧E` for Cutting List and the viewport's `C`/`F`).

---

## 7. Testing

| File | What to test |
|---|---|
| `transform.test.ts` | `composeWorldMatrix` parity vs `new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,'XYZ')), (1,1,1))`, element-wise within 1e-9, for: identity; pure translation; +90° about X only; +90° about Y only; +90° about Z only; combined `(30,45,60)` with non-zero position. `applyMatrixToPoint` against `THREE.Vector3.applyMatrix4` for one combined case. |
| `stl.test.ts` | Single-part geometry with one triangle → header bytes correct, `uint32` count = 1, facet normal correct, vertices translated by the part's position. Part with rotation → vertex matches `composeWorldMatrix` applied. Two parts → count = sum. Part missing from `geometries` map → skipped. Empty parts → count 0, buffer length 84. |
| `useScene.test.ts` | `exportStep([part])` builds one spec with `matrix.length === 16` and the part's dims/cuts, calls the mocked worker `exportStep`, and returns its string. (Worker mocked per existing Comlink mock pattern.) |
| `occt.test.ts` | `it('exports makeShape'...)` export check. `it.skip` browser-only smoke: `exportStep` over one board labelled `"Rail"` returns a string containing `ISO-10303-21`, `END-ISO-10303-21`, and (CAF path) the literal `Rail`. |
| `FileMenu.test.tsx` | Both export items render in the open menu; both disabled when `canExport=false`; clicking each calls its handler and closes the menu. |

**Manual smoke (final plan task):**
1. Build a 3-board joint with at least one rotated part and one part with a cut.
2. Export STL → open in an external mesh viewer → placement and scale (mm) correct; cut void present.
3. Export STEP → open in FreeCAD/Fusion → parts land in the same relative positions, are **separate solids whose tree names match the part labels** (CAF path), scale is mm.
4. Hide a part → re-export → hidden part absent from both files.
5. Delete all parts → both menu items disabled.

---

## 8. Risks & Mitigations

1. **XCAF / `STEPCAFControl_Writer` binding availability** in the project's opencascade.js build — *highest risk*, because the named-solids path depends on a wide binding surface (`XCAFApp_Application`, `Handle_TDocStd_Document_1`, `TDocStd_Document`, `XCAFDoc_DocumentTool`, `XCAFDoc_ShapeTool`, `TDataStd_Name`, `TCollection_ExtendedString`, `STEPCAFControl_Writer`) plus `oc.FS` read-back. **Mitigation:** the implementation plan's **first task is a worker spike** that (a) confirms `oc.FS` read-back and the plain `STEPControl_Writer` produce a non-empty `ISO-10303-21` string, then (b) confirms the CAF chain compiles and writes a file with the part name embedded. The spike pins the *exact* handle/overload names used in Section 5. **Decision rule:** if the CAF chain works → ship named solids (primary path). If any CAF binding is missing → ship the unnamed fallback path and record the gap in the implementation notes; do not block the release on naming.
2. **No user-facing STEP error path.** Rejections only hit the console. Accepted for the prototype; documented follow-up to route through a toast/`fileError`-like channel.
3. **`gp_Trsf.SetValues` argument layout** (row-major 3×4, no perspective row). Wrong mapping silently mis-places solids. **Mitigation:** the column→row mapping is documented in code; the manual smoke test (rotated part round-trips into FreeCAD at the right pose) is the guard, since unit-testing OCCT in Node isn't possible.
4. **CAF binding signatures in Section 5 may be imprecise.** The handle wrapping and `Set_*`/`Transfer_1` overloads are the design's best reading, not verified API. **Mitigation:** the Risk-1 spike is the source of truth and rewrites these calls to match the build; the spec code is illustrative of the *sequence*, not the exact symbols.
5. **Non-indexed geometry assumption** in `stl.ts`. Holds today. **Mitigation:** noted in code; add index handling only if geometry ever becomes indexed.
6. **`composeWorldMatrix` closed-form correctness.** **Mitigation:** the parity test is authoritative; the closed form is adjusted to match THREE, not the reverse.

---

## 9. Out of Scope (deferred)

- 2D shop drawings (separate future brainstorm → spec → plan cycle).
- Per-part / selected-part export; per-part separate files / zip.
- ASCII STL; `.stp` filename alias.
- STEP assembly *hierarchy* (nested products/sub-assemblies) — v1 is a flat set of named solids.
- Axis-convention or unit options (always +Z up, mm).
- User-facing export error UI.
- Refactoring `CuttingList.tsx` to use `downloadBlob`.
