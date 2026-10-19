# Source review filters and navigation

- Added ten review workflow improvements: classification filter, change-type filter, pending-only part summary, per-part classification/type counts, reviewed-only finding view, previous navigation, first/last navigation, visible status counts, modified keyboard navigation, and persisted additional settings.
- Item filters leave source and limitation findings in scope. Pending and reviewed-only modes are mutually exclusive. Pending navigation uses visible findings but preserves the cursor position in complete display order when a finding has just been completed.
- Part and group shortcuts clear restrictive item filters before focusing their targets. Part-summary filters do not silently alter the finding scope.
- New preference fields are optional in stored legacy records, with safe runtime defaults. Invalid enum values and contradictory pending/reviewed-only records are rejected.
- Exports and review coverage remain complete regardless of view settings.
- Verification: targeted UI/preferences tests pass. Deliberate mutations to classification, change type, reviewed-only, pending-part filtering, navigation and contradictory preference validation each caused assertion failures; restored from scratch backups and confirmed the original patterns returned. Expanded Chromium workflow passes (saved filters, reset, keyboard endpoints, complete JSON exports and existing resume/autosave flow).
- Final verification: 188 unit-test files passed (3,326 tests), while the catalogue HTTP file hit sandbox `listen EPERM`; rerunning that file with network access passed all six tests. Combined result: 189 files, 3,332 passed, 10 skipped. Chromium E2E, typecheck, lint and production build passed. No source changes were needed for the sandbox failure.
