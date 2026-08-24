# Sheet yield and grain direction — design

**Date:** 2026-08-23
**Status:** approved, awaiting implementation plan
**Plan:** _(to be written — staged, see "Stages" below)_
**Notes:** `docs/superpowers/notes/2026-08-23-sheet-yield-notes.md`

## Why

Zimmu's cutting list answers "what pieces do I need". It does not answer the question that decides
what a job costs: **how much sheet material does it consume, and how many sheets do I buy.**

This design adds grain direction as real data and a nesting engine that lays parts onto stock
sheets, reporting sheet count, utilisation and cost.

It began as a much smaller question — the cutting list was naming the wrong dimension as "length"
(fixed separately in Task 7.9, `cutDimensions`) — and the fix raised the question of what decides
which dimension *is* the length. Grain does. Grain only matters because of yield. So the scope
followed the reasoning to its end rather than stopping at a label.

## Scope, and what is deliberately excluded

**In scope:** grain as a field on a board and on a material; sheet stock definitions; a nesting
engine; a yield report with a per-sheet visual.

**Excluded, deliberately:**

- **DXF or G-code export of the nest.** The layout is displayed, not exported.
- **Toolpaths, feeds, speeds, tabs, lead-ins.** Machine-specific, a project of its own.
- **Irregular multi-part offcut tracking across projects.** Offcuts are reported per job, not banked.

### The stated assumption behind free nesting

Free nesting (parts placed anywhere, not on guillotine lines) yields better than saw-friendly
layouts. But a free-nested sheet **cannot be cut by hand** — there is no edge-to-edge cut sequence a
person can follow — and this design does not export the layout to a machine.

So the design assumes **a shop with a CNC router that does its own CAM**. The sheet *count* is the
actionable output; the diagram is a sanity check, not a cutting plan. If that assumption is wrong,
guillotine nesting would be the better engine and this design should be revisited rather than
extended. Recorded because it is the one place where the chosen options are in tension.

## Decisions taken with the user

All taken in the 2026-08-23 session, in this order. Each superseded a smaller option.

| Question | Decision |
|---|---|
| What is grain for? | **Sheet-yield optimisation**, not labelling |
| Design scope | **One design, staged plans** — so the data model is designed against its real consumer |
| Cutting method | **Free nesting** (CNC), not guillotine |
| Output | **Yield figures plus an on-screen layout.** No DXF, no G-code |
| Part shape | **True outlines** — a part may tuck into another's notch |
| Rotation | **0° and 180° always; 90° and 270° only when grain permits** |
| Engine | **Raster occupancy**, not no-fit polygons |
| Stock lives in | **The material library** (IndexedDB), like cost rates |
| Tool clearance | **One global setting, default 14 mm**, editable. Becomes CAM-visible if G-code is ever added |
| Grain on hidden parts | **Every generated panel carries grain.** `free` is a manual override, never a default |
| Back panel grain | **Vertical**, matching the sides |
| Shelf grain | **Along the span** |

## Data model

### Grain on a board

```ts
export type Grain = 'length' | 'width' | 'free'
// on BoardPart:
grain: Grain
```

`'free'` means the nester may rotate the part 90°. It is what MDF and any part the user marks
unconstrained will carry. It is never what the carcase generator emits.

### Stock on a material

```ts
export interface MaterialDef {
  costPerM2?: number
  costPerM?: number
  sheet?: { length: number; width: number; costPerSheet?: number }
  hasGrain?: boolean
}
```

`sheet` absent means the material is not nested — dowels, hardware, solid stock bought to length.
Such materials keep appearing in the Boards tab exactly as they do today and are simply absent from
the Sheets tab; they are never an error and never a zero-sheet row.
`hasGrain: false` (MDF) lets the nester rotate every part of that material regardless of the part's
own `grain`, because the stock has no direction to respect.

**Cost precedence:** `costPerSheet` prices a job by sheets consumed, which is what a supplier
actually charges. `costPerM2` remains for materials with no sheet defined. Where both exist, sheets
win, and the cutting list's areal figure becomes a secondary column rather than the headline.

### Clearance

One global setting, default **14 mm**, stored beside the material library. Applied as a margin
around every placed part, so the gap between two neighbours is one clearance, not two.

### File format

`BoardPart.grain` is new, so every existing file lacks it. **Normalise once at the `parseFile`
boundary** — the precedent already used for `parentId` and `backSetback` — defaulting to `'free'`,
which preserves today's behaviour exactly (nothing is currently constrained). No read site should
ever carry `?? 'free'`.

Whether `FILE_FORMAT_VERSION` bumps is an implementation decision: an old file that loads correctly
under the new shape arguably does not need one. Justify either way in the plan.

## Per-role grain from the carcase generator

Each panel has its own board frame, so the same physical convention lands on different fields. This
looks inconsistent and is not:

| role | board length is | board width is | grain runs | field |
|---|---|---|---|---|
| `left-side`, `right-side`, `divider-*` | depth | height | vertically | `width` |
| `bottom`, `top`, `shelf-*` | cabinet width | depth | along the span | `length` |
| `back` | height | cabinet width | vertically | `length` |
| `toe-kick`, `ladder-front`, `ladder-back` | kick height | cabinet width | horizontally | `width` |
| `ladder-left`, `ladder-right`, `ladder-mid-*` | depth run | rail height | along the rail | `length` |

