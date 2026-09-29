# Stage 0 — anonymised reference fixture and baseline

**Architecture:** `../specs/2026-09-29-design-to-manufacturing-architecture-design.md`
**Implementation plan:** `../plans/2026-09-29-design-to-manufacturing-architecture.md`
**Source state:** `main` at `f6e5cdd` (PR #68); this branch adds documentation only.

## Reference fixture contract

The user supplied a two-page A3 kitchen plan and a nine-page A4 cutlist for the same staff-room
kitchenette. The originals stay outside git because they contain client, staff and supplier
details. This fixture is a structured, anonymised extraction, not an as-built survey or a claim
that the drawing and cutlist are one approved production revision. The drawing's construction
revision and cutlist export have different dates. A TBC mark remains unresolved.
The machine-readable subset is `../fixtures/2026-09-29-kitchenette-reference.json`; it is a
reference-fact inventory, not a valid `.zimmu` scene or an approval artefact.

| Fixture field | Recorded example | Source/use | Confidence |
| --- | --- | --- | --- |
| Project / hierarchy | Example project -> one area -> staff room -> kitchenette item | Both cover/title blocks; replace with synthetic IDs | High for relationship, synthetic IDs |
| Drawing reference | One joinery drawing with plan, elevation and sections | Drawing pages 1–2 | High; omit actual number |
| Cutlist reference | One six-digit number attached to the item | Cutlist cover and module sheets | High; replace with `000001` in tests |
| Overall straight-run width | Approximately 3983 mm | Dimension string in plan/elevation | High as drawn, unverified on site |
| Typical base module widths | 600, 650, 450, 500 and 837.5 mm shown along the run | Drawing elevation | High as drawn; spacing/filler accounting must be resolved before use as a sum |
| Other principal geometry | 700 mm nominal top depth; 2700 mm overall height including bulkhead; 100 mm kicker | Drawing | High as drawn, bulkhead by others |
| Module schedule | MOD 1–19, with part quantities and cut dimensions | Three cutlist part-list pages | High as printed, not independently reconciled |
| Bases and fittings | Drawer, pull-out bin, dishwasher, sink/service area and tall fridge surround | Plan/elevation and module views | High for presence; exact appliance clearance not assumed |
| Overheads | Several overhead bays, adjustable shelves and LED provision | Drawing and MOD 15–18 | High for presence; confirm detailed division from source before modelling |
| Other assemblies | Worktop, exposed end/panel, shaped fillers and kicker assemblies | MOD 1–5, 7, 11–14, 17, 19 | High for categories; do not treat all as cabinets |
| Materials/finishes | White interior board, two decorative panel finishes, compact laminate top, multiple thicknesses | Finish notes and material columns | High for categories; retain actual coded values only in private source |
| Edge/grain | 1 mm ABS on named sides/lengths, shaped edges, grain-match callouts | Drawing notes and cutlist columns/module sheets | High for presence; codes such as `1L`, `1S`, `2L2S`, `SHAPED` need a defined edge schema |
| Hardware/manual work | Hinges/runners, cutlery tray, bin, 4 mm buffers, packing and angle note | Drawing notes, cutlist cover and module sheets | High for presence; supplier SKU mapping needs review |
| Site uncertainty | Appliance/service fit dimensions marked TBC; several elements by others | Drawing annotations | Explicitly unresolved |

Module classification for a first model, subject to designer verification: MOD 1–2 kicker;
MOD 3 worktop; MOD 4 filler; MOD 5 panel/return; MOD 6 drawer unit; MOD 7 appliance-side panel;
MOD 8–10 base units with different fittings; MOD 11 tall surround; MOD 12–14 fillers;
MOD 15–16 overheads; MOD 17 filler; MOD 18 overhead; MOD 19 filler/returns. This is an
interpretation of part names and module views, not a direct machine-readable link to every
drawing object. Assign fixture-internal `module-01` … `module-19` IDs, retaining the printed
module number as a display reference. Do not infer a separate Joinery Item or cutlist per module.

The first Stage 1 regression fixture should use a small synthetic subset (for example one base
cabinet, one overhead, a filler and one worktop) with the same categories and relationships.
Stage 2 expands to the straight run. A two-wall return is separately synthetic, since these
attachments show a straight run. No source PDF or client-identifying text should be committed.

## Current model and migration inventory

| Existing source | Current behaviour | Stage 1 consequence |
| --- | --- | --- |
| `src/scene/types.ts` `ZimmuFile` | v20 envelope: version, name, appVersion, mm units, timestamps, camera and one `Scene` | Add stable project/area/room/item metadata around the scene; do not reinterpret `name` as an immutable project ID |
| `Scene` | Arrays of parts, hardware, joints, components plus keyed materials | Preserve one scene as geometry authority; connect item ownership by IDs without copying arrays into rooms |
| `CarcaseComponent` / `GroupComponent` | Parent tree and placement; carcase may anchor to another component | Map ownership to item, retain cabinet-to-cabinet anchor IDs and free-placement semantics |
| `src/scene/useScene.ts` `applyPipeline` | Placement -> face frames -> drawers -> carcase parts -> joints | Project wrapping must not alter regeneration order or change driven/manual part semantics |
| `src/scene/useFile.ts` `parseFile` | Validates legacy input, normalises fields, repairs orphans/cycles, validates current model; warns and best-effort parses newer versions | Add a pure project migration boundary and round-trip tests; do not silently convert unknown future fields into destructive defaults |
| `useFile` save/open | File System Access API, IndexedDB handle, dirty tracking for scene/name | Include project metadata in dirty/undo/save behaviour; back up before first conversion and preserve old-file loading |
| `useMaterialLibrary` and hardware library | Some pricing/catalogue data lives outside the file | Version or snapshot effective external data when issuing; an old scene alone cannot reproduce pricing |
| Existing tests | `useFile.test.ts` pins v20 and legacy migration; regeneration and packet tests cover selected boundaries | Extend realistic fixtures rather than rebaseline away existing behaviour |

Migration mapping proposal (not yet implementation): old `name` becomes project display name;
introduce new project ID and a default area, room and Joinery Item with generated stable IDs;
attach all existing top-level cabinets/groups/loose parts to the default item while preserving
their original component/part/joint IDs and transforms. Existing files have no reliable JID,
Group ID, Item ID, six-digit cutlist, site measurements, approval or workflow release. Leave those
unset, not invented. Record migration provenance and source schema version. Exporting a new
wrapper/extension is a later format decision; the v20 parser should stay available.

## Output and release traceability inventory

| Output/path | Current facts available | Gap to the accepted release gate |
| --- | --- | --- |
| `buildDrawingSheets` -> `buildPdf` | Cover rows, per-part geometry/dimensions/material and cabinet sheets | No project/item/module revision IDs or common machine-readable fact manifest; no room plans |
| `buildCsv` / `groupParts` | Cabinet label, grouped qty, part labels, material, colour, cut dimensions, grain, cut count and board cost | Grouping loses a stable per-part row ID; edge treatment and finished size are absent |
| `buildHardwareCsv` | Manual and derived hardware quantities | Need stable part/item association and matching drawing callouts |
| Nesting / Sheets | Material stock, grain, calculated sheet yield | Yield is not a verified saw/CNC cutting program |
| `buildProductionReadiness` and `createReadinessSnapshot` | Advisory findings, cabinet shelf access | Advisory only; exports stay available, and skipped checks may be unknown |
| `buildProductionPacket` | Captures a scene/pricing-library copy, writes drawings/lists/readiness and SHA-256 manifest | Hash describes captured data, not saved/approved revision; no official workflow acknowledgement |

For the drawing/cutlist gate, compare typed facts before PDF/CSV formatting: stable item, assembly
and part identities; qty; cut and finished dimensions; material and thickness; edge positions and
materials; grain; hardware; and geometric/manual operations where both outputs carry them. A
discrepancy must name both sources and block release until Designer/Draftsperson corrects and
regenerates. Some current outputs do not carry all those facts, so a complete gate belongs after
Stage 4's derivation model. Do not compare rendered PDF text to CSV strings or treat absent fields
as agreement. Explicitly mark unassessed fields in a candidate preview.

## Stage 1 decisions and acceptance checklist

| Decision | Proposed Stage 1 rule | Confirmation point |
| --- | --- | --- |
| Missing site dimension | Preserve `unknown/TBC` explicitly; do not substitute a fabrication figure | Validate with designer before release work |
| Catalogue override | Store only explicit item overrides with provenance; never silently update an issued item | Confirm detailed permissions in Stage 3 |
| Detached generated part | Preserve its manual ownership and geometry across project migration | Assert with v20 round-trip fixture |
| Drawing/cutlist mismatch | Block release and show both facts; Designer/Draftsperson corrects source and reruns | Already confirmed by user |
| Cross-room item | One owning room initially plus explicit references to additional rooms, no duplicated item ID | Ask if a real fixture requires this |
| Unknown newer file | Keep warning/best-effort parse, without destructive defaulting | Revisit only in file-format design |

- Confirm whether the default migration area/room/item may use generic display labels or should
  prompt once on first save; generated internal IDs stay stable either way.
- Decide how an item spanning rooms is represented. The first fixture needs only one room.
- Define deletion/duplication so copied items receive new IDs and no workflow execution history.
- Define the document-side ID format and workflow registration mapping before live integration;
  no generated cutlist number in CAD.
- Keep the original `.zimmu` readable and test v20 open -> migrate -> save -> reopen with identical
  geometry, transforms, joints, material/hardware links and scene ownership.
- Two cabinets in one item, two items sharing a JID, one cutlist shared across items, and a related
  supplier part with its own Item ID must not collapse identities.
- A future-version file retains the existing warning/best-effort path until a separate decision.

## Baseline verification on 2026-09-29

At local branch `docs/design-to-manufacturing-architecture` based on `f6e5cdd`, before any runtime
change: `pnpm typecheck` passed; `pnpm lint` passed; `pnpm test` passed (120 files, 2290 passed,
10 skipped); `pnpm build` passed. The build emitted existing bundle-size and `opencascade.js`
browser-externalisation warnings. `pnpm test:e2e` could not start any of its 28 Chromium tests:
Playwright's required headless-shell executable is absent at its configured cache path. A
targeted smoke rerun confirmed the same browser-launch failure. This is an environment gate, not
evidence that the app failed in a browser; rerun E2E in CI or a workstation with the required
Playwright browser before treating the baseline as fully green.
