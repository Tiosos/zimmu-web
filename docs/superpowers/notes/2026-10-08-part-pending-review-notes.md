# Per-part pending review notes

- 2026-10-08: #102 passed all four checks and merged with user approval. Continue with accessible pending-count shortcuts using existing exact part focus. Keep numeric table shape and printable exports unchanged.
- Pending counts now act as exact-part shortcuts without changing table columns or printable counts. Resetting selection delegates first-match selection to the existing filtered navigation rule, avoiding a duplicate pending-finding search. Unit tests cover overlapping IDs, acknowledged-first/multiple-pending order, reactive disabled counts, scoped completion, retained edits/full JSON and in-flight resume.
- Six shortcut mutations failed by assertion as predicted: zero-pending disablement, exact scope, first-pending reset, classification reset, pending-only enablement and search reset. Restored source bytes after each mutation.
- Typecheck and lint passed. Full suite: 172 files, 2,939 passed, 10 existing skips. Catalogue build passed.
- Application build passed with the existing chunk warning. Initial Chromium test timed out in Playwright check() after the last pending checkbox unmounted; changed the test to click and verify disabled-count/scoped-feedback postconditions. Chromium rerun passed (15s test). Typecheck/lint rerun after the browser-test edit. Post-merge #102 CI and E2E passed for 880b716ba58c24e467986e84fc60375171c160a6.
