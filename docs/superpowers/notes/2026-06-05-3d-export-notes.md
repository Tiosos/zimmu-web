# 3D Export (STL + STEP) — Implementation Notes

**Date:** 2026-06-05
**Spec:** `docs/superpowers/specs/2026-06-05-3d-export-stl-step-design.md`
**Plan:** `docs/superpowers/plans/2026-06-05-3d-export-stl-step.md`

Living record of decisions and surprises that don't belong in the spec/plan. Audience: a future developer who needs to know *why*.

## Status at hand-off

- **Tasks 1–6 implemented, reviewed (spec + code quality), committed.** Full gate green: `pnpm typecheck && pnpm lint && pnpm test` → 252 passed / 6 skipped.
- **All verification steps complete** (2026-06-16 live browser spike + smoke test). See "Live spike findings" below. The XCAF named-solid path proved unavailable in opencascade.js v1.1.1; `writeStep` now uses the documented unnamed-compound fallback.

## Live spike findings (2026-06-16) — fallback path taken

The live browser spike revealed that **the XCAF/CAF path does not work in opencascade.js v1.1.1**. The following classes are absent from the WASM build despite appearing in `Supported APIs.md`:

- `XCAFApp_Application` — not present at runtime; `.GetApplication()` is `undefined`
- `STEPCAFControl_Writer` / `STEPCAFControl_Writer_1` — unavailable; throws on construction
- `Message_ProgressRange` / `Message_ProgressRange_1` — added in OCCT 7.6+; not in v1.1.1

`Interface_Static.SetCVal` and `oc.FS.readFile` work fine.

**Fallback path taken** (spec §5): `writeStep` uses an unnamed compound via `STEPControl_Writer_1` + `BRep_Builder` + `TopoDS_Compound`. The exported STEP contains all visible solids in a single compound — world-space placement is correct, units are mm. No named solid hierarchy (the per-part `label` is no longer embedded).

### Constructor suffix lesson

`opencascade.js`'s `autobind.py` gives the zero-arg constructor of any class with multiple constructors the `_1` suffix; the base class name alone has no accessible constructor. Working constructors:

| Class | Constructor |
|---|---|
| `BRep_Builder` | `new O.BRep_Builder()` — single constructor, no suffix |
| `TopoDS_Compound` | `new O.TopoDS_Compound()` — no suffix |
| `STEPControl_Writer` | `new O.STEPControl_Writer_1()` — `_1` is the zero-arg overload |

`Transfer` signature: `writer.Transfer(shape, mode, doNaming)` — 3 args only, **no** `Message_ProgressRange`.

### Dowel + cut overload fixes (2026-06-27)

The first live-kernel run of the **dowel and cut** geometry (added after the
2026-06-16 STEP spike, which only exercised boards) revealed these paths had
never been run against the real WASM kernel — every dowel and every cut threw.
The dowel/cut unit tests all mock or skip OCCT, so the breakage was invisible
until driven in a browser. Probed against opencascade.js v1.1.1 and fixed:

| Symbol used (broken) | Why it threw | Fix |
|---|---|---|
| `BRepPrimAPI_MakeCylinder_2(R, H)` | `_2` is the `(R, H, Angle)` overload — needs 3 args | `BRepPrimAPI_MakeCylinder_1(R, H)` |
| `Message_ProgressRange_1()` | class **absent** at runtime in v1.1.1 (same finding as the STEP spike) | removed — no progress range |
| `BRepAlgoAPI_Cut_3(S1, S2, progressRange)` | depended on the missing progress range | `BRepAlgoAPI_Cut_3(S1, S2)` — the **2-shape** overload |

`BRepAlgoAPI_Cut_3(S1, S2)` runs the boolean **in its constructor** — `IsDone()`
and `Shape()` are valid immediately, so no separate `Build()` call is needed.
(`BRepAlgoAPI_Cut_2` is `(PaveFiller)` — 1 arg; the suffix numbering does not
follow argument count.) `BRepPrimAPI_MakeCylinder_3(Axes, R, H)` in
`makeCylinderCut` was already correct.

Verified end to end by `e2e/geom-kernel.spec.ts` (boots OCCT in-page and builds
every board/dowel cut path + a STEP export) and `e2e/step-export.spec.ts` (board
+ dowel export through the real UI). These run under Playwright, the only place
the live embind overloads get exercised.

### vite-plugin-wasm conflict

`vite-plugin-wasm` intercepts `.wasm` imports and converts them to compiled `WebAssembly` module objects. opencascade.js uses Emscripten's `locateFile` pattern and expects the WASM file to be a **URL string** — not a compiled module. They are incompatible: `vite-plugin-wasm` breaks opencascade.js init. Fix: **do not use `vite-plugin-wasm`**; serve the WASM as a static asset via `assetsInclude: ['**/*.wasm']`, which provides the URL opencascade.js needs. (Already reflected in `vite.config.ts` and `CLAUDE.md` on `main`.)

### Smoke test results (all pass, 2026-06-16)

1. ✅ STEP export: `Untitled.step` — valid `ISO-10303-21;` header, correct HEADER/DATA structure
2. ✅ STL export: `Untitled.stl` — downloaded without errors
3. ✅ Visible-only filter: hiding the only board greyed out both export menu items
4. ✅ Disabled state: `canExport = visibleParts.length > 0` works correctly

### Resource cleanup in the fallback path

All OCCT temporaries are deleted before `writeStep` returns (`BRep_Builder`, `TopoDS_Compound`, all `makeTransformedShape` results, `STEPControl_Writer_1`). No XCAF handles or `TCollection_ExtendedString_2` temporaries are created, so the cleanup concern flagged in the Task 5 code review no longer applies.

## Transform parity (the "never diverge" guarantee)

`composeWorldMatrix` (`src/geom/transform.ts`) is a pure, THREE-free closed form of the part world matrix (position + Euler `XYZ` deg→rad), verified element-wise against `THREE.Matrix4` in `transform.test.ts`. Both export paths consume it: STL applies it on the main thread (`stl.ts`); STEP receives `Array.from(...)` of it per part and re-applies via `gp_Trsf.SetValues`. The column-major → row-major 3×4 mapping in `makeTransformedShape` is the load-bearing conversion (`row0=(m0,m4,m8,m12)`, `row1=(m1,m5,m9,m13)`, `row2=(m2,m6,m10,m14)`); a wrong mapping silently mis-places solids, so the live FreeCAD check is the guard.

- **Latent footgun:** `composeWorldMatrix` hardcodes Euler order `XYZ`. Safe today because `Part.rotationOrder` is typed as the single literal `'XYZ'`; if another order is ever added to the type, this function (and the export paths) must be revisited. TypeScript will surface the call sites.

## Delivery & scope decisions (recap)

- **Blob download**, not File System Access API — matches the CSV cutting-list precedent; works in all browsers; no `supported` gate. New shared helper `src/ui/download.ts` (`CuttingList.tsx` keeps its own inline copy; not refactored, per surgical discipline).
- **Visible-only, whole scene**, +Z up, millimetres. STL binary, single merged triangle soup with recomputed facet normals. STEP = flat set of named solids (no nested product hierarchy).
- Menu: two flat items under "Cutting List…"; no keyboard shortcuts (avoid collision with `⌘⇧E` / viewport `C`/`F`).

## Out of scope (future cycles)

2D shop drawings; per-part/selected export; ASCII STL; `.stp` alias; STEP assembly hierarchy; axis/unit options; user-facing export error UI.
