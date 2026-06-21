# Dowel 2D Drawings (SP4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow superpowers:test-driven-development — write the failing `drawing.test.ts` assertions before the projection math.

**Goal:** Give every visible dowel (`CylinderPart`) a two-view shop drawing — a
**Side** (longitudinal rectangle) and an **End** (circle) view — with overall
⌀ + length dimensions and full, dimensioned geometry for all four dowel cut
types, and list dowels on the shared project cover sheet. Reuse the existing
viewer, print, SVG/DXF download infrastructure with **zero changes** to
`DrawingViewer.tsx`, `App.tsx`, and `FileMenu.tsx`.

**Architecture:** A separate `DowelView` view type + a `shape: 'dowel'` arm on
the `DrawingSheet` `kind: 'part'` union (mirroring SP2's separate `DowelCut`
union). All projection math is pure and lives in `src/geom/drawing.ts`
(THREE-free, Node-testable). `buildSvg.ts`/`buildDxf.ts` gain dowel render paths
beside the untouched board paths; round geometry needs three new renderer-
agnostic primitives (`DrawCircle`, `DrawSegment`, `DrawRect`) and dashed/hidden
styling (SVG `stroke-dasharray`; DXF `DASHED` `LTYPE` + `HIDDEN` layer). The Side
view "rolls" all cuts into one projection (axial position + radial depth true,
azimuth as a label); the End view shows true azimuth. Phased: model + uncut
views → end cut + notch → bores.

**Tech Stack:** React 19 + TypeScript (strict: `noUnusedLocals`,
`noUnusedParameters`, `verbatimModuleSyntax`, no `any`), Vitest + happy-dom +
@testing-library/react, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-21-dowel-drawings-design.md`.

---

## Prerequisite: base branch

SP1–SP3 (the `CylinderPart` primitive, `DowelCut` union, dowel cuts and snap)
are already on `main`. Develop on the session feature branch
`claude/funny-cray-7uy6qp`. Verify the base:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. `Part = BoardPart | CylinderPart` exists in
`src/scene/types.ts`; `CylinderPart` has `diameter`, `length`,
`cuts: DowelCut[]`; `buildDrawingSheets` exists in `src/geom/drawing.ts` and
currently filters `p.kind === 'board'`. If any is absent, the base is wrong —
stop and fix it.

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/geom/drawing.ts` | New primitives (`DrawCircle`/`DrawSegment`/`DrawRect`), `DowelView`, `shape`-tagged `DrawingSheet`, `CoverRow.dimensions`; `selectDowelScale`, `buildDowelViews`, dowel cover rows |
| Modify | `src/geom/drawing.test.ts` | Dowel sheet/view/cut/scale/cover tests |
| Modify | `src/ui/buildSvg.ts` | `svgCircle`, dashed style, `renderDowelView`, dowel `buildSvg` branch, cover `Dimensions` column |
| Modify | `src/ui/buildSvg.test.ts` | Dowel SVG: circle, dashes, slot, labels, cover header |
| Modify | `src/ui/buildDxf.ts` | `dxfCircle`, `DASHED` `LTYPE` + `HIDDEN` layer + `6` override, `dxfDowelView`, dowel `buildDxf` branch, cover `Dimensions` column |
| Modify | `src/ui/buildDxf.test.ts` | Dowel DXF: `CIRCLE`, `LTYPE`/layer, dashed override, Y-flip, cover header |
| Modify | `src/ui/DrawingViewer.test.tsx` | A `shape: 'dowel'` sheet renders + downloads (viewer is shape-agnostic) |
| Create | `docs/superpowers/notes/2026-06-21-dowel-drawings-notes.md` | Living implementation notes |

**Untouched (verify, do not edit):** `src/ui/DrawingViewer.tsx`, `src/App.tsx`,
`src/ui/FileMenu.tsx`, `src/scene/types.ts`, `src/scene/useFile.ts`. If any edit
to these seems necessary, the design assumption broke — stop and reconcile with
the spec before proceeding.

---

## PHASE 1 — Model + scaffold + uncut two-view drawing

### Task 1.1: Drawing model types

**Files:** Modify `src/geom/drawing.ts`.

- [ ] Add `DrawCircle { cx, cy, r, dashed }`, `DrawSegment { x1, y1, x2, y2, dashed }`,
      `DrawRect { rect: Rect2D; dashed }` (all `export interface`).
- [ ] Add `DowelView` exactly as in spec §1 (`label: 'Side' | 'End'`, `outline`,
      `circles`, `rects`, `segments`, `cutLabels`, `noteLabels`, `dims`,
      `placement`).
