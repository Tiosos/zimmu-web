# Catalogue rule flow notes

**Spec:** `../specs/2026-10-02-catalogue-rule-flow-design.md`
**Plan:** `../plans/2026-10-02-catalogue-rule-flow.md`

- 2026-10-02: PR #73 merged after fixing stale persisted override values and section IDs. The user selected second-senior-designer approval for publishing company product versions. IT retains master-rule ownership. This increment provides local CAD rule resolution and explicit adoption; it does not grant publishing privileges.

- 2026-10-02: Added an explicit sparse `ruleOverrides` recipe field. Existing complete starter presets are adapted once against starter v1; future recipes declare their overrides so an explicit value equal to a company default does not lose provenance.
- 2026-10-02: Extracted `applyPipeline` into a pure module while retaining the hook re-export for compatibility. Preview preserves atomic section/item edits; unoverridden section/frame layout changes are blocked rather than guessing a merge. Only installed starter v1 definitions ship. Synthetic v2 is a test fixture, not a company product.
- 2026-10-02: v26 retains optional rule context; opening older files does not adopt rules. Both v24 and v25 first-save copy paths are covered. Project rules belong to Scene undo history; the project hierarchy has its existing separate undo history.
- 2026-10-02: Mutation checks killed stale acceptance, blocked acceptance, item and project precedence, unavailable company, input validation, layout guard, edge-stock validation and draft-preview invalidation with AssertionErrors. Backups restored and compared after each mutation.
- 2026-10-02: Local browser launch was blocked by missing Chromium. Playwright's download returned truncated/invalid archives. The new browser flow is included for GitHub E2E verification.
- 2026-10-02: Final local gates passed: typecheck, lint, 138 unit test files (2,564 passed; 10 skipped), production build and diff check. Existing OCCT externalisation and bundle-size warnings remain.
- 2026-10-02: Follow-up review found previews were validating default panel thicknesses while the generator reads per-part overrides. Previews now use the same `overridesOf` map as regeneration. A synthetic narrowing update is rejected when a retained side-thickness override consumes the opening. Its mutation failed with the expected width AssertionError. Corrected the detached-part fixture to use the real `driven: false` field. All gates passed again (2,565 tests; 10 skipped).
- 2026-10-02: GitHub E2E exposed an incorrect File-menu locator in the new flow: the accessible button name is `File ▾`, as existing browser tests already use. Corrected the exact selector; the other 29 browser scenarios passed.
