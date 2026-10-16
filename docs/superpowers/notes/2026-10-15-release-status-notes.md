# Working design release status

- 2026-10-15: Implements the first task of changes-since-release: a continuously visible status below the main toolbar. Continued with detailed part/hardware change lists and selection from any verified recorded release.
- Reuses captureProductionSource and sha256Hex so status compares exactly the same four inputs as packet recording. This intentionally detects metadata and price changes as well as geometry changes; it does not imply manufacturing changes alone.
- Uses the highest revision, never array order or an older verified fallback. Any unreadable entry makes the baseline ambiguous. The existing integrity check detects accidental corruption only.
- Each asynchronous result retains its source references and baseline. Rendering rejects obsolete results immediately; effect cleanup prevents late results from replacing newer comparisons. Changing camera/selection alone does not restart hashing because comparison dependencies are the four production inputs, rather than the freshly allocated packetInputs wrapper.
- No file-format changes, export generation, or additional saved state.
- Focused tests cover dimension edit/undo, all non-scene inputs, integrity states, out-of-order revisions, errors and stale asynchronous results. Inverting hash equality caused six focused tests to fail; restored the original file afterward.

- Detailed comparison uses validateCurrentFile on the frozen scene without migration or regeneration, then shared manufacturing inventory plus cut/instruction definitions and world placement. Generated hardware reuses carcaseHardware/groupHardware. Production report limits guard generated hardware calculations. Invalid/unsupported sources fail visibly.
- Comparison keeps raw source section changes visible alongside projected changes, including record ordering and fields outside projections. Nested machining labels conservatively count as manufacturing edits. Prices, presentation and labels have metadata classifications; purchase identity/quantity and world placement are manufacturing changes.
- Release comparison opens from the existing list. Only verified entries offer buttons, and App rechecks the selected release still belongs to the current file and remains verified before mounting the comparison. Selecting an existing part uses the existing selection path and opens the 3D tab; it does not change hidden-part visibility. Removed parts have no current selection target.
- Initial full test run: 177 files passed, one packet-export test exceeded the default 5-second budget, and the HTTP suite could not bind localhost in the default sandbox. The packet test passed independently; the HTTP suite passed with network permissions. Final verification uses a 30-second budget for the full suite in this environment.

- Browser verification uses a real cloneable OPFS file handle behind a stubbed native picker, then real file loading, OCCT, dimension editing, comparison navigation and undo. Passed with system Chromium. The menu's accessible Open name includes its shortcut, so the test matches its name prefix.
- Classification mutation: inverted metadata classification and observed three failed tests for physical edits, labels and hardware prices; restored afterward.
- Final production build passes. Detailed comparison tests also cover generated hinge quantities and effective library stock definitions.

- Final full suite: 181 files passed, 3,140 tests passed and 10 existing tests skipped (30-second test/hook budget, localhost access enabled). Two additional stock/hardware checks were added after that run collected this file; the complete 10-test comparator file passed separately. Final lint, type checking, production build and Chromium workflow passed.
