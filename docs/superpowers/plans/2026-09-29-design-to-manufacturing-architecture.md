# Design-to-manufacturing architecture — staged implementation plan

**Spec:** `../specs/2026-09-29-design-to-manufacturing-architecture-design.md`
**Notes:** `../notes/2026-09-29-design-to-manufacturing-architecture-notes.md`
**Baseline:** `main` after PR #68 (`f6e5cdd`); a planning document, not an implemented feature.

## Delivery rules

Ship the stages as small independently reviewable PRs, with existing `.zimmu` files and current
manufacturing outputs remaining usable throughout. Every schema change needs a migration fixture.
Use the attached kitchenette drawing/cutlist pair as the first reference fixture across stages;
it is a staff-room commercial example, so keep a separate synthetic residential/two-wall case.
Do not commit the source PDFs or identifying project information. Do not treat the stage list as permission to invent
machine parameters, company rules, or workflow-system endpoints.

## Stage 0 — baseline and contracts

1. Inventory current scene types, versioned file migration, cabinet generation, drawings, BOM,
   nesting, readiness and packet dependencies. Record the current golden fixtures and run the
   existing typecheck, lint, tests, build and E2E smoke on the current head.
2. Extract an anonymised fixture from the supplied two-page drawing and nine-page cutlist. Record
   the approximately 3983 mm straight run, 19 numbered modules, mixed overhead/base/tall units,
   fillers, cutouts, material/edge/grain codes, hardware, quantity and TBC annotations. Keep the
   source PDFs outside git. Ask for a site-verified measurement and actual production approval
   record before asserting that the fixture is as-built or approved.
3. Define a decision table for missing site measurements, catalogue overrides, regeneration of
   detached parts, release blockers and cross-room items. Confirm it with design and production.
4. Map existing file fields to the target IDs. Identify fields that cannot be migrated losslessly.

**Exit:** Reviewed baseline map, fixture, migration inventory and open-decision log. No domain
code rewrite in this stage.

## Stage 1 — project identity and versioned storage

1. Introduce `Project`, `Area`, `Room`, `JoineryItem` and placement references around the existing
   `Scene`; use immutable UUID-like IDs and separate display numbers. Retain current part and
   component IDs and avoid a parallel scene representation.
2. Add a deterministic pure migration from each supported file version, defaults for a legacy
   single-room project, and explicit validation errors for corrupt versions. Preserve the current
   warning/best-effort parsing of newer versions until a separately reviewed compatibility policy
   changes it. Preserve metadata and provide a copy/backup path before conversion.
3. Add project navigation and item selection in small UI increments. Selection must name its
   owning item so identical section IDs in two cabinets cannot resolve ambiguously.
4. Test old-file round-trip, two items with the same JID, rename without ID change, copy/duplicate
   with new IDs but no copied execution history, deletion references, and undo/redo. Test one
   cutlist linked to multiple items, at most one cutlist per item, and related-part Item IDs.
   Verify current geometry and output unchanged.

**Exit:** A legacy file opens and saves as a project without losing a cabinet, part or hardware link.

## Stage 2 — room geometry and placement

1. Implement wall segments and corners, openings, obstacles, site levels and a local room frame;
   record measured value, source/date and uncertainty separately from designed dimensions.
2. Add room constraints alongside existing cabinet-to-cabinet anchors; do not reinterpret the
   current `Anchor.to` as a wall ID. Keep free placement available. Detect collision, blocked doors/drawers,
   clearance and measurement gaps with actionable explanations.
3. Build plan/elevation views from the same room and cabinet transforms. Test the supplied
   straight kitchenette with filler and appliance obstruction, plus a labelled synthetic two-wall
   return and rotated cabinet. Edits to one wall should move only dependent placements and
   preserve accepted manual offsets.

**Exit:** The kitchen fixture can be laid out, saved, reopened and dimensioned consistently.

## Stage 3 — company catalogue and engineering rules

1. Introduce versioned company definitions for a small set of base, wall and tall cabinet recipes.
   Store catalogue reference/version and sparse item overrides. Add resolution and provenance API.
   IT controls master construction rules; authorised senior designers maintain approved products.
2. Migrate existing cabinet presets into initial catalogue definitions without changing their
   geometry. Keep custom cabinets and detached parts available; warn when a catalogue change would
   overwrite a user's explicit edit.
3. Add company/project/item rule scopes one at a time: materials and thickness, construction,
   fronts/reveals, hardware and drilling. Validate each before exposing it as a configurable rule.
4. Add a catalogue-update preview comparing affected dimensions, parts, operations and costs.
   Never silently update an issued revision. Test missing versions, changed material thickness,
   invalid front/hardware combination and stable generated identities after regeneration.

**Exit:** Three related catalogue cabinets and one override regenerate predictable parts and
hardware; the designer can see why each effective value was chosen.

