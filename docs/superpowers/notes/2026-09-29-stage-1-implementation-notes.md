# Stage 1 — project identity and versioned storage notes

**Plan:** `../plans/2026-09-29-design-to-manufacturing-architecture.md#stage-1--project-identity-and-versioned-storage`

## Model and migration

The v21 `.zimmu` envelope adds a `project` hierarchy containing stable project, area, room and
Joinery Item IDs. The `Scene` remains the only geometry owner. Each item names its top-level
components and loose parts; descendants inherit that ownership. The scene pipeline, cabinet
anchors, generated part roles and existing IDs are unchanged. New root assemblies and loose parts
join the active item; removed roots are pruned. A designer can rename hierarchy nodes, add nodes,
choose the active item and move roots between items in the Project structure panel.

For a v20 or older file, `parseFile` makes deterministic IDs from the source bytes and assigns
existing roots to editable Default Area / Default Room / Default Joinery Item. The legacy scene is
still normalised by the existing parser. The first save opens Save As with a `-v21` suggested name;
choosing the same entry is rejected so the original remains available. Subsequent v21 saves use
the selected handle. The parser validates unique hierarchy
IDs, one owning item per root, and optional six-digit cutlist references; shared JIDs and cutlist
numbers across distinct items remain valid.

Project-panel edits have a separate bounded 50-step undo/redo history in that panel. Scene undo
and redo remain in File menu. Cross-surface global chronological undo is not yet defined, so the
two histories are deliberately separate. The active item is session navigation state and is not
saved as a business fact.

## Boundaries discovered during implementation

The workflow system owns actual Group/Item ID assignment, cutlist number creation and execution
history; the design file may hold references to those records but does not manufacture them. The
workflow plan's Joinery Item duplication can copy selected business and CAD data while excluding
execution history. A CAD-level duplicate of the scene graph would have to remap component, part,
section, joint, cut, hardware and anchor references; a metadata-only copy would be misleading.
Keep that operation as a separate, designed follow-up rather than silently offering a broken
Duplicate command in Stage 1.

The new hierarchy is organisational only. It does not yet model room walls, site measurements,
catalogue definitions, revision approval, or production release. Those remain later stages.

## Verification

`projectStructure.test.ts` checks deterministic legacy migration, v21 round-trip, distinct items
with shared JID/cutlist, uniqueness, root assignment and loose parts. `useFile.test.ts` checks
legacy Save As and project undo/redo. The existing suite checks geometry, drawing and production
packet behaviour. Browser E2E remains unavailable in this local environment because Playwright's
Chromium executable is absent; the PR/CI gate must run it before merge.
