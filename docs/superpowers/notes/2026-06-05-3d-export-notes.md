# 3D Export (STL + STEP) — Implementation Notes

**Date:** 2026-06-05
**Spec:** `docs/superpowers/specs/2026-06-05-3d-export-stl-step-design.md`
**Plan:** `docs/superpowers/plans/2026-06-05-3d-export-stl-step.md`

Living record of decisions and surprises that don't belong in the spec/plan. Audience: a future developer who needs to know *why*.

## Status at hand-off

- **Tasks 1–6 implemented, reviewed (spec + code quality), committed.** Full gate green: `pnpm typecheck && pnpm lint && pnpm test` → 252 passed / 6 skipped.
- **Two verification steps remain and require a human with a browser** (a subagent/CI cannot drive them):
  1. **Live STEP spike (Plan Task 6, Step 9):** run `pnpm dev`, click **File ▸ Export STEP…**, confirm a valid `.step` downloads and the XCAF/CAF binding symbols in `writeStep` actually resolve at runtime. See "CAF symbols — UNVERIFIED" below.
  2. **Manual smoke (Plan Task 7, Step 3):** rotated multi-board + cut → export STL and STEP → open in a mesh viewer / FreeCAD; verify placement, mm scale, separate named solids, visible-only filtering, and that the menu items disable when no parts are visible.

## CAF symbols — UNVERIFIED until the live spike

`writeStep` in `src/geom/occt.ts` uses the named-solid XCAF path with these embind symbols, which are the **design's best reading and have NOT been exercised against the WASM build**:

- `Interface_Static.SetCVal('write.step.unit','MM')`
- `XCAFApp_Application.GetApplication()`
- `new Handle_TDocStd_Document_1()`, `app.NewDocument(new TCollection_ExtendedString_2('MDTV-XCAF', true), doc)`
- `XCAFDoc_DocumentTool.ShapeTool(doc.get().Main())`
- `shapeTool.AddShape(shape, false, true)`
- `TDataStd_Name.Set_2(lbl, new TCollection_ExtendedString_2(label, true))`
- `new STEPCAFControl_Writer_1()`, `writer.Transfer_1(doc, STEPControl_StepModelType.STEPControl_AsIs, '', pr)`, `writer.Write('out.step')`
- `oc.FS.readFile('out.step', { encoding: 'utf8' })`

Plan-time check: all of these classes appear in `node_modules/opencascade.js/dist/Supported APIs.md` (build v1.1.1), so the named-solid path is expected to be viable. But exact **overload suffixes** (`_1`/`_2`) and method availability are only confirmed at runtime.

**Decision rule for the spike (from the spec):** if the CAF chain throws at runtime, try alternative overload suffixes (consult the `Supported APIs.md` entry per class); if XCAF is genuinely unavailable, switch `writeStep` to the documented **unnamed fallback** (`STEPControl_Writer` + a `TopoDS_Compound`, see spec §5 "Fallback path"). Do not block release on naming — distinct solids satisfy the core need.

**After the spike:** update the `// Named-solid STEP via XCAF. Symbol overloads (_1/_2) confirmed by a later live spike.` comment in `occt.ts` to past tense (or note the fallback was taken), and record the outcome here.

## XCAF resource cleanup — intentionally minimal

`writeStep` deletes the OCCT objects with clear ownership (`gp_Trsf`, `BRepBuilderAPI_Transform`, the transformed shapes, the `STEPCAFControl_Writer`, `Message_ProgressRange`). It does **not** delete the XCAF document/app handles or the per-label `TCollection_ExtendedString_2` temporaries. This is a deliberate tradeoff for a one-shot, user-triggered export off the hot path — but it is a deviation from the otherwise-strict `delete()` discipline in `occt.ts` (`makeBox`/`makeCut`/`makeShape`/`makeTransformedShape` free every temporary). The per-label `ExtendedString` allocations grow with part count within a single call. If export is ever called in a loop or memory pressure shows up, revisit and free these. Flagged by the Task 5 code-quality review.

## Transform parity (the "never diverge" guarantee)

`composeWorldMatrix` (`src/geom/transform.ts`) is a pure, THREE-free closed form of the part world matrix (position + Euler `XYZ` deg→rad), verified element-wise against `THREE.Matrix4` in `transform.test.ts`. Both export paths consume it: STL applies it on the main thread (`stl.ts`); STEP receives `Array.from(...)` of it per part and re-applies via `gp_Trsf.SetValues`. The column-major → row-major 3×4 mapping in `makeTransformedShape` is the load-bearing conversion (`row0=(m0,m4,m8,m12)`, `row1=(m1,m5,m9,m13)`, `row2=(m2,m6,m10,m14)`); a wrong mapping silently mis-places solids, so the live FreeCAD check is the guard.

- **Latent footgun:** `composeWorldMatrix` hardcodes Euler order `XYZ`. Safe today because `Part.rotationOrder` is typed as the single literal `'XYZ'`; if another order is ever added to the type, this function (and the export paths) must be revisited. TypeScript will surface the call sites.

## Delivery & scope decisions (recap)

- **Blob download**, not File System Access API — matches the CSV cutting-list precedent; works in all browsers; no `supported` gate. New shared helper `src/ui/download.ts` (`CuttingList.tsx` keeps its own inline copy; not refactored, per surgical discipline).
- **Visible-only, whole scene**, +Z up, millimetres. STL binary, single merged triangle soup with recomputed facet normals. STEP = flat set of named solids (no nested product hierarchy).
- Menu: two flat items under "Cutting List…"; no keyboard shortcuts (avoid collision with `⌘⇧E` / viewport `C`/`F`).

## Out of scope (future cycles)

2D shop drawings; per-part/selected export; ASCII STL; `.stp` alias; STEP assembly hierarchy; axis/unit options; user-facing export error UI.