- [ ] Change `CoverRow` to `{ index, label, material, dimensions: string, cutCount }`
      (remove `length`/`width`/`thickness`).
- [ ] Introduce `PartSheetCommon` and rewrite `DrawingSheet` as the three-arm
      union from spec §1; tag the existing board object with `shape: 'board'`.

**Verify:** `pnpm typecheck` — expect compile errors in `buildDrawingSheets`,
`buildSvg.ts`, `buildDxf.ts` (CoverRow + sheet shape). These are fixed in the
following tasks; the type model itself must compile in isolation.

### Task 1.2: Cover rows for all parts + board `shape` tag

**Files:** Modify `src/geom/drawing.ts`.

- [ ] In `buildDrawingSheets`, build `coverRows` from **all** `parts` (not just
      boards), in input order. Board: `dimensions = \`${L}×${W}×${T}\``. Dowel:
      `dimensions = \`⌀${diameter}×${length}\``. `cutCount = p.cuts.length` for
      both. Keep `index = i + 1` over the full list.
- [ ] Add `shape: 'board'` to the object returned for each board sheet
      (no other board logic changes).

**Verify:** typecheck advances past CoverRow usage in `drawing.ts`.

### Task 1.3: Dowel scale + uncut views

**Files:** Modify `src/geom/drawing.ts`.

- [ ] `selectDowelScale(L: number, D: number): number` —
      `raw = Math.min((AREA_W - GAP) / (L + D), AREA_H / D)`; return the first
      `STANDARD_SCALES` factor `<= raw`, else the smallest (mirror `selectScale`).
- [ ] `buildDowelViews(dowel: CylinderPart, scale: number): [DowelView, DowelView]`
      for the **no-cuts** case first:
  - Side: `outline = [(0,0),(L,0),(L,D),(0,D)]·scale` (D = diameter); empty
    `circles`/`rects`/`segments`/`cutLabels`/`noteLabels`; `dims` = length
    (horizontal, `offset = D·scale + BOARD_DIM_OFFSET`, label `\`${L}mm\``) and
    diameter (vertical, `offset = L·scale + BOARD_DIM_OFFSET`, label
    `\`⌀${D}mm\``); `placement = { x: MARGIN, y: MARGIN }`.
  - End: empty `outline`; `circles = [{ cx: R·scale, cy: R·scale, r: R·scale,
    dashed: false }]` (R = D/2); empty everything else; no `dims`;
    `placement = { x: MARGIN + L·scale + GAP, y: MARGIN }`.
- [ ] In `buildDrawingSheets`, map `CylinderPart`s to
      `{ kind: 'part', shape: 'dowel', partLabel, material, color, date,
      views: buildDowelViews(p, selectDowelScale(p.length, p.diameter)),
      scaleLabel: toScaleLabel(scale) }`. Emit boards and dowels following the
      cover, preserving input order (iterate `parts` once, branch on `kind`).

**Verify:** `pnpm typecheck` green for `drawing.ts`. Write Task 1.4 tests next.

### Task 1.4: `drawing.test.ts` — uncut dowel + cover + scale

**Files:** Modify `src/geom/drawing.test.ts`. (TDD: these may be written before
1.3 and watched fail.)

- [ ] Single dowel, no cuts → 2 sheets; part sheet `shape === 'dowel'`,
      `views.length === 2`, labels `'Side'`/`'End'`.
- [ ] Side `outline` equals the `L×D` rectangle (4 points, scaled); Side `dims`
      contain `\`${L}mm\`` and `\`⌀${D}mm\``.
- [ ] End `circles[0]` radius `=== R·scale`; `outline` empty.
- [ ] Cover row for the dowel has `dimensions === \`⌀${D}×${L}\``,
      `cutCount === 0`.
- [ ] Mixed scene (board + dowel) → cover rows in input order with per-kind
      `dimensions`; board sheet `shape === 'board'`, dowel sheet
      `shape === 'dowel'`; sheet count `=== 1 + 2`.
- [ ] `selectDowelScale` rounds down to expected `STANDARD_SCALES` factor for a
      few ⌀/L pairs.

**Verify:** `pnpm vitest run src/geom/drawing.test.ts` green.

### Task 1.5: SVG dowel rendering + cover column

**Files:** Modify `src/ui/buildSvg.ts`, `src/ui/buildSvg.test.ts`.

