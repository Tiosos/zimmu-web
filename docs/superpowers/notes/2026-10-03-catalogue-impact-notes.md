# Catalogue impact implementation notes

Spec: ../specs/2026-10-03-catalogue-impact-design.md
Plan: ../plans/2026-10-03-catalogue-impact.md

- 2026-10-03: Selected impact review as the next Stage 3 increment after #78. The roadmap calls for comparing parts, operations and costs; current previews only have fields/counts and a hardware boolean. Signed package keys and live Keycloak setup are IT-dependent and remain separate.
- 2026-10-03: Cost comparison belongs beside existing pure UI production derivations. Source/candidate are captured geometry; current rate libraries reprice both sides together, without affecting adoption. No rate is inferred for a new version-qualified stock.
- 2026-10-03: Comparing local part placement misses an anchored neighbour moved by a changed upstream cabinet. Impact facts now include world placement through the existing resolveWorldMatrix/decomposeMatrix helpers. A real imported 610→620 mm update proves the custom neighbour's unchanged local parts still appear as assembly-placement changes.
- 2026-10-03: Invalid cut area is unavailable, not negative stock or a credit. A mutation initially survived because a second numeric guard also rejected negative area; the regression now uses two negative cut dimensions whose product is positive, proving the cut-size problem guard independently. Another test verifies one invalid row keeps a grouped stock quantity unavailable.
- 2026-10-03: Fifteen deliberate mutations produced AssertionError failures: world/indirect placement, invalid round stock, blocked preview, exact machining/manual comparison, unchanged part/quantity filtering, numeric price validity, unusable quantities, subtotal overflow, complete-total/delta guards, invalid cut quantity, null propagation and current-library merge. Source was restored byte-for-byte after each mutation. Focused comparison/UI tests pass.
- 2026-10-03: Local gates passed with 153 unit-test files, 2,708 passed/10 skipped, typecheck, lint, CAD build, API build and diff checks. The browser import test now expands stock quantities and exact part/operation details before explicit acceptance and verifies undo as before. GitHub checks are inspected on the published draft head.
- 2026-10-03: Final inspection distinguished invalid round-stock length/diameter and numeric subtotal overflow from a missing price. These now give the actual reason, so users are not sent to edit a valid rate when the quantity or numeric range is the problem. Existing regression assertions and all fifteen mutation checks cover the final price guards.
- 2026-10-03: The old provenance menu was only 176 px minimum width/256 px tall. A detailed accepted-update preview now uses a wide, viewport-bounded floating panel with a Close impact review action. Compact provenance remains unchanged without a preview. UI tests prove closing does not apply; Chromium checks the comparison is wide and within the desktop viewport before examining facts.

## PR #79 deep-review corrections

Cross-check part facts with BOM grain ordering, part-local machining/edge axes, nesting stock definitions and whole-project placement. Preserve local dimensions alongside BOM dimensions so transposing a free-grain board cannot disappear from the comparison. Show physical stock properties (thickness, sheet size, stock grain constraint and edge use) separately from prices; include colour as the BOM does. Label direct cabinet/part-record counts explicitly so indirectly moved neighbours do not contradict the manufacturing summary. Invalid or overflowing material quantities must make the estimate incomplete even at an explicit zero rate. Invalid manual quantities are unavailable; unit changes remain separate quantity lines rather than subtracting incompatible units.

The floating review height is also bounded by the space below its top offset, not only a viewport percentage. Chromium checks a 390 × 240 viewport as well as desktop, including access to explicit Apply after expanding details.

- Deep review: regression tests reproduced five omissions before fixes. Cross-checked BOM/CSV, stock rotation/nesting, drawing and production-packet inputs, saved v27 catalogue pins, explicit adoption/staleness/undo and browser/server boundaries. Twenty-three deliberate comparison/quantity/pricing mutations failed by AssertionError; the source was restored byte-for-byte. No new product or trust decision was required. Chromium additionally exercises the short-viewport panel and local-axis/stock labels.

- Final local review gates: 153 files, 2,715 tests passed / 10 skipped; typecheck, lint, CAD build, catalogue API build and diff checks passed before publication.

Exact operation comparison includes ownership references. Show the source joint and owning assembly in readable details, so an ownership-only change does not produce indistinguishable before/after rows. Regression tests cover each owner independently.

- Traceability follow-up gates: 2,716 tests passed / 10 skipped across 153 files; typecheck, lint, CAD build and diff checks passed. All 25 final mutations failed by AssertionError and restored exact bytes. Catalogue API sources are unchanged from the successful API build.
