# Dowel 2D Drawings (SP4) — Implementation Notes

Living notes for `2026-06-21-dowel-drawings-design.md` /
`2026-06-21-dowel-drawings.md`. Record decisions that don't belong in the spec:
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

## To fill in during implementation

- [ ] Azimuth → End-view screen-angle sign convention, once verified by the
      `azimuth = 90°` test (expected: feature at screen top, `(cosθ, −sinθ)`).
- [ ] Exact DXF `LTYPE`/`HIDDEN` group-code sequence that opens cleanly in
      FreeCAD/LibreCAD.
- [ ] Any end-cut outline-trimming subtleties vs. the board `mitreFaceOutline`
      reference.
- [ ] Whether the accepted Side-view overlap actually bites in practice (and any
      cheap mitigation discovered).