## Stage 4 — unified manufacturing derivations

1. Define a part record/adapter with provenance, cut and finished sizes, material, grain, edge
   treatment and explicit/manual operations. Keep physical geometry and annotation distinct.
2. Make BOM, board list, hardware, nesting eligibility, labels and costs consume the same derived
   data. Specify invalidation by source change; avoid recomputing the whole project when only
   placement or a material rate changes.
3. Add checks for missing material stock, edge-band mismatch, impossible drilling, duplicate
   labels and unsupported machine operations. Unsupported machining can remain a documented manual
   instruction but cannot be marked as machine-ready.
4. Test changes to material, banding and a door/runner option against all dependent outputs,
   including save/reopen and the existing production packet.

**Exit:** One changed specification has one traceable result across all production artefacts.

## Stage 5 — coordinated drawings, estimates and change comparison

1. Define drawing sheets/views/dimensions once and render supported PDF/SVG/DXF outputs from that
   model. Add room plan, wall elevation, item elevation/detail and schedules incrementally.
2. Separate material/hardware quantities from supplier rates, labour, waste, markup and tax.
   Version the latter as pricing assumptions. The workflow tender estimate, contract baseline and
   PM variations remain authoritative; CAD-derived cost changes do not change selling price.
3. Compare working revision against the previous release by stable IDs, including item placement,
   parts, sizes, materials, operations, quantities and affected drawings. Flag unresolved/manual
   changes and annotate revision marks only for actual affected sheets.
4. Build a shared drawing/cutlist fact check against the same candidate revision. Report a
   structured discrepancy with item/module/part ID and both source locations. The user-provided
   PDF pair illustrates fields to compare; it is not itself a known matching golden release.

**Exit:** A late measurement change updates the affected sheets/BOM and produces an intelligible
change report; unrelated items remain stable.

## Stage 6 — production release and workflow handoff

1. Define release blockers and warnings with the Designer/Draftsperson release role and any
   project/template-specific approvers. The existing readiness report is report-only and leaves
   exports available; adding a release gate is a new feature. Preview the complete release,
   including production packet, manifest, source/rule/material versions and drawing/cutlist check.
   Any detected inconsistency blocks release; only Designer/Draftsperson reconciliation followed
   by regenerated outputs and a passing check clears it. No exception approval bypasses this gate.
2. Freeze the release candidate and hash the exported files. Designer/Draftsperson initiates
   release in Zimmu; the workflow system registers and acknowledges it before Zimmu marks it
   current. Persist revision, releasing identity/time, registration receipt and supersession
   history. Saving the editable model does not alter the registered snapshot.
3. Add workflow handoff contract mapping project, Group ID, Item ID, JID and externally assigned
   six-digit cutlist number; one cutlist may group multiple items with shared production/delivery
   progress while installation remains item-specific. Make retry/idempotency, failed-registration
   recovery and acknowledgement explicit. Start with an inspectable
   export contract before choosing transport or authentication.
4. Test authorised release, mismatched quantity/dimension/material/edge/hardware, correction and
   recheck, failed validation, lost acknowledgement/retry, repeated export, edit-after-release,
   new revision, withdrawal
   and old release reproduction. Review the packet with the shop floor.

**Exit:** Production can identify and reproduce exactly the approved revision it received.

## Stage 7 — equipment-specific manufacturing output

1. Collect real equipment, tooling, formats, coordinate/origin rules and verified sample output.
   Define a versioned machine profile and supported operations before building a postprocessor.
2. Implement one target at a time with simulation or vendor verification; include rotation/grain,
   face/origin, tool reach, cut depth, holding tabs, label traceability and error cases.
3. Keep the issued machine files in the release manifest. Do not replace a machine file in an
   existing release; new output is a new revision or explicitly recorded supplemental issue.

**Exit:** A representative cabinet is dry-run/verified on the actual target process, with the
matching issued drawings and labels. No general CNC compatibility claim from a single profile.

## Platform decision gate

After Stages 2–4, benchmark the representative kitchen and a larger project on supported Windows
hardware: open/save time, regeneration latency, WASM memory, 3D interaction, output generation,
offline use and browser file handling. Only then decide whether to retain the browser, wrap it in
Tauri, or move a measured bottleneck to native code. A native rewrite is an alternative, not a
prerequisite to any stage above.

## Known dependencies and risks

- Stable generated-part IDs and old-file migration are prerequisites for reliable revision diffs.
- Room measurements have uncertainty; an apparent clash should not masquerade as verified site
  evidence. Flag incomplete dimensions before release.
- Catalogue updates can change downstream machining and costs. Pin versions and show impact.
- Concurrent edits, access permissions and release authority need design before cloud sync.
- Machine output is dependent on actual tooling, controller and shop verification.
- The historical roadmap's Rust, IFC, plugin and commercial commitments are not delivery gates
  for this residential panel-cabinet path.
