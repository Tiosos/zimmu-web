# Drawing-to-cutlist reconciliation — design

Status: approved in brainstorming 2026-10-01; revised the same day after a max-level review (see the
notes file). Plan: `docs/superpowers/plans/2026-10-01-output-reconciliation.md` (to be written).
Notes: `docs/superpowers/notes/2026-10-01-output-reconciliation-notes.md`.

Builds the drawing/cutlist consistency check that `2026-09-29-design-to-manufacturing-architecture-design.md`
requires before a production release. This stage builds the check and shows its result. The release
action that makes it a hard gate is a later stage (the architecture plan's Stage 6).

## Problem

The drawings and the cutlist are derived from one scene by separate builders (`buildBoardSheet` and
`groupParts`). Nothing checks that the two builders agree on identity, quantity, size, material, colour,
cut count and edges. A builder that drops a part, duplicates one, or merges the wrong parts would go
unnoticed.

**What the check really guards.** It is a **coverage, duplicate-id and grouping-key** check: every part
that has a sheet has a cutlist member and the reverse, no id appears twice in one output, and parts the
cutlist merged into one row are parts that really agree on what that row prints. It is **not** an
independent check of orientation, edge derivation or cut count. Those facts come from the same function
applied to the same part on both sides (see "Independence" below), so they cannot fail separately; they
would only differ if a line were deleted from one builder.

What this check does **not** see: anything a renderer or serialiser does after the builders. PDF part
sheets once omitted `manufacturingNotes` while SVG and DXF printed them; the sheet model was right and
only the PDF renderer was wrong, so this check would not have caught it. Renderer parity is a separate,
later question. A `failed` result here means the two builders disagree, which is a generator defect; the
designer cannot clear it by editing the model. The release stage has to decide how a generator defect is
handled, because the architecture plan's wording ("the Designer corrects the model and regenerates")
describes only the model-error case.

## Decisions

- **What is compared:** Zimmu's own two built outputs: the part sheets of the drawing deck and the
  grouped cutlist rows. Not an external drawing/cutlist pair (needs an import format nobody has
  specified).
- **Depth:** the fields each output *prints*, read as typed data from the built outputs. Not measured
  off drawn geometry, and not parsed from rendered SVG/DXF/PDF text.
- **Result handling:** report and record, never block. Exports stay available.
- **Structure:** a pure comparison over the built outputs. The production packet checks the very rows
  it serialises and the very sheets it renders.

## What each side exposes

No separate parallel "facts" structure is added. Each side's own printed data is read.

**Part sheets** (the sheet the renderers draw):
- Already printed: `partLabel`, `material`, `color`.
- New typed fields on every part sheet, required in the type so a builder cannot skip them:
  - `partId`.
  - `board: { length, width, thickness }` for a board, `{ diameter, length }` for a dowel: the
    dimensions the sheet's views are drawn from.
  - `cutCount`: the number of cuts the sheet draws, counted from the builder's own cut partition. It
    always equals `part.cuts.length` today (the partition is an exhaustive switch), so it is a record of
    what the sheet carries, not an independent measurement.
  - `edge?: { code, materials: string[] }` (boards only): the structured value the printed edge note is
    formatted from. It is absent when the sheet was built without an edge context, which means *not
    carried*, never "unbanded".

**Cutlist rows** (the rows the table and the CSV print):
- Already printed: cabinet, `qty`, `labels`, `material`, `color`, cut `length`/`width`, `thickness`,
  `grain`, summed `cuts`, `finishedLength`/`finishedWidth`, `edgeCode`, `edgeMaterials`.
- New: `members: { id, label, cuts }[]` (the identity grouping drops) and `edgeMaterialList: string[]`
  (the structured form of the printed `edgeMaterials` string). Dowel rows get `members` too. The dowel
  list prints no cut count, so a dowel member carries none.

## Comparison

Sizes are compared in one canonical orientation: `[max(length, width), min(length, width), thickness]`
for a board (the sheet's `board` against the row's printed finished size) and `[diameter, length]` for a
dowel. A grain-order swap therefore cannot cause a false mismatch. The same sort erases orientation, so
the check says nothing about which of length and width a board is drawn or listed as.

**Per part, matched by `partId`** (sheet vs the row that lists the part as a member):
`label`, `material`, `color`, `size`, `cutCount` (boards: the sheet's drawn cut count against the
member's `cuts`), `edgeCode`, `edgeMaterials` (sorted lists).

**Per cutlist row** (against its members and the sheets):
- `qty` equals the member count;
- `labels` equals the members' labels joined as printed;
- the printed summed `cuts` equals the sum of the member sheets' drawn cut counts (boards only).

A part id that appears twice in one output is reported once as `duplicate` and compared using its first
occurrence only. A
id that is a board on one side and a dowel on the other is one `kind` mismatch and nothing else is compared
for it. Every finding that has a known side carries its location, including `duplicate` and
`missing-from-*` (the side that exists). `compared` is the number of part ids present in both outputs and field-compared.

## Findings, status and ordering

Each finding names the part (label and id) and both values with both locations:
- drawing location: the 1-based sheet index. In the packet that is the PDF page ("drawings, PDF page
  N"); in the panel it is a position in the check's own part-sheet list ("sheet N of the checked
  drawing set"), which is not a page of any exported file;
- cutlist location: the cabinet and the 1-based row number in the board or dowel rows.

Kinds: `missing-from-drawings`, `missing-from-cutlist`, `duplicate` (carries which output),
`mismatch` (field, drawing value, cutlist value).

Order is total: part id, then kind (`missing-from-drawings`, `missing-from-cutlist`, `duplicate`,
`mismatch`), then field (`kind`, `label`, `material`, `color`, `size`, `cutCount`, `edgeCode`, `edgeMaterials`,
then the row-level `qty`, `labels`, `cuts`), then output (`drawings` before `cutlist`).

Status: `failed` if there is any finding; `passed` if `compared > 0` and there are none; `unassessed` if
`compared === 0`.

Findings are capped at 200 in both the panel and `reconciliation.json`; the file records
`totalFindings` and `truncated`, and the panel shows the same notice the Production checks section
already uses.

## Independence

What can and cannot fail separately, so the result is not read as more than it is:

- **Independent enough to catch a defect:** coverage (a part with a sheet and no member, or the
  reverse), duplicate ids, and the cutlist's grouping key (boards merged into one row must agree on
  size, code, grain, material, colour and the per-edge stock).
- **Not independent:** orientation (the canonical sort erases it); edge code and edge materials (both
  sides call `edgesOf` and `edgeCode(isSwapped)` on the same part); cut count (the sheet's count comes
  from an exhaustive switch that always equals `p.cuts.length`); a row's printed `qty` and `labels`
  (incremented in the same branch that pushes the member). Each of these only catches a deleted line.
- **Size** on a sheet is the part's own dimensions, not a measurement of the drawing.

## Not compared (always listed as unassessed)

Cut size and grain (cutlist only); manufacturing notes and operations (drawing only); hardware; cabinet
assembly and installation sheets; cover-sheet rows; **which** edge is banded and band thickness (the
cutlist prints only a count code); dowel cut count (the dowel list prints none); edge facts for every
part when the sheets were built without an edge context. An unassessed field is never reported as
agreement.

## Surfacing

- **Packet** (`buildProductionPacket`): groups the board and dowel rows **once**, serialises both CSVs
  from those rows and reconciles the same rows against the same `sheets` it renders. New exported
  serialisers take rows (`buildCsvFromRows`, `buildDowelCsvFromRows`); `buildCsv` and `buildDowelCsv`
  keep their signatures and call them, so BomModal and CuttingList are untouched. It writes
  `readiness/reconciliation.json` (hashed in the manifest's `files`) and adds a manifest `reconciliation`
  summary: `status`, `compared`, `totalFindings`, `truncated` (so the manifest alone says the JSON was capped), the unassessed field names. Exports are never
  blocked.
- **Readiness panel:** a read-only section titled "Production packet drawings and lists agree?" (it
  checks the packet's inputs, all parts, not the toolbar deck, which uses only visible parts), computed
  only while the panel is open and memoised on the scene and the material library. A helper
  `reconcileScene(scene, materialLibrary)` builds part sheets (with the edge context) and rows with the
  packet's arguments. The library merge is extracted into one small exported helper
  (`effectiveMaterialsOf`) used by the packet and by `reconcileScene`; BomModal's inline copy is left
  alone. Each finding can be inspected with the panel's existing `onInspect`, since both outputs come
  from one scene.
- **Unchanged:** the readiness findings model, the readiness PDF and every export's availability.

## Errors

- A sheet built without an edge context makes the edge fields unassessed for every part (listed once),
  not "unbanded".
- There is no handling for a sheet without `partId`/`board`/`cutCount`: those fields are required in
  the type, so a builder that skips one is a compile error.
- There is no size limit: building part sheets is linear in the parts and the check runs only when
  asked for.

## Invariants (to add to CLAUDE.md)

- The two sides are read from the built outputs' own printed data, never from the scene, and never as
  one structure built from the other.
- Sizes compare in one canonical orientation.
- A field carried by only one output is unassessed, never agreement; an absent edge context is
  "not carried", never "unbanded".
- The packet reconciles the rows it serialises and the sheets it renders, not rebuilt copies.
- A `failed` result means the builders disagree; it does not prove the PDF bytes or CSV text.
- Orientation, edge derivation and cut count are not independent checks (see "Independence").

## Out of scope

Comparing against an imported external pair; measuring size off drawn geometry; renderer parity (SVG,
DXF and PDF each drawing every declared field); blocking any export; the release action; cover-sheet,
assembly and installation sheet facts; hardware and operations reconciliation; which edge is banded.

## Tests

- Agreement on a real cabinet (boards, dowels, banded and unbanded).
- Each finding created by corrupting one side by hand: drop a sheet, drop a row, duplicate an id on
  either side, and change a label, a material, a colour, a size, a drawn cut count, an edge code and an
  edge material.
- Row-level: `qty` against member count, the printed `labels`, the printed summed `cuts`; three
  identical shelves merged into one row still agree.
- Orientation: a grain-width board agrees; a real size change on it is still caught.
- Grouping key: two boards of one cut size and code banded in different stock stay two rows.
- A sheet built without an edge context: edge fields unassessed, not mismatched.
- The unassessed list is present on every result; status passed, failed and unassessed; `compared`
  counts parts; the order is total (two findings with the same id and field are ordered by output).
- 200-finding cap and the truncation fields.
- Packet: the manifest records the result and `reconciliation.json` is hashed; the CSVs written equal
  the CSVs `buildCsv` produces; a duplicated-id scene gives `failed` while every export still builds.
- Panel and packet equivalence: the same scene gives the same result through `reconcileScene` and the
  packet; the panel renders passed and failed states from a hand-built result and its findings call
  `onInspect`.
- Mutation testing of each guard, per CLAUDE.md.

## Refinements made while planning and building

- A sheet's `cutCount` is counted from the board builder's own cut partition (`boxCuts.length +
  mitres.length + holeArrays.length`; a dowel sheet uses `p.cuts.length`). It equals `p.cuts.length`
  today, so it is not an independent check; it would differ only if the partition stopped being
  exhaustive.
- Finding sides are `left` and `right`, each `{ source, value }`. `left` is the drawings side, or for a
  row-level check the figure the row prints; `right` is the cutlist side, or what the row's members imply.
- A drawing location differs by surface. In the packet it is the PDF page. In the panel the deck is the
  check's own part-sheet list, so it reads "sheet N of the checked drawing set" and is **not** a page of
  any exported file. Packet and panel equivalence is therefore asserted on status, `compared`,
  `totalFindings` and each finding's `kind`/`field`/`partId`, never on locations.
- The panel's default `materialLibrary = {}` was a fresh object every render and defeated `useMemo`; it
  is now a module constant, `NO_LIBRARY`.
- `compareFindings` is exported so the ordering can be tested directly.
- A row-level finding (`qty`, `labels`, `cuts`) names the row's **first member** as its part and label,
  not the joined row labels, so it points at one real part.
- The row-level `cuts` check is skipped when any member has no sheet: that absence is already reported
  as `missing-from-drawings`, and echoing it as a cuts mismatch would double-report one fault.
- A corrupted sheet `cutCount` yields two findings by design: the per-part `cutCount` mismatch and the
  row-level `cuts` mismatch, because the row's printed sum no longer equals its sheets.
