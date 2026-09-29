# Design-to-manufacturing architecture

**Date:** 2026-09-29
**Status:** Product direction approved; implementation details below are proposed and staged.
**Plan:** `../plans/2026-09-29-design-to-manufacturing-architecture.md`
**Notes:** `../notes/2026-09-29-design-to-manufacturing-architecture-notes.md`

## Approved product decisions

The user accepted all six decisions on 2026-09-29:

1. Build a full room-to-production design product, delivered in stages.
2. Target panel-based residential cabinetry first, retaining custom parts.
3. Use company-managed catalogues and rules with controlled item overrides.
4. Release approved, frozen production revisions; live edits do not mutate a release.
5. Keep the design product separate from the operational workflow product; link by IDs and release records.
6. Improve the browser prototype first; assess desktop/native migration using measured constraints.

These decisions supersede conflicting positioning and roadmap assumptions in the older
`joinery_3d_software_plan.md`. That historical plan remains a reference, not a current delivery
commitment. Do not interpret this architecture as approval of any particular CNC machine, vendor,
postprocessor, price model, hosting service, or rewrite.

## Product boundary and vertical workflow

The design application owns job design, room geometry, catalogue instances, cabinet engineering,
parts, materials, hardware, machining intent, drawings, estimates, validation, and production
release snapshots. The workflow application owns tenders/orders, staff assignments, procurement,
schedules, production execution, QC, delivery, and installation. A release is the handoff contract.

The first end-to-end acceptance fixture is one residential kitchen with two walls, one obstruction,
at least three related cabinets, a filler/end panel, mixed fronts and drawers, and a deliberately
changed measurement. The designer places catalogue instances, overrides one item, checks
clearances, issues drawings and a BOM, approves a release, and compares a later revision. The
outputs all identify the same item and release. This is a product acceptance scenario, not a
claim that these features already exist.

## Identity and aggregate boundaries

```text
Project
  Area / Room (site reference and placement frame)
    Joinery Item (business identity; may contain multiple assemblies)
      Cabinet / Assembly (catalogue instance or custom assembly)
        Component / Part (generated or explicitly authored)
          Manufacturing Operation (machining or manual instruction)
```

- Each entity receives an immutable internal ID; labels, JIDs, drawing numbers, and cutlist numbers
  are editable external identifiers and never database keys. A JID can be shared as already decided
  in the workflow requirements. A cutlist number can link to multiple items and has its own
  workflow; it must not be equated with a cabinet ID.
- `Project` records units (millimetres internally), locale, provenance and schema version. Site
  dimensions and the model are distinct: measured/as-built, design intent and issued dimensions
  must not overwrite each other silently.
- `Room` owns a local coordinate system, walls, openings, obstacles, services, ceiling/floor
  reference and measurement provenance. An assembly has one owning item and a placement relative
  to a room. An item may span more than one assembly; cross-room items need an explicit reference
  rather than accidental duplication.
- The current `Scene` (`parts`, `materials`, `hardware`, `joints`, `components`) remains a valid
  modelling aggregate during migration. Introduce project/room/item identity around it through a
  versioned adapter; do not add a second competing copy of the same geometry.
- Generated part identity should be stable for the same cabinet role across regeneration. User
  authored parts and detached/generated overrides retain explicit provenance and conflict rules.
  The `driven` semantics already used by parts and drawers are preserved.

## Catalogue and rule resolution

Catalogue definitions are company-owned, versioned recipes: cabinet category, parameters,
construction method, section/front defaults, material slots, hardware selection and validated
constraints. A placed item references the catalogue definition and version, stores placement and
an explicit override map, and resolves to one effective specification. Do not eagerly duplicate
all catalogue fields into every instance.