- [ ] Add `svgCircle(cx, cy, r, style)` (emits `<circle cx cy r .../>` via `el`).
- [ ] Add a shared dashed fragment `{ 'stroke-dasharray': '1.2,0.8' }`.
- [ ] `renderDowelView(view: DowelView)`: view-label text; `outline` →
      `<polygon>` (board outline style) when non-empty; each `circle` →
      `svgCircle` with boundary style `{ stroke:'#000', fill:'none',
      'stroke-width': dashed?0.2:0.3 }` plus dash fragment when `dashed`; each
      `rects[i]` → existing cut-rect style (+ dash when `dashed`); each
      `segments[i]` → `svgLine` solid `{ stroke:'#000','stroke-width':0.3 }` or
      dashed `{ stroke:'#444','stroke-width':0.2, ...dash }`; `cutLabels` +
      `noteLabels` via existing text styles; `dims` via `renderDimLine`.
- [ ] `buildSvg`: branch `kind==='cover'` → cover; else
      `sheet.shape==='dowel'` → `sheet.views.map(renderDowelView).join('') +
      renderTitleBlock(sheet)`; else existing board path. (`renderTitleBlock`
      already reads only `PartSheetCommon` — confirm, do not edit it.)
- [ ] `renderCoverSheet`: change header `'L × W × T'` → `'Dimensions'`; row cell
      reads `row.dimensions` (drop the `${length}×...` template). Header array
      now `['#','Label','Material','Dimensions','Cuts']`.
- [ ] Tests: dowel SVG parses (`DOMParser`, no `parsererror`); `<circle>` with
      `r` matching `R·scale`; a dashed element has `stroke-dasharray`, a solid
      circle does not; a notch `<rect>` present (defer to Phase 2 if no cuts yet
      — for Phase 1 assert the End circle + Side polygon); title block has the
      dowel `partLabel`; cover header text contains `'Dimensions'` and a dowel
      row contains `'⌀'`.

**Verify:** `pnpm vitest run src/ui/buildSvg.test.ts` green; `pnpm typecheck`.

### Task 1.6: DXF dowel rendering + cover column

**Files:** Modify `src/ui/buildDxf.ts`, `src/ui/buildDxf.test.ts`.

- [ ] `dxfCircle(layer, cx, cy, r)` → `CIRCLE` (`0/CIRCLE,8/layer,10/x,
      20/fy(y),30/0,40/r`).
- [ ] Extend `dxfTables()`: add `HIDDEN` to the layer list; add an `LTYPE`
      table defining `CONTINUOUS` (empty pattern) **and** `DASHED`
      (pattern length `2.0`, two dash elements `1.2` and `-0.8`). r12 `LTYPE`
      record: `0/LTYPE, 2/name, 70/0, 3/desc, 72/65, 73/elementCount,
      40/patternLength, 49/each element`. Keep the existing `LAYER` table.
- [ ] Helper to emit a dashed entity's linetype override: append group code
      `6\nDASHED` inside the `CIRCLE`/`LINE` records when dashed. Add an optional
      `dashed` param to a small internal line/circle emitter, or post-insert the
      `6/DASHED` pair — keep `dxfLine`/`dxfRect` signatures stable for the board
      path (add `dxfDashedLine`/dashed-aware `dxfCircle` rather than changing
      existing helpers).
- [ ] `dxfDowelView(view)`: `outline` → `LINE`s on `OUTLINE`; solid circles via
      `dxfCircle` on `OUTLINE` (boundary) / `CUTS`; dashed circles on `HIDDEN`
      with `6/DASHED`; `rects` via `dxfRect` on `CUTS`; segments as `LINE`s
      (solid on `OUTLINE`/`CUTS`, dashed on `HIDDEN` with `6/DASHED`); labels via
      `dxfText` on `TEXT`; dims via `dxfDimLine`.
- [ ] `buildDxf` switch: `shape==='dowel'` →
      `views.map(dxfDowelView).join('') + dxfTitleBlock(sheet)`.
- [ ] `dxfCoverSheet`: header `'L x W x T'` → `'Dimensions'`; row cell reads
      `row.dimensions`.
- [ ] Tests: dowel DXF contains `CIRCLE`; `TABLES` contains `DASHED` and a
      `HIDDEN` layer; Y-flip (`y_svg=0 → y_dxf=210`) holds for a dowel point;
      cover header contains `'Dimensions'`, dowel row contains `'⌀'`. (Dashed
      `6/DASHED` override asserted in Phase 3 once bores exist; for Phase 1 the
      `LTYPE`/layer presence is enough.)

**Verify:** `pnpm vitest run src/ui/buildDxf.test.ts` green; `pnpm typecheck`.

