# Revision classification progress notes

- 2026-10-08: #95 and #96 remain open with passing checks. This feature starts independently from main; progress describes all recorded findings regardless of navigation filters. No review-schema change or production-approval claim.
- Shared derived counts match whole findings to acknowledgment references; mixed metadata fields do not create extra findings. Printed records are validated before deriving counts. No persisted count fields were added.
- Focused tests: 31 passed. Deliberately reversing classification matching and using the wrong acknowledgment reference each failed the mixed/reordered classification test with AssertionError; both restored from a byte-verified backup.
- Validation: 172 unit files passed; 2,919 tests passed and 10 existing tests skipped. Typecheck, lint, catalogue build, CAD build and the real Chromium packet-comparison/export test passed. Browser checks verify manufacturing acknowledgment counts and the zero metadata row in the dialog, plus matching counts in downloaded HTML.