**Do not "fix" the inconsistency.** It is a consequence of `orientedPanel` mapping all three board
axes onto carcase axes positively — the invariant that makes `position` the box min corner. The
table is correct; the frames differ.

**A useful property, worth asserting in a test:** for every role above, the grain-running dimension
is also the *larger* of the two. So grain and `cutDimensions`' existing longest-first rule agree on
every generated panel, and diverge only for a hand-made board whose grain the user set across the
short edge. Wiring grain into `cutDimensions` therefore re-baselines no existing cutting list.

## Architecture

Five units, each independently testable. Nothing here touches the OCCT kernel.

```
BoardPart + MaterialDef
        │
        ▼
  occupancyMask(part, clearance)      src/nest/mask.ts       pure
        │  { w, h, bits: Uint8Array } at 1 mm
        ▼
  nestSheets(masks, sheet, opts)      src/nest/nest.ts       pure
        │  { sheets: Placement[][], utilisation, offcuts }
        ▼
  nest.worker.ts (Comlink)                                   off the main thread
        │
        ▼
  Sheets tab in BomModal + per-sheet SVG                     src/ui/
```

### 1. `occupancyMask` — rasterise a part's true outline

Fills the part's cut-size rectangle at 1 mm per cell, clears each box cut's footprint, and applies
mitre outlines. Reuses `cutFootprintCorners` from `src/scene/cutFootprint.ts` rather than deriving
cut rectangles again.

**This is what buys true-outline nesting without no-fit-polygon geometry.** There is never a merged
outline polygon, only a filled bitmask, so concavity is free and 2D booleans are never needed. A
notched part genuinely admits its neighbour into the notch.

Clearance is applied by dilating the mask by half the global clearance, so two adjacent masks that
do not collide are one full clearance apart.

### 2. `nestSheets` — placement

- Parts sorted by mask area descending, ties broken by part id, so the result is **deterministic**.
- For each part, orientations are 0° and 180° always, plus 90° and 270° when the part's `grain` is
  `'free'` or the material's `hasGrain` is false. 180° is included because a mitred or notched part
  is not symmetric even when its bounding box is.
- Placement scans for the lowest free position, then leftmost, and takes the first that does not
  collide. First-fit rather than best-fit: predictable, fast, and good enough at 1 mm.
- A new sheet opens when no orientation fits anywhere on the current one.

### 3. Worker

Nesting runs in a Comlink worker, following the OCCT pattern already in the codebase, and is
debounced. A six-cabinet job must not stall the viewport.

### 4. Reporting

A **Sheets** tab in `BomModal`, beside Boards, Hardware and Library: per material, the sheet count,
utilisation, cost, and an SVG of each sheet with parts labelled.

## Testing

The engine is pure, so the valuable tests are properties over generated input, not fixtures. The
lesson from the cabinet-assembly work applies directly: **a test that asserts numbers I chose bakes
my errors into both sides.**

Load-bearing properties, all recomputed from the returned placements rather than from the engine's
internal state:

1. **No two placed parts overlap.** Rebuild each placement's mask from its part and orientation, and
   check pairwise. This is the property the whole engine exists to satisfy.
2. **Every part is placed exactly once**, across all sheets.
3. **Every placement lies wholly within its sheet.**
4. **A grain-locked part never appears at 90° or 270°.**
5. **Determinism** — the same input yields byte-identical output, twice.
6. **Clearance is respected** — no two parts are closer than the global clearance.

Plus one yield sanity check: *n* identical parts that tile a sheet exactly must occupy exactly one
sheet, with utilisation at 100% minus clearance loss.

`occupancyMask` is tested by set-bit counts: a plain rectangle's area is exact, and a notched part
has fewer set bits by exactly the notch area.

**Performance is measured, not asserted.** Record the figure for a realistic six-cabinet job in the
notes; only then set a budget. Do not invent a threshold up front.

## Risks and open items

- **1 mm quantisation.** Sheet counts are trustworthy; utilisation is accurate to roughly a
  millimetre per edge and must not be quoted to two decimals.
- **First-fit is not optimal.** Utilisation will trail a commercial nester. If that gap matters,
  the fix is a better placement heuristic behind the same `nestSheets` signature, not a redesign.
- **The visual-only output.** See the stated assumption above.
- **Grain on hand-made boards.** The default is `'free'`, so a user who wants grain respected must
  set it. Whether the `+ Board` default should instead be `'length'` is deferred until the field
  exists and can be lived with.

## Stages

Each stage is its own implementation plan, in this order. Stages 1 and 2 are prerequisites for 3.

1. **Grain and stock data** — the fields, the `parseFile` normalisation, the per-role generator
   defaults, the edit-panel control, the library UI for sheet size and clearance, and `cutDimensions`
   consulting grain.
2. **`occupancyMask`** — rasterisation, with the set-bit tests.
3. **`nestSheets`** — placement and the six properties.
4. **Worker and the Sheets tab** — off-thread execution and the report.

Stage 1 is useful on its own: grain appears in the cutting list and the drawings whether or not
nesting ever follows.
