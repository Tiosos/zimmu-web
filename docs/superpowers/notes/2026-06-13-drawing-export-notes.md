# Drawing Export — Implementation Notes

**Date:** 2026-06-13
**Related spec:** `docs/superpowers/specs/2026-06-13-pdf-export-design.md`

## Decisions

### PDF approach: direct geometric calls (pdf-lib) over SVG passthrough

Three options were evaluated:

- **Option A (chosen):** pdf-lib with direct geometric calls — mirrors `buildDxf.ts` pattern, produces true vector PDF, one dependency, no SVG parsing risk.
- **Option B:** jsPDF + svg2pdf.js — simpler code (pass SVG string), but two dependencies and svg2pdf.js has known issues with custom SVG attributes (color swatches, opacity fills).
- **Option C:** Canvas rasterization + pdf-lib — easiest to implement but produces a raster image; unacceptable for dimensioned shop drawings.

### Multi-page only (no per-sheet PDF)

SVG and DXF are per-sheet because CAD tools import one drawing at a time. PDF's unique value is "send the whole set to the shop." A per-sheet PDF button would duplicate the SVG button with no benefit.

### Filename: `{projectName}-drawings.pdf`

Consistent with how `.step` and `.stl` exports use the project name. Sheets are identified internally by page number.

---

## Deferred Tasks — Other Improvements from 2026-06-13 Survey

These tasks were identified but not implemented in this session. Listed here so they survive context resets.

### 1. Snap preview ghost mesh — DONE ✓
**Completed 2026-06-13.** Semi-transparent preview of source part at snap destination during `source-picked` phase. Implemented in `src/render/viewport.tsx`. Commit: `823a513`.

### 2. WASM performance instrumentation
**Effort:** 2–3 hrs. **File:** `src/geom/occt.worker.ts`.
Add `performance.mark()` / `performance.measure()` around `buildPart()` calls. Expose timing via a console log or a dev-mode overlay. Needed before profiling the geometry pipeline for Phase 1 optimisation.

### 3. Playwright end-to-end tests
**Effort:** 10–15 hrs.
Unit suite is at 374 tests (all geom + hooks). Zero browser-level workflow tests. Key flows to cover: add a part → snap align → export STL; add a cut → open drawings → download SVG. Requires setting up Playwright harness (`playwright.config.ts`, CI step).

### 4. Snap source face pulse / animation
**Effort:** < 1 hr. **File:** `src/render/viewport.tsx`.
The yellow `sourceHighlight` LineLoop appears statically once a source face is picked. A CSS animation or a Three.js opacity pulse (via `rafId` in the render loop) would make the "waiting for target" state more perceptible. Very small change.

### 5. Rotation snap (non-parallel face alignment)
**Effort:** 8–10 hrs. **File:** `src/scene/snapMath.ts`, `src/scene/useSnap.ts`.
Extend `computeSnapDelta` (or add `computeSnapRotation`) to align non-parallel faces using quaternion orientation. Currently only translational (flush) snaps work. Deferred pending UX design for how rotation confirmation should work.

### 6. `.zimmu` → `.zmu` file format migration
**Effort:** 4–6 hrs. **File:** `src/scene/useFile.ts`.
Binary `.zmu` format planned for v0.5. Migration script needed to convert existing flat-JSON `.zimmu` files. Blocked on finalising `.zmu` binary schema.
