# Shelves & Interiors notes

2026-10-21: Start from merged main b5ddbc6. Existing controls edit one opening immediately; new work provides a staged multi-opening workflow. Interior sections are independent of face-frame front opening IDs. Existing insertion/readiness and machining generators remain authoritative.

The user confirmed Shelves & Interiors. Absent InteriorSpec normalizes to zero shelves AND zero drilling; defaultInterior(0) by itself still requests ten pin positions, so it is not an empty interior. The preview compares canonical form values to avoid property-order-only history changes.

The existing productionLimitIssue guard runs before count-driven source geometry and proposed geometry. Candidate aggregate shelf count is checked before openingLayoutErrors, which itself generates roles; checking only before applyPipeline would be too late. Source complexity errors direct users to the original controls for correction. nearestCarcase requires a component map, computed once per target list.

Focused baseline passes 24 pure/UI tests, plus the separate scene-history test. Nineteen mutation checks killed with assertion evidence, including retained drawer validation for drilling-only changes. Exact source backups restored after each mutation. The UI supports multi-opening staging/copy/default/remove/discard and invalidates previews on form/selection changes. Slot counts are requested values; actual generated bore totals are shown separately because pinRow caps positions to available height.

Full validation: typecheck/lint pass; unit suite 220 files, 3,923 passing tests and 10 skipped (280 seconds). The initial complete run identified one existing tab-list assertion; updated its expected labels to include Shelves & Interiors and reran all checks successfully. CAD and catalogue builds pass with existing large-bundle warnings. Six isolated Chromium flows pass in 1.1 minutes: both new interiors application/removal/undo/redo and invalid-drilling flows, plus both existing Fronts & Drawers and both Construction regressions. Temporary port-5198 config removed. No source was changed during the complete unit or browser runs.

Final display cleanup uses generated board labels and human opening numbers in preview/errors instead of internal role/section IDs. After this display-only change, typecheck/lint and all 24 focused pure/UI tests pass again; geometry and guard behavior are unchanged.
