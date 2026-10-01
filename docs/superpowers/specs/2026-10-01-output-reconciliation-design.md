# Drawing-to-cutlist reconciliation — design

Status: approved in brainstorming, 2026-10-01.
Plan: `docs/superpowers/plans/2026-10-01-output-reconciliation.md` (to be written).
Notes: `docs/superpowers/notes/2026-10-01-output-reconciliation-notes.md`.

Closes the drawing/cutlist consistency requirement of `2026-09-29-design-to-manufacturing-architecture-design.md`
("Drawing-to-cutlist consistency is a hard production-release gate"). This stage builds the check and
shows its result. The release action that turns it into a hard gate is a later stage.

## Problem

The drawings and the cutlist are derived from one scene by separate code paths. Nothing checks that
they agree. A fact one output carries and the other silently drops is invisible: PDF part sheets never
printed manufacturing notes until edge banding exposed it. The Stage 0 note requires comparing typed
facts before PDF or CSV formatting, never rendered text, and marking fields that only one output
carries as unassessed rather than as agreement.

## Decisions

- **What is compared:** Zimmu's own two outputs (the drawing sheets and the cutlist/BOM rows), not an
  external drawing/cutlist pair. Comparing against an imported shop file needs an import format nobody
  has specified.
- **Depth:** compare the facts each output *declares*. Measuring size off drawn outlines is a possible
  later addition; reading rendered SVG/DXF/PDF text is rejected.
- **Result handling:** report and record, never block. Exports stay available. The release stage will
  read the result as its hard gate.
- **Structure:** a pure comparison over the *built outputs*, so the packet checks exactly what it writes.

## The facts

`PartFact`: `partId`, `label`, `material`, `size`, `cutCount`, `edgeCode`, `edgeMaterials`.

- `size` is `[max(length, width), min(length, width), thickness]` of the **finished** size for a board
  and `[diameter, length]` for a dowel. One canonical orientation on both sides, so a grain-order swap
  cannot cause a false mismatch or hide a real one.
- `edgeCode` and `edgeMaterials` are empty for dowels.

Carrying identity:

- Each part sheet gains a `facts` block (`partId`, `size`, `cutCount`, `edgeCode`, `edgeMaterials`) filled
  from the same part and the same `edgesOf`/`isSwapped` calls the edge note uses.
- A grouped cutlist row gains `members: { id, label, cuts }[]`; the row's size, material and edges apply
  to every member. This restores the per-part identity grouping drops. Dowel sheets and dowel rows get
  the same.

| Compared | Reported as unassessed (only one side carries it) |
|---|---|
| Presence, label, material, finished size, cut count, edge code, edge materials | Cut size and grain (cutlist only); manufacturing notes and operations (drawing only); hardware; cabinet assembly and installation sheets; cover-sheet rows |

An unassessed field is listed every time and is never reported as agreement.

## The comparison (`src/ui/outputReconciliation.ts`, pure)

- `factsFromSheets(sheets)` reads part-kind sheets only; `factsFromCutlist(boardRows, dowelRows)`
  expands each row's members. Neither reads the scene.
- `reconcileOutputs(sheets, boardRows, dowelRows)` matches by `partId` and returns
  `{ status, compared, findings, unassessed }`.
- Findings, each naming the part and both values with both sources (sheet title; cutlist cabinet and
  labels): `missing-from-drawings`, `missing-from-cutlist`, `duplicate` (an id twice in one output),
  `mismatch` (field, drawing value, cutlist value).
- Status: `failed` if any finding; `passed` if there were comparable facts and no findings;
  `unassessed` if nothing was comparable.
- Findings are ordered by part id then field, so the result is deterministic.

## Surfacing

- **Production packet:** passes the same `sheets` it writes and the rows from the same `groupParts`
  call and arguments that feed its CSV. It does not parse the CSV text. It writes
  `readiness/reconciliation.json` (hashed in the manifest's `files`) and adds a `reconciliation`
  summary to the manifest: `status`, `compared`, `findings`, unassessed field names. Exports are never
  blocked.
- **Readiness panel:** a new read-only section, "Drawings and cutlist agree?", with the status, the
  findings (both values and both sources) and the unassessed fields. A helper
  `reconcileScene(scene, materials)` builds part sheets and rows from the live scene with the same
  arguments the packet uses. The section does not select parts, because a finding can name a part that
  exists in one output only.
- **Unchanged:** the readiness findings model, the readiness PDF and every export's availability.

## Errors

- A part sheet without `facts` (a builder that skips it) is a `missing-from-drawings` finding, not a
  crash.
- A scene over the readiness size limits: the panel says "not assessed" instead of building sheets.

## Invariants (to add to CLAUDE.md)

- Both extractors read only built outputs, never the scene: a check that read the scene would agree
  with itself.
- Sizes compare in one canonical orientation.
- A field carried by only one output is unassessed, never agreement.
- The packet checks the outputs it writes, not rebuilt copies.

## Out of scope

Comparing against an imported external drawing/cutlist pair; measuring size off drawn geometry;
renderer parity (SVG, DXF and PDF each drawing every declared fact); blocking any export; the release
action itself; cover-sheet, assembly and installation sheet facts; hardware and operations
reconciliation.

## Tests

- Agreement, then each finding kind created by corrupting one side by hand: drop a sheet, drop a row,
  duplicate an id, change a size, a material, a cut count, an edge code and an edge material.
- Orientation: a grain-width board agrees, and a real size change on it is still caught.
- Dowels.
- Status: passed, failed, unassessed.
- Determinism of finding order.
- Packet: the manifest records the result, `reconciliation.json` is hashed, exports still build when it
  fails.
- Panel: the section renders for passed and failed.
- Mutation testing of each guard, per CLAUDE.md.