### Task 1.7: Viewer shape-agnostic check

**Files:** Modify `src/ui/DrawingViewer.test.tsx`. (Source `DrawingViewer.tsx`
untouched.)

- [ ] Build a sheet list with a `shape: 'dowel'` part sheet; assert the viewer
      renders SVG, shows `Part 1 of 1 — {label}`, and Download SVG/DXF call
      `downloadBlob` with the dowel filename + correct mime. Confirms the
      `shape` discriminant never reaches the viewer.

**Phase 1 gate:** `pnpm typecheck && pnpm lint && pnpm test` all green. An uncut
dowel produces a Side rectangle + End circle sheet, listed on the cover; boards
are unchanged (existing board tests still pass — the `shape: 'board'` tag and
`CoverRow.dimensions` are the only board-visible deltas; update any board cover
assertions that referenced `length`/`width`/`thickness`).

---

## PHASE 2 — End cut + notch (solid geometry)

### Task 2.1: End-cut outline trimming (Side)

**Files:** Modify `src/geom/drawing.ts`, `src/geom/drawing.test.ts`.

- [ ] In `buildDowelViews`, fold each `DowelEndCut` into the Side `outline`:
      square (`angle <= 0`) trims the chosen end inward by `offset` (rectangle
      shortened on that end); angled (`angle > 0`) replaces the end edge with a
      slanted edge, drop across the diameter `= D·tan(angle·π/180)` toward the
      shorter side. Reuse the mitre-outline pattern (`mitreFaceOutline` /
      `src/geom/mitre.ts`) as the reference for building a trimmed polygon. Add a
      `noteLabel` `\`${angle}°\`` at the bevel midpoint and a `dim` for `offset`
      from the end when `offset > 0`. No End-view contribution.
- [ ] Degenerate end cut (`offset <= 0 && angle <= 0`) leaves the outline as-is.
- [ ] Tests: square end cut → Side `outline` length reduced by `offset`; angled
      → a slanted `segment`/edge present + `\`${angle}°\`` note; End view
      unchanged.

### Task 2.2: Notch (Side slot + End chord)

**Files:** Modify `src/geom/drawing.ts`, `src/geom/drawing.test.ts`.

- [ ] Side: push a solid `DrawRect` `{ rect: { x:(position-width/2)·scale, y:0,
      w:width·scale, h:depth·scale }, dashed:false }`; `cutLabel`
      `\`${width}×${depth} az${azimuth}°\`` centered in the slot; `dims`: axial
      `position` from the near end (horizontal) and `depth` (vertical), offset
      `CUT_DIM_OFFSET` beyond overall dims.
- [ ] End: push a chord `DrawSegment` perpendicular to the azimuth direction at
      radial distance `(R - depth)` from center, endpoints clipped to the circle
      (`halfChord = sqrt(R² - (R-depth)²)`); orient by the azimuth→screen-angle
      map from spec §2. `cutLabel` `\`d${depth}\`` near the chord.
- [ ] Degenerate notch (`depth <= 0` or `width <= 0`) contributes nothing.
- [ ] Tests: notch → Side `rects[0]` at the right axial position + label +
      position/depth dims; End `segments` contains a chord at radius `R-depth`
      (assert distance from center).

### Task 2.3: SVG/DXF for solid cut primitives

**Files:** `src/ui/buildSvg.ts`/`.test.ts`, `src/ui/buildDxf.ts`/`.test.ts`.

- [ ] Confirm `renderDowelView`/`dxfDowelView` already render `rects` (solid),
      `segments` (solid trim/chord), and `noteLabels` from Phase 1 — they should;
      add only test coverage.
- [ ] Tests: SVG notch `<rect>` present + label contains `'az'`; end-cut
      `<polygon>` reflects the trimmed outline; DXF has the extra `LINE`s for the
      chord/trim.

**Phase 2 gate:** `pnpm typecheck && pnpm lint && pnpm test` green.

---

## PHASE 3 — Bores (hidden/dashed geometry)

### Task 3.1: Axial bore (Side dashed walls + End concentric dashed circle)

**Files:** Modify `src/geom/drawing.ts`, `src/geom/drawing.test.ts`.

- [ ] `boreR = diameter/2`. Side: two dashed `DrawSegment`s at `y = (R±boreR)·scale`
      from the chosen cap inward by `min(depth, L)·scale`; a dashed closing
      `segment` for a blind hole (`depth < L`); `cutLabel`
      `\`⌀${diameter} ${depth>=L?'through':depth}\``; `dim` for `depth` when blind.
