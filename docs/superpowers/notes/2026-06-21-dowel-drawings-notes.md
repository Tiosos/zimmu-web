# Dowel 2D Drawings (SP4) — Implementation Notes

Living notes for `2026-06-21-dowel-drawings-design.md` /
`2026-06-12-dowel.md` (SP4 section). Record decisions that don't belong in the spec:
rejected approaches, surprises, workarounds, deferred ideas. Audience: a future
reader who needs the *why*.

## 2026-06-21 — Design decisions (pre-implementation)

- **Two views, not three.** A dowel is rotationally symmetric, so a second
  longitudinal view is redundant. Side (rectangle, L×⌀) + End (circle, ⌀).
  Confirmed with the user.
- **Cuts rolled into one Side view.** The Side view is a single fixed
  longitudinal projection, but `DowelNotch`/`DowelBoreTransverse` carry an
  azimuth. Chosen convention (standard for turned parts): the **End** view shows
  true azimuth; the **Side** view shows true axial position + radial depth/size
  with azimuth as an `az N°` text label. Accepted v1 limitation: two cuts at the
  same axial position but different azimuth can visually overlap in the Side
  view — disambiguated by the End view + labels. The rejected alternative
  (orient the Side view to one reference azimuth) would have hidden most cuts and
  contradicted the two-view decision.
- **Separate `DowelView` + `shape: 'dowel'` on `kind: 'part'`** rather than
  generalizing the board `DrawingView` (Approach B) or adding a third sheet
  `kind` (Approach C). Mirrors SP2's separate `DowelCut` union. The decisive win:
  `DrawingViewer.tsx`, `App.tsx`, `FileMenu.tsx` need **no** changes because the
  viewer reads only `PartSheetCommon` + `kind === 'cover'`; the `shape`
  discriminant stays inside `drawing.ts`/`buildSvg.ts`/`buildDxf.ts`.
- **`CoverRow` gains a single `dimensions: string` column** (drops
  `length`/`width`/`thickness`) so boards (`L×W×T`) and dowels (`⌀D×L`) share one
  cover table. This is the only board-visible change and ripples to the three
  existing renderer test files (header `L × W × T` → `Dimensions`).
- **Dashed/hidden geometry.** SVG uses `stroke-dasharray`. DXF r12 needs an
  `LTYPE` table: add a `DASHED` linetype + a `HIDDEN` layer, and emit a
  per-entity `6/DASHED` override on dashed `CIRCLE`/`LINE` entities. This is the
  one genuinely new DXF mechanism in this sub-project.

## 2026-06-21 — Implementation

- **A fourth renderer existed that the plan missed: `src/ui/buildPdf.ts`** (the
  "Download PDF (all)" path, pdf-lib). It switches on sheet kind and uses
  `renderPdfView(DrawingView)` + `row.length/width/thickness`, so the
  `CoverRow.dimensions` change and the `shape: 'dowel'` views broke its
  typecheck. Added `renderPdfDowelView` (circles via `page.drawCircle`, dashes
  via `dashArray`/`borderDashArray`) and the `shape === 'dowel'` branch, plus the
  `Dimensions` cover column. All four renderers (SVG/DXF/PDF + the geometry in
  `drawing.ts`) now handle dowels; `DrawingViewer.tsx`, `App.tsx`,
  `FileMenu.tsx` stayed untouched as designed.
- **Azimuth → End-view screen direction is `(cosθ, −sinθ)`** (screen-y down vs.
  world +Y up). Perpendicular for chord/slot orientation is `(−dirY, dirX)`.
  Verified indirectly by the notch chord-distance test and the transverse-slot
  count test.
- **Dimensioning was trimmed from the spec's "every cut gets dims" to reduce
  sheet clutter:** kept the overall length + ⌀ dims (Side) and the *locating*
  axial-position dim for notch and transverse bore; sizes (notch w×depth, bore
  ⌀, end-cut offset/angle, through/blind) live in the cut/note **labels**
  instead of separate `DimLine`s. This is cleaner and still shop-complete. If a
  reviewer wants explicit size dims, they're cheap to add.
- **End-cut bevel in the rolled Side view is drawn worst-case across the full
  diameter** (`drop = ⌀·tan(angle)`), since azimuth is collapsed in that view.
  Implemented inline (corner trimming) rather than via the board's
  `mitreFaceOutline` — the board helper is length/width/thickness-specific and
  not worth bending to a length×⌀ rectangle.
- **DXF dashed:** added an `LTYPE` table (`CONTINUOUS` + `DASHED`, pattern
  `[1.2, −0.8]`, length 2.0) before the `LAYER` table, a `HIDDEN` layer carrying
  `DASHED`, and a per-entity `6/DASHED` override on dashed `LINE`/`CIRCLE`
  entities. Asserted by group-code substring test; not yet opened in
  FreeCAD/LibreCAD (no GUI in this env).
- **Side-view overlap (same axial position, different azimuth) limitation
  stands** and was not hit by any test geometry; no mitigation added — End view +
  `az N°` labels disambiguate, as designed.
