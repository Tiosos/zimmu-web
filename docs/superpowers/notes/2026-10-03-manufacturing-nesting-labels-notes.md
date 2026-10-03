# Shared nesting and label notes

Spec: ../specs/2026-10-03-manufacturing-nesting-labels-design.md
Plan: ../plans/2026-10-03-manufacturing-nesting-labels.md

- 2026-10-03: Existing labels are sheet SVG part labels, not adhesive-label printing. Preserve text and add traceable tooltip/metadata. Nesting previously fell back to finished geometry for invalid band subtraction; this PR makes that exclusion explicit.

- Captured frozen nesting shape/grain/stock facts from a clean worktree at merged #80 before comparing the migration. The synthetic fixture has 32 nestable boards; its four MDF backs have no sheet stock and correctly remain outside sheet jobs. This is separate from the existing frozen CSV fixture.
- Invalid-only material groups return explicit exclusions without constructing a worker. Labels/rates/placement/manual instructions do not change the nesting signature; stock sheet/grain and actual cut geometry do.

- Golden shape fixtures omit freshly generated UUIDs; stable IDs are checked separately across save/reopen/regeneration and duplicate-label ownership. Every dimension, shape-key coordinate, grain and stock fact remains frozen.

- Final local suite passed: 156 files, 2,744 passed / 10 skipped. Typecheck, lint, CAD and catalogue builds passed. All seven targeted mutations failed by AssertionError (origin sign, finished-size fallback, invalid-cut omission, grain, incomplete stock guard, cabinet ownership and SVG detail escaping); each source restored byte-for-byte. The existing real-worker Chromium scenario now checks cabinet/part label metadata as well as unchanged sheet count/utilisation and non-overlap.

- In-depth review: reproduced a sheet-eligibility regression where `<= 0` allowed NaN through (unlike the old positive-size predicate). IndexedDB library data has no file-validation boundary. Moved the compatible `isNestable` predicate to the scene adapter and reject all non-finite stock sizes before grouping or constructing workers. Added both-axis tests for NaN/Infinity/negative/zero and no-worker tests.

- Review fix validation: 156 files, 2,751 passed / 10 skipped; typecheck, lint and both builds passed. Re-ran all eight adapter/eligibility/label mutations, including finite-stock rejection; every mutation failed by AssertionError and sources restored exactly. Reviewed worker stale-result cancellation, shape-only signatures, pricing from current libraries, nested cabinet provenance, SVG escaping and the unchanged drawing/packet compatibility boundary. No remaining blocking finding identified in this increment.
