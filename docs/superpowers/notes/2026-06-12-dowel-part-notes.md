# Dowel Part (SP1) — Implementation Notes

Living record of decisions and surprises. Audience: a future developer who needs to know *why*.

## Refinements beyond the spec

- **`MaterialDef.costPerM2` made optional** (the spec had it required, only `costPerM` optional). A dowel-only material carries `costPerM` but no `costPerM2`; a forced `0` board rate would make boards of that material show `$0.00` instead of `—`. Both rates optional is the correct, symmetric model. Fallout fixed in `groupParts` (`materials[name]?.costPerM2`) and `LibraryTab` (`!== undefined` guard).
- **2D-drawings guard implemented as a board filter inside `buildDrawingSheets`**, not a disabled button. Drawings operate on all visible parts, so filtering non-board parts (`(p): p is BoardPart`) there is the precise, type-safe guard.
- **No file-format version bump.** `costPerM` / optional `costPerM2` are backward-compatible; v2 files load unchanged.

## Decisions

- **`MaterialPopover` generalized and exported** from `CuttingList.tsx` — it now edits a single number + `unitLabel`, and callers build the merged `MaterialDef`. The board popover saves `{ ...materials[name], costPerM2: num }` and the dowel popover `{ ...materials[name], costPerM: num }`, so the *other* rate survives an edit (covered by a dedicated test in `CuttingList.test.tsx`).
- **`makeCylinder` uses `BRepPrimAPI_MakeCylinder_2(R, H)`** (default +Z axis, base at origin), via the existing `(oc as any)` pattern (the OCCT TS types don't expose the constructor — same workaround as `makeCut`). **Not verifiable in this environment** — Node skips OCCT WASM, so the live overload is UNVERIFIED. The `it.skip` smoke test and a `pnpm dev` visual check are the only ways to confirm it; that manual check remains outstanding (see "Outstanding" below).
- **`Part` union rippled wider than the plan listed.** Beyond `drawing.ts`/`useScene.exportStep`, the cut handlers (`onUpdateCut`/`onRemoveCut`/`onLinkCuts`/`onUnlinkCuts` in `useScene.ts`, `useAddCut.ts`, the sidebar cut-link loops) all read board-only fields and were narrowed to boards (cuts are board-only; cylinders pass through untouched). Board runtime behavior is byte-identical. Test fixtures retyped `Partial<Part>` → `Partial<BoardPart>`.
- **`useFile.parseFile` now ADMITS cylinder parts (critical save/load fix found in final review).** The original implementation filtered to `kind === 'board'` only, silently dropping `kind === 'cylinder'` parts on every file open — a data-loss bug. Fixed: the filter now admits both 'board' and 'cylinder', warns only on genuinely unknown kinds, and the `.map` applies kind-aware defaults (cylinders do NOT receive a `cuts` field, which is board-only). Covered by a round-trip regression test (`parseFile preserves cylinder (dowel) parts`).
- **Exhaustive `switch` (not ternary) for kind routing** in `occt.ts` `makeTransformedShape` and `occt.worker.ts` `buildPart`, with a `never` default — restores the compile-time exhaustiveness the codebase values elsewhere, so a future third kind is a type error rather than a silent cylinder fallthrough.
- **`BuildSpec` (worker) and `ExportSpec` (occt) are separate types** — genuinely different shapes (`BuildSpec` has no `matrix`/`label`). Not merged.
- **Dowel labeling uses a max-suffix scan** (`/^Dowel (\d+)$/`), mirroring the board `labelCounter`, after a review caught that a count-based label collides after delete+re-add. Regression test added.
- **Dowel defaults:** Ø8 × 100 mm, label `Dowel N`. Local axis +Z, base circle centered at the local origin.
- **Flat-shaded facets** on the curved surface (`angularDeflection: 0.5`), consistent with existing rendering. Smooth normals deferred.

## Deferred follow-ups (flagged by code review, intentionally NOT done — out of scope for SP1)

- **BOM table duplication.** `DowelList` is the 2nd near-copy of the board table in `CuttingList` (material-cost cell + popover wiring + subtotal row). A shared `MaterialCostCell` (alongside `MaterialPopover`) would remove the most error-prone duplication without forcing a full table abstraction. Reconsider if a 3rd table copy lands.
- **`BomModal` 4-way conditionals.** The tab-label nested ternary and `handleCopy`/`handleDownload` chains are at the edge of readable; a `TAB_LABELS` lookup record and a `csvFor(tab)` helper would tidy them. Reconsider at a 5th tab.
- **Footer `'—'`-when-no-cost logic** is duplicated for Boards and Dowels; a tiny `subtotalLabel(sub, hasCost)` helper would dedupe.
- **`MaterialPopover` home.** Currently exported from the leaf file `CuttingList.tsx`. If a 3rd reuse site appears, move it to `src/ui/MaterialPopover.tsx`.
- **`CuttingList` board-popover tooltip** still hardcodes `"Click to set $/m² rate"` — accurate for boards today; revisit if the popover is reused elsewhere in that table.

## Outstanding (cannot be done in this headless environment)

- **Live WASM verification of `makeCylinder` and the dowel render path.** `pnpm dev` → add a dowel → confirm the cylinder renders (axis +Z, base at origin), Ø/length edits rebuild it, STL/STEP include it, and a saved `.zimmu` round-trips the dowel. Node tests skip OCCT WASM, so this remains unverified by the automated suite.

## Out of scope (queued for later cycles)

- SP2 dowel cuts (end miters / cross-cuts; `useAddCut` for cylinder faces).
- SP3 dowel snap-align (cap-to-face; `snapMath` cylinder variant).
- SP4 dowel 2D drawings (circle + rectangle orthographic views, Ø/length dims).
- Curved-surface smooth shading.
