# Revision classification filter notes

- Started independently from main at 4c10a11 while #95's final browser job is installing Chromium.
- Filter the comparison's recorded change classification. Do not reclassify changes or drop metadata fields from manufacturing changes.
- The no-pending message must remain limited to the unsearched, all-classifications pending view; a filtered empty view cannot establish global completion.
- Validation passed: 172 unit-test files (2,918 passed; 10 existing skips), typecheck, lint, catalogue/production builds and the real-packet browser workflow.
- Removing classification matching, allowing the global no-pending claim in a filtered empty view, hiding classification-empty feedback and suppressing classification match counts each caused an expected AssertionError. Original source restored from a backup before final checks.
