# Edge banding and finished versus cut dimensions — design

Status: approved in brainstorming, 2026-09-30.
Plan: `docs/superpowers/plans/2026-09-30-edge-banding.md` (to be written).
Notes: `docs/superpowers/notes/2026-09-30-edge-banding-notes.md`.

Part of Stage 4 of `2026-09-29-design-to-manufacturing-architecture-design.md` ("edge band on a named
part edge with material/thickness, grain direction, finished versus cut dimensions"). It gives the
later drawing-to-cutlist reconciliation a typed edge fact to compare.

## Problem

Nothing in `src/` models edge banding: `BoardPart` has length, width, thickness and grain only. The
reference cutlist carries codes such as `1L`, `1S`, `2L2S` that are not tied to physical edges, and
`cutDimensions` returns a size called "cut" that is really the model's finished size. Nesting,
the cutlist and the drawings therefore cannot say what the saw cuts.

## Decisions

- **Size convention:** the model size is the **finished** size (after banding). The saw cut size is
  the finished size minus the band thickness on each banded edge.
- **Who sets edges:** derived by rule from the cabinet by panel role, overridable per edge.
- **Edge stock:** a `MaterialDef` marked `use: 'edge'`.
- **Edge states:** no band, or one band material. Shaped edges and per-edge trim allowances are out
  of scope.
- **Outputs in this stage:** cutlist and CSV, BOM, nesting (on cut size), and a text line on the
  part drawing. Graphical edge marks on drawings are a later stage.
- **Structure:** derive on read and store only explicit decisions. Banding never changes finished
  geometry, so it needs no regeneration and no `shapeKey` change.

## Data model

- `MaterialDef.use?: 'edge'`. An edge material has `thickness` (mm) and `costPerM`. It is excluded
  from the panel-material pickers, from nesting (it has no `sheet`) and from carcase slot
  validation. The material library and the BOM merge work unchanged.
- `CarcaseParams.edgeMaterial?: string`. Absent means no automatic banding, like
  `frame === undefined`; there is no mode flag.
- `BoardPart.edgeBanding?: Partial<Record<EdgeKey, string | null>>`. `EdgeKey` is
  `'x0' | 'x1' | 'y0' | 'y1'`: the edges at board x = 0, x = length, y = 0 and y = width (x runs the
  length). A string names an edge material; `null` is an explicit "no band"; an absent key follows
  the rule on a generated board and means no band on a manual board.
- `FILE_FORMAT_VERSION` 23 -> 24. `parseFile` rejects an unknown edge key and an edge material that
  is missing or not edge stock. Older files first save as a new copy.

## Rule and derivation (`src/scene/edgeBanding.ts`, pure)

- **Rule by role, in carcase terms.** Each role names the carcase directions it bands. The board
  edge for a direction comes from the same panel axis map `grain.ts` uses, **including the sign of
  each axis**, checked against `orientedPanel`'s real rotations. It is never hand-tabulated.
- **Default rule** (stated figures needing a woodworker's eye, like the hardware table):

| Roles | Edges banded |
|---|---|
| Sides, top, bottom, dividers, loose and fixed shelves | The front edge |
| Doors and drawer fronts (`front-*`) | All four edges |
| Back, toe kick, ladder rails, face-frame members, drawer box boards | None |

- **Effective edges.** `edgesOf(part, ...)`: for a generated board, the rule with the cabinet's
  `edgeMaterial`, then the board's explicit entries on top; for a manual board, the explicit entries
  only. The owning cabinet comes from `nearestCarcase`, never the direct parent.
- **Cut size.** `length - t(x0) - t(x1)`, `width - t(y0) - t(y1)`, thickness unchanged, reported in
  the cutlist's orientation through the existing grain swap. A cut size at or below zero is an
  error the cutlist shows, never a clamped number. The subtraction is stated once, in this module.
- **Shop code.** `1L`, `1S`, `2L2S`: the counts of banded long and short edges in cutlist
  orientation. The code carries no material; the cutlist row lists the materials.
- **Mitred boards.** A board with a mitre cut is treated like a shaped edge: its edge control is
  disabled and its cut size stays the finished size.

## Outputs

- **Cutlist (`buildCsv.ts`, `CuttingList.tsx`).** `cutDimensions` is renamed `finishedDimensions`
  (two callers: `EditPanel`, `groupParts`) and a cut-size function sits beside it. `Length` and
  `Width` stay the **cut** size, identical to today for an unbanded part. New columns: `Finished
  length`, `Finished width`, `Edges`, `Edge material`. Rows group only when cut size, edge pattern
  and edge materials all match.
- **BOM.** "Edge banding" rows: metres per edge material (banded finished edge lengths times
  quantity), priced from `costPerM` through the library. No waste or trim allowance: a deferred
  decision, because no figure is verified.
- **Nesting.** A pure `cutPartOf(part, edges)` returns the part at its cut size with through-cuts
  shifted by the banded x0 and y0 thickness. The main thread posts cut parts to the worker, which
  builds masks from what it receives. The job signature includes the edge state. `useNest` and its
  callers gain the components that edge resolution needs.
- **Part drawing.** `buildBoardSheet` appends one line to `manufacturingNotes`, for example
  `Edge 2L1S — ABS white 1 mm`. The SVG and DXF part title blocks already print those notes; PDF did not (see Refinements).

## Editing

- Cabinet panel: an "Edge band" selector in Materials, default none.
- Part editor: a per-edge control (`x0 x1 y0 y1`), each Follow cabinet, None or a material, labelled
  with its cutlist meaning (for example "front edge" on a generated side). Disabled on a mitred
  board.
- Edge stock: a small "Add edge band" form (name and thickness) in the cabinet panel, calling the existing `onUpdateMaterial` (see Refinements).

## Errors

- A cut size at or below zero: an error row in the cutlist.
- An explicit edge naming a missing or non-edge material: refused at load; the editor only offers
  edge materials.
- A cabinet whose `edgeMaterial` names nothing: no automatic banding and a note in the cabinet panel,
  not an error that hides the cabinet (the face-frame rule).

## Invariants (to add to CLAUDE.md)

- Banding never changes finished geometry: it stays out of `shapeKey`, regeneration and the
  viewport, and is read only by the outputs.
- The edge rule is stated in carcase terms and derived through the panel axis map.
- The cut-size subtraction is stated once.

## Refinements made while planning and building

- Direction to edge is found by rotating the four board edge normals by the part's own rotation and matching the carcase direction, not by a thickness-axis table.
- There is no material form to hang an "Edge band" flag on, so edge stock is added through an "Add edge band" form in the cabinet panel instead of a material form.
- The new CSV columns are appended after `Total`, so every existing column keeps its place.
- The mitre guard lives in `edgesOf`: a mitred board reports no edges, covering every consumer.
- A dangling cabinet `edgeMaterial` is not a file error and means no banding: `edgesOf` takes the materials and applies the cabinet rule only when the named material is edge stock.
- `buildDrawingSheets` gained a seventh parameter, `edgeContext`; `buildProductionPacket` passes it as well.
- `useNest` takes the components, because resolving a board's edges needs its cabinet.
- `isSwapped` (the cutlist orientation rule) lives in `src/scene/grain.ts`.
- The claim above that the SVG, DXF and PDF title blocks already print `manufacturingNotes` was wrong for PDF. Fixed: PDF now prints them, which also restores hinge and template notes that PDF part sheets silently lacked.
- The per-edge editor labels are the board-axis names `x0`/`x1`/`y0`/`y1`.

## Out of scope

Shaped edges; per-edge trim allowances; graphical edge marks on drawings; a waste allowance on band
metres; the drawing-to-cutlist reconciliation (next stage, which reads these edge facts).

## Tests

- The axis map against `orientedPanel` with an asymmetric fixture (a side and a door need different
  edges flipped, so a sign error that suits one fails the other).
- Cut size: one, two and four banded edges; mixed thicknesses on opposite edges; a zero cut size.
- Cutlist orientation: grain `width` swaps L and S in the code and columns.
- Grouping: identical boards with different edge patterns must not merge.
- Nest: the cut part's mask is smaller than the finished part's; through-cuts shift by the x0 and y0
  band thickness.
- Override precedence: an explicit `null` beats the rule; a manual or detached board follows only its
  explicit edges.
- `parseFile` round trip; rejection of an unknown key or material.
- Mutation testing of each guard, per CLAUDE.md.
