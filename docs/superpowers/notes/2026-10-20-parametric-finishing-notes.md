# Parametric finishing notes

- Branch starts at local Fronts & Drawers commit 301d9cc, preserving that unmerged batch.
- Recipe is on the manual board and uses immediate carcase parent, avoiding foreign IDs during cabinet copy/library reuse. Role keys and driven remain reserved for existing generators.
- Default creation stays fixed-size; linking is explicit. No spanning worktops in this batch.
- Spec: ../specs/2026-10-20-parametric-finishing-design.md
- Plan: ../plans/2026-10-20-parametric-finishing.md

- Normal part edits release only recipe-owned fields; machining, color, visibility and edge decisions survive. Moved single-board duplicates explicitly drop the recipe so later regeneration cannot snap them back.
- Source geometry validation may diagnose an invalid toe-kick before the linked height calculation; tests assert preserved last-good geometry and actionable diagnostics rather than one diagnostic order.
- File boundary checks run both before legacy normalization and at current schema validation. This prevents malformed recipe objects from reaching scene regeneration.
- Existing linked-board edit previews merge the current board's machining and edge metadata, so the replacement projection matches the board that acceptance preserves. Candidate geometry remains re-derived on acceptance.
- Mutation checks: 31 intentional faults produced AssertionErrors in geometry, ownership, stale-signature, saved recipe and lifecycle tests. Every edited source was restored from a scratch backup and compared. A redundant missing-parent diagnostic guard was removed because the shared builder already returns the same error; a missing management target now explicitly has a no-throw rejection test.
- First full suite: 204 files passed, two existing filename expectations failed after v29. Those tests now derive migration filenames from FILE_FORMAT_VERSION; the format pin is 29. Final suite and browser results recorded below after completion.
- Final unit suite: 205 files passed; 3,605 tests passed and 10 skipped. Typecheck and lint pass. CAD and catalogue production builds pass; CAD retains the existing chunk-size warning.
- Chromium: all five workflows passed (linked worktop resize/edit/detach/delete/undo; existing fixed worktop and filler workflows; both Fronts & Drawers workflows). No browser failures.