The resolution order is company defaults -> catalogue definition -> project specification -> item
override, with the resolved values and source of each effective value inspectable. A later company
catalogue edit does not silently change an issued design: updates require an explicit preview,
conflict report and acceptance, and releases pin all rule and catalogue versions. Validate ranges,
material thicknesses, openings, front clearances, appliance/service spaces and hardware fit before
generating production outputs. A missing or incompatible rule blocks release, rather than quietly
substituting a default. Technical tolerances are configurable, not asserted as universal standards.

Retain the existing pure cabinet generation functions where possible. Keep authoritative rules in
the domain layer, not duplicated in UI panels, drawings, nesting and exports. Preserve frame,
section, drawer and anchor invariants recorded in `CLAUDE.md`.

## Derivation and manufacturing provenance

The authoritative chain is effective item specification -> cabinet/assembly -> parts and hardware
-> manufacturing operations -> drawing/BOM/nesting/labels/exports. Every derived record carries a
source item/assembly/part ID, effective rule version, and release revision when issued. A material
change invalidates costs, nest grouping, labels and relevant instructions; a room placement change
invalidates plans/elevations and clearance checks but should not rebuild unchanged board geometry.

Distinguish an actual geometric cut from a manual machining instruction, as the current model
already does. Specify edge band on a named part edge with material/thickness, grain direction,
finished versus cut dimensions, drilling reference face, hardware and operation sequence before
relying on production exports. An unsupported operation remains visible and blocks machine-ready
status; a PDF callout must not be represented as generated CNC code. Do not promise machine output
until a machine/tooling/postprocessor contract and validation fixture exist.

## Drawings, estimates and release

One drawing model supplies plans, elevations, cabinet and part sheets, revision marks, schedules,
PDF/SVG/DXF where supported, and their shared dimensions. Estimates and BOM use the same
quantity/material/hardware derivations; labour, wastage, margin, tax and supplier pricing are
separate versioned pricing assumptions. A change report compares items, parts, operations, BOM,
drawings and costs with the prior release; it does not merely compare total counts.

A production release is an immutable snapshot containing project/item IDs, revision, approver,
timestamp, source file/schema versions, catalogue/rule/material versions, validation results,
generated file manifest with checksums, and machine profile if applicable. The current production
packet becomes one derived artefact of that release. Release approval is a separate action from
save. Subsequent edits create a working revision and new candidate release. Superseded releases
remain reproducible and clearly marked; withdrawal/voiding is recorded, never deletion in place.

The workflow system consumes an explicit release record plus file links and identifiers. Start
with export/import or a thin API contract; authentication, access control, concurrent editing and
conflict handling must be specified before collaborative cloud writes. The existing six-digit
cutlist number is assigned in the workflow Cutlist panel, not generated implicitly by CAD.

## Migration, platform and quality gates

Keep old `.zimmu` files readable. Add schema versions and a pure, tested migration path to a
project wrapper; preserve existing scene data byte-for-byte where practical and report any
unmapped fields. Back up before conversion. A new format or extension requires a separate
decision and round-trip tests. Do not force a Rust/Tauri or web backend migration as part of the
domain redesign. Measure large-project performance, geometry rebuild latency, memory, file I/O,
offline use and browser compatibility against real kitchen fixtures before revisiting platform.

Each stage is accepted only when one realistic fixture proves edit -> regeneration -> relevant
outputs -> save/reopen -> consistent IDs and measurements. Domain rules get deterministic tests;
critical designer workflows get E2E coverage; golden output fixtures pin release compatibility.
Validate the production packet against shop-floor review before calling it machine-ready.

## Decisions still needed before their implementation stages

- First real kitchen/job fixture, typical cabinet methods, material thicknesses, edge band rules,
  front/hinge/runner suppliers, and tolerance conventions.
- CNC, saw, boring and edge-bander models; controllers, tooling, origin/coordinate conventions,
  supported import formats and a sample verified machine program.
- Catalogue administrators, who may override which rules, release approval roles, and who can void.
- Hosting/offline and collaboration requirements; source of truth for drawings and supplier rates.
- External system contract for workflow IDs, file links and release status acknowledgement.

None of these open details changes the six approved product decisions.