- [ ] End: concentric dashed `DrawCircle` `{ cx:R·scale, cy:R·scale, r:boreR·scale,
      dashed:true }`.
- [ ] Degenerate (`diameter <= 0` or `depth <= 0`) contributes nothing.
- [ ] Tests: Side two dashed segments from the correct cap; through vs. blind
      label; End dashed circle radius `boreR·scale`.

### Task 3.2: Transverse bore (Side dashed walls + End dashed slot)

**Files:** Modify `src/geom/drawing.ts`, `src/geom/drawing.test.ts`.

- [ ] Side: two dashed `DrawSegment`s at `x = (position±boreR)·scale` spanning
      top→bottom edge; `cutLabel` `\`⌀${diameter} az${azimuth}°\``; `dim` for
      axial `position` from the near end.
- [ ] End: two dashed `DrawSegment`s parallel to the azimuth direction,
      separated by `diameter`, each clipped to the circle.
- [ ] Degenerate (`diameter <= 0`) contributes nothing.
- [ ] Tests: Side two dashed segments at `position ± boreR`; End two dashed
      segments.

### Task 3.3: Dashed rendering end-to-end

**Files:** `src/ui/buildSvg.ts`/`.test.ts`, `src/ui/buildDxf.ts`/`.test.ts`.

- [ ] SVG: dashed circles/segments carry `stroke-dasharray`; solid ones do not.
- [ ] DXF: dashed entities carry the `6\nDASHED` override and land on `HIDDEN`;
      `LTYPE` `DASHED` is defined in `TABLES`.
- [ ] Tests: a dowel with an axial bore → SVG dashed `<circle>` (has
      `stroke-dasharray`); DXF dashed `CIRCLE`/`LINE` with `6/DASHED`.

**Phase 3 gate:** `pnpm typecheck && pnpm lint && pnpm test` green. A dowel with
one of every cut type renders a complete, dimensioned Side + End sheet; SVG/DXF
download and print round-trip through the unchanged viewer.

---

## Risks & edge cases

- **CoverRow change ripples to board tests.** `drawing.test.ts`,
  `buildSvg.test.ts`, `buildDxf.test.ts` assert the old `L × W × T` header and
  `${length}×${width}×${thickness}` cells. Update them to `Dimensions` /
  `row.dimensions`. This is the only board-visible breakage; expect it and fix
  in the same task that changes the renderer.
- **`renderTitleBlock` / `dxfTitleBlock` must stay shape-agnostic.** They read
  `partLabel`, `material`, `color`, `scaleLabel`, `date` — all in
  `PartSheetCommon`. If TypeScript complains they receive a union, narrow with
  the `shape === 'dowel'` branch before calling, or type the param as
  `PartSheetCommon & { kind:'part' }`. Do not duplicate the title block.
- **Azimuth → screen-angle sign.** Screen y is down; world +Y maps to screen −y.
  A feature at azimuth θ sits at `(cos θ, −sin θ)` from the End-view center. Get
  this wrong and notch chords/transverse slots mirror vertically. Cover with an
  explicit `azimuth = 90°` test asserting the feature is at screen **top**.
- **End-cut outline trimming reuse.** `mitreFaceOutline` is board-specific
  (length/width/thickness). Do not call it directly for dowels; use it only as a
  structural reference and write the dowel trim inline (length × diameter rect).
- **DXF r12 `LTYPE` validity.** Malformed `LTYPE` records make some CAD viewers
  reject the file. Validate the output opens in FreeCAD/LibreCAD if available;
  at minimum assert the exact group-code sequence in a test.
- **Strict TS.** No `any`; remove now-unused board `CoverRow` field references;
  `verbatimModuleSyntax` means `import type` for the new interfaces in
  `buildSvg.ts`/`buildDxf.ts`.
- **Prettier/test hooks** auto-run on `.ts`/`.test.ts` writes; let them.

## Definition of done

- [ ] All three phase gates green: `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] An uncut dowel and a dowel with one of each cut type both render correct
      Side + End sheets (verified by tests; spot-checked in the running app via
      File ▸ 2D Drawings… if convenient).
- [ ] Boards render byte-for-identically except the cover `Dimensions` column.
- [ ] `DrawingViewer.tsx`, `App.tsx`, `FileMenu.tsx` unchanged.
- [ ] `docs/superpowers/notes/2026-06-21-dowel-drawings-notes.md` updated with
      any deviations (azimuth-sign convention, DXF `LTYPE` shape, overlap
      limitation).
- [ ] Committed in phase-sized commits on `claude/funny-cray-7uy6qp`; pushed.
