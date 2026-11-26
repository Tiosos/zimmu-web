# Concept A redesign — final acceptance evidence

Scope: `ui-redesign/DESIGN-SIGNOFF.md` §12, evaluated on `main` at `8388f6e` (merge of #173). All stages S0–S7 have landed as separate PRs: #167 (sign-off), #168 (S1), #169 (S2), #170 (S3), #171 (S4), #172 (S5), #173 (S7). S6 was verified rather than duplicated because the §9 workspaces were already present in the product.

## Criteria

| # | Criterion | Evidence | Result |
|---|-----------|----------|--------|
| 1 | All five perspectives reachable and structurally aligned with the prototype | `e2e/final-acceptance.spec.ts` opens Workbench (`#view=workspace`), Cabinet Editor, Viewport Modes, Manufacturing and Project & Room in one run, verifies each landmark and the written hash. S1–S5 landed in #168–#172. | Pass |
| 2 | 16 cabinet tabs, specified order, same scene data | `src/ui/cabinetTabGroups.ts` is the single order source; `src/ui/CabinetEditorWorkspace.test.tsx` asserts the exact 16-tab order. `CabinetGroupNav` and `CabinetEditor` pass the selected tab up to App, which edits the same `scene`/`project` state. PR #169. | Pass |
| 3 | 15 viewport modes; 7 Class A on the verified key map; 8 Class B reachable | `src/ui/viewportModeData.ts` defines all 15; `src/ui/ViewportModes.test.tsx` checks the authoritative keys (`F/C/J/L/M/B/T`) and that Class B modes have no interaction key. `e2e/viewport-modes.spec.ts` confirms the 15-button list and a real Class A activation. PR #170. | Pass |
| 4 | No keyboard shortcut outside §6; `M` opens Mortise & Tenon, never Measure | `docs/keyboard-shortcuts.md` is the full map. `e2e/final-acceptance.spec.ts` presses `M`, asserts the Mortise & Tenon tool is active, then confirms the Modes perspective marks Mortise & Tenon active and Measure inactive. `e2e/accessibility-audit.spec.ts` verifies dialogs suppress all workbench shortcuts while open. | Pass |
| 5 | Manufacturing classifications/provenance unchanged; no readiness or packet regression | `useProductionReview` is shared by the S4 dashboard and `ManufacturingReadiness`; `e2e/manufacturing-workspace.spec.ts`, `e2e/manufacturing-readiness.spec.ts`, `e2e/production-packet-integrity.spec.ts` and `e2e/production-packet-comparison.spec.ts` exercise the real engines. PR #171; CI green. | Pass |
| 6 | §9 additional workspaces not silently omitted | Verified present in `main`: `OpeningMotionWorkspace` (§9.1), `GrainMatchWorkspace` (§9.2), `StockWorkspace` (§9.3), `SlopedTopWorkspace` (§9.4), `CompanyCatalogue`/`CatalogueImport` and `CabinetLayoutLibrary` (§9.5), each with engine, FileMenu entry and tests. They predate the Concept A stage PRs, so no duplicate S6 PR was opened. The sign-off wording says "four"; all five are accounted for. | Pass |
| 7 | NFR-03 passes manual and automated checks | PR #173: `e2e/accessibility-audit.spec.ts` covers dialog focus trap/restore, shortcut suppression, roving trees, visible focus and AA body contrast in both themes; `src/lib/a11y.test.tsx` covers `hasOpenDialog` and `usePanelFocus`. `docs/keyboard-shortcuts.md` documents the keyboard model. | Pass |
| 8 | Full suite and typecheck pass with no coverage reduction | GitHub CI `check` and `e2e` on #173 both concluded `success`. Clean-checkout unit suite: 260 files, 4609 passed, 10 skipped (up from 258 files / 4598 passed at S4). CI-mode e2e after adding the two final-acceptance checks: 128 passed / 0 failed / 0 flaky. `production-packet-comparison` was made deterministic by waiting for the real viewport geometry rebuild after the debounced dimension edit; five consecutive repeats pass. `npm run typecheck`, `lint`, `check:file-casing` and `build` all pass. | Pass |

## Remaining known limits

- Live Keycloak/company-catalogue authentication remains an IT deployment prerequisite and is not claimed by local or GitHub checks (see `docs/company-catalogue-api.md`).
- `production-packet-comparison` previously raced the 150 ms `DimInput` debounce and exported two identical packets. The browser test now waits for the viewport geometry to change before exporting the later packet; five consecutive repeats and the full suite pass.
- No axe-core dependency was added; automated accessibility checks are deterministic Playwright assertions on focus, keyboard and computed contrast rather than a generic rule scan.

## Conclusion

All eight §12 acceptance criteria are evidenced on `main` at `8388f6e`. The Concept A redesign sequence is complete; further work should be scoped as new product requests rather than as remaining S0–S7 items.
