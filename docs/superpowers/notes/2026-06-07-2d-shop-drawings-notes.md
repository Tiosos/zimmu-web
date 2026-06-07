# 2D Shop Drawings — Implementation Notes

**Date:** 2026-06-07
**Spec:** `docs/superpowers/specs/2026-06-07-2d-shop-drawings-design.md`
**Plan:** `docs/superpowers/plans/2026-06-07-2d-shop-drawings.md`

Living record of decisions and surprises. Audience: future developer who needs to know *why*.

## Spec deviation: `date` field on part sheets

The spec's `DrawingSheet` `kind: 'part'` type did not include a `date` field. Added it so
serializers can include the build date in the title block without calling `new Date()` inside
`buildSvg`/`buildDxf` (which would make tests non-deterministic). `buildDrawingSheets` sets
`date = new Date().toISOString().slice(0, 10)` for both cover and part sheets.

## DXF r12: LINE entities, not LWPOLYLINE

The spec mentioned `LWPOLYLINE` for rectangles. `LWPOLYLINE` is a DXF 2000+ entity (AC1015),
not r12 (AC1009). Switched to 4× `LINE` entities per rectangle. All target applications
(FreeCAD, AutoCAD, CNC importers) accept LINE entities in r12 files.

## XSS: added escapeXml to buildSvg

The original plan did not include XML escaping for user content in `buildSvg`. The SVG output
is rendered via `dangerouslySetInnerHTML` in `DrawingViewer`, so unescaped labels like
`<script>alert(1)</script>` would execute. Added `escapeXml()` helper that escapes `& < > "`
in both element content and attribute values within `el()`. Two XSS regression tests added.

## Y-flip in DXF

SVG origin is top-left, Y increases downward. DXF r12 default is bottom-left, Y increases
upward. Conversion: `y_dxf = 210 − y_svg` (sheet height 210mm). Applied in `dxfLine` and
`dxfText` via the `fy()` helper in `buildDxf.ts`.

## Projection math: flipV for Edge and End views

`faceAxes('+Y')` and `faceAxes('+X')` both return `v='z'`. Z increases upward in 3D local
space but downward in SVG. Without flipping, the top of the board (z=T) would render at the
bottom of the Edge/End views. The `flipV=true` path in `projectCut` corrects this:
`y_svg = (boardH − (vPos + vSz/2)) × scale`.

## React lint: useEffect setState guard

`DrawingViewer` originally had `useEffect(() => { if (open) setIdx(0) }, [open])` to reset
the sheet index when the viewer opens. This triggered `react-hooks/set-state-in-effect`.
Fixed with a `prevOpenRef` that only fires `setIdx(0)` on the false→true transition.

## Manual browser verification required post-merge

Two steps that cannot be verified in tests:

1. **Visual correctness:** Open `pnpm dev`, add 2-3 parts with cuts, open File ▸ 2D Drawings…,
   navigate through sheets, confirm views are correctly sized and dimensioned.
2. **DXF round-trip:** Download a DXF and open in FreeCAD. Verify all 5 layers are present,
   lines align correctly with the SVG preview, and text is readable.

## Out of scope (future cycles)

Cross-view hidden-line projection of cuts; per-part export selection; user-configurable paper
size or scale override; 3D isometric thumbnail; grain direction annotation.

**Next main task:** Enhanced Cutting List — hardware items, cost/qty columns, supplier notes
(full BOM).
