# Hinges and runners notes

- User confirmed this batch. Branch starts at cd4b6d4 and preserves the preceding unmerged25 worktop-machining tasks; main currently contains PR148 at17740eb.
- Custom hinge layout changes count/vertical positions only; cup diameter, depth and lateral application remain existing modeled figures. Face-frame applications retain their existing model and are read-only here for custom hinge placement.
- Explicit runner nominal must drive both box depth and quoted hardware. Keep omitted/null nominal automatic for old files and current presets.
- Spec: ../specs/2026-10-21-hinges-runners-design.md
- Plan: ../plans/2026-10-21-hinges-runners.md
- Explicit runner lengths also bound fixing rows to the box/runner span. The existing automatic fixing grid remains unchanged when nominal is absent/null; an explicit current-length choice can therefore change machining even if box depth stays the same.
- Focused tests cover plate/cup position parity, hardware counts, explicit box-depth/quote/drilling parity, paired-leaf independence and saved pull interference. History verifies one-step apply/undo and fixed duplicate geometry.
- Hinge counts follow actual emitted door height, not total cabinet height: toe-kick/front extents can place a1700mm cabinet's door below the1600mm count threshold. Resize tests use2000mm cabinet height to exercise the four-hinge row.
- Automatic default diagnostics also pass through the bounded row solver, so restoring defaults cannot bypass edge/spacing checks in this workspace. Legacy generation behavior remains unchanged without custom metadata.
- All21 mutation checks fail with AssertionErrors; originals restored from compared scratch backups. Final full-unit run is frozen against recorded source checksums.
- Full frozen-source unit suite passes: 214 files, 3,797 tests passed, 10 skipped; recorded checksums match after completion. Typechecking exposed two test-only flatMap unions (board/dowel cuts); narrowed to boards after that run and reran affected core/UI tests. Reset/cancel also now restores drawer input fields to defaults, covered by the focused UI regression run.
- Final affected tests pass (44 core/UI tests), followed by passing typecheck and lint. Both CAD and catalogue builds pass. Browser drawer setup uses a100mm box to avoid the preset cabinet's existing adjustable shelf, as the existing Fronts browser regression does.
- Browser validation: all9 selected flows pass across runs. Initial run passed8, including both new motion flows, Pulls and worktop machining/live OCCT geometry. One existing Fronts flow timed out after the page returned to an empty project; isolated rerun with trace passed in27.6s without code changes. No cause was established for that one-off reset. Temporary browser configuration removed.
- All25 tasks completed. User guide: docs/cabinet-hinges-runners.md. Commit locally; preceding worktop-machining commit remains in branch ancestry for the next requested PR.
