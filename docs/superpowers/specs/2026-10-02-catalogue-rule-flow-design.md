# Catalogue rule resolution and explicit updates

**Plan:** `../plans/2026-10-02-catalogue-rule-flow.md`
**Notes:** `../notes/2026-10-02-catalogue-rule-flow-notes.md`

## Scope

Resolve construction/material/front defaults in the order company rule version → catalogue recipe → project specification → cabinet override. Show provenance. Store project settings once in the modelling Scene alongside its existing material definitions. This is CAD project specification, not workflow permissions or operational project status.

Use the existing preset values as a labelled starter rule version, not certified company standards. Keep old v25 geometry intact and custom cabinets independent. No company product version can be edited implicitly. The user selected a second authorised senior designer to approve publication; authenticated authoring and approval remain a later feature, with IT ownership of master rules.

Project changes and installed catalogue-version updates require an inspectable preview with parameter, part and hardware changes. Preserve item overrides and generated identities for retained roles. Validate the resulting geometry/materials before applying. Apply only if the source scene still matches the preview, and record one scene undo entry. Do not apply a preview if catalogue/rule versions are unavailable. Old definitions remain addressable by exact version.

The initial field scope is material slots, back construction, joint method, front mount and reveal. Width/height/depth and section/frame layouts remain catalogue/item fields. Pricing impact is reported as needing the existing priced BOM review rather than asserting unpriced hardware is free. Company/project rule authoring, granular layout merging, cloud approval, and frozen production release are separate milestones.

## Persistence

v26 adds optional `scene.cabinetRules` with company rule ID/version and sparse project overrides. Missing context means the starter v1 baseline. Parsing preserves the recorded parameters and metadata; opening alone must not adopt a new specification. The first save of an older file remains a separate copy. Unknown references leave the geometry visible and updates disabled.

## Acceptance

Three catalogue cabinets inherit project defaults, one explicit item edit wins, removing a project override restores the recipe/company baseline, and a synthetic v2 update preserves the explicit item edit. Save/reopen retains the rule settings and IDs. Invalid material/front combinations and stale previews refuse application. Test the designer preview/apply flow in UI and browser tests.
